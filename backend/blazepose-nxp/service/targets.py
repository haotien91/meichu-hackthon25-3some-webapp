from __future__ import annotations
import glob
import json
import os
from dataclasses import dataclass
from typing import Dict, List, Optional

# Reuse similarity helpers from existing script
from scripts.pose_similarity import (
    DEFAULT_SELECTED_ANGLES,
    get_selected_angles,
    adjust_similarity,
    load_pose,
)


@dataclass
class TargetPose:
    name: str
    json_path: str
    angles: List[Optional[float]]


class TargetRegistry:
    _instance: Optional["TargetRegistry"] = None

    def __init__(self, targets_dir: str, selected_angles: Optional[List[str]] = None):
        self.targets_dir = targets_dir
        self.selected = selected_angles or DEFAULT_SELECTED_ANGLES
        self._by_name: Dict[str, TargetPose] = {}
        self._load_all()

    @classmethod
    def initialize(cls, targets_dir: str, selected_angles: Optional[List[str]] = None):
        cls._instance = TargetRegistry(targets_dir, selected_angles)

    @classmethod
    def instance(cls) -> "TargetRegistry":
        if cls._instance is None:
            cls.initialize(targets_dir=os.getenv("TARGETS_DIR", os.path.join(os.getcwd(), "targets")))
        return cls._instance  # type: ignore

    def _load_all(self):
        pattern = os.path.join(self.targets_dir, "*_landmarks.json")
        for path in glob.glob(pattern):
            base = os.path.basename(path)
            # strip suffix "_landmarks.json"
            if base.endswith("_landmarks.json"):
                name = base[: -len("_landmarks.json")]
            else:
                name = os.path.splitext(base)[0]
            try:
                kps = load_pose(path)
                angles = get_selected_angles(kps, self.selected)
                self._by_name[name] = TargetPose(name=name, json_path=path, angles=angles)
            except Exception as e:
                # Skip malformed entries
                print(f"[WARN] Failed to load target {path}: {e}")

    # ----- Public API -----
    def list_targets(self) -> List[str]:
        return sorted(self._by_name.keys())

    def get(self, name: str) -> Optional[TargetPose]:
        return self._by_name.get(name)


# ---- Mirror helpers ----

def _swap_left_right_name(name: str) -> str:
    if name.startswith("left_"):
        return "right_" + name[len("left_"):]
    if name.startswith("right_"):
        return "left_" + name[len("right_"):]
    return name


def _swap_lr_keypoints(keypoints: List[dict]) -> List[dict]:
    swapped: List[dict] = []
    for kp in keypoints:
        # Preserve all fields; only change the semantic side encoded in the name
        nm = str(kp.get("name", ""))
        swapped.append({**kp, "name": _swap_left_right_name(nm)})
    return swapped


def _similarity_from_angles(origin_angles: List[Optional[float]], target_angles: List[Optional[float]]) -> float:
    # Sum absolute differences where both present; divide by total slots (as in TS code)
    total_diff = 0.0
    for a, b in zip(origin_angles, target_angles):
        if a is not None and b is not None:
            total_diff += abs(a - b)
    # If origin has no valid angles, return 0
    if all(a is None for a in origin_angles):
        return 0.0
    avg_diff = total_diff / max(1, len(origin_angles))
    sim = max(0.0, 1.0 - (avg_diff / 180.0))
    sim_adj = adjust_similarity(sim)
    return sim_adj * 100.0


def compute_similarity_percent(origin_keypoints: List[dict], target: TargetPose, selected: Optional[List[str]] = None) -> float:
    """Compute percent similarity given detected keypoints and a precomputed target.
    By default supports mirrored poses by evaluating both original and left/right-swapped
    landmark names and returning the max similarity.
    """
    sel = selected or DEFAULT_SELECTED_ANGLES

    # Original orientation
    origin_angles = get_selected_angles(origin_keypoints, sel)
    base = _similarity_from_angles(origin_angles, target.angles)

    # Mirrored (swap left/right names on the fly)
    swapped_kps = _swap_lr_keypoints(origin_keypoints)
    swapped_angles = get_selected_angles(swapped_kps, sel)
    mirrored = _similarity_from_angles(swapped_angles, target.angles)

    return max(base, mirrored)

