import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  computeRunAt,
  EntryScheduler,
  type EntryJobResult,
} from "../entryScheduler";
import {
  ESCLAuthError,
  type ESCLResponse,
} from "../apiClient";
import { EntryJobStore } from "../entryJobStore";

const buildResponse = (status: number, payload?: Record<string, unknown>): ESCLResponse => ({
  statusCode: status,
  payload: payload ?? null,
  text: payload ? JSON.stringify(payload) : "",
  ok: status >= 200 && status < 300,
});

class FakeApiClient {
  readonly calls: Array<{ scrimId: number; teamId: number }> = [];

  constructor(private readonly queue: Array<ESCLResponse | Error>) {}

  async createApplication(params: { scrimId: number; teamId: number }) {
    this.calls.push({ scrimId: params.scrimId, teamId: params.teamId });

    const next = this.queue.shift();
    if (!next) {
      throw new Error("No response configured");
    }

    if (next instanceof Error) {
      throw next;
    }

    return next;
  }
}

const ensureResult = (value: EntryJobResult | null, message: string) => {
  if (!value) {
    assert.fail(message);
  }
  return value;
};

const immediateNow = new Date("2024-05-01T00:00:00+09:00");

const createControlledSleep = () => {
  const pending: Array<{ resolve: () => void; reject: (reason: unknown) => void }> = [];

  const sleepFn = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException("Operation aborted", "AbortError"));
        return;
      }

      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        reject(new DOMException("Operation aborted", "AbortError"));
      };

      signal.addEventListener("abort", onAbort);

      pending.push({
        resolve: () => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        },
        reject: (reason) => {
          signal.removeEventListener("abort", onAbort);
          reject(reason);
        },
      });
    });

  return { sleepFn, pending };
};

const waitForCondition = async (
  condition: () => Promise<boolean>,
  timeoutMs = 500
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.fail("condition not met within timeout");
};

const buildAccountContext = (jwt = "test-jwt") => ({
  accountId: null,
  accountLabel: null,
  jwtFingerprint: null,
  resolver: async () => ({
    jwt,
    accountId: null,
    accountLabel: null,
    jwtFingerprint: null,
  }),
});

test("computeRunAt returns previous day midnight by default", () => {
  const runAt = computeRunAt("2024-05-02");

  assert.strictEqual(runAt.toISOString(), "2024-04-30T15:00:00.000Z");

  const withDispatch = computeRunAt("2024-05-02", "Asia/Tokyo", { hour: 9, minute: 30 });
  assert.strictEqual(withDispatch.toISOString(), "2024-05-01T00:30:00.000Z");
});

test("EntryScheduler retries on 429 and succeeds", async (t) => {
  const responses: Array<ESCLResponse | Error> = [
    buildResponse(429, { message: "rate limited" }),
    buildResponse(200, { message: "ok" }),
  ];

  const apiClient = new FakeApiClient(responses);
  const sleeps: number[] = [];
  const scheduler = new EntryScheduler(() => apiClient as never, {
    retryIntervalMs: 1,
    retryBackoffAfter429Ms: 2,
    sleepFn: async (ms, signal) => {
      sleeps.push(ms);
      if (signal.aborted) {
        throw new DOMException("Operation aborted", "AbortError");
      }
    },
  });

  t.after(async () => {
    await scheduler.shutdown();
  });

  const logs: string[] = [];
  let result: EntryJobResult | null = null;
  const resultPromise = new Promise<void>((resolve) => {
    const handler = (value: EntryJobResult) => {
      result = value;
      resolve();
    };

    void scheduler
      .scheduleEntry({
        userId: "1",
        scrimId: 100,
        teamId: 200,
        entryDate: "2024-05-02",
        logHook: async (message) => {
          logs.push(message);
        },
        resultHook: handler,
        now: immediateNow,
        accountContext: buildAccountContext(),
      })
      .catch((error) => {
        throw error;
      });
  });

  await resultPromise;

  const resolved = ensureResult(result, "resultHook should be invoked");
  assert.strictEqual(resolved.ok, true);
  assert.strictEqual(resolved.attempts, 2);
  assert.strictEqual(apiClient.calls.length, 2);
  assert.ok(
    logs.some((line) => line.includes("レート制限")),
    "logHook should include rate limit message"
  );
  assert.deepStrictEqual(sleeps, [2, 1]);
});

test("EntryScheduler reports auth errors immediately", async (t) => {
  const response = buildResponse(401, { message: "unauthorized" });
  const apiClient = new FakeApiClient([
    new ESCLAuthError("auth", response),
  ]);

  const scheduler = new EntryScheduler(() => apiClient as never, {
    sleepFn: async () => {
      /* no-op */
    },
  });

  t.after(async () => {
    await scheduler.shutdown();
  });

  let result: EntryJobResult | null = null;
  const resultPromise = new Promise<void>((resolve) => {
    void scheduler
      .scheduleEntry({
        userId: "2",
        scrimId: 10,
        teamId: 20,
        entryDate: "2024-05-02",
        logHook: async () => {
          /* ignore */
        },
        resultHook: (value) => {
          result = value;
          resolve();
        },
        now: immediateNow,
        accountContext: buildAccountContext(),
      })
      .catch((error) => {
        throw error;
      });
  });

  await resultPromise;

  const authResult = ensureResult(
    result,
    "resultHook should receive auth error result"
  );
  assert.strictEqual(authResult.ok, false);
  assert.strictEqual(authResult.statusCode, 401);
  assert.strictEqual(authResult.summary, "ESCL API 認証エラー: JWT を再設定してください。");
});

