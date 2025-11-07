import { FormEvent, useState } from 'react';
import { MemberCountStrategy, SettingsPayload } from '../types';

interface Props {
  value: Partial<SettingsPayload>;
  onChange: (value: Partial<SettingsPayload>) => void;
  onSave: (value: Partial<SettingsPayload>) => Promise<void>;
}

const MEMBER_COUNT_OPTIONS: MemberCountStrategy[] = ['human_only', 'include_bots'];

const isMemberCountStrategy = (input: string): input is MemberCountStrategy =>
  MEMBER_COUNT_OPTIONS.includes(input as MemberCountStrategy);

const SettingsSection = ({ value, onChange, onSave }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleField = (field: keyof SettingsPayload) =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement>) => {
      const input = event.currentTarget;
      if (field === 'show_join_alerts') {
        onChange({ ...value, show_join_alerts: (input as HTMLInputElement).checked });
        return;
      }
      if (field === 'member_count_strategy') {
        const nextValue = isMemberCountStrategy(input.value) ? input.value : 'human_only';
        onChange({ ...value, member_count_strategy: nextValue });
        return;
      }
      onChange({ ...value, [field]: input.value } as Partial<SettingsPayload>);
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      setStatus('共通設定を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="section-card" onSubmit={handleSubmit}>
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>共通設定</h2>
          <p className="hint">ロケールやメンバーカウント戦略などの共有設定を更新します。</p>
        </div>
        <button type="submit" disabled={saving}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="form-grid two-columns">
        <div className="field">
          <label htmlFor="settings-locale">言語</label>
          <select id="settings-locale" value={value.locale ?? 'ja-JP'} onChange={handleField('locale')}>
            <option value="ja-JP">日本語</option>
            <option value="en-US">英語</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="settings-timezone">タイムゾーン</label>
          <select id="settings-timezone" value={value.timezone ?? 'Asia/Tokyo'} onChange={handleField('timezone')}>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="settings-index">メンバーインデックス</label>
          <select
            id="settings-index"
            value={value.member_index_mode ?? 'exclude_bots'}
            onChange={handleField('member_index_mode')}
          >
            <option value="exclude_bots">Bot を除外</option>
            <option value="include_bots">Bot を含める</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="settings-count">メンバーカウント戦略</label>
          <select
            id="settings-count"
            value={value.member_count_strategy ?? 'human_only'}
            onChange={handleField('member_count_strategy')}
          >
            <option value="human_only">人間のみ</option>
            <option value="include_bots">Bot を含める</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / span 2' }}>
          <label htmlFor="settings-api">Bot API Base URL (任意)</label>
          <input id="settings-api" value={value.api_base_url ?? ''} onChange={handleField('api_base_url')} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={value.show_join_alerts ?? true}
            onChange={handleField('show_join_alerts') as any}
          />
          新規参加アラートを有効化
        </label>
      </div>
    </form>
  );
};

export default SettingsSection;
