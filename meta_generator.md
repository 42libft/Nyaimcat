# Meta Generator 改善ログ — 2025-10-31

## 改善提案
- Orchestrator / Commit & Review プロンプトの指示順序が現行フロー（Reflection → Meta の後にコミット）と噛み合っていないため、コミットを最終段階へ明示的に移すか、Reflection フェーズ実施前にコミットできるよう改善する。
- `meta_generator.md` の更新手順が既存ドキュメントに記載されていないため、Orchestrator / Reflection Logger プロンプトへ参照先と期待する内容を追記する。
- `session_status.json` の `state` 値について、許容されるステータス一覧をどこかに明文化し、各フェーズで使用するキーが統一されるよう管理する。

## 優先度順フォローアップ
1. Commit & Review プロンプトを改訂し、Reflection / Meta フェーズ後にコミットする流れでも齟齬が出ないよう手順を再整理する。（優先度: 高）
2. Orchestrator / Reflection Logger プロンプトに `meta_generator.md` の出力位置・更新項目を明文化する。（優先度: 中）
3. `.workflow-sessions/` テンプレートまたは AGENTS.md に `session_status.json` のステート一覧と説明を追加する。（優先度: 中）

## メモ
- 今回は手動で `meta_generator.md` を作成したが、将来的にはセッション初期化時にテンプレートを生成するスクリプトへ統合できると流れが滑らかになる。
