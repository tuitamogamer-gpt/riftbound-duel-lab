import type { GameState } from "./game/types";
import type { Review } from "./components/StepFlow";
import { cardsById } from "./data/cards";
import { getLegalActions } from "./game/engine";

export const SAVE_KEY = "riftbound-duel-save-v1";
export interface SavedSession {
  match: GameState | null;
  review: Review | null;
}
const isObject = (x: unknown): x is Record<string, any> =>
  Boolean(x && typeof x === "object" && !Array.isArray(x));
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const nonnegative = (x: unknown) => finite(x) && x >= 0;
const playerId = (x: unknown) => x === 0 || x === 1;
const optionalString = (x: unknown) => x === undefined || typeof x === "string";
const cardId = (x: unknown) => typeof x === "string" && Boolean(cardsById[x]);
const stringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((id) => typeof id === "string");
const phase = (x: unknown) =>
  [
    "mulligan",
    "main",
    "showdown",
    "move",
    "damage",
    "choice",
    "ended",
  ].includes(x as string);
const location = (x: unknown) =>
  ["base:0", "base:1", "field:0", "field:1"].includes(x as string);
const field = (x: unknown) => x === "field:0" || x === "field:1";
const domain = (x: unknown) =>
  ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].includes(x as string);
const effects = (x: unknown): boolean =>
  Array.isArray(x) &&
  x.every(
    (e) =>
      isObject(e) &&
      [
        "draw",
        "damage",
        "heal",
        "buff",
        "might",
        "kill",
        "recall",
        "stun",
        "ready",
        "readyRunes",
        "exhaust",
        "token",
        "channel",
        "energy",
        "recycle",
        "discard",
        "drawDiscard",
        "damageAll",
        "mightAll",
        "buffAll",
        "healAll",
        "counter",
        "moveTarget",
        "equip",
        "mill",
        "score",
        "retrieve",
        "assault",
        "duel",
      ].includes(e.type) &&
      (e.amount === undefined || finite(e.amount)) &&
      optionalString(e.target),
  );
const combat = (x: unknown): boolean =>
  isObject(x) &&
  field(x.fieldId) &&
  playerId(x.attacker) &&
  playerId(x.defender) &&
  x.attacker !== x.defender &&
  ["priority", "assign"].includes(x.stage) &&
  playerId(x.assigningPlayer) &&
  ["total", "remaining"].every(
    (k) => Array.isArray(x[k]) && x[k].length === 2 && x[k].every(nonnegative),
  ) &&
  Array.isArray(x.assignments) &&
  x.assignments.length === 2 &&
  x.assignments.every(
    (a: unknown) => isObject(a) && Object.values(a).every(nonnegative),
  );
const move = (x: unknown): boolean =>
  isObject(x) &&
  playerId(x.player) &&
  location(x.from) &&
  location(x.to) &&
  stringArray(x.unitIds);
const choice = (x: unknown): boolean =>
  isObject(x) &&
  playerId(x.player) &&
  ["token", "trigger"].includes(x.kind) &&
  nonnegative(x.remaining) &&
  phase(x.returnPhase) &&
  playerId(x.returnPriority) &&
  optionalString(x.sourceId) &&
  (x.cardId === undefined || cardId(x.cardId)) &&
  (x.effects === undefined || effects(x.effects));

