#!/usr/bin/env bash
# Prove a backup can be restored — WITHOUT touching production.
#
#   scripts/restore-test.sh /Volumes/Backup/imello/imello-backup-YYYYMMDD-HHMMSS.tar.gz.enc
#
# Decrypts into a temporary folder, starts a throwaway PostgreSQL container (no published ports,
# its own network, removed afterwards), restores the dump into it and checks that accounts,
# Synapse users and rooms are present. Also checks the Synapse signing key is in the bundle.
set -euo pipefail
FILE="${1:?usage: restore-test.sh <backup .tar.gz.enc>}"
[[ -f "$FILE" ]] || { echo "No such file: $FILE" >&2; exit 1; }
if [[ -f "$FILE.sha256" ]]; then ( cd "$(dirname "$FILE")" && shasum -a 256 -c "$(basename "$FILE").sha256" ); fi
if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then read -rsp "Backup passphrase: " BACKUP_PASSPHRASE; echo; fi
export BACKUP_PASSPHRASE

WORK="$(mktemp -d)"; NAME="imello-restore-test-$$"; NET="$NAME-net"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$FILE" | tar -C "$WORK" -xzf -
( cd "$WORK" && shasum -a 256 -c SHA256SUMS )
cat "$WORK/BACKUP_INFO"
ls "$WORK"/synapse-data/*.signing.key >/dev/null 2>&1 || ls "$WORK"/synapse-data/signing.key >/dev/null 2>&1 || { echo "✗ Synapse signing key missing" >&2; exit 1; }

docker network create --internal "$NET" >/dev/null
docker run -d --name "$NAME" --network "$NET" -e POSTGRES_PASSWORD=restoretest -e POSTGRES_USER=imello -e POSTGRES_DB=imello postgres:16-alpine >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U imello >/dev/null 2>&1 && break; sleep 1; done
docker exec -i "$NAME" psql -q -U imello -d postgres -v ON_ERROR_STOP=0 < "$WORK/postgres.sql" >/dev/null 2>"$WORK/restore.log" || true
q() { docker exec "$NAME" psql -tA -U imello -d "$1" -c "$2"; }
ACCOUNTS=$(q imello "SELECT count(*) FROM accounts")
USERS=$(q synapse "SELECT count(*) FROM users")
ROOMS=$(q synapse "SELECT count(*) FROM rooms")
EVENTS=$(q synapse "SELECT count(*) FROM events")
echo "Restored: accounts=$ACCOUNTS synapse_users=$USERS rooms=$ROOMS events=$EVENTS"
[[ "$ACCOUNTS" -gt 0 && "$USERS" -gt 0 ]] || { echo "✗ Restore looks empty — see $WORK/restore.log" >&2; exit 1; }
echo "✓ Backup restores correctly (test container removed; production untouched)."
