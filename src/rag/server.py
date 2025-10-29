from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import (
    ChatQuery,
    ChatResponse,
    FeelingAdjustRequest,
    HeartbeatRequest,
    MemoryPruneRequest,
    MemoryPruneResult,
    MessageEvent,
    MemoRegistration,
    ModeSwitchRequest,
    RagConfigPayload,
)
from .service import RagService

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Nyaimlab RAG Service",
    description="Discord と連携するローカル RAG サービスの骨格",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings = get_settings()
service = RagService(settings=settings)


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("RAG サービスを起動します。初期ドキュメントをロード中...")
    service.load_initial_documents()
    logger.info("初期ドキュメント読み込み完了: %s 件", len(service.loaded_documents))


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await service.shutdown()


@app.get("/health")
async def health() -> Dict[str, Any]:
    return service.health()


@app.post("/events/message", status_code=204)
async def ingest_message(event: MessageEvent) -> None:
    service.register_message(event)


@app.post("/chat/query", response_model=ChatResponse)
async def chat(query: ChatQuery) -> ChatResponse:
    try:
        return await service.generate_reply(query)
    except Exception as exc:  # pragma: no cover - upstream errors
        logger.exception("Failed to generate reply: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to generate reply") from exc


@app.post("/admin/memo", status_code=204)
async def register_memo(request: MemoRegistration) -> None:
    service.ingest_markdown(request)


@app.post("/admin/feeling", status_code=204)
async def adjust_feeling(request: FeelingAdjustRequest) -> None:
    service.update_feelings(
        excitement=request.excitement,
        empathy=request.empathy,
        probability=request.probability,
        cooldown_minutes=request.cooldown_minutes,
    )


@app.post("/admin/mode", status_code=204)
async def switch_mode(request: ModeSwitchRequest) -> None:
    service.switch_mode(request.mode)


@app.get("/admin/rag/config")
async def get_rag_config() -> Dict[str, Any]:
    config = service.config_snapshot()
    return config.model_dump(mode="json")


@app.post("/admin/rag/config", status_code=204)
async def update_rag_config(request: RagConfigPayload) -> None:
    service.apply_config(request)


@app.post("/admin/heartbeat", status_code=204)
async def register_heartbeat(request: HeartbeatRequest) -> None:
    service.record_heartbeat(request.content)


@app.get("/admin/heartbeat")
async def get_heartbeat() -> Dict[str, Any]:
    return {
        "history": [
            {"timestamp": ts.isoformat(), "content": content}
            for ts, content in service.heartbeat.history()
        ],
        "latest": service.heartbeat.latest(),
    }


@app.post("/admin/memory/prune", response_model=MemoryPruneResult)
async def prune_memory(request: MemoryPruneRequest) -> MemoryPruneResult:
    return service.prune_memory(request.days)