/** Review frames may capture a log snapshot before the action restores its phase payload. */
export function validState(x: unknown, actionable = true): x is GameState {
  if (
    !isObject(x) ||
    x.version !== 1 ||
    !Array.isArray(x.players) ||
    x.players.length !== 2 ||
    !Array.isArray(x.fields) ||
    x.fields.length !== 2 ||
    !Array.isArray(x.units) ||
    !Array.isArray(x.gears) ||
    !Array.isArray(x.stack) ||
    !Array.isArray(x.log) ||
    !phase(x.phase) ||
    !playerId(x.priorityPlayer) ||
    !playerId(x.currentPlayer) ||
    !playerId(x.focusPlayer) ||
    ![null, 0, 1].includes(x.winner) ||
    ![null, 0, 1].includes(x.chainStarter) ||
    !["seed", "rng", "turn", "nextId", "consecutivePasses"].every((k) =>
      nonnegative(x[k]),
    )
  )
    return false;

  if (
    !x.players.every(
      (p: any, i: number) =>
        isObject(p) &&
        p.id === i &&
        typeof p.name === "string" &&
        typeof p.deckId === "string" &&
        cardId(p.legendId) &&
        cardId(p.championId) &&
        ["championAvailable", "hasBegun", "mulliganDone"].every(
          (k) => typeof p[k] === "boolean",
        ) &&
        ["hand", "deck", "discard", "banished"].every(
          (k) => Array.isArray(p[k]) && p[k].every(cardId),
        ) &&
        ["scoredFieldsThisTurn", "conqueredThisTurn"].every(
          (k) =>
            Array.isArray(p[k]) &&
            p[k].every((n: unknown) => n === 0 || n === 1),
        ) &&
        Array.isArray(p.runeDeck) &&
        p.runeDeck.every(domain) &&
        Array.isArray(p.runes) &&
        p.runes.every(
          (r: unknown) =>
            isObject(r) &&
            typeof r.id === "string" &&
            domain(r.domain) &&
            typeof r.ready === "boolean",
        ) &&
        ["points", "energy", "cardsPlayedThisTurn", "fatigue"].every((k) =>
          nonnegative(p[k]),
        ) &&
        finite(p.legendUsedTurn),
    )
  )
    return false;

  if (
    !x.fields.every(
      (f: unknown, i: number) =>
        isObject(f) &&
        f.id === `field:${i}` &&
        cardId(f.cardId) &&
        [null, 0, 1].includes(f.controller),
    ) ||
    !x.units.every(
      (u: unknown) =>
        isObject(u) &&
        cardId(u.cardId) &&
        typeof u.id === "string" &&
        playerId(u.owner) &&
        location(u.location) &&
        typeof u.ready === "boolean" &&
        typeof u.stunned === "boolean" &&
        stringArray(u.gear) &&
        ["damage", "buff", "summonedTurn"].every((k) => nonnegative(u[k])) &&
        finite(u.temporaryMight) &&
        finite(u.temporaryAssault),
    ) ||
    !x.gears.every(
      (g: unknown) =>
        isObject(g) &&
        cardId(g.cardId) &&
        typeof g.id === "string" &&
        playerId(g.owner) &&
        typeof g.ready === "boolean" &&
        optionalString(g.attachedTo),
    ) ||
    !x.stack.every(
      (s: unknown) =>
        isObject(s) &&
        typeof s.id === "string" &&
        cardId(s.cardId) &&
        playerId(s.player) &&
        ["spell", "ability", "trigger"].includes(s.kind) &&
        effects(s.effects) &&
        optionalString(s.sourceId) &&
        optionalString(s.targetId) &&
        (s.locationId === undefined || location(s.locationId)),
    ) ||
    !x.log.every(
      (l: unknown) =>
        isObject(l) &&
        nonnegative(l.id) &&
        nonnegative(l.turn) &&
        typeof l.text === "string" &&
        typeof l.kind === "string",
    )
  )
    return false;

  if (
    (x.combat !== null && !combat(x.combat)) ||
    (x.pendingMove !== null && !move(x.pendingMove)) ||
    (x.pendingChoice !== null && !choice(x.pendingChoice)) ||
    (x.pendingTriggers !== undefined &&
      (!Array.isArray(x.pendingTriggers) ||
        !x.pendingTriggers.every(
          (t: unknown) =>
            isObject(t) &&
            playerId(t.player) &&
            cardId(t.cardId) &&
            typeof t.sourceId === "string" &&
            effects(t.effects) &&
            (t.locationId === undefined || location(t.locationId)),
        ))) ||
    (x.pendingTurnStart !== undefined && !playerId(x.pendingTurnStart)) ||
    (x.pendingEndTurn !== undefined && !playerId(x.pendingEndTurn))
  )
    return false;

  if (actionable) {
    if (
      (x.phase === "move" &&
        (!move(x.pendingMove) ||
          x.pendingMove.player !== x.priorityPlayer ||
          !x.pendingMove.unitIds.every((id: string) =>
            x.units.some(
              (u: any) => u.id === id && u.owner === x.priorityPlayer,
            ),
          ))) ||
      (x.phase === "choice" &&
        (!choice(x.pendingChoice) ||
          x.pendingChoice.player !== x.priorityPlayer ||
          x.pendingChoice.remaining < 1)) ||
      (x.phase === "showdown" && !combat(x.combat)) ||
      (x.phase === "damage" &&
        (!combat(x.combat) || x.combat.assigningPlayer !== x.priorityPlayer)) ||
      (x.winner === null ? x.phase === "ended" : x.phase !== "ended")
    )
      return false;
    try {
      if (
        x.winner === null &&
        getLegalActions(x as GameState, x.priorityPlayer).length === 0
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

function validAction(x: unknown): boolean {
  return (
    isObject(x) &&
    typeof x.id === "string" &&
    typeof x.label === "string" &&
    playerId(x.player) &&
    [
      "mulligan",
      "play",
      "move",
      "combat",
      "ability",
      "pass",
      "end",
      "resource",
    ].includes(x.category) &&
    optionalString(x.sourceId) &&
    optionalString(x.targetId) &&
    (x.cardId === undefined || cardId(x.cardId)) &&
    (x.locationId === undefined || location(x.locationId)) &&
    (x.unitIds === undefined || stringArray(x.unitIds))
  );
}

export function parseSession(raw: string | null): SavedSession {
  const empty: SavedSession = { match: null, review: null };
  if (!raw) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (validState(value)) return { match: value, review: null };
    if (!isObject(value) || !validState(value.match)) return empty;
    const r = value.review;
    const validReview =
      isObject(r) &&
      validState(r.before) &&
      validState(r.final) &&
      Array.isArray(r.frames) &&
      r.frames.length > 0 &&
      r.frames.every(
        (f: unknown) =>
          isObject(f) &&
          typeof f.label === "string" &&
          validState(f.state, false),
      ) &&
      Number.isInteger(r.index) &&
      r.index >= 0 &&
      r.index < r.frames.length &&
      validAction(r.action) &&
      JSON.stringify(r.final) === JSON.stringify(value.match) &&
      JSON.stringify(r.frames.at(-1).state) === JSON.stringify(r.final);
    return {
      match: value.match,
      review: validReview ? (r as unknown as Review) : null,
    };
  } catch {
    return empty;
  }
}
