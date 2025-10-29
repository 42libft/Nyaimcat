"""Helper utilities for synchronising RAG settings and knowledge."""
from __future__ import annotations

import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
import httpx
import yaml

from .schemas import RagConfig, RagKnowledgeEntry

logger = logging.getLogger(__name__)


def _slugify(value: str) -> str:
    normalised = unicodedata.normalize("NFKD", value)
    ascii_value = normalised.encode("ascii", "ignore").decode("ascii")
    ascii_value = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-")
    return ascii_value.lower() or "entry"


class RagBridge:
    """Bridge between the management API and the local RAG service."""

    def __init__(self) -> None:
        self._base_url = os.getenv("RAG_SERVICE_BASE_URL", "http://127.0.0.1:8100").rstrip("/")
        knowledge_root = os.getenv("RAG_KNOWLEDGE_OUTPUT_DIR", "docs/rag/knowledge/manual")
        self._knowledge_dir = Path(knowledge_root)

    # ------------------------------------------------------------------
    # Knowledge handling
    # ------------------------------------------------------------------
    def register_knowledge(self, entry: RagKnowledgeEntry) -> Path:
        """Persist a knowledge entry and notify the RAG service."""

        path = self._write_markdown(entry)
        self._notify_memo(entry, path)
        return path

    def _write_markdown(self, entry: RagKnowledgeEntry) -> Path:
        self._knowledge_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        slug = _slugify(entry.title)
        filename = f"{timestamp}-{slug}.md"
        path = self._knowledge_dir / filename

        front_matter = {
            "title": entry.title,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if entry.tags:
            front_matter["tags"] = entry.tags

        yaml_block = yaml.safe_dump(
            front_matter,
            allow_unicode=True,
            sort_keys=False,
        ).strip()

        body = entry.content.strip()
        if not body.endswith("\n"):
            body += "\n"

        text = f"---\n{yaml_block}\n---\n\n{body}"
        path.write_text(text, encoding="utf-8")

        logger.info("Registered manual knowledge entry", extra={"path": str(path)})
        return path

    def _notify_memo(self, entry: RagKnowledgeEntry, path: Path) -> None:
        if not self._base_url:
            return

        payload = {
            "title": entry.title,
            "content": entry.content,
            "tags": entry.tags,
            "source_path": str(path),
        }

        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(f"{self._base_url}/admin/memo", json=payload)
        except Exception as exc:  # pragma: no cover - network failures are logged only
            logger.warning("Failed to notify RAG service about new memo: %s", exc)

    # ------------------------------------------------------------------
    # Configuration handling
    # ------------------------------------------------------------------
    def push_config(self, config: RagConfig) -> None:
        """Send the latest configuration to the RAG service."""

        if not self._base_url:
            return

        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(
                    f"{self._base_url}/admin/rag/config",
                    json=config.model_dump(mode="json"),
                )
        except Exception as exc:  # pragma: no cover - network failures are logged only
            logger.warning("Failed to push RAG configuration: %s", exc)
