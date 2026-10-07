import { expect } from "vitest";
import { applyAction, getLegalActions } from "../../src/game/engine";
import { combatUnit, createCombatFixture } from "./combat";
import type {
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../../src/game/types";
export const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
export const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
export function fixture() {
  const s = createCombatFixture();
  s.phase = "main";
  s.combat = null;
  s.units = [];
  s.gears = [];
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  for (const p of s.players) {
    p.legendId = ogn(259);
    p.hand = [];
    p.deck = Array(30).fill(ogn(49));
    p.discard = [];
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.legendUsedTurn = -1;
  }
  s.fields.forEach((f) => {
    f.cardId = ogn(278);
    f.controller = null;
  });
  return s;
}
export function unit(
  id: string,
  owner: PlayerId = 0,
  location: Unit["location"] = "base:0",
  might = 8,
) {
  return { ...combatUnit(id, owner, might, ogn(49)), location, ready: true };
}
export function act(s: GameState, find: string | ((a: GameAction) => boolean)) {
  const actions = getLegalActions(s, s.priorityPlayer);
  const a = actions.find(
    typeof find === "string" ? (a) => a.id === find : find,
  );
  expect(a, actions.map((a) => a.id).join("\n")).toBeDefined();
  return applyAction(s, a!);
}
export function chain(s: GameState) {
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const a = s.pendingChoice
      ? actions[0]
      : actions.find((a) => a.id === "pass");
    expect(a).toBeDefined();
    s = applyAction(s, a!);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
export function addGear(
  s: GameState,
  n: number,
  id = `g${n}`,
  attachedTo?: string,
  owner: PlayerId = 0,
) {
  s.gears.push({ id, cardId: sfd(n), owner, ready: true, attachedTo });
  if (attachedTo) s.units.find((u) => u.id === attachedTo)!.gear.push(id);
}
