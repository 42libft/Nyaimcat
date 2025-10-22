import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { CredentialStore, ESCL_SECRET_KEY_LENGTH } from "../credentialStore";
import { AccountManager, AccountManagerError } from "../accountManager";

const createTempPath = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "account-manager-"));
  return path.join(dir, "escl_credentials.enc");
};

const createStore = async () => {
  const filePath = await createTempPath();
  const key = crypto.randomBytes(ESCL_SECRET_KEY_LENGTH);
  const store = new CredentialStore(filePath, key);
  await store.load();
  return store;
};

const buildValidator = () => {
  const calls: Array<{ jwt: string }> = [];

  const validate = async (jwt: string) => {
    calls.push({ jwt });
    if (jwt.startsWith("valid-")) {
      const segments = jwt.split("-");
      const lastSegment = segments[segments.length - 1] ?? "";
      const teamId = Number(lastSegment);
      return { teamId };
    }
    throw new Error("invalid jwt");
  };

  return { validate, calls };
};

test("AccountManager registers and lists accounts", async () => {
  const store = await createStore();
  const { validate, calls } = buildValidator();
  const manager = new AccountManager({ store, validateJwt: validate });

  const result = await manager.registerAccount({
    userId: "user-1",
    jwt: "valid-101",
    teamId: 101,
    label: " Main ",
  });

  assert.ok(result.account.accountId);
  assert.strictEqual(result.account.label, "Main");
  assert.strictEqual(result.account.teamId, 101);
  assert.strictEqual(result.account.isDefault, true);
  assert.ok(calls.length === 1);

  const listed = await manager.listAccounts("user-1");
  assert.strictEqual(listed.accounts.length, 1);
  const first = listed.accounts[0];
  assert.ok(first);
  assert.ok(first.isDefault);
  assert.strictEqual(first.label, "Main");

  const stored = await manager.getAccount("user-1", result.account.accountId);
  assert.ok(stored);
  assert.strictEqual(stored?.jwt, "valid-101");

  const defaultAccount = await manager.getDefaultAccount("user-1");
  assert.ok(defaultAccount);
  assert.strictEqual(defaultAccount?.accountId, result.account.accountId);
});

test("AccountManager rejects mismatched teamId", async () => {
  const store = await createStore();
  const { validate } = buildValidator();
  const manager = new AccountManager({ store, validateJwt: validate });

  await assert.rejects(
    () =>
      manager.registerAccount({
        userId: "user-1",
        jwt: "valid-200",
        teamId: 100,
      }),
    AccountManagerError
  );
});

test("AccountManager removes accounts and updates default", async () => {
  const store = await createStore();
  const { validate } = buildValidator();
  const manager = new AccountManager({ store, validateJwt: validate });

  const first = await manager.registerAccount({
    userId: "user-1",
    jwt: "valid-1",
    teamId: 1,
    label: "first",
  });

  const second = await manager.registerAccount({
    userId: "user-1",
    jwt: "valid-2",
    teamId: 2,
    label: "second",
  });

  const removal = await manager.removeAccount({
    userId: "user-1",
    accountId: first.account.accountId,
  });

  assert.ok(removal.removed);
  assert.strictEqual(removal.remainingAccounts, 1);

  const listed = await manager.listAccounts("user-1");
  assert.strictEqual(listed.accounts.length, 1);
  const remaining = listed.accounts[0];
  assert.ok(remaining);
  assert.strictEqual(remaining.accountId, second.account.accountId);
  assert.ok(remaining.isDefault);

  const defaultAfterRemoval = await manager.getDefaultAccount("user-1");
  assert.ok(defaultAfterRemoval);
  assert.strictEqual(defaultAfterRemoval?.accountId, second.account.accountId);
});

test("AccountManager sets default account", async () => {
  const store = await createStore();
  const { validate } = buildValidator();
  const manager = new AccountManager({ store, validateJwt: validate });

  const first = await manager.registerAccount({
    userId: "user-1",
    jwt: "valid-10",
    teamId: 10,
  });

  const second = await manager.registerAccount({
    userId: "user-1",
    jwt: "valid-20",
    teamId: 20,
  });

  await manager.setDefaultAccount({
    userId: "user-1",
    accountId: second.account.accountId,
  });

  const listed = await manager.listAccounts("user-1");
  assert.ok(listed.accounts.find((a) => a.accountId === second.account.accountId)?.isDefault);

  await assert.rejects(
    () =>
      manager.setDefaultAccount({
        userId: "user-1",
        accountId: "unknown",
      }),
    AccountManagerError
  );
});

test("AccountManager updates status on markInvalid/markActive", async () => {
  const store = await createStore();
  const { validate } = buildValidator();
  const manager = new AccountManager({ store, validateJwt: validate });

  const account = await manager.registerAccount({
    userId: "user-1",
    jwt: "valid-33",
    teamId: 33,
  });

  await manager.markInvalid({
    userId: "user-1",
    accountId: account.account.accountId,
  });

  let listed = await manager.listAccounts("user-1");
  const invalidAccount = listed.accounts[0];
  assert.ok(invalidAccount);
  assert.strictEqual(invalidAccount.status, "invalid");
  assert.ok(invalidAccount.lastFailureAt);

  await manager.markActive({
    userId: "user-1",
    accountId: account.account.accountId,
  });

  listed = await manager.listAccounts("user-1");
  const activeAccount = listed.accounts[0];
  assert.ok(activeAccount);
  assert.strictEqual(activeAccount.status, "active");
  assert.ok(activeAccount.lastVerifiedAt);
});
