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
const count = (x: unknown) => nonnegative(x) && Number.isSafeInteger(x);
const optionalBoolean = (x: unknown) =>
  x === undefined || typeof x === "boolean";
const optionalCount = (x: unknown) => x === undefined || count(x);
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
const effectTypes = new Set([
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
  "power",
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
  "bounce",
  "temporary",
  "predict",
  "sacrifice",
  "spendBuff",
  "keyword",
  "buffBonus",
  "special",
]);
const targetFilters = new Set([
  "anyTwoUnits",
  "orderedTwoUnits",
  "orderedTwoFriendlyUnits",
  "duelSameBattlefield",
  "duelEnemyAtBattlefield",
  "friendlyAndEnemyHere",
  "enemyUnitAndBattlefield",
  "enemyUnitOrGear",
  "attackingUnit",
  "unitInBase",
  "spell",
  "anyUnit",
  "enemyUnitInBase",
  "enemyUnit",
  "enemyAttackingUnit",
  "friendlyUnit",
  "friendlyUnitWithoutTemporary",
  "friendlyBuffableUnit",
  "enemyGear",
  "anyGear",
  "twoGear",
  "friendlyDamagedUnit",
  "friendlyReadyUnit",
  "friendlyExhaustedUnit",
  "enemySmallUnit",
  "friendlyUnitHere",
  "unitHere",
  "enemyUnitHere",
  "enemyUnitAtBattlefield",
  "unitAtBattlefield",
  "friendlyUnitAtBattlefield",
  "duel",
  "twoFriendlyUnits",
  "upToTwoFriendlyUnits",
  "upToTwoUnits",
  "unitAndSpell",
  "unitOrGear",
  "battlefield",
]);
const effects = (x: unknown, depth = 0): boolean =>
  depth <= 32 &&
  Array.isArray(x) &&
  x.length <= 1000 &&
  x.every(
    (e) =>
      isObject(e) &&
      effectTypes.has(e.type) &&
      (e.target === undefined || targetFilters.has(e.target)) &&
      ["amount", "minMight", "maxMight", "maxEnergy", "maxPower"].every(
        (k) => e[k] === undefined || finite(e[k]),
      ) &&
      [
        "custom",
        "cardName",
        "domain",
        "keyword",
        "condition",
        "targetDomain",
        "excludeTag",
      ].every((k) => optionalString(e[k])) &&
      [
        "permanent",
        "ready",
        "chooseRunes",
        "excludeSource",
        "optional",
        "fromHidden",
        "additionalCostPaid",
        "targetEmpowered",
        "targetDifferentLocationFromSource",
        "lessMightThanSource",
      ].every((k) => optionalBoolean(e[k])) &&
      (e.chosenTargetId === null || optionalString(e.chosenTargetId)) &&
      (e.runeIds === undefined || stringArray(e.runeIds)) &&
      (e.type !== "power" ||
        ((e.domain === undefined || domain(e.domain)) && optionalCount(e.amount))) &&
      (e.targetLocations === undefined ||
        (Array.isArray(e.targetLocations) &&
          e.targetLocations.every(location))) &&
      (e.who === undefined || ["self", "opponent", "all"].includes(e.who)) &&
      (e.location === undefined ||
        ["base", "target", "here"].includes(e.location)) &&
      (e.triggerCost === undefined ||
        (isObject(e.triggerCost) &&
          ["energy", "power", "xp", "recycleCost"].every((key) =>
            optionalCount(e.triggerCost[key]),
          ) &&
          optionalString(e.triggerCost.domain) &&
          optionalBoolean(e.triggerCost.exhaust))) &&
      (e.modes === undefined ||
        (Array.isArray(e.modes) &&
          e.modes.length > 0 &&
          e.modes.every(
            (mode: unknown) =>
              isObject(mode) &&
              typeof mode.label === "string" &&
              effects(mode.effects, depth + 1),
          ))) &&
      (e.effects === undefined || effects(e.effects, depth + 1)),
  );
const validUnit = (u: unknown): boolean =>
  isObject(u) &&
  cardId(u.cardId) &&
  cardsById[u.cardId].type === "Unit" &&
  typeof u.id === "string" &&
  playerId(u.owner) &&
  location(u.location) &&
  typeof u.ready === "boolean" &&
  typeof u.stunned === "boolean" &&
  stringArray(u.gear) &&
  ["damage", "buff", "summonedTurn"].every((k) => count(u[k])) &&
  finite(u.temporaryMight) &&
  finite(u.temporaryAssault) &&
  [
    "preventDamage",
    "baseMightOverride",
    "moveLockedTurn",
    "deathReplacementTurn",
    "combatShield",
  ].every((k) => optionalCount(u[k])) &&
  [
    "empowered",
    "untargetableByEnemy",
    "paidAdditionalCost",
    "additionalCostPaid",
    "playedFromHidden",
    "temporary",
    "token",
  ].every((k) => optionalBoolean(u[k])) &&
  (u.temporaryKeywords === undefined || stringArray(u.temporaryKeywords)) &&
  (u.usedAbilities === undefined || stringArray(u.usedAbilities));
