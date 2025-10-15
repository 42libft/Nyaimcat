import { z } from "zod";

const SnowflakeSchema = z
  .string()
  .min(1, "Discord ID は空にできません");

export const RoleConfigSchema = z.object({
  id: SnowflakeSchema,
  label: z.string().min(1, "ロール名は必須です"),
  emoji: z.string().optional(),
  description: z.string().optional(),
  assignOnJoin: z.boolean().default(false),
});

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
  roles: z
    .object({
      staffRoleIds: z.array(SnowflakeSchema).default([]),
      autoAssign: z.array(RoleConfigSchema).default([]),
      reactions: z.array(RoleConfigSchema).default([]),
    })
    .default({
      staffRoleIds: [],
      autoAssign: [],
      reactions: [],
    }),
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
});

export type BotConfig = z.infer<typeof ConfigSchema>;
