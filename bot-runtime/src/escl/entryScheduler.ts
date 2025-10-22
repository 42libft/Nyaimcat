import crypto from "node:crypto";

import {
  ESCLApiError,
  ESCLApiClient,
  ESCLAuthError,
  ESCLNetworkError,
  type ESCLResponse,
} from "./apiClient";
import {
  EntryJobStore,
  EntryJobStoreError,
  type EntryJobRecord,
} from "./entryJobStore";
import { logger } from "../utils/logger";

const JST_TIMEZONE = "Asia/Tokyo";
const JST_OFFSET_MINUTES = 9 * 60;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_INTERVAL_MS = 500;
const DEFAULT_RETRY_BACKOFF_AFTER_429_MS = 1_000;

export type DispatchTime = {
  hour: number;
  minute: number;
};

export type EntryJobMetadata = {
  jobId: string;
  scrimId: number;
  teamId: number;
  entryDate: string;
  dispatchTime: DispatchTime | null;
  runAt: Date;
  createdBy: string;
  createdAt: Date;
  accountId: string | null;
  accountLabel: string | null;
  jwtFingerprint: string | null;
};

export type EntryJobAuth = {
  jwt: string;
  accountId: string | null;
  accountLabel: string | null;
  jwtFingerprint: string | null;
};

export type EntryJobAuthResolver = () => Promise<EntryJobAuth | null>;

export type EntryAuthFailureHandler = (details: {
  statusCode: number | null;
  message: string;
}) => Promise<void>;

export type EntryJobAccountContext = {
  accountId: string | null;
  accountLabel: string | null;
  jwtFingerprint: string | null;
  resolver?: EntryJobAuthResolver;
  onAuthFailure?: EntryAuthFailureHandler;
};

type AuthProviderResult = {
  resolver: EntryJobAuthResolver;
  onAuthFailure?: EntryAuthFailureHandler;
};

type AuthProviderFn = (metadata: EntryJobMetadata) => Promise<AuthProviderResult | null>;

type AuthResolution =
  | { ok: true; auth: EntryJobAuth; failureHandler?: EntryAuthFailureHandler }
  | { ok: false; summary: string; detail?: string };

export type EntryJobResult = {
  ok: boolean;
  statusCode: number | null;
  attempts: number;
  summary: string;
  detail: string | null;
  payload: Record<string, unknown> | null;
};

export type LogHook = (message: string) => Promise<void> | void;
export type ResultHook = (result: EntryJobResult) => Promise<void> | void;

export type EntrySchedulerOptions = {
  timezone?: string;
  timezoneOffsetMinutes?: number;
  maxAttempts?: number;
  retryIntervalMs?: number;
  retryBackoffAfter429Ms?: number;
  sleepFn?: (ms: number, signal: AbortSignal) => Promise<void>;
  jobStore?: EntryJobStore;
  authProvider?: AuthProviderFn;
};

const randomJobId = () => crypto.randomBytes(8).toString("hex");

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Operation aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Operation aborted", "AbortError"));
    };

    signal.addEventListener("abort", onAbort);
  });

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const formatPayloadSummary = (payload: Record<string, unknown> | null) => {
  if (!payload) {
    return null;
  }

  for (const key of ["message", "error", "detail", "reason"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  try {
    return JSON.stringify(payload);
  } catch (error) {
    return null;
  }
};

const toUtcTimestamp = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetMinutes: number
) =>
  Date.UTC(year, month - 1, day, hour - offsetMinutes / 60, minute);

const pad = (value: number, digits = 2) => value.toString().padStart(digits, "0");

const extractDateParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = formatter.formatToParts(date);

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: lookup("year"),
    month: lookup("month"),
    day: lookup("day"),
    hour: lookup("hour"),
    minute: lookup("minute"),
    second: lookup("second"),
  };
};

