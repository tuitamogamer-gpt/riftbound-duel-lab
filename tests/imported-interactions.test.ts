import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import { getLegalActions, serializeGame } from "../src/game/engine";
import {
  applyDecision,
  decisionFor,
  getDecisionRequest,
  validateDecision,
} from "../src/game/ai/decisions";
import { parseSession, validState } from "../src/persistence";
import { addGear, fixture, ogn, sfd, unit } from "./fixtures/cards";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
} from "../src/game/types";

const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;

/** Physical cards remain the same when their controller, text or type changes. */
function inventory(state: GameState, owner: PlayerId) {
  const player = state.players[owner];
  const board = new Map(
    [...state.units, ...state.gears]
      .filter(
        (piece) =>
          !piece.token && (piece.originalOwner ?? piece.owner) === owner,
      )
      .map((piece) => [piece.id, piece.originalCardId ?? piece.cardId]),
  );
  return [
    ...player.deck,
    ...player.hand,
    ...player.discard,
    ...player.banished,
    ...(player.championAvailable ? [player.championId] : []),
    ...board.values(),
    ...state.stack
      .filter(
        (item) =>
          item.kind === "spell" &&
          (item.originalOwner ?? item.player) === owner,
      )
      .map((item) => item.cardId),
    ...(state.resolving ?? [])
      .filter((item) => (item.originalOwner ?? item.player) === owner)
      .map((item) => item.cardId),
    ...(state.pendingPlays ?? [])
      .filter((item) => item.player === owner)
      .map((item) => item.cardId),
    ...(state.hidden ?? [])
      .filter((item) => item.owner === owner)
      .map((item) => item.cardId),
  ].sort();
}

function take(
  state: GameState,
  select: string | ((action: GameAction) => boolean),
) {
  const before = serializeGame(state);
  const request = getDecisionRequest(state)!;
  const action = getLegalActions(state, state.priorityPlayer).find(
    typeof select === "string" ? (action) => action.id === select : select,
  );
  expect(
    action,
    `Missing action in ${state.phase}: ${String(select)}`,
  ).toBeDefined();
  const decision = decisionFor(request, action!);
  expect(validateDecision(state, request, decision).valid).toBe(true);
  const result = applyDecision(state, request, decision);
  expect(
    serializeGame(state),
    "Queries and atomic decisions preserve their input",
  ).toBe(before);
  expect(result.revision).toBe((state.revision ?? 0) + 1);
  expect(validState(result)).toBe(true);
  return result;
}

function resume(state: GameState) {
  const restored = parseSession(
    JSON.stringify({ match: state, review: null }),
  ).match;
  expect(restored).toEqual(state);
  expect(getLegalActions(restored!, state.priorityPlayer)).toEqual(
    getLegalActions(state, state.priorityPlayer),
  );
  return restored!;
}

function settle(state: GameState) {
  for (
    let step = 0;
    step < 80 &&
    (state.stack.length ||
      state.pendingChoice ||
      state.pendingTriggers?.length);
    step++
  ) {
    const legal = getLegalActions(state, state.priorityPlayer);
    const action = state.pendingChoice
      ? legal[0]
      : legal.find((a) => a.id === "pass");
    expect(action, `Resolution stalled in ${state.phase}`).toBeDefined();
    state = take(state, action!.id);
  }
  expect(state.pendingChoice).toBeNull();
  expect(state.stack).toEqual([]);
  return state;
}

function effect(
  state: GameState,
  effects: Effect[],
  sourceId?: string,
  targetId?: string,
) {
  state.stack.push({
    id: `interaction-${state.nextId++}`,
    kind: "ability",
    cardId: ogn(49),
    player: 0,
    effects,
    sourceId,
    targetId,
  });
  return take(take(state, "pass"), "pass");
}