const validStackItem = (s: unknown): boolean =>
  isObject(s) &&
  typeof s.id === "string" &&
  cardId(s.cardId) &&
  playerId(s.player) &&
  ["spell", "ability", "trigger"].includes(s.kind) &&
  (s.kind !== "spell" || cardsById[s.cardId].type === "Spell") &&
  effects(s.effects) &&
  optionalString(s.sourceId) &&
  optionalString(s.targetId) &&
  ["playOrdinal", "energySpent"].every(
    (k) => s[k] === undefined || nonnegative(s[k]),
  ) &&
  (s.locationId === undefined || location(s.locationId)) &&
  ["flowed", "fromHidden", "additionalCostPaid"].every((k) =>
    optionalBoolean(s[k]),
  ) &&
  (s.sourceSnapshot === undefined || validUnit(s.sourceSnapshot));
const combat = (x: unknown): boolean =>
  isObject(x) &&
  field(x.fieldId) &&
  playerId(x.attacker) &&
  playerId(x.defender) &&
  x.attacker !== x.defender &&
  ["priority", "assign"].includes(x.stage) &&
  optionalBoolean(x.engaged) &&
  (x.designatedUnits === undefined || stringArray(x.designatedUnits)) &&
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
// Combat playback is display-only, but malformed saved metadata must not reach
// the card/animation renderer. Legacy frames without it remain compatible.
const combatStep = (x: unknown): boolean => {
  if (
    !isObject(x) ||
    !["start", "assign", "impact", "result"].includes(x.stage)
  )
    return false;
  const p = x.preview;
  return (
    isObject(p) &&
    field(p.fieldId) &&
    cardId(p.fieldCardId) &&
    playerId(p.attacker) &&
    playerId(p.defender) &&
    p.attacker !== p.defender &&
    ["priority", "assign"].includes(p.stage) &&
    ["total", "remaining"].every(
      (k) =>
        Array.isArray(p[k]) && p[k].length === 2 && p[k].every(nonnegative),
    ) &&
    Array.isArray(p.assignments) &&
    p.assignments.length === 2 &&
    p.assignments.every(
      (a: unknown) => isObject(a) && Object.values(a).every(nonnegative),
    ) &&
    Array.isArray(p.units) &&
    p.units.every(
      (u: unknown) =>
        isObject(u) &&
        validUnit(u.unit) &&
        ["might", "power", "incoming", "prevention", "lethalAt"].every((k) =>
          nonnegative(u[k]),
        ) &&
        stringArray(u.keywords),
    ) &&
    (x.hits === undefined ||
      (Array.isArray(x.hits) &&
        x.hits.every(
          (h: unknown) =>
            isObject(h) &&
            typeof h.unitId === "string" &&
            cardId(h.cardId) &&
            playerId(h.owner) &&
            [
              "assigned",
              "damageBefore",
              "damageAfter",
              "prevented",
              "might",
            ].every((k) => nonnegative(h[k])),
        ))) &&
    (x.defeatedIds === undefined || stringArray(x.defeatedIds)) &&
    (x.recalledIds === undefined || stringArray(x.recalledIds)) &&
    (x.controller === undefined ||
      x.controller === null ||
      playerId(x.controller))
  );
};
const choice = (x: unknown): boolean =>
  isObject(x) &&
  playerId(x.player) &&
  [
    "token",
    "trigger",
    "discard",
    "recycle",
    "retrieve",
    "readyRunes",
    "predict",
    "sacrifice",
    "spendBuff",
    "optional",
    "move",
    "custom",
  ].includes(x.kind) &&
  count(x.remaining) &&
  phase(x.returnPhase) &&
  playerId(x.returnPriority) &&
  optionalString(x.sourceId) &&
  optionalString(x.targetId) &&
  optionalCount(x.lastDiscardEnergy) &&
  (x.sourceSnapshot === undefined || validUnit(x.sourceSnapshot)) &&
  (x.cardId === undefined || cardId(x.cardId)) &&
  (x.effects === undefined || effects(x.effects)) &&
  (x.afterEffects === undefined || effects(x.afterEffects)) &&
  optionalBoolean(x.finalizingTrigger) &&
  (!x.finalizingTrigger ||
    (x.kind === "readyRunes" &&
      cardId(x.cardId) &&
      typeof x.sourceId === "string" &&
      effects(x.effects))) &&
  (x.chosenRuneIds === undefined || stringArray(x.chosenRuneIds)) &&
  (x.cardIndices === undefined ||
    (Array.isArray(x.cardIndices) && x.cardIndices.every(count))) &&
  (x.effect === undefined || effects([x.effect])) &&
  (x.options === undefined ||
    (Array.isArray(x.options) &&
      x.options.length > 0 &&
      x.options.every(validAction))) &&
  (x.kind !== "custom" ||
    (Array.isArray(x.options) &&
      x.options.every(
        (option: any) =>
          option.player === x.player &&
          option.category === "ability" &&
          option.id.startsWith("choose-custom:") &&
          Array.isArray(option.effects),
      ))) &&
  (x.locationId === undefined || location(x.locationId)) &&
  (x.actor === undefined || playerId(x.actor));

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
        finite(p.legendUsedTurn) &&
        [
          "xp",
          "discardedThisTurn",
          "buffBonus",
          "endReadyRunes",
          "power",
          "spellEnergy",
          "showdownEnergy",
          "spellsPlayedThisTurn",
          "canLookAtEnemyHiddenTurn",
          "unitsEnterReadyTurn",
          "cannotPlaySpellsTurn",
          "firstDeathTurn",
        ].every((k) => optionalCount(p[k])) &&
        (p.typedPower === undefined ||
          (isObject(p.typedPower) &&
            Object.entries(p.typedPower).every(
              ([key, value]) => domain(key) && count(value),
            ))) &&
        (p.legendEmpowered === undefined ||
          typeof p.legendEmpowered === "boolean"),
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
    !x.units.every(validUnit) ||
    !x.gears.every(
      (g: unknown) =>
        isObject(g) &&
        cardId(g.cardId) &&
        typeof g.id === "string" &&
        playerId(g.owner) &&
        typeof g.ready === "boolean" &&
        optionalString(g.attachedTo) &&
        cardsById[g.cardId].type === "Gear" &&
        ["token", "temporary", "empowered"].every((k) =>
          optionalBoolean(g[k]),
        ) &&
        (g.usedAbilities === undefined || stringArray(g.usedAbilities)),
    ) ||
    !x.stack.every(validStackItem) ||
    (x.resolving !== undefined &&
      (!Array.isArray(x.resolving) ||
        !x.resolving.every(
          (item: unknown) =>
            validStackItem(item) && (item as { kind: string }).kind === "spell",
        ))) ||
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
    (x.hidden !== undefined &&
      (!Array.isArray(x.hidden) ||
        !x.hidden.every(
          (h: unknown) =>
            isObject(h) &&
            typeof h.id === "string" &&
            cardId(h.cardId) &&
            playerId(h.owner) &&
            field(h.location) &&
            count(h.hiddenTurn) &&
            h.hiddenTurn <= x.turn,
        ))) ||
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
            (t.sourceSnapshot === undefined || validUnit(t.sourceSnapshot)) &&
            (t.locationId === undefined || location(t.locationId)),
        ))) ||
    (x.stagedFields !== undefined &&
      (!Array.isArray(x.stagedFields) || !x.stagedFields.every(location))) ||
    !optionalCount(x.unitDiedTurn) ||
    !optionalCount(x.lastExcessDamage) ||
    !optionalBoolean(x.pendingCombatFinish) ||
    (x.pendingBeginning !== undefined && !playerId(x.pendingBeginning)) ||
    (x.pendingAwaken !== undefined && !playerId(x.pendingAwaken)) ||
    (x.pendingTurnStart !== undefined && !playerId(x.pendingTurnStart)) ||
    (x.pendingEndTurn !== undefined && !playerId(x.pendingEndTurn))
  )
    return false;

  if (actionable) {
    const stackIds = [...x.stack, ...(x.resolving ?? [])].map(
      (item: { id: string }) => item.id,
    );
    const boardIds = [...x.units, ...x.gears, ...(x.hidden ?? [])].map(
      (item: { id: string }) => item.id,
    );
    if (
      new Set(stackIds).size !== stackIds.length ||
      new Set(boardIds).size !== boardIds.length
    )
      return false;
    if (x.resolving?.length && !x.pendingChoice && x.winner === null)
      return false;
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
    optionalString(x.repeatedTargetId) &&
    optionalString(x.abilityKey) &&
    optionalString(x.detail) &&
    optionalBoolean(x.repeated) &&
    optionalBoolean(x.additionalCostPaid) &&
    (x.cardId === undefined || cardId(x.cardId)) &&
    (x.locationId === undefined || location(x.locationId)) &&
    (x.unitIds === undefined || stringArray(x.unitIds)) &&
    (x.effects === undefined || effects(x.effects)) &&
    (x.repeatedEffects === undefined || effects(x.repeatedEffects)) &&
    (x.amount === undefined || finite(x.amount)) &&
    (x.cardIndices === undefined ||
      (Array.isArray(x.cardIndices) &&
        x.cardIndices.every(
          (n: unknown) => Number.isInteger(n) && (n as number) >= 0,
        )))
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
          (f.combat === undefined || combatStep(f.combat)) &&
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
