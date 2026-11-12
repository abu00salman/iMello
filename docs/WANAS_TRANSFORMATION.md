# Wanas transformation — audit, plan, status

Branch `claude/imello-messenger-dev-12zxqe`. Rollback point: commit `afa9081` (last iMello-branded build;
`git checkout afa9081` or revert the commits after it). Tags `pre-wanas-transformation` and
`rollback-20261112-wanas-start` exist locally (pushing tags is blocked from the build environment).

## Audit (Nov 2026)

| Area | Web / PWA | Native (Expo) |
| --- | --- | --- |
| E2E text, replies, typing, D/R receipts | Done, tested | Done (headless engine shares the web crypto) |
| Encrypted photos, files, voice notes | Done, tested (server stores ciphertext only) | Done |
| Reactions, edit, delete | **Done in this pass**, two-user browser test | Not yet |
| Groups (create, invite, named) | Done | Create done; no member admin UI yet |
| 1:1 voice/video calls | Done (WebRTC, STUN only, no TURN) | **Not available** — history only |
| Call history | **Done in this pass** (from m.call.* events) | **Done in this pass** (history only) |
| 24-hour Updates | **Done in this pass** (encrypted status room per person) | **Done in this pass** |
| Push notifications | Web Push (content-free) | Not yet (needs APNs/FCM credentials) |
| Device verification UI, recovery key | Missing (see KNOWN_LIMITATIONS) | Missing |

Self-hosting: Synapse + Policy API + Postgres + Caddy + cloudflared on a MacBook (Docker). A sleeping or
powered-off Mac means no service; clients wait and retry (outage handling), they do not fail silently.

## Navigation

Mobile and web: **Chats · Calls · Updates · Settings**. Contacts and new chats from Chats (+); Contacts and
Family controls inside Settings. Desktop shows the same four entries in the sidebar.

## How the new features work

- **Reactions / edits / deletes**: standard Matrix relations (`m.annotation`, `m.replace`) and redactions,
  sent inside the encrypted room. Only the original sender's edits are applied.
- **Call history**: built from `m.call.invite/answer/hangup` in the loaded part of each conversation
  (older calls appear once that history is loaded). Missed = incoming and never answered.
- **Updates**: each person has one private, encrypted room (`creation_content.type = org.wanas.status`)
  with their joined one-to-one contacts invited, so the homeserver's contact policy applies. Contacts' apps
  join these rooms automatically; they never show as chats. Posts show for 24 h and the author's app redacts
  older ones. People added later see only later posts (Megolm keys are shared with current members).

## Plan (next increments, in order)

1. Native: reactions/edit/delete UI; message search; drafts.
2. Calls: TURN relay (coturn on the Mac, documented cost: none; privacy: relays encrypted media only);
   native calling (react-native-webrtc) — not claimed until tested on real devices.
3. Native push (APNs/FCM; requires Apple/Google accounts).
4. Forwarding, pinning, mentions, message search on web.
5. Group admin UI (avatars, descriptions, roles); disappearing messages.
6. Device verification (emoji/QR) and an encrypted recovery key.
7. Performance budgets with measured numbers (see IMELLO_2_PERFORMANCE.md for the method).

## Not verified here

Real-device behaviour (iPhone/Android), calls across real networks/NAT, and the live site under
`/iMello/` (the build environment cannot reach github.io). CI builds the APK/IPA; the iOS job also launches
the app in a simulator.
