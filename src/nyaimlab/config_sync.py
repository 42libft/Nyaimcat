"""Synchronise the bot runtime config.yaml with the admin API state."""
from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from threading import Lock
from enum import Enum
from typing import Any, Dict, Type

import yaml
from pydantic import BaseModel, ValidationError

from .store import STORE
from .schemas import (
    GuidelineTemplate,
    IntroduceConfig,
    IntroduceSchema,
    RagConfig,
    RolesConfig,
    ScrimConfig,
    SettingsPayload,
    VerifyConfig,
    WelcomeConfig,
)

logger = logging.getLogger(__name__)

SECTION_MODELS: Dict[str, Type[BaseModel]] = {
    "welcome": WelcomeConfig,
    "guideline": GuidelineTemplate,
    "verify": VerifyConfig,
    "roles": RolesConfig,
    "introduce": IntroduceConfig,
    "introduce_schema": IntroduceSchema,
    "scrims": ScrimConfig,
    "settings": SettingsPayload,
    "rag": RagConfig,
}

SECTION_ORDER = (
    "welcome",
    "guideline",
    "verify",
    "roles",
    "role_emoji_map",
    "introduce",
    "introduce_schema",
    "scrims",
    "settings",
    "rag",
)


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _serialise_section(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, Enum):
        return value.value

    if isinstance(value, dict):
        serialised: Dict[str, Any] = {}
        for k, v in value.items():
            converted = _serialise_section(v)
            if converted is not None:
                serialised[str(k)] = converted
        return serialised

    if isinstance(value, list):
        return [
            item_serialised
            for item_serialised in (_serialise_section(item) for item in value)
            if item_serialised is not None
        ]

    if isinstance(value, tuple):
        return [
            item_serialised
            for item_serialised in (_serialise_section(item) for item in value)
            if item_serialised is not None
        ]

    return value


