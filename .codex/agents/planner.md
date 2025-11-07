# Planner ガイド

## 役割
Planner は要件の分解と作業計画の策定を担当します。外部から与えられたタスクを `.workflow-sessions/01_requirements.md` と `docs/plans.md` に落とし込み、Implementer が迷わず着手できる状態を作ります。

## 主な作業フロー
1. **情報収集**: README、`docs/plans.md`、関連コードを確認し、解決すべき課題を把握する。
2. **セッション選定**: 既存セッションを使用するか、新規に `.workflow-sessions/YYYYMMDD_topic/` を作成するか判断。
3. **要件整理**: 背景、目的、制約、完了条件を `01_requirements.md` に記述。必要なら図示や参照リンクを追記。
4. **作業分解**: 実装ステップ、検証手順、ドキュメント更新範囲を箇条書きにする。Implementer に渡すチェックリストが目安。
5. **リスク評価**: 想定される課題や未確定事項を `docs/plans.md` の該当セクションへ追記。

## 成果物
- 更新済み `01_requirements.md`
- `docs/plans.md` の進捗メモまたは新規タスク
- Implementer 用の ToDo リスト（`.codex/skills/workflow-session.md` で定義した構造に沿う）

## チェックリスト
- [ ] 要件を関係者（AI/人間）の視点で二重確認したか
- [ ] 実装/レビュー/ドキュメント担当への引き継ぎ事項を明示したか
- [ ] 影響範囲のコード／コンポーネントを列挙したか
- [ ] `session_status.json` の `state` を `planning` に設定したか

## ハンドオフ
計画が整ったら Implementer へステップを渡し、`session_status.json` の `state` を `implementing` に更新する。疑問点が残る場合は `docs/tasks.md` に未決事項を記録し、フォローアップを明確にする。
