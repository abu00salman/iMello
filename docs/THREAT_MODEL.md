# iMello Threat Model

Version 1.0 (development preview). Method: assets → actors → threats (STRIDE-style) → mitigations → residual risk.

## Assets

1. Message content (text now; media/voice later).
2. Device private keys, Megolm session keys, cross-signing keys.
3. Account credentials and access tokens.
4. The social graph: who is whose contact, guardian relationships, family membership.
5. Children's safety: that only approved people can reach a child.
6. Availability of the service.

## Actors

| Actor | Capability |
| --- | --- |
| **Stranger** | Has an iMello account; tries to contact users, especially children. |
| **Malicious contact** | An accepted contact who misbehaves (harassment, forwarding, grooming attempts). |
| **Network attacker** | Observes/modifies traffic between client and server. |
| **Curious/compromised server operator** | Full access to homeserver, policy DB, logs and the web-app hosting. |
| **Device thief** | Physical access to an unlocked or locked device / browser profile. |
| **Web attacker** | XSS, malicious extension, clickjacking, CSRF. |
| **Guardian overreach** | A guardian who wants to read a child's messages covertly. |

## Threats and mitigations

| # | Threat | Mitigation (status) | Residual risk |
| --- | --- | --- | --- |
| T1 | Server reads message content | E2EE (Megolm/Olm); content never sent in plaintext; verified no plaintext in DB/logs (**done**) | — |
| T2 | Server operator adds a ghost device to a user to receive future messages | Cross-signing bootstrapped (**done**); verification UI + "verified devices only" mode (**planned, Phase 3**) | **High until Phase 3**: clients currently encrypt to unverified devices. |
| T3 | Server operator replaces web-app JavaScript to exfiltrate keys | Strict CSP limits *injected* scripts but not a malicious origin. Documented; native apps and reproducible builds/subresource integrity are mitigations (**planned**). | Inherent to web delivery. |
| T4 | Metadata analysis (who talks to whom, when) | No phone-number discovery, no user directory, presence off, URL previews off; federation off (**done**) | Homeserver sees room membership, timing and sizes. |
| T5 | Stranger contacts a child | Closed network; homeserver-enforced invite/join policy; guardian approval for every child contact; group-membership rule (**done, tested**) | Social engineering of a guardian. |
| T6 | Stranger obtains a child's invite link | Redemption creates only a *pending* contact; guardian must approve (**done, tested**) | Guardian approving without checking — UI shows the requester's user ID. |
| T7 | Child pulled into a group with an unapproved person | Room membership rule checks every (newcomer, member) pair involving a child (**done, tested**) | — |
| T8 | Username enumeration | No search API; invite preview needs a 256-bit token; registration conflict is unavoidable but rate-limited (5 / 10 min / IP) | Slow enumeration via registration attempts. |
| T9 | Invite link brute force / replay | 256-bit tokens, hashed at rest, single use, expiry, uniform errors, rate limits (**done, tested**) | — |
| T10 | Credential stuffing | Synapse login rate limits; password minimum 10 chars | No 2FA/passkeys yet (**planned**). |
| T11 | Stolen access token | Tokens only in Keychain/Keystore (mobile) or sealed in IndexedDB (web); remote device revocation (**done**) | API caches token validity up to 30 s after revocation. |
| T12 | Device theft (browser profile) | Crypto store encrypted at rest with key sealed by non-extractable WebCrypto key | An attacker who can run code in the logged-in profile can use the keys. OS-level disk encryption recommended. |
| T13 | XSS | React text rendering only, CSP without inline scripts, no third-party scripts (**done**) | Supply-chain compromise of a dependency. |
| T14 | CSRF / clickjacking | Bearer tokens (no cookies), strict CORS, `frame-ancestors 'none'` (**done**) | — |
| T15 | Policy service down → bypass | Synapse module fails closed (**done**) | Availability impact instead of safety impact (by design). |
| T16 | Internal policy endpoint abused | Shared secret (constant-time compare) + private network; Caddy never proxies `/internal/*` | Misconfigured deployments — DEPLOYMENT.md checklist. |
| T17 | Covert guardian monitoring | **Not offered by design**: guardians cannot read children's messages; controls are transparent and shown to the child | — |
| T18 | Malicious attachments | Not applicable yet (media not implemented). Plan: encrypt client-side, type sniffing, no auto-download of dangerous types. | — |
| T19 | Logs leak personal data | API logs method/route/status only; audit log stores event types and IDs, never content/passwords/tokens (**tested**) | Synapse INFO logs include user IDs and room IDs (needed for operations); retention 7 days in template. |
| T20 | Denial of service | Rate limits on API and Synapse; body size limits | No WAF/CDN rate limiting configured yet. |

## Out of scope (for now)

- Nation-state adversaries targeting individual users.
- Compromised user operating systems.
- Traffic-analysis resistance (padding, cover traffic).
