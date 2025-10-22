import { z } from "zod";

const SnowflakeSchema = z
  .string()
  .min(1, "Discord ID は空にできません");

export const RoleAssignmentSchema = z.object({
  id: SnowflakeSchema,
  label: z.string().min(1, "ロール名は必須です"),
  emoji: z.string().optional(),
  description: z.string().optional(),
  assignOnJoin: z.boolean().default(false),
});

export const RoleAssignmentsConfigSchema = z
  .object({
    staffRoleIds: z.array(SnowflakeSchema).default([]),
    autoAssign: z.array(RoleAssignmentSchema).default([]),
    reactions: z.array(RoleAssignmentSchema).default([]),
  })
  .default({
    staffRoleIds: [],
    autoAssign: [],
    reactions: [],
  });

const VerifyConfigSchema = z.object({
  channel_id: SnowflakeSchema,
  role_id: SnowflakeSchema,
  mode: z.enum(["button", "reaction"]).default("button"),
  prompt: z
    .string()
    .min(1, "認証メッセージ本文は必須です")
    .max(2000)
    .default("ボタンを押して認証を完了してください。"),
  message_id: SnowflakeSchema.nullable().optional(),
  emoji: z.string().optional(),
});

const RolePanelEntrySchema = z.object({
  role_id: SnowflakeSchema,
  label: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  emoji: z.string().max(64).optional(),
  hidden: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const RolesPanelConfigSchema = z.object({
  channel_id: SnowflakeSchema,
  style: z.enum(["buttons", "select", "reactions"]).default("buttons"),
  roles: z.array(RolePanelEntrySchema).default([]),
  message_id: SnowflakeSchema.nullable().optional(),
  message_content: z.string().max(2000).nullable().optional(),
});

const IntroduceFieldSchema = z.object({
  field_id: z.string().min(1).max(32),
  label: z.string().min(1).max(45),
  placeholder: z.string().max(100).nullable().optional(),
  required: z.boolean().default(true),
  enabled: z.boolean().default(true),
  max_length: z.number().int().min(1).max(1024).default(300),
});

export const IntroduceSchemaConfigSchema = z.object({
  fields: z.array(IntroduceFieldSchema).default([]),
});

export const IntroduceConfigSchema = z.object({
  channel_id: SnowflakeSchema,
  mention_role_ids: z.array(SnowflakeSchema).default([]),
  embed_title: z.string().max(256).default("自己紹介"),
  footer_text: z.string().max(64).nullable().optional(),
});

export const SettingsConfigSchema = z
  .object({
    locale: z.string().optional(),
    timezone: z.string().optional(),
    member_index_mode: z.string().optional(),
    member_count_strategy: z.enum(["human_only", "include_bots"]).optional(),
    api_base_url: z.string().optional(),
    show_join_alerts: z.boolean().optional(),
  })
  .default({});

export const ConfigSchema = z.object({
  guild: z.object({
    id: SnowflakeSchema,
    name: z.string().optional(),
    ownerId: SnowflakeSchema.optional(),
  }),
  channels: z.object({
    auditLog: SnowflakeSchema,
    welcome: SnowflakeSchema.optional(),
    introduce: SnowflakeSchema.optional(),
    verify: SnowflakeSchema.optional(),
    guideline: SnowflakeSchema.optional(),
    rolesPanel: SnowflakeSchema.optional(),
  }),
  roleAssignments: RoleAssignmentsConfigSchema,
  features: z
    .object({
      welcomeMessage: z.boolean().default(false),
      autoRoles: z.boolean().default(false),
      guidelineSync: z.boolean().default(false),
      scrimHelper: z.boolean().default(false),
      countBotsInMemberCount: z.boolean().default(false),
    })
    .default({
      welcomeMessage: false,
      autoRoles: false,
      guidelineSync: false,
      scrimHelper: false,
      countBotsInMemberCount: false,
    }),
  onboarding: z
    .object({
      guideUrl: z.string().url().optional(),
      guideLabel: z.string().min(1).default("サーバーガイドを見る"),
      rolesButtonLabel: z.string().min(1).default("ロールを選ぶ"),
      rolesChannelId: SnowflakeSchema.optional(),
      dm: z
        .object({
          enabled: z.boolean().default(true),
          template: z.string().optional(),
          fallbackMessage: z.string().optional(),
        })
        .default({ enabled: true }),
      timezone: z.string().default("Asia/Tokyo"),
    })
    .default({
      guideLabel: "サーバーガイドを見る",
      rolesButtonLabel: "ロールを選ぶ",
      dm: { enabled: true },
      timezone: "Asia/Tokyo",
    }),
  embeds: z
    .object({
      welcomeTemplate: z.string().optional(),
      guidelineTemplate: z.string().optional(),
      verifyTemplate: z.string().optional(),
    })
    .default({}),
  verify: VerifyConfigSchema.optional(),
  roles: RolesPanelConfigSchema.optional(),
  role_emoji_map: z.record(SnowflakeSchema, z.string()).default({}),
  introduce: IntroduceConfigSchema.optional(),
  introduce_schema: IntroduceSchemaConfigSchema.optional(),
  settings: SettingsConfigSchema,
});

export type BotConfig = z.infer<typeof ConfigSchema>;
export type VerifyConfig = z.infer<typeof VerifyConfigSchema>;
export type RolesPanelConfig = z.infer<typeof RolesPanelConfigSchema>;
export type IntroduceConfig = z.infer<typeof IntroduceConfigSchema>;
export type IntroduceSchemaConfig = z.infer<typeof IntroduceSchemaConfigSchema>;
