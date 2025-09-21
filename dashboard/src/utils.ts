import yaml from 'js-yaml';
import { DashboardState, GitHubSettings } from './types';

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

export const stateToConfig = (state: DashboardState | null): Record<string, unknown> => {
  if (!state) {
    return {};
  }
  const config: Record<string, unknown> = {};
  if (state.welcome) {
    config.welcome = state.welcome;
  }
  if (state.guideline) {
    config.guideline = state.guideline;
  }
  if (state.verify) {
    config.verify = state.verify;
  }
  if (state.roles) {
    config.roles = state.roles;
  }
  if (state.role_emoji_map && Object.keys(state.role_emoji_map).length > 0) {
    config.role_emoji_map = state.role_emoji_map;
  }
  if (state.introduce) {
    config.introduce = state.introduce;
  }
  if (state.introduce_schema.fields.length > 0) {
    config.introduce_schema = state.introduce_schema;
  }
  if (state.scrims) {
    config.scrims = state.scrims;
  }
  if (state.settings && Object.keys(state.settings).length > 0) {
    config.settings = state.settings;
  }
  return config;
};

export const toYaml = (data: Record<string, unknown>): string =>
  yaml.dump(data, { lineWidth: 120, noRefs: true, sortKeys: true });

export const encodeBase64 = (input: string): string => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

export const defaultGitHubSettings = (): GitHubSettings => ({
  pat: '',
  owner: '',
  repo: '',
  baseBranch: 'main',
  branchName: '',
  configPath: 'config.yaml',
  prTitle: 'chore(config): update nyaimlab settings',
  prBody: 'Automated configuration update from the Nyaimlab dashboard.',
  commitMessage: 'chore: update nyaimlab config',
  draft: true,
});

export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
};
