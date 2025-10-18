import { type APIEmbed, type RESTPostAPIChannelMessageJSONBody, type RawFile } from "discord.js";
import type { CodexRunnerResult } from "./runner";
import { type DiscordActions } from "./discordActions";
import type { TaskFile } from "../tasks/inbox";
import type { CodexQueueItem } from "./executionQueue";
export type BuildNotificationOptions = {
    stdoutLimit?: number;
    stderrLimit?: number;
    includeHistoryLink?: boolean;
};
export declare const buildRunNotification: (result: CodexRunnerResult, options?: BuildNotificationOptions) => {
    content: string;
    embeds: APIEmbed[];
    components: RESTPostAPIChannelMessageJSONBody["components"];
    files: RawFile[];
    attachmentsSummary: string[];
};
export type NotifyRunOptions = BuildNotificationOptions & {
    channelId?: string | null;
    actions?: DiscordActions;
};
export declare const resolveNotifyChannelId: (options: NotifyRunOptions, envVarName?: string) => string | null;
export declare const notifyRunResult: (result: CodexRunnerResult, options?: NotifyRunOptions) => Promise<void>;
export type NotifyRunFailureContext = {
    task: TaskFile;
    queueId: string;
    queueItem?: CodexQueueItem | null;
    error: {
        message: string;
        stack?: string | null;
    };
    failureRecordPath?: string | null;
};
export declare const notifyRunFailure: (context: NotifyRunFailureContext, options?: NotifyRunOptions) => Promise<void>;
export type NotifyRunCancellationContext = {
    task: TaskFile;
    queueId: string;
    queueItem?: CodexQueueItem | null;
    reason?: string | null;
    runId?: string | null;
};
export declare const notifyRunCancellation: (context: NotifyRunCancellationContext, options?: NotifyRunOptions) => Promise<void>;
//# sourceMappingURL=notifications.d.ts.map