#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
BlazePose inference script for NXP i.MX 93 with Ethos-U65 acceleration.
- Two-stage pipeline:
  1) pose_detection_quant_vela.tflite (224x224, input [-1,1])
  2) pose_landmark_lite_quant_vela.tflite (256x256, input [0,1])
Outputs:
- Annotated image with skeleton overlay
- JSON with 2D and 3D landmarks following sample-output.json schema

Usage:
  python blazepose_imx93.py --image input.jpg \
    --det pose_detection_quant_vela.tflite \
    --lmk pose_landmark_lite_quant_vela.tflite \
    --out_img output_annotated.png \
    --out_json output_landmarks.json

Requires:
  pip install pillow numpy opencv-python tflite-runtime
"""
from __future__ import annotations
import argparse
import json
import math
import os
from typing import List, Tuple

import numpy as np
import cv2
from PIL import Image

# TensorFlow Lite Runtime (embedded)
from tflite_runtime.interpreter import Interpreter as TFLiteInterpreter
from tflite_runtime.interpreter import load_delegate

# ------------------------------------------------------------
# Constants
# ------------------------------------------------------------
LANDMARK_NAMES = [
    "nose",
    "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear",
    "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_pinky", "right_pinky",
    "left_index", "right_index",
    "left_thumb", "right_thumb",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

# Simple skeleton similar to my-pose/app/lib/poseDrawing.ts
SKELETON_CONNECTIONS = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_elbow"),
    ("right_shoulder", "right_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_elbow", "right_wrist"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_hip", "left_knee"),
    ("right_hip", "right_knee"),
    ("left_knee", "left_ankle"),
    ("right_knee", "right_ankle"),
]

# ------------------------------------------------------------
# Utilities
# ------------------------------------------------------------
def _load_image_any(path: str) -> np.ndarray:
    img = Image.open(path).convert("RGB")
    return np.array(img)


def _letterbox_to_square_rgb(img_rgb: np.ndarray, size_square: int = 256) -> Tuple[np.ndarray, Tuple[int,int,int,int]]:
    """Pad to square on longer side, then resize to size_square.
    Returns (resized_square_rgb, (orig_h, orig_w, pad_y, pad_x)).
    """
    h, w = img_rgb.shape[:2]
    S = max(h, w)
    pad_y = (S - h) // 2
    pad_x = (S - w) // 2
    square = np.zeros((S, S, 3), dtype=np.uint8)
    square[pad_y:pad_y+h, pad_x:pad_x+w] = img_rgb
    resized = cv2.resize(square, (size_square, size_square), interpolation=cv2.INTER_LINEAR)
    return resized, (h, w, pad_y, pad_x)


def _inv_letterbox_coords(x: float, y: float, meta: Tuple[int,int,int,int], size_square: int = 256) -> Tuple[float,float]:
    """Map coords from resized square (size_square x size_square) back to original image coords."""
    orig_h, orig_w, pad_y, pad_x = meta
    S = max(orig_h, orig_w)
    scale = S / float(size_square)
    xs = x * scale
    ys = y * scale
    return xs - pad_x, ys - pad_y


# ------------------------------------------------------------
# Anchors (from NXP imx-smart-fitness/models/generate_anchors.py)
# ------------------------------------------------------------
POSE_DET_ANCHOR_OPTIONS = {
    "num_layers": 5,
    "min_scale": 0.1484375,
    "max_scale": 0.75,
    "input_size_height": 224,
    "input_size_width": 224,
    "anchor_offset_x": 0.5,
    "anchor_offset_y": 0.5,
    "strides": [8, 16, 32, 32, 32],
    "aspect_ratios": [1.0],
    "reduce_boxes_in_lowest_layer": False,
    "interpolated_scale_aspect_ratio": 1.0,
    "fixed_anchor_size": True,
}


def _calc_scale(min_scale, max_scale, stride_index, num_strides):
    return min_scale + (max_scale - min_scale) * stride_index / (num_strides - 1.0)


def generate_pose_det_anchors(options=POSE_DET_ANCHOR_OPTIONS) -> np.ndarray:
    strides_size = len(options["strides"])
    assert options["num_layers"] == strides_size
    anchors = []
    layer_id = 0
    while layer_id < strides_size:
        anchor_h, anchor_w, aspect_ratios, scales = [], [], [], []
        last_same = layer_id
        while last_same < strides_size and options["strides"][last_same] == options["strides"][layer_id]:
            scale = _calc_scale(options["min_scale"], options["max_scale"], last_same, strides_size)
            for ar in options["aspect_ratios"]:
                aspect_ratios.append(ar)
                scales.append(scale)
            if options["interpolated_scale_aspect_ratio"] > 0.0:
                scale_next = 1.0 if last_same == strides_size - 1 else _calc_scale(options["min_scale"], options["max_scale"], last_same + 1, strides_size)
                scales.append(np.sqrt(scale * scale_next))
                aspect_ratios.append(options["interpolated_scale_aspect_ratio"])
            last_same += 1
        for i in range(len(aspect_ratios)):
            r = math.sqrt(aspect_ratios[i])
            anchor_h.append(scales[i] / r)
            anchor_w.append(scales[i] * r)
        stride = options["strides"][layer_id]
        fm_h = int(math.ceil(options["input_size_height"] / stride))
        fm_w = int(math.ceil(options["input_size_width"] / stride))
        for y in range(fm_h):
            for x in range(fm_w):
                for _ in range(len(anchor_h)):
                    x_center = (x + options["anchor_offset_x"]) / fm_w
                    y_center = (y + options["anchor_offset_y"]) / fm_h
                    if options["fixed_anchor_size"]:
                        anchors.append([x_center, y_center, 1.0, 1.0])
                    else:
                        anchors.append([x_center, y_center, anchor_w[_], anchor_h[_]])
        layer_id = last_same
    return np.array(anchors, dtype=np.float32)  # [2254,4]


# ------------------------------------------------------------
# Detection stage (TFLite + Ethos-U delegate)
# ------------------------------------------------------------
class PoseDetector:
    def __init__(self, model_path: str, ethosu_delegate: str | None = "libethosu_delegate.so"):
        delegates = []
        if ethosu_delegate:
            try:
                delegates = [load_delegate(ethosu_delegate, {})]
            except Exception as e:
                print(f"[WARN] Failed to load Ethos-U delegate: {e}. Falling back to CPU.")
                delegates = []
        self.interp = TFLiteInterpreter(model_path=model_path, experimental_delegates=delegates)
        self.interp.allocate_tensors()
        self.inp = self.interp.get_input_details()[0]
        outs = self.interp.get_output_details()
        # Identify outputs by size: scores [N,2254,1], boxes [N,2254,12]
        self.out_scores = min(outs, key=lambda d: np.prod(d["shape"]))
        self.out_boxes  = max(outs, key=lambda d: np.prod(d["shape"]))
        self.anchors = generate_pose_det_anchors()
        assert self.anchors.shape[0] == self.out_scores["shape"][1], "Anchor count mismatch"

    @staticmethod
    def _preprocess(img_256_rgb: np.ndarray) -> np.ndarray:
        x = cv2.resize(img_256_rgb, (224, 224))
        x = (x.astype(np.float32) / 255.0 - 0.5) * 2.0  # [-1,1]
        return np.expand_dims(x, 0)

    def infer(self, img_256_rgb: np.ndarray, score_thresh: float = 0.5, nms_thresh: float = 0.3):
        inp = self._preprocess(img_256_rgb)
        self.interp.set_tensor(self.inp["index"], inp)
        self.interp.invoke()
        raw_scores = self.interp.get_tensor(self.out_scores["index"])  # [1,2254,1]
        raw_boxes  = self.interp.get_tensor(self.out_boxes["index"])   # [1,2254,12]
        scores = 1.0 / (1.0 + np.exp(-np.clip(raw_scores, -80, 80)))
        dets = self._decode_boxes(raw_boxes[0])  # [2254, num_points(=6),2] -> boxes & 2 keypoints
        # Filter scores
        mask = (scores[0,:,0] > score_thresh)
        boxes_kps = dets[mask]
        sc = scores[0, mask, 0]
        # NMS by IoU on boxes
        keep = nms_iou(boxes_kps[:,0:2,:].reshape(-1,4), sc, nms_thresh)
        boxes_kps = boxes_kps[keep]
        sc = sc[keep]
        # Return best only (single person)
        if boxes_kps.shape[0] == 0:
            return None
        best = 0
        box_xyxy = boxes_kps[best, 0:2, :].reshape(4)    # xmin,ymin,xmax,ymax in [0,1] of 256x256 frame
        mid_hip   = boxes_kps[best, 2].reshape(2)         # [0,1]
        full_body = boxes_kps[best, 3].reshape(2)         # [0,1]
        return dict(score=float(sc[best]), box=box_xyxy, mid_hip=mid_hip, size_rot=full_body)

    def _decode_boxes(self, raw_boxes_2254x12: np.ndarray) -> np.ndarray:
        # Following models/preprocess_data.py logic from imx-smart-fitness
        scale = 224.0
        num_points = raw_boxes_2254x12.shape[-1] // 2  # 6 points => center/size + 2 keypoints
        boxes = raw_boxes_2254x12.reshape(-1, num_points, 2).astype(np.float32) / scale
        # Adjust to anchor positions for center and keypoints
        boxes[:, 0] += self.anchors[:, :2]  # center x,y
        for i in range(2, num_points):
            boxes[:, i] += self.anchors[:, :2]  # keypoints
        # Convert center/size to corners
        center = np.array(boxes[:, 0])
        half_size = boxes[:, 1] / 2.0
        boxes[:, 0] = center - half_size  # xmin,ymin
        boxes[:, 1] = center + half_size  # xmax,ymax
        return boxes  # [2254, 6, 2] => [box_min, box_max, mid_hip, full_body]


# ------------------------------------------------------------
# Landmark stage (TFLite + Ethos-U delegate)
# ------------------------------------------------------------
class PoseLandmarkerLite:
    def __init__(self, model_path: str, ethosu_delegate: str | None = "libethosu_delegate.so"):
        delegates = []
        if ethosu_delegate:
            try:
                delegates = [load_delegate(ethosu_delegate, {})]
            except Exception as e:
                print(f"[WARN] Failed to load Ethos-U delegate: {e}. Falling back to CPU.")
                delegates = []
        self.interp = TFLiteInterpreter(model_path=model_path, experimental_delegates=delegates)
        self.interp.allocate_tensors()
        self.inp = self.interp.get_input_details()[0]
        self.outs = self.interp.get_output_details()

    @staticmethod
    def _preprocess(img_roi_rgb: np.ndarray) -> np.ndarray:
        x = cv2.resize(img_roi_rgb, (256, 256)).astype(np.float32) / 255.0  # [0,1]
        return np.expand_dims(x, 0)

    def _find_heatmap(self) -> np.ndarray | None:
        """Try to locate heatmap tensor in outputs. Expect HxWxC with C in {33,39}. Returns array HxWxC or None."""
        for o in self.outs:
            arr = self.interp.get_tensor(o["index"])
            shape = arr.shape
            # Prefer BHWC
            if arr.ndim == 4 and shape[0] == 1 and shape[-1] in (33, 39) and (shape[1] * shape[2] >= 1024):
                return arr[0]
            # HWC
            if arr.ndim == 3 and shape[-1] in (33, 39) and (shape[0] * shape[1] >= 1024):
                return arr
        return None

    def infer(self, img_roi_rgb: np.ndarray):
        inp = self._preprocess(img_roi_rgb)
        self.interp.set_tensor(self.inp["index"], inp)
        self.interp.invoke()
        # Identify outputs by total element count. MediaPipe BlazePose Lite typically returns:
        # - 195: image landmarks (39 x 5: x,y,z,visibility,presence)
        # - 117: world landmarks (39 x 3)
        # -   1: presence scalar
        # Some variants return 165 (33 x 5) or 99 (33 x 3).
        out_tensors = {int(np.prod(o["shape"])): self.interp.get_tensor(o["index"]) for o in self.outs}

        lmks_img = np.zeros((33, 3), dtype=np.float32)
        kp_scores = None  # per-keypoint score if available
        # Image landmarks parsing
        if 195 in out_tensors:
            vec = out_tensors[195].reshape(-1)
            if vec.size == 195:
                arr = vec.reshape(39, 5)
                lmks_img = arr[:33, :3].astype(np.float32)
                kp_scores = arr[:33, 4].astype(np.float32)  # presence per keypoint
        elif 165 in out_tensors:
            arr = out_tensors[165].reshape(33, 5)
            lmks_img = arr[:, :3].astype(np.float32)
            kp_scores = arr[:, 4].astype(np.float32)
        elif 99 in out_tensors:
            lmks_img = out_tensors[99].reshape(33, 3).astype(np.float32)
            kp_scores = None

        # World landmarks parsing
        if 117 in out_tensors:
            lmks_world = out_tensors[117].reshape(39, 3).astype(np.float32)[:33]
        elif 99 in out_tensors:
            lmks_world = out_tensors[99].reshape(33, 3).astype(np.float32)
        else:
            lmks_world = np.zeros((33, 3), dtype=np.float32)

        # Presence scalar (pose presence)
        presence_scalar = float(out_tensors[1].reshape(-1)[0]) if 1 in out_tensors else 1.0

        # Normalize image landmarks to [0,1] if model outputs pixels in [0,256]
        if lmks_img.shape[0] == 33:
            lmks_img = lmks_img.astype(np.float32)
            # If typical value range looks like [0..256] for x,y, normalize; otherwise assume already normalized
            if (lmks_img[:, :2].max() > 1.5):
                lmks_img[:, :2] /= 256.0
                # z is typically relative to input size 256 too
                lmks_img[:, 2] /= 256.0

        # Heatmap refinement (MediaPipe's RefineLandmarksFromHeatmapCalculator)
        heatmap = self._find_heatmap()
        if heatmap is not None:
            lmks_img = refine_landmarks_from_heatmap(lmks_img, heatmap, kernel_size=7, min_confidence=0.0)

        return lmks_img, lmks_world, kp_scores, presence_scalar


# ------------------------------------------------------------
# Geometry helpers
# ------------------------------------------------------------

def nms_iou(boxes_xyxy: np.ndarray, scores: np.ndarray, iou_thresh: float) -> List[int]:
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        if order.size == 1:
            break
        xx1 = np.maximum(boxes_xyxy[i,0], boxes_xyxy[order[1:],0])
        yy1 = np.maximum(boxes_xyxy[i,1], boxes_xyxy[order[1:],1])
        xx2 = np.minimum(boxes_xyxy[i,2], boxes_xyxy[order[1:],2])
        yy2 = np.minimum(boxes_xyxy[i,3], boxes_xyxy[order[1:],3])
        w = np.maximum(0.0, xx2 - xx1)
        h = np.maximum(0.0, yy2 - yy1)
        inter = w * h
        area_i = (boxes_xyxy[i,2]-boxes_xyxy[i,0]) * (boxes_xyxy[i,3]-boxes_xyxy[i,1])
        area_o = (boxes_xyxy[order[1:],2]-boxes_xyxy[order[1:],0]) * (boxes_xyxy[order[1:],3]-boxes_xyxy[order[1:],1])
        iou = inter / (area_i + area_o - inter + 1e-8)
        inds = np.where(iou <= iou_thresh)[0]
        order = order[inds + 1]
    return keep


def _normalize_radians(angle: float) -> float:
    return angle - 2 * math.pi * math.floor((angle - (-math.pi)) / (2 * math.pi))


def _compute_roi_normrect_256(mid_hip_xy01: np.ndarray, size_rot_xy01: np.ndarray) -> dict:
    """MediaPipe AlignmentPointsRectsCalculator + DetectionsToRects rotation on 256x256 frame.
    Returns NormalizedRect dict: {xc, yc, w, h, rot} in normalized [0,1] of 256 frame.
    - width/height = 2 * distance(center, scale_point)
    - rotation = NormalizeRadians(90deg - atan2(-(y1 - y0), x1 - x0))
    """
    x0, y0 = float(mid_hip_xy01[0]), float(mid_hip_xy01[1])
    x1, y1 = float(size_rot_xy01[0]), float(size_rot_xy01[1])
    # Box size as double distance center->scale point (in normalized units since frame is square 256x256)
    dist = math.hypot(x1 - x0, y1 - y0)
    w = 2.0 * dist
    h = 2.0 * dist
    # Target angle = 90 deg
    target = math.pi * 90.0 / 180.0
    rot = _normalize_radians(target - math.atan2(-(y1 - y0), (x1 - x0)))
    return {"xc": x0, "yc": y0, "w": w, "h": h, "rot": rot}


def _rect_transform_norm(rect: dict, img_wh: Tuple[int,int], scale_x: float = 1.25, scale_y: float = 1.25, square_long: bool = True) -> dict:
    """MediaPipe RectTransformationCalculator for NormalizedRect (no shifts)."""
    W, H = img_wh
    w = rect["w"]
    h = rect["h"]
    if square_long:
        long_side = max(w * W, h * H)
        w = long_side / W
        h = long_side / H
    # scale
    w *= scale_x
    h *= scale_y
    return {"xc": rect["xc"], "yc": rect["yc"], "w": w, "h": h, "rot": rect["rot"]}


def _get_rotated_subrect_to_rect_matrix(rect: dict, img_wh: Tuple[int,int]) -> np.ndarray:
    """Replicates ImageToTensorUtils::GetRotatedSubRectToRectTransformMatrix.
    Returns 4x4 row-major matrix as np.float32.
    """
    W, H = img_wh
    a = rect["w"] * W
    b = rect["h"] * H
    c = math.cos(rect["rot"])  # cos
    d = math.sin(rect["rot"])  # sin
    e = rect["xc"] * W
    f = rect["yc"] * H
    g = 1.0 / W
    h = 1.0 / H
    m = np.zeros((4,4), dtype=np.float32)
    # row 1
    m[0,0] = a * c * g
    m[0,1] = -b * d * g
    m[0,2] = 0.0
    m[0,3] = (-0.5 * a * c + 0.5 * b * d + e) * g
    # row 2
    m[1,0] = a * d * h
    m[1,1] = b * c * h
    m[1,2] = 0.0
    m[1,3] = (-0.5 * b * c - 0.5 * a * d + f) * h
    # row 3
    m[2,0] = 0.0
    m[2,1] = 0.0
    m[2,2] = a * g
    m[2,3] = 0.0
    # row 4
    m[3,3] = 1.0
    return m


def _calc_z_scale(matrix_4x4: np.ndarray) -> float:
    """LandmarkProjectionCalculator::CalculateZScale.
    Project (0,0)->(1,0) using matrix and return segment length in normalized image space.
    """
    ax = matrix_4x4[0,3]
    ay = matrix_4x4[1,3]
    bx = matrix_4x4[0,0] + matrix_4x4[0,3]
    by = matrix_4x4[1,0] + matrix_4x4[1,3]
    return float(math.hypot(bx - ax, by - ay))


def _roi_affine_from_rect(rect: dict, img_wh: Tuple[int,int], dst_size: int = 256) -> Tuple[np.ndarray, np.ndarray]:
    """Build affine transform to crop rect from image to a square dst image.
    Returns (affine_2x3, src_tri_pts[3x2]). Uses BORDER_REPLICATE like MediaPipe default.
    """
    W, H = img_wh
    cx, cy = rect["xc"] * W, rect["yc"] * H
    w, h = rect["w"] * W, rect["h"] * H
    ang = rect["rot"]
    ca, sa = math.cos(ang), math.sin(ang)
    # Three source points: top-left, top-right, bottom-left of rotated rect
    dx, dy = -0.5 * w, -0.5 * h
    p0 = (cx + ca * dx - sa * dy, cy + sa * dx + ca * dy)
    p1 = (cx + ca * (-dx) - sa * dy, cy + sa * (-dx) + ca * dy)
    p2 = (cx + ca * dx - sa * (-dy), cy + sa * dx + ca * (-dy))
    src = np.float32([p0, p1, p2])
    dst = np.float32([[0, 0], [dst_size - 1, 0], [0, dst_size - 1]])
    M = cv2.getAffineTransform(src, dst)
    return M, src



def refine_landmarks_from_heatmap(lmks_img: np.ndarray, heatmap: np.ndarray, kernel_size: int = 7, min_confidence: float = 0.0) -> np.ndarray:
    """Mirror of MediaPipe RefineLandmarksFromHeatmapCalculator.
    Args:
        lmks_img: [33,3] landmarks normalized to ROI input space [0,1].
        heatmap: HxWxC (or 1xHxWxC) heatmap logits where C in {33,39}. Uses first 33 channels.
        kernel_size: odd window size (MediaPipe uses 7).
        min_confidence: minimum max(sigmoid(heat)) in window to apply refinement.
    Returns:
        Refined lmks_img with updated x,y (z unchanged).
    """
    if heatmap is None:
        return lmks_img
    hm = heatmap
    if hm.ndim == 4 and hm.shape[0] == 1:
        hm = hm[0]
    if hm.ndim != 3:
        return lmks_img
    H, W, C = hm.shape
    if C not in (33, 39):
        return lmks_img
    num = min(33, C)
    out = lmks_img.copy().astype(np.float32)
    # Stable sigmoid
    def _sigmoid(x):
        return 1.0 / (1.0 + np.exp(-np.clip(x, -80.0, 80.0)))
    hm_conf = _sigmoid(hm.astype(np.float32))
    half = kernel_size // 2
    for i in range(num):
        x = float(out[i, 0])
        y = float(out[i, 1])
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            continue
        cx = int(x * W)
        cy = int(y * H)
        if cx < 0 or cx >= W or cy < 0 or cy >= H:
            continue
        x0 = max(0, cx - half)
        x1 = min(W - 1, cx + half)
        y0 = max(0, cy - half)
        y1 = min(H - 1, cy + half)
        patch = hm_conf[y0:y1+1, x0:x1+1, i]
        if patch.size == 0:
            continue
        max_conf = float(patch.max())
        sum_w = float(patch.sum())
        if sum_w <= 0.0 or max_conf < min_confidence:
            continue
        # Weighted average of (x,y) pixel indices in the window
        xs = np.arange(x0, x1 + 1, dtype=np.float32)[None, :]
        ys = np.arange(y0, y1 + 1, dtype=np.float32)[:, None]
        weighted_x = float((patch * xs).sum())
        weighted_y = float((patch * ys).sum())
        out[i, 0] = (weighted_x / sum_w) / float(W)
        out[i, 1] = (weighted_y / sum_w) / float(H)
    return out


# ------------------------------------------------------------
# Visualization & JSON output
# ------------------------------------------------------------

def draw_skeleton(img_bgr: np.ndarray, keypoints: List[dict], radius: int = 4):
    name_to_pt = {kp["name"]: (int(kp["x"]), int(kp["y"])) for kp in keypoints}
    # Points
    for kp in keypoints:
        x, y = int(kp["x"]), int(kp["y"])
        cv2.circle(img_bgr, (x, y), radius, (0, 0, 255), -1)
        label = kp["name"]
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
        cv2.rectangle(img_bgr, (x+5, y-18), (x+5+tw+4, y-2), (0,0,0), -1)
        cv2.putText(img_bgr, label, (x+7, y-6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255,255,255), 1, cv2.LINE_AA)
    # Lines
    for a, b in SKELETON_CONNECTIONS:
        if a in name_to_pt and b in name_to_pt:
            cv2.line(img_bgr, name_to_pt[a], name_to_pt[b], (255, 0, 0), 2)


def to_sample_json(keypoints_xyzc: np.ndarray, keypoints3d_xyzc: np.ndarray) -> dict:
    # keypoints_xyzc: [33,4] x,y,z,score in original image pixels for x,y
    # keypoints3d_xyzc: [33,4] x,y,z,score (world coords kept as-is)
    arr2d = []
    arr3d = []
    for i, name in enumerate(LANDMARK_NAMES):
        x, y, z, c = keypoints_xyzc[i].tolist()
        arr2d.append({"x": x, "y": y, "z": z, "score": c, "name": name})
        x3, y3, z3, c3 = keypoints3d_xyzc[i].tolist()
        arr3d.append({"x": x3, "y": y3, "z": z3, "score": c3, "name": name})
    return {"keypoints": arr2d, "keypoints3D": arr3d}


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True, help="Path to input image (JPEG/PNG)")
    ap.add_argument("--det", required=True, help="Path to pose_detection_quant_vela.tflite")
    ap.add_argument("--lmk", required=True, help="Path to pose_landmark_lite_quant_vela.tflite")
    ap.add_argument("--out_img", default=None, help="Output annotated image path")
    ap.add_argument("--out_json", default=None, help="Output JSON path")
    ap.add_argument("--delegate", default="libethosu_delegate.so", help="Ethos-U delegate .so name or empty for CPU")
    ap.add_argument("--score_thresh", type=float, default=0.5)
    ap.add_argument("--nms_thresh", type=float, default=0.3)
    args = ap.parse_args()

    img_rgb = _load_image_any(args.image)
    img_256, meta_letter = _letterbox_to_square_rgb(img_rgb, 256)

    # Stage 1: detector
    detector = PoseDetector(args.det, ethosu_delegate=(args.delegate or None))
    det = detector.infer(img_256, score_thresh=args.score_thresh, nms_thresh=args.nms_thresh)
    if det is None:
        print("No person detected. Saving original image and empty JSON.")
        out_img = args.out_img or os.path.splitext(args.image)[0] + "_annotated.png"
        out_json = args.out_json or os.path.splitext(args.image)[0] + "_landmarks.json"
        cv2.imwrite(out_img, cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))
        with open(out_json, "w") as f:
            json.dump({"keypoints": [], "keypoints3D": []}, f, indent=2)
        return

    # MediaPipe-identical ROI: AlignmentPointsRectsCalculator + RectTransformationCalculator
    rect0 = _compute_roi_normrect_256(det["mid_hip"], det["size_rot"])  # on 256x256 frame
    rect = _rect_transform_norm(rect0, (256, 256), scale_x=1.25, scale_y=1.25, square_long=True)

    # Crop ROI with affine warp (BORDER_REPLICATE), destination 256x256
    M_affine, _ = _roi_affine_from_rect(rect, (256, 256), dst_size=256)
    roi_rgb = cv2.warpAffine(img_256, M_affine, (256, 256), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    # Stage 2: landmark
    landmarker = PoseLandmarkerLite(args.lmk, ethosu_delegate=(args.delegate or None))
    lm_img, lm_world, kp_scores, presence = landmarker.infer(roi_rgb)
    # Apply sigmoid to logits if needed (some models output raw presence values)
    sigmoid = lambda x: 1.0 / (1.0 + np.exp(-x))
    if kp_scores is not None:
        kp_scores = sigmoid(kp_scores.astype(np.float32))
    presence = float(sigmoid(presence))

    # Normalize image landmarks to [0,1] if still in [0,256]
    if lm_img.shape[0] == 33 and (lm_img[:, :2].max() > 1.5):
        lm_img = lm_img.astype(np.float32) / 256.0

    # Project ROI-normalized landmarks back to 256x256 padded frame using MediaPipe matrix
    proj_mat = _get_rotated_subrect_to_rect_matrix(rect, (256, 256))  # 4x4
    pts = lm_img[:, :2].astype(np.float32)
    x_norm = pts[:, 0] * proj_mat[0, 0] + pts[:, 1] * proj_mat[0, 1] + proj_mat[0, 3]
    y_norm = pts[:, 0] * proj_mat[1, 0] + pts[:, 1] * proj_mat[1, 1] + proj_mat[1, 3]
    x_256 = (x_norm * 256.0)
    y_256 = (y_norm * 256.0)
    pts_256 = np.stack([x_256, y_256], axis=1)

    # Map from 256 padded frame back to original image via inverse letterbox
    pts_orig = np.array([_inv_letterbox_coords(float(x), float(y), meta_letter, 256) for x, y in pts_256], dtype=np.float32)
    # Clamp to image bounds to avoid drawing outside canvas
    H0, W0 = img_rgb.shape[:2]
    pts_orig[:, 0] = np.clip(pts_orig[:, 0], 0, W0 - 1)
    pts_orig[:, 1] = np.clip(pts_orig[:, 1], 0, H0 - 1)

    # Compose output arrays
    if lm_img.shape[1] >= 3:
        z_scale = _calc_z_scale(proj_mat)
        z_img = (lm_img[:, 2].astype(np.float32) * float(z_scale))
    else:
        z_img = np.zeros((33,), np.float32)
    # Prefer per-keypoint scores if available; otherwise use presence scalar
    if kp_scores is not None and kp_scores.shape[0] == 33:
        c = kp_scores.astype(np.float32)
    else:
        c = np.full((33,), float(presence), dtype=np.float32)

    # For 3D, use world landmarks directly; keep same score vector
    lm_world = lm_world.astype(np.float32)
    keypoints_xyzc = np.zeros((33, 4), dtype=np.float32)
    keypoints_xyzc[:, 0:2] = pts_orig
    keypoints_xyzc[:, 2] = z_img
    keypoints_xyzc[:, 3] = c

    keypoints3d_xyzc = np.zeros((33, 4), dtype=np.float32)
    keypoints3d_xyzc[:, 0:3] = lm_world
    keypoints3d_xyzc[:, 3] = c

    # Draw on original image
    img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    keypoints_list = [
        {"name": LANDMARK_NAMES[i], "x": float(keypoints_xyzc[i,0]), "y": float(keypoints_xyzc[i,1]), "z": float(keypoints_xyzc[i,2]), "score": float(keypoints_xyzc[i,3])}
        for i in range(33)
    ]
    draw_skeleton(img_bgr, keypoints_list)

    # Save outputs
    out_img = args.out_img or os.path.splitext(args.image)[0] + "_annotated.png"
    out_json = args.out_json or os.path.splitext(args.image)[0] + "_landmarks.json"
    cv2.imwrite(out_img, img_bgr)
    with open(out_json, "w") as f:
        json.dump(to_sample_json(keypoints_xyzc, keypoints3d_xyzc), f, indent=2)
    print(f"Saved: {out_img}\nSaved: {out_json}")


if __name__ == "__main__":
    main()


