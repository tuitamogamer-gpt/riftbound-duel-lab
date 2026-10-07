import { describe, expect, it, vi } from "vitest";
import {
  onlineInvitationUrl,
  onlineSecret,
  parseOnlineCredentials,
  readOnlineCredentials,
  readOnlineInvitation,
  requestOnlineRoom,
  storeOnlineCredentials,
  ONLINE_SAVE_KEY,
  ONLINE_JOIN_INTENT_KEY,
  readOnlineJoinIntent,
  storeOnlineJoinIntent,
} from "../src/game/online-client";
const own = {
  roomId: "a".repeat(32),
  seatToken: "b".repeat(64),
  seat: 0 as const,
  inviteToken: "c".repeat(64),
};
describe("online seat credentials and protocol", () => {
  it("keeps invitations in the URL fragment with no seat credential in the share link", () => {
    const url = onlineInvitationUrl(own, "https://example.test/?mode=duel");
    const parsed = new URL(url);
    expect(parsed.search).toBe("?mode=duel");
    expect(parsed.hash).toBe(`#duel=${own.roomId}.${own.inviteToken}`);
    expect(url).not.toContain(own.seatToken);
    expect(readOnlineInvitation(parsed.hash)).toEqual({
      roomId: own.roomId,
      inviteToken: own.inviteToken,
    });
  });
  it("rejects malformed or foreign invitation fragments", () => {
    for (const raw of [
      "#duel=../file.fake",
      "#other=a",
      "#duel=" + own.roomId + "." + own.seatToken + "&other=token",
      "#duel=" + own.roomId + ".short",
    ])
      expect(readOnlineInvitation(raw)).toBeNull();
  });
  it("stores only own online access under a separate key without modifying local duel data", () => {
    const values = new Map([["riftbound-duel-save-v1", "local duel"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    expect(storeOnlineCredentials(own, storage)).toBe(true);
    expect(values.has(ONLINE_SAVE_KEY)).toBe(true);
    expect(readOnlineCredentials(storage)).toEqual(own);
    expect(values.get("riftbound-duel-save-v1")).toBe("local duel");
    storeOnlineCredentials(null, storage);
    expect(readOnlineCredentials(storage)).toBeNull();
    expect(values.get("riftbound-duel-save-v1")).toBe("local duel");
  });
  it("handles disabled storage and corrupt cached credentials without crashing", () => {
    expect(readOnlineCredentials({ getItem: () => "{bad" })).toBeNull();
    expect(
      readOnlineCredentials({
        getItem: () => {
          throw Error("Denied");
        },
      }),
    ).toBeNull();
    expect(
      storeOnlineCredentials(own, {
        setItem: () => {
          throw Error("Quota");
        },
        removeItem: () => {},
      }),
    ).toBe(false);
    expect(parseOnlineCredentials({ ...own, seat: 3 })).toBeNull();
    expect(parseOnlineCredentials({ ...own, roomId: "../" })).toBeNull();
  });
  it("uses secure 256-bit request/seat nonces", () => {
    const a = onlineSecret(),
      b = onlineSecret();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
  });
  it("retains the exact guest nonce, invitation and selected deck across a remount without changing a local duel", () => {
    const values = new Map([["riftbound-duel-save-v1", "local duel"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const intent = {
      roomId: own.roomId,
      inviteToken: own.inviteToken,
      seatToken: onlineSecret(),
      createdAt: 100_000_000,
      selection: { deckId: "lux", battlefieldId: "ogn-277-298" },
    };
    expect(storeOnlineJoinIntent(intent, storage)).toBe(true);
    expect(readOnlineJoinIntent(storage, intent.createdAt + 60_000)).toEqual(
      intent,
    );
    const extraFields = {
      ...intent,
      selection: { ...intent.selection, op: "create", seatToken: "other" },
    };
    expect(
      readOnlineJoinIntent(
        { getItem: () => JSON.stringify(extraFields) },
        intent.createdAt,
      )?.selection,
    ).toEqual(intent.selection);
    expect(values.get("riftbound-duel-save-v1")).toBe("local duel");
    expect(storeOnlineJoinIntent(null, storage)).toBe(true);
    expect(values.has(ONLINE_JOIN_INTENT_KEY)).toBe(false);
    expect(values.get("riftbound-duel-save-v1")).toBe("local duel");
  });
  it("bounds pending joins to 24 hours and rejects invalid, oversized or unavailable storage", () => {
    const now = 100_000_000;
    const intent = {
      roomId: own.roomId,
      inviteToken: own.inviteToken,
      seatToken: onlineSecret(),
      createdAt: now,
      selection: { deckId: "lux" },
    };
    for (const entry of [
      { ...intent, createdAt: now - 24 * 60 * 60 * 1000 },
      { ...intent, createdAt: now + 60_001 },
      { ...intent, roomId: "../../room" },
      { ...intent, seatToken: "short" },
      { ...intent, selection: [] },
    ])
      expect(
        readOnlineJoinIntent({ getItem: () => JSON.stringify(entry) }, now),
      ).toBeNull();
    expect(
      readOnlineJoinIntent({ getItem: () => "x".repeat(120_001) }, now),
    ).toBeNull();
    expect(readOnlineJoinIntent({ getItem: () => "{bad" }, now)).toBeNull();
    expect(
      readOnlineJoinIntent(
        {
          getItem: () => {
            throw Error("Denied");
          },
        },
        now,
      ),
    ).toBeNull();
  });
  it("keeps a prior join intent when a replacement exceeds the limit or storage fails", () => {
    const values = new Map<string, string>([
      [ONLINE_JOIN_INTENT_KEY, "prior intent"],
    ]);
    const storage = {
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const intent = {
      roomId: own.roomId,
      inviteToken: own.inviteToken,
      seatToken: onlineSecret(),
      createdAt: Date.now(),
      selection: { deckId: "x".repeat(120_000) },
    };
    expect(storeOnlineJoinIntent(intent, storage)).toBe(false);
    expect(values.get(ONLINE_JOIN_INTENT_KEY)).toBe("prior intent");
    expect(
      storeOnlineJoinIntent(intent, {
        setItem: () => {
          throw Error("Quota");
        },
        removeItem: () => {},
      }),
    ).toBe(false);
  });
  it("posts credentials in a non-cached body with referrers suppressed", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ room: { id: own.roomId } }), {
          status: 200,
        }),
    );
    await requestOnlineRoom(
      { op: "poll", roomId: own.roomId, seatToken: own.seatToken },
      undefined,
      fetcher as typeof fetch,
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/duel");
    const options = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(options.cache).toBe("no-store");
    expect(options.referrerPolicy).toBe("no-referrer");
    expect(JSON.parse(options.body as string).seatToken).toBe(own.seatToken);
  });
  it("returns known availability errors without leaking server error data", async () => {
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          error: "storage-unavailable",
          secret: "not-client-data",
        }),
        { status: 503 },
      );
    await expect(
      requestOnlineRoom({ op: "create", deckId: "annie" }, undefined, fetcher),
    ).rejects.toMatchObject({
      code: "storage-unavailable",
      message: "storage-unavailable",
    });
    await expect(
      requestOnlineRoom(
        { op: "create", deckId: "annie" },
        undefined,
        async () => {
          throw Error("Network details");
        },
      ),
    ).rejects.toMatchObject({ code: "network", message: "network" });
  });
});
