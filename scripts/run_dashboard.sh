#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VENV_DIR="$ROOT_DIR/.venv"
PYTHON_BIN=""

log() {
  printf '[run-dashboard] %s\n' "$*"
}

cleanup() {
  if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then
    log "管理 API を停止します (PID: $API_PID)。"
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
  elif command -v python >/dev/null 2>&1; then
    printf 'python'
  else
    echo "[error] python / python3 が見つかりません。Python をインストールしてください。" >&2
    exit 1
  fi
}

resolve_venv_python() {
  if [ -x "$VENV_DIR/bin/python" ]; then
    PYTHON_BIN="$VENV_DIR/bin/python"
    return 0
  fi

  if [ -x "$VENV_DIR/Scripts/python.exe" ]; then
    PYTHON_BIN="$VENV_DIR/Scripts/python.exe"
    return 0
  fi

  return 1
}

create_venv() {
  local system_python
  system_python="$(find_python)"
  log "Python 仮想環境を作成します: $VENV_DIR"
  "$system_python" -m venv "$VENV_DIR"
}

ensure_python_env() {
  if [ ! -d "$VENV_DIR" ]; then
    create_venv
  fi

  if ! resolve_venv_python; then
    log "既存の仮想環境が壊れているようです。再作成します。"
    rm -rf "$VENV_DIR"
    create_venv
    resolve_venv_python || {
      echo "[error] 仮想環境を初期化できませんでした。" >&2
      exit 1
    }
  fi

  log "Python 依存関係を確認します。"
  "$PYTHON_BIN" -m pip install --upgrade pip >/dev/null 2>&1 || true
  "$PYTHON_BIN" -m pip install --disable-pip-version-check -r requirements.txt
}

verify_python_deps() {
  "$PYTHON_BIN" - <<'PY' || exit 1
import sys

missing = []
for module in ("fastapi", "uvicorn"):
    try:
        __import__(module)
    except Exception:
        missing.append(module)

if missing:
    print("[error] 必要な Python パッケージが見つかりません: {}".format(", ".join(missing)), file=sys.stderr)
    print("[hint] 例: python -m pip install -r requirements.txt", file=sys.stderr)
    sys.exit(1)
PY
}

if ! command -v npm >/dev/null 2>&1; then
  echo "[error] npm が見つかりません。Node.js をインストールしてください。" >&2
  exit 1
fi

if [ ! -d "dashboard" ]; then
  echo "[error] dashboard ディレクトリが見つかりません。" >&2
  exit 1
fi

ensure_node_modules() {
  local project_dir="$1"
  local label="$2"
  local stamp="$project_dir/node_modules/.install-stamp"

  if [ ! -d "$project_dir" ]; then
    echo "[error] ${label} ディレクトリが見つかりません。" >&2
    exit 1
  fi

  local needs_install="false"
  if [ ! -d "$project_dir/node_modules" ]; then
    needs_install="true"
  elif [ "$project_dir/package-lock.json" -nt "$stamp" ]; then
    needs_install="true"
  fi

  if [ "$needs_install" = "true" ]; then
    log "${label} の依存関係をインストールします。"
    (cd "$project_dir" && npm install)
    mkdir -p "$project_dir/node_modules"
    touch "$stamp"
  fi
}

ensure_node_modules "dashboard" "dashboard"
ensure_node_modules "bot-runtime" "bot-runtime"

RUN_API=true
DASH_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-api)
      RUN_API=false
      ;;
    *)
      DASH_ARGS+=("$1")
      ;;
  esac
  shift
done

API_PID=""

if [ "$RUN_API" = true ]; then
  trap cleanup EXIT INT TERM

  ensure_python_env
  export PYTHONPATH="$ROOT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"
  if [ -z "${NYAIMLAB_CONFIG_SYNC:-}" ]; then
    export NYAIMLAB_CONFIG_SYNC=1
  fi
  if [ -z "${NYAIMLAB_CONFIG_PATH:-}" ]; then
    export NYAIMLAB_CONFIG_PATH="$ROOT_DIR/bot-runtime/config/config.yaml"
  fi
  verify_python_deps
  TOKEN="$("$PYTHON_BIN" - <<'PY'
import secrets

token = secrets.token_urlsafe(32)
print(token)
PY
)"

  export API_AUTH_TOKEN="$TOKEN"

  RUNTIME_DIR="$ROOT_DIR/.runtime"
  mkdir -p "$RUNTIME_DIR"
  API_LOG_FILE="$RUNTIME_DIR/admin_api.log"
  : >"$API_LOG_FILE"

  log "管理 API をバックグラウンドで起動します。ログ: $API_LOG_FILE"
  log "管理トークン: $API_AUTH_TOKEN"
  log "ダッシュボードのログインフォーム「管理トークン」に上記の値を入力してください。"

  "$PYTHON_BIN" -m src.nyaimlab >"$API_LOG_FILE" 2>&1 &
  API_PID=$!
  sleep 1

  if ! kill -0 "$API_PID" 2>/dev/null; then
    log "管理 API の起動に失敗しました。ログを確認してください。"
    cat "$API_LOG_FILE"
    exit 1
  fi

  log "管理 API を起動しました (PID: $API_PID)。ログを追跡するには: tail -f $API_LOG_FILE"
else
  trap cleanup EXIT INT TERM
fi

if [ "${#DASH_ARGS[@]}" -gt 0 ]; then
  log "追加引数: ${DASH_ARGS[*]}"
fi

log "ダッシュボード開発サーバーを起動します。"
if [ "${#DASH_ARGS[@]}" -gt 0 ]; then
  (cd dashboard && npm run dev -- "${DASH_ARGS[@]}")
else
  (cd dashboard && npm run dev)
fi
