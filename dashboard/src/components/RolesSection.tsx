import { FormEvent, useState } from 'react';
import { RoleEntry, RolesConfig } from '../types';

interface Props {
  value: RolesConfig;
  emojiMap: Record<string, string>;
  onChange: (value: RolesConfig) => void;
  onEmojiMapChange: (mapping: Record<string, string>) => void;
  onSave: (value: RolesConfig) => Promise<void>;
  onRemoveAll: () => Promise<void>;
}

const createRole = (): RoleEntry => ({
  role_id: '',
  label: '',
  description: '',
  emoji: '',
  hidden: false,
  sort_order: 0,
});

const RolesSection = ({ value, emojiMap, onChange, onEmojiMapChange, onSave, onRemoveAll }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleField = (field: keyof RolesConfig) =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const input = event.currentTarget.value;
      onChange({ ...value, [field]: input } as RolesConfig);
    };

  const handleMessageContent = (event: FormEvent<HTMLTextAreaElement>) => {
    onChange({ ...value, message_content: event.currentTarget.value });
  };

  const handleRoleChange = (
    index: number,
    field: keyof RoleEntry,
  ) => (event: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const updated = value.roles.map((role, idx) => {
      if (idx !== index) {
        return role;
      }
      if (field === 'hidden') {
        return { ...role, hidden: (event.currentTarget as HTMLInputElement).checked };
      }
      if (field === 'sort_order') {
        return { ...role, sort_order: Number(event.currentTarget.value) };
      }
      return { ...role, [field]: event.currentTarget.value };
    });
    onChange({ ...value, roles: updated });
    if (field === 'emoji') {
      const role = updated[index];
      if (role.role_id) {
        const newMap = { ...emojiMap };
        if (role.emoji) {
          newMap[role.role_id] = role.emoji;
        } else {
          delete newMap[role.role_id];
        }
        onEmojiMapChange(newMap);
      }
    }
  };

  const handleRoleIdChange = (index: number) => (event: FormEvent<HTMLInputElement>) => {
    const newRoleId = event.currentTarget.value;
    const updated = value.roles.map((role, idx) => (idx === index ? { ...role, role_id: newRoleId } : role));
    const previousId = value.roles[index]?.role_id;
    const newMap = { ...emojiMap };
    if (previousId && previousId !== newRoleId) {
      const existingEmoji = newMap[previousId];
      delete newMap[previousId];
      if (existingEmoji) {
        newMap[newRoleId] = existingEmoji;
        updated[index] = { ...updated[index], emoji: existingEmoji };
      }
    }
    if (newMap[newRoleId] && updated[index].emoji !== newMap[newRoleId]) {
      updated[index] = { ...updated[index], emoji: newMap[newRoleId] };
    }
    onEmojiMapChange(newMap);
    onChange({ ...value, roles: updated });
  };

  const handleAddRole = () => {
    onChange({ ...value, roles: [...value.roles, createRole()] });
  };

  const handleRemoveRole = (index: number) => {
    const role = value.roles[index];
    const updatedRoles = value.roles.filter((_, idx) => idx !== index);
    const newMap = { ...emojiMap };
    if (role?.role_id) {
      delete newMap[role.role_id];
    }
    onEmojiMapChange(newMap);
    onChange({ ...value, roles: updatedRoles });
  };

  const handleRemovePanel = async () => {
    setSaving(true);
    try {
      await onRemoveAll();
      setStatus('ロール配布パネルを削除しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      setStatus('ロール配布パネルを保存しました。');
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
          <h2>ロール配布</h2>
          <p className="hint">ボタン/メニュー/リアクションによるロール配布を設定します。</p>
        </div>
        <div className="actions-row">
          <button type="button" className="secondary" onClick={handleRemovePanel} disabled={saving}>
            パネル削除
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="form-grid two-columns">
        <div className="field">
          <label htmlFor="roles-channel">投稿チャンネル ID</label>
          <input id="roles-channel" value={value.channel_id} onChange={handleField('channel_id')} required />
        </div>
        <div className="field">
          <label htmlFor="roles-style">表示スタイル</label>
          <select id="roles-style" value={value.style} onChange={handleField('style')}>
            <option value="buttons">ボタン</option>
            <option value="select">セレクトメニュー</option>
            <option value="reactions">リアクション</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="roles-message">補足メッセージ (任意)</label>
        <textarea id="roles-message" value={value.message_content ?? ''} onChange={handleMessageContent} />
      </div>
      <div className="list" style={{ marginTop: 24 }}>
        <div className="section-actions" style={{ justifyContent: 'space-between' }}>
          <h3>ロール一覧</h3>
          <button type="button" className="secondary" onClick={handleAddRole}>
            ロールを追加
          </button>
        </div>
        {value.roles.length === 0 ? <p className="hint">まだロールは登録されていません。</p> : null}
        {value.roles.map((role, index) => (
          <div className="list-item" key={`${role.role_id}-${index}`}>
            <div className="inline-fields">
              <div className="field">
                <label>Role ID</label>
                <input value={role.role_id} onChange={handleRoleIdChange(index)} />
              </div>
              <div className="field">
                <label>表示ラベル</label>
                <input value={role.label} onChange={handleRoleChange(index, 'label')} />
              </div>
              <div className="field">
                <label>並び順</label>
                <input type="number" value={role.sort_order ?? 0} onChange={handleRoleChange(index, 'sort_order')} />
              </div>
              <div className="field">
                <label>リアクション絵文字</label>
                <input value={role.emoji ?? emojiMap[role.role_id] ?? ''} onChange={handleRoleChange(index, 'emoji')} />
              </div>
            </div>
            <div className="inline-fields">
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label>説明 (任意)</label>
                <textarea value={role.description ?? ''} onChange={handleRoleChange(index, 'description')} />
              </div>
              <div className="field" style={{ alignSelf: 'flex-end' }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(role.hidden)}
                    onChange={handleRoleChange(index, 'hidden') as any}
                  />
                  非表示にする
                </label>
              </div>
            </div>
            <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="small-button danger" onClick={() => handleRemoveRole(index)}>
                ロール削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
};

export default RolesSection;
