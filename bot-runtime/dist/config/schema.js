"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = exports.SettingsConfigSchema = exports.IntroduceConfigSchema = exports.IntroduceSchemaConfigSchema = exports.RolesPanelConfigSchema = exports.RoleAssignmentsConfigSchema = exports.RoleAssignmentSchema = void 0;
const zod_1 = require("zod");
const SnowflakeSchema = zod_1.z
    .string()
    .min(1, "Discord ID は空にできません");
const MemberIndexModeSchema = zod_1.z.enum(["include_bots", "exclude_bots"]);
const WelcomeModeSchema = zod_1.z.enum(["embed", "card"]);
const WelcomeButtonSchema = zod_1.z.object({
    label: zod_1.z.string().min(1).max(80),
    target: zod_1.z.enum(["url", "channel"]),
    value: zod_1.z.string().min(1).max(256),
    emoji: zod_1.z.string().max(64).optional().nullable(),
});
const WelcomeCardConfigSchema = zod_1.z
    .object({
    background_image: zod_1.z.string().min(1),
    font_path: zod_1.z.string().min(1).nullable().optional(),
    font_family: zod_1.z.string().max(120).nullable().optional(),
    title_template: zod_1.z
        .string()
        .min(1)
        .max(160)
        .default("Welcome to {{guild_name}}"),
    subtitle_template: zod_1.z
        .string()
        .min(1)
        .max(160)
        .default("Member #{{member_index}}"),
    body_template: zod_1.z.string().max(400).nullable().optional(),
    text_color: zod_1.z.string().min(1).default("#ffffff"),
    accent_color: zod_1.z.string().min(1).default("#fee75c"),
    overlay_color: zod_1.z
        .string()
        .min(1)
        .nullable()
        .optional()
        .default("rgba(0, 0, 0, 0.45)"),
    avatar_border_color: zod_1.z.string().min(1).nullable().optional(),
    avatar_offset_x: zod_1.z.number().int().min(-512).max(512).default(0),
    avatar_offset_y: zod_1.z.number().int().min(-576).max(576).default(-96),
    title_offset_x: zod_1.z.number().int().min(-512).max(512).default(0),
    title_offset_y: zod_1.z.number().int().min(-200).max(400).default(20),
    title_font_size: zod_1.z.number().int().min(12).max(120).default(64),
    subtitle_offset_x: zod_1.z.number().int().min(-512).max(512).default(0),
    subtitle_offset_y: zod_1.z.number().int().min(-200).max(400).default(50),
    subtitle_font_size: zod_1.z.number().int().min(12).max(100).default(44),
    body_offset_x: zod_1.z.number().int().min(-512).max(512).default(0),
    body_offset_y: zod_1.z.number().int().min(-400).max(600).default(50),
    body_font_size: zod_1.z.number().int().min(12).max(80).default(28),
})
    .strict();
const WelcomeConfigSchema = zod_1.z
    .object({
    channel_id: SnowflakeSchema,
    title_template: zod_1.z
        .string()
        .min(1)
        .max(256)
        .default("ようこそ、{{username}} さん！"),
    description_template: zod_1.z
        .string()
        .min(1)
        .max(2000)
        .default("あなたは **#{{member_index}}** 人目のメンバーです。"),
    message_template: zod_1.z
        .string()
        .min(1)
        .max(2000)
        .default("{{mention}}"),
    mode: WelcomeModeSchema.default("embed"),
    member_index_mode: MemberIndexModeSchema.default("exclude_bots"),
    join_field_label: zod_1.z.string().max(32).default("加入日時"),
    join_timezone: zod_1.z.string().default("Asia/Tokyo"),
    buttons: zod_1.z.array(WelcomeButtonSchema).default([]),
    footer_text: zod_1.z.string().max(64).default("Nyaimlab"),
    thread_name_template: zod_1.z.string().max(100).nullable().optional(),
    card: WelcomeCardConfigSchema.nullable().optional(),
})
    .strict();
