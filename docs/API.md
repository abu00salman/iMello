# iMello Policy API

Base URL: `VITE_API_URL` (dev: `http://localhost:8787`). JSON in/out. Errors: `{ "error": "<code>", "message"? }`.

**Authentication:** `Authorization: Bearer <Matrix access token>`. The API validates the token with the homeserver's
`/account/whoami` (cached ≤ 30 s) and requires an active iMello account. No cookies are used.

**Rate limits:** 300 req/min per credential (authenticated) or per IP (anonymous), plus the per-route limits below.

Messaging itself uses the standard [Matrix client-server API](https://spec.matrix.org/latest/client-server-api/)
against the homeserver; this API only manages relationships and policy.

## Public

| Method & path | Auth | Description |
| --- | --- | --- |
| `GET /health` | – | `{ status: "ok" }` |
| `GET /v1/config` | – | `{ homeserverUrl, serverName }` |
| `POST /v1/auth/register` | – | Body `{ username, password, displayName, locale? }`. Creates the homeserver account and iMello record. 201 `{ userId, homeserverUrl, serverName }`. Errors: `username_length`, `username_characters`, `username_reserved`, `username_unavailable` (409), `password_too_short`, `display_name_invalid`. Limit: `REGISTRATION_RATE_LIMIT` per IP / 10 min (default 5). |

| `POST /v1/auth/quick` | – | **Start now.** Body `{ deviceSecret (≥32 chars, random, generated and kept on the device), displayName?, locale? }` → 201 `{ userId, pin: "mell-NNNNNN", homeserverUrl, serverName }`. The number is the username; `credential` is `device` until protected. Same rate limit as registration. |

Sign-in is done directly against the homeserver (`POST /_matrix/client/v3/login`) with a username or iMello number.

## Account

| Method & path | Description |
| --- | --- |
| `GET /v1/me` | `{ userId, username, pin, credential: "password"\|"device", displayName, kind: "adult"\|"child", locale, createdAt, guardians[] }` |
| `PATCH /v1/me` | `{ displayName?, locale? }` |
| `POST /v1/me/protected` | Marks the account `credential: "password"` after the client changed the homeserver password from the device secret to the user's own. |
| `GET /v1/me/export` | Everything the policy service stores about the caller (5/hour). Messages are not included (they are E2EE on the homeserver). |
| `DELETE /v1/me` | Deletes relationships, marks the account deactivated (homeserver immediately refuses new conversations). The client then deactivates the homeserver account with the user's password. |

## Invites & contacts

| Method & path | Description |
| --- | --- |
| `POST /v1/invites` | Body `{ kind: "contact" }` → 201 `{ token, kind, expiresAt, link }`. Single use, 24 h. 30/hour. |
| `POST /v1/invites/preview` | `{ token }` → `{ kind, inviterDisplayName, familyName, expiresAt }`. Does not consume. |
| `POST /v1/invites/redeem` | `{ token }` → `{ contact: { contactId, userId, status } }` or `{ family: { familyId, name } }`. Status `accepted` or `pending_guardian`. All invalid/expired/used tokens → 404 `invite_not_found`. 20/10 min. |
| `GET /v1/contacts` | `{ contacts: [{ contactId, userId, displayName, kind, status, createdAt }] }` (includes guardian/child). |
| `DELETE /v1/contacts/:userId` | Remove a contact. |
| `POST /v1/blocks` / `DELETE /v1/blocks/:userId` | Block / unblock. Blocking overrides contacts and guardianship for messaging. |
| `POST /v1/reports` | `{ userId, reason: spam\|harassment\|impersonation\|inappropriate_content\|child_safety\|other, details? }` (10/hour). |

## Contact requests by iMello number

| Method & path | Description |
| --- | --- |
| `POST /v1/contact-requests` | `{ pin }` (loose spellings and Arabic digits accepted). Always 202 `{ status: "sent" }` for unknown, blocked or pending targets, so numbers cannot be probed; 200 `already_contact` for existing contacts. If the target already asked you, this accepts. Requests to a child go to the child's guardian as an approval. 20/hour. |
| `GET /v1/contact-requests` | `{ incoming: [{ requestId, userId, displayName, pin, createdAt }] }`. Outgoing requests are deliberately not listed (would confirm a number exists). |
| `POST /v1/contact-requests/:id` | `{ accept: boolean }` → `{ contactStatus }` (`accepted`, `pending_guardian` if a child is involved, or `null` when declined). Recipient only. |

## Guardian

| Method & path | Description |
| --- | --- |
| `POST /v1/guardian/children` | Adults only. `{ username, password, displayName, locale? }` → child account + guardianship. 10/hour. |
| `GET /v1/guardian/children` | Children of the caller. |
| `GET /v1/guardian/approvals` | Pending contact requests for the caller's children. |
| `POST /v1/guardian/approvals/:id` | `{ decision: "approve"\|"deny" }` → `{ contactStatus }`. Only the child's guardian; decisions are final (409 afterwards). |

## Families

| Method & path | Description |
| --- | --- |
| `POST /v1/families` | Adults only. `{ name }` → family (caller is admin). |
| `GET /v1/families` | Families the caller belongs to, with members and roles. |
| `POST /v1/families/:id/invites` | Admin/guardian only → single-use 7-day family invite. |
| `POST /v1/families/:id/children` | `{ childUserId }`. Caller must be family admin/guardian **and** the child's guardian. |

## Internal (homeserver → API only)

Header `x-imello-policy-secret: <POLICY_INTERNAL_SECRET>`. Never expose publicly.

| Method & path | Body | Response |
| --- | --- | --- |
| `POST /internal/policy/invite` | `{ inviter, invitee, roomId, roomMembers[] }` | `{ allow, reason }` |
| `POST /internal/policy/join` | `{ userId, roomId, isInvited, roomMembers[] }` | `{ allow, reason }` |

Reasons: `guardian_relationship`, `accepted_contact`, `ok`, `unknown_account`, `deactivated`, `blocked`,
`awaiting_guardian_approval`, `contact_denied`, `not_a_contact`, `child_requires_invite`, `room_member_not_permitted`.
