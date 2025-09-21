from __future__ import annotations
import os
import platform
from typing import Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from PIL import UnidentifiedImageError

from service.inference import InferenceService
from service.targets import TargetRegistry, compute_similarity_percent

# Per-request inference timeout (seconds); default 5s
INFER_TIMEOUT_SEC = float(os.getenv("INFER_TIMEOUT_SEC", "5"))
# Single worker to avoid over-parallelizing heavy CPU/NPU work
_EXECUTOR = ThreadPoolExecutor(max_workers=1)


class SimilarityRequest(BaseModel):
    image_path: str
    target_pose: str
    angles: Optional[list[str]] = None  # optional override


class SimilarityResponse(BaseModel):
    similarity: float
    body_found: bool


app = FastAPI(title="BlazePose Similarity API", version="0.1.0")


@app.on_event("startup")
def _startup():
    # Models default to files in repo root unless overridden by env
    det = os.getenv("BLAZEPOSE_DET_MODEL", "pose_detection_quant_vela.tflite")
    lmk = os.getenv("BLAZEPOSE_LMK_MODEL", "pose_landmark_full_quant_vela.tflite")
    # Delegate: None on Windows, ethos-u on i.MX if provided
    default_delegate = None if platform.system().lower().startswith("win") else "/usr/lib/libethosu_delegate.so"
    delegate = os.getenv("BLAZEPOSE_DELEGATE", default_delegate)

    InferenceService.initialize(det, lmk, delegate)

    targets_dir = os.getenv("TARGETS_DIR", os.path.join(os.getcwd(), "targets"))
    TargetRegistry.initialize(targets_dir)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/targets")
def list_targets():
    reg = TargetRegistry.instance()
    return {"targets": reg.list_targets()}

@app.post("/similarity", response_model=SimilarityResponse)
def similarity(req: SimilarityRequest, response: Response):
    # Basic validation
    if not req.image_path:
        raise HTTPException(status_code=400, detail={"error_code": "INVALID_REQUEST", "message": "image_path is required"})

    reg = TargetRegistry.instance()
    t = reg.get(req.target_pose)
    if not t:
        raise HTTPException(status_code=404, detail={"error_code": "TARGET_NOT_FOUND", "message": f"Unknown target_pose: {req.target_pose}"})

    # Inference with timeout and mapped error responses
    try:
        future = _EXECUTOR.submit(InferenceService.instance().infer_keypoints, req.image_path)
        kps = future.result(timeout=INFER_TIMEOUT_SEC)
    except FuturesTimeoutError:
        raise HTTPException(status_code=504, detail={"error_code": "INFERENCE_TIMEOUT", "message": f"Inference exceeded {INFER_TIMEOUT_SEC:.1f}s"})
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail={"error_code": "IMAGE_NOT_FOUND", "message": f"Image not found: {req.image_path}"})
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail={"error_code": "INVALID_IMAGE_FORMAT", "message": "Unsupported or corrupt image"})
    except Exception as e:
        # Catch-all for TFLite/OpenCV/Numpy errors
        raise HTTPException(status_code=500, detail={"error_code": "INFERENCE_ERROR", "message": str(e)})

    percent = compute_similarity_percent(kps, t, selected=req.angles)
    body_found = bool(kps)

    # Signal no-person-detected via header while keeping success payload minimal
    if not body_found:
        response.headers["X-Pose-Status"] = "no_person"

    return SimilarityResponse(similarity=float(percent), body_found=body_found)


# Convenience for `python -m api.server`
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.server:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)

