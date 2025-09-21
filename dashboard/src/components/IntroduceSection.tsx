import { FormEvent, useState } from 'react';
import { IntroduceConfig, IntroduceField, IntroduceSchema } from '../types';
import { createDefaultField } from '../defaults';

interface Props {
  config: IntroduceConfig;
  schema: IntroduceSchema;
  onConfigChange: (value: IntroduceConfig) => void;
  onSchemaChange: (value: IntroduceSchema) => void;
  onSaveConfig: (value: IntroduceConfig) => Promise<void>;
  onSaveSchema: (value: IntroduceSchema) => Promise<void>;
}

const IntroduceSection = ({
  config,
  schema,
  onConfigChange,
  onSchemaChange,
  onSaveConfig,
  onSaveSchema,
}: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleConfigField = (field: keyof IntroduceConfig) =>
    (event: FormEvent<HTMLInputElement>) => {
      if (field === 'mention_role_ids') {
        const parts = event.currentTarget.value
          .split(',')
          .map((piece) => piece.trim())
          .filter((piece) => piece.length > 0);
        onConfigChange({ ...config, mention_role_ids: parts });
        return;
      }
      onConfigChange({ ...config, [field]: event.currentTarget.value });
    };

  const handleFieldChange = (index: number, field: keyof IntroduceField) =>
    (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const updated = schema.fields.map((item, idx) => {
        if (idx !== index) {
          return item;
        }
        if (field === 'required' || field === 'enabled') {
          return { ...item, [field]: (event.currentTarget as HTMLInputElement).checked };
        }
        if (field === 'max_length') {
          return { ...item, max_length: Number(event.currentTarget.value) };
        }
        return { ...item, [field]: event.currentTarget.value };
      });
      onSchemaChange({ ...schema, fields: updated });
    };

  const handleAddField = () => {
    onSchemaChange({ ...schema, fields: [...schema.fields, createDefaultField()] });
  };

  const handleRemoveField = (index: number) => {
    onSchemaChange({ ...schema, fields: schema.fields.filter((_, idx) => idx !== index) });
  };

  const handleSaveConfig = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSaveConfig(config);
      setStatus('自己紹介投稿設定を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSchema = async () => {
    setSaving(true);
    try {
      await onSaveSchema(schema);
      setStatus('自己紹介フォームを保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-card">
      <form onSubmit={handleSaveConfig}>
        <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>自己紹介設定</h2>
            <p className="hint">投稿チャンネルやメンション対象を管理します。</p>
          </div>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '設定を保存'}
          </button>
        </div>
        {status ? <div className="status-bar">{status}</div> : null}
        <div className="form-grid two-columns">
          <div className="field">
            <label htmlFor="introduce-channel">投稿チャンネル ID</label>
            <input
              id="introduce-channel"
              value={config.channel_id}
              onChange={handleConfigField('channel_id')}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="introduce-mentions">メンションするロール ID (カンマ区切り)</label>
            <input
              id="introduce-mentions"
              value={config.mention_role_ids.join(', ')}
              onChange={handleConfigField('mention_role_ids')}
            />
          </div>
          <div className="field">
            <label htmlFor="introduce-title">Embed タイトル</label>
            <input id="introduce-title" value={config.embed_title} onChange={handleConfigField('embed_title')} />
          </div>
          <div className="field">
            <label htmlFor="introduce-footer">フッター (任意)</label>
            <input
              id="introduce-footer"
              value={config.footer_text ?? ''}
              onChange={handleConfigField('footer_text')}
            />
          </div>
        </div>
      </form>
      <div className="list" style={{ marginTop: 24 }}>
        <div className="section-actions" style={{ justifyContent: 'space-between' }}>
          <h3>自己紹介フォーム項目</h3>
          <div className="actions-row">
            <button type="button" className="secondary" onClick={handleAddField} disabled={saving}>
              項目を追加
            </button>
            <button type="button" onClick={handleSaveSchema} disabled={saving}>
              {saving ? '保存中...' : 'フォームを保存'}
            </button>
          </div>
        </div>
        {schema.fields.length === 0 ? <p className="hint">フォーム項目が未設定です。</p> : null}
        {schema.fields.map((field, index) => (
          <div className="list-item" key={`${field.field_id}-${index}`}>
            <div className="inline-fields">
              <div className="field">
                <label>フィールド ID</label>
                <input value={field.field_id} onChange={handleFieldChange(index, 'field_id')} />
              </div>
              <div className="field">
                <label>表示ラベル</label>
                <input value={field.label} onChange={handleFieldChange(index, 'label')} />
              </div>
              <div className="field">
                <label>最大文字数</label>
                <input
                  type="number"
                  value={field.max_length}
                  onChange={handleFieldChange(index, 'max_length')}
                  min={1}
                  max={1024}
                />
              </div>
            </div>
            <div className="inline-fields">
              <div className="field" style={{ gridColumn: '1 / span 2' }}>
                <label>プレースホルダー</label>
                <input value={field.placeholder ?? ''} onChange={handleFieldChange(index, 'placeholder')} />
              </div>
              <div className="field" style={{ alignSelf: 'flex-end' }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={handleFieldChange(index, 'required') as any}
                  />
                  必須
                </label>
              </div>
              <div className="field" style={{ alignSelf: 'flex-end' }}>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={field.enabled}
                    onChange={handleFieldChange(index, 'enabled') as any}
                  />
                  有効
                </label>
              </div>
            </div>
            <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="small-button danger" onClick={() => handleRemoveField(index)}>
                項目削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IntroduceSection;
