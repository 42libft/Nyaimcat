# 設計メモ — 20251107_codex-autonomous-workflow

## アーキテクチャ方針
- **多層バリデーション**: Dashboard → FastAPI → Bot runtime の 3 層で同じ制約（`member_count_strategy` 列挙、Welcome title 非空）を共有し、上位層で防ぎ下位層でサニタイズ／フォールバックする。
- **入力サニタイズの一元化**: Bot ランタイムの Zod スキーマに「trim → 空文字は `undefined`」の前処理を追加し、`.default()` をそのまま利用してデフォルト値へフォールバックさせる。
- **再現性の高い検証コマンド**: `npm run config:validate` を追加し、CI / ローカル問わず `ts-node` で `loadConfig` を叩くだけの単純なスクリプトにする。

## 影響範囲
- Dashboard: `src/components/SettingsSection.tsx`, `src/components/WelcomeSection.tsx`, `src/types.ts`.
- 管理 API: `src/nyaimlab/schemas.py`（列挙・バリデーションの更新）。
- Bot ランタイム: `src/config/schema.ts`（文字列前処理）、`src/cli/configValidate.ts`（新規）、`package.json`（scripts）。
- ドキュメント: `plan.md`, `docs/plans.md`, `tasks.md`, `docs/codex_agent_plan.md`, `meta_generator.md`, `.workflow-sessions/` ログ。

## 設計メモ
- Dashboard では保存直前に `validateWelcomeConfig` を実行し、カードモード or Embed モードに応じてタイトル必須をチェック。エラーは `status` メッセージに表示してサーバー送信を止める。
- `SettingsSection` では `member_count_strategy` が 2 値のみになるよう `MemberCountStrategy` 型と `select` の選択肢を揃えつつ、ハンドラーで未知値を `human_only` へフォールバック。
- FastAPI 側は Pydantic v2 の `field_validator(..., mode="before")` を活用。空文字は `None` とみなし `MemberCountStrategy` 列挙と Welcome タイトルを厳密化、旧値（`all_members` 等）は `INCLUDE_BOTS` へ変換して保存時に再出力しない。
- Bot ランタイムは `trimToUndefined` / `trimString` ヘルパーを追加して必要最低限のフィールドへ適用。`default` を多用しているため、新規ヘルパーで空文字→`undefined` に変換し `.default` が効くようにする。
- `config:validate` スクリプトは `loadConfig` を呼び、結果に応じて `process.exit(0/1)`。失敗時は Zod エラー件数と最初の issue を簡潔に表示してデバッグ容易化。

## 疑問点・未決事項
- 既存の Dashboard 状態スナップショットに旧 `member_count_strategy` 値が保持されている可能性がある。API レイヤーで `INCLUDE_BOTS` へ変換するが、UI 側でロード時にどう扱うか（`state.settings.member_count_strategy` が未知値の場合のフォールバック）も要確認。
- Welcome embed タイトルも空を禁止したが、ユーザーが Embed を無効にしてカードのみ使用する運用ではどう扱うか。今回は両方必須として実装するが、将来的に optional にする要望があれば再検討する。
