import type { ContactStatus, PolicyAccount, PolicyDecision } from "./types";

/**
 * Pure policy rules shared by the iMello API (which is the enforcement point,
 * called synchronously by the homeserver) and clients (which use them only to
 * shape the UI). Clients must never be trusted to enforce these rules.
 */

export interface PairFacts {
  a: PolicyAccount | null;
  b: PolicyAccount | null;
  /** Either side has blocked the other. */
  blocked: boolean;
  /** One side is a registered guardian of the other. */
  guardianRelationship: boolean;
  /** Status of the contact relationship between a and b, if any. */
  contactStatus: ContactStatus | null;
}

/**
 * May `a` and `b` communicate (DM invite, or sharing a room)?
 * iMello is closed by default: two accounts may only talk once a contact
 * relationship exists (established through a private invite) and, when a child
 * is involved, a guardian of that child has approved it.
 */
export function decideCommunication(f: PairFacts): PolicyDecision {
  if (!f.a || !f.b) return { allow: false, reason: "unknown_account" };
  if (f.a.userId === f.b.userId) return { allow: true, reason: "self" };
  if (f.a.status !== "active" || f.b.status !== "active") return { allow: false, reason: "deactivated" };
  if (f.blocked) return { allow: false, reason: "blocked" };
  if (f.guardianRelationship) return { allow: true, reason: "guardian_relationship" };
  switch (f.contactStatus) {
    case "accepted":
      return { allow: true, reason: "accepted_contact" };
    case "pending_guardian":
      return { allow: false, reason: "awaiting_guardian_approval" };
    case "denied":
      return { allow: false, reason: "contact_denied" };
    default:
      return { allow: false, reason: "not_a_contact" };
  }
}

/**
 * Who must approve a newly redeemed contact invitation?
 * Returns the child user IDs that need a guardian decision. An empty list means
 * the contact is accepted immediately.
 *
 * A guardian connecting to their own child needs no extra approval.
 */
export function requiredChildApprovals(
  creator: PolicyAccount,
  redeemer: PolicyAccount,
  isGuardianOf: (guardianId: string, childId: string) => boolean,
): string[] {
  const needed: string[] = [];
  for (const [child, other] of [
    [creator, redeemer],
    [redeemer, creator],
  ] as const) {
    if (child.kind === "child" && !isGuardianOf(other.userId, child.userId)) needed.push(child.userId);
  }
  return needed;
}

/**
 * May `joiner` join (or be invited into) a room whose current members are
 * `members`? Every pair (joiner, member) that involves a child must be
 * permitted to communicate. This stops a child being pulled into a group that
 * contains a stranger, and a stranger joining a group that contains a child.
 */
export function decideRoomMembership(
  joiner: PolicyAccount | null,
  members: string[],
  pairFacts: (a: string, b: string) => PairFacts,
  memberAccounts: Map<string, PolicyAccount | null>,
): PolicyDecision {
  if (!joiner) return { allow: false, reason: "unknown_account" };
  if (joiner.status !== "active") return { allow: false, reason: "deactivated" };
  for (const memberId of members) {
    if (memberId === joiner.userId) continue;
    const member = memberAccounts.get(memberId) ?? null;
    const childInvolved = joiner.kind === "child" || member?.kind === "child" || member === null;
    if (!childInvolved) continue;
    const d = decideCommunication(pairFacts(joiner.userId, memberId));
    if (!d.allow) return { allow: false, reason: "room_member_not_permitted" };
  }
  return { allow: true, reason: "ok" };
}
