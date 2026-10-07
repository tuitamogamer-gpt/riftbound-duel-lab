import { isCardType, getCard } from "./data/cards";
import type { GameState } from "./game/types";
import type { Review } from "./components/StepFlow";
import { cardsById } from "./data/cards";
import { getLegalActions } from "./game/engine";

export const SAVE_KEY = "riftbound-duel-save-v1";
export interface SavedSession {
  match: GameState | null;
  review: Review | null;
  paused?: boolean;
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
  ["base:0", "base:1", "field:0", "field:1", "field:2"].includes(x as string);
const field = (x: unknown) =>
  x === "field:0" || x === "field:1" || x === "field:2";
const domain = (x: unknown) =>
  ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].includes(x as string);
const cardPlaySpec = (x: unknown): boolean =>
  isObject(x) &&
  ["hand", "trash", "top", "banished", "blink"].includes(x.zone) &&
  [
    "optional",
    "hiddenOnly",
    "empowerAfterPlay",
    "untilUnit",
    "ignoreCost",
    "ignoreEnergy",
    "alternativeHere",
    "recycleOnLeave",
    "unplayedToHand",
    "attachToSource",
    "revealed",
  ].every((k) => optionalBoolean(x[k])) &&
  [
    "maxEnergy",
    "maxPower",
    "maxMight",
    "count",
    "energyReduction",
    "powerOverride",
  ].every((k) => optionalCount(x[k])) &&
  (x.cardTypes === undefined ||
    (stringArray(x.cardTypes) &&
      x.cardTypes.every((t) => ["Unit", "Gear", "Spell"].includes(t)))) &&
  (x.cardTags === undefined || stringArray(x.cardTags)) &&
  (x.destination === undefined ||
    [
      "normal",
      "base",
      "here",
      "controlledBattlefield",
      "anyBattlefield",
    ].includes(x.destination)) &&
  optionalString(x.sourceRef) &&
  optionalString(x.sourceId) &&
  (x.locationId === undefined || location(x.locationId));
