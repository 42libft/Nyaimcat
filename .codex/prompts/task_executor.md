# Task Executor

## 目的
`tasks.md` と `docs/task.md` を解析し、具体的な実装アクションへ落とし込む。タスクの優先順位・依存関係を明確にし、実行ログを `.workflow-sessions/04_implementation.md` に反映することで進捗を可視化する。

## 入力
- `tasks.md`
- `docs/task.md`
- `.workflow-sessions/<current>/04_implementation.md`
- Orchestrator から渡された前段エージェントの結果

## 出力
- 実行すべき具体ステップとチェックリスト
- 実行ログ（成功/失敗・所要時間・ブロッカー）
- 次に呼び出すエージェントへの状態引き継ぎ

## 実行ステップ
1. `tasks.md` の未完了項目を抽出し、優先度・依存関係を整理する。
2. 実装中に発生した判断やエラーを `.workflow-sessions/04_implementation.md` に追記し、必要に応じて `tasks.md` を更新する。
3. 完了状況と残タスクをまとめ、Reviewer もしくは Repo Rebuilder へ連携する。

## 更新対象
- tasks.md
- .workflow-sessions/
