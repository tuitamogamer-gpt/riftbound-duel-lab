import { describe, it, expect } from "vitest";
import { getCard } from "../src/data/cards";
import { MemoryRoomStorage, RoomService } from "../src/server/rooms";
describe("viewer-private mulligan choices", () => {
  it("names the guest's actual replacement cards without showing its hand to the host", async () => {
    const storage = new MemoryRoomStorage(),
      service = new RoomService(storage);
    const created = await service.request({
        op: "create",
        deckId: "annie",
        firstPlayer: "guest",
      }),
      host = created.credentials!;
    const joined = await service.request({
      op: "join",
      roomId: host.roomId,
      inviteToken: host.inviteToken,
      seatToken: "a".repeat(64),
      deckId: "lux",
    });
    const hand = joined.room.observation!.state.players[1].hand;
    expect(joined.room.actions).toHaveLength(11);
    for (const action of joined.room.actions) {
      const indices = action.cardIndices ?? [];
      if (indices.length)
        expect(action.label).toBe(
          `Replace ${indices.map((index) => getCard(hand[index]).name).join(" + ")}`,
        );
      expect(indices.every((index) => index >= 0 && index < 4)).toBe(true);
    }
    const ownSingle = joined.room.actions.find(
      (action) => action.cardIndices?.join(",") === "0",
    )!;
    expect(ownSingle.label).not.toBe("Replace one card");
    const search = await service.request({
      op: "poll",
      roomId: host.roomId,
      seatToken: joined.credentials!.seatToken,
      query: getCard(hand[0]).name,
    });
    expect(
      search.room.actions.some((action) => action.id === ownSingle.id),
    ).toBe(true);
    expect(
      search.room.actions.every((action) =>
        action.label.includes(getCard(hand[0]).name),
      ),
    ).toBe(true);
    const hostView = await service.request({
      op: "poll",
      roomId: host.roomId,
      seatToken: host.seatToken,
    });
    expect(hostView.room.actions).toEqual([]);
    expect(hostView.room.observation!.state.players[1].hand).toEqual([]);
    const applied = await service.request({
      op: "act",
      roomId: host.roomId,
      seatToken: joined.credentials!.seatToken,
      revision: joined.room.revision,
      requestId: "guest-replace-first",
      actionId: ownSingle.id,
    });
    expect(applied.room.observation!.state.players[1].mulliganDone).toBe(true);
  });
});
