# iMello 2.0 — technical audit

Scope: repository at `266654b` (React/Vite web client, Expo WebView shell, `@imello/core` on matrix-js-sdk 45 +
Rust crypto WASM, Fastify Policy API, PostgreSQL 16, Synapse + `imello_policy` module, Caddy, Cloudflare
Tunnel compose files, GitHub Actions). **The live MacBook server was not accessible from the development
environment**; nothing below reports live Docker diagnostics. Commands to collect them are in
SELF_HOSTING_MACBOOK.md and DOCKER_OPERATIONS.md.

Severity: 🔴 user-visible defect · 🟠 risk · 🟡 improvement. Status: ✅ fixed in 2.0 · ⏳ open.

## Client performance & stability
| | Finding | Evidence | Status |
| --- | --- | --- | --- |
| 🔴 | Every sync/decryption event re-rendered the entire conversation once per frame | 35 long tasks / 40 msgs (benchmark) | ✅ throttled + memoised rows |
| 🔴 | All messages rendered (DOM grows with history) | 2 792 nodes for 300 msgs | ✅ windowed (50) + load older on scroll |
| 🔴 | Chat list converted every message in every room on each tick | code review | ✅ last-event lookup |
| 🔴 | Reopen within 2 min → stale initial sync → replay of all newer messages | 8.4 s first open; 0.14 s with cache off | ✅ template · ⏳ apply on Mac |
| 🟠 | `isRoomEncrypted` (async crypto call) ran on every tick | code review | ✅ only on membership change |
| 🟡 | No persistent client sync store (each start = initial sync) | code review | ⏳ consider matrix-js-sdk IndexedDBStore |
| 🟡 | Crypto WASM ≈ 7.8 MB (2.1 MB gz) downloaded on first visit; no SW caching | build output | ⏳ cache with versioned SW (care: stale security code) |
| 🟡 | Single Matrix client per session — verified (created once in `SessionProvider`, listeners cleaned up) | code review | ✅ no change needed |

## Messaging correctness
| | Finding | Status |
| --- | --- | --- |
| 🔴 | Duplicate rooms: DM lookup used only `m.direct`; invites not yet accepted were ignored; concurrent creation raced | ✅ idempotent creation + regression tests |
| 🔴 | `m.direct` read-modify-write could lose entries under concurrent updates | ✅ serialised per client |
| 🟠 | Existing duplicate rooms on the live server | ✅ hidden in list (one row per person); ⏳ optional manual merge — not automated to avoid data loss |

## API / security
| | Finding | Status |
| --- | --- | --- |
| 🟠 | Rate limit keyed by left-most `X-Forwarded-For` behind Cloudflare (spoofable) | ✅ `CF-Connecting-IP` |
| 🟡 | Health check only `/health` (process up) | ✅ `/health/deep` with DB + homeserver latency |
| 🟠 | No independent security review; no device verification UI; STUN-only calls (IPs visible to peer/STUN) | ⏳ documented in SECURITY.md / KNOWN_LIMITATIONS.md |

## Infrastructure (MacBook Air + Docker Desktop)
| | Finding | Status |
| --- | --- | --- |
| 🟠 | No backup procedure | ✅ encrypted consistent backup + isolated restore test scripts |
| 🟠 | Container logs unbounded | ✅ json-file rotation 5 × 10 MB |
| 🟠 | Laptop sleep/restart = downtime; Docker restart policies can't help while asleep | ✅ documented; ⏳ owner to choose power settings |
| 🟡 | Synapse single process, no workers — appropriate for a family-sized server | no change |
| 🟡 | Federation and open registration disabled; `/_synapse/admin` and `/internal` blocked at Caddy | verified in config |

## Mobile
| | Finding | Status |
| --- | --- | --- |
| 🟠 | App is a WebView of the hosted web client: same web-delivery trust model; no Web Push inside WebView | documented |
| 🟡 | Native migration of chat list/conversation not started: requires sharing Matrix crypto state between JS and native safely | ⏳ deliberately deferred |
| ⏳ | Keyboard/safe-area behaviour on real iPhones not verified from here | needs device test |
