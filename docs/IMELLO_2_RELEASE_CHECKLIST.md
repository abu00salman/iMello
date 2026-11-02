# iMello 2.0 — release checklist

Legend: ✅ verified in development · ⏳ needs the live Mac or real devices

| Criterion | Status |
| --- | --- |
| Lint, typecheck, unit, API, Matrix e2e, browser tests pass | ✅ (see final report numbers) |
| No database migrations in 2.0 (existing data untouched) | ✅ |
| Duplicate conversations prevented (regression tests) | ✅ |
| Smooth conversation rendering (0 long tasks in burst benchmark) | ✅ desktop Chromium · ⏳ iPhone/Android |
| No tab-bar overlap (screenshot check at 390×844) | ✅ browser · ⏳ standalone PWA / iOS WebView on device |
| Keyboard never covers the composer on iOS | ⏳ needs device test |
| Helpful registration errors | ✅ |
| Backup → restore proven | ✅ pipeline in dev · ⏳ `restore-test.sh` on the Mac |
| Synapse `sync_response_cache_duration: 0` applied | ⏳ manual step on the Mac |
| Accurate call states incl. "Reconnecting" | ⏳ not implemented (ICE disconnect shows "Connecting") |
| TURN relay for strict networks | ⏳ not deployed |
| Device verification UI | ⏳ not implemented |
| Native (non-WebView) push | ⏳ needs Apple/Firebase credentials |

## Deploy steps
1. Backup (`scripts/backup-mac.sh`), check health.
2. Website deploys automatically from the branch (GitHub Pages).
3. Server: follow DOCKER_OPERATIONS.md "Applying iMello 2.0 server changes".
4. Verify messaging between two phones, notifications, a call, a child account's restrictions.
