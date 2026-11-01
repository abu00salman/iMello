import { describe, expect, it, vi } from "vitest";
import { NotEncryptedError, sendText } from "./index";

function fakeClient(encrypted: boolean) {
  return {
    getCrypto: () => ({ isEncryptionEnabledInRoom: async () => encrypted }),
    sendMessage: vi.fn(async () => ({ event_id: "$e" })),
  };
}

describe("sendText guard", () => {
  it("never sends into a room without encryption", async () => {
    const client = fakeClient(false);
    await expect(sendText(client as never, "!r:x", "secret")).rejects.toBeInstanceOf(NotEncryptedError);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it("refuses when crypto is not initialised", async () => {
    const client = { getCrypto: () => undefined, sendMessage: vi.fn() };
    await expect(sendText(client as never, "!r:x", "secret")).rejects.toBeInstanceOf(NotEncryptedError);
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it("sends with a stable transaction id into encrypted rooms", async () => {
    const client = fakeClient(true);
    await sendText(client as never, "!r:x", "hi", { txnId: "t1" });
    expect(client.sendMessage).toHaveBeenCalledWith("!r:x", { msgtype: "m.text", body: "hi" }, "t1");
  });
});
