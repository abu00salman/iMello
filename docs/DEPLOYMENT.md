# Deployment

> Nothing has been deployed. Creating billable infrastructure, publishing the web app or submitting to app stores
> requires the owner's explicit approval.

## Components

| Component | Runs on | Notes |
| --- | --- | --- |
| Web client (static) | Cloudflare Pages (or any static host / Caddy) | `pnpm --filter @imello/web build` → `apps/web/dist` (includes `_headers` with CSP/HSTS) |
| Policy API | Container / Node 22 | `services/api/Dockerfile` |
| Synapse | Container (`ghcr.io/element-hq/synapse`) | config rendered from `infrastructure/synapse/homeserver.template.yaml`; module mounted from `infrastructure/synapse/modules` |
| PostgreSQL 16 | Same host (small) or managed | two databases: `imello`, `synapse` (C collation) |
| Reverse proxy + TLS | Caddy | `infrastructure/docker/Caddyfile`; blocks `/internal/*` and `/_synapse/admin/*` |

## Local development (tested)

```bash
pnpm install
# PostgreSQL with role imello/imello and databases imello, imello_test, synapse (C collation)
python3 -m venv ~/.venvs/synapse && ~/.venvs/synapse/bin/pip install matrix-synapse psycopg2-binary
SYNAPSE_PYTHON=~/.venvs/synapse/bin/python bash scripts/dev-stack.sh start   # API :8787, Synapse :8008
pnpm dev:web                                                                  # http://localhost:5173
bash scripts/dev-stack.sh stop
```

On a Mac mini M2: `brew install postgresql@16 python@3.12 pnpm` then the same commands. No Xcode needed.

## Single-host production (template — **not yet validated**)

1. DNS: `imello.example.com` (web), `api.imello.example.com`, `matrix.imello.example.com` → server IP.
2. `cp .env.example .env`, fill values; generate secrets with `openssl rand -hex 32`.
3. Render Synapse config:
   ```bash
   set -a; source .env; set +a
   export SYNAPSE_DATA_DIR=/data SYNAPSE_PORT=8008 SYNAPSE_BIND=0.0.0.0 SYNAPSE_X_FORWARDED=true \
     PUBLIC_HOMESERVER_URL=https://$IMELLO_MATRIX_DOMAIN SYNAPSE_DB_HOST=postgres SYNAPSE_DB_PORT=5432 \
     SYNAPSE_DB_USER=imello SYNAPSE_DB_PASSWORD=$POSTGRES_PASSWORD SYNAPSE_DB_NAME=synapse \
     POLICY_URL=http://api:8787 SYNAPSE_RC_MESSAGE_PER_SECOND=2 SYNAPSE_RC_MESSAGE_BURST=20 \
     SYNAPSE_RC_LOGIN_PER_SECOND=0.2 SYNAPSE_RC_LOGIN_BURST=5
   python3 scripts/render-synapse-config.py infrastructure/docker/synapse-data
   docker run --rm -v $PWD/infrastructure/docker/synapse-data:/data ghcr.io/element-hq/synapse:latest \
     generate-keys   # or: python -m synapse.app.homeserver -c /data/homeserver.yaml --generate-keys
   ```
   Note: the rendered paths use `SYNAPSE_DATA_DIR=/data` (inside the container).
4. Build the web app with `VITE_API_URL` / `VITE_HOMESERVER_URL` set.
5. `docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d`.
6. Checklist: `/internal/*` returns 404 publicly; `/_synapse/admin/*` returns 404 publicly; registration on Synapse
   returns `M_FORBIDDEN`; `curl -I https://imello.example.com` shows CSP and HSTS.

## Web deployment workflow

`.github/workflows/deploy-web.yml` (manual `workflow_dispatch`). Needs repository configuration:

| Kind | Name | Purpose |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | Pages deploy permission only |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | Pages project name |
| Variable | `IMELLO_API_URL`, `IMELLO_HOMESERVER_URL` | Public URLs baked into the build (not secret) |

## Mobile builds (EAS) — no Xcode GUI required

Profiles in `apps/mobile/eas.json`:

