import { FormEvent, useState } from 'react';
import { WelcomeConfig } from '../types';
import { createDefaultButton } from '../defaults';

interface Props {
  value: WelcomeConfig;
  onChange: (value: WelcomeConfig) => void;
  onSave: (value: WelcomeConfig) => Promise<void>;
}

const WelcomeSection = ({ value, onChange, onSave }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleField = (field: keyof WelcomeConfig) =>
    (event: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const input = event.currentTarget;
      const updated = { ...value, [field]: input.value };
      onChange(updated);
    };

  const handleMemberMode = (event: FormEvent<HTMLSelectElement>) => {
    onChange({ ...value, member_index_mode: event.currentTarget.value as WelcomeConfig['member_index_mode'] });
  };

  const handleTimezone = (event: FormEvent<HTMLSelectElement>) => {
    onChange({ ...value, join_timezone: event.currentTarget.value as WelcomeConfig['join_timezone'] });
  };

  const handleButtonChange = (index: number, field: 'label' | 'target' | 'value' | 'emoji') =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement>) => {
      const buttons = value.buttons.map((button, idx) =>
        idx === index ? { ...button, [field]: event.currentTarget.value } : button
      );
      onChange({ ...value, buttons });
    };

  const handleRemoveButton = (index: number) => {
    const buttons = value.buttons.filter((_, idx) => idx !== index);
    onChange({ ...value, buttons });
  };

  const handleAddButton = () => {
    onChange({ ...value, buttons: [...value.buttons, createDefaultButton()] });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      setStatus('Welcome 設定を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存中にエラーが発生しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="section-card" onSubmit={handleSubmit}>
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Welcome & Onboarding</h2>
          <p className="hint">新規参加者への歓迎メッセージとボタンを設定します。</p>
        </div>
        <button type="submit" disabled={saving}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="form-grid two-columns">
        <div className="field">
          <label htmlFor="welcome-channel">投稿チャンネル ID</label>
          <input id="welcome-channel" value={value.channel_id} onChange={handleField('channel_id')} required />
        </div>
        <div className="field">
          <label htmlFor="member-mode">メンバー人数のカウント</label>
          <select id="member-mode" value={value.member_index_mode} onChange={handleMemberMode}>
            <option value="exclude_bots">Bot を除外</option>
            <option value="include_bots">Bot を含める</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="join-timezone">加入日時のタイムゾーン</label>
          <select id="join-timezone" value={value.join_timezone} onChange={handleTimezone}>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="join-label">加入日時フィールド名</label>
          <input id="join-label" value={value.join_field_label} onChange={handleField('join_field_label')} />
        </div>
        <div className="field" style={{ gridColumn: '1 / span 2' }}>
          <label htmlFor="welcome-title">タイトルテンプレート</label>
          <input id="welcome-title" value={value.title_template} onChange={handleField('title_template')} />
          <p className="hint">使用可能な変数: {'{username}'}, {'{member_index}'}</p>
        </div>
        <div className="field" style={{ gridColumn: '1 / span 2' }}>
          <label htmlFor="welcome-description">説明テンプレート</label>
          <textarea
            id="welcome-description"
            value={value.description_template}
            onChange={handleField('description_template')}
          />
        </div>
        <div className="field">
          <label htmlFor="footer-text">フッターテキスト</label>
          <input id="footer-text" value={value.footer_text} onChange={handleField('footer_text')} />
        </div>
        <div className="field">
          <label htmlFor="thread-name">スレッド名テンプレート</label>
          <input
            id="thread-name"
            value={value.thread_name_template ?? ''}
            onChange={handleField('thread_name_template')}
            placeholder="未設定"
          />
        </div>
      </div>
      <div className="list" style={{ marginTop: 24 }}>
        <div className="section-actions" style={{ justifyContent: 'space-between' }}>
          <h3>ボタン設定</h3>
          <button type="button" className="secondary" onClick={handleAddButton}>
            ボタンを追加
          </button>
        </div>
        {value.buttons.length === 0 ? <p className="hint">まだボタンはありません。</p> : null}
        {value.buttons.map((button, index) => (
          <div className="list-item" key={`${button.label}-${index}`}>
            <div className="inline-fields">
              <div className="field">
                <label>ラベル</label>
                <input value={button.label} onChange={handleButtonChange(index, 'label')} />
              </div>
              <div className="field">
                <label>種別</label>
                <select
                  value={button.target}
                  onChange={handleButtonChange(index, 'target') as any}
                >
                  <option value="url">URL</option>
                  <option value="channel">チャンネルジャンプ</option>
                </select>
              </div>
              <div className="field">
                <label>値</label>
                <input value={button.value} onChange={handleButtonChange(index, 'value')} />
                <p className="hint">URL または チャンネル ID</p>
              </div>
              <div className="field">
                <label>絵文字 (任意)</label>
                <input value={button.emoji ?? ''} onChange={handleButtonChange(index, 'emoji')} />
              </div>
            </div>
            <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="small-button danger" onClick={() => handleRemoveButton(index)}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
};

export default WelcomeSection;
