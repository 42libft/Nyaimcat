import { FormEvent, useState } from 'react';
import { AuthSettings } from '../types';

interface Props {
  initial: AuthSettings;
  onSubmit: (settings: AuthSettings) => void;
  error?: string | null;
}

const AuthForm = ({ initial, onSubmit, error }: Props) => {
  const [form, setForm] = useState<AuthSettings>(initial);

  const handleChange = (field: keyof AuthSettings) => (event: FormEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="dashboard" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <form className="section-card" style={{ maxWidth: 420, width: '100%' }} onSubmit={handleSubmit}>
        <h1 style={{ marginTop: 0 }}>Nyaimlab 管理ダッシュボード</h1>
        <p className="hint">API 接続情報を入力してください。</p>
        {error ? <div className="status-bar error">{error}</div> : null}
        <div className="form-grid">
          <div className="field">
            <label htmlFor="apiBaseUrl">API Base URL</label>
            <input
              id="apiBaseUrl"
              placeholder="http://localhost:8000/api"
              value={form.apiBaseUrl}
              onChange={handleChange('apiBaseUrl')}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="token">管理トークン</label>
            <input
              id="token"
              placeholder="API_AUTH_TOKEN"
              value={form.token}
              onChange={handleChange('token')}
              required
              type="password"
            />
          </div>
          <div className="field">
            <label htmlFor="guildId">Guild ID</label>
            <input
              id="guildId"
              placeholder="Discord Guild ID"
              value={form.guildId}
              onChange={handleChange('guildId')}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="clientId">クライアント識別子</label>
            <input
              id="clientId"
              placeholder="pages-dashboard"
              value={form.clientId}
              onChange={handleChange('clientId')}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="userId">オペレーター User ID</label>
            <input
              id="userId"
              placeholder="Discord User ID"
              value={form.userId}
              onChange={handleChange('userId')}
            />
          </div>
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="submit">接続する</button>
        </div>
      </form>
    </div>
  );
};

export default AuthForm;
