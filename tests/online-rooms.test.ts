import { describe, expect, it } from "vitest";
import { decksById, officialPreconDecks } from "../src/data/decks";
import { applyAction, getLegalActions, getMight } from "../src/game/engine";
import { combatUnit } from "./fixtures/combat";
import {
  MemoryRoomStorage,
  RoomService,
  ROOM_TTL_MS,
  type StoredRoom,
} from "../src/server/rooms";
import type {
  OnlineCredentials,
  OnlineResponse,
} from "../src/game/online-protocol";

const guestToken = "a".repeat(64);
async function opening(firstPlayer: "host" | "guest" = "host") {
  const storage = new MemoryRoomStorage();
  const service = new RoomService(storage);
  const host = await service.request({
    op: "create",
    deckId: "annie",
    firstPlayer,
  });
  const credentials = host.credentials!;
  const guest = await service.request({
    op: "join",
    roomId: credentials.roomId,
    inviteToken: credentials.inviteToken,
    seatToken: guestToken,
    deckId: "lux",
  });
  return {
    storage,
    service,
    host: credentials,
    guest: guest.credentials!,
    view: guest.room,
  };
}
const poll = (service: RoomService, credentials: OnlineCredentials) =>
  service.request({
    op: "poll",
    roomId: credentials.roomId,
    seatToken: credentials.seatToken,
  });
const act = (
  service: RoomService,
  credentials: OnlineCredentials,
  response: OnlineResponse,
  actionId: string,
  requestId = "move-1",
) =>
  service.request({
    op: "act",
    roomId: credentials.roomId,
    seatToken: credentials.seatToken,
    revision: response.room.revision,
    actionId,
    requestId,
  });

