import { z } from "zod";

const trimString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === "string" ? value.trim() : value), schema);

const trimToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    }
    return value;
  }, schema);

const SnowflakeSchema = z.string().min(1, "Discord ID は空にできません");

const MemberIndexModeSchema = z.enum(["include_bots", "exclude_bots"]);

const WelcomeModeSchema = z.enum(["embed", "card"]);

const WelcomeButtonSchema = z.object({
  label: z.string().min(1).max(80),
  target: z.enum(["url", "channel"]),
  value: z.string().min(1).max(256),
  emoji: z.string().max(64).optional().nullable(),
});

const WelcomeCardConfigSchema = z
  .object({
    background_image: trimString(z.string().min(1)),
    font_path: z.string().min(1).nullable().optional(),
    font_family: z.string().max(120).nullable().optional(),
    title_template: trimString(
      z
        .string()
        .max(160)
        .default("Welcome to {{guild_name}}")
    ),
    subtitle_template: z
      .string()
      .min(1)
      .max(160)
      .default("Member #{{member_index}}"),
    body_template: z.string().max(400).nullable().optional(),
    text_color: z.string().min(1).default("#ffffff"),
    accent_color: z.string().min(1).default("#fee75c"),
    overlay_color: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .default("rgba(0, 0, 0, 0.45)"),
    avatar_border_color: z.string().min(1).nullable().optional(),
    avatar_offset_x: z.number().int().min(-512).max(512).default(0),
    avatar_offset_y: z.number().int().min(-576).max(576).default(-96),
    title_offset_x: z.number().int().min(-512).max(512).default(0),
    title_offset_y: z.number().int().min(-200).max(400).default(20),
    title_font_size: z.number().int().min(12).max(120).default(64),
    subtitle_offset_x: z.number().int().min(-512).max(512).default(0),
    subtitle_offset_y: z.number().int().min(-200).max(400).default(50),
    subtitle_font_size: z.number().int().min(12).max(100).default(44),
    body_offset_x: z.number().int().min(-512).max(512).default(0),
    body_offset_y: z.number().int().min(-400).max(600).default(50),
    body_font_size: z.number().int().min(12).max(80).default(28),
  })
  .strict();

const WelcomeConfigSchema = z
  .object({
    channel_id: SnowflakeSchema,
    title_template: trimToUndefined(
      z
        .string()
        .min(1)
        .max(256)
        .default("ようこそ、{{username}} さん！")
    ),
    description_template: z
      .string()
      .min(1)
      .max(2000)
      .default("あなたは **#{{member_index}}** 人目のメンバーです。"),
    message_template: z
      .string()
      .min(1)
      .max(2000)
      .default("{{mention}}"),
    mode: WelcomeModeSchema.default("embed"),
    member_index_mode: MemberIndexModeSchema.default("exclude_bots"),
    join_field_label: z.string().max(32).default("加入日時"),
    join_timezone: z.string().default("Asia/Tokyo"),
    buttons: z.array(WelcomeButtonSchema).default([]),
    footer_text: z.string().max(64).default("Nyaimlab"),
    thread_name_template: z.string().max(100).nullable().optional(),
    card: WelcomeCardConfigSchema.nullable().optional(),
  })
  .strict();

