from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Tuple

__all__ = ["TeamStore", "TeamStoreError", "TeamStoreState"]


class TeamStoreError(Exception):
    """TeamStore に関連する例外。"""


@dataclass(slots=True)
class TeamStoreState:
    entries: Dict[str, int]


class TeamStore:
    """
    Discord userId ↔ teamId 永続化。
    JSON ファイルに保存し、I/O は asyncio.to_thread で非同期対応する。
    """

    def __init__(self, storage_path: Path, *, default_team_id: Optional[int] = None) -> None:
        self._path = storage_path
        self._default_team_id = default_team_id
        self._lock = asyncio.Lock()
        self._loaded = False
        self._entries: Dict[str, int] = {}

    async def load(self) -> None:
        async with self._lock:
            if self._loaded:
                return

            def _read() -> Dict[str, int]:
                if not self._path.exists():
                    return {}
                with self._path.open("r", encoding="utf-8") as fp:
                    raw = json.load(fp)
                if not isinstance(raw, dict):
                    raise TeamStoreError("team_ids.json が辞書形式ではありません。")
                out: Dict[str, int] = {}
                for key, value in raw.items():
                    try:
                        out[str(key)] = int(value)
                    except (TypeError, ValueError) as exc:
                        raise TeamStoreError(f"team_ids.json の値が数値化できません: key={key!r}") from exc
                return out

            entries = await asyncio.to_thread(_read)
            self._entries = entries
            self._loaded = True

    async def resolve_team_id(self, user_id: int) -> Tuple[Optional[int], bool]:
        """
        登録済み teamId を返す。
        戻り値: (team_id or None, is_user_specific)
        user-specific がない場合は default_team_id を返し、is_user_specific=False。
        """
        await self._ensure_loaded()
        key = str(user_id)
        if key in self._entries:
            return self._entries[key], True
        return self._default_team_id, False

    async def get_team_id(self, user_id: int) -> Optional[int]:
        team_id, _ = await self.resolve_team_id(user_id)
        return team_id

    async def set_team_id(self, user_id: int, team_id: int) -> None:
        await self._ensure_loaded()
        key = str(user_id)
        async with self._lock:
            self._entries[key] = int(team_id)
            await self._flush_locked()

    async def remove_team_id(self, user_id: int) -> None:
        await self._ensure_loaded()
        key = str(user_id)
        async with self._lock:
            if key in self._entries:
                del self._entries[key]
                await self._flush_locked()

    async def all_entries(self) -> TeamStoreState:
        await self._ensure_loaded()
        return TeamStoreState(entries=dict(self._entries))

    async def _ensure_loaded(self) -> None:
        if not self._loaded:
            await self.load()

    async def _flush_locked(self) -> None:
        entries = dict(self._entries)

        def _write() -> None:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp_path = self._path.with_suffix(".tmp")
            with tmp_path.open("w", encoding="utf-8") as fp:
                json.dump(entries, fp, ensure_ascii=False, indent=2, sort_keys=True)
            tmp_path.replace(self._path)

        await asyncio.to_thread(_write)
