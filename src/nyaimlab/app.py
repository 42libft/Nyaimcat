"""FastAPI application exposing the Nyaimlab management API."""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import require_context
from .config_sync import CONFIG_SYNC
from .context import RequestContext
from .schemas import (
    APIResponse,
    AuditExportRequest,
    AuditSearchRequest,
    GuidelineTemplate,
    GuidelineTestRequest,
    IntroduceConfig,
    IntroduceSchema,
    RagConfig,
    RagKnowledgeEntry,
    RoleEmojiMapRequest,
    RoleRemovalRequest,
    RolesConfig,
    RolesPreviewRequest,
    ScrimConfig,
    ScrimRunRequest,
    SettingsPayload,
    VerifyConfig,
    WelcomeConfig,
    WelcomePreviewRequest,
)
from .rag_bridge import RagBridge
from .store import STORE
from .welcome_preview import generate_welcome_preview

logger = logging.getLogger(__name__)


def _success(audit_entry, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {"ok": True, "audit_id": audit_entry.audit_id, "data": data}
    return payload


def _failure(status_code: int, message: str, audit_entry=None) -> JSONResponse:
    body: Dict[str, Any] = {"ok": False, "error": message}
    if audit_entry is not None:
        body["audit_id"] = audit_entry.audit_id
    return JSONResponse(status_code=status_code, content=body)


router = APIRouter(prefix="/api")
RAG_BRIDGE = RagBridge()


def _persist_config(guild_id: str) -> None:
    try:
        CONFIG_SYNC.persist(guild_id)
    except Exception:  # pragma: no cover - defensive guard
        logger.exception("config.yaml への書き戻しに失敗しました。guild_id=%s", guild_id)


@router.post("/welcome.post", response_model=APIResponse)
def welcome_post(
    payload: WelcomeConfig, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.save_welcome(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"config": config})


@router.post("/welcome.preview", response_model=APIResponse)
def welcome_preview(
    payload: WelcomePreviewRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any] | JSONResponse:
    try:
        preview = generate_welcome_preview(payload)
    except ValueError as exc:
        audit_entry = STORE.log_failure(
            ctx,
            "welcome.preview",
            str(exc),
            payload={"mode": payload.config.mode.value},
        )
        return _failure(status.HTTP_400_BAD_REQUEST, str(exc), audit_entry)
    except RuntimeError as exc:
        audit_entry = STORE.log_failure(
            ctx,
            "welcome.preview",
            str(exc),
            payload={"mode": payload.config.mode.value},
        )
        return _failure(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc), audit_entry)

    audit_entry = STORE.log_welcome_preview(ctx, payload.config.mode)
    return _success(
        audit_entry,
        {"preview": preview.model_dump(mode="python")},
    )


@router.post("/guideline.save", response_model=APIResponse)
def guideline_save(
    payload: GuidelineTemplate, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    template, audit_entry = STORE.save_guideline(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"template": template})


@router.post("/guideline.test", response_model=APIResponse)
def guideline_test(
    payload: GuidelineTestRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    preview, audit_entry = STORE.test_guideline(ctx, payload)
    return _success(audit_entry, {"preview": preview})


@router.post("/verify.post", response_model=APIResponse)
def verify_post(
    payload: VerifyConfig, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.save_verify(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"config": config})


@router.post("/verify.remove", response_model=APIResponse)
def verify_remove(ctx: RequestContext = Depends(require_context)) -> Dict[str, Any]:
    audit_entry = STORE.remove_verify(ctx)
    _persist_config(ctx.guild_id)
    return _success(audit_entry)


@router.post("/roles.post", response_model=APIResponse)
def roles_post(
    payload: RolesConfig, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.save_roles(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"config": config})


@router.post("/roles.mapEmoji", response_model=APIResponse)
def roles_map_emoji(
    payload: RoleEmojiMapRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    mapping, audit_entry = STORE.map_role_emoji(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"mapping": mapping})


@router.post("/roles.remove", response_model=APIResponse)
def roles_remove(
    payload: RoleRemovalRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.remove_role(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"config": config})


@router.post("/roles.preview", response_model=APIResponse)
def roles_preview(
    payload: RolesPreviewRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    preview, audit_entry = STORE.preview_roles(ctx, payload)
    return _success(audit_entry, {"preview": preview})


@router.post("/introduce.post", response_model=APIResponse)
def introduce_post(
    payload: IntroduceConfig, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.save_introduce(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"config": config})


@router.post("/introduce.schema.save", response_model=APIResponse)
def introduce_schema_save(
    payload: IntroduceSchema, ctx: RequestContext = Depends(require_context)
) -> JSONResponse | Dict[str, Any]:
    try:
        schema, audit_entry = STORE.save_introduce_schema(ctx, payload)
    except ValueError as exc:  # duplicate field IDs, etc.
        audit_entry = STORE.log_failure(
            ctx,
            "introduce.schema.save",
            str(exc),
            payload=payload.model_dump(mode="python"),
        )
        return _failure(status.HTTP_400_BAD_REQUEST, str(exc), audit_entry)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"schema": schema})


