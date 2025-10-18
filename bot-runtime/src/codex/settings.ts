const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

export const parseBooleanSetting = (
  value: string | undefined,
  defaultValue: boolean
) => {
  if (typeof value !== "string") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    return defaultValue;
  }

  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return defaultValue;
};

export const isDocsUpdateEnabledByDefault = (
  env: NodeJS.ProcessEnv = process.env
) => {
  return parseBooleanSetting(env.CODEX_DOCS_UPDATE_ENABLED, false);
};

const parseNonNegativeIntSetting = (
  value: string | undefined,
  defaultValue: number
) => {
  if (typeof value !== "string") {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }

  return parsed;
};

export type LongRunNotificationConfig = {
  enabled: boolean;
  initialDelayMs: number;
  intervalMs: number | null;
  maxNotifications: number | null;
};

export const getLongRunNotificationConfig = (
  env: NodeJS.ProcessEnv = process.env
): LongRunNotificationConfig => {
  const enabled = parseBooleanSetting(
    env.CODEX_DISCORD_LONGRUN_NOTIFY_ENABLED,
    true
  );

  const initialDelayMs = parseNonNegativeIntSetting(
    env.CODEX_DISCORD_LONGRUN_NOTIFY_AFTER_MS,
    5 * 60 * 1000
  );

  const intervalMsRaw = parseNonNegativeIntSetting(
    env.CODEX_DISCORD_LONGRUN_NOTIFY_INTERVAL_MS,
    10 * 60 * 1000
  );
  const intervalMs = intervalMsRaw > 0 ? intervalMsRaw : null;

  const maxRaw = parseNonNegativeIntSetting(
    env.CODEX_DISCORD_LONGRUN_NOTIFY_MAX,
    3
  );
  const maxNotifications = maxRaw > 0 ? maxRaw : null;

  return {
    enabled,
    initialDelayMs,
    intervalMs,
    maxNotifications,
  };
};
