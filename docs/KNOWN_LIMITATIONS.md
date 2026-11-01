# Known Limitations (v1.0.0 development preview)

Honest list of what does **not** work yet or works with caveats. Kept in sync with [ROADMAP.md](ROADMAP.md).

## Security

- **No independent security review yet.** Required before any public launch.
- **No interactive device verification UI** (emoji/QR). Cross-signing keys exist, but clients encrypt to all of a
  contact's devices including unverified ones. A malicious homeserver operator could add a device and read future
  messages. (THREAT_MODEL T2)
- **No encrypted key backup / recovery key.** Signing in on a new device does not give access to earlier messages,
  and losing all devices loses history. This is intentional until secure backup is designed.
- **Account recovery** without the password is not implemented (no email/phone recovery by design so far).
- **"Start now" accounts** are tied to the device until the user sets a password: losing the device or signing
  out before protecting the account loses it (the app warns before sign-out). Numbers are 6 digits (1,000,000
  possibilities); requests are rate-limited and answer identically for unknown numbers, but a determined attacker
  could still spend time sending requests to random numbers — recipients must accept, and children never see them.
- **Passkeys / 2FA** are not implemented.
- The Policy API caches access-token validity for up to **30 seconds**, so a revoked device can still call the
  Policy API (not the homeserver) briefly.
- Web client inherits browser risks (web-delivered code, extensions) — see SECURITY.md.

## Platforms

- **Mobile (iOS/Android): encrypted messaging is not available yet.** The Expo app supports sign-in/registration,
  contacts, invites (share sheet), family view and guardian approvals. Chats show an explicit notice. Native E2EE
  needs the matrix-rust-sdk binding (ARCHITECTURE §6).
- **No native build has been produced.** iOS and Android JavaScript bundles compile (`expo export`); producing an
  installable APK/IPA requires EAS Build with an Expo account (and an Apple Developer account for iOS).
- Changing language on mobile requires an app restart for the RTL/LTR layout direction to flip (React Native limit).
- Desktop: use the web client.

## Messaging features

Implemented (web): text, replies, typing, delivery state, **encrypted photos, files (≤25 MB) and voice messages**
(AES-256-CTR per Matrix's EncryptedFile spec; server stores ciphertext only — verified by e2e media-store scan).
Dangerous file types are never opened automatically and warn before download. Not yet:



Edit, delete, reactions, forwarding, pinning, archive, mute, disappearing messages, read-receipt display (receipts
are sent but not shown), message search beyond the conversation list filter, image compression/thumbnails, video
recording, voice "hold to record / slide to cancel / lock" gestures (voice uses tap-to-record), location sharing, group-chat UI
(group *rules* are enforced server-side), push notifications, voice/video calls.

## Product

- Family Spaces: create, invite relatives, add children, approvals. Not yet: family chat room, albums, calendar,
  reminders, polls, announcements, check-ins.
- Kids Mode: home screen with large contact cards and invites. Not yet: quiet hours, custom themes/backgrounds,
  stickers, big voice-record button (voice not implemented).
- A guardian can create and approve, but not yet: remove a child's contact, manage a child's devices, delete a child
  account, transfer guardianship. If a guardian deletes their own account, pending approvals for their children
  cannot be decided until another guardian is added (feature not yet available).
- Blocking also sets the Matrix ignore list, but there is no unblock UI yet (API supports it).
- Reports are stored; there is no moderation console.
- Federation with other Matrix servers is disabled.

## Operations

- The Docker Compose / Caddy deployment template has **not been run** (no Docker daemon in the development
  environment). The local dev stack (`scripts/dev-stack.sh`) is what the tests use.
- No monitoring, alerting or backup automation is configured yet (documented plan in DEPLOYMENT.md).
- Push notification workers do not exist yet.

## Performance

- The web client downloads the Rust crypto WASM (7.8 MB, 2.1 MB gzipped) on first load; no service worker caching
  yet (PWA manifest exists, offline support does not).
- Not yet profiled on real mobile devices.

## Dependency advisories (`pnpm audit`, 2026-11-01)

| Severity | Package | Path | Exposure |
| --- | --- | --- | --- |
| moderate | `minimatch` < 11.0.1 (ReDoS) | `eslint`, `typescript-eslint` (dev only) | Developer tooling; not shipped to users |
| moderate | `glob` 9–14.0.1 | `expo` → `@expo/cli` | Build-time CLI; not in the app bundle |

No high or critical advisories. CI reports `pnpm audit --prod` on every run. Will update when upstream releases
patched versions.
