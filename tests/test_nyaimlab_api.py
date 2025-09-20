"""Smoke tests covering the Nyaimlab management API endpoints."""

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
    assert body["data"]["config"]["channel_id"] == "123"


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


def test_state_snapshot_contains_saved_configuration(
    client: TestClient, auth_headers: Dict[str, str]
) -> None:
    client.post(
        "/api/welcome.post",
        json={"channel_id": "999", "title_template": "Hello"},
        headers=auth_headers,
    )

    snapshot = client.post("/api/state.snapshot", headers=auth_headers)
    assert snapshot.status_code == 200
    body = snapshot.json()
    assert body["ok"] is True
    state = body["data"]["state"]
    assert state["welcome"]["channel_id"] == "999"
    assert isinstance(state.get("audit_recent"), list)
    assert state["audit_recent"]  # ensure at least one audit record is captured
