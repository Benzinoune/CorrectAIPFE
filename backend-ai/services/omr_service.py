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


def _measure_fill_at(gray: np.ndarray, cx: int, cy: int, radius: int) -> float:
    """Measures how filled a region is by checking the mean pixel value in a circle."""
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.circle(mask, (cx, cy), radius, 255, -1)
    mean_val = cv2.mean(gray, mask=mask)[0]
    inv_val = 255 - mean_val
    return inv_val / 255.0


_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']


def detect_bubbles(image_bytes: bytes, questions: int = 20) -> list[BubbleResult]:
    np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        return []

    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Grid layout calibration (based on real logs)
    # y positions: from 0.450 to 0.771 (10 rows)
    y_start_ratio = 0.450
    y_step_ratio = (0.771 - 0.450) / 9.0
    
    # Left column x positions: from 0.121 to 0.440 (5 choices)
    x_start_left = 0.121
    x_step_left = (0.440 - 0.121) / 4.0
    
    # Right column x positions: from 0.617 to 0.934 (5 choices)
    x_start_right = 0.617
    x_step_right = (0.934 - 0.617) / 4.0
    
    # Bubble radius is approx 1.8% of width based on r=18 for w=1000
    radius = int(w * 0.016)

    results: list[BubbleResult] = []
    half_q = questions // 2
    
    debug_img = image.copy()
    
    # Process all 20 questions
    for q_idx in range(questions):
        # Determine if left or right column
        is_left = q_idx < half_q
        row = q_idx if is_left else q_idx - half_q
        
        # Calculate expected Y coordinate for this row
        cy = int(h * (y_start_ratio + row * y_step_ratio))
        
        # Calculate expected X coordinates for the 5 choices (A, B, C, D, E)
        x_start = x_start_left if is_left else x_start_right
        x_step = x_step_left if is_left else x_step_right
        
        fills = []
        for choice_idx in range(5):
            cx = int(w * (x_start + choice_idx * x_step))
            fill_ratio = _measure_fill_at(gray, cx, cy, radius)
            fills.append((choice_idx, fill_ratio, cx, cy))
            
            # Draw on debug image
            color = (255, 0, 0) # Blue for all theoretical spots
            cv2.circle(debug_img, (cx, cy), radius, color, 1)
            cv2.putText(debug_img, f"{fill_ratio:.2f}", (cx - 10, cy - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.3, color, 1)

        # Sort choices by fill ratio (darkest first)
        fills.sort(key=lambda x: x[1], reverse=True)
        
        detected_answers = []
        best_confidence = 0.0
        
        if fills[0][1] > 0.20:
            best_fill = fills[0][1]
            best_confidence = best_fill
            # Any bubble that is reasonably dark AND close in darkness to the best bubble is considered filled
            for choice_idx, fill_ratio, cx, cy in fills:
                # A bubble is checked if it's > 0.35 absolute, OR > 0.20 and at least 70% as dark as the best bubble
                if fill_ratio > 0.35 or (fill_ratio > 0.20 and fill_ratio >= best_fill * 0.70):
                    detected_answers.append(_LABELS[choice_idx])
                    # Highlight detected answer in green
                    cv2.circle(debug_img, (cx, cy), radius + 2, (0, 255, 0), 2)
                    
        # Sort answers alphabetically (e.g., "C+D" instead of "D+C")
        detected_answers.sort()
        detected_answer_str = "+".join(detected_answers) if detected_answers else None
        
        results.append(BubbleResult(
            question=q_idx + 1,
            answer=detected_answer_str,
            confidence=best_confidence,
        ))
        print(f"[OMR] Q{q_idx+1}: {detected_answer_str or '-'} (best={fills[0][1]:.2f} @ {_LABELS[fills[0][0]]}, 2nd={fills[1][1]:.2f})")

    # Save debug image only when CORRECTAI_DEBUG=true
    if os.getenv("CORRECTAI_DEBUG", "false").lower() == "true":
        debug_dir = os.path.join(os.path.dirname(__file__), "..", "debug")
        os.makedirs(debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(debug_dir, "omr_grid_debug.jpg"), debug_img)

    return results
