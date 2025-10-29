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
import RagSection from './components/RagSection';
import AuditLogSection from './components/AuditLogSection';
import YamlSection from './components/YamlSection';
import { DashboardApi, ApiError } from './api';
import { usePersistentState } from './hooks';
import {
  DashboardState,
  AuthSettings,
  GitHubSettings,
  WelcomeConfig,
  WelcomePreview,
  GuidelineTemplate,
  VerifyConfig,
  RolesConfig,
  IntroduceConfig,
  IntroduceSchema,
  ScrimConfig,
  SettingsPayload,
  AuditEntry,
  RagConfig,
  RagKnowledgeEntry,
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
  createDefaultRagConfig,
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
  | 'rag'
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
  { key: 'rag', label: 'RAG' },
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
    rag: snapshot?.rag ?? createDefaultRagConfig(),
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
  const [authError, setAuthError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const api = useMemo(() => (auth?.token ? new DashboardApi(auth) : null), [auth]);
  const originalYaml = useMemo(() => toYaml(stateToConfig(originalState)), [originalState]);
  const updatedYaml = useMemo(() => toYaml(stateToConfig(draftState)), [draftState]);

  const handleLogin = (settings: AuthSettings) => {
    setError(null);
    setAuthError(null);
    setAuth(settings);
    setActiveTab('overview');
  };

  const performLogout = (message: string | null) => {
    setAuth(null);
    setOriginalState(null);
    setDraftState(null);
    setLastAuditId(null);
    setLogs([]);
    setError(null);
    setLoading(false);
    setLogsLoading(false);
    setAuthError(message);
  };

  const handleLogout = () => {
    performLogout(null);
  };

  const handleApiError = (err: unknown, fallbackMessage: string): string | null => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        performLogout('認証情報が失効しました。再度ログインしてください。');
        return null;
      }
      return err.message;
    }
    return fallbackMessage;
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
      const message = handleApiError(err, '監査ログの取得に失敗しました');
      if (message) {
        setError(message);
      }
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
      const message = handleApiError(err, '状態の取得に失敗しました');
      if (message) {
        setError(message);
      }
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
    return <AuthForm initial={auth ?? defaultAuth} onSubmit={handleLogin} error={authError} />;
  }

  if (error && (!draftState || !originalState)) {
    return (
      <div className="dashboard" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="section-card" style={{ maxWidth: 320 }}>
          <div className="status-bar error" style={{ marginBottom: 16 }}>
            {error}
          </div>
          <div className="actions-row" style={{ justifyContent: 'flex-end', gap: 12 }}>
            <button className="secondary" onClick={() => handleLogout()}>
              ログアウト
            </button>
            <button onClick={() => refreshState()}>再読み込み</button>
          </div>
        </div>
      </div>
    );
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

  const handleRagChange = (config: RagConfig) => {
    setDraftState((prev) => (prev ? { ...prev, rag: config } : prev));
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
      const message = handleApiError(err, 'API 呼び出しに失敗しました');
      if (message) {
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
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

  const previewWelcome = async (config: WelcomeConfig): Promise<WelcomePreview> => {
    if (!api) {
      throw new Error('API が初期化されていません');
    }
    try {
      const response = await api.post<{ preview: WelcomePreview }>('/welcome.preview', { config });
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
      return response.data.preview;
    } catch (err) {
      const message = handleApiError(err, 'Welcome プレビューの生成に失敗しました');
      if (message) {
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
    }
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
    try {
      const response = await api.post('/guideline.test', {});
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      const message = handleApiError(err, 'ガイドライン DM のテスト送信に失敗しました');
      if (message) {
        setError(message);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
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
    try {
      const response = await api.post('/verify.remove', {});
      setOriginalState((prev) => (prev ? { ...prev, verify: null } : prev));
      setDraftState((prev) => (prev ? { ...prev, verify: null } : prev));
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      const message = handleApiError(err, 'Verify 設定の削除に失敗しました');
      if (message) {
        setError(message);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
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
    try {
      for (const payload of payloads) {
        const response = await api.post<{ mapping: Record<string, string> }>('/roles.mapEmoji', payload);
        setOriginalState((prev) => (prev ? { ...prev, role_emoji_map: response.data.mapping } : prev));
        setDraftState((prev) => (prev ? { ...prev, role_emoji_map: response.data.mapping } : prev));
        if (response.auditId) {
          setLastAuditId(response.auditId);
        }
      }
    } catch (err) {
      const message = handleApiError(err, 'ロールと絵文字の同期に失敗しました');
      if (message) {
        setError(message);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
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
    try {
      const response = await api.post<{ config: RolesConfig | null }>('/roles.remove', { role_id: null });
      setOriginalState((prev) => (prev ? { ...prev, roles: null, role_emoji_map: {} } : prev));
      setDraftState((prev) => (prev ? { ...prev, roles: null, role_emoji_map: {} } : prev));
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      const message = handleApiError(err, 'ロール設定の削除に失敗しました');
      if (message) {
        setError(message);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
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
    try {
      const response = await api.post('/scrims.run', { dry_run: dryRun });
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
    } catch (err) {
      const message = handleApiError(err, 'スクリムの実行リクエストに失敗しました');
      if (message) {
        setError(message);
        if (err instanceof Error) {
          throw err;
        }
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
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

  const saveRagConfig = async (config: RagConfig) => {
    await runSave(
      () => api.post<{ config: RagConfig }>('/rag.config.save', config),
      (data) => {
        setOriginalState((prev) => (prev ? { ...prev, rag: data.config } : prev));
        setDraftState((prev) => (prev ? { ...prev, rag: data.config } : prev));
      }
    );
  };

  const registerRagKnowledge = async (entry: RagKnowledgeEntry): Promise<string> => {
    if (!api) {
      throw new Error('API が初期化されていません');
    }
    try {
      const response = await api.post<{ path: string }>('/rag.knowledge.add', entry);
      if (response.auditId) {
        setLastAuditId(response.auditId);
      }
      return response.data.path;
    } catch (err) {
      const message = handleApiError(err, 'ナレッジの登録に失敗しました');
      if (message) {
        throw new Error(message);
      }
      throw new Error('認証情報が失効しました。再度ログインしてください。');
    }
  };

  const welcomeDraft = useMemo(() => {
    const base = createDefaultWelcome();
    const current = draftState?.welcome;
    if (!current) {
      return base;
    }
    return {
      ...base,
      ...current,
      card: current.card
        ? { ...base.card, ...current.card }
        : base.card,
    };
  }, [draftState]);
  const guidelineDraft = draftState.guideline ?? createDefaultGuideline();
  const verifyDraft = draftState.verify ?? createDefaultVerify();
  const rolesDraft = draftState.roles ?? createDefaultRoles();
  const introduceDraft = draftState.introduce ?? createDefaultIntroduce();
  const schemaDraft = draftState.introduce_schema.fields.length
    ? draftState.introduce_schema
    : createDefaultSchema();
  const scrimDraft = draftState.scrims ?? createDefaultScrims();
  const settingsDraft = { ...createDefaultSettings(), ...draftState.settings };
  const ragDraft = draftState.rag ?? createDefaultRagConfig();

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
          <WelcomeSection
            value={welcomeDraft}
            onChange={handleWelcomeChange}
            onSave={saveWelcome}
            onPreview={previewWelcome}
          />
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
        {activeTab === 'rag' && (
          <RagSection
            value={ragDraft}
            onChange={handleRagChange}
            onSave={saveRagConfig}
            onRefresh={refreshState}
            onRegisterKnowledge={registerRagKnowledge}
          />
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
