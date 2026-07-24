"""
OpenCV-based corner detection for answer sheet quadrilateral extraction.

Detection strategy (tried in order until one succeeds):

  PRIMARY — Fiducial marker detection (fastest, most robust)
  ────────────────────────────────────────────────────────────
  The answer sheet has 4 filled black squares at each corner.
  We search for them directly:
    1. Threshold to isolate very dark regions (black markers).
    2. Find contours that are:
         • Nearly square (aspect_ratio 0.6-1.5)
         • Of coherent size (relative to image: 0.001–0.03 of image area)
         • Highly filled (solidity > 0.75)
    3. Assign one candidate per quadrant (TL, TR, BR, BL).
    4. Use the centres of the 4 squares as the perspective transform source.

  FALLBACK A – CLAHE → Adaptive threshold → morph-close → page contour
  FALLBACK B – Canny edges → dilate → page contour
  FALLBACK C – Otsu threshold → morph-close → page contour
  FALLBACK D – Aggressive blur + bilateral filter + Canny → page contour

Debug images are ALWAYS saved to backend-ai/debug/.
"""

import logging
import os
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CornerPoint:
    x: int
    y: int


@dataclass
class DetectionResult:
    detected: bool
    corners: list[CornerPoint]
    message: str
    detection_image_width: int = 0
    detection_image_height: int = 0


# ---------------------------------------------------------------------------
# Debug helpers
# ---------------------------------------------------------------------------

_DEBUG_DIR = Path(__file__).resolve().parent.parent / "debug"
_DEBUG_ENABLED = os.getenv("CORRECTAI_DEBUG", "false").lower() == "true"


def _debug_save(name: str, image: np.ndarray) -> None:
    """Save debug images only when CORRECTAI_DEBUG=true."""
    if not _DEBUG_ENABLED:
        return
    try:
        _DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        path = str(_DEBUG_DIR / name)
        cv2.imwrite(path, image)
        logger.debug("saved %s shape=%s", path, image.shape)
    except Exception as exc:
        print(f"[corner_debug] WARN: could not save {name}: {exc}")


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _resize_for_detection(image: np.ndarray, target_long_side: int = 1024) -> np.ndarray:
    h, w = image.shape[:2]
    long_side = max(h, w)
    if long_side <= target_long_side:
        return image
    scale = target_long_side / long_side
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    print(f"[corner] resize: {w}x{h} -> {new_w}x{new_h} (scale={scale:.3f})")
    return resized


# ---------------------------------------------------------------------------
# Corner ordering
# ---------------------------------------------------------------------------

def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left
    rect[2] = pts[np.argmax(s)]   # bottom-right
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]   # top-right
    rect[3] = pts[np.argmax(d)]   # bottom-left
    return rect


# ===========================================================================
# PRIMARY: Fiducial square marker detection
# ===========================================================================

