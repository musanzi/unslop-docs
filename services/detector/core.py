"""Document coverage and aggregation, independent of the inference runtime."""

import hashlib
import math
from datetime import datetime, timezone

MODEL_ID = "danibor/oculus-v2.0-multilingual"
MODEL_REVISION = "e6b41a2159c78d480738317c3ea6a680073a7b32"
MODEL_VERSION = f"{MODEL_ID}@{MODEL_REVISION}"
METHOD = "token-weighted-mean-v1"
MAX_CHARACTERS = 150_000
MAX_SEGMENTS = 128
MIN_WORDS = 50


def segments(token_ids, capacity=510):
    """Balance non-overlapping windows, including every token exactly once."""
    if not token_ids or capacity < 1:
        raise ValueError("Invalid token coverage")
    count = math.ceil(len(token_ids) / capacity)
    if count > MAX_SEGMENTS:
        raise ValueError("Too many segments")
    return [token_ids[index * len(token_ids) // count:(index + 1) * len(token_ids) // count] for index in range(count)]


def score_tokens(token_ids, predict, capacity=510):
    windows = segments(token_ids, capacity)
    weighted = 0.0
    for window in windows:
        score = float(predict(window))
        if not math.isfinite(score) or not 0 <= score <= 1:
            raise ValueError("Invalid model output")
        weighted += score * len(window)
    return weighted / len(token_ids), len(windows)


def result(text, score=None, reason=None, token_count=0, segment_count=0):
    return {
        "provider": "local",
        "status": "unavailable" if reason else "complete",
        "aiScore": score,
        "reason": reason,
        "modelVersion": MODEL_VERSION,
        "method": METHOD,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        # Match JavaScript string.length, including supplementary Unicode characters.
        "characterCount": len(text.encode("utf-16-le")) // 2,
        "tokenCount": token_count,
        "segmentCount": segment_count,
    }
