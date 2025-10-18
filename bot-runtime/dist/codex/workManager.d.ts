import { type CodexExecutionQueue, type CodexQueueItem, type CodexQueueSnapshot, type CodexQueueCancelResult } from "./executionQueue";
import type { CodexRunnerResult } from "./runner";
import { type TaskFile } from "../tasks/inbox";
export type StartWorkOptions = {
    filename: string;
    notifyChannelId?: string | null;
    stdoutLimit?: number;
    stderrLimit?: number;
    updateDocs?: boolean;
    recordHistory?: boolean;
};
export type StartWorkResult = {
    queueId: string;
    task: TaskFile;
    queueItem: CodexQueueItem | null;
};
type StoredRunResult = {
    queueId: string;
    result: CodexRunnerResult;
};
export declare class CodexWorkManager {
    private readonly queue;
    private readonly progressNotifier;
    private readonly failureMonitor;
    private readonly recentResults;
    private readonly recentResultLimit;
    constructor(queue?: CodexExecutionQueue);
    startWork(options: StartWorkOptions): Promise<StartWorkResult>;
    private rememberResult;
    cancel(queueId: string): CodexQueueCancelResult;
    getQueueSnapshot(): CodexQueueSnapshot;
    getQueueItemByRunId(runId: string): CodexQueueItem | null;
    getRecentRunResult(runId: string): StoredRunResult | null;
    getQueueItem(queueId: string): CodexQueueItem | null;
}
export declare const codexWorkManager: CodexWorkManager;
export {};
//# sourceMappingURL=workManager.d.ts.map