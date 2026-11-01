import { createHash, createHmac } from "node:crypto";

export class HomeserverError extends Error {
  constructor(
    public readonly status: number,
    public readonly errcode: string,
  ) {
    super(`homeserver error ${status} ${errcode}`);
  }
}

export interface Homeserver {
  whoami(accessToken: string): Promise<{ userId: string; deviceId: string | null } | null>;
  registerUser(username: string, password: string, displayName: string): Promise<{ userId: string }>;
}

/** Talks to Synapse. Only uses the client-server whoami API and shared-secret registration. */
export function synapseHomeserver(baseUrl: string, registrationSharedSecret: string): Homeserver {
  return {
    async whoami(accessToken) {
      const res = await fetch(`${baseUrl}/_matrix/client/v3/account/whoami`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new HomeserverError(res.status, "whoami_failed");
      const body = (await res.json()) as { user_id: string; device_id?: string };
      return { userId: body.user_id, deviceId: body.device_id ?? null };
    },

    async registerUser(username, password, displayName) {
      const nonceRes = await fetch(`${baseUrl}/_synapse/admin/v1/register`);
      if (!nonceRes.ok) throw new HomeserverError(nonceRes.status, "nonce_failed");
      const { nonce } = (await nonceRes.json()) as { nonce: string };
      // HMAC-SHA1 over nonce \0 user \0 password \0 admin-flag, as specified by Synapse.
      const mac = createHmac("sha1", registrationSharedSecret)
        .update(nonce).update("\x00").update(username).update("\x00").update(password).update("\x00").update("notadmin")
        .digest("hex");
      const res = await fetch(`${baseUrl}/_synapse/admin/v1/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonce, username, password, displayname: displayName, admin: false, mac }),
      });
      const body = (await res.json().catch(() => ({}))) as { user_id?: string; errcode?: string };
      if (!res.ok || !body.user_id) throw new HomeserverError(res.status, body.errcode ?? "register_failed");
      return { userId: body.user_id };
    },
  };
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