const effectTypes = new Set([
  "playCard",
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
  "relentlessMove",
  "shurikenMove",
  "friendlyAndEnemyBattlefield",
  "empowerObject",
  "enemyAndOptionalFriendly",
  "friendlyAndOptionalEnemy",
  "enemyMoveDestination",
  "boardCards",
  "enemyChainItemChoosingFriendly",
  "friendlyUnitAndEnemyChainItem",
  "trashCards",
  "exhaustedOther",
  "ownTeemo",
  "unitAndEquipment",
  "twoUnitChoices",
  "upToOneEnemyUnitHere",
  "twoUnitsSameBattlefield",
  "twoFriendlyDifferentLocations",
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
  "friendlyEquipment",
  "upToThreeUnitsSameLocation",
  "upToFourFriendlyUnits",
  "friendlyAndWeakerEnemy",
  "friendlyUnitThreatenedByFury",
  "friendlyBaseAndBattlefield",
  "friendlyUnitAndBattlefield",
  "friendlyUnitAndBaseMove",
  "enemyUnitAndOccupiedLocation",
  "enemyHereAndDifferentBattlefield",
  "friendlyBattlefieldAndOptionalEnemy",
  "battlefieldUnitAndOptionalOther",
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
      (e.play === undefined || cardPlaySpec(e.play)) &&
      (e.type !== "playCard" || cardPlaySpec(e.play)) &&
      (e.target === undefined || targetFilters.has(e.target)) &&
      ["amount", "minMight", "maxMight", "maxEnergy", "maxPower"].every(
        (k) => e[k] === undefined || finite(e[k]),
      ) &&
      optionalCount(e.targetCount) &&
      optionalBoolean(e.upTo) &&
      (e.group === undefined ||
        (isObject(e.group) &&
          ["sameLocation", "tokensOnly", "atBattlefield", "here"].every((key) =>
            optionalBoolean(e.group[key]),
          ) &&
          optionalCount(e.group.totalMight) &&
          (e.group.destination === undefined ||
            ["any", "here", "base", "open"].includes(e.group.destination)))) &&
      (e.cardTypes === undefined ||
        (stringArray(e.cardTypes) &&
          e.cardTypes.every((type) =>
            ["Unit", "Spell", "Gear", "Rune"].includes(type),
          ))) &&
      (e.cardTags === undefined || stringArray(e.cardTags)) &&
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
      (e.damageSource === undefined || e.damageSource === "unit") &&
      (e.type !== "power" ||
        ((e.domain === undefined || domain(e.domain)) &&
          optionalCount(e.amount))) &&
      (e.targetLocations === undefined ||
        (Array.isArray(e.targetLocations) &&
          e.targetLocations.every(location))) &&
      (e.who === undefined || ["self", "opponent", "all"].includes(e.who)) &&
      (e.location === undefined ||
        ["base", "target", "here"].includes(e.location)) &&
      (e.triggerCost === undefined ||
        (isObject(e.triggerCost) &&
          ["energy", "power", "xp", "recycleCost", "discard"].every((key) =>
            optionalCount(e.triggerCost[key]),
          ) &&
          (e.triggerCost.board === undefined ||
            ["killUnitHere", "returnUnitHere", "disempower"].includes(
              e.triggerCost.board,
            )) &&
          optionalString(e.triggerCost.domain) &&
          optionalBoolean(e.triggerCost.exhaust) &&
          optionalBoolean(e.triggerCost.recycleSelf) &&
          optionalBoolean(e.triggerCost.sacrificeSelf) &&
          optionalString(e.triggerCost.trashId))) &&
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
  optionalString(u.deathTrashId) &&
  optionalString(u.namedSpell) &&
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
    "preventNextDamageTurn",
    "doubleDamageTurn",
    "damageDoublings",
    "movesTurn",
    "movesThisTurn",
    "baseMightOverride",
    "moveLockedTurn",
    "deathReplacementTurn",
    "combatShield",
    "empowerCount",
    "damageTakenTurn",
    "recallOnConquerTurn",
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
  optionalString(u.addedTag) &&
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
  ["playOrdinal", "energySpent", "abilityEnergyCost", "spellBonusDamage"].every(
    (k) => s[k] === undefined || nonnegative(s[k]),
  ) &&
  (s.playSource === undefined ||
    ["hand", "champion", "hidden", "trash", "effect"].includes(s.playSource)) &&
  (s.locationId === undefined || location(s.locationId)) &&
  ["flowed", "grantedFlow", "fromHidden", "additionalCostPaid"].every((k) =>
    optionalBoolean(s[k]),
  ) &&
  optionalBoolean(s.recycleOnLeave) &&
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
    "trashTargets",
    "boardTargets",
    "effectPlay",
    "effectDraft",
    "costTargets",
  ].includes(x.kind) &&
  count(x.remaining) &&
  phase(x.returnPhase) &&
  playerId(x.returnPriority) &&
  optionalString(x.sourceId) &&
  optionalString(x.targetId) &&
  optionalCount(x.lastDiscardEnergy) &&
  optionalString(x.lastDiscardType) &&
  (x.boardSelection === undefined ||
    (isObject(x.boardSelection) &&
      stringArray(x.boardSelection.selected) &&
      (x.kind === "costTargets" ||
        new Set(x.boardSelection.selected).size ===
          x.boardSelection.selected.length) &&
      (x.boardSelection.action === undefined ||
        validAction(x.boardSelection.action)) &&
      (x.boardSelection.allowedIds === undefined ||
        (stringArray(x.boardSelection.allowedIds) &&
          x.boardSelection.selected.every((id: string) =>
            x.boardSelection.allowedIds.includes(id),
          ))) &&
      (x.boardSelection.destination === undefined ||
        location(x.boardSelection.destination)) &&
      (x.boardSelection.trigger === undefined ||
        validStackItem({
          ...x.boardSelection.trigger,
          id: "draft",
          kind: "trigger",
        })) &&
      (x.boardSelection.action !== undefined ||
        x.boardSelection.allowedIds !== undefined))) &&
  (x.kind !== "boardTargets" ||
    (isObject(x.boardSelection) && x.effect?.target === "boardCards")) &&
  (x.kind !== "costTargets" ||
    (isObject(x.boardSelection) && validAction(x.boardSelection.action))) &&
  (x.kind !== "effectDraft" ||
    (isObject(x.effectDraft) &&
      validAction(x.effectDraft.action) &&
      Array.isArray(x.effectDraft.steps) &&
      x.effectDraft.steps.every(
        (step: any) =>
          isObject(step) &&
          ((step.effects !== undefined && effects(step.effects)) ||
            (Array.isArray(step.modes) &&
              step.modes.every(
                (m: any) =>
                  isObject(m) &&
                  typeof m.label === "string" &&
                  effects(m.effects),
              ))),
      ) &&
      Array.isArray(x.effectDraft.chosen) &&
      x.effectDraft.chosen.every(effects) &&
      x.effectDraft.chosen.length <= x.effectDraft.steps.length &&
      stringArray(x.effectDraft.targets) &&
      x.effectDraft.targets.length === x.effectDraft.chosen.length &&
      Array.isArray(x.effectDraft.modes) &&
      x.effectDraft.modes.every((n: any) => Number.isInteger(n) && n >= -1) &&
      x.effectDraft.modes.length === x.effectDraft.chosen.length &&
      stringArray(x.effectDraft.selected) &&
      new Set(x.effectDraft.selected).size === x.effectDraft.selected.length &&
      optionalCount(x.effectDraft.activeMode))) &&
  optionalCount(x.discardBatchCount) &&
  (x.discardBatchCardId === undefined || cardId(x.discardBatchCardId)) &&
  (x.trashSelection === undefined ||
    (isObject(x.trashSelection) &&
      stringArray(x.trashSelection.selected) &&
      new Set(x.trashSelection.selected).size ===
        x.trashSelection.selected.length &&
      validAction(x.trashSelection.action) &&
      (x.trashSelection.trigger === undefined ||
        validStackItem({
          ...x.trashSelection.trigger,
          id: "draft",
          kind: "trigger",
        })))) &&
  (x.kind !== "trashTargets" ||
    (isObject(x.trashSelection) && x.effect?.target === "trashCards")) &&
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
    !optionalCount(x.revision) ||
    (x.botSettings !== undefined &&
      (!isObject(x.botSettings) ||
        !["beginner", "normal", "hard", "expert"].includes(
          x.botSettings.difficulty,
        ) ||
        !count(x.botSettings.seed))) ||
    (x.matchConfig !== undefined &&
      (!isObject(x.matchConfig) ||
        !["formatId", "rulesVersion", "cardDataVersion"].every(
          (k) => typeof x.matchConfig[k] === "string",
        ) ||
        typeof x.matchConfig.openDecklists !== "boolean" ||
        !Array.isArray(x.matchConfig.supportedCardIds) ||
        !x.matchConfig.supportedCardIds.every(cardId))) ||
    !Array.isArray(x.players) ||
    x.players.length !== 2 ||
    !Array.isArray(x.fields) ||
    (x.fields.length !== 2 && x.fields.length !== 3) ||
    !Array.isArray(x.units) ||
    !Array.isArray(x.gears) ||
    !Array.isArray(x.stack) ||
    !Array.isArray(x.log) ||
    !phase(x.phase) ||
    (x.turnStep !== undefined &&
      !["awaken", "beginning", "channel", "draw", "main"].includes(
        x.turnStep,
      )) ||
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
        (p.deckList === undefined ||
          (Array.isArray(p.deckList) && p.deckList.every(cardId))) &&
        (p.runeList === undefined ||
          (Array.isArray(p.runeList) && p.runeList.every(domain))) &&
        cardId(p.legendId) &&
        cardId(p.championId) &&
        ["championAvailable", "hasBegun", "mulliganDone"].every(
          (k) => typeof p[k] === "boolean",
        ) &&
        ["hand", "deck", "discard", "banished"].every(
          (k) => Array.isArray(p[k]) && p[k].every(cardId),
        ) &&
        (p.trashCards === undefined ||
          (Array.isArray(p.trashCards) &&
            p.trashCards.length === p.discard.length &&
            new Set(p.trashCards.map((card: any) => card?.id)).size ===
              p.trashCards.length &&
            p.trashCards.every(
              (card: any, index: number) =>
                isObject(card) &&
                typeof card.id === "string" &&
                card.id.startsWith(`trash:${p.id}:`) &&
                card.cardId === p.discard[index],
            ))) &&
        ["scoredFieldsThisTurn", "conqueredThisTurn"].every(
          (k) =>
            Array.isArray(p[k]) &&
            p[k].every((n: unknown) => n === 0 || n === 1 || n === 2),
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
          "spellPower",
          "gearPower",
          "firstGearAbilityTurn",
          "equipmentPlayedTurn",
          "nextSpellBonus",
          "nextMainPower",
          "nextCardEnergyDiscount",
          "nextCardPowerDiscount",
          "unitEnergy",
          "showdownEnergy",
          "spellsPlayedThisTurn",
          "canLookAtEnemyHiddenTurn",
          "unitsEnterReadyTurn",
          "cannotPlaySpellsTurn",
          "cannotPlayCardsTurn",
          "firstDeathTurn",
          "powerSpentThisTurn",
          "firstGearPlayedTurn",
          "freeHideTurn",
        ].every((k) => optionalCount(p[k])) &&
        (p.gearPlayPermissions === undefined ||
          (Array.isArray(p.gearPlayPermissions) &&
            p.gearPlayPermissions.length <= 1000 &&
            p.gearPlayPermissions.every(
              (v: unknown) =>
                isObject(v) && typeof v.id === "string" && count(v.turn),
            ))) &&
        (p.enemyChoices === undefined ||
          (isObject(p.enemyChoices) &&
            count(p.enemyChoices.turn) &&
            count(p.enemyChoices.count))) &&
        (p.grantedFlow === undefined ||
          (Array.isArray(p.grantedFlow) &&
            p.grantedFlow.every(
              (grant: unknown) =>
                isObject(grant) &&
                typeof grant.trashId === "string" &&
                grant.trashId.startsWith(`trash:${p.id}:`) &&
                count(grant.turn),
            ))) &&
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
        optionalString(g.namedTag) &&
        optionalString(g.attachedTo) &&
        optionalCount(g.attachedTurn) &&
        isCardType(cardsById[g.cardId], "Gear") &&
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
    (x.resolvingAbilities !== undefined &&
      (!Array.isArray(x.resolvingAbilities) ||
        !x.resolvingAbilities.every(
          (item: unknown) =>
            validStackItem(item) &&
            (item as { kind: string }).kind === "ability",
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
    (x.damageTriggers !== undefined &&
      (!Array.isArray(x.damageTriggers) ||
        !x.damageTriggers.every(
          (w: unknown) =>
            isObject(w) &&
            playerId(w.player) &&
            cardId(w.cardId) &&
            count(w.turn) &&
            optionalString(w.targetId),
        ))) ||
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
    (x.extraTurns !== undefined &&
      (!Array.isArray(x.extraTurns) ||
        x.extraTurns.length > 1000 ||
        !x.extraTurns.every(playerId))) ||
    (x.endDisempowers !== undefined &&
      (!Array.isArray(x.endDisempowers) ||
        x.endDisempowers.length > 1000 ||
        !x.endDisempowers.every(
          (d: unknown) =>
            isObject(d) &&
            typeof d.id === "string" &&
            playerId(d.player) &&
            count(d.turn),
        ))) ||
    (x.pendingPlays !== undefined &&
      (!Array.isArray(x.pendingPlays) ||
        x.pendingPlays.length > 1000 ||
        !x.pendingPlays.every(
          (item: unknown) =>
            isObject(item) &&
            typeof item.id === "string" &&
            item.id.startsWith("pending:") &&
            cardId(item.cardId) &&
            playerId(item.player) &&
            ["hand", "trash", "banished"].includes(item.returnZone) &&
            count(item.returnIndex) &&
            cardPlaySpec(item.spec),
        ))) ||
    (x.pendingChoice?.kind === "effectPlay" &&
      !x.pendingPlays?.some(
        (item: any) =>
          item.id === x.pendingChoice.sourceId &&
          item.player === x.pendingChoice.player,
      )) ||
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
    !optionalCount(x.preventEffectDamageTurn) ||
    !optionalCount(x.lastExcessDamage) ||
    !optionalBoolean(x.pendingCombatFinish) ||
    (x.pendingBeginning !== undefined && !playerId(x.pendingBeginning)) ||
    (x.pendingAwaken !== undefined && !playerId(x.pendingAwaken)) ||
    (x.pendingTurnStart !== undefined && !playerId(x.pendingTurnStart)) ||
    (x.pendingEndTurn !== undefined && !playerId(x.pendingEndTurn))
  )
    return false;

  if (actionable) {
    const stackIds = [
      ...x.stack,
      ...(x.resolving ?? []),
      ...(x.resolvingAbilities ?? []),
    ].map((item: { id: string }) => item.id);
    const boardIds = [
      ...x.units,
      ...x.gears.filter(
        (g: any) =>
          !x.units.some(
            (u: any) =>
              u.id === g.id &&
              u.cardId === g.cardId &&
              isCardType(getCard(u.cardId), "Gear"),
          ),
      ),
      ...(x.hidden ?? []),
    ].map((item: { id: string }) => item.id);
    if (
      new Set(stackIds).size !== stackIds.length ||
      new Set(boardIds).size !== boardIds.length
    )
      return false;
    if (
      (x.resolving?.length || x.resolvingAbilities?.length) &&
      !x.pendingChoice &&
      x.winner === null
    )
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
    optionalString(x.costSourceId) &&
    optionalString(x.namedTag) &&
    (x.dragonRoost === undefined || field(x.dragonRoost)) &&
    optionalString(x.detail) &&
    optionalBoolean(x.repeated) &&
    optionalBoolean(x.additionalCostPaid) &&
    optionalBoolean(x.targetsFinalized) &&
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
          (f.draw === undefined ||
            (isObject(f.draw) &&
              playerId(f.draw.player) &&
              count(f.draw.count) &&
              f.draw.count > 0 &&
              (f.draw.cardIds === undefined ||
                (f.draw.player === 0 &&
                  Array.isArray(f.draw.cardIds) &&
                  f.draw.cardIds.length === f.draw.count &&
                  f.draw.cardIds.every(cardId))))) &&
          (f.score === undefined ||
            (isObject(f.score) &&
              playerId(f.score.player) &&
              count(f.score.from) &&
              count(f.score.to) &&
              f.score.to > f.score.from &&
              ["hold", "conquer", "effect"].includes(f.score.kind) &&
              (f.score.fieldId === undefined || field(f.score.fieldId)))) &&
          (f.effect === undefined ||
            (isObject(f.effect) &&
              playerId(f.effect.player) &&
              (f.effect.cardId === undefined || cardId(f.effect.cardId)) &&
              optionalString(f.effect.sourceId) &&
              optionalString(f.effect.targetId) &&
              optionalString(f.effect.type) &&
              (f.effect.scoring === undefined ||
                ["hold", "conquer"].includes(f.effect.scoring)) &&
              (f.effect.locationId === undefined ||
                location(f.effect.locationId)) &&
              (f.effect.stage === undefined ||
                ["announced", "resolving", "applied"].includes(
                  f.effect.stage,
                )))) &&
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
      ...(value.paused === true ? { paused: true } : {}),
    };
  } catch {
    return empty;
  }
}
