import { ApiResponseEnvelope, ApiSuccess, AuthSettings } from './types';

export class ApiError extends Error {
  public readonly status: number;
  public readonly auditId?: string;

  constructor(message: string, status: number, auditId?: string) {
    super(message);
    this.status = status;
    this.auditId = auditId;
  }
}

export class DashboardApi {
  constructor(private readonly auth: AuthSettings) {}

  private buildHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.auth.token}`,
      'x-client': this.auth.clientId,
      'x-guild-id': this.auth.guildId,
    };
    if (this.auth.userId) {
      headers['x-user-id'] = this.auth.userId;
    }
    return headers;
  }

  async post<T>(path: string, body?: unknown): Promise<ApiSuccess<T>> {
    const url = this.auth.apiBaseUrl.replace(/\/$/, '') + path;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: body === undefined ? '{}' : JSON.stringify(body),
    });

    const text = await response.text();
    let payload: ApiResponseEnvelope<T> | null = null;
    try {
      payload = text ? (JSON.parse(text) as ApiResponseEnvelope<T>) : null;
    } catch (error) {
      throw new ApiError(`Invalid JSON response from ${path}`, response.status);
    }

    if (!response.ok || !payload) {
      const message = payload?.error ?? `Request failed with status ${response.status}`;
      throw new ApiError(message, response.status, payload?.audit_id);
    }

    if (!payload.ok) {
      throw new ApiError(payload.error ?? 'Unknown API error', response.status, payload.audit_id);
    }

    return { data: (payload.data ?? ({} as T)) as T, auditId: payload.audit_id };
  }
}
