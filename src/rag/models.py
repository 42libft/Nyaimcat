from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    OBSERVER = "observer"


class MessageEvent(BaseModel):
    """Discord から流れてくるメッセージイベント。"""

    message_id: str = Field(..., description="Discord メッセージ ID")
    guild_id: str = Field(..., description="ギルド ID")
    channel_id: str = Field(..., description="チャンネル ID")
    author_id: str = Field(..., description="投稿者 ID")
    content: str = Field(..., description="メッセージ本文")
    timestamp: datetime = Field(..., description="作成日時 (ISO8601)")
    is_mention: bool = Field(False, description="Bot へのメンションか")
    probable_mode: Optional[str] = Field(
        default=None, description="推定モード (help / coach / chat など)"
    )
    tags: List[str] = Field(default_factory=list, description="メッセージに紐づくタグ")


class ChatMode(str, Enum):
    HELP = "help"
    COACH = "coach"
    CHAT = "chat"


class ChatQuery(BaseModel):
    """Bot から応答生成を要求するペイロード。"""

    prompt: str = Field(..., description="ユーザーからの問い合わせやメンション内容")
    mode: ChatMode = Field(ChatMode.CHAT, description="回答モード")
    channel_id: Optional[str] = Field(default=None)
    guild_id: Optional[str] = Field(default=None)
    user_id: Optional[str] = Field(default=None)
    include_recent: bool = Field(
        True, description="短期記憶をコンテキストに含めるかどうか"
    )
    max_context_messages: int = Field(15, ge=0, le=100)


class ChatResponse(BaseModel):
    """応答生成結果。"""

    reply: str
    mode: ChatMode
    used_context: List[str] = Field(default_factory=list)
    knowledge_documents: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None


class IngestRequest(BaseModel):
    """チャンネルの履歴取り込みなどを行う際のリクエスト。"""

    channel_id: str
    days: Optional[int] = Field(default=None, description="さかのぼる日数")
    limit: Optional[int] = Field(
        default=None, description="最大メッセージ数（指定しない場合はデフォルト）"
    )


class MemoRegistration(BaseModel):
    """Markdown メモ追加用のリクエスト。"""

    title: str
    content: str
    tags: List[str] = Field(default_factory=list)
    source_path: Optional[str] = None


class FeelingAdjustRequest(BaseModel):
    """感情・頻度パラメータ調整コマンド用。"""

    excitement: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    empathy: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    probability: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    cooldown_minutes: Optional[float] = Field(default=None, ge=0.0)


class ModeSwitchRequest(BaseModel):
    """ヘルプ／コーチ／チャットモード切り替え。"""

    mode: ChatMode


class HeartbeatRequest(BaseModel):
    """心の声記録用。"""

    content: str


class MemoryPruneRequest(BaseModel):
    """指定日数より古い記憶を整理するためのリクエスト。"""

    days: int = Field(..., ge=1)


class MemoryPruneResult(BaseModel):
    """メモリ pruning 実行結果。"""

    removed_short_term: int = 0
    removed_chroma: int = 0


class RagPromptsConfig(BaseModel):
    """RAG サービスで使用するプロンプトテンプレート。"""

    base: str
    help: str
    coach: str
    chat: str


class RagFeelingsConfig(BaseModel):
    """感情・自発発話制御の設定。"""

    excitement: float = Field(default=0.5, ge=0.0, le=1.0)
    empathy: float = Field(default=0.5, ge=0.0, le=1.0)
    probability: float = Field(default=0.25, ge=0.0, le=1.0)
    cooldown_minutes: float = Field(default=15.0, ge=0.0)
    default_mode: ChatMode = ChatMode.CHAT


class RagShortTermConfig(BaseModel):
    """短期記憶の制御設定。"""

    excluded_channels: List[str] = Field(default_factory=list)


class RagConfigPayload(BaseModel):
    """RAG サービス全体の設定。"""

    prompts: RagPromptsConfig
    feelings: RagFeelingsConfig = Field(default_factory=RagFeelingsConfig)
    short_term: RagShortTermConfig = Field(default_factory=RagShortTermConfig)
