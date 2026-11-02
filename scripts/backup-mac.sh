#!/usr/bin/env bash
# iMello server backup for the Docker Compose deployment on the Mac.
#
#   BACKUP_DIR=/Volumes/MyBackupDrive/imello scripts/backup-mac.sh
#
# Produces ONE encrypted file: imello-backup-<timestamp>.tar.gz.enc containing
#   - postgres.sql   consistent logical dump of every database (pg_dumpall, taken while running)
#   - synapse-data/  homeserver.yaml, signing key, log config, media_store (attachments are
#                    already end-to-end encrypted ciphertext)
#   - env            the deployment .env (secrets!)
# Encryption: AES-256 with a key derived from your passphrase (openssl, PBKDF2, 600k iterations).
# The passphrase is asked for interactively (or BACKUP_PASSPHRASE) and never written to disk.
# Read-only for production: nothing is stopped, changed or deleted except old backup files
# beyond KEEP (default 14) in BACKUP_DIR.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_DIR="$ROOT/infrastructure/docker"
BACKUP_DIR="${BACKUP_DIR:?set BACKUP_DIR to a folder on another disk, e.g. /Volumes/Backup/imello}"
KEEP="${KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

case "$BACKUP_DIR" in
  "$ROOT"*) echo "BACKUP_DIR must be outside the iMello folder (ideally another disk)." >&2; exit 1 ;;
esac
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  read -rsp "Backup passphrase (keep it somewhere safe — without it the backup can't be opened): " BACKUP_PASSPHRASE; echo
  read -rsp "Repeat passphrase: " again; echo
  [[ "$BACKUP_PASSPHRASE" == "$again" ]] || { echo "Passphrases differ." >&2; exit 1; }
fi
[[ ${#BACKUP_PASSPHRASE} -ge 12 ]] || { echo "Use a passphrase of at least 12 characters." >&2; exit 1; }
export BACKUP_PASSPHRASE

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
chmod 700 "$WORK"

compose() { docker compose -f "$COMPOSE_DIR/docker-compose.yml" -f "$COMPOSE_DIR/docker-compose.tunnel.yml" --env-file "$ROOT/.env" "$@"; }

echo "→ Dumping PostgreSQL (consistent snapshot per database, service keeps running)…"
compose exec -T postgres pg_dumpall -U imello --clean --if-exists > "$WORK/postgres.sql"
[[ -s "$WORK/postgres.sql" ]] || { echo "Database dump is empty — aborting." >&2; exit 1; }
grep -q "CREATE DATABASE synapse\|\\\\connect synapse" "$WORK/postgres.sql" || echo "warning: synapse database not found in dump" >&2

echo "→ Copying Synapse config, signing key and media…"
mkdir -p "$WORK/bundle"
mv "$WORK/postgres.sql" "$WORK/bundle/"
cp -R "$COMPOSE_DIR/synapse-data" "$WORK/bundle/synapse-data"
rm -f "$WORK/bundle/synapse-data/homeserver.pid"
cp "$ROOT/.env" "$WORK/bundle/env"
( cd "$WORK/bundle" && shasum -a 256 postgres.sql env > SHA256SUMS )
echo "created=$STAMP host=$(hostname -s) git=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)" > "$WORK/bundle/BACKUP_INFO"

OUT="$BACKUP_DIR/imello-backup-$STAMP.tar.gz.enc"
echo "→ Encrypting to $OUT"
tar -C "$WORK/bundle" -czf - . | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -out "$OUT"
chmod 600 "$OUT"
( cd "$BACKUP_DIR" && shasum -a 256 "$(basename "$OUT")" > "$(basename "$OUT").sha256" )

echo "→ Checking the archive can be decrypted and listed…"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$OUT" | tar -tzf - >/dev/null

# Retention: keep the newest $KEEP backups.
ls -1t "$BACKUP_DIR"/imello-backup-*.tar.gz.enc 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" "$old.sha256"; done

echo "✓ Backup written: $OUT ($(du -h "$OUT" | cut -f1))"
echo "  Test it regularly: scripts/restore-test.sh \"$OUT\""
