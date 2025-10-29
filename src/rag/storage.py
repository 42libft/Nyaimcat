from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Sequence

try:
    import chromadb
    from chromadb import PersistentClient
except ImportError:  # pragma: no cover - optional dependency
    chromadb = None
    PersistentClient = None  # type: ignore

from .config import RagSettings, get_settings
from .embedding import SimpleHasherEmbedding

logger = logging.getLogger(__name__)


class ChromaManager:
    """Chroma のラッパー。"""

    def __init__(self, settings: Optional[RagSettings] = None) -> None:
        self.settings = settings or get_settings()
        self._client: Optional[PersistentClient] = None
        self._embedding = SimpleHasherEmbedding()

        if chromadb is None:
            logger.warning("chromadb がインポートできません。Chroma 連携は無効化されます。")
            return

        Path(self.settings.chroma_path).mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(self.settings.chroma_path))

    @property
    def ready(self) -> bool:
        return self._client is not None

    def _get_collection(self, name: str):
        if not self.ready:
            raise RuntimeError("Chroma client is not initialised.")
        assert self._client is not None
        return self._client.get_or_create_collection(
            name=name,
            embedding_function=self._embedding,
        )

    def add_documents(
        self,
        collection_name: str,
        ids: Sequence[str],
        documents: Sequence[str],
        metadatas: Optional[Sequence[dict]] = None,
    ) -> None:
        if not self.ready:
            logger.debug("Chroma is not ready. Skipping add_documents for %s", collection_name)
            return

        collection = self._get_collection(collection_name)
        collection.add(ids=list(ids), documents=list(documents), metadatas=metadatas)

    def delete_collection(self, name: str) -> None:
        if not self.ready:
            return
        assert self._client is not None
        self._client.delete_collection(name=name)

    def query(
        self,
        collection_name: str,
        text: str,
        limit: int = 4,
    ) -> List[dict]:
        if not self.ready:
            return []
        collection = self._get_collection(collection_name)
        results = collection.query(query_texts=[text], n_results=limit)
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        scores = results.get("distances", [[]])[0]
        return [
            {"content": doc, "metadata": meta, "score": score}
            for doc, meta, score in zip(documents, metadatas, scores)
        ]

    def remove_older_than(
        self,
        collection_name: str,
        cutoff_iso: str,
        timestamp_field: str = "timestamp",
    ) -> int:
        if not self.ready:
            return 0

        collection = self._get_collection(collection_name)
        results = collection.get(
            where={timestamp_field: {"$lt": cutoff_iso}},
            include=["ids"],
        )

        ids = results.get("ids", [[]])
        if not ids or not ids[0]:
            return 0

        flat_ids = ids[0]
        collection.delete(ids=flat_ids)
        return len(flat_ids)
