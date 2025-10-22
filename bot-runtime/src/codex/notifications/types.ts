import type { DiscordActions } from "../discordActions";
import type { TaskFile } from "../../tasks/inbox";
import type { CodexQueueItem } from "../executionQueue";

export type BuildNotificationOptions = {
  stdoutLimit?: number;
  stderrLimit?: number;
  includeHistoryLink?: boolean;
};

export type NotifyRunOptions = BuildNotificationOptions & {
  channelId?: string | null;
  actions?: DiscordActions;
};

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

export type NotifyRunCancellationContext = {
  task: TaskFile;
  queueId: string;
  queueItem?: CodexQueueItem | null;
  reason?: string | null;
  runId?: string | null;
};
