# Database

iMello uses two PostgreSQL databases:

| Database | Owner | Contents |
| --- | --- | --- |
| `synapse` | Synapse | Matrix events (**ciphertext** for messages), device keys (public), one-time keys, room state, access tokens. Must use `C` collation. Schema managed by Synapse. |
| `imello` | Policy API | Relationships and policy only (below). **No message content, no message metadata, no keys.** |

## `imello` schema (migration `001_init`)

| Table | Purpose | Notes |
| --- | --- | --- |
| `accounts` | One row per homeserver account created through iMello | `kind` adult/child, `status` active/deactivated |
| `guardianships` | guardian ↔ child | composite PK |
| `contacts` | One row per unordered pair (`user_low < user_high`) | `status` accepted / pending_guardian / denied |
| `contact_approvals` | One row per child that must approve a contact | `decision` pending/approved/denied, `decided_by` |
| `families`, `family_members` | Family Spaces and roles (admin/guardian/member/child) | `matrix_room_id` reserved for the family chat |
| `invites` | Contact & family invites | **only `token_hash` (SHA-256)**, expiry, max uses, uses |
| `blocks` | blocker → blocked | overrides everything |
| `reports` | Abuse reports | `child_safety` reason available |
| `audit_events` | Security-relevant events | event type + actor/target IDs + small metadata; never content, passwords or tokens (tested) |
| `schema_migrations` | Applied migration versions | |

## Migrations

- Files: `services/api/migrations/NNN_name.up.sql` + `NNN_name.down.sql`. Each is applied in its own transaction.
- Apply: `pnpm db:migrate` (the API also applies pending migrations on start).
- Roll back the latest: `pnpm --filter @imello/api run migrate:down`.
- Rollback is tested (`services/api/test/api.test.ts › migrations`).
- Rules: never edit an applied migration; additive changes first, destructive changes in a later release; take a
  backup before migrating production.

## Retention

- Accounts are soft-deleted (`status = deactivated`, display name replaced); relationships are hard-deleted.
- Invites expire (24 h / 7 d); a cleanup job for expired invites and old audit events (proposed: 400 days) is a
  Phase 7 task.
- Synapse: `redaction_retention_period: 1d`, `user_ips_max_age: 14d` in the config template.

## Backups (plan)

Nightly `pg_dump` of both databases + Synapse `media_store` and `signing.key`, encrypted (age/GPG) to off-site object
storage, 30-day retention, quarterly restore drill. Backups contain ciphertext only for messages, but do contain the
social graph — treat as sensitive.
