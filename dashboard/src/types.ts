export type MemberIndexMode = 'include_bots' | 'exclude_bots';
export type Timezone = 'UTC' | 'Asia/Tokyo';
export type WelcomeButtonTarget = 'url' | 'channel';
export type WelcomeMode = 'embed' | 'card';

export interface WelcomeButton {
  label: string;
  target: WelcomeButtonTarget;
  value: string;
  emoji?: string | null;
}

export interface WelcomeCardConfig {
  background_image: string;
  font_path?: string | null;
  font_family?: string | null;
  title_template: string;
  subtitle_template: string;
  body_template?: string | null;
  text_color: string;
  accent_color: string;
  overlay_color?: string | null;
  avatar_border_color?: string | null;
  avatar_offset_x: number;
  avatar_offset_y: number;
  title_offset_x: number;
  title_offset_y: number;
  title_font_size: number;
  subtitle_offset_x: number;
  subtitle_offset_y: number;
  subtitle_font_size: number;
  body_offset_x: number;
  body_offset_y: number;
  body_font_size: number;
}

export interface WelcomeConfig {
  channel_id: string;
  title_template: string;
  description_template: string;
  message_template: string;
  mode: WelcomeMode;
  member_index_mode: MemberIndexMode;
  join_field_label: string;
  join_timezone: Timezone;
  buttons: WelcomeButton[];
  footer_text: string;
  thread_name_template?: string | null;
  card?: WelcomeCardConfig | null;
}

export interface WelcomeEmbedPreviewField {
  name: string;
  value: string;
}

export interface WelcomeEmbedPreview {
  title: string;
  description: string;
  footer_text: string;
  fields: WelcomeEmbedPreviewField[];
  color: number;
  thumbnail_url?: string | null;
}

export interface WelcomePreview {
  mode: WelcomeMode;
  content?: string | null;
  embed?: WelcomeEmbedPreview;
  card_base64?: string | null;
}

export interface GuidelineTemplate {
  content: string;
  attachments: string[];
}

export type VerifyMode = 'button' | 'reaction';

export interface VerifyConfig {
  channel_id: string;
  role_id: string;
  mode: VerifyMode;
  prompt: string;
  message_id?: string | null;
  emoji?: string | null;
}

export type RoleStyle = 'buttons' | 'select' | 'reactions';

export interface RoleEntry {
  role_id: string;
  label: string;
  description?: string | null;
  emoji?: string | null;
  hidden?: boolean;
  sort_order?: number;
}

export interface RolesConfig {
  channel_id: string;
  style: RoleStyle;
  roles: RoleEntry[];
  message_content?: string | null;
}

export interface IntroduceConfig {
  channel_id: string;
  mention_role_ids: string[];
  embed_title: string;
  footer_text?: string | null;
}

export interface IntroduceField {
  field_id: string;
  label: string;
  placeholder?: string | null;
  required: boolean;
  enabled: boolean;
  max_length: number;
}

export interface IntroduceSchema {
  fields: IntroduceField[];
}

export type ScrimDay = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface ScrimRule {
  day: ScrimDay;
  survey_open_hour: number;
  survey_close_hour: number;
  notify_channel_id: string;
  min_team_members: number;
}

export interface ScrimConfig {
  timezone: Timezone;
  rules: ScrimRule[];
  manager_role_id?: string | null;
}

export type Locale = 'ja-JP' | 'en-US';
export type MemberCountStrategy = 'human_only' | 'include_bots';

export interface SettingsPayload {
  locale: Locale;
  timezone: Timezone;
  member_index_mode: MemberIndexMode;
  member_count_strategy: MemberCountStrategy;
  api_base_url?: string | null;
  show_join_alerts: boolean;
}

export type RagMode = 'help' | 'coach' | 'chat';

export interface RagPromptsConfig {
  base: string;
  help: string;
  coach: string;
  chat: string;
}

export interface RagFeelingsConfig {
  excitement: number;
  empathy: number;
  probability: number;
  cooldown_minutes: number;
  default_mode: RagMode;
}

export interface RagShortTermConfig {
  excluded_channels: string[];
}

export interface RagConfig {
  prompts: RagPromptsConfig;
  feelings: RagFeelingsConfig;
  short_term: RagShortTermConfig;
}

export interface RagKnowledgeEntry {
  title: string;
  content: string;
  tags: string[];
}

export interface DashboardState {
  welcome: WelcomeConfig | null;
  guideline: GuidelineTemplate | null;
  verify: VerifyConfig | null;
  roles: RolesConfig | null;
  role_emoji_map: Record<string, string>;
  introduce: IntroduceConfig | null;
  introduce_schema: IntroduceSchema;
  scrims: ScrimConfig | null;
  settings: Partial<SettingsPayload>;
  rag: RagConfig | null;
}

export interface AuditEntry {
  audit_id: string;
  timestamp: string;
  guild_id: string;
  action: string;
  ok: boolean;
  actor_id: string;
  client_id: string;
  session_id: string;
  error?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  data: T;
  auditId?: string;
}

export interface ApiResponseEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  audit_id?: string;
}

export interface AuthSettings {
  apiBaseUrl: string;
  token: string;
  clientId: string;
  guildId: string;
  userId: string;
}

export interface GitHubSettings {
  pat: string;
  owner: string;
  repo: string;
  baseBranch: string;
  branchName: string;
  configPath: string;
  prTitle: string;
  prBody: string;
  commitMessage: string;
  draft: boolean;
}
