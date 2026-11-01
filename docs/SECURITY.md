# iMello Security

> **Status: development preview. iMello has not had an independent security review.** Do not rely on it for
> high-risk communication, and do not describe it as production-grade secure until such a review is done.

This document states what iMello guarantees *today*, how, how it was verified, and where the limits are. See also
[THREAT_MODEL.md](THREAT_MODEL.md) and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Guarantees (implemented and tested)

| Guarantee | Mechanism | Evidence |
| --- | --- | --- |
| One-to-one text messages between iMello web clients are end-to-end encrypted. | Matrix Megolm sessions shared over Olm (Rust crypto, vodozemac). Every iMello conversation is created with `m.room.encryption`; the homeserver also enables encryption by default for all new rooms. | `tests/e2e/src/messaging.e2e.test.ts` — server-stored events are `m.room.encrypted` / `m.megolm.v1.aes-sha2`. |
| The server does not store plaintext message content. | Clients encrypt before sending. | E2E tests search **every text/JSON column of every table** in the Synapse database, and the server logs, for unique message strings: 0 hits. |
| iMello clients never fall back to sending plaintext. | `sendText()` refuses (`NotEncryptedError`) if encryption is not enabled in the room or crypto is not initialised. | `packages/core/src/messaging/guard.test.ts`. |
| Strangers cannot start conversations. | Synapse module `imello_policy` checks every invite/join with the Policy API and **fails closed**. User directory search is disabled. | E2E: stranger invite → `403 M_FORBIDDEN`. |
| Child accounts only communicate with guardian-approved contacts. | Policy rules + homeserver enforcement (invites, joins, group membership). | E2E `family-safety.e2e.test.ts` and browser `family.spec.ts`. |
| A newly signed-in device does not silently get earlier messages. | Megolm keys are only shared with devices that exist when a session is used; no automatic key backup restore. | E2E: new device sees earlier messages as undecryptable, can read later ones. |
| A revoked device loses access. | Device deletion invalidates its access token; other clients stop encrypting to it. | E2E: revoked token → 401 at homeserver and API; device disappears from peers' device list. |
| Invite links are unguessable, single-use, expiring. | 256-bit random tokens, stored only as SHA-256; row-locked redemption; 24 h (contact) / 7 d (family) expiry; identical error for every failure mode. | API tests. |
| No plaintext in logs. | API logs only method, route pattern and status (no URLs, bodies, headers); `no-console` lint rule; Synapse logs request lines only. | E2E log scan. |

## Cryptography

- **No custom cryptography.** iMello uses `matrix-js-sdk` + `@matrix-org/matrix-sdk-crypto-wasm` (Rust,
  vodozemac). The only WebCrypto use is AES-GCM to seal local secrets at rest (see below).
- **Forward secrecy / post-compromise security:** Olm provides a Double Ratchet between devices. Megolm (group
  ratchet) provides forward secrecy only per session rotation; sessions rotate on membership change and periodically
  (SDK defaults). Megolm does **not** provide post-compromise security within a session. This is a known property of
  Megolm; MLS would improve it.
- **Device trust:** cross-signing keys are bootstrapped on an account's first sign-in. **Interactive device
  verification (emoji/QR) UI is not implemented yet**, and clients currently encrypt to all of a contact's devices
  (verified or not). An attacker controlling the homeserver could therefore add a device to a user's account and
  receive future messages. This is the most important open item — see Roadmap Phase 3.
- **No master key / no escrow:** there is no server-side or operator key able to decrypt messages. Server-side key
  backup is not enabled.

## Web client

- **Key storage:** the Rust crypto store is in IndexedDB, encrypted with a random 32-byte storage key. The storage
  key and the access token are sealed with an AES-GCM key generated as **non-extractable** WebCrypto key and kept in
  IndexedDB. Nothing secret is stored in `localStorage` or `sessionStorage` (asserted by the browser test).
- **Temporary sessions** (public computers): keys only in memory, nothing persisted, device signed out on tab close
  (`pagehide` + `keepalive`). Verified by browser test.
- **Content Security Policy:** `script-src 'self' 'wasm-unsafe-eval'`, no inline scripts, `connect-src` limited to
  the API and homeserver, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`. Production headers are
  generated into `dist/_headers`; the browser tests run against the production build with this CSP and fail on any
  CSP violation.
- **XSS:** React escaping only; no `dangerouslySetInnerHTML`; message bodies rendered as text; no HTML message
  formatting is rendered.
- **CSRF:** the API uses bearer tokens in the `Authorization` header (no cookies), so cross-site requests carry no
  ambient credentials. CORS is restricted to configured origins.
- **Clickjacking:** `X-Frame-Options: DENY` + `frame-ancestors 'none'`.
- **Inherent web limits:** web-delivered code can be changed by whoever controls the web server, and malicious
  browser extensions can read page content. A browser client is **not** as strong as a native app. Users with
  elevated risk should prefer native clients once available.

## Server

- Synapse: registration disabled (accounts only via the API with the shared secret), federation disabled, guest
  access off, user directory off, profile lookups limited to shared rooms, presence off, URL previews off,
  room publication denied, admin API not exposed publicly (Caddy template).
- Policy API: zod validation on every input, 64 KB body limit, per-credential and per-IP rate limits (registration
  5 per 10 min per IP by default), Helmet security headers, constant-time comparison of the internal secret,
  `/internal/*` never proxied publicly.
- Secrets come from environment variables (`.env.example` documents them); none are committed. The dev stack
  generates local secrets into the git-ignored `.dev-stack/` directory.

## Reporting a vulnerability

Please report privately to the maintainer (abu00salman) via GitHub's private vulnerability reporting on the
repository. Do not open public issues for security problems.

## Before any public launch

1. Independent security review of the iMello code (policy module, API, web key storage, CSP).
2. Device verification UI and "only send to verified devices" option for high-risk users.
3. Penetration test of the deployed stack; dependency and container scanning in CI.
4. Child-safety and data-protection legal review per market (COPPA, GDPR-K/Age Appropriate Design Code, etc.).