describe("imported card families interacting through atomic saved decisions", () => {
  it("a repeated spell uses copied Annie text on both targets and enters trash once after resume", () => {
    let state = fixture();
    state.units = [
      { ...unit("annie"), cardId: "ogs-001-024" },
      unit("first", 1, "field:0", 20),
      unit("second", 1, "field:1", 20),
    ];
    addGear(state, 59, "svell");
    addGear(state, 78, "portal");
    state.players[0].hand = [ogn(9)];
    const expected = [inventory(state, 0), inventory(state, 1)];
    state = settle(effect(state, [{ type: "equip" }], "svell", "annie"));
    state = settle(take(state, (action) => action.sourceId === "portal"));
    const energy = state.players[0].energy;
    state = take(
      state,
      (action) =>
        action.cardId === ogn(9) &&
        action.repeated === true &&
        action.targetId === "first" &&
        action.repeatedTargetId === "second",
    );
    expect(state.players[0].energy).toBe(energy - 2);
    expect(state.players[0].repeatGrants).toEqual([]);
    expect(state.players[0].discard).not.toContain(ogn(9));
    const request = getDecisionRequest(state)!;
    const decision = request.fallbackDecision;
    const restored = resume(state);
    state = applyDecision(restored, request, decision);
    const after = serializeGame(state);
    expect(() => applyDecision(state, request, decision)).toThrow(
      "Stale decision",
    );
    expect(serializeGame(state)).toBe(after);
    state = settle(state);
    expect(
      state.units
        .filter((piece) => piece.owner === 1)
        .map((piece) => piece.damage),
    ).toEqual([5, 5]);
    expect(state.players[0].discard.filter((id) => id === ogn(9))).toHaveLength(
      1,
    );
    expect([inventory(state, 0), inventory(state, 1)]).toEqual(expected);
  });

  it("Mirror Image and copied Zilean text create bounded, distinct tokens after a saved replacement choice", () => {
    let state = fixture();
    state.units = [
      { ...unit("zilean", 0, "field:0"), cardId: unl(86) },
      unit("model", 1, "base:1"),
    ];
    addGear(state, 59, "svell");
    state.players[0].hand = [unl(200), unl(200)];
    const expected = [inventory(state, 0), inventory(state, 1)];
    state = settle(effect(state, [{ type: "equip" }], "svell", "zilean"));
    state = take(
      state,
      (action) => action.cardId === unl(200) && action.targetId === "model",
    );
    state = take(take(state, "pass"), "pass");
    expect(state.pendingChoice).not.toBeNull();
    state = settle(resume(state));
    const firstTokens = state.units.filter((piece) => piece.token);
    expect(firstTokens).toHaveLength(3);
    expect(new Set(firstTokens.map((piece) => piece.id)).size).toBe(3);
    expect(
      firstTokens.every(
        (piece) => piece.ready && piece.temporary && piece.cardId === ogn(49),
      ),
    ).toBe(true);
    state = settle(
      take(
        state,
        (action) => action.cardId === unl(200) && action.targetId === "model",
      ),
    );
    expect(state.units.filter((piece) => piece.token)).toHaveLength(4);
    expect([inventory(state, 0), inventory(state, 1)]).toEqual(expected);
  });

  it("a copied unit keeps its original physical card and equipment when Guardian Angel replaces Smite", () => {
    let state = fixture();
    state.units = [
      unit("recipient", 1, "field:0", 2),
      { ...unit("model", 1, "base:1", 2), cardId: ogn(51) },
    ];
    state.gears = [{ id: "glasses", cardId: ven(137), owner: 1, ready: true }];
    addGear(state, 51, "angel", undefined, 1);
    state.players[0].hand = [unl(7)];
    const expected = [inventory(state, 0), inventory(state, 1)];
    // Attach under the affected player's priority, then return to the turn's actor.
    state.priorityPlayer = state.currentPlayer = state.focusPlayer = 1;
    state = take(
      state,
      (action) =>
        action.sourceId === "glasses" && action.targetId === "recipient",
    );
    state = take(take(state, "pass"), "pass");
    state = take(state, "choose-custom:spectacles:model");
    state = settle(state);
    state = settle(
      take(
        state,
        (action) =>
          action.sourceId === "angel" && action.targetId === "recipient",
      ),
    );
    state.priorityPlayer = state.currentPlayer = state.focusPlayer = 0;
    state = take(
      state,
      (action) => action.cardId === unl(7) && action.targetId === "recipient",
    );
    state = take(take(state, "pass"), "pass");
    expect(state.pendingChoice?.player).toBe(1);
    state = take(resume(state), "choose-custom:death:guardian:angel");
    state = settle(state);
    expect(state.units.find((piece) => piece.id === "recipient")).toMatchObject(
      {
        originalCardId: ogn(49),
        cardId: ogn(51),
        location: "base:1",
        damage: 0,
        ready: false,
        gear: ["glasses"],
      },
    );
    expect(state.players[1].discard).toEqual([sfd(51)]);
    expect(state.players[1].banished).toEqual([]);
    expect([inventory(state, 0), inventory(state, 1)]).toEqual(expected);
  });

  it("reviving a hybrid through a saved instructed play restores one card in both board indexes", () => {
    let state = fixture();
    state.players[0].discard = [ven(58)];
    state.players[0].hand = [ogn(198)];
    const expected = [inventory(state, 0), inventory(state, 1)];
    state = take(state, (action) => action.cardId === ogn(198));
    state = take(take(state, "pass"), "pass");
    expect(state.pendingChoice?.kind).toBe("effectPlay");
    expect([inventory(state, 0), inventory(state, 1)]).toEqual(expected);
    state = take(
      resume(state),
      (action) => action.category === "play" && action.cardId === ven(58),
    );
    state = settle(state);
    const hybrid = state.units.find((piece) => piece.cardId === ven(58))!;
    expect(state.gears.find((piece) => piece.id === hybrid.id)).toBe(hybrid);
    state = resume(state);
    expect(state.gears.find((piece) => piece.id === hybrid.id)).toBe(
      state.units.find((piece) => piece.id === hybrid.id),
    );
    state = settle(
      effect(
        state,
        [{ type: "kill", target: "anyGear" }],
        undefined,
        hybrid.id,
      ),
    );
    expect(state.units).toEqual([]);
    expect(state.gears).toEqual([]);
    expect(
      state.players[0].discard.filter((id) => id === ven(58)),
    ).toHaveLength(1);
    expect([inventory(state, 0), inventory(state, 1)]).toEqual(expected);
  });
});
