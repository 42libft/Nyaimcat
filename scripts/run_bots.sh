#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"

log() {
  printf '[run-bots] %s\n' "$*"
}

determine_python_bin() {
  if command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    return
  fi
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
    return
  fi
  echo "python3 または python コマンドが見つかりません。" >&2
  exit 1
}

activate_python_env() {
  if [ ! -d ".venv" ]; then
    log "仮想環境 .venv を作成します。"
    "$PYTHON_BIN" -m venv .venv
  fi

  if [ -f ".venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source ".venv/bin/activate"
  elif [ -f ".venv/Scripts/activate" ]; then
    # shellcheck disable=SC1091
    source ".venv/Scripts/activate"
  else
    echo "仮想環境の activate スクリプトが見つかりません (.venv)。" >&2
    exit 1
  fi
}

ensure_python_dependencies() {
  log "Python依存パッケージを確認します。"
  pip install --upgrade pip >/dev/null
  pip install -r requirements.txt >/dev/null

  if [ "${RUN_PYTHON_BOT:-0}" = "1" ]; then
    if [ ! -f ".env" ]; then
      if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "[notice] .env を作成しました。DISCORD_TOKEN を設定してください。"
        echo "[notice] 設定後にもう一度スクリプトを実行してください。"
        exit 0
      else
        echo "[error] .env がありません。DISCORD_TOKEN を設定してください。" >&2
        exit 1
      fi
    fi
  fi
}

ensure_node_dependencies() {
  if [ ! -d "bot-runtime" ]; then
    echo "[error] bot-runtime ディレクトリが見つかりません。" >&2
    exit 1
  fi

  if [ ! -d "bot-runtime/node_modules" ]; then
    log "Node.js依存パッケージをインストールします。"
    (cd bot-runtime && npm install)
  fi

  if [ ! -f "bot-runtime/.env" ]; then
    if [ -f "bot-runtime/.env.example" ]; then
      cp bot-runtime/.env.example bot-runtime/.env
      echo "[notice] bot-runtime/.env を作成しました。DISCORD_TOKEN 等を設定してください。"
      echo "[notice] 設定後にもう一度スクリプトを実行してください。"
      exit 0
    else
      echo "[error] bot-runtime/.env がありません。DISCORD_TOKEN 等を設定してください。" >&2
      exit 1
    fi
  fi
}

PYTHON_PID=""
NODE_PID=""
CLEANUP_INVOCATIONS=0

cleanup() {
  CLEANUP_INVOCATIONS=$((CLEANUP_INVOCATIONS + 1))
  if [ "$CLEANUP_INVOCATIONS" -gt 1 ]; then
    return
  fi

  if [ -n "$PYTHON_PID" ] && kill -0 "$PYTHON_PID" >/dev/null 2>&1; then
    log "Python Bot を停止します (PID: $PYTHON_PID)"
    kill "$PYTHON_PID" >/dev/null 2>&1 || true
    wait "$PYTHON_PID" >/dev/null 2>&1 || true
  fi

  if [ -n "$NODE_PID" ] && kill -0 "$NODE_PID" >/dev/null 2>&1; then
    log "Node.js Bot を停止します (PID: $NODE_PID)"
    kill -- -"$NODE_PID" >/dev/null 2>&1 || kill "$NODE_PID" >/dev/null 2>&1 || true
    wait "$NODE_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

determine_python_bin
activate_python_env
ensure_python_dependencies
ensure_node_dependencies

get_env_value() {
  local file="$1"
  local key="$2"
  if [ ! -f "$file" ]; then
    return
  fi
  # shellcheck disable=SC2002
  cat "$file" | sed -n "s/^${key}=//p" | tail -n 1
}

PYTHON_TOKEN="$(get_env_value ".env" "DISCORD_TOKEN")"
NODE_TOKEN="$(get_env_value "bot-runtime/.env" "DISCORD_TOKEN")"

if [ "${RUN_PYTHON_BOT:-0}" = "1" ] && [ -n "${PYTHON_TOKEN:-}" ] && [ -n "${NODE_TOKEN:-}" ] && [ "$PYTHON_TOKEN" = "$NODE_TOKEN" ] && [ "${ALLOW_SHARED_TOKEN:-0}" != "1" ]; then
  cat <<'EOF' >&2
[error] Python Bot (.env) と Node.js Bot (bot-runtime/.env) が同じ DISCORD_TOKEN を指定しています。
Slash Command が競合するため、それぞれ別のBotアプリケーションのトークンを設定してください。
どうしても同一トークンを利用したい場合は、環境変数 ALLOW_SHARED_TOKEN=1 を指定して再実行してください。
EOF
  exit 1
fi

export ESCL_PYTHON_BIN="$(command -v python)"

if [ "${RUN_PYTHON_BOT:-0}" = "1" ]; then
  log "Python Bot を起動します。"
  python -m src.esclbot.bot &
  PYTHON_PID=$!
else
  log "Python Bot は起動しません（Node.jsランタイムがSlashコマンドを統合します）。"
fi

log "Node.js Bot を起動します。"
(cd bot-runtime && npm run dev) &
NODE_PID=$!

EXIT_CODE=0
EXIT_SOURCE=""

while :; do
  if ! kill -0 "$PYTHON_PID" >/dev/null 2>&1; then
    wait "$PYTHON_PID" >/dev/null 2>&1 || EXIT_CODE=$?
    EXIT_SOURCE="Python"
    break
  fi
  if ! kill -0 "$NODE_PID" >/dev/null 2>&1; then
    wait "$NODE_PID" >/dev/null 2>&1 || EXIT_CODE=$?
    EXIT_SOURCE="Node.js"
    break
  fi
  sleep 1
done

log "$EXIT_SOURCE Bot が終了しました (code: $EXIT_CODE)。"

exit "$EXIT_CODE"
