import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WelcomeCardConfig,
  WelcomeConfig,
  WelcomeMode,
  WelcomePreview,
} from '../types';
import { createDefaultButton, createDefaultWelcomeCard } from '../defaults';

type FontOption = {
  key: string;
  label: string;
  family: string;
  description?: string;
};

const FONT_OPTIONS: FontOption[] = [
  {
    key: 'noto-sans',
    label: 'Noto Sans JP（モダン）',
    family: '"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",sans-serif',
    description: '読みやすいゴシック体。汎用的なカードにおすすめ。',
  },
  {
    key: 'noto-serif',
    label: 'Noto Serif JP（明朝）',
    family: '"Noto Serif JP","Yu Mincho","Hiragino Mincho ProN","MS PMincho",serif',
    description: '落ち着いた雰囲気の明朝体。',
  },
  {
    key: 'yu-gothic',
    label: '游ゴシック',
    family: '"Yu Gothic","YuGothic","Hiragino Sans","Meiryo",sans-serif',
    description: 'Windows / macOS に搭載されている細身のゴシック体。',
  },
  {
    key: 'hiragino',
    label: 'ヒラギノ角ゴ',
    family: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif',
    description: 'macOS 標準の角ゴシック体。',
  },
  {
    key: 'rounded',
    label: 'Rounded M+（丸ゴシック）',
    family: '"BIZ UDGothic","Rounded Mplus 1c","Noto Sans JP",sans-serif',
    description: '柔らかい印象を与える丸ゴシック体。',
  },
  {
    key: 'custom',
    label: 'カスタム（手動入力）',
    family: '',
    description: '任意の CSS font-family を入力してください。',
  },
];

const CUSTOM_FONT_KEY = 'custom';
const DEFAULT_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.45)';
const PREVIEW_MODE_STORAGE_KEY = 'dashboard.welcome.previewMode';
const PREVIEW_AUTO_DELAY_MS = 400;
const FONT_PREVIEW_TEXT = 'ようこそ Nyaimlab!';

type PreviewMode = 'auto' | 'manual';
type CardNumberField =
  | 'avatar_offset_x'
  | 'avatar_offset_y'
  | 'title_offset_x'
  | 'title_offset_y'
  | 'title_font_size'
  | 'subtitle_offset_x'
  | 'subtitle_offset_y'
  | 'subtitle_font_size'
  | 'body_offset_x'
  | 'body_offset_y'
  | 'body_font_size';

const colorParsingContext =
  typeof document !== 'undefined'
    ? document.createElement('canvas').getContext('2d')
    : null;

const componentToHex = (value: number) =>
  Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');

const normalizeHex = (input: string | null | undefined, fallback = '#000000') => {
  if (!input) {
    return fallback;
  }
  let hex = input.trim();
  if (!hex.startsWith('#')) {
    hex = `#${hex}`;
  }
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (hex.length === 7) {
    return hex.toLowerCase();
  }
  return fallback;
};

const rgbStringToHex = (value: string, fallback = '#000000') => {
  const match = value
    .replace(/\s+/g, '')
    .match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i);
  if (!match) {
    return fallback;
  }
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
};

const cssColorToHex = (value: string | null | undefined, fallback = '#ffffff') => {
  if (!value || !colorParsingContext) {
    return fallback;
  }
  try {
    colorParsingContext.fillStyle = value;
    const computed = colorParsingContext.fillStyle as string;
    if (computed.startsWith('#')) {
      return normalizeHex(computed, fallback);
    }
    if (computed.startsWith('rgb')) {
      return rgbStringToHex(computed, fallback);
    }
  } catch {
    return fallback;
  }
  return fallback;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex);
  const match = normalized.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
};

const clampAlpha = (value: number) => Math.max(0, Math.min(1, value));

