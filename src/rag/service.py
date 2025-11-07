from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from glob import glob
from pathlib import Path
from typing import List, Optional, Sequence

import yaml

from .config import RagSettings, get_settings
from .memory import HeartbeatLog, MemoryEntry, ShortTermMemory
from .models import (
    ChatMode,
    ChatQuery,
    ChatResponse,
    MessageEvent,
    MemoRegistration,
    MemoryPruneResult,
    RagConfigPayload,
    RagFeelingsConfig,
    RagPromptsConfig,
    RagShortTermConfig,
)
from .ollama import OllamaClient
from .storage import ChromaManager

logger = logging.getLogger(__name__)

DEFAULT_PROMPTS = RagPromptsConfig(
    base=(
        "あなたは Nyaimlab Discord サーバーで暮らす中性的な猫のキャラクターボットとして振る舞ってください。"
        "相手に寄り添い、尊重しながら返答してください。"
        "ヘルプやアドバイス以外の雑談では、短く自然なチャット文を意識してください。"
        "絵文字や顔文字は使わないでください。"
        "自分が AI や ChatGPT であると説明したり、注意書きや免責事項を付けたりしないでください。"
        "求められない限り長文にならないようにし、1〜2文程度で要点だけを返してください。"
    ),
    help=(
        "あなたは Nyaimlab サーバーの丁寧なヘルプ担当です。"
        "わかりやすく落ち着いたトーンで、手順や理由を整理して伝えてください。"
        "語尾は基本的に敬語ですが、たまに柔らかく「〜にゃ」と添えても構いません。"
        "絵文字や顔文字は使わず、文末は句読点またはにゃ語尾にしてください。"
    ),
    coach=(
        "あなたは Aim やゲーム戦略のコーチ役です。"
        "中性的な猫のキャラクターとして、ポジティブに励ましつつ提案をしてください。"
        "アドバイスは実践的かつ簡潔にまとめ、語尾は「〜にゃ」「〜にゃー」などを使いつつも行数は短めに保ってください。"
        "絵文字は使用せず、親しい友達に話す感覚で表現してください。"
    ),
    chat=(
        "一人称は「ボク」、語尾には必ず「〜にゃ」「〜にゃー」「〜にゃ〜」「〜にゃ！」「〜にゃ…」のいずれかを付けてください。"
        "絵文字は使わず、雑談は1〜2行程度で短く、友達感覚で自然に返答してください。"
    ),
)

DEFAULT_FEELINGS = RagFeelingsConfig()
DEFAULT_SHORT_TERM = RagShortTermConfig()


