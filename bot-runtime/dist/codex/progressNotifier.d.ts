import { type NotifyRunOptions } from "./notifications";
import { type LongRunNotificationConfig } from "./settings";
import { type CodexExecutionQueue } from "./executionQueue";
import type { TaskFile } from "../tasks/inbox";
type TrackContext = {
    queueId: string;
    task: TaskFile;
    notifyOptions: NotifyRunOptions;
};
export declare class CodexProgressNotifier {
    private readonly queue;
    private readonly config;
    private readonly tracked;
    private unsubscribe;
    constructor(queue: CodexExecutionQueue, config?: LongRunNotificationConfig);
    track(context: TrackContext): void;
    dispose(): void;
    private handleSnapshot;
    private ensureTimer;
    private scheduleNext;
    private triggerNotification;
    private publishFollowUp;
    private resetEntry;
    private stopTracking;
    private hasRemainingQuota;
}
export {};
//# sourceMappingURL=progressNotifier.d.ts.map