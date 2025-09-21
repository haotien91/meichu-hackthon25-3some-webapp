from __future__ import annotations
import os
import threading
import time
from typing import Dict, List, Optional, Tuple

import numpy as np

# Import the existing inference implementation
import blazepose_imx93 as bp


class InferenceService:
    """Singleton-like service that keeps TFLite interpreters in memory.

    Usage:
        InferenceService.initialize(det_model_path, lmk_model_path, delegate_path)
        kps = InferenceService.instance().infer_keypoints(image_path)
    """

    _instance: Optional["InferenceService"] = None
    _global_lock = threading.Lock()

    def __init__(self, det_model: str, lmk_model: str, delegate: Optional[str]):
        self.det_model = det_model
        self.lmk_model = lmk_model
        self.delegate = delegate or None
        self._detector = bp.PoseDetector(self.det_model, ethosu_delegate=self.delegate)
        self._landmarker = bp.PoseLandmarkerLite(self.lmk_model, ethosu_delegate=self.delegate)
        # Serialize interpreter access (tflite runtime is not inherently thread-safe)
        self._infer_lock = threading.Lock()
        # Simple LRU-like cache: (path, mtime) -> keypoints list
        self._cache: Dict[Tuple[str, float], List[dict]] = {}
        self._cache_order: List[Tuple[str, float]] = []
        self._cache_max = 64

    @classmethod
    def initialize(cls, det_model: str, lmk_model: str, delegate: Optional[str]):
        with cls._global_lock:
            cls._instance = InferenceService(det_model, lmk_model, delegate)

    @classmethod
    def instance(cls) -> "InferenceService":
        if cls._instance is None:
            # Reasonable defaults
            det = os.getenv("BLAZEPOSE_DET_MODEL", "pose_detection_quant_vela.tflite")
            lmk = os.getenv("BLAZEPOSE_LMK_MODEL", "pose_landmark_full_quant_vela.tflite")
            # On Windows dev, Ethos delegate not available; on i.MX use /usr/lib/libethosu_delegate.so by env
            delegate = os.getenv("BLAZEPOSE_DELEGATE", None)
            cls.initialize(det, lmk, delegate)
        return cls._instance  # type: ignore

    # ------------- Public API -------------
    def infer_keypoints(self, image_path: str) -> List[dict]:
        """Returns keypoints as list of dicts with at least name,x,y,score.
        If no person detected, returns [].
        """
        key = self._cache_key(image_path)
        if key in self._cache:
            return self._cache[key]

        img_rgb = bp._load_image_any(image_path)
        img_256, meta_letter = bp._letterbox_to_square_rgb(img_rgb, 256)

        with self._infer_lock:
            det = self._detector.infer(img_256)
            if det is None:
                result: List[dict] = []
                self._put_cache(key, result)
                return result

            rect0 = bp._compute_roi_normrect_256(det["mid_hip"], det["size_rot"])  # on 256x256 frame
            rect = bp._rect_transform_norm(rect0, (256, 256), scale_x=1.25, scale_y=1.25, square_long=True)
            M_affine, _ = bp._roi_affine_from_rect(rect, (256, 256), dst_size=256)

            import cv2
            roi_rgb = cv2.warpAffine(
                img_256, M_affine, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
            )

            lm_img, lm_world, kp_scores, presence = self._landmarker.infer(roi_rgb)

        # Post-projection to original image coords
        proj_mat = bp._get_rotated_subrect_to_rect_matrix(rect, (256, 256))
        pts = lm_img[:, :2].astype(np.float32)
        x_norm = pts[:, 0] * proj_mat[0, 0] + pts[:, 1] * proj_mat[0, 1] + proj_mat[0, 3]
        y_norm = pts[:, 0] * proj_mat[1, 0] + pts[:, 1] * proj_mat[1, 1] + proj_mat[1, 3]
        x_256 = (x_norm * 256.0)
        y_256 = (y_norm * 256.0)
        pts_256 = np.stack([x_256, y_256], axis=1)

        pts_orig = np.array(
            [bp._inv_letterbox_coords(float(x), float(y), meta_letter, 256) for x, y in pts_256], dtype=np.float32
        )

        # Scores
        sigmoid = lambda x: 1.0 / (1.0 + np.exp(-x))
        if kp_scores is not None and getattr(kp_scores, "shape", None) is not None and kp_scores.shape[0] == 33:
            scores = sigmoid(kp_scores.astype(np.float32))
        else:
            scores = np.full((33,), float(sigmoid(presence)), dtype=np.float32)

        # Compose keypoints list
        keypoints_list: List[dict] = []
        for i, name in enumerate(bp.LANDMARK_NAMES):
            keypoints_list.append(
                {
                    "name": name,
                    "x": float(pts_orig[i, 0]),
                    "y": float(pts_orig[i, 1]),
                    "score": float(scores[i]),
                }
            )

        self._put_cache(key, keypoints_list)
        return keypoints_list

    # ------------- Cache helpers -------------
    def _cache_key(self, image_path: str) -> Tuple[str, float]:
        try:
            st = os.stat(image_path)
            return (os.path.abspath(image_path), st.st_mtime)
        except FileNotFoundError:
            return (os.path.abspath(image_path), -1.0)

    def _put_cache(self, key: Tuple[str, float], value: List[dict]):
        if key in self._cache:
            self._cache[key] = value
            return
        self._cache[key] = value
        self._cache_order.append(key)
        if len(self._cache_order) > self._cache_max:
            old = self._cache_order.pop(0)
            self._cache.pop(old, None)

