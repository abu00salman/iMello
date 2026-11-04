import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcClient, type RpcTransport } from "./client";
import { colorIndex, displayInitial, formatStamp, pingRemaining, receiptFor } from "./format";
import { errorMessage, eventMessage, parseRpcMessage, responseMessage, requestMessage } from "./protocol";
import { en, ar } from "../i18n/strings";

function scripted(): { transport: RpcTransport; inbound: (raw: string) => void; sent: string[] } {
  const listeners = new Set<(raw: string) => void>();
  const sent: string[] = [];
  return {
    sent,
    transport: {
      send(json) {
        sent.push(json);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    inbound(raw) {
      for (const listener of listeners) listener(raw);
    },
  };
}

describe("rpc protocol", () => {
  it("round-trips requests, results and events", () => {
    const req = requestMessage("a", "sendText", { roomId: "!r", body: "مرحبا" });
    expect(parseRpcMessage(JSON.stringify(req))).toEqual(req);
    const ok = responseMessage("a", { eventId: "$1" });
    expect(parseRpcMessage(JSON.stringify(ok))).toEqual(ok);
    const ev = eventMessage("rooms", { n: 1 });
    expect(parseRpcMessage(JSON.stringify(ev))).toEqual(ev);
  });

  it("rejects malformed payloads", () => {
    expect(parseRpcMessage("not json")).toBeNull();
    expect(parseRpcMessage("null")).toBeNull();
    expect(parseRpcMessage(JSON.stringify({ v: 2, kind: "req", id: "a", method: "x" }))).toBeNull();
    expect(parseRpcMessage(JSON.stringify({ v: 1, kind: "nope" }))).toBeNull();
  });

  it("keeps an error code and drops a missing message", () => {
    const raw = JSON.stringify({ v: 1, kind: "res", id: "a", ok: false, error: { code: "ping_limited" } });
    expect(parseRpcMessage(raw)?.kind === "res" && parseRpcMessage(raw)).toMatchObject({
      ok: false,
      error: { code: "ping_limited", message: "ping_limited" },
    });
    expect(errorMessage("a", "timeout", "sendText").error?.code).toBe("timeout");
  });
});

describe("rpc client", () => {
  afterEach(() => vi.useRealTimers());

  it("correlates a response with the request that produced it", async () => {
    const { transport, inbound, sent } = scripted();
    const client = new RpcClient(transport);
    const pending = client.call<{ eventId: string }>("sendText", { roomId: "!r", body: "hi" });
    const outgoing = JSON.parse(sent[0] ?? "{}") as { id: string; method: string };
    expect(outgoing.method).toBe("sendText");
    inbound(JSON.stringify(responseMessage(outgoing.id, { eventId: "$e" })));
    await expect(pending).resolves.toEqual({ eventId: "$e" });
    client.dispose();
  });

  it("rejects when the engine reports an error", async () => {
    const { transport, inbound, sent } = scripted();
    const client = new RpcClient(transport);
    const pending = client.call("sendPing", { roomId: "!r" });
    const outgoing = JSON.parse(sent[0] ?? "{}") as { id: string };
    inbound(JSON.stringify(errorMessage(outgoing.id, "ping_limited", "ping_limited")));
    await expect(pending).rejects.toMatchObject({ code: "ping_limited" });
    client.dispose();
  });

  it("times out a call that never returns", async () => {
    vi.useFakeTimers();
    const { transport } = scripted();
    const client = new RpcClient(transport, 1_000);
    const pending = client.call("snapshot");
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    client.dispose();
  });

  it("delivers events and ignores unknown ids", () => {
    const { transport, inbound } = scripted();
    const client = new RpcClient(transport);
    const seen: unknown[] = [];
    client.on("rooms", (data) => seen.push(data));
    inbound(JSON.stringify(eventMessage("rooms", { n: 2 })));
    inbound(JSON.stringify(responseMessage("missing", {})));
    inbound("garbage");
    expect(seen).toEqual([{ n: 2 }]);
    client.dispose();
  });
});

describe("message status and ping limit", () => {
  it("maps sending, server acceptance and read", () => {
    expect(receiptFor("sending", false)).toBe("pending");
    expect(receiptFor("sent", false)).toBe("delivered");
    expect(receiptFor("sent", true)).toBe("read");
    expect(receiptFor("failed", false)).toBe("failed");
  });

  it("allows one ping per 15 seconds", () => {
    expect(pingRemaining(undefined, 1_000)).toBe(0);
    expect(pingRemaining(1_000, 1_000)).toBe(15_000);
    expect(pingRemaining(1_000, 10_000)).toBe(6_000);
    expect(pingRemaining(1_000, 20_000)).toBe(0);
  });
});

describe("names, colour and time", () => {
  it("picks a stable colour and an avatar letter", () => {
    expect(colorIndex("same")).toBe(colorIndex("same"));
    expect(colorIndex("same")).toBeGreaterThanOrEqual(0);
    expect(colorIndex("same")).toBeLessThan(6);
    expect(displayInitial("أبو سلمان")).toBe("س");
    expect(displayInitial("سارة")).toBe("س");
    expect(displayInitial("")).toBe("?");
  });

  it("labels yesterday in both languages and keeps western digits", () => {
    const now = new Date(2026, 10, 4, 21, 41).getTime();
    const yesterday = new Date(2026, 10, 3, 9, 12).getTime();
    expect(formatStamp(yesterday, "ar", now)).toBe("أمس");
    expect(formatStamp(yesterday, "en", now)).toBe("Yesterday");
    const today = formatStamp(now, "ar", now);
    expect(today).toMatch(/[0-9]/);
    expect(today).not.toMatch(/[٠-٩]/);
  });
});

describe("copy", () => {
  it("never uses the retired brand words", () => {
    const banned = /BBM|BlackBerry|\bPIN\b|بلاك\s*بيري/i;
    for (const catalog of [en, ar]) {
      for (const value of Object.values(catalog)) expect(value).not.toMatch(banned);
    }
  });

  it("names the identifier iMello Code in both languages", () => {
    expect(en.codeTitle).toMatch(/iMello Code/);
    expect(ar.codeTitle).toMatch(/رمز آي ميلو/);
  });
});
