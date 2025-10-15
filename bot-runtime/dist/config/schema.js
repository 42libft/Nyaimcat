"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.RoleConfigSchema = void 0;
const zod_1 = require("zod");
const SnowflakeSchema = zod_1.z
    .string()
    .min(1, "Discord ID は空にできません");
exports.RoleConfigSchema = zod_1.z.object({
    id: SnowflakeSchema,
    label: zod_1.z.string().min(1, "ロール名は必須です"),
    emoji: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    assignOnJoin: zod_1.z.boolean().default(false),
});
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
    roles: zod_1.z
        .object({
        staffRoleIds: zod_1.z.array(SnowflakeSchema).default([]),
        autoAssign: zod_1.z.array(exports.RoleConfigSchema).default([]),
        reactions: zod_1.z.array(exports.RoleConfigSchema).default([]),
    })
        .default({
        staffRoleIds: [],
        autoAssign: [],
        reactions: [],
    }),
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
});
//# sourceMappingURL=schema.js.map