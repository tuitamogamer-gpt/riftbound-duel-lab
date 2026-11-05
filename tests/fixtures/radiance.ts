import { expect } from "vitest";
import { applyAction, getLegalActions } from "../../src/game/engine";
import type {
  Effect,
  GameAction,
  GameState,
  Gear,
  LocationId,
  PlayerId,
} from "../../src/game/types";
import { act, chain } from "./cards";

export const rad = (n: number) => `rad-${String(n).padStart(3, "0")}-167`;
export const byId = (s: GameState, id: string) =>
  s.units.find((u) => u.id === id)!;
export const actions = (s: GameState) => getLegalActions(s, s.priorityPlayer);

/** Pass through showdowns, combat and choices, taking the first option. */
export function settle(s: GameState) {
  for (
    let i = 0;
    i < 200 &&
    (s.combat ||
      s.stack.length ||
      s.pendingChoice ||
      s.pendingTriggers?.length);
    i++
  ) {
    const options = actions(s);
    s = applyAction(
      s,
      s.pendingChoice
        ? options[0]
        : (options.find((a) => a.id === "pass") ?? options[0]),
    );
  }
  expect(s.combat).toBeNull();
  return s;
}
/** Take the first action whose label contains the text. */
export const choose = (s: GameState, text: string) =>
  act(s, (a) => a.label.includes(text));
/** Pass priority (taking first options) until an action label appears. */
export function until(s: GameState, text: string) {
  for (let i = 0; i < 60; i++) {
    const options = actions(s);
    if (options.some((a) => a.label.includes(text))) return choose(s, text);
    s = applyAction(
      s,
      s.pendingChoice
        ? options[0]
        : (options.find((a) => a.id === "pass") ?? options[0]),
    );
  }
  throw new Error(`No action containing: ${text}`);
}
export const play = (
  s: GameState,
  cardId: string,
  match: Partial<Pick<GameAction, "locationId" | "targetId">> & {
    id?: string;
  } = {},
) =>
  act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (match.locationId === undefined || a.locationId === match.locationId) &&
      (match.targetId === undefined || a.targetId === match.targetId) &&
      (match.id === undefined || a.id.includes(match.id)) &&
      (match.id !== undefined || !a.id.includes("|showoff:")),
  );
/** Resolve a free-standing ability, as if a card's trigger used it. */
export function resolveEffects(
  s: GameState,
  cardId: string,
  effects: Effect[],
  {
    player = 0,
    sourceId,
    targetId,
    locationId,
  }: {
    player?: PlayerId;
    sourceId?: string;
    targetId?: string;
    locationId?: LocationId;
  } = {},
) {
  s.stack.push({
    id: `test-${s.nextId++}`,
    kind: "ability",
    cardId,
    player,
    effects,
    sourceId,
    targetId,
    locationId,
  });
  s.priorityPlayer = player;
  return chain(s);
}
export const deployGear = (
  s: GameState,
  cardId: string,
  at: LocationId,
  owner: PlayerId = 0,
  id = `g-${cardId}-${s.gears.length}`,
): Gear => {
  const gear: Gear = {
    id,
    cardId,
    owner,
    ready: true,
    deployedAt: at,
    ...(cardId.startsWith("token-") ? { token: true } : {}),
  };
  s.gears.push(gear);
  return gear;
};
export const hide = (
  s: GameState,
  cardId: string,
  location: LocationId = "field:0",
  owner: PlayerId = 0,
  id = `h-${(s.hidden ?? []).length}`,
) => {
  (s.hidden ??= []).push({
    id,
    cardId,
    owner,
    location,
    hiddenTurn: s.turn - 1,
  });
  return id;
};
export const goldCount = (s: GameState, owner: PlayerId = 0) =>
  s.gears.filter((g) => g.owner === owner && g.cardId === "sfd-t03").length;