const parseOverlayColor = (value: string | null | undefined) => {
  if (!value) {
    return {
      hex: '#000000',
      alpha: 0.45,
    };
  }
  const normalized = value.trim();
  if (normalized.startsWith('rgba') || normalized.startsWith('rgb')) {
    const match = normalized
      .replace(/\s+/g, '')
      .match(/^rgba?\((\d+),(\d+),(\d+)(?:,(\d*\.?\d+))?\)$/i);
    if (match) {
      const hex = `#${componentToHex(Number(match[1]))}${componentToHex(Number(match[2]))}${componentToHex(
        Number(match[3])
      )}`;
      const alpha = match[4] !== undefined ? clampAlpha(Number(match[4])) : 1;
      return { hex, alpha };
    }
  }
  if (normalized.startsWith('#')) {
    return { hex: normalizeHex(normalized), alpha: 1 };
  }
  return {
    hex: cssColorToHex(normalized, '#000000'),
    alpha: 1,
  };
};

const buildOverlayColor = (hex: string, alpha: number) => {
  const { r, g, b } = hexToRgb(hex);
  const clamped = clampAlpha(alpha);
  return `rgba(${r}, ${g}, ${b}, ${clamped.toFixed(2)})`;
};

const fontSignature = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, '').replace(/["']/g, '').toLowerCase();

const findFontOption = (family: string | null | undefined): FontOption => {
  if (!family) {
    return FONT_OPTIONS[0];
  }
  const signature = fontSignature(family);
  const match = FONT_OPTIONS.find(
    (option) =>
      option.key !== CUSTOM_FONT_KEY && fontSignature(option.family) === signature
  );
  return match ?? FONT_OPTIONS.find((option) => option.key === CUSTOM_FONT_KEY)!;
};

interface Props {
  value: WelcomeConfig;
  onChange: (value: WelcomeConfig) => void;
  onSave: (value: WelcomeConfig) => Promise<void>;
  onPreview: (value: WelcomeConfig) => Promise<WelcomePreview>;
}

const convertEmptyToNull = (input: string): string | null =>
  input.trim() === '' ? null : input;

const WelcomeSection = ({ value, onChange, onSave, onPreview }: Props) => {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<WelcomePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() => {
    if (typeof window === 'undefined') {
      return 'auto';
    }
    const stored = window.localStorage.getItem(PREVIEW_MODE_STORAGE_KEY);
    return stored === 'manual' ? 'manual' : 'auto';
  });
  const [previewStale, setPreviewStale] = useState(false);
  const [cardNumberDrafts, setCardNumberDrafts] = useState<Partial<Record<CardNumberField, string>>>({});
  const onPreviewRef = useRef(onPreview);
  const previewRequestId = useRef(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, previewMode);
    }
  }, [previewMode]);

  const invalidatePreview = useCallback(() => {
    previewRequestId.current += 1;
    setPreviewError(null);
    setPreviewStale(true);
  }, []);

  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  useEffect(() => {
    setCardNumberDrafts({});
  }, [value.card]);

  const requestPreview = useCallback(
    async (config: WelcomeConfig) => {
      const requestId = ++previewRequestId.current;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const previewFn = onPreviewRef.current;
        const result = await previewFn(config);
        if (previewRequestId.current === requestId) {
          setPreview(result);
          setPreviewStale(false);
        }
      } catch (error: any) {
        const message = error?.message ?? 'プレビューの生成に失敗しました';
        if (previewRequestId.current === requestId) {
          setPreviewError(message);
        }
      } finally {
        if (previewRequestId.current === requestId) {
          setPreviewLoading(false);
        }
      }
    },
    []
  );

  const handleField =
    (field: keyof WelcomeConfig) =>
    (event: FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const input = event.currentTarget;
      invalidatePreview();
      const updated = { ...value, [field]: input.value };
      onChange(updated);
    };

  const handleMemberMode = (event: FormEvent<HTMLSelectElement>) => {
    invalidatePreview();
    onChange({ ...value, member_index_mode: event.currentTarget.value as WelcomeConfig['member_index_mode'] });
  };

  const handleTimezone = (event: FormEvent<HTMLSelectElement>) => {
    invalidatePreview();
    onChange({ ...value, join_timezone: event.currentTarget.value as WelcomeConfig['join_timezone'] });
  };

  const handleModeChange = (event: FormEvent<HTMLSelectElement>) => {
    const mode = event.currentTarget.value as WelcomeMode;
    const next = { ...value, mode };
    if (mode === 'card' && !value.card) {
      next.card = createDefaultWelcomeCard();
    }
    invalidatePreview();
    onChange(next);
  };

  const handleCardField =
    (field: keyof WelcomeCardConfig, allowEmpty = false) =>
    (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = event.currentTarget.value;
      commitCardUpdate((card) => ({
        ...card,
        [field]: (allowEmpty ? convertEmptyToNull(raw) : raw) as WelcomeCardConfig[typeof field],
      }));
    };

  const handleRemoveButton = (index: number) => {
    const buttons = value.buttons.filter((_, idx) => idx !== index);
    invalidatePreview();
    onChange({ ...value, buttons });
  };

  const handleAddButton = () => {
    invalidatePreview();
    onChange({ ...value, buttons: [...value.buttons, createDefaultButton()] });
  };

  const handleButtonChange =
    (index: number, field: 'label' | 'target' | 'value' | 'emoji') =>
    (event: FormEvent<HTMLInputElement | HTMLSelectElement>) => {
      const buttons = value.buttons.map((button, idx) =>
        idx === index ? { ...button, [field]: event.currentTarget.value } : button
      );
      invalidatePreview();
      onChange({ ...value, buttons });
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

  const handlePreview = async () => {
    await requestPreview(value);
  };

  const commitCardUpdate = (updater: (card: WelcomeCardConfig) => WelcomeCardConfig) => {
    const base = value.card ?? createDefaultWelcomeCard();
    const updatedCard = updater({ ...base });
    invalidatePreview();
    onChange({ ...value, card: updatedCard });
  };

  const cardConfig = useMemo(() => value.card ?? createDefaultWelcomeCard(), [value.card]);
  const getCardNumberValue = (field: CardNumberField) =>
    cardNumberDrafts[field] ?? String(cardConfig[field]);
  const previewButtonLabel = previewLoading
    ? 'プレビュー生成中...'
    : previewMode === 'manual'
    ? 'プレビューを更新'
    : '今すぐプレビュー';
  const currentFontOption = useMemo(() => findFontOption(cardConfig.font_family ?? null), [cardConfig.font_family]);
  const fontSelectValue = currentFontOption.key;
  const isCustomFont = fontSelectValue === CUSTOM_FONT_KEY;
  const textColorHex = useMemo(() => cssColorToHex(cardConfig.text_color, '#ffffff'), [cardConfig.text_color]);
  const accentColorHex = useMemo(() => cssColorToHex(cardConfig.accent_color, '#fee75c'), [cardConfig.accent_color]);
  const avatarBorderColorHex = useMemo(
    () => cssColorToHex(cardConfig.avatar_border_color ?? '#fee75c', '#fee75c'),
    [cardConfig.avatar_border_color]
  );
  const overlayState = useMemo(() => parseOverlayColor(cardConfig.overlay_color), [cardConfig.overlay_color]);
  const overlayEnabled = cardConfig.overlay_color !== null;
  const backgroundPreviewable = useMemo(() => {
    const raw = cardConfig.background_image?.trim() ?? '';
    return /^https?:\/\//i.test(raw) || raw.startsWith('data:');
  }, [cardConfig.background_image]);
  const fontPreviewFamily =
    (cardConfig.font_family && cardConfig.font_family.trim().length > 0 ? cardConfig.font_family : currentFontOption.family) ||
    FONT_OPTIONS[0].family;

  useEffect(() => {
    if (previewMode !== 'auto') {
      return;
    }
    const timer = setTimeout(() => {
      void requestPreview(value);
    }, PREVIEW_AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, requestPreview, previewMode]);

  const handleColorSwatchChange =
    (field: 'text_color' | 'accent_color' | 'avatar_border_color') =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const hex = normalizeHex(event.currentTarget.value, '#000000');
      commitCardUpdate((card) => ({
        ...card,
        [field]: hex,
      }));
    };

  const handlePreviewModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const mode = event.currentTarget.value as PreviewMode;
    setPreviewMode(mode);
    if (mode === 'auto') {
      setPreviewStale(true);
    }
  };

  const handleCardNumberField =
    (field: CardNumberField) => (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.currentTarget.value;
      setCardNumberDrafts((prev) => ({ ...prev, [field]: raw }));
      if (!raw.trim()) {
        return;
      }
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        commitCardUpdate((card) => ({
          ...card,
          [field]: parsed,
        }));
      }
    };

  const handleCardNumberBlur = (field: CardNumberField) => () => {
    setCardNumberDrafts((prev) => {
      if (!(field in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleOverlayToggle = (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.currentTarget.checked;
    commitCardUpdate((card) => ({
      ...card,
      overlay_color: enabled ? card.overlay_color ?? DEFAULT_OVERLAY_COLOR : null,
    }));
  };

  const handleOverlayColorSwatch = (event: ChangeEvent<HTMLInputElement>) => {
    const hex = normalizeHex(event.currentTarget.value, overlayState.hex);
    const next = buildOverlayColor(hex, overlayState.alpha);
    commitCardUpdate((card) => ({
      ...card,
      overlay_color: next,
    }));
  };

  const handleOverlayOpacityChange = (event: ChangeEvent<HTMLInputElement>) => {
    const percent = Number(event.currentTarget.value);
    const alpha = clampAlpha(Number.isNaN(percent) ? overlayState.alpha : percent / 100);
    const next = buildOverlayColor(overlayState.hex, alpha);
    commitCardUpdate((card) => ({
      ...card,
      overlay_color: next,
    }));
  };

  const handleOverlayStringChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value;
    const normalized = raw.trim();
    commitCardUpdate((card) => ({
      ...card,
      overlay_color: normalized ? normalized : null,
    }));
  };

  const handleFontSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const key = event.currentTarget.value;
    if (key === CUSTOM_FONT_KEY) {
      commitCardUpdate((card) => ({
        ...card,
        font_family: card.font_family ?? '',
      }));
      return;
    }
    const option = FONT_OPTIONS.find((font) => font.key === key) ?? FONT_OPTIONS[0];
    commitCardUpdate((card) => ({
      ...card,
      font_family: option.family,
    }));
  };

  const handleCustomFontInput = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value;
    commitCardUpdate((card) => ({
      ...card,
      font_family: raw,
    }));
  };

  const handleBackgroundUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        commitCardUpdate((card) => ({
          ...card,
          background_image: reader.result as string,
        }));
      }
    };
    reader.onerror = () => {
      reader.abort();
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = '';
  };

  const handleClearBackground = () => {
    commitCardUpdate((card) => ({
      ...card,
      background_image: '',
    }));
  };

  return (
    <form className="section-card" onSubmit={handleSubmit}>
      <div className="section-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Welcome & Onboarding</h2>
          <p className="hint">新規参加者への歓迎メッセージとボタンを設定します。</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            value={previewMode}
            onChange={handlePreviewModeChange}
            aria-label="プレビュー更新モード"
            style={{ minWidth: 160 }}
          >
            <option value="auto">自動でプレビュー</option>
            <option value="manual">手動でプレビュー</option>
          </select>
          <button type="button" className="secondary" onClick={handlePreview} disabled={previewLoading}>
            {previewButtonLabel}
          </button>
          <button type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
      {status ? <div className="status-bar">{status}</div> : null}
      <div className="form-grid two-columns">
        <div className="field">
          <label htmlFor="welcome-channel">投稿チャンネル ID</label>
          <input id="welcome-channel" value={value.channel_id} onChange={handleField('channel_id')} required />
        </div>
        <div className="field">
          <label htmlFor="welcome-mode">モード</label>
          <select id="welcome-mode" value={value.mode} onChange={handleModeChange}>
            <option value="embed">Embed</option>
            <option value="card">カード</option>
          </select>
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
          <label htmlFor="message-template">メッセージテンプレート</label>
          <input id="message-template" value={value.message_template} onChange={handleField('message_template')} />
          <p className="hint">
            使用可能な変数: {'{{mention}}'}, {'{{username}}'}, {'{{guild_name}}'}, {'{{member_index}}'}
          </p>
        </div>
      </div>

      {value.mode === 'embed' ? (
        <div className="form-grid two-columns" style={{ marginTop: 16 }}>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="welcome-title">タイトルテンプレート</label>
            <input id="welcome-title" value={value.title_template} onChange={handleField('title_template')} />
            <p className="hint">使用可能な変数: {'{{username}}'}, {'{{member_index}}'}</p>
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="welcome-description">説明テンプレート</label>
            <textarea
              id="welcome-description"
              value={value.description_template}
              onChange={handleField('description_template')}
            />
            <p className="hint">
              使用可能な変数: {'{{username}}'}, {'{{member_index}}'}, {'{{roles_channel_mention}}'}, {'{{guide_url}}'}
            </p>
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
            <p className="hint">使用可能な変数: {'{{username}}'}, {'{{member_index}}'}, {'{{guild_name}}'}</p>
          </div>
        </div>
      ) : null}

      {value.mode === 'card' ? (
        <div className="form-grid two-columns" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="card-background">背景画像</label>
            <input
              id="card-background"
              value={cardConfig.background_image}
              onChange={handleCardField('background_image')}
              placeholder="例: https://example.com/welcome.png"
            />
            <p className="hint">URL・プロジェクト相対パス・data URL のいずれかを指定できます。</p>
            <div className="inline-fields" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
              <input type="file" accept="image/*" onChange={handleBackgroundUpload} />
              <button type="button" className="small-button secondary" onClick={handleClearBackground}>
                クリア
              </button>
            </div>
            {backgroundPreviewable ? (
              <div
                className="image-preview"
                style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: '#f9fafb' }}
              >
                <img
                  src={cardConfig.background_image}
                  alt="背景プレビュー"
                  style={{ maxWidth: '100%', borderRadius: 4 }}
                />
              </div>
            ) : (
              <p className="hint">プレビューは http(s) または data URL 指定時に表示されます。</p>
            )}
          </div>
          <div className="field">
            <label htmlFor="card-font-preset">フォントプリセット</label>
            <select id="card-font-preset" value={fontSelectValue} onChange={handleFontSelectChange}>
              {FONT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            {currentFontOption.description ? <p className="hint">{currentFontOption.description}</p> : null}
            {isCustomFont ? (
              <div style={{ marginTop: 8 }}>
                <label htmlFor="card-font-family">CSS font-family</label>
                <input
                  id="card-font-family"
                  value={cardConfig.font_family ?? ''}
                  onChange={handleCustomFontInput}
                  placeholder={`"Your Font", sans-serif`}
                />
              </div>
            ) : null}
            <label htmlFor="card-font-path" style={{ marginTop: 12, display: 'block' }}>
              フォントファイルパス (任意)
            </label>
            <input
              id="card-font-path"
              value={cardConfig.font_path ?? ''}
              onChange={handleCardField('font_path', true)}
              placeholder="./assets/fonts/MyFont.otf"
            />
            <p className="hint">Node.js 側でフォントファイルを読み込む場合に設定します。</p>
            <div
              className="font-preview"
              style={{
                marginTop: 12,
                padding: '12px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                background: '#f9fafb',
                fontFamily: fontPreviewFamily,
              }}
            >
              {FONT_PREVIEW_TEXT}
            </div>
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="card-title-template">カードタイトル</label>
            <input id="card-title-template" value={cardConfig.title_template} onChange={handleCardField('title_template')} />
            <p className="hint">使用可能な変数: {'{{username}}'}, {'{{guild_name}}'}</p>
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="card-subtitle-template">カードサブタイトル</label>
            <input
              id="card-subtitle-template"
              value={cardConfig.subtitle_template}
              onChange={handleCardField('subtitle_template')}
            />
            <p className="hint">使用可能な変数: {'{{member_index}}'}</p>
          </div>
          <div className="field" style={{ gridColumn: '1 / span 2' }}>
            <label htmlFor="card-body-template">本文テンプレート (任意)</label>
            <textarea
              id="card-body-template"
              value={cardConfig.body_template ?? ''}
              onChange={handleCardField('body_template', true)}
              placeholder="未設定"
            />
            <p className="hint">使用可能な変数: {'{{username}}'}, {'{{guild_name}}'}。複数行に対応します。</p>
          </div>
          <div className="field">
            <label htmlFor="card-text-color">テキストカラー</label>
            <div className="inline-fields" style={{ alignItems: 'center', gap: 8 }}>
              <input type="color" value={textColorHex} onChange={handleColorSwatchChange('text_color')} aria-label="テキストカラー" />
              <input id="card-text-color" value={cardConfig.text_color} onChange={handleCardField('text_color')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="card-accent-color">アクセントカラー</label>
            <div className="inline-fields" style={{ alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={accentColorHex}
                onChange={handleColorSwatchChange('accent_color')}
                aria-label="アクセントカラー"
              />
              <input id="card-accent-color" value={cardConfig.accent_color} onChange={handleCardField('accent_color')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="card-overlay-color">オーバーレイ</label>
            <div className="overlay-controls" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="checkbox" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={overlayEnabled} onChange={handleOverlayToggle} />
                背景を半透明で暗くする
              </label>
              {overlayEnabled ? (
                <>
                  <div className="inline-fields" style={{ alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={overlayState.hex}
                      onChange={handleOverlayColorSwatch}
                      aria-label="オーバーレイカラー"
                    />
                    <input
                      id="card-overlay-color"
                      value={cardConfig.overlay_color ?? ''}
                      onChange={handleOverlayStringChange}
                      placeholder="rgba(0, 0, 0, 0.45)"
                    />
                  </div>
                  <div className="overlay-slider" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label>不透明度: {Math.round(overlayState.alpha * 100)}%</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(overlayState.alpha * 100)}
                      onChange={handleOverlayOpacityChange}
                    />
                  </div>
                </>
              ) : (
                <p className="hint">チェックすると背景画像を見やすくするための半透明レイヤーを追加できます。</p>
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="card-avatar-border">アバターボーダー色 (任意)</label>
            <div className="inline-fields" style={{ alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={avatarBorderColorHex}
                onChange={handleColorSwatchChange('avatar_border_color')}
                aria-label="アバターボーダー色"
              />
              <input
                id="card-avatar-border"
                value={cardConfig.avatar_border_color ?? ''}
                onChange={handleCardField('avatar_border_color', true)}
                placeholder="未設定"
              />
            </div>
            <p className="hint">枠線を付けない場合は空欄のままにしてください。</p>
          </div>
          <div className="field">
            <label>アイコン位置 (px)</label>
            <div className="inline-fields" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('avatar_offset_x')}
                  min={-512}
                  max={512}
                  onChange={handleCardNumberField('avatar_offset_x')}
                  onBlur={handleCardNumberBlur('avatar_offset_x')}
                />
                <p className="hint">横方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('avatar_offset_y')}
                  min={-576}
                  max={576}
                  onChange={handleCardNumberField('avatar_offset_y')}
                  onBlur={handleCardNumberBlur('avatar_offset_y')}
                />
                <p className="hint">縦方向オフセット</p>
              </div>
            </div>
          </div>
          <div className="field">
            <label>タイトル</label>
            <div className="inline-fields" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('title_offset_x')}
                  onChange={handleCardNumberField('title_offset_x')}
                  min={-512}
                  max={512}
                  onBlur={handleCardNumberBlur('title_offset_x')}
                />
                <p className="hint">横方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('title_offset_y')}
                  onChange={handleCardNumberField('title_offset_y')}
                  min={-200}
                  max={400}
                  onBlur={handleCardNumberBlur('title_offset_y')}
                />
                <p className="hint">縦方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('title_font_size')}
                  onChange={handleCardNumberField('title_font_size')}
                  min={12}
                  max={120}
                  onBlur={handleCardNumberBlur('title_font_size')}
                />
                <p className="hint">フォントサイズ</p>
              </div>
            </div>
          </div>
          <div className="field">
            <label>サブタイトル</label>
            <div className="inline-fields" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('subtitle_offset_x')}
                  onChange={handleCardNumberField('subtitle_offset_x')}
                  min={-512}
                  max={512}
                  onBlur={handleCardNumberBlur('subtitle_offset_x')}
                />
                <p className="hint">横方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('subtitle_offset_y')}
                  onChange={handleCardNumberField('subtitle_offset_y')}
                  min={-200}
                  max={400}
                  onBlur={handleCardNumberBlur('subtitle_offset_y')}
                />
                <p className="hint">縦方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('subtitle_font_size')}
                  onChange={handleCardNumberField('subtitle_font_size')}
                  min={12}
                  max={100}
                  onBlur={handleCardNumberBlur('subtitle_font_size')}
                />
                <p className="hint">フォントサイズ</p>
              </div>
            </div>
          </div>
          <div className="field">
            <label>本文</label>
            <div className="inline-fields" style={{ gap: 8 }}>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('body_offset_x')}
                  onChange={handleCardNumberField('body_offset_x')}
                  min={-512}
                  max={512}
                  onBlur={handleCardNumberBlur('body_offset_x')}
                />
                <p className="hint">横方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('body_offset_y')}
                  onChange={handleCardNumberField('body_offset_y')}
                  min={-400}
                  max={600}
                  onBlur={handleCardNumberBlur('body_offset_y')}
                />
                <p className="hint">縦方向オフセット</p>
              </div>
              <div style={{ flex: 1 }}>
                <input
                  type="number"
                  value={getCardNumberValue('body_font_size')}
                  onChange={handleCardNumberField('body_font_size')}
                  min={12}
                  max={80}
                  onBlur={handleCardNumberBlur('body_font_size')}
                />
                <p className="hint">フォントサイズ</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                <select value={button.target} onChange={handleButtonChange(index, 'target') as any}>
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

      <div className="preview-panel" style={{ marginTop: 24 }}>
        <h3>プレビュー</h3>
        <p className="hint" style={{ marginTop: 4 }}>
          プレビューでは仮のメンバー番号（#128）を表示しています。実際の送信時には「Bot を含める」の設定を反映した実人数に自動で置き換わります。
        </p>
        {previewError ? <div className="status-bar error">{previewError}</div> : null}
        {previewLoading ? <div className="status-bar">プレビューを更新中です...</div> : null}
        {previewStale && !previewLoading && !previewError ? (
          <div className="status-bar">
            最新の設定がまだプレビューに反映されていません。
            {previewMode === 'auto' ? 'まもなく自動更新されます。' : '「プレビューを更新」を押してください。'}
          </div>
        ) : null}
        {!preview && !previewError ? (
          <p className="hint">
            {previewMode === 'auto'
              ? '設定を変更すると、数秒後にプレビューが自動で更新されます。'
              : '「プレビューを更新」を押すと現在の設定でプレビューを生成します。'}
          </p>
        ) : null}
        {preview ? (
          <div className="preview-content">
            {preview.content ? (
              <div className="preview-message">
                <strong>メッセージ内容:</strong> <span>{preview.content}</span>
              </div>
            ) : (
              <div className="preview-message hint">メッセージ本文は送信されません。</div>
            )}
            {preview.mode === 'embed' && preview.embed ? (
              <div className="embed-preview">
                <div className="embed-header">
                  <strong>{preview.embed.title}</strong>
                </div>
                <div className="embed-body">
                  <p>{preview.embed.description}</p>
                  {preview.embed.fields.map((field) => (
                    <div key={field.name} className="embed-field">
                      <strong>{field.name}</strong>
                      <p>{field.value}</p>
                    </div>
                  ))}
                  <div className="embed-footer">{preview.embed.footer_text}</div>
                </div>
              </div>
            ) : null}
            {preview.mode === 'card' && preview.card_base64 ? (
              <div className="card-preview">
                <img
                  src={`data:image/png;base64,${preview.card_base64}`}
                  alt="Welcome card preview"
                  style={{ maxWidth: '100%', borderRadius: 8, marginTop: 12 }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
};

export default WelcomeSection;
