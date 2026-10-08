import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import { getLegalActions } from "../src/game/engine";
import { physicalCard, physicalOwner } from "../src/game/objects";
import { validState } from "../src/persistence";
import { act, chain, fixture, ogn, sfd, unit } from "./fixtures/cards";
import type { GameState, PlayerId } from "../src/game/types";

const verdict = "unl-204-219";
const ven = (number: number) =>
  cards.find(
    (card) =>
      card.set === "VEN" && card.collectorNumber === number && !card.variant,
  )!.id;
const enemy = (actor: PlayerId) => (1 - actor) as PlayerId;
function cast(state: GameState, cardId: string, targetId?: string) {
  const actor = state.priorityPlayer;
  state.players[actor].hand.push(cardId);
  return act(
    state,
    (action) =>
      action.category === "play" &&
      action.cardId === cardId &&
      (!targetId || action.targetId === targetId) &&
      (!action.locationId || action.locationId === `base:${actor}`),
  );
}
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
function copiedShowdown(owner: PlayerId) {
  let state = fixture();
  state.currentPlayer = state.priorityPlayer = state.focusPlayer = owner;
  state = chain(cast(state, ven(58)));
  const recipient = state.units.find((object) => object.cardId === ven(58))!;
  state = chain(cast(state, ogn(51)));
  const model = state.units.find((object) => object.cardId === ogn(51))!;
  state = chain(cast(state, ven(137)));
  const glasses = state.gears.find((object) => object.cardId === ven(137))!;
  state = act(state, `equip:${glasses.id}:${recipient.id}`);
  state = act(act(state, "pass"), "pass");
  state = chain(act(state, `choose-custom:spectacles:${model.id}`));
  state = chain(cast(state, sfd(204)));
  state = act(state, `move-start:${recipient.id}:field:0`);
  state = act(state, "move-confirm");
  state = act(state, "pass");
  expect(state.priorityPlayer).toBe(enemy(owner));
  return { state, id: recipient.id, glassesId: glasses.id };
}
function reachVerdict(state: GameState, id: string) {
  state = cast(state, verdict, id);
  for (let i = 0; i < 10 && !state.pendingChoice; i++)
    state = act(state, "pass");
  expect(state.pendingChoice).not.toBeNull();
  return state;
}
function place(state: GameState, where: "top" | "bottom") {
  expect(
    getLegalActions(state, state.priorityPlayer).some((action) =>
      action.label.endsWith(`on ${where}`),
    ),
  ).toBe(true);
  return chain(act(state, (action) => action.label.endsWith(`on ${where}`)));
}

describe("Keeper's Verdict preserves physical cards", () => {
  it.each([
    [0, "top"],
    [0, "bottom"],
    [1, "top"],
    [1, "bottom"],
  ] as const)(
    "returns a legally copied Porobot to its original face, seat %i, %s",
    (owner, where) => {
      const setup = copiedShowdown(owner);
      expect(
        setup.state.units.find((object) => object.id === setup.id)?.cardId,
      ).toBe(ogn(51));
      const before = setup.state.players.map((player) =>
        inventory(setup.state, player.id),
      );
      let state = reachVerdict(setup.state, setup.id);
      expect(state.pendingChoice?.player).toBe(owner);
      expect(
        getLegalActions(state, owner).map((action) => action.label),
      ).toEqual([
        "Put Patched Porobot on top",
        "Put Patched Porobot on bottom",
      ]);
      state = place(state, where);
      expect(
        where === "top"
          ? state.players[owner].deck[0]
          : state.players[owner].deck.at(-1),
      ).toBe(ven(58));
      expect(state.units.some((object) => object.id === setup.id)).toBe(false);
      expect(state.gears.some((object) => object.id === setup.id)).toBe(false);
      expect(
        state.gears.find((object) => object.id === setup.glassesId)?.attachedTo,
      ).toBeUndefined();
      // The opposing caster introduced only Verdict after this inventory snapshot.
      expect(
        state.players.map((player) =>
          inventory(state, player.id).filter((cardId) => cardId !== verdict),
        ),
      ).toEqual(before);
      expect(validState(state)).toBe(true);
    },
  );

  it.each(["top", "bottom"] as const)(
    "a unit legally taken by Nocturne gives its physical owner the %s choice and card",
    (where) => {
      const setup = copiedShowdown(0);
      let state = chain(cast(setup.state, ogn(203), setup.id));
      expect(
        state.units.find((object) => object.id === setup.id),
      ).toMatchObject({
        owner: 1,
        originalOwner: 0,
        cardId: ogn(51),
        originalCardId: ven(58),
        location: "base:1",
      });
      if (state.phase === "showdown") state = act(act(state, "pass"), "pass");
      expect(state.currentPlayer).toBe(0);
      state = chain(act(state, "end-turn"));
      expect(state.currentPlayer).toBe(1);
      state.players[1].energy = state.players[1].power = 30;
      state = chain(cast(state, sfd(204)));
      state = act(state, `move-start:${setup.id}:field:1`);
      state = act(state, "move-confirm");
      state = act(state, "pass");
      expect(state.priorityPlayer).toBe(0);
      state.players[0].energy = state.players[0].power = 30;
      const before = state.players.map((player) => inventory(state, player.id));
      state = reachVerdict(state, setup.id);
      expect(state.pendingChoice?.player).toBe(0);
      expect(state.priorityPlayer).toBe(0);
      state = place(state, where);
      expect(
        where === "top"
          ? state.players[0].deck[0]
          : state.players[0].deck.at(-1),
      ).toBe(ven(58));
      expect(
        state.players.map((player) =>
          inventory(state, player.id).filter((cardId) => cardId !== verdict),
        ),
      ).toEqual(before);
      expect(validState(state)).toBe(true);
    },
  );

  it.each(["top", "bottom"] as const)(
    "a copied hybrid Reflection token disappears instead of becoming a deck card, %s",
    (where) => {
      let state = fixture();
      const reflection = {
        ...unit("reflection", 1, "field:0"),
        cardId: ven(58),
        originalCardId: "token-reflection",
        token: true,
      };
      state.units = [reflection];
      state.gears = [reflection];
      const before = state.players[1].deck.slice();
      state = place(reachVerdict(state, reflection.id), where);
      expect(state.players[1].deck).toEqual(before);
      expect(state.units.some((object) => object.id === reflection.id)).toBe(
        false,
      );
      expect(state.gears.some((object) => object.id === reflection.id)).toBe(
        false,
      );
      expect(validState(state)).toBe(true);
    },
  );
});
