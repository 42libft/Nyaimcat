from __future__ import annotations

import hashlib
import struct
from typing import Iterable, List


class SimpleHasherEmbedding:
    """暫定的な埋め込み関数。

    TODO: RAGFlow の正式な埋め込み機構に置き換える。
    """

    def __init__(self, dim: int = 32) -> None:
        if dim <= 0:
            raise ValueError("dim must be positive")
        self.dim = dim

    def __call__(self, input: Iterable[str]) -> List[List[float]]:
        return [self._embed(text) for text in input]

    def embed_documents(self, documents: Iterable[str]) -> List[List[float]]:
        return self.__call__(documents)

    def embed_query(self, input: str | Iterable[str]) -> List[List[float]]:
        if isinstance(input, str):
            return [self._embed(input)]
        combined = "\n".join(input)
        return [self._embed(combined)]

    def name(self) -> str:
        return "simple_hasher_embedding"

    def _embed(self, text: str) -> List[float]:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        needed = self.dim * 4
        repeated = (digest * ((needed // len(digest)) + 1))[:needed]
        integers = struct.unpack(f">{self.dim}I", repeated)
        scale = float(2**32)
        return [(value / scale) for value in integers]
