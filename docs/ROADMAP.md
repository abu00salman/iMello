# iMello Roadmap

Legend: ✅ done & tested · 🟡 partial · ⬜ not started

## Phase 1 — Foundation

| Item | Status |
| --- | --- |
| Monorepo, TypeScript, lint, CI | ✅ |
| Visual identity (icon, palette, tokens, light/dark) | ✅ |
| Web application | ✅ |
| Mobile application foundation (Expo Router, EAS profiles) | 🟡 JS bundles compile; no native build yet |
| Arabic & English, RTL/LTR | ✅ web · 🟡 mobile (restart needed for direction) |
| Real authentication (homeserver accounts via Policy API) | ✅ |
| Backend, database, migrations with rollback | ✅ |
| Tests | ✅ |

Acceptance: web loads ✅ · mobile builds compile in a configured environment 🟡 (JS bundle only) · two independent
accounts register and authenticate ✅.

## Phase 2 — Secure messaging MVP

| Item | Status |
| --- | --- |
| Contact invitations (links, QR, single-use, expiring) | ✅ |
| Device registration (per sign-in device keys, cross-signing bootstrap) | ✅ |
| One-to-one E2EE messaging | ✅ web |
| Transport, sync, offline catch-up, idempotent retries | ✅ |
| Real-time delivery, typing, delivery state, replies | ✅ |
| Basic attachment foundation | ⬜ |

Acceptance: real encrypted exchange ✅ · authorised devices decrypt ✅ · unauthorised devices cannot ✅ · backend
has no plaintext ✅.

## Phase 3 — Cross-platform

| Item | Status |
| --- | --- |
| Browser client | ✅ |
| Device list + revocation | ✅ |
| **Device verification (SAS emoji / QR), verified-only mode** | ⬜ next priority |
| Secure key backup / recovery key (opt-in) | ⬜ |
| iOS / Android E2EE via matrix-rust-sdk Expo module | ⬜ |
| Messaging iPhone ↔ Android ↔ web | ⬜ (web ↔ web ✅) |

## Phase 4 — Family and children

| Item | Status |
| --- | --- |
| Family Spaces, family invites | ✅ |
| Guardian relationships, child accounts | ✅ |
| Approved contacts, guardian approvals (server-enforced) | ✅ |
| Group permissions involving children (server-enforced) | ✅ |
| Kids Mode | 🟡 home screen; quiet hours, themes, stickers pending |
| Guardian: remove contacts, manage child devices, co-guardians | ⬜ |
| Family chat room, calendar, reminders, albums, polls | ⬜ |

## Phase 5 — Enhanced communication

Voice messages ⬜ · encrypted media ⬜ · private group UI ⬜ · push notifications (content-free payloads) ⬜ ·
voice/video calls (WebRTC, TURN; E2EE validated separately) ⬜

## Phase 6 — Fun & premium experience

Animated messages, stickers, greeting cards, private mini-games, Family Moments, tablet refinements ⬜

## Phase 7 — Release preparation

| Item | Status |
| --- | --- |
| Deployable web app (build + headers + manual deploy workflow) | 🟡 workflow ready, not deployed |
| Installable PWA (manifest/icons) | 🟡 no service worker |
| Android APK / iOS build via EAS | 🟡 profiles + workflow ready; needs Expo/Apple accounts |
| Monitoring, backups | ⬜ |
| Independent security review, pen test | ⬜ |
| Privacy policy (draft in PRIVACY.md), legal review per market | 🟡 |

## Next actions (in order)

1. Device verification UI + verified-devices-only option (closes THREAT_MODEL T2).
2. Mobile E2EE: Expo module over matrix-rust-sdk; run the same protocol tests from iOS/Android.
3. Message edit/delete/reactions, read-receipt display, group chat UI.
4. Encrypted attachments + voice messages.
5. Push notifications without content (event IDs only), quiet hours for children.
6. Deploy a private staging environment (needs approval for billable infrastructure).
