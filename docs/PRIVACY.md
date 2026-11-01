# iMello Privacy

> Draft engineering privacy notice — **not legal advice**. A lawyer must review it for each release market
> (e.g. GDPR / UK GDPR + Age Appropriate Design Code, COPPA in the US, local Gulf data-protection laws) before launch.

## Principles

- **No advertising, ever.** No advertising SDKs, no selling or sharing data for advertising, no behavioural profiling.
- **No analytics or tracking SDKs.** The web and mobile apps load no third-party scripts. The iOS privacy manifest
  declares no tracking; Android blocks the advertising-ID permission.
- **Data minimisation.** No phone number or email is required. No contact-book upload. No public profiles.
- **No covert monitoring.** Guardians manage *who* a child can talk to; they cannot read a child's messages.
- **Children's core safety features are free** and never behind a paywall.

## What the service stores

| Data | Where | Who can read it |
| --- | --- | --- |
| Message content | Homeserver, **end-to-end encrypted** | Only the participants' devices |
| Username, display name, account type (adult/child), language | Policy DB + homeserver | Service operator; display name visible to your contacts |
| Password | Homeserver (bcrypt hash) | Nobody (hash only) |
| Contacts, guardian links, families, blocks | Policy DB | Service operator; relevant parties see their own relationships |
| Pending guardian approvals | Policy DB | The child's guardians |
| Reports you file | Policy DB | Service operator (for safety review) |
| Security audit events (e.g. "invite created", "contact approved") | Policy DB | Service operator |
| Device names, last-seen time, IP addresses (14 days) | Homeserver | You (device list) and the service operator |
| Room membership, message timestamps and sizes (metadata) | Homeserver | Service operator |

Not collected: location, contacts book, phone number, email, advertising IDs, analytics events.

## Your controls

- **Export:** Settings → Export my data (everything the policy service holds about you).
- **Delete:** Settings → Delete account (deactivates and erases your homeserver account and removes relationships).
- **Devices:** see and sign out devices in Settings.
- **Block and report** any contact.
- **Temporary session** on public computers keeps nothing on the device.

## Children

- Child accounts are created by a guardian; the child is shown that a guardian manages their contacts.
- Children are hidden from all discovery, can only be contacted by guardian-approved contacts, and can only join
  conversations they are invited to with approved people. These rules are enforced by the server.
- Release markets will require verified parental consent flows and age-appropriate defaults (quiet hours,
  notification content) — tracked in ROADMAP Phase 4/7.

## Notifications (planned, Phase 5)

Push payloads will contain no message content or sender names — only an opaque event reference that the app
decrypts locally.
