import type { HealthIssue, HealthIssueChangeContext } from "./registry";
export type HealthHistoryReportRecord = {
    type: "report";
    change: HealthIssueChangeContext["change"];
    issue: HealthIssue;
    previous: HealthIssue | null;
    recorded_at: string;
};
export type HealthHistoryResolutionRecord = {
    type: "resolve";
    issue: HealthIssue;
    recorded_at: string;
};
export type HealthHistoryRecord = HealthHistoryReportRecord | HealthHistoryResolutionRecord;
export declare const recordHealthIssueReport: (issue: HealthIssue, context: HealthIssueChangeContext) => Promise<void>;
export declare const recordHealthIssueResolution: (issue: HealthIssue) => Promise<void>;
//# sourceMappingURL=history.d.ts.map