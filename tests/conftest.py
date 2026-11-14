"""
tests/conftest.py
Ensures project root (onecontext) is on sys.path for pytest.
"""

import asyncio
import sys
from pathlib import Path

# Add onecontext directory to sys.path
root_dir = Path(__file__).parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

# Starlette's synchronous TestClient opens an AnyIO blocking portal.  Under
# Python 3.13 on Windows, its Proactor loop can stall while creating the local
# socketpair used by that portal.  The selector policy is test-only and keeps
# HTTP integration tests deterministic; production Uvicorn is unaffected.
if sys.platform == "win32" and hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
