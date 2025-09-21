export type MemberIndexMode = 'include_bots' | 'exclude_bots';
export type Timezone = 'UTC' | 'Asia/Tokyo';
export type WelcomeButtonTarget = 'url' | 'channel';

export interface WelcomeButton {
  label: string;
  target: WelcomeButtonTarget;
  value: string;
  emoji?: string | null;
}

export interface WelcomeConfig {
  channel_id: string;
  title_template: string;
  description_template: string;
  member_index_mode: MemberIndexMode;
  join_field_label: string;
  join_timezone: Timezone;
  buttons: WelcomeButton[];
  footer_text: string;
  thread_name_template?: string | null;
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
export type MemberCountStrategy = 'all_members' | 'human_only' | 'boosters_priority';

export interface SettingsPayload {
  locale: Locale;
  timezone: Timezone;
  member_index_mode: MemberIndexMode;
  member_count_strategy: MemberCountStrategy;
  api_base_url?: string | null;
  show_join_alerts: boolean;
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
