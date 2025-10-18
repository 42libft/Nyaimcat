export type ScenarioResult = {
    scenario: string;
    success: boolean;
    message?: string;
};
export type HarnessRunResult = {
    success: boolean;
    scenarios: ScenarioResult[];
};
export declare const runCodexQueueHarness: () => Promise<HarnessRunResult>;
//# sourceMappingURL=queueHarness.d.ts.map