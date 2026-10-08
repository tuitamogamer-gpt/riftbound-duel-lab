import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import { validState } from "../src/persistence";
import { physicalCard, physicalOwner } from "../src/game/objects";
import { act, addGear, chain, fixture, ogn, sfd, unit } from "./fixtures/cards";
import type { GameState, PlayerId } from "../src/game/types";

const ven = (number: number) =>
  cards.find(
    (card) =>
      card.set === "VEN" && card.collectorNumber === number && !card.variant,
  )!.id;
const porobot = ven(58);
const enemy = (actor: PlayerId) => (1 - actor) as PlayerId;

function inventory(state: GameState, owner: PlayerId) {
  const player = state.players[owner];
  const board = new Map(
    [...state.units, ...state.gears]
      .filter((object) => !object.token && physicalOwner(object) === owner)
      .map((object) => [object.id, physicalCard(object)]),
  );
  return [
    ...player.hand,
    ...player.deck,
    ...player.discard,
    ...player.banished,
    ...board.values(),
  ].sort();
}

function cast(state: GameState, cardId: string, targetId?: string) {
  const actor = state.priorityPlayer;
  state.players[actor].hand.push(cardId);
  return act(
    state,
    (action) =>
      action.category === "play" &&
      action.cardId === cardId &&
      (!targetId || action.targetId === targetId),
  );
}

function playedPorobot(actor: PlayerId) {
  let state = fixture();
  state.currentPlayer = state.priorityPlayer = state.focusPlayer = actor;
  state.players[actor].hand = [porobot];
  state = chain(
    act(
      state,
      (action) =>
        action.cardId === porobot && action.locationId === `base:${actor}`,
    ),
  );
  const piece = state.units.find((object) => object.cardId === porobot)!;
  expect(state.gears.find((object) => object.id === piece.id)).toBe(piece);
  return { state, id: piece.id };
}

function expectReturned(state: GameState, actor: PlayerId, id: string) {
  expect(state.units.some((object) => object.id === id)).toBe(false);
  expect(state.gears.some((object) => object.id === id)).toBe(false);
  expect(
    state.players[actor].hand.filter((cardId) => cardId === porobot),
  ).toEqual([porobot]);
  expect(validState(state)).toBe(true);
}

