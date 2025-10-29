from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Deque, Iterable, List, Optional, Tuple

from .models import MessageEvent


@dataclass
class MemoryEntry:
    """短期／中期メモリに格納するエントリ。"""

    message_id: str
    channel_id: str
    author_id: str
    content: str
    timestamp: datetime
    is_mention: bool = False
    tags: Tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def from_event(cls, event: MessageEvent) -> "MemoryEntry":
        return cls(
            message_id=event.message_id,
            channel_id=event.channel_id,
            author_id=event.author_id,
            content=event.content,
            timestamp=event.timestamp,
            is_mention=event.is_mention,
            tags=tuple(event.tags),
        )


class ShortTermMemory:
    """直近メッセージを保持するリングバッファ。"""

    def __init__(self, capacity: int) -> None:
        self.capacity = capacity
        self._messages: Deque[MemoryEntry] = deque(maxlen=capacity)

    def add(self, event: MessageEvent) -> MemoryEntry:
        entry = MemoryEntry.from_event(event)
        self._messages.append(entry)
        return entry

    def recent(self, limit: Optional[int] = None) -> List[MemoryEntry]:
        if limit is None or limit >= len(self._messages):
            return list(self._messages)
        return list(self._messages)[-limit:]

    def clear(self) -> None:
        self._messages.clear()

    def summary(self) -> dict:
        return {
            "size": len(self._messages),
            "capacity": self.capacity,
            "latest_timestamp": self._messages[-1].timestamp.isoformat()
            if self._messages
            else None,
        }

    def prune_before(self, cutoff: datetime) -> int:
        """指定日時より古いメッセージを削除する。"""

        original = list(self._messages)
        kept = [entry for entry in original if entry.timestamp >= cutoff]
        removed = len(original) - len(kept)
        self._messages = deque(kept, maxlen=self.capacity)
        return removed


class HeartbeatLog:
    """心の声ログを保持する単純な履歴管理。"""

    def __init__(self, capacity: int = 50) -> None:
        self.capacity = capacity
        self._log: Deque[Tuple[datetime, str]] = deque(maxlen=capacity)

    def add(self, content: str, timestamp: Optional[datetime] = None) -> None:
        self._log.append(
            (
                timestamp or datetime.now(timezone.utc),
                content,
            )
        )

    def history(self) -> Iterable[Tuple[datetime, str]]:
        return list(self._log)

    def latest(self) -> Optional[str]:
        if not self._log:
            return None
        _, content = self._log[-1]
        return content
