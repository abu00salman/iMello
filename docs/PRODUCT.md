# iMello — Product

**iMello (آي ميلو)** — *Stay Close. Feel Connected.* · *خلّك قريب من اللي تحبهم*
Developed by abu00salman.

## Vision

An elegant, private, ad-free messenger that families, children and trusted friends enjoy every day. iMello is a
communication tool, not a social network: no feeds, no strangers, no engagement tricks.

## Who it is for

| Person | Needs |
| --- | --- |
| Parents / guardians | Talk with family privately; let children message safely without spying on them |
| Children | A simple, friendly app to talk with the people their family trusts |
| Relatives & friends | Join a family easily, across iPhone, Android and the browser |
| Privacy-minded adults | A premium private messenger without ads or tracking |

## Principles

1. Private by default — end-to-end encryption, no discovery, no phone number required.
2. Safe for children by design — server-enforced approved-contacts rules, not app-side filters.
3. Respectful — transparent guardian controls, no covert monitoring, no manipulative notifications or streaks.
4. Beautiful and simple — Apple-quality polish with an original identity; Arabic and English from day one.
5. Honest — features are labelled by real status; no fake demo data.

## Identity

- Icon: a lowercase **m** whose last stroke flows into a speech-bubble tail, with a dot that also reads as the "i" —
  two arches for two people, connected. Soft blue → lavender gradient. Source: `apps/web/public/icon.svg`.
- Colours: clean white, soft blue (`#3D7FE0`), light neutrals, lavender accents (`#8E78E8`), elegant dark mode.
  Tokens in `packages/ui`; all text colour pairs are tested for WCAG AA contrast.
- Typography: system UI fonts with Arabic-capable fallbacks; larger line height for Arabic.

## Navigation

Chats · Calls · Family · Contacts · Settings. Desktop/tablet: sidebar + conversation list + conversation.
Phone: bottom tab bar. Kids Mode: large contact cards, no Contacts/Calls tabs.

## What exists today (v1.0.0 preview)

See [ROADMAP.md](ROADMAP.md) for the full status table and [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

- Web: registration, sign-in, temporary sessions, encrypted one-to-one chats (replies, typing, delivery state),
  private invite links + QR, contacts, block/report, Family Spaces, child accounts, guardian approvals, Kids Mode
  home, devices & revocation, export, account deletion, English/Arabic, light/dark/system theme.
- Mobile: account, contacts, invites, family & approvals; **encrypted chat not yet available on mobile**.

## Business model

Ad-free. Future, optional: premium personalisation (themes, sticker packs), extra encrypted storage, voluntary
donations, organisation subscriptions. Core messaging and child-safety features are always free. No payments in the
MVP.
