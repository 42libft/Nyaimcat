import { setTimeout as sleepWithTimeout } from "node:timers/promises";

import { logger } from "../utils/logger";

const DEFAULT_BASE_URL = "https://core-api-prod.escl.workers.dev";
const DEFAULT_TIMEOUT_MS = 10_000;
const CONNECT_PROTOCOL_VERSION = "1";

export type ESCLResponse = {
  statusCode: number | null;
  payload: Record<string, unknown> | null;
  text: string;
  ok: boolean;
};

export class ESCLApiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ESCLApiError";
    if (options?.cause) {
      // @ts-expect-error cause is available in Node 16+
      this.cause = options.cause;
    }
  }
}

export class ESCLConfigError extends ESCLApiError {
  constructor(message: string) {
    super(message);
    this.name = "ESCLConfigError";
  }
}

export class ESCLNetworkError extends ESCLApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ESCLNetworkError";
  }
}

export class ESCLAuthError extends ESCLApiError {
  readonly response: ESCLResponse;

  constructor(message: string, response: ESCLResponse) {
    super(message);
    this.name = "ESCLAuthError";
    this.response = response;
  }
}

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

type ESCLApiClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

const buildHeaders = (jwt: string) => ({
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
  Origin: "https://fightnt.escl.co.jp",
  Referer: "https://fightnt.escl.co.jp/",
  "connect-protocol-version": CONNECT_PROTOCOL_VERSION,
});

const parsePayload = (text: string): Record<string, unknown> | null => {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    logger.debug("ESCL API payload の JSON 変換に失敗しました", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
};

export class ESCLApiClient {
  private readonly tokenProvider: () => string | null | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(
    tokenProvider: () => string | null | undefined,
    options: ESCLApiClientOptions = {}
  ) {
    this.tokenProvider = tokenProvider;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createApplication(params: { scrimId: number; teamId: number }) {
    return this.post("/user.v1.UserApplicationService/CreateApplication", {
      scrimId: params.scrimId,
      teamId: params.teamId,
    });
  }

  async getApplications(params: { scrimId: number }) {
    return this.post("/public.v1.PublicApplicationService/GetApplications", {
      scrimId: params.scrimId,
    });
  }

  async listActiveScrims() {
    return this.post("/public.v1.PublicScrimService/ListActiveScrim", {});
  }

  async getCurrentUser() {
    return this.post("/user.v1.UserService/Me", {});
  }

  private async post(path: string, body: Record<string, unknown>) {
    const jwt = this.tokenProvider();

    if (!jwt) {
      throw new ESCLConfigError("ESCL_JWT が設定されていません。");
    }

    const controller = new AbortController();
    const timeout = sleepWithTimeout(this.timeoutMs).then(() => {
      controller.abort();
    });

    let response: Response;

    try {
      response = await this.fetchImpl(new URL(path, this.baseUrl), {
        method: "POST",
        headers: buildHeaders(jwt),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ESCLNetworkError(
          `ESCL API リクエストが ${this.timeoutMs}ms を超過しました。`,
          { cause: error }
        );
      }

      throw new ESCLNetworkError(
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
    } finally {
      controller.abort();
      await timeout.catch(() => undefined);
    }

    const text = await response.text();
    const payload = parsePayload(text);
    const esclResponse: ESCLResponse = {
      statusCode: response.status ?? null,
      payload,
      text,
      ok: response.ok,
    };

    if (response.status === 401) {
      throw new ESCLAuthError("ESCL API で認証エラーが発生しました。", esclResponse);
    }

    return esclResponse;
  }
}
