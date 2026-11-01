# Testing

All numbers below are from **actual runs** on 2026-11-01 in the development container (Linux x64, Node 22.23,
PostgreSQL 16, Synapse 1.164.1, Chromium via Playwright 1.63). Nothing is mocked in the end-to-end suites: real
accounts, the real homeserver, the real policy API and the real Rust crypto.

## Suites

| Suite | Location | What it covers | Result |
| --- | --- | --- | --- |
| Lint | `eslint.config.js` | TS rules; `no-console` (prevents accidental content logging) | ✅ pass |
| Typecheck | `pnpm typecheck` | All 8 workspace packages incl. mobile | ✅ pass |
| Core unit | `packages/core` | Policy rules (communication, approvals, group membership), validation, no-plaintext send guard | ✅ 23 / 23 |
| UI tokens | `packages/ui` | WCAG AA contrast for light and dark schemes | ✅ 5 / 5 (found and fixed a real contrast failure) |
| Localization | `packages/localization` | en/ar key parity, placeholders, RTL, negotiation | ✅ 6 / 6 |
| Web unit | `apps/web` | Router | ✅ 2 / 2 |
| API integration | `services/api/test` | Real PostgreSQL + fake homeserver: registration, auth, rate limits, security headers, invites, guardian approvals, family rules, blocking, internal-secret auth, export, deletion, audit hygiene, migration rollback | ✅ 22 / 22 |
| Protocol E2E | `tests/e2e/src/*.e2e.test.ts` | Real Synapse + API + matrix-js-sdk Rust crypto (Node) | ✅ 32 / 32 (3 consecutive runs) |
| Browser E2E | `tests/e2e/browser` | Production web build under production CSP, two/three isolated browser contexts | ✅ 3 / 3 (3 consecutive runs) |
| Mobile bundle | `apps/mobile` | `expo export` for Android and iOS (Hermes bytecode) | ✅ both compile (3.9 MB each) |

### Protocol E2E highlights (`messaging.e2e.test.ts`, `family-safety.e2e.test.ts`)

- Stranger invite refused by homeserver (403); invite link makes contacts; links single-use.
- Encrypted DM: Alice → Bob and Bob → Alice (with reply reference), decrypted correctly.
- Stored events are `m.room.encrypted` / Megolm; a non-member cannot read room history (403).
- **Unique message strings searched in every text/JSON column of every Synapse table and in API + Synapse logs: 0 hits.**
- Homeserver encrypts rooms by default; idempotent retry by transaction ID; SDK rejects duplicate local txn IDs.
- Offline: a client behind a proxy that is cut mid-sync catches up on 3 missed messages **in order** after reconnect.
- New device cannot decrypt earlier messages but can read later ones; device list; **revocation** → token 401 at
  homeserver and API, device removed from peer's device list.
- Family: parent creates family + child; parent ↔ child messaging; stranger refused; child cannot join uninvited
  rooms; stranger with child's invite link stays pending → guardian denies; non-guardians cannot see/decide approvals;
  trusted adult refused before approval and allowed after; block stops invites; stranger cannot be added to a group
  with the child; child cannot be pulled into a group with a stranger; family invite connects a relative to the
  child; child cannot self-redeem a family invite; family messages absent from DB and logs.

### Browser E2E (`two-browsers.spec.ts`, `family.spec.ts`)

- Two browsers register through the UI, exchange an invite link (with preview), start an encrypted chat, exchange
  messages (English and Arabic), switch to Arabic (verifies `dir="rtl"`, `lang="ar"`, translated nav and badge),
  reload (session restored from encrypted IndexedDB; history still decrypts), assert no tokens in
  `localStorage`/`sessionStorage`, and **fail on any CSP violation or page error**.
- Temporary session: nothing persisted, reload returns to sign-in, no crypto databases left.
- Family: parent creates Family Space and child via UI; child sees Kids Mode (no Contacts tab) and messages Dad;
  aunt's invite redeemed by child → "Waiting for guardian approval" → parent approves in Family → aunt and child chat.

## Mandatory scenario (brief §31) — status

| Step | Status | Evidence |
| --- | --- | --- |
| 1 Parent creates account | ✅ | browser `family.spec.ts`, e2e |
| 2 Parent creates Family Space | ✅ | both |
| 3 Parent creates child account | ✅ | both |
| 4 Parent authorises trusted contacts | ✅ | guardian approval flow, both |
| 5 Parent messages child | ✅ | e2e (parent → child), browser (child → parent → child) |
| 6 Child receives and replies | ✅ | both |
| 7 Parent ↔ trusted adult encrypted messages | ✅ | e2e |
| 8 Browser securely linked as authorised device | 🟡 | Signing in on a new browser registers a new device (tested); **verification of that device is not implemented** |
| 9 Conversations sync per security model | ✅ | new device: no history, future messages yes |
| 10 Unauthorised users cannot contact the child | ✅ | both |
| 11 Unauthorised devices cannot decrypt | ✅ | non-member gets 403; new device cannot decrypt history; DB has ciphertext only |
| 12 Device revocation | ✅ | e2e |
| 13 Offline devices reconnect | ✅ | e2e (network cut via proxy) |
| 14 No plaintext in server logs | ✅ | e2e log + DB scan |
| 15 Arabic and English interfaces | ✅ web · 🟡 mobile not UI-tested | browser |
| Platforms: parent on **iPhone**, trusted adult on **Android** | ❌ not executed | Mobile E2EE not implemented; all runs used web/Node clients |

## Running the tests

```bash
pnpm install
pnpm lint && pnpm typecheck
pnpm --filter @imello/core --filter @imello/ui --filter @imello/localization --filter @imello/web run test

# API integration tests need PostgreSQL with a database `imello_test`
TEST_DATABASE_URL=postgres://imello:imello@127.0.0.1:5432/imello_test pnpm --filter @imello/api test

# End-to-end: start the stack (needs PostgreSQL databases `imello` and `synapse` (C collation) and a Python env with matrix-synapse)
SYNAPSE_PYTHON=/path/to/venv/bin/python bash scripts/dev-stack.sh start
eval "$(bash scripts/dev-stack.sh env)"
pnpm test:e2e
pnpm test:browser        # builds the web app and serves the production build
SCREENSHOTS=1 pnpm --filter @imello/e2e exec playwright test browser/screenshots.spec.ts   # optional
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull request, including a real Synapse.

## Not yet covered

Real-device mobile testing, performance profiling, automated accessibility audit (axe), load testing, fuzzing of the
policy API, and dependency/container scanning beyond `pnpm audit`.
