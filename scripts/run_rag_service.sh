#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="${RAG_VENV_DIR:-.venv-rag}"
REQUIREMENTS_FILE="${RAG_REQUIREMENTS_FILE:-requirements-rag.txt}"
STATE_DIR=".runtime/rag"
PID_FILE="$STATE_DIR/service.pid"

log() {
  printf '[run-rag] %s\n' "$*"
}

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
}

read_pid_file() {
  if [ ! -f "$PID_FILE" ]; then
    return
  fi
  tr -d '[:space:]' <"$PID_FILE"
}

is_pid_active() {
  local pid
  pid="$(read_pid_file)"
  if [ -z "${pid:-}" ]; then
    return 1
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

write_pid_file() {
  local pid="$1"
  printf '%s\n' "$pid" >"$PID_FILE"
}

clear_pid_file() {
  rm -f "$PID_FILE"
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

activate_virtualenv() {
  if [ ! -d "$VENV_DIR" ]; then
    log "仮想環境 $VENV_DIR を作成します。"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi

  local activate_script
  if [ -f "$VENV_DIR/bin/activate" ]; then
    activate_script="$VENV_DIR/bin/activate"
  elif [ -f "$VENV_DIR/Scripts/activate" ]; then
    activate_script="$VENV_DIR/Scripts/activate"
  else
    echo "仮想環境の activate スクリプトが見つかりません ($VENV_DIR)。" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  source "$activate_script"
}

install_dependencies() {
  if [ ! -f "$REQUIREMENTS_FILE" ]; then
    echo "依存定義ファイル $REQUIREMENTS_FILE が見つかりません。" >&2
    exit 1
  fi

  log "RAG 用依存パッケージを確認します。"
  pip install --upgrade pip >/dev/null
  pip install -r "$REQUIREMENTS_FILE" >/dev/null
}

start_service() {
  local host="${RAG_HOST:-127.0.0.1}"
  local port="${RAG_PORT:-8100}"
  local app_module="${RAG_APP_MODULE:-src.rag.server:app}"

  log "RAG サービスを起動します (${host}:${port}, app=${app_module})"
  uvicorn "$app_module" --host "$host" --port "$port" --reload &
  local pid=$!
  write_pid_file "$pid"
  log "PID $pid で起動しました。停止するには scripts/stop_rag_service.sh を使用してください。"
  wait "$pid"
}

stop_if_already_running() {
  if is_pid_active; then
    local pid
    pid="$(read_pid_file)"
    cat <<EOF >&2
[error] RAG サービスが既に稼働中です (PID: ${pid})。
scripts/stop_rag_service.sh で停止してから再実行してください。
EOF
    exit 1
  fi
  clear_pid_file
}

cleanup() {
  if is_pid_active; then
    local pid
    pid="$(read_pid_file)"
    log "RAG サービスを停止します (PID: $pid)"
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  fi
  clear_pid_file
}

trap cleanup EXIT INT TERM

determine_python_bin
ensure_state_dir
stop_if_already_running
activate_virtualenv
install_dependencies
start_service
