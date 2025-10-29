from __future__ import annotations

import logging
from typing import Iterable, List, Optional

import httpx

from .config import RagSettings, get_settings

logger = logging.getLogger(__name__)


class OllamaClient:
    """Ollama への HTTP クライアント。"""

    def __init__(self, settings: Optional[RagSettings] = None) -> None:
        self.settings = settings or get_settings()
        self._client = httpx.AsyncClient(
            base_url=self.settings.ollama_base_url,
            timeout=self.settings.ollama_timeout,
        )

    async def generate(
        self,
        prompt: str,
        system_messages: Optional[Iterable[str]] = None,
        context_messages: Optional[List[str]] = None,
        mode_hint: Optional[str] = None,
    ) -> str:
        messages = []

        if system_messages:
            messages.extend({"role": "system", "content": msg} for msg in system_messages)

        if context_messages:
            messages.extend({"role": "user", "content": msg} for msg in context_messages)

        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.settings.ollama_model,
            "messages": messages,
            "options": {"temperature": 0.7, "top_p": 0.9},
            "stream": False,
        }

        if mode_hint:
            payload["options"]["mode_hint"] = mode_hint

        logger.debug("Sending request to Ollama: %s", payload)
        response = await self._client.post("/api/chat", json=payload)
        response.raise_for_status()
        data = response.json()
        logger.debug("Ollama response: %s", data)

        message = data.get("message") or {}
        return message.get("content") or ""

    async def close(self) -> None:
        await self._client.aclose()
