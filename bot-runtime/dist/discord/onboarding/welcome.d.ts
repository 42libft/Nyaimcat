import { GuildMember, MessageFlags, type MessageCreateOptions } from "discord.js";
import type { BotConfig } from "../../config";
export declare const WELCOME_ROLES_BUTTON_ID = "onboarding:roles_jump";
type BuildWelcomeMessageOptions = {
    member: GuildMember;
    config: BotConfig;
    memberIndex: number;
};
export declare const buildWelcomeMessage: ({ member, config, memberIndex, }: BuildWelcomeMessageOptions) => Promise<MessageCreateOptions>;
export declare const createRolesJumpResponse: (config: BotConfig) => {
    readonly content: "ロールチャンネルが設定されていません。運営にお問い合わせください。";
    readonly flags: MessageFlags.Ephemeral;
} | {
    readonly content: `\u30ED\u30FC\u30EB\u306E\u8A2D\u5B9A\u306F\u3053\u3061\u3089\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044 \u2192 <#${string}>`;
    readonly flags: MessageFlags.Ephemeral;
};
export declare const formatDmMessage: (member: GuildMember, config: BotConfig, memberIndex: number) => string;
export declare const buildDmFallbackMessage: (member: GuildMember, config: BotConfig, memberIndex: number) => string;
export {};
//# sourceMappingURL=welcome.d.ts.map