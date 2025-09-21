import { FormEvent, useState } from 'react';
import { VerifyConfig } from '../types';

interface Props {
  value: VerifyConfig;
  onChange: (value: VerifyConfig) => void;
  onSave: (value: VerifyConfig) => Promise<void>;
  onRemove: () => Promise<void>;
}

const VerifySection = ({ value, onChange, onSave, onRemove }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleField = (field: keyof VerifyConfig) =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange({ ...value, [field]: event.currentTarget.value });
    };

  const handleMode = (event: FormEvent<HTMLSelectElement>) => {
    onChange({ ...value, mode: event.currentTarget.value as VerifyConfig['mode'] });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      setStatus('Verify 設定を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await onRemove();
      setStatus('Verify メッセージを削除しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="section-card" onSubmit={handleSubmit}>
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Verify 設定</h2>
          <p className="hint">認証メッセージと付与ロールを管理します。</p>
        </div>
        <div className="actions-row">
          <button type="button" className="secondary" onClick={handleRemove} disabled={saving}>
            メッセージを削除
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="form-grid two-columns">
        <div className="field">
          <label htmlFor="verify-channel">投稿チャンネル ID</label>
          <input id="verify-channel" value={value.channel_id} onChange={handleField('channel_id')} required />
        </div>
        <div className="field">
          <label htmlFor="verify-role">付与するロール ID</label>
          <input id="verify-role" value={value.role_id} onChange={handleField('role_id')} required />
        </div>
        <div className="field">
          <label htmlFor="verify-mode">モード</label>
          <select id="verify-mode" value={value.mode} onChange={handleMode}>
            <option value="button">ボタン</option>
            <option value="reaction">リアクション</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="verify-message">既存メッセージ ID (任意)</label>
          <input id="verify-message" value={value.message_id ?? ''} onChange={handleField('message_id')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="verify-prompt">案内テキスト</label>
        <textarea id="verify-prompt" value={value.prompt} onChange={handleField('prompt')} />
      </div>
    </form>
  );
};

export default VerifySection;