def _find_black_squares(
    gray: np.ndarray,
    det_image: np.ndarray,
    image_area: float,
    threshold_value: int = 60,
    label: str = "thresh",
) -> Optional[list[CornerPoint]]:
    """
    Detect 4 black square fiducial markers (one per corner quadrant).

    Parameters
    ----------
    gray          : grayscale detection image
    det_image     : colour detection image (for debug drawing only)
    image_area    : float, width * height of det_image
    threshold_value: pixel darkness threshold (0=black). Lower = stricter.
    label         : string tag for debug output

    Returns
    -------
    List of 4 CornerPoints (TL, TR, BR, BL) if found, else None.
    """
    h, w = gray.shape[:2]

    # ── 1. Threshold to isolate dark regions ─────────────────────────────────
    _, binary = cv2.threshold(gray, threshold_value, 255, cv2.THRESH_BINARY_INV)

    # Small morphological close to fill tiny holes inside the marker
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=1)

    _debug_save(f"fid_{label}_binary.jpg", binary)

    # ── 2. Find contours ─────────────────────────────────────────────────────
    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    print(f"[corner] fiducial/{label}: total contours={len(contours)}")

    # ── 3. Filter by shape: square-ish, right size, high solidity ────────────
    # Marker size: between 0.015% and 3% of image area.
    # At 1024px long side on a 730x960 image (~700k px²):
    #   0.015% ~ 105 px² ~ 10x10 markers
    #   3.0%   ~ 21 000 px² ~ 145x145 markers (very close shot)
    min_area = image_area * 0.00015   # 0.015%
    max_area = image_area * 0.040     # 4%

    candidates = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        x, y, bw, bh = cv2.boundingRect(cnt)
        if bh == 0:
            continue

        aspect = bw / bh
        if aspect < 0.6 or aspect > 1.5:
            continue  # not square enough

        # Solidity: how much of the bounding rect is filled
        hull_area = cv2.contourArea(cv2.convexHull(cnt))
        if hull_area < 1:
            continue
        solidity = area / hull_area
        if solidity < 0.75:
            continue  # not a solid square (e.g. circle, open shape)

        cx = x + bw // 2
        cy = y + bh // 2
        candidates.append({
            "cx": cx, "cy": cy,
            "area": area, "aspect": aspect, "solidity": solidity,
            "bw": bw, "bh": bh,
        })

    print(f"[corner] fiducial/{label}: {len(candidates)} square candidates after filtering")

    if len(candidates) < 4:
        print(f"[corner] fiducial/{label}: not enough candidates ({len(candidates)} < 4)")
        return None

    # ── 4. Assign one candidate per quadrant ─────────────────────────────────
    mid_x = w / 2
    mid_y = h / 2

    quadrants: dict[str, list[dict]] = {"TL": [], "TR": [], "BL": [], "BR": []}
    for c in candidates:
        qx = "L" if c["cx"] < mid_x else "R"
        qy = "T" if c["cy"] < mid_y else "B"
        quadrants[f"{qy}{qx}"].append(c)

    # Pick the best candidate in each quadrant (largest area = most prominent)
    corners_map: dict[str, Optional[dict]] = {}
    for q, cands in quadrants.items():
        if not cands:
            print(f"[corner] fiducial/{label}: no candidate in quadrant {q}")
            corners_map[q] = None
        else:
            # Sort by area descending, pick the largest
            best = sorted(cands, key=lambda c: c["area"], reverse=True)[0]
            corners_map[q] = best
            print(
                f"[corner] fiducial/{label}: quadrant {q} -> "
                f"cx={best['cx']} cy={best['cy']} area={best['area']:.0f} "
                f"aspect={best['aspect']:.2f} solidity={best['solidity']:.2f}"
            )

    if any(v is None for v in corners_map.values()):
        missing = [k for k, v in corners_map.items() if v is None]
        print(f"[corner] fiducial/{label}: missing quadrants {missing} → fail")
        return None

    # ── 5. Build result in TL, TR, BR, BL order ──────────────────────────────
    tl = corners_map["TL"]
    tr = corners_map["TR"]
    br = corners_map["BR"]
    bl = corners_map["BL"]

    result = [
        CornerPoint(x=tl["cx"], y=tl["cy"]),
        CornerPoint(x=tr["cx"], y=tr["cy"]),
        CornerPoint(x=br["cx"], y=br["cy"]),
        CornerPoint(x=bl["cx"], y=bl["cy"]),
    ]

    # ── 6. Sanity check: corners should form a reasonable quadrilateral ───────
    # The TL marker should be left of TR, BL should be left of BR, etc.
    if not (tl["cx"] < tr["cx"] and bl["cx"] < br["cx"]):
        print(f"[corner] fiducial/{label}: x-order sanity failed")
        return None
    if not (tl["cy"] < bl["cy"] and tr["cy"] < br["cy"]):
        print(f"[corner] fiducial/{label}: y-order sanity failed")
        return None

    # The quad should occupy at least 5% of the image area
    pts = np.array([[c.x, c.y] for c in result], dtype=np.float32)
    quad_area = cv2.contourArea(pts)
    if quad_area < image_area * 0.05:
        print(f"[corner] fiducial/{label}: quad_area={quad_area:.0f} < 5% of image → too small")
        return None

    # ── 7. Debug: draw found markers ─────────────────────────────────────────
    vis = det_image.copy()
    for i, cp in enumerate(result):
        label_text = ["TL", "TR", "BR", "BL"][i]
        cv2.circle(vis, (cp.x, cp.y), 10, (0, 255, 0), -1)
        cv2.putText(vis, f"{label_text}({cp.x},{cp.y})", (cp.x + 5, cp.y - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    cv2.polylines(vis, [np.array([(c.x, c.y) for c in result], dtype=np.int32)],
                  isClosed=True, color=(0, 255, 0), thickness=2)
    _debug_save(f"fid_{label}_result.jpg", vis)

    print(f"[corner] fiducial/{label}: SUCCESS corners={[(c.x, c.y) for c in result]}")
    return result


def _detect_fiducial_markers(
    det_image: np.ndarray,
    gray: np.ndarray,
    image_area: float,
) -> Optional[list[CornerPoint]]:
    """
    Try multiple preprocessing variants to detect the 4 black square markers.

    Returns list of 4 CornerPoint on success, None on failure.
    """
    print("[corner] ── Pipeline FIDUCIAL: black-square marker detection ────────")

    # Variant 1: direct dark threshold on original gray
    result = _find_black_squares(gray, det_image, image_area, threshold_value=60, label="v1_raw60")
    if result:
        return result

    # Variant 2: slightly more lenient threshold
    result = _find_black_squares(gray, det_image, image_area, threshold_value=80, label="v2_raw80")
    if result:
        return result

    # Variant 3: CLAHE equalised gray (improves contrast under bad lighting)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray_clahe = clahe.apply(gray)
    result = _find_black_squares(gray_clahe, det_image, image_area, threshold_value=70, label="v3_clahe70")
    if result:
        return result

    # Variant 4: Gaussian blur before thresholding (reduces noise false-positives)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    result = _find_black_squares(blurred, det_image, image_area, threshold_value=65, label="v4_blur65")
    if result:
        return result

    # Variant 5: CLAHE + blur, even more lenient threshold
    gray_clahe_blurred = cv2.GaussianBlur(gray_clahe, (5, 5), 0)
    result = _find_black_squares(gray_clahe_blurred, det_image, image_area, threshold_value=90, label="v5_clahe_blur90")
    if result:
        return result

    print("[corner] fiducial: ALL variants failed")
    return None


# ===========================================================================
# FALLBACK: original full-page contour detection pipelines
# ===========================================================================

def _is_valid_sheet(
    contour: np.ndarray,
    image_area: float,
    min_area_ratio: float = 0.03,
    max_area_ratio: float = 0.99,
    epsilon_ratio: float = 0.05,
) -> tuple[bool, str, Optional[np.ndarray]]:
    """
    Validate a contour as a document sheet (4-vertex convex quad).
    Returns (valid, reason_string, approx_4pts_or_None).
    """
    peri = cv2.arcLength(contour, closed=True)
    if peri < 100:
        return False, f"perimeter={peri:.0f} < 100 (too small)", None

    approx = cv2.approxPolyDP(contour, epsilon=epsilon_ratio * peri, closed=True)
    vertices = len(approx)

    if vertices != 4:
        for alt_eps in [0.04, 0.03, 0.06, 0.07]:
            alt_approx = cv2.approxPolyDP(contour, epsilon=alt_eps * peri, closed=True)
            if len(alt_approx) == 4:
                approx = alt_approx
                vertices = 4
                print(f"[corner]   fallback epsilon={alt_eps:.2f} produced 4 vertices")
                break

    if vertices != 4:
        return False, f"vertices={vertices} (need 4, tried eps 0.03-0.07)", None

    area = cv2.contourArea(approx)
    area_ratio = area / image_area

    if area_ratio < min_area_ratio:
        return False, f"area_ratio={area_ratio:.4f} < {min_area_ratio} (document too small)", None
    if area_ratio > max_area_ratio:
        return False, f"area_ratio={area_ratio:.4f} > {max_area_ratio} (fills entire frame)", None

    if not cv2.isContourConvex(approx):
        return False, "contour not convex", None

    x, y, bw, bh = cv2.boundingRect(approx)
    if bh == 0:
        return False, "degenerate bounding rect (h=0)", None
    aspect = bw / bh
    if aspect < 0.15 or aspect > 6.5:
        return False, f"aspect_ratio={aspect:.2f} (allowed 0.15-6.50)", None

    return True, f"area_ratio={area_ratio:.4f} vertices={vertices} aspect={aspect:.2f}", approx


def _detect_from_edges(
    edge_image: np.ndarray,
    image_area: float,
    label: str,
    min_area_ratio: float = 0.03,
) -> Optional[np.ndarray]:
    """Find the largest valid quadrilateral contour in an edge/binary image."""
    contours, _ = cv2.findContours(edge_image, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    print(f"[corner] {label}: total contours found={len(contours)}")

    if not contours:
        return None

    contours_sorted = sorted(contours, key=cv2.contourArea, reverse=True)[:30]

    for i, contour in enumerate(contours_sorted):
        area = cv2.contourArea(contour)
        valid, reason, _ = _is_valid_sheet(contour, image_area, min_area_ratio=min_area_ratio)
        if valid:
            print(f"[corner] {label}: ACCEPTED contour[{i}] area_ratio={area/image_area:.4f} → {reason}")
            return contour
        else:
            if i < 10:
                print(f"[corner] {label}: REJECTED contour[{i}] area_ratio={area/image_area:.4f} → {reason}")

    print(f"[corner] {label}: no valid sheet contour found")
    return None


def _finalize_detection(sheet_contour: np.ndarray, label: str) -> DetectionResult:
    """Convert a validated raw contour to an ordered 4-corner DetectionResult."""
    peri = cv2.arcLength(sheet_contour, closed=True)
    pts = None
    for eps in [0.05, 0.04, 0.03, 0.06, 0.07]:
        approx = cv2.approxPolyDP(sheet_contour, epsilon=eps * peri, closed=True)
        if len(approx) == 4:
            pts = approx.reshape(-1, 2).astype(np.float32)
            print(f"[corner] finalize: epsilon={eps:.2f} produced {len(pts)} points")
            break

    if pts is None or len(pts) != 4:
        print(f"[corner] WARN: finalize could not get 4 pts, using convexHull")
        hull = cv2.convexHull(sheet_contour)
        peri2 = cv2.arcLength(hull, closed=True)
        for eps in [0.05, 0.04, 0.06, 0.03]:
            hull_approx = cv2.approxPolyDP(hull, eps * peri2, closed=True)
            if len(hull_approx) == 4:
                pts = hull_approx.reshape(-1, 2).astype(np.float32)
                break
        if pts is None or len(pts) != 4:
            x, y, w, h = cv2.boundingRect(sheet_contour)
            pts = np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dtype=np.float32)
            print(f"[corner] WARN: using bounding rect corners")

    ordered = _order_corners(pts)
    corners = [CornerPoint(x=int(pt[0]), y=int(pt[1])) for pt in ordered]
    print(f"[corner] SUCCESS via {label}: corners={[(c.x, c.y) for c in corners]}")
    return DetectionResult(
        detected=True,
        corners=corners,
        message=f"Feuille détectée ({label})",
    )


# ---------------------------------------------------------------------------
# Failure debug image
# ---------------------------------------------------------------------------

def _save_failure_debug(det_image: np.ndarray, all_contours_by_pipeline: dict) -> None:
    vis = det_image.copy()
    h, w = vis.shape[:2]
    image_area = float(w * h)

    all_contours = []
    for label, conts in all_contours_by_pipeline.items():
        for c in conts[:5]:
            all_contours.append((cv2.contourArea(c), label, c))
    all_contours.sort(key=lambda x: x[0], reverse=True)

    colors = [(0, 0, 255), (0, 165, 255), (0, 255, 255)]
    for idx, (area, label, cnt) in enumerate(all_contours[:3]):
        color = colors[idx % len(colors)]
        cv2.drawContours(vis, [cnt], -1, color, 2)
        M = cv2.moments(cnt)
        if M["m00"] > 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            cv2.putText(vis, f"{label} ar={area/image_area:.3f}",
                        (max(cx - 60, 0), max(cy, 15)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1)

    cv2.putText(vis, "ALL PIPELINES FAILED", (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    _debug_save("98_all_pipelines_failed.jpg", vis)


# ---------------------------------------------------------------------------
# Final result debug image
# ---------------------------------------------------------------------------

def _save_final_debug(image: np.ndarray, corners: list[CornerPoint], pipeline: str) -> None:
    vis = image.copy()
    pts = np.array([(c.x, c.y) for c in corners], dtype=np.int32)
    cv2.polylines(vis, [pts], isClosed=True, color=(0, 255, 0), thickness=3)
    labels = ["TL", "TR", "BR", "BL"]
    for i, (pt, lbl) in enumerate(zip(pts, labels)):
        cv2.circle(vis, tuple(pt), 10, (0, 0, 255), -1)
        cv2.putText(vis, f"{lbl}({pt[0]},{pt[1]})", (pt[0] + 8, pt[1] - 8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)
    _debug_save(f"99_final_pipeline{pipeline}.jpg", vis)


# ===========================================================================
# Main detection entry point
# ===========================================================================

def detect_corners(
    image_bytes: bytes,
    gaussian_ksize: int = 5,
    canny_low: int = 20,
    canny_high: int = 80,
) -> DetectionResult:
    """
    Detect the four corners of the answer sheet.

    Strategy order:
      1. Fiducial marker detection (4 black squares at corners) — FASTEST, most robust
      2. CLAHE + adaptive threshold page contour (Fallback A)
      3. Canny edges page contour (Fallback B)
      4. Otsu threshold page contour (Fallback C)
      5. Aggressive blur + bilateral + Canny (Fallback D)
    """
    t0 = time.perf_counter()
    det_w, det_h = 0, 0

    try:
        # ── 1. Decode ────────────────────────────────────────────────────────
        np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if image is None:
            print("[corner] FAIL: cv2.imdecode returned None")
            return DetectionResult(
                detected=False, corners=[], message="Image non décodable",
                detection_image_width=0, detection_image_height=0,
            )

        orig_h, orig_w = image.shape[:2]
        print(f"[corner] ── detect_corners START ──────────────────────────────")
        print(f"[corner] received bytes={len(image_bytes)} decoded {orig_w}x{orig_h}")

        _debug_save("01_original.jpg", image)

        # ── 2. Resize for detection ──────────────────────────────────────────
        det_image = _resize_for_detection(image, target_long_side=1024)
        det_h, det_w = det_image.shape[:2]
        image_area = float(det_w * det_h)

        _debug_save("02_resized.jpg", det_image)

        # ── 3. Grayscale ─────────────────────────────────────────────────────
        gray = cv2.cvtColor(det_image, cv2.COLOR_BGR2GRAY)
        _debug_save("03_grayscale.jpg", gray)
        print(
            f"[corner] gray: shape={gray.shape} min={int(gray.min())} "
            f"max={int(gray.max())} mean={gray.mean():.1f} std={gray.std():.1f}"
        )

        ksize = gaussian_ksize if gaussian_ksize % 2 == 1 else gaussian_ksize + 1

        # ── PIPELINE PRIMARY: Fiducial marker detection ──────────────────────
        t_fid = time.perf_counter()
        fid_result = _detect_fiducial_markers(det_image, gray, image_area)
        print(f"[corner] Pipeline FIDUCIAL done in {1000*(time.perf_counter()-t_fid):.0f}ms")

        if fid_result is not None:
            _save_final_debug(det_image, fid_result, "FID")
            result = DetectionResult(
                detected=True,
                corners=fid_result,
                message="Feuille détectée (marqueurs fiduciels)",
                detection_image_width=det_w,
                detection_image_height=det_h,
            )
            print(f"[corner] ── detect_corners END ({1000*(time.perf_counter()-t0):.0f} ms) ──")
            return result

        # ── FALLBACK A: CLAHE + Adaptive threshold ───────────────────────────
        print(f"[corner] ── Fallback A: CLAHE + Adaptive Threshold ────────────")
        t_a = time.perf_counter()

        clahe_a = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray_a = clahe_a.apply(gray)
        _debug_save("04a_clahe.jpg", gray_a)

        blurred_a = cv2.GaussianBlur(gray_a, (ksize, ksize), 0)
        _debug_save("04a_blur_gaussian.jpg", blurred_a)

        thresh_a = cv2.adaptiveThreshold(
            blurred_a, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            blockSize=21, C=4,
        )
        _debug_save("05a_adaptive_thresh.jpg", thresh_a)

        kernel_a = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
        closed_a = cv2.morphologyEx(thresh_a, cv2.MORPH_CLOSE, kernel_a, iterations=2)
        _debug_save("06a_morph_close.jpg", closed_a)

        pipeline_contours: dict = {}
        contour_vis_a = det_image.copy()
        conts_a, _ = cv2.findContours(closed_a, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(contour_vis_a, conts_a, -1, (0, 255, 0), 2)
        _debug_save("07a_contours_all.jpg", contour_vis_a)
        pipeline_contours["clahe-adaptive"] = sorted(conts_a, key=cv2.contourArea, reverse=True)[:5]

        sheet = _detect_from_edges(closed_a, image_area, "clahe-adaptive")
        print(f"[corner] Fallback A done in {1000*(time.perf_counter()-t_a):.0f}ms")
        if sheet is not None:
            result = _finalize_detection(sheet, "clahe-adaptive")
            _save_final_debug(det_image, result.corners, "A")
            result.detection_image_width = det_w
            result.detection_image_height = det_h
            print(f"[corner] ── detect_corners END ({1000*(time.perf_counter()-t0):.0f} ms) ──")
            return result

        # ── FALLBACK B: Canny edges ──────────────────────────────────────────
        print(f"[corner] ── Fallback B: Canny ──────────────────────────────────")
        t_b = time.perf_counter()

        blurred_b = cv2.GaussianBlur(gray, (ksize, ksize), 0)
        edges_b = cv2.Canny(blurred_b, canny_low, canny_high)
        _debug_save("05b_canny.jpg", edges_b)

        kernel_b = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        dilated_b = cv2.dilate(edges_b, kernel_b, iterations=2)
        _debug_save("06b_canny_dilated.jpg", dilated_b)

        contour_vis_b = det_image.copy()
        conts_b, _ = cv2.findContours(dilated_b, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(contour_vis_b, conts_b, -1, (0, 255, 0), 2)
        _debug_save("07b_contours_all.jpg", contour_vis_b)
        pipeline_contours["canny"] = sorted(conts_b, key=cv2.contourArea, reverse=True)[:5]

        sheet = _detect_from_edges(dilated_b, image_area, "canny")
        print(f"[corner] Fallback B done in {1000*(time.perf_counter()-t_b):.0f}ms")
        if sheet is not None:
            result = _finalize_detection(sheet, "canny")
            _save_final_debug(det_image, result.corners, "B")
            result.detection_image_width = det_w
            result.detection_image_height = det_h
            print(f"[corner] ── detect_corners END ({1000*(time.perf_counter()-t0):.0f} ms) ──")
            return result

        # ── FALLBACK C: Otsu threshold ───────────────────────────────────────
        print(f"[corner] ── Fallback C: Otsu Threshold ─────────────────────────")
        t_c = time.perf_counter()

        blurred_c = cv2.GaussianBlur(gray, (ksize, ksize), 0)
        _, thresh_c = cv2.threshold(blurred_c, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        _debug_save("04c_otsu.jpg", thresh_c)

        kernel_c = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed_c = cv2.morphologyEx(thresh_c, cv2.MORPH_CLOSE, kernel_c, iterations=2)
        _debug_save("05c_otsu_morph.jpg", closed_c)

        contour_vis_c = det_image.copy()
        conts_c, _ = cv2.findContours(closed_c, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(contour_vis_c, conts_c, -1, (0, 255, 0), 2)
        _debug_save("07c_contours_all.jpg", contour_vis_c)
        pipeline_contours["otsu"] = sorted(conts_c, key=cv2.contourArea, reverse=True)[:5]

        sheet = _detect_from_edges(closed_c, image_area, "otsu")
        print(f"[corner] Fallback C done in {1000*(time.perf_counter()-t_c):.0f}ms")
        if sheet is not None:
            result = _finalize_detection(sheet, "otsu")
            _save_final_debug(det_image, result.corners, "C")
            result.detection_image_width = det_w
            result.detection_image_height = det_h
            print(f"[corner] ── detect_corners END ({1000*(time.perf_counter()-t0):.0f} ms) ──")
            return result

        # ── FALLBACK D: Bilateral + aggressive Canny ─────────────────────────
        print(f"[corner] ── Fallback D: Bilateral + aggressive Canny ───────────")
        t_d = time.perf_counter()

        blurred_d = cv2.GaussianBlur(gray, (7, 7), 0)
        bilateral_d = cv2.bilateralFilter(blurred_d, 9, 75, 75)
        _debug_save("04b_bilateral.jpg", bilateral_d)

        clahe_d = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        gray_d = clahe_d.apply(bilateral_d)
        _debug_save("04d_clahe.jpg", gray_d)

        edges_d = cv2.Canny(gray_d, 10, 50)
        _debug_save("05d_canny_clahe.jpg", edges_d)

        kernel_d = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        dilated_d = cv2.dilate(edges_d, kernel_d, iterations=3)
        _debug_save("06d_dilated.jpg", dilated_d)

        contour_vis_d = det_image.copy()
        conts_d, _ = cv2.findContours(dilated_d, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(contour_vis_d, conts_d, -1, (0, 255, 0), 2)
        _debug_save("07d_contours_all.jpg", contour_vis_d)
        pipeline_contours["clahe-canny"] = sorted(conts_d, key=cv2.contourArea, reverse=True)[:5]

        sheet = _detect_from_edges(dilated_d, image_area, "clahe-canny", min_area_ratio=0.02)
        print(f"[corner] Fallback D done in {1000*(time.perf_counter()-t_d):.0f}ms")
        if sheet is not None:
            result = _finalize_detection(sheet, "clahe-canny")
            _save_final_debug(det_image, result.corners, "D")
            result.detection_image_width = det_w
            result.detection_image_height = det_h
            print(f"[corner] ── detect_corners END ({1000*(time.perf_counter()-t0):.0f} ms) ──")
            return result

        # ── All pipelines exhausted ───────────────────────────────────────────
        print(f"[corner] ALL PIPELINES FAILED – no sheet found in FIDUCIAL/A/B/C/D")
        _save_failure_debug(det_image, pipeline_contours)
        print(f"[corner] ── detect_corners END ({1000*(time.perf_counter()-t0):.0f} ms) ──")
        return DetectionResult(
            detected=False, corners=[], message="Aucune feuille détectée",
            detection_image_width=det_w, detection_image_height=det_h,
        )

    except Exception:
        tb = traceback.format_exc()
        print(f"[corner] EXCEPTION:\n{tb}")
        return DetectionResult(
            detected=False, corners=[], message=f"Erreur: {tb[:200]}",
            detection_image_width=det_w, detection_image_height=det_h,
        )


# ---------------------------------------------------------------------------
# draw_corners utility (used by routes that want annotated preview)
# ---------------------------------------------------------------------------

def draw_corners(image_bytes: bytes, corners: list[CornerPoint]) -> bytes:
    np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        return image_bytes

    pts = np.array([(c.x, c.y) for c in corners], dtype=np.int32)
    cv2.polylines(image, [pts], isClosed=True, color=(0, 255, 0), thickness=3)
    labels = ["TL", "TR", "BR", "BL"]
    for i, (pt, label) in enumerate(zip(pts, labels)):
        cv2.circle(image, tuple(pt), 10, (108, 92, 255), -1)
        cv2.putText(image, f"{i+1}", (pt[0] + 10, pt[1] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (108, 92, 255), 2)

    _, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buffer.tobytes()