export const RoleAssignmentSchema = z.object({
  id: SnowflakeSchema,
  label: z.string().min(1, "ロール名は必須です"),
  emoji: z.string().nullable().optional(),
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
  emoji: z.string().nullable().optional(),
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

const RagModeSchema = z.enum(["help", "coach", "chat"]);

const DEFAULT_RAG_PROMPTS = {
  base:
    "あなたは Nyaimlab Discord サーバーで暮らす中性的な猫のキャラクターボットとして振る舞ってください。" +
    "相手に寄り添い、尊重しながら返答してください。" +
    "ヘルプやアドバイス以外の雑談では、短く自然なチャット文を意識してください。" +
    "絵文字や顔文字は使わないでください。" +
    "自分が AI や ChatGPT であると説明したり、注意書きや免責事項を付けたりしないでください。" +
    "求められない限り長文にならないようにし、1〜2文程度で要点だけを返してください。",
  help:
    "あなたは Nyaimlab サーバーの丁寧なヘルプ担当です。" +
    "わかりやすく落ち着いたトーンで、手順や理由を整理して伝えてください。" +
    "語尾は基本的に敬語ですが、たまに柔らかく「〜にゃ」と添えても構いません。" +
    "絵文字や顔文字は使わず、文末は句読点またはにゃ語尾にしてください。",
  coach:
    "あなたは Aim やゲーム戦略のコーチ役です。" +
    "中性的な猫のキャラクターとして、ポジティブに励ましつつ提案をしてください。" +
    "アドバイスは実践的かつ簡潔にまとめ、語尾は「〜にゃ」「〜にゃー」などを使いつつも行数は短めに保ってください。" +
    "絵文字は使用せず、親しい友達に話す感覚で表現してください。",
  chat:
    "一人称は「ボク」、語尾には必ず「〜にゃ」「〜にゃー」「〜にゃ〜」「〜にゃ！」「〜にゃ…」のいずれかを付けてください。" +
    "絵文字は使わず、雑談は1〜2行程度で短く、友達感覚で自然に返答してください。",
} as const;

const RagPromptsSchema = z
  .object({
    base: z.string().min(1),
    help: z.string().min(1),
    coach: z.string().min(1),
    chat: z.string().min(1),
  })
  .default({ ...DEFAULT_RAG_PROMPTS });

const DEFAULT_RAG_FEELINGS = {
  excitement: 0.5,
  empathy: 0.5,
  probability: 0.25,
  cooldown_minutes: 15,
  default_mode: "chat",
} as const;

const RagFeelingsSchema = z
  .object({
    excitement: z.number().min(0).max(1).default(DEFAULT_RAG_FEELINGS.excitement),
    empathy: z.number().min(0).max(1).default(DEFAULT_RAG_FEELINGS.empathy),
    probability: z.number().min(0).max(1).default(DEFAULT_RAG_FEELINGS.probability),
    cooldown_minutes: z.number().min(0).default(DEFAULT_RAG_FEELINGS.cooldown_minutes),
    default_mode: RagModeSchema.default(DEFAULT_RAG_FEELINGS.default_mode),
  })
  .default({ ...DEFAULT_RAG_FEELINGS });

const RagShortTermSchema = z
  .object({
    excluded_channels: z.array(SnowflakeSchema).default([]),
  })
  .default({ excluded_channels: [] });

const RagConfigSchema = z
  .object({
    prompts: RagPromptsSchema,
    feelings: RagFeelingsSchema,
    short_term: RagShortTermSchema,
  })
  .default({
    prompts: { ...DEFAULT_RAG_PROMPTS },
    feelings: { ...DEFAULT_RAG_FEELINGS },
    short_term: { excluded_channels: [] },
  });

export const SettingsConfigSchema = z
  .object({
    locale: z.string().optional(),
    timezone: z.string().optional(),
    member_index_mode: z.string().optional(),
    member_count_strategy: z.enum(["human_only", "include_bots"]).optional(),
    api_base_url: z.string().nullable().optional(),
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
  welcome: WelcomeConfigSchema.optional(),
  rag: RagConfigSchema.optional(),
});

export type BotConfig = z.infer<typeof ConfigSchema>;
export type VerifyConfig = z.infer<typeof VerifyConfigSchema>;
export type RolesPanelConfig = z.infer<typeof RolesPanelConfigSchema>;
export type IntroduceConfig = z.infer<typeof IntroduceConfigSchema>;
export type IntroduceSchemaConfig = z.infer<typeof IntroduceSchemaConfigSchema>;
export type WelcomeConfig = z.infer<typeof WelcomeConfigSchema>;
export type WelcomeCardConfig = z.infer<typeof WelcomeCardConfigSchema>;
export type RagConfig = z.infer<typeof RagConfigSchema>;
