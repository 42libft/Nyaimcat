type LogLevel = "info" | "warn" | "error" | "debug";

const levelLabels: Record<LogLevel, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
};

const levelPrefixes: Record<LogLevel, string> = {
  info: "\u001b[36m", // cyan
  warn: "\u001b[33m", // yellow
  error: "\u001b[31m", // red
  debug: "\u001b[90m", // gray
};

const LEVEL_RESET = "\u001b[0m";

const isDebugEnabled = () => process.env.NODE_ENV !== "production";

export const log = (level: LogLevel, message: string, meta?: unknown) => {
  if (level === "debug" && !isDebugEnabled()) {
    return;
  }

  const color = levelPrefixes[level];
  const label = levelLabels[level];
  const timestamp = new Date().toISOString();
  const prefix = `${color}[${timestamp}] [${label}]${LEVEL_RESET}`;

  if (meta) {
    console.log(prefix, message, meta);
  } else {
    console.log(prefix, message);
  }
};

export const logger = {
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
};
