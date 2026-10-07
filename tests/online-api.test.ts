import { describe, expect, it } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createDuelHandler } from "../src/server/duel-api";
import { MemoryRoomStorage, MAX_ROOM_REQUEST_BYTES } from "../src/server/rooms";
function response() {
  const result = {
    statusCode: 200,
    headers: new Map<string, unknown>(),
    body: null as any,
  };
  const res = {
    setHeader: (name: string, value: unknown) =>
      result.headers.set(name, value),
    status: (code: number) => {
      result.statusCode = code;
      return res;
    },
    json: (value: unknown) => {
      result.body = value;
      return res;
    },
  };
  return { result, res: res as unknown as VercelResponse };
}
describe("private room API boundary", () => {
  it("accepts only POST and marks every response uncacheable", async () => {
    const { result, res } = response();
    await createDuelHandler(new MemoryRoomStorage())(
      { method: "GET", headers: { host: "example.test" } } as VercelRequest,
      res,
    );
    expect(result.statusCode).toBe(405);
    expect(result.headers.get("Allow")).toBe("POST");
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(result.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("rejects cross-origin browser requests before creating a room", async () => {
    const storage = new MemoryRoomStorage(),
      { result, res } = response();
    await createDuelHandler(storage)(
      {
        method: "POST",
        headers: { host: "example.test", origin: "https://other.test" },
        body: { op: "create", deckId: "annie" },
      } as VercelRequest,
      res,
    );
    expect(result.statusCode).toBe(403);
    expect(storage.records.size).toBe(0);
  });
  it("bounds request bodies and rejects malformed JSON without state writes", async () => {
    for (const body of [" ".repeat(MAX_ROOM_REQUEST_BYTES + 1), "{bad"]) {
      const storage = new MemoryRoomStorage(),
        { result, res } = response();
      await createDuelHandler(storage)(
        {
          method: "POST",
          headers: { host: "example.test" },
          body,
        } as VercelRequest,
        res,
      );
      expect([400, 413]).toContain(result.statusCode);
      expect(storage.records.size).toBe(0);
    }
  });
  it("reports durable storage failures with only a friendly public error code", async () => {
    const storage = {
      read: async () => null,
      create: async () => {
        throw Error("private bearer credential");
      },
      replace: async () => false,
    };
    const { result, res } = response();
    await createDuelHandler(storage)(
      {
        method: "POST",
        headers: { host: "example.test" },
        body: { op: "create", deckId: "annie" },
      } as VercelRequest,
      res,
    );
    expect(result.statusCode).toBe(503);
    expect(result.body).toEqual({ error: "storage-unavailable" });
  });
  it("creates an authenticated same-origin room without returning its stored state", async () => {
    const { result, res } = response();
    await createDuelHandler(new MemoryRoomStorage())(
      {
        method: "POST",
        headers: { host: "example.test", origin: "https://example.test" },
        body: { op: "create", deckId: "annie" },
      } as VercelRequest,
      res,
    );
    expect(result.statusCode).toBe(200);
    expect(result.body.room.status).toBe("waiting");
    expect(result.body.room).not.toHaveProperty("host");
    expect(result.body.room).not.toHaveProperty("inviteHash");
    expect(result.body.room).not.toHaveProperty("game");
  });
});
