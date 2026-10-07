import { afterEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob", () => ({
  get: calls.get,
  put: calls.put,
  BlobPreconditionFailedError: class extends Error {},
}));
import { BlobPreconditionFailedError } from "@vercel/blob";
import { BlobRoomStorage } from "../src/server/blob-room-storage";
import { MemoryRoomStorage, RoomService } from "../src/server/rooms";
afterEach(() => {
  calls.get.mockReset();
  calls.put.mockReset();
});
async function room() {
  const memory = new MemoryRoomStorage();
  const created = await new RoomService(memory).request({
    op: "create",
    deckId: "annie",
  });
  return memory.records.get(created.credentials!.roomId)!.room;
}
describe("durable private Blob adapter", () => {
  it("creates private bounded deterministic-path blobs without overwrite", async () => {
    const state = await room(),
      storage = new BlobRoomStorage("server-only-token", "");
    calls.put.mockResolvedValue({ etag: "created" });
    expect(await storage.create(state)).toBe(true);
    const [path, raw, options] = calls.put.mock.calls[0];
    expect(path).toBe(`duel-rooms/v1/${state.id}.json`);
    expect(JSON.parse(raw).id).toBe(state.id);
    expect(options).toMatchObject({
      access: "private",
      token: "server-only-token",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      maximumSizeInBytes: 2 * 1024 * 1024,
    });
    expect(options).not.toHaveProperty("ifMatch");
  });
  it("uses the read etag for conditional writes and reports CAS collisions", async () => {
    const state = await room(),
      storage = new BlobRoomStorage("server-only-token", "");
    calls.put.mockResolvedValue({ etag: "next" });
    expect(await storage.replace(state, "previous-etag")).toBe(true);
    expect(calls.put.mock.calls[0][2]).toMatchObject({
      access: "private",
      allowOverwrite: true,
      ifMatch: "previous-etag",
    });
    calls.put.mockRejectedValue(new BlobPreconditionFailedError());
    expect(await storage.replace(state, "outdated-etag")).toBe(false);
  });
  it("reads latest private origin data with no CDN cache", async () => {
    const state = await room(),
      storage = new BlobRoomStorage("server-only-token", "");
    const raw = JSON.stringify(state);
    calls.get.mockResolvedValue({
      statusCode: 200,
      blob: { size: Buffer.byteLength(raw), etag: "authoritative-etag" },
      stream: new Blob([raw]).stream(),
    });
    const read = await storage.read(state.id);
    expect(read?.etag).toBe("authoritative-etag");
    expect(calls.get.mock.calls[0][1]).toMatchObject({
      access: "private",
      token: "server-only-token",
      useCache: false,
    });
  });
  it("supports SDK OIDC store authentication and refuses missing configuration", async () => {
    const state = await room();
    calls.put.mockResolvedValue({ etag: "new" });
    expect(await new BlobRoomStorage("", "store-id").create(state)).toBe(true);
    expect(calls.put.mock.calls[0][2]).toMatchObject({
      access: "private",
      storeId: "store-id",
    });
    expect(calls.put.mock.calls[0][2]).not.toHaveProperty("token");
    await expect(
      new BlobRoomStorage("", "").create(state),
    ).rejects.toMatchObject({ code: "storage-unavailable" });
  });
});