exports.RoleAssignmentSchema = zod_1.z.object({
    id: SnowflakeSchema,
    label: zod_1.z.string().min(1, "ロール名は必須です"),
    emoji: zod_1.z.string().nullable().optional(),
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
    emoji: zod_1.z.string().nullable().optional(),
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
    embed_title: zod_1.z.string().max(256).default("自己紹介"),
    footer_text: zod_1.z.string().max(64).nullable().optional(),
});
const RagModeSchema = zod_1.z.enum(["help", "coach", "chat"]);
const DEFAULT_RAG_PROMPTS = {
    base: "あなたは Nyaimlab Discord サーバーで暮らす中性的な猫のキャラクターボットとして振る舞ってください。" +
        "相手に寄り添い、尊重しながら返答してください。" +
        "ヘルプやアドバイス以外の雑談では、短く自然なチャット文を意識してください。" +
        "絵文字や顔文字は使わないでください。" +
        "自分が AI や ChatGPT であると説明したり、注意書きや免責事項を付けたりしないでください。" +
        "求められない限り長文にならないようにし、1〜2文程度で要点だけを返してください。",
    help: "あなたは Nyaimlab サーバーの丁寧なヘルプ担当です。" +
        "わかりやすく落ち着いたトーンで、手順や理由を整理して伝えてください。" +
        "語尾は基本的に敬語ですが、たまに柔らかく「〜にゃ」と添えても構いません。" +
        "絵文字や顔文字は使わず、文末は句読点またはにゃ語尾にしてください。",
    coach: "あなたは Aim やゲーム戦略のコーチ役です。" +
        "中性的な猫のキャラクターとして、ポジティブに励ましつつ提案をしてください。" +
        "アドバイスは実践的かつ簡潔にまとめ、語尾は「〜にゃ」「〜にゃー」などを使いつつも行数は短めに保ってください。" +
        "絵文字は使用せず、親しい友達に話す感覚で表現してください。",
    chat: "一人称は「ボク」、語尾には必ず「〜にゃ」「〜にゃー」「〜にゃ〜」「〜にゃ！」「〜にゃ…」のいずれかを付けてください。" +
        "絵文字は使わず、雑談は1〜2行程度で短く、友達感覚で自然に返答してください。",
};
const RagPromptsSchema = zod_1.z
    .object({
    base: zod_1.z.string().min(1),
    help: zod_1.z.string().min(1),
    coach: zod_1.z.string().min(1),
    chat: zod_1.z.string().min(1),
})
    .default({ ...DEFAULT_RAG_PROMPTS });
const DEFAULT_RAG_FEELINGS = {
    excitement: 0.5,
    empathy: 0.5,
    probability: 0.25,
    cooldown_minutes: 15,
    default_mode: "chat",
};
const RagFeelingsSchema = zod_1.z
    .object({
    excitement: zod_1.z.number().min(0).max(1).default(DEFAULT_RAG_FEELINGS.excitement),
    empathy: zod_1.z.number().min(0).max(1).default(DEFAULT_RAG_FEELINGS.empathy),
    probability: zod_1.z.number().min(0).max(1).default(DEFAULT_RAG_FEELINGS.probability),
    cooldown_minutes: zod_1.z.number().min(0).default(DEFAULT_RAG_FEELINGS.cooldown_minutes),
    default_mode: RagModeSchema.default(DEFAULT_RAG_FEELINGS.default_mode),
})
    .default({ ...DEFAULT_RAG_FEELINGS });
const RagShortTermSchema = zod_1.z
    .object({
    excluded_channels: zod_1.z.array(SnowflakeSchema).default([]),
})
    .default({ excluded_channels: [] });
const RagConfigSchema = zod_1.z
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
exports.SettingsConfigSchema = zod_1.z
    .object({
    locale: zod_1.z.string().optional(),
    timezone: zod_1.z.string().optional(),
    member_index_mode: zod_1.z.string().optional(),
    member_count_strategy: zod_1.z.enum(["human_only", "include_bots"]).optional(),
    api_base_url: zod_1.z.string().nullable().optional(),
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
    welcome: WelcomeConfigSchema.optional(),
    rag: RagConfigSchema.optional(),
});
//# sourceMappingURL=schema.js.map