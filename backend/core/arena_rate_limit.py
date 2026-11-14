"""Small in-process rate limiter for the single-process Arena deployment."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import HTTPException, Request, status


class InProcessRateLimiter:
    def __init__(self) -> None:
        self._events: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)

    def check(self, request: Request, action: str, limit: int, window_seconds: int = 60) -> None:
        client = request.client.host if request.client else "unknown"
        key = (action, client)
        now = time.monotonic()
        events = self._events[key]
        while events and events[0] <= now - window_seconds:
            events.popleft()
        if len(events) >= limit:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Too many {action} requests. Try again later.")
        events.append(now)

    def reset(self) -> None:
        self._events.clear()


arena_rate_limiter = InProcessRateLimiter()
