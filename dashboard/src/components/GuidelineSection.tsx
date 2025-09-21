import { FormEvent, useState } from 'react';
import { GuidelineTemplate } from '../types';

interface Props {
  value: GuidelineTemplate;
  onChange: (value: GuidelineTemplate) => void;
  onSave: (value: GuidelineTemplate) => Promise<void>;
  onTest: () => Promise<void>;
}

const GuidelineSection = ({ value, onChange, onSave, onTest }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleContent = (event: FormEvent<HTMLTextAreaElement>) => {
    onChange({ ...value, content: event.currentTarget.value });
  };

  const handleAttachmentChange = (index: number) => (event: FormEvent<HTMLInputElement>) => {
    const attachments = value.attachments.map((item, idx) => (idx === index ? event.currentTarget.value : item));
    onChange({ ...value, attachments });
  };

  const handleAddAttachment = () => {
    onChange({ ...value, attachments: [...value.attachments, 'https://example.com/asset.png'] });
  };

  const handleRemoveAttachment = (index: number) => {
    onChange({ ...value, attachments: value.attachments.filter((_, idx) => idx !== index) });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      setStatus('ガイドライン DM を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setSaving(true);
    try {
      await onTest();
      setStatus('テスト送信リクエストを送信しました。');
    } catch (error: any) {
      setStatus(error?.message ?? 'テスト送信に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="section-card" onSubmit={handleSubmit}>
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>ガイドライン DM</h2>
          <p className="hint">新規参加者へ送信する DM テンプレートを編集します。</p>
        </div>
        <div className="actions-row">
          <button type="button" className="secondary" onClick={handleTest} disabled={saving}>
            テスト送信
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="field">
        <label htmlFor="guideline-content">DM メッセージ</label>
        <textarea id="guideline-content" value={value.content} onChange={handleContent} required />
      </div>
      <div className="list" style={{ marginTop: 16 }}>
        <div className="section-actions" style={{ justifyContent: 'space-between' }}>
          <h3>添付ファイル URL</h3>
          <button type="button" className="secondary" onClick={handleAddAttachment}>
            URL を追加
          </button>
        </div>
        {value.attachments.length === 0 ? <p className="hint">登録済みの添付はありません。</p> : null}
        {value.attachments.map((attachment, index) => (
          <div className="list-item" key={`${attachment}-${index}`}>
            <div className="inline-fields">
              <div className="field" style={{ flex: 1 }}>
                <label>URL</label>
                <input value={attachment} onChange={handleAttachmentChange(index)} />
              </div>
            </div>
            <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="small-button danger" onClick={() => handleRemoveAttachment(index)}>
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
};

export default GuidelineSection;
