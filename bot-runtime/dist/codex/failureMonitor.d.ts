type FailureMonitorConfig = {
    threshold: number;
    windowMs: number;
    minRuns: number;
    minFailures: number;
    cooldownMs: number;
};
export declare class CodexFailureMonitor {
    private readonly config;
    private lastAlertAt;
    private lastAlertKey;
    constructor(config?: FailureMonitorConfig);
    evaluate(): Promise<void>;
    private collectStats;
    private loadSuccessRecords;
    private loadFailureRecords;
    private readDirSafe;
    private parseSuccess;
    private parseFailure;
    private dispatchAlert;
    private toRelativePath;
}
export declare const codexFailureMonitor: CodexFailureMonitor;
export {};
//# sourceMappingURL=failureMonitor.d.ts.map