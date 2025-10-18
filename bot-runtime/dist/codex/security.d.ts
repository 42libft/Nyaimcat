type CodexCliCommand = {
    bin: string;
    args: string[];
    cwd: string;
};
type CodexCliSafetyConfig = {
    allowedBinBasenames: Set<string>;
    allowedBinPaths: Set<string>;
    allowedWorkdirs: string[];
    allowedPathRoots: string[];
    allowedSubcommands: Set<string>;
    blockedFlags: Set<string>;
    pathOptionNames: Set<string>;
    pathOptionPatterns: RegExp[];
};
export declare const loadCodexCliSafetyConfig: (env?: NodeJS.ProcessEnv) => CodexCliSafetyConfig;
export declare const getCodexCliSafetyConfig: () => CodexCliSafetyConfig;
export declare const enforceCodexCliSafety: (command: CodexCliCommand, config?: CodexCliSafetyConfig) => CodexCliCommand;
export type { CodexCliCommand, CodexCliSafetyConfig };
//# sourceMappingURL=security.d.ts.map