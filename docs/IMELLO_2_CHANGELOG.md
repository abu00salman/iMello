# iMello 2.0 — changelog

Rollback point: `266654b` (last 1.x commit). Branch: `claude/imello-messenger-dev-12zxqe`.

## Fixed
- **Freezes / lag in conversations** — re-render storms during sync and decryption (35 long tasks → 0 for a
  40-message burst), unbounded message DOM, chat list converting every message; opening a 300-message
  conversation 18.6 s → 0.1 s. See IMELLO_2_PERFORMANCE.md.
- **Slow first open after reopening the app** — Synapse initial-sync cache (server setting).
- **Duplicate chats/invitations** — both people pressing "Message" created two rooms; concurrent taps raced;
  `m.direct` updates could overwrite each other. Chat creation is now idempotent (reuses joined rooms and
  pending invites from that person, joins the invite instead of creating another), updates are serialised, and
  the list shows one row per person (existing duplicate rooms are hidden, never deleted).
- **Scroll jumps** — new messages no longer pull you down while reading older ones; loading older messages keeps
  your position.
- **Registration errors** — specific messages for no connection, server errors, taken username, invalid name or
  password; double submissions ignored.
- **Rate limiting behind Cloudflare** — keyed by `CF-Connecting-IP`; a spoofed `X-Forwarded-For` no longer
  bypasses limits.
- **Settings security wording** — no blanket "verified" impression; states device verification isn't available.

## Changed
- **Liquid Glass 2.0** — glass only on floating navigation, conversation header, composer and call controls;
  solid cards, lists, forms and bubbles; supports "Reduce Transparency"; content never hides under the tab bar.
- Compact chat-list rows and settings cards.

## Added
- `/health/deep` (database + homeserver status and latency, no user data).
- Container log rotation in Docker Compose.
- `scripts/backup-mac.sh` (encrypted, consistent backups) and `scripts/restore-test.sh` (isolated restore test).
- Regression tests: duplicate conversations (fail on 1.x, pass on 2.0), Cloudflare rate-limit keying, deep health;
  performance benchmark spec.
