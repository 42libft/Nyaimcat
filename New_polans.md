# New_polans.md — ESCL スクリム自動エントリー Bot v2 セッションメモ

## ゴール
- `docs/New_task.md` の機能要件に沿った Discord slash コマンド群（/entry, /set-team, /list-active）とスケジューラ、ESCL API 連携を実装する。
- 前日 0:00(JST) に 0.5 秒間隔 × 最大 6 回の応募リトライを実現し、結果を Discord スレッドに逐次通知する。
- Discord ユーザー ↔ teamId 永続化、および JWT/環境変数の安全な取り扱いを行う。

## アーキテクチャ方針
- `discord.py` v2 の slash コマンドを既存 `src/esclbot/bot.py` に統合しつつ、応募機能専用モジュールを新設する。
- ESCL API 通信は `httpx.AsyncClient` を用いた非同期クライアント (`src/esclbot/escl_api.py` 仮) に集約し、ヘッダー組み立てを一元化する。
- 応募スケジューラは `asyncio` ベースで実装し、ジョブ情報を管理するクラス (`EntryScheduler`) を用意。ジョブは `asyncio.create_task` で待機し、ログ送信用コールバックを注入する。
- teamId 永続化は軽量な JSON ストア (`data/team_ids.json`) を採用。I/O 同期化に `asyncio.Lock` を使い、イベントループブロッキングを避けるため `asyncio.to_thread` でファイル操作を行う。
- Discord での進捗共有は、コマンド発行チャンネルに専用スレッドを生成（失敗時はチャンネル本体にフォールバック）し、スケジューラから該当スレッドへメッセージを送信する。

## 実装タスク
1. `src/esclbot/escl_api.py`（仮）を新設し、`create_application`, `get_applications`, `list_active_scrims` の非同期関数と共通例外クラスを実装。
2. `src/esclbot/team_store.py`（仮）に永続化クラスを追加。Discord userId ↔ teamId の登録・取得・初期化を提供。
3. `src/esclbot/entry_scheduler.py`（仮）で応募ジョブ管理とリトライロジックを実装。Discord 送信用フック、HTTP ステータス判定、0.5s 間隔リトライを含む。
4. `src/esclbot/bot.py` を拡張し、新コマンド（/set-team, /list-active, /entry）とスレッド生成、スケジューラ初期化、環境変数読み込み、レスポンス整形を組み込む。
5. 主要処理に対応するユニットテストまたは自己検証コード（特にスケジューラ判定・日付計算・ステータス分類）を `tests/` 配下に追加。
6. README など必要なドキュメントに新機能の設定と利用手順を追記。

## 検討・リスク
- Discord スレッド作成権限が不足する場合のフォールバック動作を要確認。
- ESCL API 応答スキーマのバリエーションが不明なため、エラーハンドリングはステータスコード中心とし JSON キー欠損に備える。
- Bot 再起動時に未実行ジョブが消滅する課題は今回はスコープ外とし、次フェーズでの永続化や再同期策を検討余地として残す。
- 外部ネットワークアクセスが制限されている環境では実際の ESCL API コールが失敗する可能性があるため、テストはモック中心になる見込み。

## 進捗ログ
- 2025-10-15: `src/esclbot/escl_api.py` / `team_store.py` / `entry_scheduler.py` を実装し、`bot.py` に `/set-team`, `/list-active`, `/entry` を統合。`EntryScheduler` のユニットテスト (`tests/test_entry_scheduler.py`) と README を更新済み。スレッド作成失敗時のフォールバックや 429 対応ロジックを実装。
- 2025-10-15: `bot-runtime/src/discord/verify/manager.ts` のボタン処理を `deferReply` + `editReply` ベースへ更新。`MessageFlags.Ephemeral` を利用して警告を解消し、3 秒タイムアウトによる Unknown interaction を防止。

## メモ
- `DEFAULT_TEAM_ID` が環境変数に存在しない場合は `/set-team` を強制案内する。
- JWT は `.env` から読み込み、ログには一切出力しない。
- Node.js ランタイムと Python Bot を同一トークンで運用する際は `DISABLE_COMMAND_SYNC=1` を設定して Slash Command 上書きを防ぐ。
