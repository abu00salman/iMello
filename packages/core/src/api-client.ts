import type {
  ChildSummary, Contact, Family, GuardianApproval, Invite, InvitePreview, Me, RedeemResult,
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export interface RegisterInput {
  username: string;
  password: string;
  displayName: string;
  locale?: string;
}

/**
 * Typed client for the iMello policy API. Authenticates with the user's
 * homeserver access token (sent only as a bearer header — no cookies, so no
 * ambient-credential CSRF surface).
 */
export class ImelloApiClient {
  constructor(
    private readonly baseUrl: string,
    private accessToken: string | null = null,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new ApiError(res.status, data?.error ?? "http_error", data?.message);
    return data as T;
  }

  register(input: RegisterInput) {
    return this.request<{ userId: string; homeserverUrl: string; serverName: string }>("POST", "/v1/auth/register", input);
  }
  config() {
    return this.request<{ homeserverUrl: string; serverName: string }>("GET", "/v1/config");
  }
  me() {
    return this.request<Me>("GET", "/v1/me");
  }
  updateMe(patch: { displayName?: string; locale?: string }) {
    return this.request<Me>("PATCH", "/v1/me", patch);
  }
  deleteMe() {
    return this.request<{ deleted: true }>("DELETE", "/v1/me");
  }
  exportMe() {
    return this.request<Record<string, unknown>>("GET", "/v1/me/export");
  }
  createContactInvite() {
    return this.request<Invite>("POST", "/v1/invites", { kind: "contact" });
  }
  previewInvite(token: string) {
    return this.request<InvitePreview>("POST", "/v1/invites/preview", { token });
  }
  redeemInvite(token: string) {
    return this.request<RedeemResult>("POST", "/v1/invites/redeem", { token });
  }
  contacts() {
    return this.request<{ contacts: Contact[] }>("GET", "/v1/contacts").then((r) => r.contacts);
  }
  removeContact(userId: string) {
    return this.request<{ removed: true }>("DELETE", `/v1/contacts/${encodeURIComponent(userId)}`);
  }
  block(userId: string) {
    return this.request<{ blocked: true }>("POST", "/v1/blocks", { userId });
  }
  unblock(userId: string) {
    return this.request<{ unblocked: true }>("DELETE", `/v1/blocks/${encodeURIComponent(userId)}`);
  }
  report(userId: string, reason: string, details?: string) {
    return this.request<{ reported: true }>("POST", "/v1/reports", { userId, reason, details });
  }
  createChild(input: { username: string; password: string; displayName: string; locale?: string }) {
    return this.request<ChildSummary>("POST", "/v1/guardian/children", input);
  }
  children() {
    return this.request<{ children: ChildSummary[] }>("GET", "/v1/guardian/children").then((r) => r.children);
  }
  approvals() {
    return this.request<{ approvals: GuardianApproval[] }>("GET", "/v1/guardian/approvals").then((r) => r.approvals);
  }
  decideApproval(approvalId: string, decision: "approve" | "deny") {
    return this.request<{ contactStatus: string }>("POST", `/v1/guardian/approvals/${approvalId}`, { decision });
  }
  createFamily(name: string) {
    return this.request<Family>("POST", "/v1/families", { name });
  }
  families() {
    return this.request<{ families: Family[] }>("GET", "/v1/families").then((r) => r.families);
  }
  createFamilyInvite(familyId: string) {
    return this.request<Invite>("POST", `/v1/families/${familyId}/invites`, {});
  }
  addChildToFamily(familyId: string, childUserId: string) {
    return this.request<Family>("POST", `/v1/families/${familyId}/children`, { childUserId });
  }
}
