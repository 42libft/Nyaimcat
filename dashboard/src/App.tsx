import { useEffect, useMemo, useState } from 'react';
import AuthForm from './components/AuthForm';
import OverviewSection from './components/OverviewSection';
import WelcomeSection from './components/WelcomeSection';
import GuidelineSection from './components/GuidelineSection';
import VerifySection from './components/VerifySection';
import RolesSection from './components/RolesSection';
import IntroduceSection from './components/IntroduceSection';
import ScrimsSection from './components/ScrimsSection';
import SettingsSection from './components/SettingsSection';
import AuditLogSection from './components/AuditLogSection';
import YamlSection from './components/YamlSection';
import { DashboardApi, ApiError } from './api';
import { usePersistentState } from './hooks';
import {
  DashboardState,
  AuthSettings,
  GitHubSettings,
  WelcomeConfig,
  GuidelineTemplate,
  VerifyConfig,
  RolesConfig,
  IntroduceConfig,
  IntroduceSchema,
  ScrimConfig,
  SettingsPayload,
  AuditEntry,
} from './types';
import {
  createDefaultWelcome,
  createDefaultGuideline,
  createDefaultVerify,
  createDefaultRoles,
  createDefaultIntroduce,
  createDefaultSchema,
  createDefaultScrims,
  createDefaultSettings,
  createEmptyState,
} from './defaults';
import { deepClone, defaultGitHubSettings, stateToConfig, toYaml } from './utils';
import { createConfigPullRequest } from './github';

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const fallbackApiBaseUrl = 'http://localhost:8000/api';
const defaultApiBaseUrl =
  typeof envApiBaseUrl === 'string' && envApiBaseUrl.trim() !== '' ? envApiBaseUrl : fallbackApiBaseUrl;

const defaultAuth: AuthSettings = {
  apiBaseUrl: defaultApiBaseUrl,
  token: '',
  clientId: 'pages-dashboard',
  guildId: '',
  userId: '',
};

type TabKey =
  | 'overview'
  | 'welcome'
  | 'guideline'
  | 'verify'
  | 'roles'
  | 'introduce'
  | 'scrims'
  | 'settings'
  | 'logs'
  | 'yaml';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概要' },
  { key: 'welcome', label: 'Welcome' },
  { key: 'guideline', label: 'ガイドライン DM' },
  { key: 'verify', label: 'Verify' },
  { key: 'roles', label: 'ロール配布' },
  { key: 'introduce', label: '自己紹介' },
  { key: 'scrims', label: 'スクリム' },
  { key: 'settings', label: '共通設定' },
  { key: 'logs', label: '監査ログ' },
  { key: 'yaml', label: 'YAML & PR' },
];

const normalizeState = (snapshot: any): DashboardState => {
  const base = createEmptyState();
  return {
    ...base,
    welcome: snapshot?.welcome ?? null,
    guideline: snapshot?.guideline ?? null,
    verify: snapshot?.verify ?? null,
    roles: snapshot?.roles ?? null,
    role_emoji_map: snapshot?.role_emoji_map ?? {},
    introduce: snapshot?.introduce ?? null,
    introduce_schema: snapshot?.introduce_schema ?? { fields: [] },
    scrims: snapshot?.scrims ?? null,
    settings: snapshot?.settings ?? {},
  };
};