class RagService:
    """RAG と感情制御を統合するサービス層。"""

    def __init__(self, settings: Optional[RagSettings] = None) -> None:
        self.settings = settings or get_settings()
        self.memory = ShortTermMemory(capacity=self.settings.short_term_limit)
        self.heartbeat = HeartbeatLog()
        self.chroma = ChromaManager(self.settings)
        self.ollama = OllamaClient(self.settings)

        self.prompts = DEFAULT_PROMPTS.model_copy(deep=True)
        self.short_term_config = DEFAULT_SHORT_TERM.model_copy(deep=True)
        self._excluded_channels = set(self.short_term_config.excluded_channels)

        self.excitement = DEFAULT_FEELINGS.excitement
        self.empathy = DEFAULT_FEELINGS.empathy
        self.response_probability = self.settings.default_probability
        self.cooldown_minutes = self.settings.default_cooldown_minutes
        self.mode = ChatMode(self.settings.default_mode)
        self.feelings = RagFeelingsConfig(
            excitement=self.excitement,
            empathy=self.empathy,
            probability=self.response_probability,
            cooldown_minutes=self.cooldown_minutes,
            default_mode=self.mode,
        )

        self.last_reply_at: Optional[datetime] = None
        self.loaded_documents: List[str] = []

    async def shutdown(self) -> None:
        await self.ollama.close()

    def register_message(self, event: MessageEvent) -> Optional[MemoryEntry]:
        if event.channel_id in self._excluded_channels:
            logger.debug(
                "Skipping short-term memory registration for excluded channel",
                extra={"channel_id": event.channel_id},
            )
            return None

        entry = self.memory.add(event)
        logger.debug(
            "Registered message %s in short-term memory (channel=%s mention=%s)",
            entry.message_id,
            entry.channel_id,
            entry.is_mention,
        )

        if self.chroma.ready:
            meta = {
                "channel_id": entry.channel_id,
                "author_id": entry.author_id,
                "is_mention": entry.is_mention,
                "timestamp": entry.timestamp.isoformat(),
                "tags": ",".join(entry.tags),
            }
            self.chroma.add_documents(
                collection_name=self.settings.chroma_collection_short,
                ids=[entry.message_id],
                documents=[entry.content],
                metadatas=[meta],
            )
        return entry

    def record_heartbeat(self, content: str) -> None:
        self.heartbeat.add(content)

    def update_feelings(
        self,
        *,
        excitement: Optional[float] = None,
        empathy: Optional[float] = None,
        probability: Optional[float] = None,
        cooldown_minutes: Optional[float] = None,
        default_mode: Optional[ChatMode] = None,
    ) -> None:
        if excitement is not None:
            self.excitement = excitement
        if empathy is not None:
            self.empathy = empathy
        if probability is not None:
            self.response_probability = probability
        if cooldown_minutes is not None:
            self.cooldown_minutes = cooldown_minutes
        if default_mode is not None:
            self.mode = default_mode

        self.feelings = RagFeelingsConfig(
            excitement=self.excitement,
            empathy=self.empathy,
            probability=self.response_probability,
            cooldown_minutes=self.cooldown_minutes,
            default_mode=self.mode,
        )

    def switch_mode(self, mode: ChatMode) -> None:
        self.mode = mode

    def update_short_term(self, config: RagShortTermConfig) -> None:
        self.short_term_config = config
        self._excluded_channels = set(config.excluded_channels)

    def apply_config(self, config: RagConfigPayload) -> None:
        self.prompts = config.prompts.model_copy(deep=True)
        self.update_feelings(
            excitement=config.feelings.excitement,
            empathy=config.feelings.empathy,
            probability=config.feelings.probability,
            cooldown_minutes=config.feelings.cooldown_minutes,
            default_mode=config.feelings.default_mode,
        )
        self.update_short_term(config.short_term.model_copy(deep=True))

    def config_snapshot(self) -> RagConfigPayload:
        return RagConfigPayload(
            prompts=self.prompts.model_copy(deep=True),
            feelings=self.feelings.model_copy(deep=True),
            short_term=self.short_term_config.model_copy(deep=True),
        )

    def can_speak(self, force: bool = False) -> bool:
        if force:
            return True
        now = datetime.now(timezone.utc)
        if self.last_reply_at is None:
            return True
        cooldown = timedelta(minutes=self.cooldown_minutes)
        return now - self.last_reply_at >= cooldown

    async def generate_reply(self, query: ChatQuery) -> ChatResponse:
        context_entries = (
            self.memory.recent(query.max_context_messages) if query.include_recent else []
        )
        context_messages = [
            f"[{entry.timestamp.isoformat()} #{entry.channel_id}] {entry.content}"
            for entry in context_entries
        ]

        knowledge_chunks = self._retrieve_knowledge(query)

        system_prompts = self._build_system_prompts(query.mode, knowledge_chunks)

        reply_text = await self.ollama.generate(
            prompt=query.prompt,
            system_messages=system_prompts,
            context_messages=context_messages,
            mode_hint=query.mode.value,
        )

        self.last_reply_at = datetime.now(timezone.utc)

        return ChatResponse(
            reply=reply_text.strip(),
            mode=query.mode,
            used_context=context_messages,
            knowledge_documents=[chunk["content"] for chunk in knowledge_chunks],
        )

    def _retrieve_knowledge(self, query: ChatQuery) -> List[dict]:
        if not self.chroma.ready:
            return []
        hits = self.chroma.query(
            collection_name=self.settings.chroma_collection_core,
            text=query.prompt,
            limit=4,
        )
        return hits

    def _build_system_prompts(
        self,
        mode: ChatMode,
        knowledge_chunks: Sequence[dict],
    ) -> List[str]:
        style_prompt = {
            ChatMode.HELP: self.prompts.help,
            ChatMode.COACH: self.prompts.coach,
            ChatMode.CHAT: self.prompts.chat,
        }[mode]

        base_prompt = self.prompts.base

        prompts: List[str] = [f"{base_prompt} {style_prompt}"]

        if knowledge_chunks:
            knowledge_lines = []
            for idx, chunk in enumerate(knowledge_chunks, start=1):
                metadata = chunk.get("metadata") or {}
                title = metadata.get("title") or f"参考情報{idx}"
                raw_tags = metadata.get("tags")
                if isinstance(raw_tags, str):
                    tags = [tag.strip() for tag in raw_tags.split(",") if tag.strip()]
                elif isinstance(raw_tags, (list, tuple, set)):
                    tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
                else:
                    tags = []
                header = title
                if tags:
                    header += f" (tags: {', '.join(tags)})"
                body = chunk.get("content") or ""
                knowledge_lines.append(f"{header}\n{body}")
            prompts.append(
                "次の参考情報を考慮に入れてください:\n\n" + "\n\n---\n\n".join(knowledge_lines)
            )

        return prompts

    def ingest_markdown(self, registration: MemoRegistration, doc_id: Optional[str] = None) -> None:
        doc_id = doc_id or f"memo-{len(self.loaded_documents)+1}"
        metadata = {
            "title": registration.title,
            "tags": ", ".join(registration.tags) if registration.tags else None,
            "source_path": registration.source_path,
        }
        self.chroma.add_documents(
            collection_name=self.settings.chroma_collection_memos,
            ids=[doc_id],
            documents=[registration.content],
            metadatas=[metadata],
        )
        self.loaded_documents.append(registration.title)

    def ingest_markdown_directory(self, directory: Path) -> None:
        paths = sorted(directory.glob("*.md"))
        for path in paths:
            registration = self._load_markdown_file(path)
            if registration is None:
                continue
            self.ingest_markdown(registration, doc_id=path.stem)

    def _load_markdown_file(self, path: Path) -> Optional[MemoRegistration]:
        try:
            text = path.read_text(encoding=self.settings.markdown_encoding)
        except FileNotFoundError:
            logger.warning("Markdown file not found: %s", path)
            return None

        title = path.stem
        tags: List[str] = []

        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                front_matter = parts[1]
                content = parts[2].lstrip("\n")
                try:
                    data = yaml.safe_load(front_matter) or {}
                    title = data.get("title", title)
                    tags = data.get("tags", []) or []
                except yaml.YAMLError as exc:  # pragma: no cover - log only
                    logger.warning("Failed to parse front matter for %s: %s", path, exc)
                text = content

        return MemoRegistration(title=title, content=text, tags=tags, source_path=str(path))

    def load_initial_documents(self) -> None:
        pattern = self.settings.knowledge_glob
        seen: set[str] = set()
        for path_str in glob(pattern, recursive=True):
            path = Path(path_str)
            if not path.is_file():
                continue
            if path_str in seen:
                continue
            seen.add(path_str)
            registration = self._load_markdown_file(path)
            if registration is None:
                continue
            self.ingest_markdown(registration, doc_id=path.stem)

    def prune_memory(self, days: int) -> MemoryPruneResult:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        cutoff_iso = cutoff.isoformat()
        removed_short = self.memory.prune_before(cutoff)
        removed_chroma = self.chroma.remove_older_than(
            self.settings.chroma_collection_short,
            cutoff_iso,
        )
        logger.debug(
            "Pruned memory older than %s: short=%s chroma=%s",
            cutoff_iso,
            removed_short,
            removed_chroma,
        )
        return MemoryPruneResult(
            removed_short_term=removed_short,
            removed_chroma=removed_chroma,
        )

    def health(self) -> dict:
        return {
            "mode": self.mode.value,
            "excitement": self.excitement,
            "empathy": self.empathy,
            "probability": self.response_probability,
            "cooldown_minutes": self.cooldown_minutes,
            "memory": self.memory.summary(),
            "chroma_ready": self.chroma.ready,
            "loaded_documents": len(self.loaded_documents),
            "last_reply_at": self.last_reply_at.isoformat() if self.last_reply_at else None,
            "excluded_channels": list(self.short_term_config.excluded_channels),
        }
