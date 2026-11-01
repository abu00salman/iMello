# iMello Architecture

Status: **accepted** (v1.0.0 development). Last reviewed 2026-11-01.

## 1. Decision summary

| Area | Decision |
| --- | --- |
| Messaging & E2EE protocol | **Matrix** (Olm/Megolm via the Rust crypto stack — `matrix-sdk-crypto` / vodozemac) |
| Homeserver | **Synapse**, self-hosted, federation disabled, open registration disabled |
| iMello product rules | Small **iMello Policy API** (TypeScript, Fastify, PostgreSQL) + **Synapse policy module** that enforces it server-side |
| Web client | **React + Vite**, `matrix-js-sdk` with Rust crypto compiled to WebAssembly |
| Mobile client | **Expo / React Native** (Expo Router, EAS Build). Native E2EE via **matrix-rust-sdk** bindings — *not yet integrated* |
| Shared code | pnpm monorepo: `@imello/core`, `@imello/localization`, `@imello/ui` |

iMello does not implement any cryptographic primitive or protocol itself.

## 2. Option A (Matrix) vs Option B (custom backend)

Option B was evaluated as: TypeScript + PostgreSQL + WebSockets + object storage, with messaging security provided
by a reviewed library. The realistic library candidates were `libsignal` (Signal's Rust library; official bindings
for Swift, Java and Node, **no supported browser/WASM build**) or implementing the Signal/MLS specs on top of
libsodium/WebCrypto (which is custom protocol engineering — explicitly ruled out by the project brief).

| # | Criterion | Option A — Matrix | Option B — custom |
| --- | --- | --- | --- |
| 1 | **Actual security** | Olm (Double Ratchet) for device-to-device key exchange, Megolm for group messages; vodozemac is a Rust implementation that has had independent audits (Least Authority, 2022) and is used by Element and others. Cross-signing, device verification (SAS/QR), key backup and secret storage are specified and implemented. | Only as strong as our integration of `libsignal`, which has no web build. Anything we write around it (group keys, multi-device fan-out, key distribution, backups) is new, unreviewed protocol work. |
| 2 | **Mobile compatibility** | `matrix-rust-sdk` has production FFI bindings (UniFFI) used by Element X on iOS/Android. React Native bindings exist via `uniffi-bindgen-react-native`, but are young; needs Expo *development builds* (custom native code), not Expo Go. | `libsignal` has native Swift/Java bindings; a React Native bridge would have to be written and maintained by us. |
| 3 | **Web encryption** | First-class: `matrix-sdk-crypto-wasm` is the same Rust code compiled to WASM, used by Element Web. Verified working here under a strict CSP (`'wasm-unsafe-eval'` only). | No maintained browser build of `libsignal`; would require our own WASM build or a JS port. |
| 4 | **Development complexity** | Low for messaging (homeserver + SDK provide transport, sync, ordering, retries, receipts, typing, media). Medium for iMello rules (one policy service + one Synapse module). | High: transport, offline queues, ordering, dedup, receipts, multi-device sync, group key management, media encryption all to be built. |
| 5 | **Message reliability** | Proven sync model (`/sync` with tokens), idempotent sends by transaction ID, server-ordered DAG. Verified by tests (offline catch-up in order; idempotent retries). | Must be designed and proven from scratch. |
| 6 | **Device synchronisation** | Built in: per-device keys, device lists, to-device messaging, cross-signing, key backup for history. | Must be built. |
| 7 | **Group encryption** | Megolm today; MLS work is in progress upstream. | Must be designed (Sender Keys or MLS integration). |
| 8 | **Hosting & operational cost** | One Synapse + PostgreSQL + a small Node service. Synapse is memory-hungry at scale; Conduit/continuwuity or Synapse workers are later options. | Potentially cheaper per user, but engineering cost dwarfs hosting cost. |
| 9 | **Scalability** | Synapse scales horizontally with workers; large deployments exist (governments, universities). Federation is off for iMello, so no federation load. | Unknown until built. |
| 10 | **Licensing & maintenance** | Synapse: AGPL-3.0 (or commercial licence from Element). matrix-js-sdk, matrix-rust-sdk, vodozemac: Apache-2.0. **AGPL note:** running modified Synapse as a network service obliges publishing those modifications; iMello does not modify Synapse (it uses the public module API). | Our own code, our own maintenance burden forever. |

**Decision: Option A (Matrix).** It gives the highest confidence in security and reliability because the hard
parts are established, specified and independently reviewed. iMello's own code is limited to product rules.

### Risks accepted with Matrix

- **Metadata:** the homeserver necessarily sees who talks to whom, when, room membership, and device lists. Message
  *content* is encrypted. See [THREAT_MODEL.md](THREAT_MODEL.md).
- **Mobile crypto integration risk:** the React Native ↔ matrix-rust-sdk path is the least mature part of the stack.
  Fallback plan: native (Swift/Kotlin) messaging modules using Element X's bindings directly, exposed to React Native
  as an Expo module.
- **AGPL:** acceptable for a self-hosted homeserver; legal review needed before offering hosted service commercially.

