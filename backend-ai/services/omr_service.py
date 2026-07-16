import math
from typing import Any

import cv2
import numpy as np


class BubbleResult:
    def __init__(self, question: int, answer: str | None, confidence: float):
        self.question = question
        self.answer = answer
        self.confidence = confidence

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.answer,
            "confidence": round(self.confidence, 2),
        }


class _BubbleCandidate:
    def __init__(self, cx: float, cy: float, radius: float, contour: np.ndarray):
        self.cx = cx
        self.cy = cy
        self.radius = radius
        self.contour = contour


def _find_bubble_contours(
    gray: np.ndarray,
    min_radius: int = 8,
    max_radius: int = 30,
) -> list[_BubbleCandidate]:
    h, w = gray.shape[:2]
    # Scale radius thresholds relative to image width so they work at any resolution.
    # A bubble is roughly 1.3% of the sheet width for 20-question layout.
    # For a 900px wide image: ~12px radius. For a 2000px wide image: ~26px radius.
    scale = w / 700.0  # 700px is our reference width
    min_radius = max(5, int(8 * scale))
    max_radius = max(20, int(40 * scale))

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
        max(11, int(21 * scale) | 1), 4  # block size must be odd
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=1)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    bubbles: list[_BubbleCandidate] = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < math.pi * min_radius * min_radius * 0.5:
            continue
        if area > math.pi * max_radius * max_radius * 1.5:
            continue

        perimeter = cv2.arcLength(cnt, closed=True)
        if perimeter == 0:
            continue
        circularity = 4 * math.pi * area / (perimeter * perimeter)
        if circularity < 0.55:  # slightly more lenient for printed circles
            continue

        (cx, cy), r = cv2.minEnclosingCircle(cnt)
        if r < min_radius or r > max_radius:
            continue

        bubbles.append(_BubbleCandidate(cx=cx, cy=cy, radius=r, contour=cnt))

    return bubbles


def _cluster_into_rows(
    bubbles: list[_BubbleCandidate],
    y_tolerance: int = 20,
) -> list[list[_BubbleCandidate]]:
    if not bubbles:
        return []
    # Scale y_tolerance relative to median bubble radius
    median_r = sorted(b.radius for b in bubbles)[len(bubbles) // 2]
    y_tolerance = max(10, int(median_r * 1.8))

    sorted_bubbles = sorted(bubbles, key=lambda b: b.cy)
    rows: list[list[_BubbleCandidate]] = []
    current_row: list[_BubbleCandidate] = []
    current_y = -1

    for bubble in sorted_bubbles:
        y = bubble.cy
        if current_y < 0:
            current_y = y
            current_row.append(bubble)
        elif abs(y - current_y) < y_tolerance:
            current_row.append(bubble)
        else:
            if current_row:
                current_row.sort(key=lambda b: b.cx)
                rows.append(current_row)
            current_row = [bubble]
            current_y = y

    if current_row:
        current_row.sort(key=lambda b: b.cx)
        rows.append(current_row)

    return rows


def _is_bubble_filled(
    gray: np.ndarray,
    contour: np.ndarray,
    fill_threshold: float = 0.35,  # lowered: dark printed circles are clearly dark
) -> tuple[bool, float]:
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.drawContours(mask, [contour], -1, 255, -1)

    mean_val = cv2.mean(gray, mask=mask)[0]
    inv_val = 255 - mean_val
    fill_ratio = inv_val / 255.0

    return fill_ratio > fill_threshold, fill_ratio


_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']


def detect_bubbles(image_bytes: bytes, questions: int = 20) -> list[BubbleResult]:
    np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        return []

    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    bubbles = _find_bubble_contours(gray)

    # Filter out false positives from the header / form section.
    # The QCM grid always starts below the form (roughly bottom 60% of the document).
    qcm_y_min = int(h * 0.45)
    
    valid_bubbles = []
    for b in bubbles:
        if b.cy < qcm_y_min:
            continue
            
        # Filter out question numbers (1, 2, 3...) which are far left in their column
        # Left column numbers are at x ~ 0.05w, Right column numbers are at x ~ 0.55w
        x_ratio = b.cx / w
        if x_ratio < 0.08 or (0.50 < x_ratio < 0.58):
            continue
            
        valid_bubbles.append(b)
        
    bubbles = valid_bubbles

    # ── Debug: save image with all detected bubbles drawn ────────────────────
    import os
    debug_dir = os.path.join(os.path.dirname(__file__), "..", "debug")
    os.makedirs(debug_dir, exist_ok=True)
    debug_img = image.copy()
    for b in bubbles:
        is_filled, fill_ratio = _is_bubble_filled(gray, b.contour)
        color = (0, 255, 0) if is_filled else (0, 165, 255)
        cv2.drawContours(debug_img, [b.contour], -1, color, 2)
        cv2.putText(debug_img, f"{fill_ratio:.2f}", (int(b.cx), int(b.cy)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
    cv2.imwrite(os.path.join(debug_dir, "omr_bubbles_debug.jpg"), debug_img)
    print(f"[OMR] detected {len(bubbles)} bubble candidates in {w}x{h} image")

    if not bubbles:
        return [BubbleResult(question=i + 1, answer=None, confidence=0.0) for i in range(questions)]

    rows = _cluster_into_rows(bubbles)

    rows = sorted(rows, key=lambda r: r[0].cy)[:questions]

    max_columns = max(len(row) for row in rows) if rows else 5

    results: list[BubbleResult] = []
    for row_idx, row in enumerate(rows):
        row.sort(key=lambda b: b.cx)

        detected_answer: str | None = None
        best_confidence = 0.0

        for candidate in row:
            is_filled, fill_ratio = _is_bubble_filled(gray, candidate.contour)
            if is_filled and fill_ratio > best_confidence:
                # Map X coordinate to choice A-E
                x_ratio = candidate.cx / w
                
                # Left column
                if x_ratio < 0.5:
                    if x_ratio < 0.14: col_idx = 0
                    elif x_ratio < 0.23: col_idx = 1
                    elif x_ratio < 0.32: col_idx = 2
                    elif x_ratio < 0.41: col_idx = 3
                    else: col_idx = 4
                # Right column
                else:
                    if x_ratio < 0.64: col_idx = 0
                    elif x_ratio < 0.73: col_idx = 1
                    elif x_ratio < 0.82: col_idx = 2
                    elif x_ratio < 0.91: col_idx = 3
                    else: col_idx = 4

                detected_answer = _LABELS[col_idx] if col_idx < len(_LABELS) else "A"
                best_confidence = fill_ratio

        results.append(BubbleResult(
            question=row_idx + 1,
            answer=detected_answer,
            confidence=best_confidence,
        ))

    remaining = questions - len(results)
    for i in range(remaining):
        results.append(BubbleResult(question=len(results) + 1, answer=None, confidence=0.0))

    return results
