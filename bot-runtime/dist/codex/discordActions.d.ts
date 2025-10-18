import { type APIEmbed, type APIAllowedMentions, type RESTPostAPIChannelMessageJSONBody, type RawFile } from "discord.js";
export type DiscordActionsConfig = {
    token: string;
    allowedChannelIds: string[];
    defaultAllowedMentions?: APIAllowedMentions;
    restVersion?: string;
};
export type PublishMessageOptions = {
    content?: string;
    embeds?: APIEmbed[];
    allowedMentions?: APIAllowedMentions;
    components?: RESTPostAPIChannelMessageJSONBody["components"];
    flags?: RESTPostAPIChannelMessageJSONBody["flags"];
    files?: RawFile[];
};
export declare class DiscordActions {
    private readonly rest;
    private readonly allowedChannelIds;
    private readonly defaultAllowedMentions;
    private readonly allowAllChannels;
    constructor(config: DiscordActionsConfig);
    getAllowedChannels(): string[];
    isChannelAllowed(channelId: string): boolean;
    private ensureChannelAllowed;
    publishMessage(channelId: string, payload: PublishMessageOptions): Promise<import("discord.js").APIMessage>;
}
export declare const loadDiscordActionsConfigFromEnv: (env?: NodeJS.ProcessEnv) => DiscordActionsConfig;
export declare const createDiscordActionsFromEnv: (env?: NodeJS.ProcessEnv) => DiscordActions;
//# sourceMappingURL=discordActions.d.ts.map