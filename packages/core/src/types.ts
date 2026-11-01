export type AccountKind = "adult" | "child";
export type AccountStatus = "active" | "deactivated";

export interface PolicyAccount {
  userId: string;
  kind: AccountKind;
  status: AccountStatus;
}

export type ContactStatus = "accepted" | "pending_guardian" | "denied";

export interface Me {
  userId: string;
  username: string;
  displayName: string;
  kind: AccountKind;
  locale: string;
  createdAt: string;
  guardians: string[];
}

export interface Contact {
  contactId: string;
  userId: string;
  displayName: string;
  kind: AccountKind;
  status: ContactStatus;
  createdAt: string;
}

export interface Invite {
  token: string;
  kind: "contact" | "family";
  expiresAt: string;
  familyId?: string | null;
}

export interface InvitePreview {
  kind: "contact" | "family";
  inviterDisplayName: string;
  familyName?: string | null;
  expiresAt: string;
}

export interface RedeemResult {
  contact?: { contactId: string; userId: string; status: ContactStatus };
  family?: { familyId: string; name: string };
}

export interface Family {
  familyId: string;
  name: string;
  role: FamilyRole;
  members: { userId: string; displayName: string; role: FamilyRole; kind: AccountKind }[];
  createdAt: string;
}

export type FamilyRole = "admin" | "guardian" | "member" | "child";

export interface GuardianApproval {
  approvalId: string;
  contactId: string;
  childUserId: string;
  childDisplayName: string;
  requesterUserId: string;
  requesterDisplayName: string;
  createdAt: string;
}

export interface ChildSummary {
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface PolicyDecision {
  allow: boolean;
  reason: PolicyReason;
}

export type PolicyReason =
  | "ok"
  | "guardian_relationship"
  | "accepted_contact"
  | "self"
  | "unknown_account"
  | "deactivated"
  | "blocked"
  | "awaiting_guardian_approval"
  | "contact_denied"
  | "not_a_contact"
  | "child_requires_invite"
  | "room_member_not_permitted";
