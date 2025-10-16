import { type ZodIssue } from "zod";
import { BotConfig } from "./schema";
export type ConfigLoadSuccess = {
    ok: true;
    path: string;
    config: BotConfig;
};
export type ConfigLoadFailure = {
    ok: false;
    path: string;
    message: string;
    issues?: ZodIssue[];
};
export type ConfigLoadResult = ConfigLoadSuccess | ConfigLoadFailure;
export type LoadConfigOptions = {
    logSuccess?: boolean;
    successLogLevel?: "info" | "debug";
};
export declare const loadConfig: (customPath?: string, options?: LoadConfigOptions) => Promise<ConfigLoadResult>;
export declare const requireConfig: (customPath?: string) => Promise<BotConfig>;
//# sourceMappingURL=loader.d.ts.map