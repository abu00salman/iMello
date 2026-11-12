#!/usr/bin/env bash
# iMello one-command server install (Ubuntu 22.04/24.04, run as root on a fresh VPS).
#
#   curl -fsSL https://raw.githubusercontent.com/abu00salman/Wanas/claude/imello-messenger-dev-12zxqe/scripts/install-server.sh \
#     | bash -s -- --domain abu00salman.com
#
# Creates: imello-api.<domain> (policy API) and imello-matrix.<domain> (homeserver), with automatic HTTPS.
# The web app stays on GitHub Pages (imello.<domain>). DNS A records must point to this server first.
# Re-running is safe: secrets and data are kept.
set -euo pipefail

DOMAIN=""
BRANCH="claude/imello-messenger-dev-12zxqe"
REPO="https://github.com/abu00salman/iMello.git"
DIR="/opt/imello"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[[ -n "$DOMAIN" ]] || { echo "usage: install-server.sh --domain example.com" >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }

WEB="imello.$DOMAIN"; API="imello-api.$DOMAIN"; MATRIX="imello-matrix.$DOMAIN"
log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

log "Checking DNS"
MYIP=$(curl -fsS4 https://api.ipify.org || true)
for h in "$API" "$MATRIX"; do
  ip=$(getent ahostsv4 "$h" | awk 'NR==1{print $1}' || true)
  if [[ "$ip" != "$MYIP" ]]; then
    echo "WARNING: $h resolves to '${ip:-nothing}', this server is $MYIP."
    echo "         Add an A record ($h -> $MYIP, DNS only / grey cloud) or HTTPS certificates will fail."
  else
    echo "$h -> $ip ✓"
  fi
done

log "Installing packages (git, Docker)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl python3 ca-certificates ufw >/dev/null
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh >/dev/null

log "Firewall: allow SSH, HTTP, HTTPS only"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

log "Fetching iMello ($BRANCH)"
if [[ -d "$DIR/.git" ]]; then git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
else git clone -q --branch "$BRANCH" "$REPO" "$DIR"; fi
cd "$DIR"

if [[ ! -f .env ]]; then
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
CADDYFILE=./Caddyfile.server
ENV
fi

log "Rendering Synapse configuration"
set -a; source .env; set +a
export SYNAPSE_DATA_DIR=/data SYNAPSE_PORT=8008 SYNAPSE_BIND=0.0.0.0 SYNAPSE_X_FORWARDED=true \
  PUBLIC_HOMESERVER_URL="https://$MATRIX" SYNAPSE_DB_HOST=postgres SYNAPSE_DB_PORT=5432 \
  SYNAPSE_DB_USER=imello SYNAPSE_DB_PASSWORD="$POSTGRES_PASSWORD" SYNAPSE_DB_NAME=synapse \
  POLICY_URL=http://api:8787 SYNAPSE_RC_MESSAGE_PER_SECOND=2 SYNAPSE_RC_MESSAGE_BURST=20 \
  SYNAPSE_RC_LOGIN_PER_SECOND=0.2 SYNAPSE_RC_LOGIN_BURST=5
DATA="$DIR/infrastructure/docker/synapse-data"
mkdir -p "$DATA"
python3 scripts/render-synapse-config.py "$DATA"
if [[ ! -f "$DATA/signing.key" ]]; then
  docker run --rm -v "$DATA:/data" --entrypoint python ghcr.io/element-hq/synapse:latest \
    -m synapse.app.homeserver -c /data/homeserver.yaml --generate-keys >/dev/null
fi
chown -R 991:991 "$DATA"   # Synapse container user

log "Starting services (first build takes a few minutes)"
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d --build

log "Waiting for HTTPS endpoints"
ok=0
for _ in $(seq 1 60); do
  if curl -fsS "https://$API/health" >/dev/null 2>&1 && curl -fsS "https://$MATRIX/_matrix/client/versions" >/dev/null 2>&1; then ok=1; break; fi
  sleep 5
done
if [[ $ok == 1 ]]; then
  log "iMello server is up"
  echo "API:        https://$API"
  echo "Homeserver: https://$MATRIX"
  echo "Next: set GitHub repo variables IMELLO_API_URL=https://$API and IMELLO_HOMESERVER_URL=https://$MATRIX, then redeploy the web app."
else
  echo "Services started but HTTPS is not answering yet. Check DNS, then: docker compose -f $DIR/infrastructure/docker/docker-compose.yml logs --tail=100"
  exit 1
fi
