import { type ChatInputCommandInteraction } from "discord.js";
export type CodexAccessConfig = {
    allowedUserIds: Set<string>;
    allowedRoleIds: Set<string>;
    requireManageGuild: boolean;
};
export declare const loadCodexAccessConfig: (env?: NodeJS.ProcessEnv) => CodexAccessConfig;
export declare const getCodexAccessConfig: () => CodexAccessConfig;
export type CodexAccessCheckResult = {
    ok: true;
} | {
    ok: false;
    reason: "guild_only" | "missing_manage_guild" | "allowlist";
    message: string;
};
export declare const checkCodexCommandAccess: (interaction: ChatInputCommandInteraction) => CodexAccessCheckResult;
//# sourceMappingURL=accessControl.d.ts.map