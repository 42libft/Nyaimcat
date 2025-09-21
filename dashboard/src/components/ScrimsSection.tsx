import { FormEvent, useState } from 'react';
import { ScrimConfig, ScrimDay, ScrimRule } from '../types';

interface Props {
  value: ScrimConfig;
  onChange: (value: ScrimConfig) => void;
  onSave: (value: ScrimConfig) => Promise<void>;
  onRun: (dryRun: boolean) => Promise<void>;
}

const createRule = (): ScrimRule => ({
  day: 'sun',
  survey_open_hour: 12,
  survey_close_hour: 22,
  notify_channel_id: '',
  min_team_members: 3,
});

const ScrimsSection = ({ value, onChange, onSave, onRun }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleField = (field: keyof ScrimConfig) => (event: FormEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (field === 'manager_role_id') {
      onChange({ ...value, manager_role_id: event.currentTarget.value });
      return;
    }
    onChange({ ...value, [field]: event.currentTarget.value });
  };

  const handleTimezone = (event: FormEvent<HTMLSelectElement>) => {
    onChange({ ...value, timezone: event.currentTarget.value as ScrimConfig['timezone'] });
  };

  const handleRuleChange = (index: number, field: keyof ScrimRule) =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement>) => {
      const updated = value.rules.map((rule, idx) => {
        if (idx !== index) {
          return rule;
        }
        if (field === 'day') {
          return { ...rule, day: event.currentTarget.value as ScrimDay };
        }
        if (field === 'survey_open_hour' || field === 'survey_close_hour' || field === 'min_team_members') {
          return { ...rule, [field]: Number(event.currentTarget.value) };
        }
        return { ...rule, [field]: event.currentTarget.value };
      });
      onChange({ ...value, rules: updated });
    };

  const handleAddRule = () => {
    onChange({ ...value, rules: [...value.rules, createRule()] });
  };

  const handleRemoveRule = (index: number) => {
    onChange({ ...value, rules: value.rules.filter((_, idx) => idx !== index) });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(value);
      setStatus('スクリム設定を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (dryRun: boolean) => {
    setSaving(true);
    try {
      await onRun(dryRun);
      setStatus(dryRun ? 'ドライランを実行しました。' : 'スクリムを実行リクエストしました。');
    } catch (error: any) {
      setStatus(error?.message ?? '実行に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="section-card" onSubmit={handleSubmit}>
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>スクリム補助</h2>
          <p className="hint">定期スクリムの通知・集計ロジックを設定します。</p>
        </div>
        <div className="actions-row">
          <button type="button" className="secondary" onClick={() => handleRun(true)} disabled={saving}>
            ドライラン
          </button>
          <button type="button" className="secondary" onClick={() => handleRun(false)} disabled={saving}>
            実行
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="form-grid two-columns">
        <div className="field">
          <label htmlFor="scrim-timezone">タイムゾーン</label>
          <select id="scrim-timezone" value={value.timezone} onChange={handleTimezone}>
            <option value="Asia/Tokyo">Asia/Tokyo</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="scrim-manager">マネージャーロール ID (任意)</label>
          <input id="scrim-manager" value={value.manager_role_id ?? ''} onChange={handleField('manager_role_id')} />
        </div>
      </div>
      <div className="list" style={{ marginTop: 24 }}>
        <div className="section-actions" style={{ justifyContent: 'space-between' }}>
          <h3>通知ルール</h3>
          <button type="button" className="secondary" onClick={handleAddRule}>
            ルールを追加
          </button>
        </div>
        {value.rules.length === 0 ? <p className="hint">通知ルールが未設定です。</p> : null}
        {value.rules.map((rule, index) => (
          <div className="list-item" key={`${rule.day}-${index}`}>
            <div className="inline-fields">
              <div className="field">
                <label>曜日</label>
                <select value={rule.day} onChange={handleRuleChange(index, 'day')}>
                  <option value="sun">日</option>
                  <option value="mon">月</option>
                  <option value="tue">火</option>
                  <option value="wed">水</option>
                  <option value="thu">木</option>
                  <option value="fri">金</option>
                  <option value="sat">土</option>
                </select>
              </div>
              <div className="field">
                <label>通知チャンネル ID</label>
                <input value={rule.notify_channel_id} onChange={handleRuleChange(index, 'notify_channel_id')} />
              </div>
              <div className="field">
                <label>開始時刻</label>
                <input
                  type="number"
                  value={rule.survey_open_hour}
                  min={0}
                  max={23}
                  onChange={handleRuleChange(index, 'survey_open_hour')}
                />
              </div>
              <div className="field">
                <label>終了時刻</label>
                <input
                  type="number"
                  value={rule.survey_close_hour}
                  min={0}
                  max={23}
                  onChange={handleRuleChange(index, 'survey_close_hour')}
                />
              </div>
              <div className="field">
                <label>最少メンバー数</label>
                <input
                  type="number"
                  value={rule.min_team_members}
                  min={1}
                  max={10}
                  onChange={handleRuleChange(index, 'min_team_members')}
                />
              </div>
            </div>
            <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="small-button danger" onClick={() => handleRemoveRule(index)}>
                ルール削除
              </button>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
};

export default ScrimsSection;
