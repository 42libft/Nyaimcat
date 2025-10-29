from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(".env.rag"), override=False)
load_dotenv(dotenv_path=Path(".env"), override=False)


@dataclass(frozen=True)
class RagSettings:
    """RAG サービス全体の設定値。"""

    chroma_path: Path = Path(os.getenv("RAG_CHROMA_PATH", "data/chroma"))
    knowledge_glob: str = os.getenv("RAG_KNOWLEDGE_GLOB", "docs/rag/knowledge/**/*.md")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3:8b-instruct")
    ollama_timeout: float = float(os.getenv("OLLAMA_TIMEOUT", "60.0"))
    service_host: str = os.getenv("RAG_HOST", "127.0.0.1")
    service_port: int = int(os.getenv("RAG_PORT", "8100"))
    short_term_limit: int = int(os.getenv("RAG_SHORT_TERM_LIMIT", "50"))
    heart_interval_seconds: int = int(os.getenv("RAG_HEART_INTERVAL", "300"))
    default_mode: str = os.getenv("RAG_DEFAULT_MODE", "chat")
    default_probability: float = float(os.getenv("RAG_DEFAULT_PROBABILITY", "0.25"))
    default_cooldown_minutes: float = float(os.getenv("RAG_DEFAULT_COOLDOWN", "15"))
    logging_level: str = os.getenv("RAG_LOGGING_LEVEL", "INFO")
    enable_ragflow: bool = os.getenv("RAGFLOW_ENABLED", "1") not in {"0", "false", "False"}
    chroma_collection_core: str = os.getenv("RAG_CHROMA_CORE_COLLECTION", "core_knowledge")
    chroma_collection_short: str = os.getenv("RAG_CHROMA_SHORT_COLLECTION", "short_term")
    chroma_collection_memos: str = os.getenv("RAG_CHROMA_MEMO_COLLECTION", "manual_memos")
    markdown_encoding: str = os.getenv("RAG_MARKDOWN_ENCODING", "utf-8")
    heart_voice_path: Optional[Path] = (
        Path(path) if (path := os.getenv("RAG_HEART_VOICE_PATH")) else None
    )


@lru_cache(maxsize=1)
def get_settings() -> RagSettings:
    """設定値をシングルトンで取得する。"""

    settings = RagSettings()
    settings.chroma_path.mkdir(parents=True, exist_ok=True)
    return settings