const App = () => {
  const [auth, setAuth] = usePersistentState<AuthSettings | null>('nyaimlab.auth', null);
  const [githubSettings, setGithubSettings] = usePersistentState<GitHubSettings>(
    'nyaimlab.github',
    defaultGitHubSettings
  );
  const [originalState, setOriginalState] = useState<DashboardState | null>(null);
  const [draftState, setDraftState] = useState<DashboardState | null>(null);
  const [lastAuditId, setLastAuditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const api = useMemo(() => (auth?.token ? new DashboardApi(auth) : null), [auth]);
  const originalYaml = useMemo(() => toYaml(stateToConfig(originalState)), [originalState]);
  const updatedYaml = useMemo(() => toYaml(stateToConfig(draftState)), [draftState]);

  const handleLogin = (settings: AuthSettings) => {
    setAuth(settings);
    setActiveTab('overview');
  };

  const handleLogout = () => {
    setAuth(null);
    setOriginalState(null);
    setDraftState(null);
    setLastAuditId(null);
    setLogs([]);
  };

  const loadAuditLogs = async () => {
    if (!api) return;
    setLogsLoading(true);
    try {
      const response = await api.post<{ results: AuditEntry[] }>('/audit.search', { limit: 50 });
      setLogs(response.data.results);
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '監査ログの取得に失敗しました';
      setError(message);
    } finally {
      setLogsLoading(false);
    }
  };

  const refreshState = async () => {
    if (!api) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ state: DashboardState }>('/state.get');
      const snapshot = normalizeState(response.data.state);
      setOriginalState(snapshot);
      setDraftState(deepClone(snapshot));
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : '状態の取得に失敗しました';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (api) {
      refreshState();
    }
  }, [api]);

  useEffect(() => {
    if (activeTab === 'logs' && api) {
      loadAuditLogs();
    }
  }, [activeTab, api]);

  if (!auth || !auth.token) {
    return <AuthForm initial={auth ?? defaultAuth} onSubmit={handleLogin} />;
  }

  if (loading || !draftState || !originalState) {
    return (
      <div className="dashboard" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="section-card" style={{ maxWidth: 320 }}>
          <p>ダッシュボードの読み込み中...</p>
        </div>
      </div>
    );
  }

  const handleWelcomeChange = (config: WelcomeConfig) => {
    setDraftState((prev) => (prev ? { ...prev, welcome: config } : prev));
  };

  const handleGuidelineChange = (template: GuidelineTemplate) => {
    setDraftState((prev) => (prev ? { ...prev, guideline: template } : prev));
  };

  const handleVerifyChange = (config: VerifyConfig) => {
    setDraftState((prev) => (prev ? { ...prev, verify: config } : prev));
  };

  const handleRolesChange = (config: RolesConfig) => {
    setDraftState((prev) => (prev ? { ...prev, roles: config } : prev));
  };

  const handleRoleEmojiChange = (mapping: Record<string, string>) => {
    setDraftState((prev) => (prev ? { ...prev, role_emoji_map: mapping } : prev));
  };

  const handleIntroduceConfigChange = (config: IntroduceConfig) => {
    setDraftState((prev) => (prev ? { ...prev, introduce: config } : prev));
  };

  const handleIntroduceSchemaChange = (schema: IntroduceSchema) => {
    setDraftState((prev) => (prev ? { ...prev, introduce_schema: schema } : prev));
  };

  const handleScrimChange = (config: ScrimConfig) => {
    setDraftState((prev) => (prev ? { ...prev, scrims: config } : prev));
  };

  const handleSettingsChange = (settings: Partial<SettingsPayload>) => {
    setDraftState((prev) => (prev ? { ...prev, settings } : prev));
  };

  const runSave = async <T,>(
    fn: () => Promise<{ data: T; auditId?: string }>,
    updater: (data: T) => void
  ) => {
    if (!api) return;
    try {
      const response = await fn();
      updater(response.data);
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      throw err instanceof ApiError ? err : new Error('API call failed');
    }
  };

  const saveWelcome = async (config: WelcomeConfig) => {
    await runSave(
      () => api.post<{ config: WelcomeConfig }>('/welcome.post', config),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, welcome: data.config } : prev));
        setDraftState((prev) => (prev ? { ...prev, welcome: data.config } : prev));
      }
    );
  };

  const saveGuideline = async (template: GuidelineTemplate) => {
    await runSave(
      () => api.post<{ template: GuidelineTemplate }>('/guideline.save', template),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, guideline: data.template } : prev));
        setDraftState((prev) => (prev ? { ...prev, guideline: data.template } : prev));
      }
    );
  };

  const testGuideline = async () => {
    if (!api) return;
    const response = await api.post('/guideline.test', {});
    if (response.auditId) {
      setLastAuditId(response.auditId);
    }
  };

  const saveVerify = async (config: VerifyConfig) => {
    await runSave(
      () => api.post<{ config: VerifyConfig }>('/verify.post', config),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, verify: data.config } : prev));
        setDraftState((prev) => (prev ? { ...prev, verify: data.config } : prev));
      }
    );
  };

  const removeVerify = async () => {
    if (!api) return;
    const response = await api.post('/verify.remove', {});
    setOriginalState((prev) => (prev ? { ...prev, verify: null } : prev));
    setDraftState((prev) => (prev ? { ...prev, verify: null } : prev));
    if (response.auditId) {
      setLastAuditId(response.auditId);
    }
  };

  const syncRoleEmojiMappings = async (mapping: Record<string, string>) => {
    if (!api) return;
    const previous = originalState?.role_emoji_map ?? {};
    const desired = mapping;
    const payloads: { role_id: string; emoji: string | null }[] = [];
    for (const roleId of Object.keys(desired)) {
      if (desired[roleId] !== previous[roleId]) {
        payloads.push({ role_id: roleId, emoji: desired[roleId] });
      }
    }
    for (const roleId of Object.keys(previous)) {
      if (!(roleId in desired)) {
        payloads.push({ role_id: roleId, emoji: null });
      }
    }
    for (const payload of payloads) {
      const response = await api.post<{ mapping: Record<string, string> }>('/roles.mapEmoji', payload);
      setOriginalState((prev) => (prev ? { ...prev, role_emoji_map: response.data.mapping } : prev));
      setDraftState((prev) => (prev ? { ...prev, role_emoji_map: response.data.mapping } : prev));
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    }
  };

  const saveRoles = async (config: RolesConfig) => {
    const desiredMap = draftState?.role_emoji_map ?? {};
    await runSave(
      () => api.post<{ config: RolesConfig }>('/roles.post', config),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, roles: data.config } : prev));
        setDraftState((prev) => (prev ? { ...prev, roles: data.config } : prev));
      }
    );
    await syncRoleEmojiMappings(desiredMap);
  };

  const removeRoles = async () => {
    if (!api) return;
    const response = await api.post<{ config: RolesConfig | null }>('/roles.remove', { role_id: null });
    setOriginalState((prev) => (prev ? { ...prev, roles: null, role_emoji_map: {} } : prev));
    setDraftState((prev) => (prev ? { ...prev, roles: null, role_emoji_map: {} } : prev));
    if (response.auditId) {
      setLastAuditId(response.auditId);
    }
  };

  const saveIntroduceConfig = async (config: IntroduceConfig) => {
    await runSave(
      () => api.post<{ config: IntroduceConfig }>('/introduce.post', config),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, introduce: data.config } : prev));
        setDraftState((prev) => (prev ? { ...prev, introduce: data.config } : prev));
      }
    );
  };

  const saveIntroduceSchema = async (schema: IntroduceSchema) => {
    await runSave(
      () => api.post<{ schema: IntroduceSchema }>('/introduce.schema.save', schema),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, introduce_schema: data.schema } : prev));
        setDraftState((prev) => (prev ? { ...prev, introduce_schema: data.schema } : prev));
      }
    );
  };

  const saveScrims = async (config: ScrimConfig) => {
    await runSave(
      () => api.post<{ config: ScrimConfig }>('/scrims.config.save', config),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, scrims: data.config } : prev));
        setDraftState((prev) => (prev ? { ...prev, scrims: data.config } : prev));
      }
    );
  };

  const runScrim = async (dryRun: boolean) => {
    if (!api) return;
    const response = await api.post('/scrims.run', { dry_run: dryRun });
    if (response.auditId) {
      setLastAuditId(response.auditId);
    }
  };

  const saveSettings = async (settings: Partial<SettingsPayload>) => {
    await runSave(
      () => api.post<{ settings: Partial<SettingsPayload> }>('/settings.save', settings),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, settings: data.settings } : prev));
        setDraftState((prev) => (prev ? { ...prev, settings: data.settings } : prev));
      }
    );
  };

  const welcomeDraft = draftState.welcome ?? createDefaultWelcome();
  const guidelineDraft = draftState.guideline ?? createDefaultGuideline();
  const verifyDraft = draftState.verify ?? createDefaultVerify();
  const rolesDraft = draftState.roles ?? createDefaultRoles();
  const introduceDraft = draftState.introduce ?? createDefaultIntroduce();
  const schemaDraft = draftState.introduce_schema.fields.length
    ? draftState.introduce_schema
    : createDefaultSchema();
  const scrimDraft = draftState.scrims ?? createDefaultScrims();
  const settingsDraft = { ...createDefaultSettings(), ...draftState.settings };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div>
          <h1>Nyaimlab Dashboard</h1>
          <p className="hint">Guild: {auth.guildId}</p>
        </div>
        <div className="nav-links">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={handleLogout}>
          ログアウト
        </button>
      </aside>
      <main className="main">
        {error ? <div className="status-bar error">{error}</div> : null}
        {activeTab === 'overview' && (
          <OverviewSection state={draftState} onRefresh={refreshState} lastAuditId={lastAuditId ?? undefined} />
        )}
        {activeTab === 'welcome' && (
          <WelcomeSection value={welcomeDraft} onChange={handleWelcomeChange} onSave={saveWelcome} />
        )}
        {activeTab === 'guideline' && (
          <GuidelineSection
            value={guidelineDraft}
            onChange={handleGuidelineChange}
            onSave={saveGuideline}
            onTest={testGuideline}
          />
        )}
        {activeTab === 'verify' && (
          <VerifySection
            value={verifyDraft}
            onChange={handleVerifyChange}
            onSave={saveVerify}
            onRemove={removeVerify}
          />
        )}
        {activeTab === 'roles' && (
          <RolesSection
            value={rolesDraft}
            emojiMap={draftState.role_emoji_map}
            onChange={handleRolesChange}
            onEmojiMapChange={handleRoleEmojiChange}
            onSave={saveRoles}
            onRemoveAll={removeRoles}
          />
        )}
        {activeTab === 'introduce' && (
          <IntroduceSection
            config={introduceDraft}
            schema={schemaDraft}
            onConfigChange={handleIntroduceConfigChange}
            onSchemaChange={handleIntroduceSchemaChange}
            onSaveConfig={saveIntroduceConfig}
            onSaveSchema={saveIntroduceSchema}
          />
        )}
        {activeTab === 'scrims' && (
          <ScrimsSection value={scrimDraft} onChange={handleScrimChange} onSave={saveScrims} onRun={runScrim} />
        )}
        {activeTab === 'settings' && (
          <SettingsSection value={settingsDraft} onChange={handleSettingsChange} onSave={saveSettings} />
        )}
        {activeTab === 'logs' && (
          <AuditLogSection logs={logs} onRefresh={loadAuditLogs} loading={logsLoading} />
        )}
        {activeTab === 'yaml' && (
          <YamlSection
            originalYaml={originalYaml}
            updatedYaml={updatedYaml}
            github={githubSettings}
            onGitHubChange={setGithubSettings}
            onCreatePullRequest={(settings) => createConfigPullRequest(settings, updatedYaml)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
