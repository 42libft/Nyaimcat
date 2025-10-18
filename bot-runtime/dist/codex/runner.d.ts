import { type TaskFile } from "../tasks/inbox";
import { type GitStatusEntry } from "../utils/gitStatus";
type RunnerHooks = {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
};
export type CodexRunnerOptions = {
    bin?: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    hooks?: RunnerHooks;
    recordHistory?: boolean;
    signal?: AbortSignal;
};
export type CodexRunnerResult = {
    task: TaskFile;
    runId: string;
    command: {
        bin: string;
        args: string[];
        cwd: string;
    };
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    historyPath?: string | null;
    fileChanges: GitStatusEntry[];
    retry?: {
        attempts: number;
        performedRetries: number;
        maxAttempts: number;
        reasons: string[];
    };
};
export type CodexRunnerConfig = {
    bin: string;
    args: string[];
    cwd: string;
    timeoutMs: number;
    recordHistory: boolean;
};
export declare const buildPromptForTask: (task: TaskFile) => string;
export declare const getDefaultCodexRunnerConfig: () => CodexRunnerConfig;
export declare const runCodexTask: (filename: string, options?: CodexRunnerOptions) => Promise<CodexRunnerResult>;
export {};
//# sourceMappingURL=runner.d.ts.map