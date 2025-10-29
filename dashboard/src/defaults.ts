import {
  DashboardState,
  GuidelineTemplate,
  IntroduceConfig,
  IntroduceField,
  IntroduceSchema,
  RagConfig,
  RagFeelingsConfig,
  RagPromptsConfig,
  RagShortTermConfig,
  RolesConfig,
  ScrimConfig,
  SettingsPayload,
  VerifyConfig,
  WelcomeButton,
  WelcomeCardConfig,
  WelcomeConfig,
} from './types';

const DEFAULT_CARD_FONT =
  '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif';

export const createDefaultWelcomeCard = (): WelcomeCardConfig => ({
  background_image: '',
  font_path: null,
  font_family: DEFAULT_CARD_FONT,
  title_template: 'Welcome to {{guild_name}}',
  subtitle_template: 'Member #{{member_index}}',
  body_template: 'We are glad to have you here, {{username}}!',
  text_color: '#ffffff',
  accent_color: '#fee75c',
  overlay_color: 'rgba(0, 0, 0, 0.45)',
  avatar_border_color: '#fee75c',
  avatar_offset_x: 0,
  avatar_offset_y: -96,
  title_offset_x: 0,
  title_offset_y: 20,
  title_font_size: 64,
  subtitle_offset_x: 0,
  subtitle_offset_y: 50,
  subtitle_font_size: 44,
  body_offset_x: 0,
  body_offset_y: 50,
  body_font_size: 28,
});

export const createDefaultWelcome = (): WelcomeConfig => ({
  channel_id: '',
  title_template: 'ようこそ、{{username}} さん！',
  description_template: 'あなたは **#{{member_index}}** 人目のメンバーです。',
  message_template: '{{mention}}',
  mode: 'embed',
  member_index_mode: 'exclude_bots',
  join_field_label: '加入日時',
  join_timezone: 'Asia/Tokyo',
  buttons: [],
  footer_text: 'Nyaimlab',
  thread_name_template: null,
  card: createDefaultWelcomeCard(),
});

export const createDefaultButton = (): WelcomeButton => ({
  label: 'ガイドを見る',
  target: 'url',
  value: 'https://example.com',
});

export const createDefaultGuideline = (): GuidelineTemplate => ({
  content: 'ようこそ Nyaimlab へ！',
  attachments: [],
});

export const createDefaultVerify = (): VerifyConfig => ({
  channel_id: '',
  role_id: '',
  mode: 'button',
  prompt: 'ボタンを押して認証を完了してください。',
  message_id: null,
});

export const createDefaultRoles = (): RolesConfig => ({
  channel_id: '',
  style: 'buttons',
  roles: [],
  message_content: null,
});

export const createDefaultIntroduce = (): IntroduceConfig => ({
  channel_id: '',
  mention_role_ids: [],
  embed_title: '自己紹介',
  footer_text: null,
});

export const createDefaultField = (): IntroduceField => ({
  field_id: 'name',
  label: 'お名前',
  placeholder: '例: Nyaim',
  required: true,
  enabled: true,
  max_length: 80,
});

export const createDefaultSchema = (): IntroduceSchema => ({
  fields: [createDefaultField()],
});

export const createDefaultScrims = (): ScrimConfig => ({
  timezone: 'Asia/Tokyo',
  rules: [],
  manager_role_id: null,
});

export const createDefaultSettings = (): Partial<SettingsPayload> => ({
  locale: 'ja-JP',
  timezone: 'Asia/Tokyo',
  member_index_mode: 'exclude_bots',
  member_count_strategy: 'human_only',
  api_base_url: null,
  show_join_alerts: true,
});

const DEFAULT_RAG_PROMPTS: RagPromptsConfig = {
  base:
    'あなたは Nyaimlab Discord サーバーで暮らす中性的な猫のキャラクターボットとして振る舞ってください。' +
    '相手に寄り添い、尊重しながら返答してください。' +
    'ヘルプやアドバイス以外の雑談では、短く自然なチャット文を意識してください。' +
    '絵文字や顔文字は使わないでください。' +
    '自分が AI や ChatGPT であると説明したり、注意書きや免責事項を付けたりしないでください。' +
    '求められない限り長文にならないようにし、1〜2文程度で要点だけを返してください。',
  help:
    'あなたは Nyaimlab サーバーの丁寧なヘルプ担当です。' +
    'わかりやすく落ち着いたトーンで、手順や理由を整理して伝えてください。' +
    '語尾は基本的に敬語ですが、たまに柔らかく「〜にゃ」と添えても構いません。' +
    '絵文字や顔文字は使わず、文末は句読点またはにゃ語尾にしてください。',
  coach:
    'あなたは Aim やゲーム戦略のコーチ役です。' +
    '中性的な猫のキャラクターとして、ポジティブに励ましつつ提案をしてください。' +
    'アドバイスは実践的かつ簡潔にまとめ、語尾は「〜にゃ」「〜にゃー」などを使いつつも行数は短めに保ってください。' +
    '絵文字は使用せず、親しい友達に話す感覚で表現してください。',
  chat:
    '一人称は「ボク」、語尾には必ず「〜にゃ」「〜にゃー」「〜にゃ〜」「〜にゃ！」「〜にゃ…」のいずれかを付けてください。' +
    '絵文字は使わず、雑談は1〜2行程度で短く、友達感覚で自然に返答してください。',
};

const DEFAULT_RAG_FEELINGS: RagFeelingsConfig = {
  excitement: 0.5,
  empathy: 0.5,
  probability: 0.25,
  cooldown_minutes: 15,
  default_mode: 'chat',
};

const DEFAULT_RAG_SHORT_TERM: RagShortTermConfig = {
  excluded_channels: [],
};

export const createDefaultRagConfig = (): RagConfig => ({
  prompts: { ...DEFAULT_RAG_PROMPTS },
  feelings: { ...DEFAULT_RAG_FEELINGS },
  short_term: { ...DEFAULT_RAG_SHORT_TERM },
});

export const createEmptyState = (): DashboardState => ({
  welcome: null,
  guideline: null,
  verify: null,
  roles: null,
  role_emoji_map: {},
  introduce: null,
  introduce_schema: { fields: [] },
  scrims: null,
  settings: {},
  rag: createDefaultRagConfig(),
});