## 3. System overview

```
 ┌──────────────┐     HTTPS (Matrix C-S API, E2EE payloads)      ┌───────────────────────────┐
 │ Web client   │ ─────────────────────────────────────────────▶ │ Synapse homeserver        │
 │ (React, WASM │                                                │  - federation OFF         │
 │  Rust crypto)│     HTTPS (JSON, bearer = Matrix token)        │  - registration OFF       │
 │              │ ─────────────────────────┐                     │  - user directory OFF     │
 └──────────────┘                          │                     │  - imello_policy module ──┼──┐
 ┌──────────────┐                          ▼                     └─────────────┬─────────────┘  │ internal HTTP
 │ Mobile app   │ ───────────▶ ┌───────────────────────────┐ shared-secret     │ PostgreSQL     │ (shared secret,
 │ (Expo)       │              │ iMello Policy API         │ registration ─────┘ (synapse db)   │  private network)
 └──────────────┘              │  accounts, contacts,      │◀────────────────────────────────────┘
                               │  invites, guardians,      │   "may X invite Y into room R
                               │  families, blocks, audit  │    whose members are [...]?"
                               └─────────────┬─────────────┘
                                             │ PostgreSQL (imello db) — no message content, no keys
```

### Responsibilities

- **Synapse** stores and relays end-to-end encrypted events, device lists and one-time keys. It never has plaintext.
- **iMello Policy API** owns relationships: who is an adult or a child, who is whose guardian, which pairs are
  contacts, which contacts await guardian approval, families, blocks, reports. It creates homeserver accounts
  (via Synapse's shared-secret registration) so that every account has an iMello record.
- **`imello_policy` Synapse module** calls the Policy API synchronously before every invite and join and **fails
  closed**. This is what makes the child-safety rules hold even against a modified client. It also forbids
  publishing rooms to the directory, third-party (email) invites, and hides everyone from user-directory search.
- **Clients** never decide policy; they only reflect it.

### Policy rules (implemented in `packages/core/src/policy.ts`, enforced by the API + module)

1. Two accounts may communicate only if they are **accepted contacts** or **guardian ↔ child**, neither has
   **blocked** the other, and both are **active**. Unknown accounts are denied.
2. A contact established through an invite is **pending guardian approval** for each child involved (unless the
   adult is that child's guardian). Any guardian denial makes it **denied**.
3. **Rooms:** for a join or invite, every pair (newcomer, existing member) that involves a child must satisfy rule 1.
   A child can only join rooms it was invited to.
4. **Family invites** can only be issued by family admins/guardians; redeeming one connects the new member to the
   family, with the issuing guardian's invite counting as approval for *their own* children only.
   Children cannot redeem family invites themselves.

## 4. Frontend framework evaluation

| Option | Assessment |
| --- | --- |
| **Expo + React Native + Expo Router** | Chosen for iOS/Android. EAS Build gives cloud builds with no Xcode GUI. Native modules require development builds. |
| **React Native Web (single codebase for web)** | Rejected *for now* for the web client: the crypto stack on web is WASM loaded by `matrix-js-sdk`, while on native it must be `matrix-rust-sdk` FFI — the messaging layer differs per platform anyway. A dedicated Vite web app gives a smaller, auditable bundle, a strict CSP and simpler WASM loading. |
| **Shared packages** | Business rules, API client, validation, localization and design tokens are shared (`packages/*`) and used by both apps. |

## 5. Web key storage

See [SECURITY.md §Web](SECURITY.md#web-client). Summary: the Rust crypto store lives in IndexedDB encrypted with a
random 32-byte key; that key and the session token are sealed with a **non-extractable** WebCrypto AES-GCM key.
Nothing secret is stored in `localStorage`. Temporary sessions keep keys in memory only.

## 6. Mobile crypto plan (Phase 3)

1. Add an Expo module (`apps/mobile/modules/imello-matrix`) wrapping matrix-rust-sdk's FFI (`matrix-sdk-ffi`) —
   either via `uniffi-bindgen-react-native` or thin Swift/Kotlin wrappers over Element X's bindings.
2. Crypto store: SQLite encrypted with a key held in the iOS Keychain / Android Keystore.
3. Same `@imello/core` policy/API code; messaging UI ported from the web client.
4. Validate with the same protocol-level tests (iPhone ↔ Android ↔ web).

Until then the mobile app is honest: account, contacts, invites and guardian approvals work; chats show that
encrypted messaging is not yet available on this device.

## 7. Repository layout

```
apps/web            React web client (production build tested with Playwright)
apps/mobile         Expo app (Expo Router, EAS profiles)
services/api        iMello Policy API + SQL migrations
packages/core       policy rules, validation, API client, Matrix messaging wrapper
packages/localization  en/ar catalogs, RTL helpers
packages/ui         design tokens (colors, type, spacing, Kids Mode)
infrastructure/     Synapse config template + policy module; Docker Compose template
scripts/            dev-stack.sh (local stack without Docker), config renderer
tests/e2e           protocol-level tests (Node) and browser tests (Playwright)
docs/               this documentation
```
