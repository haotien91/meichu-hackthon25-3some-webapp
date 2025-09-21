#!/usr/bin/env python3
import argparse
import json
import math
from typing import Dict, List, Optional, Tuple

Keypoint = Dict[str, float]
Pose = Dict[str, List[Keypoint]]

CONF_THRESHOLD = 0.3

# The eight key angles used by sing1ee/my-pose MNPoseComparison
DEFAULT_SELECTED_ANGLES = [
    "leftElbowAngle",
    "leftShoulderAngle",
    "leftHipAngle",
    "leftKneeAngle",
    "rightElbowAngle",
    "rightShoulderAngle",
    "rightHipAngle",
    "rightKneeAngle",
]


def load_pose(path: str) -> List[Keypoint]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Accept either {"keypoints": [...]} or raw list [...]
    if isinstance(data, dict) and "keypoints" in data:
        return data["keypoints"]
    if isinstance(data, list):
        return data
    raise ValueError(f"Unrecognized landmark JSON format in {path}")


def kpd_by_name(keypoints: List[Keypoint]) -> Dict[str, Keypoint]:
    return {str(kp.get("name")): kp for kp in keypoints if "name" in kp}


def distance(a: Keypoint, b: Keypoint) -> float:
    return math.hypot(float(a["x"]) - float(b["x"]), float(a["y"]) - float(b["y"]))


def calc_angle(a: Keypoint, b: Keypoint, c: Keypoint) -> Optional[float]:
    ab = distance(a, b)
    bc = distance(b, c)
    ac = distance(a, c)
    if ab == 0 or bc == 0:
        return None
    # Law of cosines, clamp numerical noise
    cos_angle = ((ab ** 2) + (bc ** 2) - (ac ** 2)) / (2 * ab * bc)
    cos_angle = max(-1.0, min(1.0, cos_angle))
    angle_deg = math.degrees(math.acos(cos_angle))
    return angle_deg


def angle_with_confidence(a: Optional[Keypoint], b: Optional[Keypoint], c: Optional[Keypoint]) -> Optional[float]:
    if not a or not b or not c:
        return None
    if (
        float(a.get("score", 0.0)) >= CONF_THRESHOLD
        and float(b.get("score", 0.0)) >= CONF_THRESHOLD
        and float(c.get("score", 0.0)) >= CONF_THRESHOLD
    ):
        return calc_angle(a, b, c)
    return None


def get_selected_angles(keypoints: List[Keypoint], selected: List[str]) -> List[Optional[float]]:
    kps = kpd_by_name(keypoints)
    leftShoulder = kps.get("left_shoulder")
    leftElbow = kps.get("left_elbow")
    leftWrist = kps.get("left_wrist")
    leftHip = kps.get("left_hip")
    leftKnee = kps.get("left_knee")
    leftAnkle = kps.get("left_ankle")

    rightShoulder = kps.get("right_shoulder")
    rightElbow = kps.get("right_elbow")
    rightWrist = kps.get("right_wrist")
    rightHip = kps.get("right_hip")
    rightKnee = kps.get("right_knee")
    rightAnkle = kps.get("right_ankle")

    angles: List[Optional[float]] = []

    if "leftElbowAngle" in selected:
        angles.append(angle_with_confidence(leftShoulder, leftElbow, leftWrist))
    if "leftShoulderAngle" in selected:
        angles.append(angle_with_confidence(leftElbow, leftShoulder, leftHip))
    if "leftHipAngle" in selected:
        angles.append(angle_with_confidence(leftShoulder, leftHip, leftKnee))
    if "leftKneeAngle" in selected:
        angles.append(angle_with_confidence(leftHip, leftKnee, leftAnkle))

    if "rightElbowAngle" in selected:
        angles.append(angle_with_confidence(rightShoulder, rightElbow, rightWrist))
    if "rightShoulderAngle" in selected:
        angles.append(angle_with_confidence(rightElbow, rightShoulder, rightHip))
    if "rightHipAngle" in selected:
        angles.append(angle_with_confidence(rightShoulder, rightHip, rightKnee))
    if "rightKneeAngle" in selected:
        angles.append(angle_with_confidence(rightHip, rightKnee, rightAnkle))

    return angles


def key_angles_similarity(pose1: List[Keypoint], pose2: List[Keypoint], selected: List[str]) -> float:
    """Implements app/lib/poseSim.ts + simPose.ts KEY_ANGLES strategy.
    Returns similarity in [0,1].
    """
    origin_angles = get_selected_angles(pose1, selected)
    target_angles = get_selected_angles(pose2, selected)

    # Sum differences only where both are present, divide by total slots (TS code behavior)
    total_diff = 0.0
    for a, b in zip(origin_angles, target_angles):
        if a is not None and b is not None:
            total_diff += abs(a - b)

    if all(a is None for a in origin_angles):
        return 0.0

    avg_diff = total_diff / max(1, len(origin_angles))
    similarity = max(0.0, 1.0 - (avg_diff / 180.0))
    return similarity


def adjust_similarity(sim: float) -> float:
    # simPose.ts adjustSimilarity: power = 2
    return sim ** 2


def compare(file_a: str, file_b: str, selected_angles: List[str]) -> Tuple[float, float]:
    pose1 = load_pose(file_a)
    pose2 = load_pose(file_b)

    sim = key_angles_similarity(pose1, pose2, selected_angles)
    sim_adj = adjust_similarity(sim)
    percent = sim_adj * 100.0
    return sim_adj, percent


def parse_angles_arg(arg: Optional[str]) -> List[str]:
    if not arg:
        return DEFAULT_SELECTED_ANGLES
    items = [s.strip() for s in arg.split(",") if s.strip()]
    return items if items else DEFAULT_SELECTED_ANGLES


def main():
    parser = argparse.ArgumentParser(
        description="Compute BlazePose landmark similarity (Key Angles strategy, per sing1ee/my-pose)."
    )
    parser.add_argument("file_a", help="Path to person A landmarks JSON")
    parser.add_argument("file_b", help="Path to person B landmarks JSON")
    parser.add_argument(
        "--angles",
        help=(
            "Comma-separated list of angles to include. Default: "
            + ",".join(DEFAULT_SELECTED_ANGLES)
        ),
    )
    parser.add_argument(
        "--quiet", "-q", action="store_true", help="Only print the percentage value"
    )

    args = parser.parse_args()
    selected = parse_angles_arg(args.angles)

    sim_adj, percent = compare(args.file_a, args.file_b, selected)

    if args.quiet:
        # print numeric only
        print(f"{percent:.2f}")
    else:
        print("Pose Similarity (Key Angles; squared as in simPose.ts):")
        print(f" - Score (0..1): {sim_adj:.4f}")
        print(f" - Percentage: {percent:.2f}%")


if __name__ == "__main__":
    main()

