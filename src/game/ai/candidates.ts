import { getCard } from "../../data/cards";
import { getGroupMoveAction, getMight, iterateLegalActions } from "../engine";
import { getReferenceAction } from "../bot-reference";
import type { GameAction, GameState, PlayerId, Unit } from "../types";
import { getScript } from "../scripts";
import { SearchBudget, type Profile } from "./config";
import { fallbackAction, optionKey } from "./decisions";

/** Progressive groups: singleton, pair, then two growing orders. Never split a group in simulation. */
export function* movementCandidates(
  s: GameState,
  p: PlayerId,
): Generator<GameAction> {
  if (s.phase !== "main" || s.stack.length || s.currentPlayer !== p) return;
  function* at(f: (typeof s.fields)[number]["id"]) {
    const units = s.units.filter(
      (u) => u.owner === p && u.ready && getGroupMoveAction(s, p, [u.id], f),
    );
    const seen = new Set<string>();
    function* group(chosen: Unit[]) {
      const action = getGroupMoveAction(
        s,
        p,
        chosen.map((u) => u.id),
        f,
      );
      if (action && !seen.has(action.id)) {
        seen.add(action.id);
        yield action;
      }
    }
    const orders = [
      [...units].sort((a, b) => getMight(s, a) - getMight(s, b)),
      [...units].sort((a, b) => getMight(s, b) - getMight(s, a)),
    ];
    // Grow complete formations alongside individual movers; large boards must
    // not spend the whole budget enumerating pairs before a useful group exists.
    for (let i = 0; i < units.length; i++) {
      yield* group([units[i]]);
      for (const order of orders) yield* group(order.slice(0, i + 2));
    }
    for (let i = 0; i < units.length; i++)
      for (let j = i + 1; j < units.length; j++)
        yield* group([units[i], units[j]]);
  }
  const locations = [...s.fields.map((f) => f.id), `base:${p}` as const].map(
    at,
  );
  while (locations.length) {
    for (let i = 0; i < locations.length;) {
      const next = locations[i].next();
      if (next.done) locations.splice(i, 1);
      else {
        yield next.value;
        i++;
      }
    }
  }
}
export function* paymentCandidates(
  s: GameState,
  a: GameAction,
): Generator<GameAction> {
  yield a;
  if (
    !["play", "ability", "move"].includes(a.category) ||
    s.players[a.player].runes.length < 2
  )
    return;
  const runes = s.players[a.player].runes;
  const original = runes.map((r) => r.id).join(",");
  const seen = new Set([original]);
  for (const domain of [...new Set(runes.map((r) => r.domain))]) {
    const order = [...runes]
      .sort((a, b) => Number(a.domain === domain) - Number(b.domain === domain))
      .map((r) => r.id);
    if (!seen.has(order.join(","))) {
      seen.add(order.join(","));
      yield { ...a, paymentRuneOrder: order };
    }
  }
}
export function candidates(
  s: GameState,
  p: PlayerId,
  budget: SearchBudget,
  limit = 100,
): { actions: GameAction[]; complete: boolean } {
  const actions: GameAction[] = [],
    keys = new Set<string>();
  const add = (a: GameAction) => {
    const key = optionKey(a);
    if (!keys.has(key)) {
      keys.add(key);
      actions.push(a);
    }
  };
  const fallback = fallbackAction(s, p);
  if (fallback) add(fallback);
  // Interleave normal actions and grouped movement, so large hands cannot starve movement.
  const generators = [iterateLegalActions(s, p), movementCandidates(s, p)];
  let done = 0;
  while (done < generators.length && actions.length < limit) {
    done = 0;
    for (const generator of generators) {
      if (!budget.take(true)) return { actions, complete: false };
      const next = generator.next();
      if (next.done) {
        done++;
        continue;
      }
      if (next.value.id.startsWith("move-start:")) continue;
      add(next.value);
    }
  }
  return { actions, complete: done === generators.length };
}
export function rankCandidates(
  s: GameState,
  actions: GameAction[],
  profile: Profile,
): GameAction[] {
  const p = s.priorityPlayer;
  const reference = getReferenceAction(
    s,
    p,
    actions.filter((a) => !a.id.startsWith("move-group:")),
  );
  const rate = (a: GameAction) => {
    let n = a.id === reference?.id ? 20 : 0;
    if (s.players[1 - p].points >= 6) {
      const threatensHold = s.fields
        .filter((f) => f.controller !== null && f.controller !== p)
        .map((f) => f.id);
      if (
        (a.targetId ?? "")
          .split("~")
          .some(
            (id) =>
              threatensHold.includes(id as "field:0") ||
              s.units.some(
                (u) =>
                  u.id === id &&
                  u.owner !== p &&
                  threatensHold.includes(u.location),
              ),
          )
      )
        n += 80;
    }
    if (a.id.startsWith("move-group:")) {
      const field = s.fields.find((f) => f.id === a.locationId);
      n += field && field.controller !== p ? 24 : -10;
      n -= (a.unitIds?.length ?? 1) * 0.2;
      if (field?.controller !== null && field?.controller !== p)
        n += s.players[1 - p].points * 2;
    }
    if (a.category === "play" && a.cardId) {
      const c = getCard(a.cardId),
        sc = getScript(a.cardId);
      if (c.type === "Unit") n += 8 + Math.min(c.might ?? 0, 5);
      if (
        sc?.spell?.some((e) =>
          ["draw", "ready", "channel", "score", "kill", "damageAll"].includes(
            e.type,
          ),
        )
      )
        n += 8;
      if (profile === "aggressive" && c.type === "Unit" && (c.energy ?? 0) <= 3)
        n += 1;
    }
    return n;
  };
  return [...actions]
    .map((a, i) => ({ a, i, score: rate(a) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.a);
}
/** Reserve families (setup, movement, reaction, pass) before filling the beam. */
export function diverse(actions: GameAction[], width: number) {
  const picked: GameAction[] = [],
    kinds = new Set<string>();
  for (const a of actions) {
    const kind = `${a.category}:${a.locationId ?? ""}`;
    if (!kinds.has(kind)) {
      picked.push(a);
      kinds.add(kind);
    }
    if (picked.length >= Math.floor(width / 2)) break;
  }
  for (const a of actions) {
    if (!picked.includes(a)) picked.push(a);
    if (picked.length >= width) break;
  }
  return picked;
}
