import type { NotifyRunOptions } from "./types";

export const resolveNotifyChannelId = (
  options: NotifyRunOptions,
  envVarName = "CODEX_DISCORD_NOTIFY_CHANNEL"
) => {
  if (options.channelId !== undefined) {
    if (options.channelId === null) {
      return null;
    }

    const trimmed = options.channelId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (envVarName) {
    const fromEnv = process.env[envVarName];
    if (fromEnv && fromEnv.length > 0) {
      return fromEnv;
    }
  }

  if (envVarName !== "CODEX_DISCORD_NOTIFY_CHANNEL") {
    const fallback = process.env.CODEX_DISCORD_NOTIFY_CHANNEL;
    if (fallback && fallback.length > 0) {
      return fallback;
    }
  }

  return null;
};
