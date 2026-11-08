# Ping messages and iMello Codes

This is the contract the web app and the API share. A native client should follow the same strings so the two stay compatible. No database row is rewritten by deploying this change.

## Ping

A Ping is an ordinary encrypted text message (`m.room.message`, `m.text`). There is no new event type.

| Body | Meaning |
|---|---|
| `\u2063imello-nudge\u2063` | Older Ping. The receiver plays their own default timbre. |
| `\u2063imello-nudge:<id>\u2063` | Ping in a chosen timbre. `<id>` is one of `taps`, `knock`, `bell`, `chirp`, `drum`. |

- At most one Ping per chat every 15 seconds. The limit is on the sending device.
- The open chat shakes for 420ms. Reduced motion uses an outline pulse instead.
- The five timbres are synthesised in the app. They are not recordings from another product.
- Settings stores the default id in `localStorage` key `imello.sound.pingTone`.
- Before sending, the chat shows the five timbres with a listen button. The sent body carries the id the person picked, so the other side plays that timbre.

## Codes

New accounts are `mell-` plus four memorable digits (`1122`, `1212`, `1221` shapes), shown as `Mell-1122`. The value stored as the Matrix username is lowercase.

Older accounts stay `mell-` plus six digits. `normalizePin` accepts both lengths, including `Mell-1122`, spaces, and Arabic-Indic digits. Sign-in and contact lookup use `POST /v1/auth/resolve` and `POST /v1/contact-requests`, which match `accounts.username` or `accounts.code`.

Migration `004_short_codes` only adds `accounts.code` and copies it for usernames that are already four digits. It does not assign a code to six-digit accounts and it does not touch `mell-872864`.

## One-account alias (not run from here)

To give one existing person a short code without changing their Matrix id, history, or old sign-in:

```bash
DATABASE_URL=postgres://... pnpm --filter @imello/api exec tsx src/remap-code.ts mell-872864 Mell-1122
```

That is a dry run. It prints one `UPDATE` of `accounts.code` and the rollback statement. The `username` column is not in the statement. If `mell-1122` is already a username or a code on a different account, the plan is refused and nothing is written.

After the plan has been read and approved:

```bash
DATABASE_URL=postgres://... pnpm --filter @imello/api exec tsx src/remap-code.ts mell-872864 Mell-1122 --apply
```

Rollback is the SQL printed above the apply line (`SET code = NULL` when the account had no alias). Do not run this against production from CI or from an unattended job.
