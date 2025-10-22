import { logger } from "../../utils/logger";
import {
  clearDiscordActionsInitIssue,
  recordDiscordActionsInitFailure,
} from "../../health/checks";
import {
  createDiscordActionsFromEnv,
  type DiscordActions,
} from "../discordActions";
import type { NotifyRunOptions } from "./types";

export const resolveDiscordActions = (
  options: NotifyRunOptions,
  warnMessage: string,
  context: Record<string, unknown>
): DiscordActions | undefined => {
  if (options.actions) {
    return options.actions;
  }

  try {
    const actions = createDiscordActionsFromEnv();
    clearDiscordActionsInitIssue();
    return actions;
  } catch (error) {
    logger.warn(warnMessage, {
      ...context,
      error: error instanceof Error ? error.message : String(error),
    });
    recordDiscordActionsInitFailure(error);
    return undefined;
  }
};
