export type HealthIssueLevel = "warning" | "error";
export type HealthIssue = {
    id: string;
    level: HealthIssueLevel;
    message: string;
    detectedAt: string;
    details?: Record<string, unknown>;
};
export type HealthIssueChangeType = "created" | "updated";
export type HealthIssueChangeContext = {
    previous: HealthIssue | null;
    change: HealthIssueChangeType;
};
export type HealthRegistryObserver = {
    onReport?: (issue: HealthIssue, context: HealthIssueChangeContext) => void | Promise<void>;
    onResolve?: (issue: HealthIssue) => void | Promise<void>;
};
export declare class HealthRegistry {
    private readonly issues;
    private readonly observers;
    subscribe(observer: HealthRegistryObserver): () => void;
    private notifyReport;
    private notifyResolve;
    report(issue: Omit<HealthIssue, "detectedAt"> & {
        detectedAt?: string;
    }): boolean;
    resolve(id: string): boolean;
    has(id: string): boolean;
    list(): HealthIssue[];
}
export declare const healthRegistry: HealthRegistry;
//# sourceMappingURL=registry.d.ts.map