@router.post("/scrims.config.save", response_model=APIResponse)
def scrims_config_save(
    payload: ScrimConfig, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.save_scrim_config(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"config": config})


@router.post("/scrims.run", response_model=APIResponse)
def scrims_run(
    payload: ScrimRunRequest, ctx: RequestContext = Depends(require_context)
) -> JSONResponse | Dict[str, Any]:
    try:
        result, audit_entry = STORE.run_scrim(ctx, payload)
    except ValueError as exc:
        audit_entry = STORE.log_failure(
            ctx,
            "scrims.run",
            str(exc),
            payload={"dry_run": payload.dry_run},
        )
        return _failure(status.HTTP_400_BAD_REQUEST, str(exc), audit_entry)
    return _success(audit_entry, {"result": result})


@router.post("/settings.save", response_model=APIResponse)
def settings_save(
    payload: SettingsPayload, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    settings, audit_entry = STORE.save_settings(ctx, payload)
    _persist_config(ctx.guild_id)
    return _success(audit_entry, {"settings": settings})


@router.post("/rag.config.get", response_model=APIResponse)
def rag_config_get(ctx: RequestContext = Depends(require_context)) -> Dict[str, Any]:
    config, audit_entry = STORE.get_rag_config(ctx)
    return _success(audit_entry, {"config": config})


@router.post("/rag.config.save", response_model=APIResponse)
def rag_config_save(
    payload: RagConfig, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    config, audit_entry = STORE.save_rag_config(ctx, payload)
    _persist_config(ctx.guild_id)
    RAG_BRIDGE.push_config(payload)
    return _success(audit_entry, {"config": config})


@router.post("/rag.knowledge.add", response_model=APIResponse)
def rag_knowledge_add(
    payload: RagKnowledgeEntry, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any] | JSONResponse:
    try:
        path = RAG_BRIDGE.register_knowledge(payload)
    except Exception as exc:  # pragma: no cover - defensive guard
        audit_entry = STORE.log_failure(
            ctx,
            "rag.knowledge.add",
            str(exc),
            payload={"title": payload.title, "tags": payload.tags},
        )
        return _failure(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "ナレッジの登録に失敗しました。",
            audit_entry,
        )

    audit_entry = STORE.log_rag_knowledge_add(ctx, payload, path=str(path))
    return _success(audit_entry, {"path": str(path)})


@router.post("/audit.search", response_model=APIResponse)
def audit_search(
    payload: AuditSearchRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    results, audit_entry = STORE.search_audit(ctx, payload)
    return _success(audit_entry, {"results": results})


@router.post("/audit.export", response_model=APIResponse)
def audit_export(
    payload: AuditExportRequest, ctx: RequestContext = Depends(require_context)
) -> Dict[str, Any]:
    content, audit_entry = STORE.export_audit(ctx, payload)
    data = {"format": payload.format.value, "content": content}
    return _success(audit_entry, data)


@router.post("/state.get", response_model=APIResponse)
def state_get(ctx: RequestContext = Depends(require_context)) -> Dict[str, Any]:
    snapshot, audit_entry = STORE.get_state(ctx)
    return _success(audit_entry, {"state": snapshot})


def create_app() -> FastAPI:
    app = FastAPI(title="Nyaimlab Management API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(  # type: ignore[override]
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        message = "Validation error"
        return _failure(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{message}: {exc}")

    @app.exception_handler(HTTPException)
    async def http_exception_handler(  # type: ignore[override]
        request: Request, exc: HTTPException
    ) -> JSONResponse:
        return _failure(exc.status_code, str(exc.detail))

    @app.get("/healthz")
    async def healthcheck() -> Dict[str, Any]:
        return {"ok": True}

    app.include_router(router)
    return app


app = create_app()