| Profile | Android | iOS |
| --- | --- | --- |
| `development` | APK with dev client, internal distribution | Device build with dev client (ad hoc) |
| `development-simulator` | – | Simulator build (no signing needed) |
| `preview` | **APK** (installable directly) | Internal distribution (ad hoc; registered devices only) |
| `production` | AAB for Google Play | App Store / TestFlight build |

From the Mac mini:

```bash
npm i -g eas-cli
cd apps/mobile
eas login                       # Expo account (free tier works for occasional builds)
eas init                        # links the project, writes projectId into app config
eas build -p android --profile preview      # → downloadable APK
eas device:create               # register iPhones for ad hoc builds
eas build -p ios --profile preview          # EAS manages certificates & profiles
eas submit -p ios --profile production      # TestFlight / App Store
```

Or run `.github/workflows/mobile-build.yml` manually with the `EXPO_TOKEN` secret.

**Requirements and honest caveats:**
- **iOS:** an **Apple Developer Program membership (USD 99/year)** is required for any build that installs on a
  physical iPhone (ad hoc, TestFlight, App Store). An unsigned IPA cannot be installed on a normal iPhone. EAS can
  create and store the distribution certificate and provisioning profiles using your Apple ID — no Xcode GUI.
- **Android:** EAS generates and stores the upload keystore. Google Play requires a developer account (USD 25 once).
- **Export compliance:** iMello uses encryption; App Store Connect asks about it on submission (end-to-end
  encryption in messaging typically requires answering "yes" and may need an annual self-classification report
  to the US BIS). Get advice before submitting.
- **No native build has been run yet** — only the JS bundles were compiled. The first EAS build may surface native
  configuration issues to fix.

## External accounts, services and credentials

| Needed for | Account / credential | Status |
| --- | --- | --- |
| Source, CI | GitHub (repository exists) | ✅ |
| Web hosting | Cloudflare account + Pages project + API token | ⬜ owner decision |
| Server | VPS or cloud provider | ⬜ owner decision (billable) |
| Domain + DNS | Registrar, DNS (e.g. Cloudflare) | ⬜ |
| TLS | Let's Encrypt via Caddy (free) | automatic |
| Mobile builds | Expo account + `EXPO_TOKEN` | ⬜ |
| iOS distribution | Apple Developer Program (USD 99/yr) | ⬜ |
| Android distribution | Google Play Console (USD 25) | ⬜ |
| Push (Phase 5) | APNs key (Apple), Firebase Cloud Messaging project (Google) | ⬜ |
| Calls (Phase 5) | TURN server (self-hosted coturn) | ⬜ |
| Backups | S3-compatible object storage | ⬜ |

## Estimated monthly hosting cost

Rough estimates (USD, late 2026 list prices, excluding staff time). Encrypted messaging is light on CPU; Synapse
memory and PostgreSQL I/O dominate. Calls (TURN relay bandwidth) can dominate once enabled.

| Scale (registered users) | Setup | Est. per month |
| --- | --- | --- |
| Family & friends pilot (≤ 500) | 1 VPS, 4 vCPU / 8 GB, PostgreSQL on same host; web on Cloudflare Pages free tier; object storage for backups | **$25 – 60** |
| Small community (≈ 5,000) | 1 app server 8 vCPU / 16 GB + managed PostgreSQL; small TURN VPS | **$150 – 400** |
| Growth (≈ 50,000) | Synapse with workers on 3–4 servers, managed HA PostgreSQL, TURN cluster, monitoring | **$1,000 – 3,000** |

Fixed costs: domain ~$12/yr, Apple Developer $99/yr, Google Play $25 once; EAS has a free tier with limited build
minutes, paid plans for more (check current pricing).

## Monitoring & operations (plan)

- Health checks: `/health` (API), `/health` (Synapse); uptime monitor.
- Metrics: Synapse Prometheus endpoint (enable `enable_metrics` on an internal listener), node/postgres exporters.
- Logs: 7-day retention; never raise Synapse to DEBUG in production.
- Backups: see DATABASE.md.
- Rollback: redeploy previous image tag; `migrate:down` for the latest migration if needed.
