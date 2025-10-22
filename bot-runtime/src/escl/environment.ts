import path from "node:path";

import { logger } from "../utils/logger";
import { ESCLApiClient } from "./apiClient";
import {
  CredentialStore,
  parseSecretKey,
} from "./credentialStore";
import { EntryJobStore } from "./entryJobStore";
import {
  EntryScheduler,
  type EntryJobAccountContext,
  type EntryJobAuthResolver,
  type EntryJobMetadata,
  type EntryAuthFailureHandler,
} from "./entryScheduler";
import { TeamStore } from "./teamStore";
import {
  AccountManager,
  AccountManagerError,
  type AccountDetails,
  type AccountValidator,
} from "./accountManager";

const TEAM_STORE_PATH = path.resolve(__dirname, "../../..", "data", "team_ids.json");
const ENTRY_JOB_STORE_PATH = path.resolve(
  __dirname,
  "../../..",
  "data",
  "entry_jobs.json"
);
const CREDENTIAL_STORE_PATH = path.resolve(
  __dirname,
  "../../..",
  "data",
  "escl_credentials.enc"
);
const DEFAULT_TIMEZONE = "Asia/Tokyo";

const normalizeOptionalString = (raw: string | null | undefined) => {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseDefaultTeamId = (raw: string | undefined | null) => {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    logger.warn("DEFAULT_TEAM_ID が整数として解釈できませんでした", {
      value: raw,
    });
    return null;
  }

  return parsed;
};

type EsclEnvironmentOptions = {
  teamStore?: TeamStore;
  apiClient?: ESCLApiClient;
  entryJobStore?: EntryJobStore;
  entryScheduler?: EntryScheduler;
  credentialStore?: CredentialStore | null;
  accountManager?: AccountManager | null;
  createApiClient?: (jwt: string) => ESCLApiClient;
  legacyJwt?: string | null;
  timezone?: string;
  secretKey?: string | null;
  defaultTeamId?: number | null;
};

export type ResolvedEntryAccount = {
  teamId: number;
  accountId: string | null;
  accountLabel: string | null;
  accountContext: EntryJobAccountContext | null;
  source: "account" | "legacy";
};

export class EsclEnvironment {
  readonly teamStore: TeamStore;
  readonly apiClient: ESCLApiClient;
  readonly entryJobStore: EntryJobStore;
  readonly entryScheduler: EntryScheduler;
  readonly timezone: string;
  readonly credentialStore: CredentialStore | null;
  readonly accountManager: AccountManager | null;

  private readonly apiClientFactory: (jwt: string) => ESCLApiClient;
  private readonly legacyJwt: string | null;
  private readonly defaultTeamId: number | null;