test("EntryScheduler persists jobs to EntryJobStore", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "entry-job-store-"));
  const storePath = path.join(dir, "entry_jobs.json");
  const jobStore = new EntryJobStore(storePath);

  const apiClient = new FakeApiClient([buildResponse(200, { message: "ok" })]);
  const { sleepFn, pending } = createControlledSleep();
  const scheduler = new EntryScheduler(() => apiClient as never, {
    jobStore,
    sleepFn,
  });

  let finalResult: EntryJobResult | null = null;
  let resolveResult: (() => void) | null = null;
  const resultPromise = new Promise<void>((resolve) => {
    resolveResult = resolve;
  });

  t.after(async () => {
    await scheduler.shutdown();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const metadata = await scheduler.scheduleEntry({
    userId: "user-1",
    scrimId: 123,
    teamId: 456,
    entryDate: "2024-05-04",
    logHook: async () => {
      /* no-op */
    },
    resultHook: (result) => {
      finalResult = result;
      resolveResult?.();
    },
    now: new Date("2024-05-01T12:00:00.000Z"),
    accountContext: buildAccountContext(),
  });

  const stored = await jobStore.get(metadata.jobId);
  assert.notEqual(stored, null);
  assert.strictEqual(stored?.scrimId, 123);
  assert.strictEqual(stored?.dispatchTime, null);
  assert.strictEqual(stored?.accountId, null);
  assert.strictEqual(stored?.jwtFingerprint, null);

  while (pending.length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.strictEqual(pending.length, 1);
  pending.shift()?.resolve();

  await resultPromise;

  const ensuredResult = ensureResult(finalResult, "resultHook should be invoked after persistence");
  assert.strictEqual(ensuredResult.ok, true);
  assert.strictEqual(apiClient.calls.length, 1);

  await waitForCondition(async () => (await jobStore.get(metadata.jobId)) === null);
  const after = await jobStore.get(metadata.jobId);
  assert.strictEqual(after, null);

  const fileRaw = await fs.readFile(storePath, "utf-8");
  assert.deepStrictEqual(JSON.parse(fileRaw), {});
});

test("EntryScheduler restores jobs from EntryJobStore", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "entry-job-restore-"));
  const storePath = path.join(dir, "entry_jobs.json");

  const jobStore = new EntryJobStore(storePath);
  const apiClient = new FakeApiClient([buildResponse(200, { message: "ok" })]);
  const { sleepFn, pending } = createControlledSleep();
  const restoreJwt = "restore-jwt";
  const scheduler = new EntryScheduler(() => apiClient as never, {
    jobStore,
    sleepFn,
  });

  let schedulerRestored: EntryScheduler | null = null;
  t.after(async () => {
    if (schedulerRestored) {
      await schedulerRestored.shutdown();
    }
    await scheduler.shutdown();
    await fs.rm(dir, { recursive: true, force: true });
  });

  const metadata = await scheduler.scheduleEntry({
    userId: "user-restore",
    scrimId: 777,
    teamId: 888,
    entryDate: "2024-05-04",
    logHook: async () => {
      /* no-op */
    },
    now: new Date("2024-05-01T12:00:00.000Z"),
    accountContext: buildAccountContext(restoreJwt),
  });

  while (pending.length === 0) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.strictEqual(pending.length, 1);
  const storedBeforeShutdown = await jobStore.get(metadata.jobId);
  assert.notEqual(storedBeforeShutdown, null);

  await scheduler.shutdown();

  const storedAfterShutdown = await jobStore.get(metadata.jobId);
  assert.notEqual(storedAfterShutdown, null);

  const jobStoreReloaded = new EntryJobStore(storePath);
  const apiClientRestored = new FakeApiClient([buildResponse(200, { message: "ok" })]);
  const { sleepFn: restoredSleepFn, pending: restoredPending } = createControlledSleep();
  schedulerRestored = new EntryScheduler(() => apiClientRestored as never, {
    jobStore: jobStoreReloaded,
    sleepFn: restoredSleepFn,
    authProvider: async () => ({
      resolver: async () => ({
        jwt: restoreJwt,
        accountId: null,
        accountLabel: null,
        jwtFingerprint: null,
      }),
    }),
  });

  const results: EntryJobResult[] = [];
  let resolveResult: (() => void) | null = null;
  const resultPromise = new Promise<void>((resolve) => {
    resolveResult = resolve;
  });

  const restored = await schedulerRestored.restorePersistedJobs({
    now: new Date("2024-05-01T14:00:00.000Z"),
    createHooks: () => ({
      logHook: async () => {
        /* no-op */
      },
      resultHook: async (result) => {
        results.push(result);
        resolveResult?.();
      },
    }),
  });

  assert.strictEqual(restored.length, 1);
  assert.strictEqual(restored[0]?.jobId, metadata.jobId);
  assert.strictEqual(restoredPending.length, 1);

  const storedDuringRestore = await jobStoreReloaded.get(metadata.jobId);
  assert.notEqual(storedDuringRestore, null);

  restoredPending.shift()?.resolve();

  await resultPromise;

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0]?.ok, true);
  assert.strictEqual(apiClientRestored.calls.length, 1);

  await waitForCondition(async () => (await jobStoreReloaded.get(metadata.jobId)) === null);
  const remaining = await jobStoreReloaded.get(metadata.jobId);
  assert.strictEqual(remaining, null);
});