describe("physical board returns", () => {
  it.each([0, 1] as const)(
    "Factory Recall returns one played Porobot and detaches its Equipment, seat %i",
    (actor) => {
      const setup = playedPorobot(actor);
      let state = setup.state;
      addGear(state, 33, "equipment", setup.id, actor);
      state.players[actor].hand.push(sfd(135));
      const before = inventory(state, actor);
      state = chain(
        act(
          state,
          (action) =>
            action.cardId === sfd(135) && action.targetId === setup.id,
        ),
      );
      expectReturned(state, actor, setup.id);
      expect(
        state.gears.find((gear) => gear.id === "equipment")?.attachedTo,
      ).toBeUndefined();
      expect(state.gears.find((gear) => gear.id === "equipment")?.cardId).toBe(
        sfd(33),
      );
      expect(inventory(state, actor)).toEqual(before);
    },
  );

  it.each([0, 1] as const)(
    "Downwell returns a played Porobot once in its simultaneous group, seat %i",
    (actor) => {
      const setup = playedPorobot(actor);
      let state = setup.state;
      addGear(state, 33, "equipment", setup.id, actor);
      state.units.push(unit("other", enemy(actor), `base:${enemy(actor)}`));
      state.players[actor].hand.push(sfd(147));
      const before = state.players.map((player) => inventory(state, player.id));
      state = chain(act(state, (action) => action.cardId === sfd(147)));
      expectReturned(state, actor, setup.id);
      expect(state.units).toEqual([]);
      expect(state.gears).toEqual([]);
      expect(
        state.players.map((player) => inventory(state, player.id)),
      ).toEqual(before);
    },
  );

  it.each([0, 1] as const)(
    "Pack of Wonders returns its played hybrid choice once, seat %i",
    (actor) => {
      const setup = playedPorobot(actor);
      let state = chain(cast(setup.state, ogn(181)));
      const pack = state.gears.find((gear) => gear.cardId === ogn(181))!;
      const before = inventory(state, actor);
      state = act(state, (action) => action.sourceId === pack.id);
      state = act(state, `choose-board:${setup.id}`);
      state = chain(act(state, "choose-board:done"));
      expectReturned(state, actor, setup.id);
      expect(state.gears.find((gear) => gear.id === pack.id)?.ready).toBe(
        false,
      );
      expect(inventory(state, actor)).toEqual(before);
    },
  );

  it.each([0, 1] as const)(
    "Quartermaster pays its required return cost with one physical Porobot, seat %i",
    (actor) => {
      const setup = playedPorobot(actor);
      let state = setup.state;
      state.players[actor].hand.push(sfd(44));
      const before = inventory(state, actor);
      const energy = state.players[actor].energy;
      state = act(
        state,
        (action) =>
          action.cardId === sfd(44) && action.costSourceId === setup.id,
      );
      expectReturned(state, actor, setup.id);
      expect(state.units.some((object) => object.cardId === sfd(44))).toBe(
        true,
      );
      expect(state.players[actor].energy).toBe(energy - 3);
      expect(inventory(state, actor)).toEqual(before);
    },
  );

  it("Factory Recall returns transferred Glowstone to its original owner's hand", () => {
    let state = chain(cast(fixture(), ven(133)));
    const glowstone = state.gears.find((gear) => gear.cardId === ven(133))!;
    state = chain(
      act(
        state,
        (action) =>
          action.sourceId === glowstone.id &&
          action.label.endsWith(": Empower"),
      ),
    );
    state = act(
      state,
      (action) =>
        action.sourceId === glowstone.id &&
        action.label.includes("Give Glowstone"),
    );
    state = act(act(state, "pass"), "pass");
    state = chain(act(state, "choose-custom:glowstone:1"));
    expect(state.gears.find((gear) => gear.id === glowstone.id)).toMatchObject({
      owner: 1,
      originalOwner: 0,
    });
    state.players[0].hand.push(sfd(135));
    const before = state.players.map((player) => inventory(state, player.id));
    state = chain(
      act(
        state,
        (action) =>
          action.cardId === sfd(135) && action.targetId === glowstone.id,
      ),
    );
    expect(state.players[0].hand).toEqual([ven(133)]);
    expect(state.players[1].hand).toEqual([]);
    expect(state.players.map((player) => inventory(state, player.id))).toEqual(
      before,
    );
  });

  it("Downwell returns a controlled copied unit's original card to its physical owner", () => {
    let state = fixture();
    state.units = [
      {
        ...unit("copy", 0),
        cardId: ogn(52),
        originalCardId: ogn(49),
        originalOwner: 1,
      },
    ];
    state.players[0].hand = [sfd(147)];
    const before = state.players.map((player) => inventory(state, player.id));
    state = chain(act(state, (action) => action.cardId === sfd(147)));
    expect(state.players[0].hand).toEqual([]);
    expect(state.players[1].hand).toEqual([ogn(49)]);
    expect(state.players.map((player) => inventory(state, player.id))).toEqual(
      before,
    );
  });

  it.each([sfd(135), sfd(147), sfd(44)])(
    "%s removes returned Gold tokens without creating a card in hand",
    (cardId) => {
      let state = fixture();
      state.gears = [
        { id: "gold", cardId: "sfd-t03", owner: 0, ready: false, token: true },
      ];
      state.players[0].hand = [cardId];
      state = chain(
        act(
          state,
          (action) =>
            action.cardId === cardId &&
            (cardId !== sfd(135) || action.targetId === "gold") &&
            (cardId !== sfd(44) || action.costSourceId === "gold"),
        ),
      );
      expect(state.gears.some((gear) => gear.id === "gold")).toBe(false);
      expect(state.players[0].hand).toEqual([]);
      expect(state.players[0].discard).not.toContain("sfd-t03");
    },
  );

  it("returning copied Equipment restores its bearer before later death checks", () => {
    let state = fixture();
    state.units = [
      {
        ...unit("bearer"),
        cardId: ogn(52),
        originalCardId: ogn(49),
        copyEffects: [{ sourceId: "spectacles", cardId: ogn(52) }],
      },
    ];
    state.gears = [
      {
        id: "spectacles",
        cardId: ven(137),
        owner: 0,
        ready: true,
        attachedTo: "bearer",
      },
    ];
    state.units[0].gear = ["spectacles"];
    state = chain(cast(state, sfd(135), "spectacles"));
    expect(state.units[0]).toMatchObject({
      cardId: ogn(49),
      gear: [],
      copyEffects: [],
    });
    expect(state.players[0].hand).toEqual([ven(137)]);
  });
});