describe("private authoritative rooms", () => {
  it("names the guest's own base relative to its seat while preserving canonical action IDs", async () => {
    const { storage, service, host, guest } = await opening("guest");
    const state = storage.records.get(host.roomId)!.room.game!;
    state.phase = "main";
    state.turn = 5;
    state.currentPlayer = state.priorityPlayer = state.focusPlayer = 1;
    for (const player of state.players) {
      player.hasBegun = true;
      player.mulliganDone = true;
      player.hand = [];
      player.energy = player.power = 20;
      player.runes = [];
      player.championAvailable = false;
    }
    state.players[1].hand = ["ogn-175-298"];
    state.units = [{ ...combatUnit("guest-retreat", 1, 3), ready: true }];
    const canonical = getLegalActions(state, 1);
    const canonicalPlay = canonical.find(
      (action) => action.category === "play" && action.locationId === "base:1",
    )!;
    const canonicalMove = canonical.find(
      (action) => action.id === "move-start:guest-retreat:base:1",
    )!;
    expect(canonicalPlay.label).toContain(" at enemy base");
    expect(canonicalMove.label).toContain(" → enemy base");
    const initial = await poll(service, guest);
    expect(
      initial.room.actions.find((action) => action.id === canonicalPlay.id)
        ?.label,
    ).toBe(canonicalPlay.label.replace(" at enemy base", " at your base"));
    expect(
      initial.room.actions.find((action) => action.id === canonicalMove.id)
        ?.label,
    ).toBe(canonicalMove.label.replace(" → enemy base", " → your base"));
    const searched = await service.request({
      op: "poll",
      roomId: guest.roomId,
      seatToken: guest.seatToken,
      query: "your base",
    });
    expect(
      searched.room.actions.some((action) => action.id === canonicalPlay.id),
    ).toBe(true);
    expect(
      searched.room.actions.every((action) =>
        action.label.includes("your base"),
      ),
    ).toBe(true);
    expect((await poll(service, host)).room.actions).toEqual([]);
    const choosing = await act(
      service,
      guest,
      initial,
      canonicalMove.id,
      "guest-retreat-start",
    );
    const confirm = choosing.room.actions.find(
      (action) => action.id === "move-confirm",
    )!;
    expect(confirm.label).toBe("Move 1 unit to your base");
    expect(confirm.locationId).toBe("base:1");
    const moved = await act(
      service,
      guest,
      choosing,
      confirm.id,
      "guest-retreat-confirm",
    );
    expect(
      moved.room.observation?.state.units.find(
        (unit) => unit.id === "guest-retreat",
      )?.location,
    ).toBe("base:1");
  });
  it("selects two ready units through live movement decisions and moves both only after group confirmation", async () => {
    const { storage, service, host, guest } = await opening();
    const state = storage.records.get(host.roomId)!.room.game!;
    state.phase = "main";
    state.currentPlayer = 0;
    state.priorityPlayer = 0;
    state.players[0].hasBegun = true;
    state.players[0].mulliganDone = true;
    state.players[1].mulliganDone = true;
    state.fields[0].controller = 0;
    state.units = [
      { ...combatUnit("group-front", 0, 4), location: "base:0", ready: true },
      { ...combatUnit("group-back", 0, 3), location: "base:0", ready: true },
      { ...combatUnit("enemy-unit", 1, 5), location: "base:1", ready: true },
    ];
    const initial = await poll(service, host);
    const start = initial.room.actions.find(
      (row) => row.id === "move-start:group-front:field:0",
    );
    expect(start).toBeDefined();
    const choosing = await act(
      service,
      host,
      initial,
      start!.id,
      "group-start",
    );
    expect(choosing.room.observation?.state.phase).toBe("move");
    expect(
      choosing.room.observation?.state.units
        .filter((unit) => unit.owner === 0)
        .every((unit) => unit.location === "base:0" && unit.ready),
    ).toBe(true);
    expect(
      choosing.room.actions.some((row) => row.id === "move-toggle:group-back"),
    ).toBe(true);
    expect(
      choosing.room.actions.some((row) => row.id === "move-toggle:enemy-unit"),
    ).toBe(false);
    const selected = await act(
      service,
      host,
      choosing,
      "move-toggle:group-back",
      "group-add",
    );
    const confirm = selected.room.actions.find(
      (row) => row.id === "move-confirm",
    )!;
    expect(confirm.unitIds).toEqual(["group-front", "group-back"]);
    expect(
      selected.room.observation?.state.units
        .filter((unit) => unit.owner === 0)
        .every((unit) => unit.location === "base:0" && unit.ready),
    ).toBe(true);
    expect((await poll(service, guest)).room.actions).toEqual([]);
    const moved = await act(
      service,
      host,
      selected,
      confirm.id,
      "group-confirm",
    );
    const actual = storage.records.get(host.roomId)!.room.game!;
    expect(
      moved.room.observation?.state.units
        .filter((unit) => unit.owner === 0)
        .map((unit) => [unit.id, unit.location, unit.ready]),
    ).toEqual([
      ["group-front", "field:0", false],
      ["group-back", "field:0", false],
    ]);
    expect(
      actual.units.find((unit) => unit.id === "enemy-unit")?.location,
    ).toBe("base:1");
    expect(
      actual.units
        .filter((unit) => unit.owner === 0)
        .map((unit) => getMight(actual, unit)),
    ).toEqual([4, 3]);
    expect(moved.room.revision).toBe(initial.room.revision + 3);
  });
  it("uses unpredictable room/seat/invite credentials and stores only token hashes", async () => {
    const storage = new MemoryRoomStorage();
    const response = await new RoomService(storage).request({
      op: "create",
      deckId: "annie",
    });
    const credentials = response.credentials!;
    expect(credentials.roomId).toMatch(/^[a-f0-9]{32}$/);
    expect(credentials.seatToken).toMatch(/^[a-f0-9]{64}$/);
    expect(credentials.inviteToken).toMatch(/^[a-f0-9]{64}$/);
    const stored = storage.records.get(credentials.roomId)!.room;
    expect(stored.host.tokenHash).not.toBe(credentials.seatToken);
    expect(stored.inviteHash).not.toBe(credentials.inviteToken);
    expect(JSON.stringify(stored)).not.toContain(credentials.seatToken);
    expect(JSON.stringify(stored)).not.toContain(credentials.inviteToken!);
    expect(stored.expiresAt - stored.createdAt).toBe(ROOM_TTL_MS);
    expect(response.room.status).toBe("waiting");
  });
  it("resumes a room through a separate stateless service instance", async () => {
    const { storage, host } = await opening();
    const result = await poll(new RoomService(storage), host);
    expect(result.room.status).toBe("active");
    expect(result.room.observation?.viewer).toBe(0);
  });
  it("honors host or guest starting player and gives legal options only to that seat", async () => {
    for (const first of ["host", "guest"] as const) {
      const { service, host, guest } = await opening(first);
      const a = await poll(service, host),
        b = await poll(service, guest);
      const seat = first === "host" ? 0 : 1;
      expect(a.room.observation?.state.currentPlayer).toBe(seat);
      expect(a.room.observation?.state.priorityPlayer).toBe(seat);
      expect((seat === 0 ? a : b).room.actions.length).toBeGreaterThan(0);
      expect((seat === 0 ? b : a).room.actions).toEqual([]);
    }
  });
  it("never exposes full state, future deck/rune order, RNG or opponent hand", async () => {
    const { service, host, guest } = await opening();
    for (const credentials of [host, guest]) {
      const response = await poll(service, credentials),
        state = response.room.observation!.state;
      for (const key of ["seed", "rng", "nextId", "log", "botSettings"])
        expect(state).not.toHaveProperty(key);
      const own = state.players[credentials.seat],
        enemy = state.players[1 - credentials.seat];
      expect(own.hand).toHaveLength(4);
      expect(enemy.hand).toEqual([]);
      expect(enemy.handCount).toBe(4);
      for (const player of state.players) {
        expect(player).not.toHaveProperty("deck");
        expect(player).not.toHaveProperty("runeDeck");
      }
      expect(enemy.deckId).toBe("private");
      expect(enemy).not.toHaveProperty("deckList");
      expect(response).not.toHaveProperty("credentials");
      expect(
        response.room.actions.every(
          (action) => !Object.hasOwn(action, "effects"),
        ),
      ).toBe(true);
    }
  });
  it("shows only own Hidden faces and conceals the other seat's identities", async () => {
    const { storage, service, host, guest } = await opening();
    const game = storage.records.get(host.roomId)!.room.game!;
    game.hidden = [
      {
        id: "own-secret",
        owner: 0,
        cardId: "ogn-199-298",
        location: "field:0",
        hiddenTurn: 0,
      },
      {
        id: "enemy-secret",
        owner: 1,
        cardId: "ogn-219-298",
        location: "field:1",
        hiddenTurn: 0,
      },
    ];
    const a = (await poll(service, host)).room.observation!.state.hidden!,
      b = (await poll(service, guest)).room.observation!.state.hidden!;
    expect(a[0].cardId).toBe("ogn-199-298");
    expect(a[1].cardId).toBe("unknown");
    expect(a[1].id).not.toBe("enemy-secret");
    expect(b[0].cardId).toBe("unknown");
    expect(b[1].cardId).toBe("ogn-219-298");
  });
  it("rejects malformed credentials, an invite used as a seat credential and forged actions", async () => {
    const { service, host } = await opening();
    await expect(
      service.request({
        op: "poll",
        roomId: "../secret",
        seatToken: host.seatToken,
      }),
    ).rejects.toMatchObject({ code: "invalid-request" });
    await expect(
      poll(service, { ...host, seatToken: host.inviteToken! }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      poll(service, { ...host, seatToken: "b".repeat(64) }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    const view = await poll(service, host);
    await expect(
      act(service, host, view, "forged-action"),
    ).rejects.toMatchObject({ code: "illegal-action" });
    expect((await poll(service, host)).room.revision).toBe(view.room.revision);
  });
  it("allows exactly one concurrent join and resumes a retried successful join", async () => {
    const storage = new MemoryRoomStorage(),
      service = new RoomService(storage);
    const created = await service.request({ op: "create", deckId: "annie" }),
      host = created.credentials!;
    const base = {
      op: "join",
      roomId: host.roomId,
      inviteToken: host.inviteToken,
      deckId: "lux",
    };
    const results = await Promise.allSettled([
      service.request({ ...base, seatToken: guestToken }),
      service.request({ ...base, seatToken: "b".repeat(64) }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const winner = results.find(
      (result) => result.status === "fulfilled",
    )! as PromiseFulfilledResult<OnlineResponse>;
    const retry = await service.request({
      ...base,
      seatToken: winner.value.credentials!.seatToken,
    });
    expect(retry.room.revision).toBe(winner.value.room.revision);
    await expect(
      service.request({ ...base, seatToken: "c".repeat(64) }),
    ).rejects.toMatchObject({ code: "room-full" });
  });
  it("prevents host and guest credentials from aliasing the same seat", async () => {
    const storage = new MemoryRoomStorage(),
      service = new RoomService(storage);
    const { credentials: host } = await service.request({
      op: "create",
      deckId: "annie",
    });
    await expect(
      service.request({
        op: "join",
        roomId: host!.roomId,
        inviteToken: host!.inviteToken,
        seatToken: host!.seatToken,
        deckId: "lux",
      }),
    ).rejects.toMatchObject({ code: "invalid-request" });
  });
  it("compares room revision and Blob-style etag so simultaneous actions cannot lose updates", async () => {
    const { service, host } = await opening();
    const current = await poll(service, host);
    const id = current.room.actions[0].id;
    const results = await Promise.allSettled([
      act(service, host, current, id, "first"),
      act(service, host, current, id, "second"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("stale");
    expect((await poll(service, host)).room.revision).toBe(
      current.room.revision + 1,
    );
  });
  it("a retried action receipt returns its current view without executing the move twice", async () => {
    const { service, host } = await opening();
    const current = await poll(service, host);
    const response = await act(
      service,
      host,
      current,
      current.room.actions[0].id,
      "one-request",
    );
    const retry = await act(
      service,
      host,
      current,
      current.room.actions[0].id,
      "one-request",
    );
    expect(retry.room.revision).toBe(response.room.revision);
    expect(retry.room.observation).toEqual(response.room.observation);
  });
  it("rejects wrong-priority moves and stale decisions", async () => {
    const { service, host, guest } = await opening();
    const current = await poll(service, host);
    await expect(
      act(service, guest, current, current.room.actions[0].id),
    ).rejects.toMatchObject({ code: "not-your-turn" });
    await act(service, host, current, current.room.actions[0].id);
    await expect(
      act(
        service,
        host,
        current,
        current.room.actions[0].id,
        "stale-other-request",
      ),
    ).rejects.toMatchObject({ code: "stale" });
  });
  it("validates payment rune preferences before applying a move", async () => {
    const { service, host } = await opening();
    const current = await poll(service, host);
    await expect(
      service.request({
        op: "act",
        roomId: host.roomId,
        seatToken: host.seatToken,
        revision: current.room.revision,
        actionId: current.room.actions[0].id,
        requestId: "bad-payment",
        paymentRuneOrder: ["invented-rune"],
      }),
    ).rejects.toMatchObject({ code: "illegal-action" });
    expect((await poll(service, host)).room.revision).toBe(
      current.room.revision,
    );
  });
  it("validates imported deck counts, card identity, domains and chosen battleground", async () => {
    const service = new RoomService(new MemoryRoomStorage());
    const mutations = [
      (deck: any) => (deck.main[0].count = 1.5),
      (deck: any) => (deck.main[0].cardId = "missing-card"),
      (deck: any) => (deck.legendId = "ogn-049-298"),
      (deck: any) => (deck.runes[0].count = 1),
      (deck: any) => (deck.domains = ["Order"]),
    ];
    for (const mutate of mutations) {
      const deck = structuredClone(decksById.annie);
      mutate(deck);
      await expect(
        service.request({ op: "create", deck }),
      ).rejects.toMatchObject({ code: "invalid-deck" });
    }
    await expect(
      service.request({
        op: "create",
        deckId: "annie",
        battlefieldId: "ogn-049-298",
      }),
    ).rejects.toMatchObject({ code: "invalid-deck" });
    const valid = await service.request({
      op: "create",
      deck: { ...decksById.annie, id: "custom-online" },
    });
    expect(valid.room.status).toBe("waiting");
  });
  it("supports all 13 official precon lists with their actual battlefield options", async () => {
    const service = new RoomService(new MemoryRoomStorage());
    for (const deck of officialPreconDecks) {
      const response = await service.request({
        op: "create",
        deckId: deck.id,
        battlefieldId: (deck.battlefieldIds ?? [deck.battlefieldId]).at(-1),
      });
      expect(response.room.status, deck.id).toBe("waiting");
    }
  });
  it("returns filtered/paginated legal choices and keeps engine-only effects out of responses", async () => {
    const { storage, service, host } = await opening();
    const room = storage.records.get(host.roomId)!.room;
    const raw = getLegalActions(room.game!, 0);
    const response = await service.request({
      op: "poll",
      roomId: host.roomId,
      seatToken: host.seatToken,
      offset: 1,
    });
    expect(response.room.actions[0].id).toBe(raw[1].id);
    const filtered = await service.request({
      op: "poll",
      roomId: host.roomId,
      seatToken: host.seatToken,
      query: raw[0].label,
    });
    expect(
      filtered.room.actions.every((action) =>
        action.label.includes(raw[0].label),
      ),
    ).toBe(true);
    expect(
      filtered.room.actions.every(
        (action) => !Object.hasOwn(action, "effects"),
      ),
    ).toBe(true);
  });
  it("departure closes the room and blocks further joins and actions", async () => {
    const { service, host, guest } = await opening();
    const current = await poll(service, host);
    const departed = await service.request({
      op: "depart",
      roomId: guest.roomId,
      seatToken: guest.seatToken,
      revision: current.room.revision,
    });
    expect(departed.room.status).toBe("departed");
    expect(departed.room.actions).toEqual([]);
    await expect(
      act(service, host, departed, current.room.actions[0].id),
    ).rejects.toMatchObject({ code: "room-closed" });
    await expect(
      service.request({
        op: "join",
        roomId: host.roomId,
        inviteToken: host.inviteToken,
        seatToken: guestToken,
        deckId: "lux",
      }),
    ).rejects.toMatchObject({ code: "room-closed" });
  });
  it("enforces expiry on poll, join, action and departure", async () => {
    let now = 1000;
    const storage = new MemoryRoomStorage(),
      service = new RoomService(storage, () => now);
    const created = await service.request({ op: "create", deckId: "annie" }),
      host = created.credentials!;
    const joined = await service.request({
      op: "join",
      roomId: host.roomId,
      inviteToken: host.inviteToken,
      seatToken: guestToken,
      deckId: "lux",
    });
    now += ROOM_TTL_MS;
    for (const request of [
      { op: "poll" },
      { op: "join", inviteToken: host.inviteToken, deckId: "lux" },
      {
        op: "act",
        revision: joined.room.revision,
        requestId: "expired",
        actionId: "end-turn",
      },
      { op: "depart", revision: joined.room.revision },
    ])
      await expect(
        service.request({
          ...request,
          roomId: host.roomId,
          seatToken: host.seatToken,
        }),
      ).rejects.toMatchObject({ code: "expired" });
  });
  it("commits an authorized opponent-top Predict choice from the live legal engine", async () => {
    const { storage, service, host } = await opening();
    let state = storage.records.get(host.roomId)!.room.game!;
    state.phase = "main";
    state.turn = 5;
    state.currentPlayer = state.priorityPlayer = state.focusPlayer = 0;
    state.units = [
      {
        ...combatUnit("hatch", 0, 2, "sfd-018-221"),
        ready: true,
        location: "base:0",
      },
    ];
    for (const player of state.players) {
      player.hasBegun = true;
      player.mulliganDone = true;
      player.hand = [];
      player.energy = player.power = 20;
      player.runes = [];
      player.deck = ["ogn-049-298", "ogn-009-298"];
    }
    state.players[1].deck = ["ogn-088-298", "ogn-103-298"];
    state.stack = [
      {
        id: "blind-fury-test",
        player: 0,
        cardId: "ogn-025-298",
        kind: "spell",
        effects: [{ type: "special", custom: "wave16:blind-fury" }],
      },
    ];
    for (let index = 0; index < 2; index++)
      state = applyAction(
        state,
        getLegalActions(state, state.priorityPlayer).find(
          (action) => action.id === "pass",
        )!,
      );
    expect(state.pendingChoice?.kind).toBe("predict");
    expect(state.pendingChoice?.effect?.who).toBe("opponent");
    storage.records.get(host.roomId)!.room.game = state;
    const current = await poll(service, host),
      keep = current.room.actions.find(
        (action) => action.id === "choose-predict:keep",
      )!;
    expect(keep).toBeDefined();
    const result = await act(
      service,
      host,
      current,
      keep.id,
      "opponent-top-predict",
    );
    expect(result.room.revision).toBe(current.room.revision + 1);
    expect(result.room.observation?.state.pendingChoice?.kind).toBe("custom");
    expect(
      result.room.actions.some((action) => action.cardId === "ogn-088-298"),
    ).toBe(true);
    let resumed = result;
    for (
      let step = 0;
      step < 6 && resumed.room.observation?.state.pendingChoice;
      step++
    ) {
      const action =
        resumed.room.actions.find((action) => action.category === "play") ??
        resumed.room.actions[0];
      expect(action).toBeDefined();
      resumed = await act(
        service,
        host,
        resumed,
        action.id,
        `finish-enemy-top-${step}`,
      );
    }
    expect(
      resumed.room.observation?.state.units.some(
        (unit) => unit.cardId === "ogn-088-298" && unit.owner === 0,
      ),
    ).toBe(true);
  });
});
