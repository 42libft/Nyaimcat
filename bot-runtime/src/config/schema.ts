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
    })
    .default({
      welcomeMessage: false,
      autoRoles: false,
      guidelineSync: false,
      scrimHelper: false,
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
