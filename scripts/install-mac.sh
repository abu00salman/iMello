#!/usr/bin/env bash
# Run the iMello server on a Mac (Apple Silicon or Intel) with Docker Desktop, published through a
# free Cloudflare Tunnel. Run from the repository root:
#
#   bash scripts/install-mac.sh --domain abu00salman.com --tunnel-token <TOKEN>
#
# The token comes from Cloudflare Zero Trust → Networks → Tunnels → Create tunnel (Cloudflared).
# Re-running is safe: secrets and data are kept.
set -euo pipefail

DOMAIN=""; TOKEN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --tunnel-token) TOKEN="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[[ -n "$DOMAIN" ]] || { echo "usage: install-mac.sh --domain example.com --tunnel-token TOKEN" >&2; exit 2; }
cd "$(dirname "$0")/.."
ROOT=$(pwd)
WEB="imello.$DOMAIN"; API="imello-api.$DOMAIN"; MATRIX="imello-matrix.$DOMAIN"
log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

docker info >/dev/null 2>&1 || { echo "Docker is not running. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), open it, then re-run." >&2; exit 1; }

if [[ ! -f .env ]]; then
  [[ -n "$TOKEN" ]] || { echo "First run needs --tunnel-token" >&2; exit 2; }
  log "Generating secrets (.env, mode 600)"
  gen() { openssl rand -hex 32; }
  PGPASS=$(gen)
  umask 077
  cat > .env <<ENV
IMELLO_DOMAIN=$WEB
IMELLO_API_DOMAIN=$API
IMELLO_MATRIX_DOMAIN=$MATRIX
MATRIX_SERVER_NAME=$WEB
POSTGRES_PASSWORD=$PGPASS
DATABASE_URL=postgres://imello:$PGPASS@postgres:5432/imello
SYNAPSE_REGISTRATION_SHARED_SECRET=$(gen)
POLICY_INTERNAL_SECRET=$(gen)
SYNAPSE_MACAROON_SECRET_KEY=$(gen)
SYNAPSE_FORM_SECRET=$(gen)
CORS_ORIGINS=https://$WEB,https://abu00salman.github.io
PUBLIC_WEB_URL=https://$WEB
REGISTRATION_RATE_LIMIT=5
TRUST_PROXY=true
LOG_LEVEL=info
CLOUDFLARE_TUNNEL_TOKEN=$TOKEN
ENV
elif [[ -n "$TOKEN" ]]; then
  sed -i '' "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$TOKEN|" .env
fi

log "Rendering Synapse configuration"
set -a; source .env; set +a
export SYNAPSE_DATA_DIR=/data SYNAPSE_PORT=8008 SYNAPSE_BIND=0.0.0.0 SYNAPSE_X_FORWARDED=true \
  PUBLIC_HOMESERVER_URL="https://$MATRIX" SYNAPSE_DB_HOST=postgres SYNAPSE_DB_PORT=5432 \
  SYNAPSE_DB_USER=imello SYNAPSE_DB_PASSWORD="$POSTGRES_PASSWORD" SYNAPSE_DB_NAME=synapse \
  POLICY_URL=http://api:8787 SYNAPSE_RC_MESSAGE_PER_SECOND=2 SYNAPSE_RC_MESSAGE_BURST=20 \
  SYNAPSE_RC_LOGIN_PER_SECOND=0.2 SYNAPSE_RC_LOGIN_BURST=5
DATA="$ROOT/infrastructure/docker/synapse-data"
mkdir -p "$DATA"
python3 scripts/render-synapse-config.py "$DATA"
if [[ ! -f "$DATA/signing.key" ]]; then
  docker run --rm -v "$DATA:/data" --entrypoint python ghcr.io/element-hq/synapse:latest \
    -m synapse.app.homeserver -c /data/homeserver.yaml --generate-keys >/dev/null
fi

log "Starting iMello (first build takes a few minutes)"
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file "$ROOT/.env" up -d --build

log "Waiting for https://$API and https://$MATRIX"
for _ in $(seq 1 60); do
  if curl -fsS "https://$API/health" >/dev/null 2>&1 && curl -fsS "https://$MATRIX/_matrix/client/versions" >/dev/null 2>&1; then
    log "iMello server is live"
    echo "API:        https://$API"
    echo "Homeserver: https://$MATRIX"
    echo "Keep this Mac awake: System Settings → Energy → 'Prevent automatic sleeping', and enable Docker Desktop 'Start when you sign in'."
    exit 0
  fi
  sleep 5
done
echo "Containers are running but the public URLs are not answering yet."
echo "Check the tunnel's Public Hostnames in Cloudflare, then: docker compose -f docker-compose.yml -f docker-compose.tunnel.yml logs --tail=100"
exit 1
