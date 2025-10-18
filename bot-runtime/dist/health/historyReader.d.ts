import { type HealthHistoryRecord } from "./history";
export type HealthHistoryRecordWithPath = {
    filePath: string;
    record: HealthHistoryRecord;
};
export type SkippedHealthHistoryFile = {
    filePath: string;
    reason: string;
};
export declare const loadHealthHistoryRecords: () => Promise<{
    records: HealthHistoryRecordWithPath[];
    skipped: SkippedHealthHistoryFile[];
}>;
//# sourceMappingURL=historyReader.d.ts.map