import { DashboardState } from '../types';

interface Props {
  state: DashboardState | null;
  onRefresh: () => void;
  lastAuditId?: string;
}

const OverviewSection = ({ state, onRefresh, lastAuditId }: Props) => {
  const sections = [
    { key: 'welcome', label: 'Welcome & Onboarding', configured: Boolean(state?.welcome) },
    { key: 'guideline', label: 'Guideline DM', configured: Boolean(state?.guideline) },
    { key: 'verify', label: 'Verify', configured: Boolean(state?.verify) },
    { key: 'roles', label: 'Role Distribution', configured: Boolean(state?.roles) },
    { key: 'introduce', label: 'Introduce Command', configured: Boolean(state?.introduce_schema.fields.length) },
    { key: 'scrims', label: 'Scrim Helper', configured: Boolean(state?.scrims) },
    { key: 'rag', label: 'RAG Service', configured: Boolean(state?.rag) },
    { key: 'settings', label: 'Shared Settings', configured: Boolean(state?.settings && Object.keys(state.settings).length) },
  ];

  return (
    <div className="section-card">
      <div className="top-bar" style={{ marginBottom: 16 }}>
        <div>
          <h2>ダッシュボード概要</h2>
          <p className="hint">現在の設定状態と最新の監査ログ情報を確認できます。</p>
        </div>
        <button onClick={onRefresh}>最新情報を取得</button>
      </div>
      {lastAuditId ? (
        <div className="status-bar">
          <strong>最後の操作 Audit ID:</strong> {lastAuditId}
        </div>
      ) : null}
      <div className="form-grid two-columns">
        {sections.map((section) => (
          <div key={section.key} className="list-item" style={{ background: '#f8fafc' }}>
            <h3 style={{ marginTop: 0 }}>{section.label}</h3>
            <div className="badge" style={{ background: section.configured ? '#dcfce7' : '#fee2e2', color: '#064e3b' }}>
              {section.configured ? 'Configured' : '未設定'}
            </div>
            {section.key === 'roles' && state?.role_emoji_map ? (
              <p className="hint">絵文字紐付け: {Object.keys(state.role_emoji_map).length} 件</p>
            ) : null}
            {section.key === 'introduce' && state?.introduce ? (
              <p className="hint">投稿先: <code>{state.introduce.channel_id}</code></p>
            ) : null}
            {section.key === 'rag' && state?.rag ? (
              <p className="hint">
                除外チャンネル: {state.rag.short_term.excluded_channels.length} 件 / 既定モード: {state.rag.feelings.default_mode}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OverviewSection;