  constructor(options: EsclEnvironmentOptions = {}) {
    const timezone = options.timezone ?? DEFAULT_TIMEZONE;
    const legacyJwt = normalizeOptionalString(options.legacyJwt ?? process.env.ESCL_JWT);
    const defaultTeamId =
      options.defaultTeamId ?? parseDefaultTeamId(process.env.DEFAULT_TEAM_ID);

    this.timezone = timezone;
    this.legacyJwt = legacyJwt;
    this.defaultTeamId = defaultTeamId;

    this.apiClientFactory =
      options.createApiClient ?? ((jwt: string) => new ESCLApiClient(() => jwt));

    this.teamStore =
      options.teamStore ?? new TeamStore(TEAM_STORE_PATH, defaultTeamId);

    this.entryJobStore = options.entryJobStore ?? new EntryJobStore(ENTRY_JOB_STORE_PATH);

    this.apiClient =
      options.apiClient ?? new ESCLApiClient(() => this.getLegacyJwt());

    this.credentialStore = (() => {
      if (options.credentialStore !== undefined) {
        return options.credentialStore;
      }

      const secretKeyRaw = options.secretKey ?? process.env.ESCL_SECRET_KEY ?? null;
      if (!secretKeyRaw) {
        return null;
      }

      try {
        const parsedKey = parseSecretKey(secretKeyRaw);
        return new CredentialStore(CREDENTIAL_STORE_PATH, parsedKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("CredentialStore の初期化に失敗しました", { message });
        throw error;
      }
    })();

    this.accountManager =
      options.accountManager ??
      (this.credentialStore
        ? new AccountManager({
            store: this.credentialStore,
            validateJwt: this.buildAccountValidator(),
          })
        : null);

    this.entryScheduler =
      options.entryScheduler ??
      new EntryScheduler(this.apiClientFactory, {
        timezone,
        jobStore: this.entryJobStore,
        authProvider: this.buildAuthProvider(),
      });
  }

  async initialize() {
    if (this.credentialStore) {
      try {
        await this.credentialStore.load();
        logger.info("CredentialStore を初期化しました", {
          path: CREDENTIAL_STORE_PATH,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("CredentialStore の読み込みに失敗しました", { message });
        throw error;
      }
    }

    try {
      await this.teamStore.load();
      logger.info("TeamStore を初期化しました", { path: TEAM_STORE_PATH });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("TeamStore の初期化に失敗しました", { message });
      throw error;
    }

    try {
      await this.entryJobStore.load();
      logger.info("EntryJobStore を初期化しました", { path: ENTRY_JOB_STORE_PATH });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("EntryJobStore の初期化に失敗しました", { message });
      throw error;
    }

    try {
      const restored = await this.entryScheduler.restorePersistedJobs();
      if (restored.length > 0) {
        logger.info("永続化された応募ジョブを復元しました", {
          count: restored.length,
          jobIds: restored.map((job) => job.jobId),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("応募ジョブの復元に失敗しました", { message });
      throw error;
    }

    if (this.accountManager) {
      logger.info("ESCL アカウント管理が有効です。", {});
    } else if (!this.legacyJwt) {
      logger.warn("ESCL_JWT が未設定のため、レガシー応募モードを利用できません。", {});
    }
  }

  getLegacyJwt() {
    return this.legacyJwt;
  }

  createApiClient(jwt: string) {
    return this.apiClientFactory(jwt);
  }

  supportsAccountManagement() {
    return this.accountManager !== null;
  }

  async resolveAccountForEntry(params: {
    userId: string;
    accountId?: string | null;
    allowLegacyEnv?: boolean;
    teamIdOverride?: number | null;
  }): Promise<ResolvedEntryAccount> {
    const allowLegacy = params.allowLegacyEnv ?? false;
    const overrideCandidate = params.teamIdOverride ?? null;
    const normalizedOverride =
      typeof overrideCandidate === "number" && Number.isInteger(overrideCandidate) && overrideCandidate > 0
        ? overrideCandidate
        : null;

    if (this.accountManager) {
      if (params.accountId) {
        const account = await this.accountManager.getAccount(params.userId, params.accountId);
        if (!account) {
          throw new AccountManagerError("指定された ESCL アカウントが存在しません。");
        }
        if (normalizedOverride !== null && normalizedOverride !== account.teamId) {
          throw new AccountManagerError(
            "指定された team_id がアカウントに登録されている値と一致しません。"
          );
        }
        return {
          teamId: account.teamId,
          accountId: account.accountId,
          accountLabel: account.label,
          accountContext: this.createAccountContext(params.userId, account),
          source: "account",
        };
      }

      const defaultAccount = await this.accountManager.getDefaultAccount(params.userId);
      if (defaultAccount) {
        if (normalizedOverride !== null && normalizedOverride !== defaultAccount.teamId) {
          throw new AccountManagerError(
            "指定された team_id がアカウントに登録されている値と一致しません。"
          );
        }
        return {
          teamId: defaultAccount.teamId,
          accountId: defaultAccount.accountId,
          accountLabel: defaultAccount.label,
          accountContext: this.createAccountContext(params.userId, defaultAccount),
          source: "account",
        };
      }

      if (!allowLegacy) {
        throw new AccountManagerError(
          "利用可能な ESCL アカウントが見つかりません。`/escl account register` で登録してください。"
        );
      }
    }

    const legacyJwt = this.getLegacyJwt();
    if (!legacyJwt) {
      throw new Error("ESCL_JWT が未設定です。 `.env` を確認してください。");
    }

    const teamIdFromStore = normalizedOverride ?? (await this.teamStore.getTeamId(params.userId));
    if (teamIdFromStore === null) {
      throw new Error(
        "teamId が未登録です。`/set-team` で登録するか、team_id オプションを指定してください。"
      );
    }

    return {
      teamId: teamIdFromStore,
      accountId: null,
      accountLabel: null,
      accountContext: {
        accountId: null,
        accountLabel: null,
        jwtFingerprint: null,
        resolver: async () => ({
          jwt: legacyJwt,
          accountId: null,
          accountLabel: null,
          jwtFingerprint: null,
        }),
      },
      source: "legacy",
    };
  }

  private buildAuthProvider(): (
    metadata: EntryJobMetadata
  ) =>
    Promise<
      | {
          resolver: EntryJobAuthResolver;
          onAuthFailure?: EntryAuthFailureHandler;
        }
      | null
    > {
    return async (metadata: EntryJobMetadata) => {
      if (metadata.accountId) {
        const manager = this.accountManager;
        if (!manager) {
          return null;
        }
        const userId = metadata.createdBy;
        const accountId = metadata.accountId;

        return {
          resolver: async () => {
            const account = await manager.getAccount(userId, accountId);
            if (!account) {
              throw new AccountManagerError("応募に利用する ESCL アカウントが削除されています。");
            }
            return {
              jwt: account.jwt,
              accountId: account.accountId,
              accountLabel: account.label,
              jwtFingerprint: account.jwtFingerprint,
            };
          },
          onAuthFailure: async ({ statusCode, message }) => {
            try {
              await manager.markInvalid({
                userId,
                accountId,
                failureAt: new Date(),
              });
              logger.warn("ESCL アカウントを invalid 状態に更新しました", {
                userId,
                accountId,
                statusCode,
                message,
              });
            } catch (error) {
              const failure = error instanceof Error ? error.message : String(error);
              logger.error("ESCL アカウント invalid 更新に失敗しました", {
                userId,
                accountId,
                message: failure,
              });
            }
          },
        };
      }

      const legacyJwt = this.getLegacyJwt();
      if (!legacyJwt) {
        return null;
      }

      return {
        resolver: async () => ({
          jwt: legacyJwt,
          accountId: null,
          accountLabel: null,
          jwtFingerprint: null,
        }),
      };
    };
  }

  private buildAccountValidator(): AccountValidator {
    return async (jwt: string) => {
      const client = this.apiClientFactory(jwt);
      const response = await client.getCurrentUser();
      if (response.statusCode !== 200) {
        throw new AccountManagerError(
          `UserService/Me が status=${response.statusCode} を返しました。`
        );
      }

      const teamId = EsclEnvironment.extractTeamId(response.payload);
      if (!teamId) {
        throw new AccountManagerError("UserService/Me の応答から teamId を取得できませんでした。");
      }

      return { teamId };
    };
  }

  private createAccountContext(
    userId: string,
    account: AccountDetails
  ): EntryJobAccountContext {
    if (!this.accountManager) {
      throw new Error("accountManager が初期化されていません。");
    }

    return {
      accountId: account.accountId,
      accountLabel: account.label,
      jwtFingerprint: account.jwtFingerprint,
      resolver: async () => {
        const refreshed = await this.accountManager!.getAccount(userId, account.accountId);
        if (!refreshed) {
          throw new AccountManagerError("応募に利用する ESCL アカウントが削除されています。");
        }
        return {
          jwt: refreshed.jwt,
          accountId: refreshed.accountId,
          accountLabel: refreshed.label,
          jwtFingerprint: refreshed.jwtFingerprint,
        };
      },
      onAuthFailure: async ({ statusCode, message }) => {
        try {
          await this.accountManager!.markInvalid({
            userId,
            accountId: account.accountId,
            failureAt: new Date(),
          });
          logger.warn("ESCL アカウントを invalid 状態に更新しました", {
            userId,
            accountId: account.accountId,
            statusCode,
            message,
          });
        } catch (error) {
          const failure = error instanceof Error ? error.message : String(error);
          logger.error("ESCL アカウント invalid 更新に失敗しました", {
            userId,
            accountId: account.accountId,
            message: failure,
          });
        }
      },
    };
  }

  private static extractTeamId(payload: Record<string, unknown> | null | undefined) {
    if (!isPlainObject(payload)) {
      return null;
    }

    const pick = (input: Record<string, unknown>, path: string[]): number | null => {
      let current: unknown = input;
      for (const key of path) {
        if (!isPlainObject(current)) {
          return null;
        }
        current = current[key];
      }

      const numeric = Number(current);
      if (Number.isInteger(numeric) && numeric > 0) {
        return numeric;
      }
      return null;
    };

    const candidates = [
      pick(payload, ["player", "teamId"]),
      pick(payload, ["player", "team", "id"]),
      pick(payload, ["teamId"]),
      pick(payload, ["team_id"]),
      pick(payload, ["team", "id"]),
      pick(payload, ["team", "teamId"]),
    ];

    for (const candidate of candidates) {
      if (candidate && candidate > 0) {
        return candidate;
      }
    }

    return null;
  }
}

export const createEsclEnvironment = () => new EsclEnvironment();