export const formatDateTimeInZone = (date: Date, timeZone: string) => {
  const parts = extractDateParts(date, timeZone);
  const label = timeZone === JST_TIMEZONE ? "JST" : timeZone;
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(
    parts.minute
  )}:${pad(parts.second)} ${label}`;
};

export const computeRunAt = (
  entryDate: string,
  timezone = JST_TIMEZONE,
  dispatchTime?: DispatchTime,
  options: { offsetMinutes?: number } = {}
) => {
  const [yearStr, monthStr, dayStr] = entryDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`無効な日付フォーマットです: ${entryDate}`);
  }

  const hour = dispatchTime?.hour ?? 0;
  const minute = dispatchTime?.minute ?? 0;
  const offsetMinutes = options.offsetMinutes ?? JST_OFFSET_MINUTES;

  const timestamp = toUtcTimestamp(year, month, day, hour, minute, offsetMinutes);
  const runDateUtc = new Date(timestamp - ONE_DAY_MS);
  return new Date(runDateUtc.getTime());
};

export class EntryScheduler {
  private readonly createApiClient: (jwt: string) => ESCLApiClient;
  private readonly timezone: string;
  private readonly timezoneOffsetMinutes: number;
  private readonly maxAttempts: number;
  private readonly retryIntervalMs: number;
  private readonly retryBackoffAfter429Ms: number;
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly metadata = new Map<string, EntryJobMetadata>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly jobStore: EntryJobStore | undefined;
  private readonly authProvider: AuthProviderFn | undefined;
  private readonly authResolvers = new Map<
    string,
    {
      resolver: EntryJobAuthResolver;
      onAuthFailure?: EntryAuthFailureHandler;
    }
  >();
  private shuttingDown = false;

  constructor(
    createApiClient: (jwt: string) => ESCLApiClient,
    options: EntrySchedulerOptions = {}
  ) {
    this.createApiClient = createApiClient;
    this.timezone = options.timezone ?? JST_TIMEZONE;
    this.timezoneOffsetMinutes =
      options.timezoneOffsetMinutes ?? JST_OFFSET_MINUTES;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
    this.retryBackoffAfter429Ms =
      options.retryBackoffAfter429Ms ?? DEFAULT_RETRY_BACKOFF_AFTER_429_MS;
    this.sleep = options.sleepFn ?? defaultSleep;
    this.jobStore = options.jobStore;
    this.authProvider = options.authProvider;
  }

  async shutdown() {
    this.shuttingDown = true;

    try {
      for (const controller of this.controllers.values()) {
        controller.abort();
      }

      await Promise.allSettled(this.jobs.values());
    } finally {
      this.jobs.clear();
      this.metadata.clear();
      this.controllers.clear();
      this.authResolvers.clear();
      this.shuttingDown = false;
    }
  }

  async scheduleEntry(options: {
    userId: string;
    scrimId: number;
    teamId: number;
    entryDate: string;
    dispatchTime?: DispatchTime;
    logHook: LogHook;
    resultHook?: ResultHook;
    jobId?: string;
    now?: Date;
    accountContext?: EntryJobAccountContext;
  }) {
    const runAt = computeRunAt(options.entryDate, this.timezone, options.dispatchTime, {
      offsetMinutes: this.timezoneOffsetMinutes,
    });
    const now = options.now ?? new Date();
    const jobId = options.jobId ?? randomJobId();
    const dispatchTime = options.dispatchTime ?? null;
    const accountContext = options.accountContext ?? null;

    const metadata: EntryJobMetadata = {
      jobId,
      scrimId: options.scrimId,
      teamId: options.teamId,
      entryDate: options.entryDate,
      dispatchTime,
      runAt,
      createdBy: options.userId,
      createdAt: now,
      accountId: accountContext?.accountId ?? null,
      accountLabel: accountContext?.accountLabel ?? null,
      jwtFingerprint: accountContext?.jwtFingerprint ?? null,
    };

    const registerOptions: {
      logHook: LogHook;
      resultHook?: ResultHook;
      now: Date;
      persist: boolean;
    } = {
      logHook: options.logHook,
      now,
      persist: true,
    };

    if (options.resultHook) {
      registerOptions.resultHook = options.resultHook;
    }

    if (accountContext?.resolver) {
      const resolverEntry = {
        resolver: accountContext.resolver,
        ...(accountContext.onAuthFailure
          ? { onAuthFailure: accountContext.onAuthFailure }
          : {}),
      };
      this.authResolvers.set(jobId, resolverEntry);
    }

    await this.registerJob(metadata, registerOptions);

    return metadata;
  }

  async restorePersistedJobs(options?: {
    createHooks?: (metadata: EntryJobMetadata) => {
      logHook: LogHook;
      resultHook?: ResultHook;
    };
    now?: Date;
  }) {
    if (!this.jobStore) {
      return [];
    }

    const records = await this.jobStore.list();
    if (records.length === 0) {
      return [];
    }

    const createHooks =
      options?.createHooks ??
      ((metadata: EntryJobMetadata) => ({
        logHook: (message: string) => {
          logger.info("復元した応募ジョブの進捗", {
            jobId: metadata.jobId,
            message,
          });
        },
        resultHook: (result: EntryJobResult) => {
          logger.info("復元した応募ジョブが完了しました", {
            jobId: metadata.jobId,
            ok: result.ok,
            statusCode: result.statusCode,
            summary: result.summary,
          });
        },
      }));

    const restored: EntryJobMetadata[] = [];
    for (const record of records) {
      const metadata = this.metadataFromRecord(record);

      if (this.metadata.has(metadata.jobId)) {
        continue;
      }

      try {
        const hooks = createHooks(metadata);
        const now = options?.now ?? new Date();
        const registerOptions: {
          logHook: LogHook;
          resultHook?: ResultHook;
          now: Date;
          persist: boolean;
        } = {
          logHook: hooks.logHook,
          now,
          persist: false,
        };

        if (hooks.resultHook) {
          registerOptions.resultHook = hooks.resultHook;
        }

        await this.registerJob(metadata, registerOptions);

        restored.push(metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("応募ジョブの復元に失敗しました", {
          jobId: record.jobId,
          message,
        });
      }
    }

    return restored;
  }

  async runEntryImmediately(options: {
    userId: string;
    scrimId: number;
    teamId: number;
    entryDate: string;
    logHook: LogHook;
    resultHook?: ResultHook;
    now?: Date;
    accountContext?: EntryJobAccountContext;
  }) {
    const now = options.now ?? new Date();
    const accountContext = options.accountContext ?? null;
    const metadata: EntryJobMetadata = {
      jobId: `now-${randomJobId()}`,
      scrimId: options.scrimId,
      teamId: options.teamId,
      entryDate: options.entryDate,
      dispatchTime: null,
      runAt: now,
      createdBy: options.userId,
      createdAt: now,
      accountId: accountContext?.accountId ?? null,
      accountLabel: accountContext?.accountLabel ?? null,
      jwtFingerprint: accountContext?.jwtFingerprint ?? null,
    };

    await options.logHook(
      `応募を即時送信します: scrim_id=${metadata.scrimId}, team_id=${metadata.teamId}, リトライなし`
    );

    if (accountContext?.resolver) {
      const resolverEntry = {
        resolver: accountContext.resolver,
        ...(accountContext.onAuthFailure
          ? { onAuthFailure: accountContext.onAuthFailure }
          : {}),
      };
      this.authResolvers.set(metadata.jobId, resolverEntry);
    }

    const authResolution = await this.resolveAuth(metadata, options.logHook);

    let result: EntryJobResult;

    if (!authResolution.ok) {
      result = this.buildAuthFailureResult(authResolution.summary, authResolution.detail);
    } else {
      result = await this.executeAttempts(metadata, {
        logHook: options.logHook,
        signal: new AbortController().signal,
        maxAttempts: 1,
        auth: authResolution.auth,
        ...(authResolution.failureHandler
          ? { onAuthFailure: authResolution.failureHandler }
          : {}),
      });
    }

    await options.resultHook?.(result);
    this.authResolvers.delete(metadata.jobId);
    return result;
  }

  async getMetadata(jobId: string) {
    return this.metadata.get(jobId);
  }

  private async registerJob(
    metadata: EntryJobMetadata,
    options: {
      logHook: LogHook;
      resultHook?: ResultHook;
      now: Date;
      persist: boolean;
    }
  ) {
    if (this.jobs.has(metadata.jobId)) {
      throw new Error(`応募ジョブ ${metadata.jobId} は既に登録されています。`);
    }

    if (options.persist && this.jobStore) {
      await this.jobStore.save(this.recordFromMetadata(metadata));
    }

    const controller = new AbortController();
    this.controllers.set(metadata.jobId, controller);
    this.metadata.set(metadata.jobId, metadata);

    const job = this.runJob(metadata, {
      logHook: options.logHook,
      ...(options.resultHook ? { resultHook: options.resultHook } : {}),
      now: options.now,
      signal: controller.signal,
    }).finally(async () => {
      this.metadata.delete(metadata.jobId);
      this.controllers.delete(metadata.jobId);
      this.jobs.delete(metadata.jobId);
      this.authResolvers.delete(metadata.jobId);

      if (this.jobStore && !this.shuttingDown) {
        try {
          await this.jobStore.remove(metadata.jobId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const cause =
            error instanceof EntryJobStoreError && "cause" in error
              ? (error as EntryJobStoreError & { cause?: unknown }).cause
              : undefined;
          logger.error("応募ジョブの永続化削除に失敗しました", {
            jobId: metadata.jobId,
            message,
            ...(cause
              ? {
                  cause:
                    cause instanceof Error ? cause.message : String(cause),
                }
              : {}),
          });
        }
      }
    });

    this.jobs.set(metadata.jobId, job);
  }

  private recordFromMetadata(metadata: EntryJobMetadata): EntryJobRecord {
    return {
      jobId: metadata.jobId,
      scrimId: metadata.scrimId,
      teamId: metadata.teamId,
      entryDate: metadata.entryDate,
      dispatchTime: metadata.dispatchTime,
      runAt: metadata.runAt.toISOString(),
      createdBy: metadata.createdBy,
      createdAt: metadata.createdAt.toISOString(),
      accountId: metadata.accountId,
      jwtFingerprint: metadata.jwtFingerprint,
    };
  }

  private metadataFromRecord(record: EntryJobRecord): EntryJobMetadata {
    return {
      jobId: record.jobId,
      scrimId: record.scrimId,
      teamId: record.teamId,
      entryDate: record.entryDate,
      dispatchTime: record.dispatchTime
        ? { hour: record.dispatchTime.hour, minute: record.dispatchTime.minute }
        : null,
      runAt: new Date(record.runAt),
      createdBy: record.createdBy,
      createdAt: new Date(record.createdAt),
      accountId: record.accountId ?? null,
      accountLabel: null,
      jwtFingerprint: record.jwtFingerprint ?? null,
    };
  }

  private buildAuthFailureResult(summary: string, detail?: string | null): EntryJobResult {
    return {
      ok: false,
      statusCode: null,
      attempts: 0,
      summary,
      detail: detail ?? null,
      payload: null,
    };
  }

  private async resolveAuth(
    metadata: EntryJobMetadata,
    logHook: LogHook
  ): Promise<AuthResolution> {
    const entry = this.authResolvers.get(metadata.jobId);
    let resolver = entry?.resolver;
    let failureHandler = entry?.onAuthFailure;

    if (!resolver && this.authProvider) {
      try {
        const provided = await this.authProvider(metadata);
        if (provided) {
          const entryValue = {
            resolver: provided.resolver,
            ...(provided.onAuthFailure
              ? { onAuthFailure: provided.onAuthFailure }
              : {}),
          };
          this.authResolvers.set(metadata.jobId, entryValue);
          resolver = provided.resolver;
          failureHandler = provided.onAuthFailure;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await logHook(`応募資格情報の準備に失敗しました: ${message}`);
        return {
          ok: false,
          summary: "応募資格情報の準備に失敗しました。",
          detail: message,
        };
      }
    }

    if (!resolver) {
      await logHook("応募に必要な資格情報が見つかりませんでした。");
      return {
        ok: false,
        summary: "応募に必要な資格情報が見つかりませんでした。",
      };
    }

    try {
      const auth = await resolver();
      if (!auth) {
        await logHook("応募資格情報の取得に失敗しました。");
        return {
          ok: false,
          summary: "応募資格情報の取得に失敗しました。",
        };
      }

      if (auth.accountLabel !== undefined && auth.accountLabel !== null) {
        metadata.accountLabel = auth.accountLabel;
      }

      if (
        metadata.jwtFingerprint &&
        auth.jwtFingerprint &&
        metadata.jwtFingerprint !== auth.jwtFingerprint
      ) {
        const detail = `expected=${metadata.jwtFingerprint}, actual=${auth.jwtFingerprint}`;
        await logHook("登録時と異なる資格情報が検出されたため応募を中断しました。");
        return {
          ok: false,
          summary: "登録時と異なる資格情報が検出されたため応募を中断しました。",
          detail,
        };
      }

      return {
        ok: true,
        auth,
        ...(failureHandler ? { failureHandler } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logHook(`応募資格情報の解決に失敗しました: ${message}`);
      return {
        ok: false,
        summary: "応募資格情報の解決に失敗しました。",
        detail: message,
      };
    }
  }

  private async runJob(
    metadata: EntryJobMetadata,
    options: {
      logHook: LogHook;
      resultHook?: ResultHook;
      now: Date;
      signal: AbortSignal;
    }
  ) {
    try {
      await this.awaitUntil(metadata.runAt, options.now, options.logHook, options.signal);
      const authResolution = await this.resolveAuth(metadata, options.logHook);

      if (!authResolution.ok) {
        const failure = this.buildAuthFailureResult(
          authResolution.summary,
          authResolution.detail ?? null
        );
        if (options.resultHook) {
          await options.resultHook(failure);
        }
        return;
      }

      const auth = authResolution.auth;
      const accountInfo =
        auth.accountLabel ?? auth.accountId
          ? `, account=${auth.accountLabel ?? auth.accountId}`
          : "";

      await options.logHook(
        `応募送信を開始します: scrim_id=${metadata.scrimId}, team_id=${metadata.teamId}, 最大試行 ${this.maxAttempts} 回${accountInfo}`
      );

      const result = await this.executeAttempts(metadata, {
        logHook: options.logHook,
        signal: options.signal,
        maxAttempts: this.maxAttempts,
        auth,
        ...(authResolution.failureHandler
          ? { onAuthFailure: authResolution.failureHandler }
          : {}),
      });

      if (options.resultHook) {
        await options.resultHook(result);
      }
    } catch (error) {
      if (isAbortError(error)) {
        await options.logHook("応募ジョブがキャンセルされました。");
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      await options.logHook(`応募ジョブで想定外のエラーが発生しました: ${message}`);

      if (options.resultHook) {
        await options.resultHook({
          ok: false,
          statusCode: null,
          attempts: 0,
          summary: "内部エラーが発生しました。",
          detail: message,
          payload: null,
        });
      }
    }
  }

  private async awaitUntil(
    target: Date,
    now: Date,
    logHook: LogHook,
    signal: AbortSignal
  ) {
    const delay = target.getTime() - now.getTime();
    if (delay <= 0) {
      await logHook("予定時刻を過ぎているため即時送信を試みます。");
      return;
    }

    const hours = Math.floor(delay / 3_600_000);
    const minutes = Math.floor((delay % 3_600_000) / 60_000);
    const seconds = Math.floor((delay % 60_000) / 1_000);

    await logHook(
      `応募実行まで ${hours}時間 ${minutes}分 ${seconds}秒 待機します。`
    );

    await this.sleep(delay, signal);
  }

  private async executeAttempts(
    metadata: EntryJobMetadata,
    options: {
      logHook: LogHook;
      signal: AbortSignal;
      maxAttempts: number;
      auth: EntryJobAuth;
      onAuthFailure?: EntryAuthFailureHandler;
    }
  ): Promise<EntryJobResult> {
    let lastStatus: number | null = null;
    let lastDetail: string | null = null;
    let lastPayload: Record<string, unknown> | null = null;
    const apiClient = this.createApiClient(options.auth.jwt);

    const notifyAuthFailure = async (status: number | null, message: string) => {
      if (!options.onAuthFailure) {
        return;
      }

      try {
        await options.onAuthFailure({ statusCode: status, message });
      } catch (error) {
        const failureMessage = error instanceof Error ? error.message : String(error);
        logger.warn("アカウントの失効処理に失敗しました", {
          jobId: metadata.jobId,
          message: failureMessage,
        });
      }
    };

    for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
      if (options.signal.aborted) {
        throw new DOMException("Operation aborted", "AbortError");
      }

      try {
        const response = await apiClient.createApplication({
          scrimId: metadata.scrimId,
          teamId: metadata.teamId,
        });

        lastStatus = response.statusCode;
        lastPayload = response.payload;
        lastDetail = formatPayloadSummary(response.payload);

        const result = this.buildResultFromResponse(response, attempt);
        if (result.ok) {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] 成功しました (status=${response.statusCode ?? "不明"}).`
          );
          return result;
        }

        const status = response.statusCode ?? "不明";
        if (response.statusCode === 409) {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] 既に応募済みです (status=${status}).`
          );
          return {
            ...result,
            ok: true,
            summary: "既に応募済みでした。",
          };
        }

        if (response.statusCode === 401) {
          await notifyAuthFailure(response.statusCode, response.text);
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] 認証エラー (status=401)。JWT を更新してください。`
          );
          return {
            ...result,
            ok: false,
            summary: "ESCL API の認証に失敗しました。",
            detail: result.detail ?? response.text,
          };
        }

        if (response.statusCode === 422) {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] 受付開始前または終了後の可能性があります (status=422)。`
          );
        } else if (response.statusCode === 429) {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] レート制限 (status=429)。追加で ${(this.retryBackoffAfter429Ms / 1000).toFixed(
              1
            )} 秒待機します。`
          );
          if (attempt !== options.maxAttempts) {
            await this.sleep(this.retryBackoffAfter429Ms, options.signal);
          }
        } else {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] 応答 status=${status}。引き続きリトライします。`
          );
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        if (error instanceof ESCLAuthError) {
          const payload = error.response.payload;
          await notifyAuthFailure(error.response.statusCode ?? 401, error.response.text);
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] 認証エラーが発生しました。`
          );
          return {
            ok: false,
            statusCode: error.response.statusCode,
            attempts: attempt,
            summary: "ESCL API 認証エラー: JWT を再設定してください。",
            detail: formatPayloadSummary(payload) ?? error.response.text,
            payload,
          };
        }

        if (error instanceof ESCLNetworkError) {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] ネットワークエラー: ${error.message}`
          );
          lastStatus = null;
          lastDetail = error.message;
          lastPayload = null;
        } else if (error instanceof ESCLApiError) {
          await options.logHook(
            `[${attempt}/${options.maxAttempts}] APIエラー: ${error.message}`
          );
          lastStatus = null;
          lastDetail = error.message;
          lastPayload = null;
        } else {
          throw error;
        }
      }

      if (attempt !== options.maxAttempts) {
        await this.sleep(this.retryIntervalMs, options.signal);
      }
    }

    let summary = "応募が成功しませんでした。";
    if (lastStatus === 422) {
      summary = "受付開始前のまま規定の試行回数を超過しました。";
    } else if (lastStatus === 429) {
      summary = "レート制限を回避できませんでした。";
    }

    return {
      ok: false,
      statusCode: lastStatus,
      attempts: options.maxAttempts,
      summary,
      detail: lastDetail,
      payload: lastPayload,
    };
  }

  private buildResultFromResponse(
    response: ESCLResponse,
    attempts: number
  ): EntryJobResult {
    const payload = response.payload ?? null;
    const detail = formatPayloadSummary(payload);
    const status = response.statusCode;
    const ok = status !== null && status >= 200 && status < 300;

    return {
      ok,
      statusCode: status,
      attempts,
      summary: ok ? "ESCL への応募が完了しました。" : "応募が成功しませんでした。",
      detail,
      payload,
    };
  }
}
