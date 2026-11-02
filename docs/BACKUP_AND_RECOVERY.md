# Backup and recovery (MacBook Air server)

## What must be backed up

| Item | Where | Why |
| --- | --- | --- |
| PostgreSQL (databases `imello` and `synapse`) | Docker volume `imello_pgdata` | accounts, family rules, all Matrix rooms and (encrypted) events |
| Synapse signing key + `homeserver.yaml` | `infrastructure/docker/synapse-data/` | the server's identity; **losing it breaks existing sessions** |
| Media store | `synapse-data/media_store` | photos/files/voice (stored as end-to-end-encrypted ciphertext) |
| `.env` | repository root | database password, registration secret, tunnel token |

Message *keys* are not on the server (end-to-end encryption): each person keeps their own key backup file on
their phone (Settings → Backup). A server backup restores accounts, rooms and ciphertext, not anyone's keys.

## Making a backup

Plug in an external drive (or use another computer's share), then:

```bash
BACKUP_DIR=/Volumes/YourDrive/imello-backups scripts/backup-mac.sh
```

- Takes a **consistent logical dump** with `pg_dumpall` while the server keeps running (it does not copy the live
  data directory).
- Encrypts everything into one file with AES-256 (passphrase → PBKDF2, 600 000 iterations). Keep the passphrase in
  a password manager; without it the backup cannot be opened.
- Refuses to write inside the iMello folder; keeps the newest 14 backups; verifies the archive decrypts.
- Suggested schedule: daily. A `launchd` job can run it; keep the drive connected or copy the file off the laptop.

## Testing a backup (do this monthly)

```bash
scripts/restore-test.sh /Volumes/YourDrive/imello-backups/imello-backup-YYYYMMDD-HHMMSS.tar.gz.enc
```

Restores into a **throwaway PostgreSQL container on an internal network with no published ports**, checks that
accounts, Synapse users, rooms and events are present and that the signing key is in the bundle, then deletes
the container. Production is never touched.

### Verification status
- Encrypt → decrypt round trip: verified byte-identical; wrong passphrase rejected (development container).
- `pg_dumpall` → restore into a separate PostgreSQL 16 instance: verified, row counts identical
  (178 accounts, 178 Synapse users, 4 936 events). Expected harmless errors: the `imello` role already exists.
- **Not yet run on the MacBook with Docker Desktop** — run `restore-test.sh` once there before relying on it.

## Full recovery (new or wiped Mac)

1. Install Docker Desktop, clone the repository at the commit in `BACKUP_INFO`.
2. Decrypt: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in FILE | tar -xzf - -C /tmp/imello-restore`
3. Copy `env` → `.env` and `synapse-data/` → `infrastructure/docker/synapse-data/`.
4. Start only PostgreSQL: `docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file ../../.env up -d postgres`
5. Restore: `docker compose … exec -T postgres psql -U imello -d postgres < /tmp/imello-restore/postgres.sql`
6. Start everything: `docker compose … up -d`, then check `https://<api-domain>/health/deep`.
7. Delete `/tmp/imello-restore` (it contains secrets).

Never run `docker compose down -v` on the live server — `-v` deletes the database volume.
