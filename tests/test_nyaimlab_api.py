from __future__ import annotations

"""Smoke tests for the Nyaimlab management API."""

from pathlib import Path
from typing import Dict

import pytest
from fastapi.testclient import TestClient

from src.nyaimlab import create_app


@pytest.fixture(autouse=True)
def _set_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_AUTH_TOKEN", "secret-token")


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


@pytest.fixture
def auth_headers() -> Dict[str, str]:
    return {
        "Authorization": "Bearer secret-token",
        "x-client": "pytest",
        "x-guild-id": "guild-123",
        "x-user-id": "user-456",
    }


def test_welcome_configuration(client: TestClient, auth_headers: Dict[str, str]) -> None:
    resp = client.post(
        "/api/welcome.post",
        json={"channel_id": "123"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "audit_id" in body
    config = body["data"]["config"]
    assert config["channel_id"] == "123"
    assert config["mode"] == "embed"
    assert config["message_template"] == "{{mention}}"


def test_welcome_preview_embed(client: TestClient, auth_headers: Dict[str, str]) -> None:
    resp = client.post(
        "/api/welcome.preview",
        json={"config": {"channel_id": "321"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    preview = body["data"]["preview"]
    assert preview["mode"] == "embed"
    assert preview["embed"]["title"]
    assert preview["embed"]["description"]


def test_guideline_template_roundtrip(client: TestClient, auth_headers: Dict[str, str]) -> None:
    save_resp = client.post(
        "/api/guideline.save",
        json={"content": "Welcome", "attachments": []},
        headers=auth_headers,
    )
    assert save_resp.json()["ok"] is True

    test_resp = client.post(
        "/api/guideline.test",
        json={},
        headers=auth_headers,
    )
    body = test_resp.json()
    assert body["ok"] is True
    assert body["data"]["preview"]["content"] == "Welcome"


def test_introduce_schema_duplicate_error(client: TestClient, auth_headers: Dict[str, str]) -> None:
    resp = client.post(
        "/api/introduce.schema.save",
        json={
            "fields": [
                {"field_id": "name", "label": "Name"},
                {"field_id": "name", "label": "Duplicate"},
            ]
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
    body = resp.json()
    assert body["ok"] is False
    assert "audit_id" in body
    assert "Duplicate field_id" in body["error"]


def test_state_snapshot(client: TestClient, auth_headers: Dict[str, str]) -> None:
    client.post(
        "/api/welcome.post",
        json={"channel_id": "999", "buttons": []},
        headers=auth_headers,
    )
    client.post(
        "/api/roles.post",
        json={"channel_id": "888", "style": "buttons", "roles": []},
        headers=auth_headers,
    )

    resp = client.post(
        "/api/state.get",
        json={},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "audit_id" in body
    state = body["data"]["state"]
    assert state["welcome"]["channel_id"] == "999"
    assert state["roles"]["channel_id"] == "888"
    assert state["role_emoji_map"] == {}
    assert state["introduce_schema"] == {"fields": []}


def test_rag_config_lifecycle(
    client: TestClient, auth_headers: Dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("RAG_SERVICE_BASE_URL", "")

    get_resp = client.post("/api/rag.config.get", headers=auth_headers)
    assert get_resp.status_code == 200
    body = get_resp.json()
    assert body["ok"] is True
    config = body["data"]["config"]
    assert config["prompts"]["base"]
    assert config["short_term"]["excluded_channels"] == []

    config["short_term"]["excluded_channels"] = ["123456789012345678"]
    config["feelings"]["probability"] = 0.4

    save_resp = client.post(
        "/api/rag.config.save",
        json=config,
        headers=auth_headers,
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["ok"] is True

    confirm_resp = client.post("/api/rag.config.get", headers=auth_headers)
    saved = confirm_resp.json()["data"]["config"]
    assert saved["short_term"]["excluded_channels"] == ["123456789012345678"]
    assert saved["feelings"]["probability"] == 0.4


def test_rag_knowledge_add_creates_file(
    client: TestClient,
    auth_headers: Dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("RAG_SERVICE_BASE_URL", "")
    monkeypatch.setenv("RAG_KNOWLEDGE_OUTPUT_DIR", str(tmp_path))

    resp = client.post(
        "/api/rag.knowledge.add",
        json={"title": "Test Knowledge", "content": "Hello", "tags": ["tips"]},
        headers=auth_headers,
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    saved_path = Path(body["data"]["path"])
    assert saved_path.exists()
    text = saved_path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    assert "Test Knowledge" in text