class ConfigSynchronizer:
    """Bidirectional synchronisation between config.yaml and the in-memory store."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._initialized = False
        self._enabled = False
        self._config_path: Path | None = None
        self._config_data: Dict[str, Any] = {}
        self._tracked_guild_id: str | None = None
        self._backup_limit = self._resolve_backup_limit()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def initialize(self) -> None:
        with self._lock:
            if self._initialized:
                return

            enable_flag = os.getenv("NYAIMLAB_CONFIG_SYNC")
            if enable_flag is not None and not _is_truthy(enable_flag):
                logger.info(
                    "環境変数 NYAIMLAB_CONFIG_SYNC により config.yaml 同期が明示的に無効化されています。"
                )
                self._initialized = True
                self._enabled = False
                return

            self._config_path = self._resolve_config_path()
            self._config_data = self._load_config_data(self._config_path)
            self._tracked_guild_id = self._extract_guild_id(self._config_data)
            self._enabled = True
            self._initialized = True

            logger.info(
                "config.yaml 同期を有効化しました。パス=%s",
                self._config_path,
            )

        # ブートストラップ処理はストア側のロックを取るためにロック外で実行する
        if self._enabled and self._tracked_guild_id:
            self._bootstrap_store(self._tracked_guild_id, self._config_data)

    def persist(self, guild_id: str) -> None:
        if not guild_id:
            return

        if not self._initialized:
            self.initialize()

        if not self._enabled or not self._config_path:
            return

        try:
            state = STORE.export_state(guild_id)
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.exception("ストア状態の取得に失敗しました: guild_id=%s", guild_id)
            return

        with self._lock:
            if self._tracked_guild_id and self._tracked_guild_id != guild_id:
                logger.warning(
                    "config.yaml 同期対象の guild_id が一致しません。期待=%s, 受信=%s",
                    self._tracked_guild_id,
                    guild_id,
                )
                return

            if not self._tracked_guild_id:
                self._tracked_guild_id = guild_id
                guild_section = self._config_data.setdefault("guild", {})
                guild_section.setdefault("id", guild_id)
                guild_section["id"] = guild_id

            verify_state = state.get("verify")
            logger.info(
                "config.yaml への書き戻しを実行します",
                extra={
                    "guild_id": guild_id,
                    "sections": [key for key, value in state.items() if value],
                    "verify_prompt": (verify_state or {}).get("prompt") if isinstance(verify_state, dict) else None,
                },
            )

            for key in SECTION_ORDER:
                if key == "role_emoji_map":
                    value = state.get(key) or {}
                    self._config_data[key] = dict(value)
                    continue

                value = state.get(key)
                if value is None:
                    self._config_data.pop(key, None)
                else:
                    self._config_data[key] = _serialise_section(value)

            self._write_config_locked()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _resolve_config_path(self) -> Path:
        raw_path = (
            os.getenv("NYAIMLAB_CONFIG_PATH")
            or os.getenv("BOT_CONFIG_PATH")
            or "bot-runtime/config/config.yaml"
        )
        path = Path(raw_path).expanduser()
        if not path.is_absolute():
            path = Path(os.getcwd()) / path
        return path

    def _load_config_data(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            logger.info("config.yaml が見つかりませんでした。同期対象として新規作成します。パス=%s", path)
            return {}

        try:
            raw_text = path.read_text(encoding="utf-8")
        except OSError as exc:  # pragma: no cover - unlikely but defensive
            logger.error("config.yaml の読み込みに失敗しました: %s", exc)
            return {}

        data = yaml.safe_load(raw_text) or {}
        if not isinstance(data, dict):
            logger.warning("config.yaml のルートがマッピングではないため、同期をスキップします。")
            return {}
        return data

    def _extract_guild_id(self, data: Dict[str, Any]) -> str | None:
        guild = data.get("guild")
        if isinstance(guild, dict):
            guild_id = guild.get("id")
            if guild_id:
                return str(guild_id)
        return None

    def _bootstrap_store(self, guild_id: str, config: Dict[str, Any]) -> None:
        snapshot: Dict[str, Any] = {}
        for key, model in SECTION_MODELS.items():
            raw_value = config.get(key)
            if raw_value is None:
                continue
            try:
                instance = model.model_validate(raw_value)
                snapshot[key] = instance.model_dump(mode="json")
            except ValidationError as exc:
                logger.warning("config.yaml のセクション %s の読み込みに失敗しました: %s", key, exc)

        role_emoji_map = config.get("role_emoji_map")
        if isinstance(role_emoji_map, dict):
            snapshot["role_emoji_map"] = {str(k): str(v) for k, v in role_emoji_map.items()}

        if snapshot:
            STORE.import_state(guild_id, snapshot)
            logger.info("config.yaml から %s の初期状態を読み込みました。", guild_id)

    def _write_config_locked(self) -> None:
        assert self._config_path is not None  # nosec - guarded by caller

        self._create_backup_locked()

        serialised = yaml.safe_dump(
            self._config_data,
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        )

        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self._config_path.parent / f"{self._config_path.name}.tmp"
        tmp_path.write_text(serialised, encoding="utf-8")
        tmp_path.replace(self._config_path)
        logger.debug("config.yaml を更新しました: %s", self._config_path)

    def _resolve_backup_limit(self) -> int:
        raw_value = os.getenv("NYAIMLAB_CONFIG_BACKUP_LIMIT")
        if not raw_value:
            return 10
        try:
            value = int(raw_value)
        except ValueError:
            logger.warning("NYAIMLAB_CONFIG_BACKUP_LIMIT の値が不正です (%s)。既定値 10 を使用します。", raw_value)
            return 10
        return max(value, 0)

    def _create_backup_locked(self) -> None:
        assert self._config_path is not None  # nosec - guarded by caller

        if not self._config_path.exists():
            return

        backup_dir = self._config_path.parent / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        backup_name = f"{self._config_path.name}.{timestamp}.bak"
        backup_path = backup_dir / backup_name

        try:
            backup_path.write_bytes(self._config_path.read_bytes())
        except OSError as exc:  # pragma: no cover - defensive guard
            logger.error("config.yaml バックアップの作成に失敗しました: %s", exc)
            return

        self._prune_backups_locked(backup_dir)

    def _prune_backups_locked(self, backup_dir: Path) -> None:
        assert self._config_path is not None  # nosec - guarded by caller

        limit = self._backup_limit
        if limit <= 0:
            return

        pattern = f"{self._config_path.name}.*.bak"
        candidates: list[tuple[float, Path]] = []
        for path in backup_dir.glob(pattern):
            try:
                mtime = path.stat().st_mtime
            except OSError as exc:  # pragma: no cover - defensive guard
                logger.warning("バックアップ %s のメタデータ取得に失敗しました: %s", path, exc)
                continue
            candidates.append((mtime, path))

        candidates.sort(key=lambda item: item[0], reverse=True)

        for _, obsolete in candidates[limit:]:
            try:
                obsolete.unlink()
            except OSError as exc:  # pragma: no cover - defensive guard
                logger.warning("古いバックアップ %s の削除に失敗しました: %s", obsolete, exc)


CONFIG_SYNC = ConfigSynchronizer()
CONFIG_SYNC.initialize()
