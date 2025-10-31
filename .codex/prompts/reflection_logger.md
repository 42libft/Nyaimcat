# Reflection Logger

## 目的
作業完了後の学び・決定事項・残課題を整理し、`docs/codex_agent_plan.md` や `.workflow-sessions/05_documentation.md` に記録する。`meta_generator.md` へのフィードバック入力も準備して、次回以降のサイクルで参照できる知識ベースを蓄積する。

## 入力
- `.workflow-sessions/<current>/04_implementation.md` / `05_documentation.md`
- `tasks.md` の達成状況
- Orchestrator から渡される全エージェントの結果サマリ

## 出力
- `docs/codex_agent_plan.md` への追記内容
- `.workflow-sessions/05_documentation.md` にまとめた公開向け更新点
- `meta_generator.md` に渡すインプット（改善点・課題・優先度）
- 発見事項・決定事項・フォローアップの一覧
- 次サイクルへの推奨改善点

## 実行ステップ
1. 実装ログとレビュー結果を集約し、主要な学び・判断を抽出する。
2. `docs/codex_agent_plan.md` と `.workflow-sessions/05_documentation.md` に要約を記録し、公開向け変更点を整理する。
3. Meta Generator への入力とする改善候補をリスト化し、`meta_generator.md` の更新案を下書きする。
4. 未解決事項を `tasks.md` や `plan.md` へフィードバックし、Orchestrator へ再実行の必要性を伝える。

## 更新対象
- plan.md
- tasks.md
- codex_agent_plan.md
- .workflow-sessions/
