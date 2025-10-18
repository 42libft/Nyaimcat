"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCodexQueueHarness = void 0;
const executionQueue_1 = require("../executionQueue");
const errors_1 = require("../errors");
const SCENARIOS = [
    {
        name: "timeout-auto-retry-success",
        filename: "timeout-task.md",
        steps: [
            { timedOut: true, durationMs: 120 },
            { exitCode: 0, durationMs: 80 },
        ],
        expect: {
            status: "succeeded",
            attempts: 2,
            performedRetries: 1,
            reasons: ["timeout"],
        },
    },
    {
        name: "signal-retry-exhausted",
        filename: "signal-task.md",
        steps: [
            { signal: "SIGTERM", durationMs: 60 },
            { signal: "SIGTERM", durationMs: 70 },
        ],
        expect: {
            status: "failed",
            attempts: 2,
            performedRetries: 2,
            reasons: ["signal_SIGTERM", "signal_SIGTERM"],
            errorClass: errors_1.CodexRetryExhaustedError,
        },
    },
];
const buildMockTask = (filename) => ({
    filename,
    filePath: `/tmp/${filename}`,
    metadata: {
        title: `Harness ${filename}`,
        priority: "normal",
        priority_label: null,
        summary: "Harness generated task",
        created_at: new Date(0).toISOString(),
        author: {
            id: "codex-harness",
            tag: "codex-harness#0000",
        },
        channel_id: "0",
        interaction_id: null,
    },
    body: "This is a synthetic task generated for CodexExecutionQueue harness tests.",
});
const applyDelay = async (delayMs) => {
    if (!delayMs || delayMs <= 0) {
        return;
    }
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
};
const buildRunnerResult = (scenario, filename, step, attempt) => ({
    task: buildMockTask(filename),
    runId: `${scenario.name}-attempt-${attempt}`,
    command: {
        bin: "codex",
        args: ["--harness"],
        cwd: "/workspace",
    },
    exitCode: step.exitCode !== undefined
        ? step.exitCode
        : step.signal
            ? null
            : 0,
    signal: step.signal ?? null,
    stdout: step.stdout ?? "",
    stderr: step.stderr ?? "",
    durationMs: step.durationMs ?? step.delayMs ?? 50,
    timedOut: step.timedOut ?? false,
    historyPath: step.historyPath !== undefined ? step.historyPath : null,
    fileChanges: step.fileChanges ?? [],
});
const assertEqual = (actual, expected, message) => {
    if (actual !== expected) {
        throw new Error(`${message}: expected=${expected}, actual=${actual}`);
    }
};
const assertArrayEqual = (actual, expected, message) => {
    if (actual.length !== expected.length) {
        throw new Error(`${message}: length mismatch expected=${expected.length}, actual=${actual.length}`);
    }
    for (let index = 0; index < expected.length; index++) {
        if (actual[index] !== expected[index]) {
            throw new Error(`${message}: mismatch at index ${index} expected=${expected[index]}, actual=${actual[index]}`);
        }
    }
};
const runScenario = async (scenario) => {
    const steps = [...scenario.steps];
    const queue = new executionQueue_1.CodexExecutionQueue({
        runner: async (filename) => {
            if (steps.length === 0) {
                throw new Error(`シナリオ ${scenario.name} のランナーで余分な呼び出しが発生しました。`);
            }
            const step = steps.shift();
            if (step.delayMs && step.delayMs > 0) {
                await applyDelay(step.delayMs);
            }
            const attempt = scenario.steps.length - steps.length;
            return buildRunnerResult(scenario, filename, step, attempt);
        },
    });
    const { id, promise } = queue.enqueue(scenario.filename);
    let caughtError;
    try {
        await promise;
    }
    catch (error) {
        caughtError = error;
    }
    if (steps.length > 0) {
        throw new Error(`シナリオ ${scenario.name} のステップが完了しませんでした。残り ${steps.length} 件`);
    }
    const snapshot = queue.getSnapshot();
    if (snapshot.pending.length > 0) {
        throw new Error(`シナリオ ${scenario.name} の実行後に未処理のタスクが残っています。`);
    }
    assertEqual(snapshot.active, null, `シナリオ ${scenario.name} の実行後にアクティブアイテムが残留しています`);
    const historyItem = snapshot.history[0];
    if (!historyItem) {
        throw new Error(`シナリオ ${scenario.name} の履歴が取得できませんでした。`);
    }
    assertEqual(historyItem.id, id, `シナリオ ${scenario.name} の履歴 ID`);
    assertEqual(historyItem.status, scenario.expect.status, `シナリオ ${scenario.name} の最終ステータス`);
    assertEqual(historyItem.retry.attempts, scenario.expect.attempts, `シナリオ ${scenario.name} の試行回数`);
    assertEqual(historyItem.retry.performedRetries, scenario.expect.performedRetries, `シナリオ ${scenario.name} のリトライ回数`);
    assertArrayEqual(historyItem.retry.reasons, scenario.expect.reasons, `シナリオ ${scenario.name} のリトライ理由`);
    const resultSummary = historyItem.result;
    if (!resultSummary) {
        throw new Error(`シナリオ ${scenario.name} の結果サマリが存在しません。`);
    }
    assertArrayEqual(resultSummary.retry.reasons, scenario.expect.reasons, `シナリオ ${scenario.name} の結果サマリのリトライ理由`);
    assertEqual(resultSummary.retry.attempts, scenario.expect.attempts, `シナリオ ${scenario.name} の結果サマリ試行回数`);
    assertEqual(resultSummary.retry.performedRetries, scenario.expect.performedRetries, `シナリオ ${scenario.name} の結果サマリリトライ回数`);
    if (scenario.expect.errorClass) {
        if (!caughtError) {
            throw new Error(`シナリオ ${scenario.name} で期待したエラーが発生しませんでした。`);
        }
        if (!(caughtError instanceof scenario.expect.errorClass)) {
            throw new Error(`シナリオ ${scenario.name} のエラー型が一致しません。expected=${scenario.expect.errorClass.name}, actual=${caughtError.constructor?.name ?? typeof caughtError}`);
        }
    }
    else if (caughtError) {
        throw new Error(`シナリオ ${scenario.name} で予期しないエラーが発生しました: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`);
    }
};
const runCodexQueueHarness = async () => {
    const scenarioResults = [];
    let overallSuccess = true;
    for (const scenario of SCENARIOS) {
        try {
            await runScenario(scenario);
            scenarioResults.push({
                scenario: scenario.name,
                success: true,
            });
        }
        catch (error) {
            overallSuccess = false;
            scenarioResults.push({
                scenario: scenario.name,
                success: false,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return {
        success: overallSuccess,
        scenarios: scenarioResults,
    };
};
exports.runCodexQueueHarness = runCodexQueueHarness;
//# sourceMappingURL=queueHarness.js.map