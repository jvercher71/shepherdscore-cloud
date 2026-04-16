"""
Vercel serverless function — wraps the FastAPI backend as an ASGI app.
Strips the /api prefix so existing routes (/members, /giving, etc.) work unchanged.
"""

import sys
import os

# Add backend directory to Python path so `main` module is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from main import app as fastapi_app  # noqa: E402
from starlette.types import ASGIApp, Receive, Scope, Send  # noqa: E402


class StripPrefix:
    """ASGI middleware that strips a URL prefix before forwarding to the app."""

    def __init__(self, application: ASGIApp, prefix: str = "/api"):
        self.app = application
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] in ("http", "websocket"):
            path: str = scope.get("path", "")
            if path.startswith(self.prefix):
                scope = dict(scope)
                scope["path"] = path[len(self.prefix):] or "/"
        await self.app(scope, receive, send)


# Vercel picks up this `app` variable as the ASGI handler
app = StripPrefix(fastapi_app)
