from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional

import httpx

__all__ = [
    "ESCLApiClient",
    "ESCLAPIError",
    "ESCLAuthError",
    "ESCLConfigError",
    "ESCLNetworkError",
    "ESCLResponse",
]


BASE_URL = "https://core-api-prod.escl.workers.dev"
CONNECT_PROTOCOL_VERSION = "1"


class ESCLAPIError(Exception):
    """Base error for ESCL API failures."""


class ESCLConfigError(ESCLAPIError):
    """Raised when mandatory configuration (JWTなど) が不足している。"""


class ESCLNetworkError(ESCLAPIError):
    """Raised when httpx 側で接続障害が発生した場合。"""


@dataclass(slots=True)
class ESCLResponse:
    status_code: Optional[int]
    payload: Optional[Dict[str, Any]]
    text: str

    @property
    def ok(self) -> bool:
        return self.status_code is not None and 200 <= self.status_code < 300


class ESCLAuthError(ESCLAPIError):
    """Raised when ESCL API returns 401 系の認証エラー。"""

    def __init__(self, message: str, response: ESCLResponse) -> None:
        super().__init__(message)
        self.response = response


def _build_headers(jwt: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
        "Origin": "https://fightnt.escl.co.jp",
        "Referer": "https://fightnt.escl.co.jp/",
        "connect-protocol-version": CONNECT_PROTOCOL_VERSION,
    }


class ESCLApiClient:
    """
    非同期 ESCL API クライアント。

    token_provider は常に最新の JWT を返す Callable を想定。
    """

    def __init__(
        self,
        token_provider: Callable[[], Optional[str]],
        *,
        request_timeout: float = 10.0,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._token_provider = token_provider
        self._client = client or httpx.AsyncClient(base_url=BASE_URL, timeout=request_timeout)
        self._owns_client = client is None

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def create_application(self, *, scrim_id: int, team_id: int) -> ESCLResponse:
        payload = {"scrimId": scrim_id, "teamId": team_id}
        return await self._post(
            "/user.v1.UserApplicationService/CreateApplication",
            payload,
        )

    async def get_applications(self, *, scrim_id: int) -> ESCLResponse:
        payload = {"scrimId": scrim_id}
        return await self._post(
            "/public.v1.PublicApplicationService/GetApplications",
            payload,
        )

    async def list_active_scrims(self) -> ESCLResponse:
        return await self._post(
            "/public.v1.PublicScrimService/ListActiveScrim",
            {},
        )

    async def _post(self, path: str, json_payload: Dict[str, Any]) -> ESCLResponse:
        jwt = self._token_provider()
        if not jwt:
            raise ESCLConfigError("ESCL_JWT が設定されていません。")

        headers = _build_headers(jwt)

        try:
            response = await self._client.post(path, json=json_payload, headers=headers)
        except httpx.RequestError as exc:
            raise ESCLNetworkError(str(exc)) from exc

        text = response.text
        payload: Optional[Dict[str, Any]]
        try:
            payload = response.json()
        except ValueError:
            payload = None

        escl_response = ESCLResponse(status_code=response.status_code, payload=payload, text=text)

        if response.status_code == 401:
            raise ESCLAuthError("ESCL API で認証エラーが発生しました。", escl_response)

        return escl_response
