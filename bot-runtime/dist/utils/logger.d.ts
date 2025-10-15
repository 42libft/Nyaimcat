type LogLevel = "info" | "warn" | "error" | "debug";
export declare const log: (level: LogLevel, message: string, meta?: unknown) => void;
export declare const logger: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
    error: (message: string, meta?: unknown) => void;
    debug: (message: string, meta?: unknown) => void;
};
export {};
//# sourceMappingURL=logger.d.ts.map