import { describe, expect, it } from "vitest";
import { type ChatDTO, lastMessageDelivery } from "../src/index.js";

const chat = (senderId: string, peers: { lastDeliveredAt: string | null; lastReadAt: string | null }[], extra = {}) =>
  ({
    lastMessage: { senderId, createdAt: "2026-11-13T10:00:00.000Z", deletedAt: null, type: "text", ...extra },
    members: [{ user: { id: "me" }, lastDeliveredAt: null, lastReadAt: null }, ...peers.map((p, i) => ({ user: { id: `peer${i}` }, ...p }))],
  }) as unknown as ChatDTO;

const before = "2026-11-13T09:00:00.000Z";
const after = "2026-11-13T11:00:00.000Z";

describe("lastMessageDelivery", () => {
  it("says how far my last message got, once every other member has it", () => {
    expect(lastMessageDelivery(chat("me", [{ lastDeliveredAt: before, lastReadAt: null }]), "me")).toBe("sent");
    expect(lastMessageDelivery(chat("me", [{ lastDeliveredAt: after, lastReadAt: before }]), "me")).toBe("delivered");
    expect(lastMessageDelivery(chat("me", [{ lastDeliveredAt: after, lastReadAt: after }]), "me")).toBe("read");
    const group = [
      { lastDeliveredAt: after, lastReadAt: after },
      { lastDeliveredAt: after, lastReadAt: null },
    ];
    expect(lastMessageDelivery(chat("me", group), "me")).toBe("delivered");
  });

  it("says nothing for someone else's message, a deleted or service one, or a chat with nobody else", () => {
    const read = [{ lastDeliveredAt: after, lastReadAt: after }];
    expect(lastMessageDelivery(chat("peer0", read), "me")).toBeNull();
    expect(lastMessageDelivery(chat("me", read, { deletedAt: after }), "me")).toBeNull();
    expect(lastMessageDelivery(chat("me", read, { type: "service" }), "me")).toBeNull();
    expect(lastMessageDelivery(chat("me", []), "me")).toBeNull();
  });
});
