# Self-hosting iMello on a MacBook Air (M2)

Architecture (unchanged): GitHub Pages (web app) → phones/browsers → Cloudflare → Cloudflare Tunnel
(`cloudflared` container, outbound-only) → Caddy → iMello API / Synapse → PostgreSQL. No router ports are open.

## Availability: what a laptop can and cannot do

- **While macOS sleeps, nothing runs** — not Docker, not the containers, not the tunnel. Restart policies
  (`unless-stopped`) only restart containers after the Mac is awake again. Messages sent during sleep wait on the
  senders' phones (they retry) and are delivered after wake; calls and push notifications fail during sleep.
- **Lid closed:** by default a closed MacBook sleeps. With `sudo pmset -a disablesleep 1` (what you set up) it keeps
  running with the lid closed. Trade-offs: more heat in a closed chassis (the Air has no fan and throttles), and
  the setting applies on battery too. Recommended instead of leaving it permanent:
  - keep it on the charger, on a hard surface, lid slightly open if possible;
  - on power only: `sudo pmset -c sleep 0 disksleep 0` and `sudo pmset -c womp 1` (wake for network);
  - re-enable normal sleep when travelling: `sudo pmset -a disablesleep 0`.
- **After a restart** macOS stops at the login screen and nothing starts until you log in. Enable
  Docker Desktop → Settings → General → *Start Docker Desktop when you sign in*. Automatic login is possible but
  weakens physical security (FileVault requires a password at boot anyway).
- **Network after wake:** `cloudflared` reconnects on its own (verify with `docker compose logs --tail=50 cloudflared`).

**Conclusion:** true 24/7 uptime is not guaranteed on a laptop. Expect short outages during macOS updates,
restarts and any sleep. For a family-sized service this is usually acceptable; document planned restarts.

## Checks to run on the Mac (not runnable from the development environment)

```bash
pmset -g | grep -Ei "sleep|disablesleep|womp"
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml ps
docker stats --no-stream
docker system df
curl -s https://imello-api.abu00salman.com/health/deep
```
