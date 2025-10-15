import { z } from "zod";
export declare const RoleAssignmentSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    emoji: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    assignOnJoin: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const RoleAssignmentsConfigSchema: z.ZodDefault<z.ZodObject<{
    staffRoleIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
    autoAssign: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        assignOnJoin: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
    reactions: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        assignOnJoin: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>>;
}, z.core.$strip>>;
declare const VerifyConfigSchema: z.ZodObject<{
    channel_id: z.ZodString;
    role_id: z.ZodString;
    mode: z.ZodDefault<z.ZodEnum<{
        button: "button";
        reaction: "reaction";
    }>>;
    prompt: z.ZodDefault<z.ZodString>;
    message_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    emoji: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const RolesPanelConfigSchema: z.ZodObject<{
    channel_id: z.ZodString;
    style: z.ZodDefault<z.ZodEnum<{
        reactions: "reactions";
        buttons: "buttons";
        select: "select";
    }>>;
    roles: z.ZodDefault<z.ZodArray<z.ZodObject<{
        role_id: z.ZodString;
        label: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        emoji: z.ZodOptional<z.ZodString>;
        hidden: z.ZodDefault<z.ZodBoolean>;
        sort_order: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    message_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    message_content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const IntroduceSchemaConfigSchema: z.ZodObject<{
    fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
        field_id: z.ZodString;
        label: z.ZodString;
        placeholder: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        required: z.ZodDefault<z.ZodBoolean>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_length: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export declare const IntroduceConfigSchema: z.ZodObject<{
    channel_id: z.ZodString;
    mention_role_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
    embed_title: z.ZodDefault<z.ZodString>;
    footer_text: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const SettingsConfigSchema: z.ZodDefault<z.ZodObject<{
    locale: z.ZodOptional<z.ZodString>;
    timezone: z.ZodOptional<z.ZodString>;
    member_index_mode: z.ZodOptional<z.ZodString>;
    member_count_strategy: z.ZodOptional<z.ZodEnum<{
        human_only: "human_only";
        include_bots: "include_bots";
    }>>;
    api_base_url: z.ZodOptional<z.ZodString>;
    show_join_alerts: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>>;
export declare const ConfigSchema: z.ZodObject<{
    guild: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        ownerId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    channels: z.ZodObject<{
        auditLog: z.ZodString;
        welcome: z.ZodOptional<z.ZodString>;
        introduce: z.ZodOptional<z.ZodString>;
        verify: z.ZodOptional<z.ZodString>;
        guideline: z.ZodOptional<z.ZodString>;
        rolesPanel: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    roleAssignments: z.ZodDefault<z.ZodObject<{
        staffRoleIds: z.ZodDefault<z.ZodArray<z.ZodString>>;
        autoAssign: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            emoji: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            assignOnJoin: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>>;
        reactions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            emoji: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            assignOnJoin: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    features: z.ZodDefault<z.ZodObject<{
        welcomeMessage: z.ZodDefault<z.ZodBoolean>;
        autoRoles: z.ZodDefault<z.ZodBoolean>;
        guidelineSync: z.ZodDefault<z.ZodBoolean>;
        scrimHelper: z.ZodDefault<z.ZodBoolean>;
        countBotsInMemberCount: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    onboarding: z.ZodDefault<z.ZodObject<{
        guideUrl: z.ZodOptional<z.ZodString>;
        guideLabel: z.ZodDefault<z.ZodString>;
        rolesButtonLabel: z.ZodDefault<z.ZodString>;
        rolesChannelId: z.ZodOptional<z.ZodString>;
        dm: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            template: z.ZodOptional<z.ZodString>;
            fallbackMessage: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timezone: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>;
    embeds: z.ZodDefault<z.ZodObject<{
        welcomeTemplate: z.ZodOptional<z.ZodString>;
        guidelineTemplate: z.ZodOptional<z.ZodString>;
        verifyTemplate: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    verify: z.ZodOptional<z.ZodObject<{
        channel_id: z.ZodString;
        role_id: z.ZodString;
        mode: z.ZodDefault<z.ZodEnum<{
            button: "button";
            reaction: "reaction";
        }>>;
        prompt: z.ZodDefault<z.ZodString>;
        message_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        emoji: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    roles: z.ZodOptional<z.ZodObject<{
        channel_id: z.ZodString;
        style: z.ZodDefault<z.ZodEnum<{
            reactions: "reactions";
            buttons: "buttons";
            select: "select";
        }>>;
        roles: z.ZodDefault<z.ZodArray<z.ZodObject<{
            role_id: z.ZodString;
            label: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            emoji: z.ZodOptional<z.ZodString>;
            hidden: z.ZodDefault<z.ZodBoolean>;
            sort_order: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>>;
        message_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        message_content: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    role_emoji_map: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    introduce: z.ZodOptional<z.ZodObject<{
        channel_id: z.ZodString;
        mention_role_ids: z.ZodDefault<z.ZodArray<z.ZodString>>;
        embed_title: z.ZodDefault<z.ZodString>;
        footer_text: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
    introduce_schema: z.ZodOptional<z.ZodObject<{
        fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
            field_id: z.ZodString;
            label: z.ZodString;
            placeholder: z.ZodOptional<z.ZodNullable<z.ZodString>>;
            required: z.ZodDefault<z.ZodBoolean>;
            enabled: z.ZodDefault<z.ZodBoolean>;
            max_length: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    settings: z.ZodDefault<z.ZodObject<{
        locale: z.ZodOptional<z.ZodString>;
        timezone: z.ZodOptional<z.ZodString>;
        member_index_mode: z.ZodOptional<z.ZodString>;
        member_count_strategy: z.ZodOptional<z.ZodEnum<{
            human_only: "human_only";
            include_bots: "include_bots";
        }>>;
        api_base_url: z.ZodOptional<z.ZodString>;
        show_join_alerts: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BotConfig = z.infer<typeof ConfigSchema>;
export type VerifyConfig = z.infer<typeof VerifyConfigSchema>;
export type RolesPanelConfig = z.infer<typeof RolesPanelConfigSchema>;
export type IntroduceConfig = z.infer<typeof IntroduceConfigSchema>;
export type IntroduceSchemaConfig = z.infer<typeof IntroduceSchemaConfigSchema>;
export {};
//# sourceMappingURL=schema.d.ts.map