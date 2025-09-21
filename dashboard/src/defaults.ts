import {
  DashboardState,
  GuidelineTemplate,
  IntroduceConfig,
  IntroduceField,
  IntroduceSchema,
  RolesConfig,
  ScrimConfig,
  SettingsPayload,
  VerifyConfig,
  WelcomeButton,
  WelcomeConfig,
} from './types';

export const createDefaultWelcome = (): WelcomeConfig => ({
  channel_id: '',
  title_template: 'ようこそ、{username} さん！',
  description_template: 'あなたは **#{member_index}** 人目のメンバーです。',
  member_index_mode: 'exclude_bots',
  join_field_label: '加入日時',
  join_timezone: 'Asia/Tokyo',
  buttons: [],
  footer_text: 'Nyaimlab',
  thread_name_template: null,
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
});
