import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const ALGORITHM = "aes-256-gcm";
const CURRENT_VERSION = 1;

export const ESCL_SECRET_KEY_LENGTH = KEY_LENGTH;

export class CredentialStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "CredentialStoreError";
    if (options?.cause) {
      // @ts-expect-error Node.js 16+ supports `cause`
      this.cause = options.cause;
    }
  }
}

export type AccountStatus = "active" | "invalid" | "revoked";

export type CredentialAccountRecord = {
  label: string | null;
  teamId: number;
  jwt: string;
  jwtFingerprint: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  lastFailureAt: string | null;
};

export type CredentialUserRecord = {
  defaultAccountId: string | null;
  accounts: Record<string, CredentialAccountRecord>;
};

export type CredentialStoreState = {
  meta: { updatedAt: string };
  accounts: Record<string, CredentialUserRecord>;
};

type EncryptedPayload = {
  version: number;
  nonce: string;
  ciphertext: string;
  tag: string;
};

const cloneState = (state: CredentialStoreState): CredentialStoreState =>
  JSON.parse(JSON.stringify(state));

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertStateStructure = (state: CredentialStoreState) => {
  if (!isPlainObject(state.meta)) {
    throw new CredentialStoreError("meta オブジェクトが不正です。");
  }
  if (typeof state.meta.updatedAt !== "string") {
    throw new CredentialStoreError("meta.updatedAt が文字列ではありません。");
  }
  if (!isPlainObject(state.accounts)) {
    throw new CredentialStoreError("accounts がオブジェクトではありません。");
  }

  for (const [userId, userRecord] of Object.entries(state.accounts)) {
    if (!isPlainObject(userRecord)) {
      throw new CredentialStoreError(`ユーザー ${userId} のレコードが不正です。`);
    }

    if (
      userRecord.defaultAccountId !== null &&
      typeof userRecord.defaultAccountId !== "string"
    ) {
      throw new CredentialStoreError(
        `ユーザー ${userId} の defaultAccountId が文字列ではありません。`
      );
    }

    if (!isPlainObject(userRecord.accounts)) {
      throw new CredentialStoreError(`ユーザー ${userId} の accounts が不正です。`);
    }

    for (const [accountId, account] of Object.entries(userRecord.accounts)) {
      if (!isPlainObject(account)) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} が不正です。`
        );
      }

      if (account.label !== null && typeof account.label !== "string") {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の label が文字列ではありません。`
        );
      }

      if (!Number.isInteger(account.teamId) || account.teamId <= 0) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の teamId が正の整数ではありません。`
        );
      }

      if (typeof account.jwt !== "string" || account.jwt.trim().length === 0) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の jwt が空です。`
        );
      }

      if (typeof account.jwtFingerprint !== "string" || account.jwtFingerprint.length === 0) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の jwtFingerprint が空です。`
        );
      }

      if (!["active", "invalid", "revoked"].includes(account.status)) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の status が不正です。`
        );
      }

      if (
        typeof account.createdAt !== "string" ||
        Number.isNaN(Date.parse(account.createdAt))
      ) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の createdAt が ISO8601 ではありません。`
        );
      }

      if (
        typeof account.updatedAt !== "string" ||
        Number.isNaN(Date.parse(account.updatedAt))
      ) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の updatedAt が ISO8601 ではありません。`
        );
      }

      if (
        account.lastVerifiedAt !== null &&
        (typeof account.lastVerifiedAt !== "string" ||
          Number.isNaN(Date.parse(account.lastVerifiedAt)))
      ) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の lastVerifiedAt が ISO8601 ではありません。`
        );
      }

      if (
        account.lastFailureAt !== null &&
        (typeof account.lastFailureAt !== "string" ||
          Number.isNaN(Date.parse(account.lastFailureAt)))
      ) {
        throw new CredentialStoreError(
          `ユーザー ${userId} のアカウント ${accountId} の lastFailureAt が ISO8601 ではありません。`
        );
      }
    }
  }
};

const buildDefaultState = (): CredentialStoreState => ({
  meta: { updatedAt: new Date(0).toISOString() },
  accounts: {},
});

const decodeBase64 = (value: string, context: string) => {
  try {
    return Buffer.from(value, "base64");
  } catch (error) {
    throw new CredentialStoreError(`${context} の Base64 デコードに失敗しました。`, {
      cause: error,
    });
  }
};

const decodeKey = (key: Buffer) => {
  if (key.length !== KEY_LENGTH) {
    throw new CredentialStoreError(
      `ESCL_SECRET_KEY は ${KEY_LENGTH} バイトである必要があります (現在 ${key.length} バイト)`
    );
  }
};

export class CredentialStore {
  private readonly filePath: string;
  private key: Buffer;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeLock: Promise<void> = Promise.resolve();
  private state: CredentialStoreState = buildDefaultState();

  constructor(filePath: string, key: Buffer) {
    this.filePath = filePath;
    this.key = Buffer.from(key);
    decodeKey(this.key);
  }

  async load() {
    if (this.loaded) {
      return;
    }

    if (!this.loadPromise) {
      this.loadPromise = this.performLoad();
    }

    await this.loadPromise;
  }

  async getState(): Promise<CredentialStoreState> {
    await this.ensureLoaded();
    return cloneState(this.state);
  }

  async updateState(
    mutator: (state: CredentialStoreState) => void | CredentialStoreState
  ): Promise<CredentialStoreState> {
    await this.ensureLoaded();

    return this.withWriteLock(async () => {
      const draft = cloneState(this.state);
      const result = mutator(draft);
      const nextState = result ? (result as CredentialStoreState) : draft;
      nextState.meta.updatedAt = new Date().toISOString();
      assertStateStructure(nextState);
      this.state = cloneState(nextState);
      await this.writeEncrypted(nextState);
      return cloneState(this.state);
    });
  }

  async rotate(options: { oldKey: Buffer; newKey: Buffer }) {
    const oldKey = Buffer.from(options.oldKey);
    const newKey = Buffer.from(options.newKey);
    decodeKey(oldKey);
    decodeKey(newKey);

    await this.withWriteLock(async () => {
      const state = await this.readEncrypted(oldKey);
      await this.writeEncrypted(state, newKey);
      this.key = newKey;
      this.state = cloneState(state);
      this.loaded = true;
    });
  }

  private async ensureLoaded() {
    if (!this.loaded) {
      await this.load();
    }
  }

  private async performLoad() {
    try {
      const state = await this.readEncrypted(this.key);
      assertStateStructure(state);
      this.state = cloneState(state);
      this.loaded = true;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        this.state = buildDefaultState();
        this.loaded = true;
        return;
      }

      if (error instanceof CredentialStoreError) {
        throw error;
      }

      throw new CredentialStoreError("ESCL 資格情報ファイルの読み込みに失敗しました。", {
        cause: error,
      });
    }
  }

  private async readEncrypted(key: Buffer): Promise<CredentialStoreState> {
    const raw = await fs.readFile(this.filePath, "utf-8");
    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch (error) {
      throw new CredentialStoreError("ESCL 資格情報ファイルが JSON ではありません。", {
        cause: error,
      });
    }

    if (!isPlainObject(payload)) {
      throw new CredentialStoreError("ESCL 資格情報ファイルがオブジェクトではありません。");
    }

    const version = Number(payload.version);
    if (!Number.isInteger(version) || version !== CURRENT_VERSION) {
      throw new CredentialStoreError(
        `サポートされていないバージョンです: ${String(payload.version)}`
      );
    }

    const nonceEncoded = payload.nonce;
    const ciphertextEncoded = payload.ciphertext;
    const tagEncoded = payload.tag;

    if (
      typeof nonceEncoded !== "string" ||
      typeof ciphertextEncoded !== "string" ||
      typeof tagEncoded !== "string"
    ) {
      throw new CredentialStoreError("暗号化ペイロードの形式が不正です。");
    }

    const nonce = decodeBase64(nonceEncoded, "nonce");
    const ciphertext = decodeBase64(ciphertextEncoded, "ciphertext");
    const tag = decodeBase64(tagEncoded, "tag");

    if (nonce.length !== NONCE_LENGTH) {
      throw new CredentialStoreError("nonce の長さが不正です。");
    }

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const json = decrypted.toString("utf-8");
      const state = JSON.parse(json);

      if (!isPlainObject(state)) {
        throw new CredentialStoreError("復号結果がオブジェクトではありません。");
      }

      assertStateStructure(state as CredentialStoreState);
      return state as CredentialStoreState;
    } catch (error) {
      if (error instanceof CredentialStoreError) {
        throw error;
      }

      throw new CredentialStoreError("ESCL 資格情報の復号に失敗しました。", {
        cause: error,
      });
    }
  }

  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.writeLock;
    let release: (() => void) | undefined;

    this.writeLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  private async writeEncrypted(state: CredentialStoreState, key = this.key) {
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
    const plaintext = Buffer.from(JSON.stringify(state));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      version: CURRENT_VERSION,
      nonce: nonce.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: tag.toString("base64"),
    };

    const directory = path.dirname(this.filePath);
    const tmpPath = `${this.filePath}.tmp`;

    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      throw new CredentialStoreError("ESCL 資格情報ファイルの書き込みに失敗しました。", {
        cause: error,
      });
    }
  }
}

export const createCredentialStore = (filePath: string, key: Buffer) =>
  new CredentialStore(filePath, key);

export const parseSecretKey = (raw: string): Buffer => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new CredentialStoreError("ESCL_SECRET_KEY が空です。");
  }

  const candidates: Buffer[] = [];

  try {
    candidates.push(Buffer.from(trimmed, "base64"));
  } catch {
    // ignore
  }

  try {
    candidates.push(Buffer.from(trimmed, "hex"));
  } catch {
    // ignore
  }

  candidates.push(Buffer.from(trimmed, "utf-8"));

  const valid = candidates.find((candidate) => candidate.length === KEY_LENGTH);

  if (!valid) {
    throw new CredentialStoreError(
      `ESCL_SECRET_KEY は Base64 / Hex / UTF-8 のいずれかで ${KEY_LENGTH} バイトを表す必要があります。`
    );
  }

  return Buffer.from(valid);
};
