# Docker operations (live server)

Run from `infrastructure/docker` on the Mac. `C` below means:
`docker compose -f docker-compose.yml -f docker-compose.tunnel.yml --env-file ../../.env`

| Task | Command |
| --- | --- |
| Status / health | `C ps` · `curl -s https://<api-domain>/health/deep` |
| Logs (bounded: 5 × 10 MB per container) | `C logs --tail=100 api` (or `synapse`, `caddy`, `cloudflared`) |
| Update after `git pull` | `C up -d --build` (rebuilds the API image, keeps volumes) |
| Restart one service | `C restart synapse` |
| Resource snapshot | `docker stats --no-stream` · `docker system df` |
| Database size | `C exec postgres psql -U imello -d synapse -c "select pg_size_pretty(pg_database_size('synapse'))"` |
| Backup | `BACKUP_DIR=/Volumes/Drive/imello scripts/backup-mac.sh` |

**Never** run `C down -v`, `docker volume rm`, or delete `synapse-data/` on the live server.

## Applying iMello 2.0 server changes

1. Back up first (`scripts/backup-mac.sh`) and confirm `C ps` shows everything healthy.
2. `git pull`
3. **Synapse setting (faster app reopen):** append to `infrastructure/docker/synapse-data/homeserver.yaml`
   (only if it has no `caches:` section yet):
   ```yaml
   caches:
     sync_response_cache_duration: 0
   ```
4. `C up -d --build` — rebuilds the API (new `/health/deep`, Cloudflare client-IP rate limiting) and recreates
   containers with log rotation. Synapse restarts with the new setting. Volumes are kept.
5. Verify: `/health/deep` → `"status":"ok"`; send a message between two phones; open Settings → Notifications.

**Rollback:** `git checkout 266654b && C up -d --build`; remove the `caches:` lines and `C restart synapse`.
The 2.0 changes add no database migrations, so rollback needs no data changes.
