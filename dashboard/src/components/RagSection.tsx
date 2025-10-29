import { FormEvent, useState } from 'react';
import { RagConfig, RagKnowledgeEntry, RagMode } from '../types';

interface Props {
  value: RagConfig;
  onChange: (value: RagConfig) => void;
  onSave: (value: RagConfig) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRegisterKnowledge: (entry: RagKnowledgeEntry) => Promise<string>;
}

const RagSection = ({ value, onChange, onSave, onRefresh, onRegisterKnowledge }: Props) => {
  const [saving, setSaving] = useState(false);
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [knowledgeStatus, setKnowledgeStatus] = useState<string | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeTags, setKnowledgeTags] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');

  const handlePromptChange = (field: keyof RagConfig['prompts']) =>
    (event: FormEvent<HTMLTextAreaElement>) => {
      const prompts = { ...value.prompts, [field]: event.currentTarget.value };
      onChange({ ...value, prompts });
    };

  const handleFeelingChange = (field: keyof RagConfig['feelings']) =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (field === 'default_mode') {
        onChange({ ...value, feelings: { ...value.feelings, default_mode: event.currentTarget.value as RagMode } });
        return;
      }
      const numeric = Number(event.currentTarget.value);
      const next = { ...value.feelings };
      if (field === 'excitement' || field === 'empathy' || field === 'probability') {
        next[field] = Number.isNaN(numeric) ? next[field] : Math.min(1, Math.max(0, numeric));
      } else if (field === 'cooldown_minutes') {
        next.cooldown_minutes = Number.isNaN(numeric) ? next.cooldown_minutes : Math.max(0, numeric);
      }
      onChange({ ...value, feelings: next });
    };

  const handleExcludedChannels = (event: FormEvent<HTMLTextAreaElement>) => {
    const channels = event.currentTarget.value
      .split(/\r?\n|[,\s]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    onChange({ ...value, short_term: { ...value.short_term, excluded_channels: channels } });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await onSave(value);
      setStatus('RAG 設定を保存しました。');
    } catch (error: any) {
      setStatus(error?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = async () => {
    setStatus(null);
    try {
      await onRefresh();
      setStatus('最新の設定を読み込みました。');
    } catch (error: any) {
      setStatus(error?.message ?? '再読み込みに失敗しました');
    }
  };

  const handleKnowledgeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!knowledgeTitle.trim() || !knowledgeContent.trim()) {
      setKnowledgeStatus('タイトルと本文は必須です。');
      return;
    }
    setKnowledgeSaving(true);
    setKnowledgeStatus(null);
    try {
      const tags = knowledgeTags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      const path = await onRegisterKnowledge({
        title: knowledgeTitle.trim(),
        content: knowledgeContent,
        tags,
      });
      setKnowledgeStatus(`ナレッジを登録しました: ${path}`);
      setKnowledgeTitle('');
      setKnowledgeTags('');
      setKnowledgeContent('');
    } catch (error: any) {
      setKnowledgeStatus(error?.message ?? 'ナレッジの登録に失敗しました');
    } finally {
      setKnowledgeSaving(false);
    }
  };

  return (
    <div className="section-stack">
      <form className="section-card" onSubmit={handleSave}>
        <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2>RAG 設定</h2>
            <p className="hint">モード別プロンプトや感情パラメータ、短期記憶の除外チャンネルを管理します。</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="secondary" onClick={handleRefresh} disabled={saving}>
              最新を読み込む
            </button>
            <button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
        {status ? <div className="status-bar">{status}</div> : null}
        <div className="form-grid two-columns" style={{ marginTop: 16 }}>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="rag-prompt-base">ベースプロンプト</label>
            <textarea id="rag-prompt-base" value={value.prompts.base} onChange={handlePromptChange('base')} rows={5} />
          </div>
          <div className="field">
            <label htmlFor="rag-prompt-help">ヘルプモードプロンプト</label>
            <textarea id="rag-prompt-help" value={value.prompts.help} onChange={handlePromptChange('help')} rows={4} />
          </div>
          <div className="field">
            <label htmlFor="rag-prompt-coach">コーチモードプロンプト</label>
            <textarea id="rag-prompt-coach" value={value.prompts.coach} onChange={handlePromptChange('coach')} rows={4} />
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="rag-prompt-chat">チャットモードプロンプト</label>
            <textarea id="rag-prompt-chat" value={value.prompts.chat} onChange={handlePromptChange('chat')} rows={3} />
          </div>
        </div>
        <div className="form-grid two-columns" style={{ marginTop: 24 }}>
          <div className="field">
            <label htmlFor="rag-excitement">興奮度 (0-1)</label>
            <input
              id="rag-excitement"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={value.feelings.excitement}
              onChange={handleFeelingChange('excitement')}
            />
          </div>
          <div className="field">
            <label htmlFor="rag-empathy">共感度 (0-1)</label>
            <input
              id="rag-empathy"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={value.feelings.empathy}
              onChange={handleFeelingChange('empathy')}
            />
          </div>
          <div className="field">
            <label htmlFor="rag-probability">自発発話の確率 (0-1)</label>
            <input
              id="rag-probability"
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={value.feelings.probability}
              onChange={handleFeelingChange('probability')}
            />
          </div>
          <div className="field">
            <label htmlFor="rag-cooldown">クールダウン (分)</label>
            <input
              id="rag-cooldown"
              type="number"
              min={0}
              step={0.5}
              value={value.feelings.cooldown_minutes}
              onChange={handleFeelingChange('cooldown_minutes')}
            />
          </div>
          <div className="field">
            <label htmlFor="rag-default-mode">デフォルトモード</label>
            <select
              id="rag-default-mode"
              value={value.feelings.default_mode}
              onChange={handleFeelingChange('default_mode')}
            >
              <option value="chat">チャット</option>
              <option value="help">ヘルプ</option>
              <option value="coach">コーチ</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="rag-excluded-channels">短期記憶から除外するチャンネル ID</label>
            <textarea
              id="rag-excluded-channels"
              placeholder="チャンネル ID を改行またはカンマで区切って入力"
              value={value.short_term.excluded_channels.join('\n')}
              onChange={handleExcludedChannels}
              rows={4}
            />
            <p className="hint">ここで指定したチャンネルのメッセージは短期記憶や RAG ナレッジへ保存されません。</p>
          </div>
        </div>
      </form>

      <form className="section-card" onSubmit={handleKnowledgeSubmit}>
        <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2>ナレッジ登録</h2>
            <p className="hint">ダッシュボードから追加したいメモを Markdown として保存し、RAG に即時取り込みます。</p>
          </div>
          <button type="submit" disabled={knowledgeSaving}>
            {knowledgeSaving ? '登録中...' : '登録する'}
          </button>
        </div>
        {knowledgeStatus ? <div className="status-bar">{knowledgeStatus}</div> : null}
        <div className="form-grid two-columns" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="rag-knowledge-title">タイトル</label>
            <input
              id="rag-knowledge-title"
              value={knowledgeTitle}
              onChange={(event: FormEvent<HTMLInputElement>) => setKnowledgeTitle(event.currentTarget.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="rag-knowledge-tags">タグ (カンマ区切り)</label>
            <input
              id="rag-knowledge-tags"
              value={knowledgeTags}
              onChange={(event: FormEvent<HTMLInputElement>) => setKnowledgeTags(event.currentTarget.value)}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="rag-knowledge-content">本文 (Markdown)</label>
            <textarea
              id="rag-knowledge-content"
              value={knowledgeContent}
              onChange={(event: FormEvent<HTMLTextAreaElement>) => setKnowledgeContent(event.currentTarget.value)}
              rows={8}
              required
            />
          </div>
        </div>
      </form>
    </div>
  );
};

export default RagSection;
