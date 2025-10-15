"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.log = void 0;
const levelLabels = {
    info: "INFO",
    warn: "WARN",
    error: "ERROR",
    debug: "DEBUG",
};
const levelPrefixes = {
    info: "\u001b[36m", // cyan
    warn: "\u001b[33m", // yellow
    error: "\u001b[31m", // red
    debug: "\u001b[90m", // gray
};
const LEVEL_RESET = "\u001b[0m";
const isDebugEnabled = () => process.env.NODE_ENV !== "production";
const log = (level, message, meta) => {
    if (level === "debug" && !isDebugEnabled()) {
        return;
    }
    const color = levelPrefixes[level];
    const label = levelLabels[level];
    const timestamp = new Date().toISOString();
    const prefix = `${color}[${timestamp}] [${label}]${LEVEL_RESET}`;
    if (meta) {
        console.log(prefix, message, meta);
    }
    else {
        console.log(prefix, message);
    }
};
exports.log = log;
exports.logger = {
    info: (message, meta) => (0, exports.log)("info", message, meta),
    warn: (message, meta) => (0, exports.log)("warn", message, meta),
    error: (message, meta) => (0, exports.log)("error", message, meta),
    debug: (message, meta) => (0, exports.log)("debug", message, meta),
};
//# sourceMappingURL=logger.js.map