import crypto from "node:crypto";

import {
  CredentialStore,
  CredentialStoreError,
  type CredentialStoreState,
  type CredentialAccountRecord,
} from "./credentialStore";

export class AccountManagerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "AccountManagerError";
    if (options?.cause) {
      // @ts-expect-error Node.js 16+ supports `cause`
      this.cause = options.cause;
    }
  }
}

export type AccountStatus = CredentialAccountRecord["status"];

export type AccountSummary = {
  accountId: string;
  label: string | null;
  teamId: number;
  status: AccountStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  lastFailureAt: string | null;
  jwtFingerprint: string;
};

export type AccountDetails = AccountSummary & {
  jwt: string;
};

export type AccountValidationResult = {
  teamId: number;
  playerId?: number | null;
};

export type AccountValidator = (jwt: string) => Promise<AccountValidationResult>;

export type AccountManagerOptions = {
  store: CredentialStore;
  validateJwt: AccountValidator;
  clock?: () => Date;
  idGenerator?: () => string;
};

const normalizeUserId = (userId: string) => String(userId);

const normalizeLabel = (label: string | null | undefined) => {
  if (label === null || label === undefined) {
    return null;
  }

  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const fingerprintJwt = (jwt: string) =>
  crypto.createHash("sha256").update(jwt, "utf-8").digest("base64");

const ensureUserRecord = (
  state: CredentialStoreState,
  userId: string
): CredentialStoreState["accounts"][string] => {
  const id = normalizeUserId(userId);

  if (!state.accounts[id]) {
    state.accounts[id] = {
      defaultAccountId: null,
      accounts: {},
    };
  }

  return state.accounts[id];
};

const sortAccountsByCreatedAt = (entries: Array<[string, CredentialAccountRecord]>) =>
  [...entries].sort((a, b) => {
    if (a[1].createdAt < b[1].createdAt) {
      return -1;
    }
    if (a[1].createdAt > b[1].createdAt) {
      return 1;
    }
    return a[0].localeCompare(b[0]);
  });

export class AccountManager {
  private readonly store: CredentialStore;
  private readonly validateJwt: AccountValidator;
  private readonly clock: () => Date;
  private readonly idGenerator: () => string;

  constructor(options: AccountManagerOptions) {
    this.store = options.store;
    this.validateJwt = options.validateJwt;
    this.clock = options.clock ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => crypto.randomUUID());
  }

  async listAccounts(userId: string): Promise<{
    defaultAccountId: string | null;
    accounts: AccountSummary[];
  }> {
    const state = await this.store.getState();
    const record = state.accounts[normalizeUserId(userId)];
    if (!record) {
      return { defaultAccountId: null, accounts: [] };
    }

    const sorted = sortAccountsByCreatedAt(Object.entries(record.accounts));
    const accounts = sorted.map(([accountId, account]) => ({
      accountId,
      label: account.label,
      teamId: account.teamId,
      status: account.status,
      isDefault: record.defaultAccountId === accountId,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastVerifiedAt: account.lastVerifiedAt,
      lastFailureAt: account.lastFailureAt,
      jwtFingerprint: account.jwtFingerprint,
    }));

    return {
      defaultAccountId: record.defaultAccountId,
      accounts,
    };
  }

  async getAccount(userId: string, accountId: string): Promise<AccountDetails | null> {
    const state = await this.store.getState();
    const record = state.accounts[normalizeUserId(userId)];
    if (!record) {
      return null;
    }

    const account = record.accounts[accountId];
    if (!account) {
      return null;
    }

    return {
      accountId,
      label: account.label,
      teamId: account.teamId,
      status: account.status,
      isDefault: record.defaultAccountId === accountId,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastVerifiedAt: account.lastVerifiedAt,
      lastFailureAt: account.lastFailureAt,
      jwtFingerprint: account.jwtFingerprint,
      jwt: account.jwt,
    };
  }

  async getDefaultAccount(userId: string): Promise<AccountDetails | null> {
    const state = await this.store.getState();
    const record = state.accounts[normalizeUserId(userId)];
    if (!record || !record.defaultAccountId) {
      return null;
    }

    const account = record.accounts[record.defaultAccountId];
    if (!account) {
      return null;
    }

    return {
      accountId: record.defaultAccountId,
      label: account.label,
      teamId: account.teamId,
      status: account.status,
      isDefault: true,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      lastVerifiedAt: account.lastVerifiedAt,
      lastFailureAt: account.lastFailureAt,
      jwtFingerprint: account.jwtFingerprint,
      jwt: account.jwt,
    };
  }

  async registerAccount(options: {
    userId: string;
    jwt: string;
    teamId: number;
    label?: string | null;
  }): Promise<{ account: AccountDetails; isDefault: boolean }> {
    const jwt = options.jwt.trim();
    if (!jwt) {
      throw new AccountManagerError("JWT が空です。");
    }

    if (!Number.isInteger(options.teamId) || options.teamId <= 0) {
      throw new AccountManagerError("teamId は正の整数である必要があります。");
    }

    let validation: AccountValidationResult;
    try {
      validation = await this.validateJwt(jwt);
    } catch (error) {
      if (error instanceof CredentialStoreError || error instanceof AccountManagerError) {
        throw error;
      }

      throw new AccountManagerError("JWT の検証に失敗しました。", { cause: error });
    }

    if (!Number.isInteger(validation.teamId) || validation.teamId <= 0) {
      throw new AccountManagerError("検証結果の teamId が不正です。");
    }

    if (validation.teamId !== options.teamId) {
      throw new AccountManagerError(
        `入力された teamId (${options.teamId}) と JWT の teamId (${validation.teamId}) が一致しません。`
      );
    }

    const now = this.clock().toISOString();
    const accountId = this.idGenerator();
    const fingerprint = fingerprintJwt(jwt);
    const label = normalizeLabel(options.label);

    const record: CredentialAccountRecord = {
      label,
      teamId: options.teamId,
      jwt,
      jwtFingerprint: fingerprint,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastVerifiedAt: now,
      lastFailureAt: null,
    };

    const normalizedUserId = normalizeUserId(options.userId);
    let isDefault = false;

    await this.store.updateState((state) => {
      const userRecord = ensureUserRecord(state, normalizedUserId);
      userRecord.accounts[accountId] = record;

      if (!userRecord.defaultAccountId) {
        userRecord.defaultAccountId = accountId;
        isDefault = true;
      }
    });

    return {
      account: {
        accountId,
        label: record.label,
        teamId: record.teamId,
        status: record.status,
        isDefault,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastVerifiedAt: record.lastVerifiedAt,
        lastFailureAt: record.lastFailureAt,
        jwtFingerprint: record.jwtFingerprint,
        jwt: record.jwt,
      },
      isDefault,
    };
  }

  async removeAccount(options: {
    userId: string;
    accountId: string;
  }): Promise<{ removed: boolean; remainingAccounts: number }> {
    const normalizedUserId = normalizeUserId(options.userId);
    let removed = false;
    let remaining = 0;

    await this.store.updateState((state) => {
      const userRecord = state.accounts[normalizedUserId];
      if (!userRecord || !userRecord.accounts[options.accountId]) {
        return;
      }

      delete userRecord.accounts[options.accountId];
      removed = true;

      const entries = sortAccountsByCreatedAt(Object.entries(userRecord.accounts));
      remaining = entries.length;

      const firstEntry = entries[0];
      const nextDefault = firstEntry ? firstEntry[0] : null;

      if (!nextDefault) {
        delete state.accounts[normalizedUserId];
        return;
      }

      if (userRecord.defaultAccountId === options.accountId) {
        userRecord.defaultAccountId = nextDefault;
      }
    });

    return { removed, remainingAccounts: remaining };
  }

  async setDefaultAccount(options: { userId: string; accountId: string }) {
    const normalizedUserId = normalizeUserId(options.userId);

    let updated = false;

    await this.store.updateState((state) => {
      const userRecord = state.accounts[normalizedUserId];
      if (!userRecord) {
        return;
      }

      if (!userRecord.accounts[options.accountId]) {
        return;
      }

      userRecord.defaultAccountId = options.accountId;
      updated = true;
    });

    if (!updated) {
      throw new AccountManagerError("指定されたアカウントが存在しません。");
    }
  }

  async markInvalid(options: {
    userId: string;
    accountId: string;
    failureAt?: Date;
  }) {
    const normalizedUserId = normalizeUserId(options.userId);
    const failureAt = (options.failureAt ?? this.clock()).toISOString();

    await this.store.updateState((state) => {
      const userRecord = state.accounts[normalizedUserId];
      if (!userRecord) {
        return;
      }

      const account = userRecord.accounts[options.accountId];
      if (!account) {
        return;
      }

      account.status = "invalid";
      account.updatedAt = failureAt;
      account.lastFailureAt = failureAt;
    });
  }

  async markActive(options: {
    userId: string;
    accountId: string;
    verifiedAt?: Date;
  }) {
    const normalizedUserId = normalizeUserId(options.userId);
    const verifiedAt = (options.verifiedAt ?? this.clock()).toISOString();

    await this.store.updateState((state) => {
      const userRecord = state.accounts[normalizedUserId];
      if (!userRecord) {
        return;
      }

      const account = userRecord.accounts[options.accountId];
      if (!account) {
        return;
      }

      account.status = "active";
      account.updatedAt = verifiedAt;
      account.lastVerifiedAt = verifiedAt;
      account.lastFailureAt = null;
    });
  }
}
