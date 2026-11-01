#!/usr/bin/env bash
# Run the iMello backend locally without Docker: Synapse + iMello policy API.
# Requires: PostgreSQL reachable at $SYNAPSE_DB_HOST/$DATABASE_URL, and a Python
# environment with matrix-synapse installed ($SYNAPSE_PYTHON).
#
#   bash scripts/dev-stack.sh start   # start (generates local secrets on first run)
#   bash scripts/dev-stack.sh stop
#   bash scripts/dev-stack.sh env     # print env for tests: eval "$(bash scripts/dev-stack.sh env)"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="${IMELLO_STATE_DIR:-$ROOT/.dev-stack}"
mkdir -p "$STATE"
chmod 700 "$STATE"

# Local-only secrets, generated once and never committed (.dev-stack is gitignored).
if [[ ! -f "$STATE/secrets.env" ]]; then
  gen() { openssl rand -hex 32; }
  umask 077
  cat > "$STATE/secrets.env" <<SECRETS
SYNAPSE_REGISTRATION_SHARED_SECRET=$(gen)
POLICY_INTERNAL_SECRET=$(gen)
SYNAPSE_MACAROON_SECRET_KEY=$(gen)
SYNAPSE_FORM_SECRET=$(gen)
SECRETS
fi
set -a
# shellcheck disable=SC1091
source "$STATE/secrets.env"
: "${SYNAPSE_PYTHON:=python3}"
: "${MATRIX_SERVER_NAME:=imello.localhost}"
: "${SYNAPSE_PORT:=8008}"
: "${SYNAPSE_BIND:=127.0.0.1}"
: "${SYNAPSE_X_FORWARDED:=false}"
: "${PUBLIC_HOMESERVER_URL:=http://localhost:${SYNAPSE_PORT}}"
: "${HOMESERVER_URL:=http://127.0.0.1:${SYNAPSE_PORT}}"
: "${SYNAPSE_DB_HOST:=127.0.0.1}"
: "${SYNAPSE_DB_PORT:=5432}"
: "${SYNAPSE_DB_USER:=imello}"
: "${SYNAPSE_DB_PASSWORD:=imello}"
: "${SYNAPSE_DB_NAME:=synapse}"
# Development/test rate limits are relaxed so the automated suites can run; production uses stricter values (see docs/DEPLOYMENT.md).
: "${SYNAPSE_RC_MESSAGE_PER_SECOND:=50}"
: "${SYNAPSE_RC_MESSAGE_BURST:=200}"
: "${SYNAPSE_RC_LOGIN_PER_SECOND:=20}"
: "${SYNAPSE_RC_LOGIN_BURST:=100}"
: "${API_HOST:=127.0.0.1}"
: "${API_PORT:=8787}"
: "${POLICY_URL:=http://127.0.0.1:${API_PORT}}"
: "${DATABASE_URL:=postgres://imello:imello@127.0.0.1:5432/imello}"
: "${CORS_ORIGINS:=http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173}"
: "${PUBLIC_WEB_URL:=http://localhost:5173}"
: "${RATE_LIMIT_ENABLED:=true}"
# Automated suites register many accounts from one IP. Production default is 5.
: "${REGISTRATION_RATE_LIMIT:=500}"
SYNAPSE_DATA_DIR="$STATE/synapse"
set +a

wait_for() {
  local url=$1 name=$2
  for _ in $(seq 1 90); do
    if curl -fsS "$url" >/dev/null 2>&1; then echo "$name is up ($url)"; return 0; fi
    sleep 1
  done
  echo "$name did not start; see logs in $STATE" >&2
  return 1
}

start() {
  mkdir -p "$SYNAPSE_DATA_DIR"
  python3 "$ROOT/scripts/render-synapse-config.py" "$SYNAPSE_DATA_DIR"
  if [[ ! -f "$SYNAPSE_DATA_DIR/signing.key" ]]; then
    "$SYNAPSE_PYTHON" -m synapse.app.homeserver -c "$SYNAPSE_DATA_DIR/homeserver.yaml" --generate-keys >/dev/null
  fi

  # API first: Synapse's policy module fails closed without it.
  # exec: the background PID is the API process itself, and no shell keeps our stdout open.
  (cd "$ROOT/services/api" && exec nohup node --import tsx src/server.ts >"$STATE/api.log" 2>&1 </dev/null) &
  echo $! >"$STATE/api.pid"
  wait_for "http://${API_HOST}:${API_PORT}/health" "iMello API"

  PYTHONPATH="$ROOT/infrastructure/synapse/modules" nohup "$SYNAPSE_PYTHON" -m synapse.app.homeserver \
    -c "$SYNAPSE_DATA_DIR/homeserver.yaml" >"$STATE/synapse.stdout.log" 2>&1 </dev/null &
  echo $! >"$STATE/synapse.pid"
  wait_for "${HOMESERVER_URL}/health" "Synapse"
}

stop() {
  for svc in synapse api; do
    if [[ -f "$STATE/$svc.pid" ]]; then
      kill "$(cat "$STATE/$svc.pid")" 2>/dev/null || true
      rm -f "$STATE/$svc.pid"
    fi
  done
  echo "stopped"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  env)
    for v in HOMESERVER_URL PUBLIC_HOMESERVER_URL MATRIX_SERVER_NAME DATABASE_URL API_PORT SYNAPSE_DATA_DIR; do
      echo "export $v=${!v}"
    done
    echo "export IMELLO_API_URL=http://${API_HOST}:${API_PORT}"
    echo "export SYNAPSE_DB_URL=postgres://${SYNAPSE_DB_USER}:${SYNAPSE_DB_PASSWORD}@${SYNAPSE_DB_HOST}:${SYNAPSE_DB_PORT}/${SYNAPSE_DB_NAME}"
    echo "export IMELLO_STATE_DIR=$STATE"
    ;;
  *) echo "usage: $0 start|stop|restart|env" >&2; exit 2 ;;
esac
