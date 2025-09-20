"""Entry point for running the Nyaimlab admin API."""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8080"))
    uvicorn.run("nyaimlab.app:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
