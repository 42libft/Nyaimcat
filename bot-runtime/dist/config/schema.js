"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.SettingsConfigSchema = exports.IntroduceConfigSchema = exports.IntroduceSchemaConfigSchema = exports.RolesPanelConfigSchema = exports.RoleAssignmentsConfigSchema = exports.RoleAssignmentSchema = void 0;
const zod_1 = require("zod");
const SnowflakeSchema = zod_1.z
    .string()
    .min(1, "Discord ID は空にできません");
exports.RoleAssignmentSchema = zod_1.z.object({
    id: SnowflakeSchema,
    label: zod_1.z.string().min(1, "ロール名は必須です"),
    emoji: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    assignOnJoin: zod_1.z.boolean().default(false),
});
exports.RoleAssignmentsConfigSchema = zod_1.z
    .object({
    staffRoleIds: zod_1.z.array(SnowflakeSchema).default([]),
    autoAssign: zod_1.z.array(exports.RoleAssignmentSchema).default([]),
    reactions: zod_1.z.array(exports.RoleAssignmentSchema).default([]),
})
    .default({
    staffRoleIds: [],
    autoAssign: [],
    reactions: [],
});
const VerifyConfigSchema = zod_1.z.object({
    channel_id: SnowflakeSchema,
    role_id: SnowflakeSchema,
    mode: zod_1.z.enum(["button", "reaction"]).default("button"),
    prompt: zod_1.z
        .string()
        .min(1, "認証メッセージ本文は必須です")
        .max(2000)
        .default("ボタンを押して認証を完了してください。"),
    message_id: SnowflakeSchema.nullable().optional(),
    emoji: zod_1.z.string().optional(),
});
const RolePanelEntrySchema = zod_1.z.object({
    role_id: SnowflakeSchema,
    label: zod_1.z.string().min(1).max(80),
    description: zod_1.z.string().max(200).optional(),
    emoji: zod_1.z.string().max(64).optional(),
    hidden: zod_1.z.boolean().default(false),
    sort_order: zod_1.z.number().int().default(0),
});
exports.RolesPanelConfigSchema = zod_1.z.object({
    channel_id: SnowflakeSchema,
    style: zod_1.z.enum(["buttons", "select", "reactions"]).default("buttons"),
    roles: zod_1.z.array(RolePanelEntrySchema).default([]),
    message_id: SnowflakeSchema.nullable().optional(),
    message_content: zod_1.z.string().max(2000).nullable().optional(),
});
const IntroduceFieldSchema = zod_1.z.object({
    field_id: zod_1.z.string().min(1).max(32),
    label: zod_1.z.string().min(1).max(45),
    placeholder: zod_1.z.string().max(100).nullable().optional(),
    required: zod_1.z.boolean().default(true),
    enabled: zod_1.z.boolean().default(true),
    max_length: zod_1.z.number().int().min(1).max(1024).default(300),
});
exports.IntroduceSchemaConfigSchema = zod_1.z.object({
    fields: zod_1.z.array(IntroduceFieldSchema).default([]),
});
exports.IntroduceConfigSchema = zod_1.z.object({
    channel_id: SnowflakeSchema,
    mention_role_ids: zod_1.z.array(SnowflakeSchema).default([]),
    embed_title: zod_1.z.string().min(1).max(256).default("自己紹介"),
    footer_text: zod_1.z.string().max(64).nullable().optional(),
});
exports.SettingsConfigSchema = zod_1.z
    .object({
    locale: zod_1.z.string().optional(),
    timezone: zod_1.z.string().optional(),
    member_index_mode: zod_1.z.string().optional(),
    member_count_strategy: zod_1.z.enum(["human_only", "include_bots"]).optional(),
    api_base_url: zod_1.z.string().optional(),
    show_join_alerts: zod_1.z.boolean().optional(),
})
    .default({});
exports.ConfigSchema = zod_1.z.object({
    guild: zod_1.z.object({
        id: SnowflakeSchema,
        name: zod_1.z.string().optional(),
        ownerId: SnowflakeSchema.optional(),
    }),
    channels: zod_1.z.object({
        auditLog: SnowflakeSchema,
        welcome: SnowflakeSchema.optional(),
        introduce: SnowflakeSchema.optional(),
        verify: SnowflakeSchema.optional(),
        guideline: SnowflakeSchema.optional(),
        rolesPanel: SnowflakeSchema.optional(),
    }),
    roleAssignments: exports.RoleAssignmentsConfigSchema,
    features: zod_1.z
        .object({
        welcomeMessage: zod_1.z.boolean().default(false),
        autoRoles: zod_1.z.boolean().default(false),
        guidelineSync: zod_1.z.boolean().default(false),
        scrimHelper: zod_1.z.boolean().default(false),
        countBotsInMemberCount: zod_1.z.boolean().default(false),
    })
        .default({
        welcomeMessage: false,
        autoRoles: false,
        guidelineSync: false,
        scrimHelper: false,
        countBotsInMemberCount: false,
    }),
    onboarding: zod_1.z
        .object({
        guideUrl: zod_1.z.string().url().optional(),
        guideLabel: zod_1.z.string().min(1).default("サーバーガイドを見る"),
        rolesButtonLabel: zod_1.z.string().min(1).default("ロールを選ぶ"),
        rolesChannelId: SnowflakeSchema.optional(),
        dm: zod_1.z
            .object({
            enabled: zod_1.z.boolean().default(true),
            template: zod_1.z.string().optional(),
            fallbackMessage: zod_1.z.string().optional(),
        })
            .default({ enabled: true }),
        timezone: zod_1.z.string().default("Asia/Tokyo"),
    })
        .default({
        guideLabel: "サーバーガイドを見る",
        rolesButtonLabel: "ロールを選ぶ",
        dm: { enabled: true },
        timezone: "Asia/Tokyo",
    }),
    embeds: zod_1.z
        .object({
        welcomeTemplate: zod_1.z.string().optional(),
        guidelineTemplate: zod_1.z.string().optional(),
        verifyTemplate: zod_1.z.string().optional(),
    })
        .default({}),
    verify: VerifyConfigSchema.optional(),
    roles: exports.RolesPanelConfigSchema.optional(),
    role_emoji_map: zod_1.z.record(SnowflakeSchema, zod_1.z.string()).default({}),
    introduce: exports.IntroduceConfigSchema.optional(),
    introduce_schema: exports.IntroduceSchemaConfigSchema.optional(),
    settings: exports.SettingsConfigSchema,
});
//# sourceMappingURL=schema.js.map