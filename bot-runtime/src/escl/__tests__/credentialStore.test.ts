import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CredentialStore,
  CredentialStoreError,
  ESCL_SECRET_KEY_LENGTH,
} from "../credentialStore";

const createTempPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "credential-store-"));
  return path.join(dir, "escl_credentials.enc");
};

const buildSampleState = () => ({
  accounts: {
    "123": {
      defaultAccountId: "acc-1",
      accounts: {
        "acc-1": {
          label: "Main",
          teamId: 100,
          jwt: "jwt-1",
          jwtFingerprint: "fingerprint-1",
          status: "active" as const,
          createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
          updatedAt: new Date("2024-01-02T00:00:00.000Z").toISOString(),
          lastVerifiedAt: new Date("2024-01-02T00:00:00.000Z").toISOString(),
          lastFailureAt: null,
        },
      },
    },
  },
});

test("CredentialStore returns default state when file is missing", async () => {
  const filePath = await createTempPath();
  const key = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const store = new CredentialStore(filePath, key);

  await store.load();
  const state = await store.getState();

  assert.deepStrictEqual(state.accounts, {});
  assert.strictEqual(typeof state.meta.updatedAt, "string");
});

test("CredentialStore writes and reloads encrypted content", async () => {
  const filePath = await createTempPath();
  const key = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const store = new CredentialStore(filePath, key);

  const sample = buildSampleState();
  await store.updateState((state) => {
    state.accounts = sample.accounts;
  });

  const afterUpdate = await store.getState();
  const userRecord = afterUpdate.accounts["123"];
  assert.ok(userRecord);
  const accountRecord = userRecord.accounts["acc-1"];
  assert.ok(accountRecord);
  assert.strictEqual(accountRecord.jwt, "jwt-1");

  const reopened = new CredentialStore(filePath, key);
  await reopened.load();

  const restored = await reopened.getState();
  const restoredUser = restored.accounts["123"];
  assert.ok(restoredUser);
  assert.deepStrictEqual(restoredUser.accounts, sample.accounts["123"].accounts);
});

test("CredentialStore rejects invalid keys", async () => {
  const filePath = await createTempPath();
  const key = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const store = new CredentialStore(filePath, key);

  await store.updateState((state) => {
    state.accounts = buildSampleState().accounts;
  });

  const wrongKey = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const reopened = new CredentialStore(filePath, wrongKey);

  await assert.rejects(async () => reopened.load(), CredentialStoreError);
});

test("CredentialStore rotates encryption keys", async () => {
  const filePath = await createTempPath();
  const oldKey = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const store = new CredentialStore(filePath, oldKey);

  await store.updateState((state) => {
    state.accounts = buildSampleState().accounts;
  });

  const newKey = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  await store.rotate({ oldKey, newKey });

  const reopened = new CredentialStore(filePath, newKey);
  await reopened.load();
  const state = await reopened.getState();

  assert.ok(state.accounts["123"]);
});

test("CredentialStore serialises concurrent updates", async () => {
  const filePath = await createTempPath();
  const key = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const store = new CredentialStore(filePath, key);

  await store.load();

  await Promise.all([
    store.updateState((state) => {
      state.accounts["user-a"] = {
        defaultAccountId: "acc-a",
        accounts: {
          "acc-a": {
            label: null,
            teamId: 1,
            jwt: "jwt-a",
            jwtFingerprint: "fp-a",
            status: "active" as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastVerifiedAt: null,
            lastFailureAt: null,
          },
        },
      };
    }),
    store.updateState((state) => {
      state.accounts["user-b"] = {
        defaultAccountId: "acc-b",
        accounts: {
          "acc-b": {
            label: "B",
            teamId: 2,
            jwt: "jwt-b",
            jwtFingerprint: "fp-b",
            status: "active" as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastVerifiedAt: null,
            lastFailureAt: null,
          },
        },
      };
    }),
  ]);

  const state = await store.getState();
  assert.ok(state.accounts["user-a"]);
  assert.ok(state.accounts["user-b"]);
});
