import type { CodexRunnerOptions, CodexRunnerResult } from "./runner";
export type CodexQueueStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";
export type CodexQueueResultSummary = {
    runId: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
    timedOut: boolean;
    historyPath: string | null;
    command: CodexRunnerResult["command"];
    task: {
        filename: string;
        title: string;
        priority: string;
    };
    fileChanges: CodexRunnerResult["fileChanges"];
    retry: CodexQueueRetryInfo;
};
export type CodexQueueError = {
    message: string;
    stack?: string;
};
export type CodexQueueRetryInfo = {
    attempts: number;
    maxAttempts: number;
    performedRetries: number;
    reasons: string[];
};
export type CodexQueueItem = {
    id: string;
    filename: string;
    status: CodexQueueStatus;
    requestedAt: string;
    startedAt?: string;
    finishedAt?: string;
    cancelRequested: boolean;
    retry: CodexQueueRetryInfo;
    result?: CodexQueueResultSummary;
    error?: CodexQueueError;
};
export type CodexQueueSnapshot = {
    active: CodexQueueItem | null;
    pending: CodexQueueItem[];
    history: CodexQueueItem[];
};
export type CodexQueueCancelResult = {
    ok: true;
    state: "cancelled";
    item: CodexQueueItem;
} | {
    ok: true;
    state: "running";
    item: CodexQueueItem;
} | {
    ok: false;
    state: "finished";
    item: CodexQueueItem;
} | {
    ok: false;
    state: "not_found";
};
type QueueListener = (snapshot: CodexQueueSnapshot) => void;
type QueueRunner = (filename: string, options?: CodexRunnerOptions) => Promise<CodexRunnerResult>;
type QueueConfig = {
    historyLimit?: number;
    runner?: QueueRunner;
};
/**
 * Codex CLI 実行を直列化し、キューの状態を管理するクラス。
 *
 * - キューに登録されたタスクは 1 件ずつ順次実行される。
 * - キャンセル要求は保留中のタスクに対して即時反映し、実行中の場合は
 *   `cancelRequested` フラグを立てて完了待ちとする（今後の強制終了に備える）。
 * - 最近の履歴は `historyLimit` 件まで保持する。
 */
export declare class CodexExecutionQueue {
    private readonly historyLimit;
    private readonly runner;
    private pending;
    private active;
    private history;
    private processing;
    private listeners;
    constructor(config?: QueueConfig);
    enqueue(filename: string, options?: CodexRunnerOptions): {
        id: string;
        promise: Promise<CodexRunnerResult>;
    };
    cancel(queueId: string): CodexQueueCancelResult;
    getSnapshot(): CodexQueueSnapshot;
    getItem(queueId: string): CodexQueueItem | null;
    subscribe(listener: QueueListener): () => void;
    private processQueue;
    private appendHistory;
    private notifyListeners;
}
export declare const codexExecutionQueue: CodexExecutionQueue;
export {};
//# sourceMappingURL=executionQueue.d.ts.map