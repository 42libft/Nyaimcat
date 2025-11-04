# セッション設計 — 20251104_codex-autonomous-workflow

## アーキテクチャ方針
- スキーマに合わせて `config.yaml` を最小限修正し、アプリコード側の変更は行わない。既定値へ寄せることで将来的な自動生成・バリデーションツールとの整合性を保つ。
- 値の修正は人が読みやすい文字列テンプレートを採用し、Dashbord 側の UI 更新を見据えて日本語表現を維持する。

## 影響範囲
- `bot-runtime/config/config.yaml`（設定ファイル）
- `.workflow-sessions/20251104_codex-autonomous-workflow/`（設計・実装ログ）
- 付随ドキュメント（`plan.md` / `docs/plans.md` / `docs/codex_agent_plan.md` / `meta_generator.md`）

## 設計メモ
- `settings.member_count_strategy` は Zod スキーマ `["human_only", "include_bots"]` に合わせて `include_bots` へ変更する。
- Welcome カードの `title_template` は空文字を解消し、`ようこそ {{guild_name}} へ` に統一する。既存のフリーテキストでも見栄えが保てる表現とし、`{{username}}` を含めないことで長大な表示を避ける。
- 修正後は `npx ts-node src/config/loader.ts` で `loadConfig` を実行し、Schema バリデーションをパスすることを確認する。

## 疑問点・未決事項
- Dashboard 側で空文字を入力できてしまう問題をどのフェーズで対応するか未決。Meta Generator でフォローアップタスク化する。
- `countBotsInMemberCount` フラグと `member_count_strategy` の組み合わせが実運用でどう解釈されるか要確認（継続課題）。
