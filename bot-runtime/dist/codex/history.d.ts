import type { CodexRunnerResult } from "./runner";
import type { CodexQueueItem } from "./executionQueue";
export type RecordedRun = {
    run_id: string;
    executed_at: string;
    task: {
        filename: string;
        title: string;
        priority: string;
    };
    command: {
        bin: string;
        args: string[];
        cwd: string;
    };
    exit_code: number | null;
    signal: string | null;
    timed_out: boolean;
    duration_ms: number;
    stdout: {
        content: string;
        truncated: boolean;
        original_length: number;
    };
    stderr: {
        content: string;
        truncated: boolean;
        original_length: number;
    };
    files: {
        path: string;
        status: string;
        original_path: string | null;
    }[];
    retry: {
        attempts: number;
        max_attempts: number;
        performed_retries: number;
        reasons: string[];
    } | null;
};
export type RecordedRunWithPath = {
    filePath: string;
    run: RecordedRun;
};
export type RecordedRunFailure = {
    queue_id: string;
    recorded_at: string;
    task: {
        filename: string;
        title: string;
        priority: string;
    };
    status: string;
    cancel_requested: boolean;
    requested_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    error: {
        message: string;
        stack: string | null;
    };
};
export type RecordedRunFailureWithPath = {
    filePath: string;
    failure: RecordedRunFailure;
};
export declare const loadRecordedRunFromPath: (historyPath: string) => Promise<RecordedRunWithPath | null>;
export declare const findRecordedRunById: (runId: string) => Promise<RecordedRunWithPath | null>;
export declare const recordCodexRunResult: (result: CodexRunnerResult) => Promise<string>;
export type RecordCodexRunFailureOptions = {
    queueId: string;
    task: {
        filename: string;
        title: string;
        priority: string;
    };
    queueItem?: CodexQueueItem | null;
    error: {
        message: string;
        stack?: string | null;
    };
};
export declare const recordCodexRunFailure: (options: RecordCodexRunFailureOptions) => Promise<string>;
//# sourceMappingURL=history.d.ts.map