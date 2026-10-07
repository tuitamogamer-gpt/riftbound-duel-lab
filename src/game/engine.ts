import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
  copiedScripts,
} from "./text-sources";
import { inspectDeck, shiftInspectedPositions } from "./deck-inspection";
import { queueTokenReplacements, drainTokenReplacements } from "./card-wave25";
import {
  repeatPrices,
  optionalDiscounts,
  ireliaDiscounts,
} from "./card-wave23";
import {
  makeDraft,
  retargetDraft,
  draftAction,
  draftChoose,
  draftChoices,
} from "./effect-drafts";
import { recycleCards, recycleRunes } from "./zone-events";
import { banishCard } from "./banishment";
import {
  syncHybridObjects,
  uncounterable,
  gangplank,
  changeMight,
  lethal,
} from "./card-wave19";
import { getCardTypes } from "../data/cards";
import { isCardType } from "../data/cards";
import { advanceDeaths } from "./death-replacements";
import { physicalOwner, physicalCard, detach } from "./objects";
import { getUnitTags } from "./board-rules";
import {
  allCardTags,
  triggerBoardSources,
  payTriggerBoard,
} from "./card-wave15";
import {
  grantedLegendAbilities,
  markWave14Mode,
  wave14ModeAvailable,
} from "./card-wave14";
import { runCardPlay } from "./card-play";
import {
  addToTrash,
  burnToTrash,
  emptyTrash,
  takeTrashAt,
  takeTrash,
  trashCards,
  trashTargets,
} from "./trash";
import { discountedOutsideHand } from "./card-wave8";
import { gearAbilityDiscount } from "./card-wave9";
import {
  attachedEquipment,
  nearbyEquipmentKeywords,
  equipDomains,
  unitTriggerEffects,
} from "./equipment";
import {
  canPlayCard,
  getVictoryScore,
  isFace,
  playerTurnNumber,
  repeatCost,
  readyForbidden,
  hideCost,
  hasQuickDraw,
  disempower,
} from "./board-rules";
import { cards, getCard, type Card } from "../data/cards";
import catalogMeta from "../data/catalog-meta.json";
import { decks, type StarterDeck } from "../data/decks";
import { getScript, getRulesCardId, isImplemented } from "./scripts";
import {
  laterMight,
  laterKeywords,
  laterCost,
  runLaterEffect,
  laterCardEvent,
  getLaterActions,
  applyLaterAction,
  type PreconContext,
  type PreconEvent,
} from "./later-precon-engine";
import type {
  GameState,
  PendingCardPlay,
  GameOptions,
  PlayerId,
  LocationId,
  Unit,
  Gear,
  GameAction,
  Effect,
  CardScript,
  TargetFilter,
  StackItem,
  PlayerState,
  PublicGameView,
} from "./types";
export * from "./types";
export const otherPlayer = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const base = (p: PlayerId): LocationId => `base:${p}`;
const uid = (s: GameState, prefix: string) => `${prefix}${s.nextId++}`;
export interface StepFrame {
  state: GameState;
  label: string;
  combat?: CombatStep;
  effect?: StepEffect;
  draw?: { player: PlayerId; count: number; cardIds?: string[] };
  score?: {
    player: PlayerId;
    from: number;
    to: number;
    kind: "hold" | "conquer" | "effect";
    fieldId?: LocationId;
  };
}
export interface StepEffect {
  cardId?: string;
  sourceId?: string;
  player: PlayerId;
  targetId?: string;
  locationId?: LocationId;
  type?: string;
  stage?: "announced" | "resolving" | "applied";
  scoring?: "hold" | "conquer";
}
export interface CombatUnitPreview {
  unit: Unit;
  might: number;
  power: number;
  incoming: number;
  prevention: number;
  lethalAt: number;
  keywords: string[];
}
export interface CombatPreview {
  fieldId: LocationId;
  fieldCardId: string;
  attacker: PlayerId;
  defender: PlayerId;
  stage: "priority" | "assign";
  total: [number, number];
  remaining: [number, number];
  assignments: [Record<string, number>, Record<string, number>];
  units: CombatUnitPreview[];
}
export interface CombatHit {
  unitId: string;
  cardId: string;
  owner: PlayerId;
  assigned: number;
  damageBefore: number;
  damageAfter: number;
  prevented: number;
  might: number;
}
export interface CombatStep {
  stage: "start" | "assign" | "impact" | "result";
  preview: CombatPreview;
  hits?: CombatHit[];
  defeatedIds?: string[];
  recalledIds?: string[];
  // Unset while death triggers still have to resolve before control is settled.
  controller?: PlayerId | null;
}
let stepFrames: StepFrame[] | null = null;
const executingEffects = new WeakSet<GameState>();
// Costs can cause triggers, but their choices wait until the play is finalized.
const finalizingBoardCostPlay = new WeakMap<GameState, Array<() => void>>();
const effectActors = new WeakMap<GameState, PlayerId>();
const scoreTriggerRepeats = new WeakMap<
  GameState,
  { player: PlayerId; count: number }
>();
const stepEffects = new WeakMap<GameState, StepEffect>();
/** Presentation metadata is scoped to this synchronous effect, never game rules. */
function withStepEffect<T>(s: GameState, effect: StepEffect, run: () => T): T {
  if (!stepFrames) return run();
  const previous = stepEffects.get(s);
  stepEffects.set(s, effect);
  try {
    return run();
  } finally {
    if (previous) stepEffects.set(s, previous);
    else stepEffects.delete(s);
  }
}
const cardName = (id: string) => getCard(id).name.replace(" (Starter)", "");
function log(
  s: GameState,
  text: string,
  kind: GameState["log"][number]["kind"] = "info",
  player?: PlayerId,
  combat?: CombatStep,
  presentation?: Pick<StepFrame, "draw" | "score">,
) {
  s.log.push({ id: s.nextId++, turn: s.turn, text, kind, player });
  if (s.log.length > 250) s.log.shift();
  recordStep(s, text, combat, presentation);
}
function recordStep(
  s: GameState,
  label: string,
  combat?: CombatStep,
  presentation?: Pick<StepFrame, "draw" | "score">,
) {
  if (stepFrames)
    stepFrames.push({
      state: structuredClone(s),
      label,
      ...(combat ? { combat: structuredClone(combat) } : {}),
      ...(stepEffects.has(s) ? { effect: { ...stepEffects.get(s)! } } : {}),
      ...presentation,
    });
}
function random(s: GameState) {
  let x = s.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng = x >>> 0;
  return s.rng / 4294967296;
}
function shuffle<T>(s: GameState, items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function getMight(s: GameState, u: Unit, clamp = true): number {
  if (u.abilityInstance) u = s.units.find((v) => v.id === u.id) ?? u;
  const c = getCard(u.cardId),
    sc = getScript(c.id);
  let value =
    (u.baseMightOverride ?? c.might ?? 0) +
    u.buff * (1 + (s.players[u.owner].buffBonus ?? 0)) +
    u.temporaryMight;
  if (u.cardId === "ogs-004-024" && s.players[u.owner].runes.length >= 8)
    value += 4;
  value += textUnits(s).filter(
    (x) =>
      x.cardId === "ogs-013-024" &&
      x.owner === u.owner &&
      x.id !== u.id &&
      x.location === u.location,
  ).length;
  if (u.buff && u.cardId === "ogn-065-298") value++;
  if (u.buff && u.location.startsWith("field:"))
    value +=
      2 *
      textUnits(s).filter(
        (x) =>
          x.owner === u.owner &&
          x.id !== u.id &&
          x.cardId === "ogn-151-298" &&
          x.location === u.location,
      ).length;
  for (const id of u.gear) {
    const g = s.gears.find((g) => g.id === id);
    if (g) value += getScript(g.cardId)?.gearMight ?? 0;
  }
  for (const gear of attachedEquipment(s, u)) {
    const panel = getScript(gear.cardId)?.equipment;
    if (gear.attachedTurn === s.turn) value += panel?.attachedTurnMight ?? 0;
    if (
      s.combat?.fieldId === u.location &&
      (s.combat.engaged ?? true) &&
      s.combat.defender === u.owner
    )
      value += panel?.shield ?? 0;
  }
  if (s.combat?.fieldId === u.location && (s.combat.engaged ?? true)) {
    value +=
      u.owner === s.combat.attacker
        ? (sc?.assault ?? 0) +
          (u.temporaryAssault ?? 0) +
          (u.cardId === "ogn-019-298" && s.players[u.owner].discardedThisTurn
            ? 1
            : 0)
        : (sc?.shield ?? 0) + (u.combatShield ?? 0);
    if (
      u.owner === s.combat.defender &&
      s.players[u.owner].legendId === "ogs-019-024" &&
      s.units.filter((x) => x.owner === u.owner && x.location === u.location)
        .length === 1
    )
      value += 2;
  }
  if (
    u.cardId === "ogn-055-298" &&
    s.combat?.fieldId === u.location &&
    (s.combat.engaged ?? true) &&
    s.units.filter((x) => x.owner === u.owner && x.location === u.location)
      .length === 1
  )
    value += 2;
  if (s.fields.find((f) => f.id === u.location)?.cardId === "ogn-294-298")
    value++;
  if (s.combat?.engaged && s.combat.fieldId === u.location) {
    const keyword = s.combat.attacker === u.owner ? "Assault" : "Shield";
    value += (u.temporaryKeywords ?? [])
      .filter((k) => k === keyword || k.startsWith(`${keyword} `))
      .reduce((n, k) => n + (Number(k.split(" ")[1]) || 1), 0);
  }
  for (const { unit: t, script } of copiedScripts(s, u)) {
    if (t.cardId === "ogs-004-024" && s.players[u.owner].runes.length >= 8)
      value += 4;
    if (t.cardId === "ogn-065-298" && u.buff) value++;
    if (s.combat?.engaged && s.combat.fieldId === u.location) {
      value +=
        s.combat.attacker === u.owner
          ? (script.assault ?? 0)
          : (script.shield ?? 0);
      if (
        t.cardId === "ogn-019-298" &&
        s.combat.attacker === u.owner &&
        s.players[u.owner].discardedThisTurn
      )
        value++;
      if (
        t.cardId === "ogn-055-298" &&
        s.units.filter((x) => x.owner === u.owner && x.location === u.location)
          .length === 1
      )
        value += 2;
    }
  }
  const result = laterMight(s, u, value);
  return clamp ? Math.max(0, result) : result;
}
export function getKeywords(s: GameState, u: Unit) {
  const result = [
    ...textSources(s, u).flatMap((t) => getScript(t.cardId)?.keywords ?? []),
    ...(u.temporaryKeywords ?? []),
    ...attachedEquipment(s, u).flatMap(
      (gear) => getScript(gear.cardId)?.equipment?.keywords ?? [],
    ),
    ...nearbyEquipmentKeywords(s, u),
  ];
  if (u.cardId === "ogn-019-298" && s.players[u.owner].discardedThisTurn)
    result.push("Ganking", "Assault");
  if (u.cardId === "ogn-125-298" && u.buff) result.push("Ganking");
  if (s.fields.find((f) => f.id === u.location)?.cardId === "ogn-297-298")
    result.push("Ganking");
  const keywords = [...result, ...laterKeywords(s, u)];
  const grantsDeflect = keywords.includes("Deflect if absent");
  const filtered = keywords.filter(
    (keyword) => keyword !== "Deflect if absent",
  );
  if (
    grantsDeflect &&
    !filtered.some((keyword) => /^Deflect(?: \d+)?$/.test(keyword)) &&
    !getScript(u.cardId)?.deflect
  )
    filtered.push("Deflect");
  return filtered;
}
/** Keyword values copied by Kato include intrinsic numeric keyword instances. */
export function getScriptKeywords(s: GameState, u: Unit) {
  const keywords = [...getKeywords(s, u)];
  const script = getScript(u.cardId);
  for (const [name, value] of [
    ["Assault", script?.assault],
    ["Shield", script?.shield],
    ["Deflect", script?.deflect],
  ] as const)
    if (value && !keywords.some((k) => k === name || k.startsWith(`${name} `)))
      keywords.push(value === 1 ? name : `${name} ${value}`);
  if (u.temporaryAssault) keywords.push(`Assault ${u.temporaryAssault}`);
  return keywords;
}
/** The actual damage contribution used by combat, including zero-power units. */
function damageToKill(s: GameState, u: Unit) {
  if (
    u.preventNextDamageTurn === s.turn ||
    getKeywords(s, u).includes("Prevent all damage")
  )
    return Number.MAX_SAFE_INTEGER;
  const elder = textUnits(s).some(
    (dragon) => dragon.owner !== u.owner && isFace(dragon.cardId, "UNL", 118),
  );
  const multiplier =
    u.doubleDamageTurn === s.turn ? 2 ** (u.damageDoublings ?? 1) : 1;
  return Math.max(
    1,
    Math.ceil(
      ((elder ? 1 : getMight(s, u)) - u.damage + (u.preventDamage ?? 0)) /
        multiplier,
    ),
  );
}
export function getCombatPower(s: GameState, u: Unit): number {
  if (!s.combat || u.location !== s.combat.fieldId || u.stunned) return 0;
  if (getKeywords(s, u).includes("No combat damage")) return 0;
  if (
    getScript(u.cardId)?.combatCondition === "paired" &&
    s.units.filter((v) => v.owner === u.owner && v.location === u.location)
      .length !== 2
  )
    return 0;
  return getMight(s, u);
}
/** Public battlefield data only; all values follow the same helpers as damage. */
export function getCombatPreview(s: GameState): CombatPreview | null {
  const c = s.combat;
  if (!c) return null;
  const participants = s.units.filter((u) => u.location === c.fieldId);
  const total = ([0, 1] as const).map((p) =>
    c.stage === "assign"
      ? c.total[p]
      : participants
          .filter((u) => u.owner === p)
          .reduce((sum, u) => sum + getCombatPower(s, u), 0),
  ) as [number, number];
  return {
    fieldId: c.fieldId,
    fieldCardId: s.fields.find((f) => f.id === c.fieldId)!.cardId,
    attacker: c.attacker,
    defender: c.defender,
    stage: c.stage,
    total,
    remaining: c.stage === "assign" ? [...c.remaining] : [...total],
    assignments: structuredClone(c.assignments),
    units: participants.map((u) => ({
      unit: structuredClone(u),
      might: getMight(s, u),
      power: getCombatPower(s, u),
      incoming: c.assignments[otherPlayer(u.owner)][u.id] ?? 0,
      prevention: u.preventDamage ?? 0,
      lethalAt: damageToKill(s, u),
      keywords: getKeywords(s, u),
    })),
  };
}
export function getResources(s: GameState, p: PlayerId) {
  const x = s.players[p];
  return {
    energy:
      x.energy +
      (s.combat ? (x.showdownEnergy ?? 0) : 0) +
      x.runes.filter((r) => r.ready).length,
    power:
      x.runes.length +
      (x.power ?? 0) +
      Object.values(x.typedPower ?? {}).reduce((a, b) => a + b, 0),
    domains: Object.fromEntries(
      ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map((d) => [
        d,
        x.runes.filter((r) => r.domain === d).length + (x.typedPower?.[d] ?? 0),
      ]),
    ),
  };
}
interface PlayCostOptions {
  repeatMask?: number;
  flexibleEnergy?: number;
  optionalEnergy?: number;
  costSourceId?: string;
  dragonRoost?: LocationId;
  additionalCostPaid?: boolean;
  repeated?: boolean;
  repeatedTargetId?: string;
  accelerated?: boolean;
  locationId?: LocationId;
}
function flowCost(
  s: GameState,
  p: PlayerId,
  cardId: string,
  sourceId?: string,
): (NonNullable<CardScript["flow"]> & { domains?: string[] }) | undefined {
  if (!sourceId?.startsWith("trash:")) return undefined;
  if (sourceId.endsWith(":riches")) {
    const c = getCard(cardId);
    return {
      energy: c.energy ?? 0,
      power: c.power ?? 0,
      domains: c.domains,
      banishAfter: false,
    };
  }
  if (!sourceId.endsWith(":granted")) return getScript(cardId)?.flow;
  const card = trashCards(s, p)[Number(sourceId.split(":")[1])];
  if (
    !card ||
    !s.players[p].grantedFlow?.some(
      (grant) => grant.trashId === card.id && grant.turn === s.turn,
    )
  )
    return undefined;
  const printed = getCard(cardId);
  return {
    energy: printed.energy ?? 0,
    power: printed.power ?? 0,
    domains: printed.domains,
  };
}
function playPowerDomains(
  s: GameState,
  p: PlayerId,
  card: Card,
  sourceId?: string,
) {
  if (
    s.pendingPlays?.find((item) => item.id === sourceId)?.spec.powerOverride !==
    undefined
  )
    return [];
  if (!sourceId?.startsWith("trash:")) return card.domains;
  const flow = flowCost(s, p, card.id, sourceId);
  const jayce = sourceId?.includes(":jayce:");
  return flow?.domains ?? (flow?.domain ? [flow.domain] : []);
}
/** Choose a payable allocation when a universal discount can remove colored costs. */
function discountPower(
  s: GameState,
  p: PlayerId,
  groups: PowerGroup[],
  amount: number,
) {
  if (amount <= 0) return groups;
  amount = Math.min(
    amount,
    groups.reduce((n, g) => n + g.power, 0),
  );
  let fallback: PowerGroup[] | undefined;
  const visit = (
    index: number,
    left: number,
    chosen: PowerGroup[],
  ): PowerGroup[] | undefined => {
    if (index === groups.length) {
      if (left) return;
      fallback ??= chosen;
      return powerPayment(s, p, chosen) ? chosen : undefined;
    }
    const group = groups[index];
    for (let n = Math.min(left, group.power); n >= 0; n--) {
      const result = visit(index + 1, left - n, [
        ...chosen,
        { ...group, power: group.power - n },
      ]);
      if (result) return result;
    }
  };
  return visit(0, amount, []) ?? fallback ?? groups;
}
function costFor(
  s: GameState,
  p: PlayerId,
  c: Card,
  targetId?: string,
  extras: {
    energy?: number;
    power?: number;
    anyPower?: number;
    flexibleCount?: number;
    flexibleEnergy?: number;
    additionalPower?: PowerGroup[];
    floorDiscount?: number;
    energyReduction?: number;
    allTargets?: string;
    domains?: string[];
  } = {},
) {
  let energy = (c.energy ?? 0) + (extras.energy ?? 0);
  const power = (c.power ?? 0) + (extras.power ?? 0);
  const helmets = isCardType(c, "Spell")
    ? s.gears.filter((g) => g.owner !== p && isFace(g.cardId, "VEN", 45))
    : [];
  energy += helmets.length;
  if (isCardType(c, "Spell")) {
    const limited =
      (extras.floorDiscount ?? 0) +
      textUnits(s).filter(
        (u) =>
          u.owner === p &&
          ((isFace(u.cardId, "OGN", 84) && u.location.startsWith("field:")) ||
            (isFace(u.cardId, "VEN", 55) && u.empowered)),
      ).length;
    energy = Math.max(Math.min(energy, 1), energy - limited);
  }
  if (c.id === "ogn-195-298") energy -= s.players[p].discard.length;
  if (c.id === "ogn-012-298" && s.players[p].cardsPlayedThisTurn > 0)
    energy -= 2;
  const allTargets = extras.allTargets ?? targetId;
  let extraPower =
    (extras.anyPower ?? 0) +
    (getScript(c.id)?.ignoreDeflect ? 0 : targetTax(s, p, allTargets));
  extraPower += helmets.filter((g) => g.empowered).length;
  const adjustment = laterCost(s, p, c, context(allTargets));
  energy = Math.max(
    0,
    energy + adjustment.energy - (extras.energyReduction ?? 0),
  );
  let groups = discountPower(
    s,
    p,
    [
      {
        power: power + Math.max(0, adjustment.power),
        domains: extras.domains ?? c.domains,
      },
      { power: extraPower, domains: [] },
      ...(extras.additionalPower ?? []),
    ],
    Math.max(0, -adjustment.power),
  );
  const flex = extras.flexibleCount ?? 0,
    flexEnergy = Math.min(energy, extras.flexibleEnergy ?? flex);
  energy = Math.max(0, energy - flexEnergy);
  groups = discountPower(s, p, groups, Math.max(0, flex - flexEnergy));
  const spellEnergy = isCardType(c, "Spell")
    ? Math.min(s.players[p].spellEnergy ?? 0, energy)
    : 0;
  const unitEnergy = isCardType(c, "Unit")
    ? Math.min(s.players[p].unitEnergy ?? 0, energy)
    : 0;
  const spellPower = isCardType(c, "Spell")
    ? Math.min(
        s.players[p].spellPower ?? 0,
        groups.reduce((n, group) => n + group.power, 0),
      )
    : 0;
  if (spellPower) groups = discountPower(s, p, groups, spellPower);
  const gearPower = isCardType(c, "Gear")
    ? Math.min(
        s.players[p].gearPower ?? 0,
        groups.reduce((n, group) => n + group.power, 0),
      )
    : 0;
  if (gearPower) groups = discountPower(s, p, groups, gearPower);
  return {
    gearPower,
    spellEnergy,
    unitEnergy,
    spellPower,
    energy: energy - spellEnergy - unitEnergy,
    power: groups[0].power,
    extraPower: groups[1].power,
    additionalPower: groups.slice(2),
  };
}
/** Base/alternative costs, additional costs, increases, then discounts (Core 356). */
function playCost(
  s: GameState,
  p: PlayerId,
  card: Card,
  targetId?: string,
  sourceId?: string,
  options: PlayCostOptions = {},
): ReturnType<typeof costFor> {
  const script = getScript(card.id)!;
  const allTargets = options.repeated
    ? [targetId, options.repeatedTargetId].filter(Boolean).join("~")
    : targetId;
  const flex = isCardType(card, "Spell")
    ? ireliaDiscounts(s, p, allTargets)
    : 0;
  const allRepeats = repeatPrices(s, p, card.id, script);
  const repeats =
    options.repeatMask !== undefined
      ? allRepeats.filter((_, i) => !!(options.repeatMask! & (1 << i)))
      : options.repeated
        ? allRepeats.slice(0, 1)
        : [];
  const parts = [
    ...repeats.map((c) => ({ ...c, domains: c.domain ? [c.domain] : [] })),
    ...(options.additionalCostPaid && script.additionalCost
      ? [
          {
            ...script.additionalCost,
            domains: script.additionalCost.domain
              ? [script.additionalCost.domain]
              : card.domains,
            required: script.additionalCost.required,
          },
        ]
      : []),
    ...(options.accelerated
      ? [{ energy: 1, power: 1, domains: card.domains }]
      : []),
  ];
  const ez = optionalDiscounts(s, p);
  const optionalCount = parts.reduce(
    (n, c) => n + ("required" in c && c.required ? 0 : ez),
    0,
  );
  if (
    (flex && options.flexibleEnergy === undefined) ||
    (optionalCount && options.optionalEnergy === undefined)
  ) {
    let fallback: ReturnType<typeof costFor> | undefined;
    for (
      let oe = options.optionalEnergy ?? optionalCount;
      oe >= (options.optionalEnergy ?? 0);
      oe--
    )
      for (
        let fe = options.flexibleEnergy ?? flex;
        fe >= (options.flexibleEnergy ?? 0);
        fe--
      ) {
        const result = playCost(s, p, card, targetId, sourceId, {
          ...options,
          flexibleEnergy: fe,
          optionalEnergy: oe,
        });
        fallback ??= result;
        if (
          canPay(
            s,
            p,
            result.energy,
            result.power,
            playPowerDomains(s, p, card, sourceId),
            result.extraPower,
            result.additionalPower,
          )
        )
          return result;
      }
    return fallback!;
  }
  let remainingEnergy = options.optionalEnergy ?? 0;
  const reduced = parts.map((c) => {
    const discount = "required" in c && c.required ? 0 : ez;
    const e = Math.min(c.energy ?? 0, remainingEnergy, discount);
    remainingEnergy -= e;
    return {
      ...c,
      energy: Math.max(0, (c.energy ?? 0) - e),
      power: Math.max(0, (c.power ?? 0) - (discount - e)),
    };
  });
  const board = options.additionalCostPaid && script.additionalCost?.board;
  const costSources = (options.costSourceId ?? "")
    .split("~")
    .map((id) => s.units.find((u) => u.id === id))
    .filter((u): u is Unit => Boolean(u));
  if (board && board.discount)
    card = {
      ...card,
      energy: Math.max(
        0,
        (card.energy ?? 0) -
          (board.discount === "energyPower"
            ? costSources.reduce(
                (n, u) => n + (getCard(u.cardId).energy ?? 0),
                0,
              )
            : 0),
      ),
      power: Math.max(
        0,
        (card.power ?? 0) -
          (board.discount === "powerEach"
            ? costSources.length
            : costSources.reduce(
                (n, u) => n + (getCard(u.cardId).power ?? 0),
                0,
              )),
      ),
    };
  const instructed = s.pendingPlays?.find((item) => item.id === sourceId);
  const permission = instructed?.spec;
  if (permission?.ignoreAllCosts)
    return {
      energy: 0,
      power: 0,
      extraPower: 0,
      additionalPower: [],
      spellEnergy: 0,
      spellPower: 0,
      unitEnergy: 0,
      gearPower: 0,
    };
  const flow = flowCost(s, p, card.id, sourceId);
  const jayce = sourceId?.includes(":jayce:");
  const alternative =
    sourceId?.startsWith("hidden:") ||
    (options.additionalCostPaid && script.additionalCost?.ignoreBaseCost)
      ? { energy: 0, power: 0 }
      : permission
        ? {
            energy:
              permission.ignoreCost || permission.ignoreEnergy
                ? 0
                : (card.energy ?? 0),
            power:
              permission.powerOverride ??
              (permission.ignoreCost ? 0 : (card.power ?? 0)),
          }
        : jayce
          ? { energy: 0, power: card.power ?? 0 }
          : flow;
  const vortex =
    !!s.combat &&
    s.fields.some(
      (f) => f.id === s.combat!.fieldId && isFace(f.cardId, "VEN", 160),
    ) &&
    (sourceId?.startsWith("hidden:") ||
      script.reaction ||
      (options.locationId?.startsWith("field:") &&
        (script.ambush || script.keywords?.includes("AmbushEnemyOccupied"))));
  return costFor(
    s,
    p,
    alternative
      ? { ...card, energy: alternative.energy, power: alternative.power }
      : card,
    targetId,
    {
      flexibleCount: flex,
      flexibleEnergy: options.flexibleEnergy,
      energy: reduced.reduce((n, c) => n + (c.energy ?? 0), 0),
      anyPower: Number(!!vortex) + 2 * Number(!!options.dragonRoost),
      additionalPower: reduced.map((c) => ({
        power: c.power ?? 0,
        domains: c.domains,
      })),
      energyReduction:
        (permission?.energyReduction ?? 0) +
        (options.additionalCostPaid
          ? (script.additionalCost?.energyReduction ?? 0)
          : 0) +
        (sourceId &&
        !sourceId.startsWith("hand:") &&
        instructed?.returnZone !== "hand" &&
        discountedOutsideHand(card.id)
          ? 2
          : 0),
      floorDiscount:
        flow && isCardType(card, "Spell")
          ? 2 *
            textUnits(s).filter(
              (u) => u.owner === p && isFace(u.cardId, "VEN", 98),
            ).length
          : 0,
      allTargets: options.repeated
        ? [targetId, options.repeatedTargetId].filter(Boolean).join("~")
        : targetId,
      domains: flow
        ? (flow.domains ?? (flow.domain ? [flow.domain] : []))
        : permission?.powerOverride !== undefined
          ? []
          : card.domains,
    },
  );
}
type PowerGroup = { power: number; domains: string[] };
/** Restricted resources and board discounts apply to the source of an activation. */
function abilityCost(
  s: GameState,
  p: PlayerId,
  sourceId: string | undefined,
  energy: number,
  power: number,
  domains: string[] = [],
  anyPower = 0,
  flexibleEnergy?: number,
  empower = false,
): {
  energy: number;
  actualEnergy: number;
  unitEnergy: number;
  gearPower: number;
  power: number;
  anyPower: number;
  domains: string[];
} {
  const source = s.units.find((u) => u.id === sourceId);
  const flex =
    empower && source
      ? s.fields.filter(
          (f) => f.id === source.location && isFace(f.cardId, "VEN", 163),
        ).length
      : 0;
  if (flex && flexibleEnergy === undefined) {
    let fallback;
    for (let n = flex; n >= 0; n--) {
      const cost = abilityCost(
        s,
        p,
        sourceId,
        energy,
        power,
        domains,
        anyPower,
        n,
        empower,
      );
      fallback ??= cost;
      if (canPay(s, p, cost.energy, cost.power, domains, cost.anyPower))
        return cost;
    }
    return fallback!;
  }
  const energyPart = Math.min(energy, flexibleEnergy ?? 0);
  energy -= energyPart;
  const unit = s.units.some((u) => u.id === sourceId);
  const gear = s.gears.some((g) => g.id === sourceId);
  const actualEnergy = Math.max(
    0,
    energy - (gear ? gearAbilityDiscount(s, p) : 0),
  );
  const unitEnergy = unit
    ? Math.min(actualEnergy, s.players[p].unitEnergy ?? 0)
    : 0;
  const gearPower = gear
    ? Math.min(power + anyPower, s.players[p].gearPower ?? 0)
    : 0;
  const groups = discountPower(
    s,
    p,
    [
      { power, domains },
      { power: anyPower, domains: [] },
    ],
    gearPower + Math.max(0, flex - energyPart),
  );
  return {
    energy: actualEnergy - unitEnergy,
    actualEnergy,
    unitEnergy,
    gearPower,
    power: groups[0].power,
    anyPower: groups[1].power,
    domains,
  };
}
function payAbility(
  s: GameState,
  p: PlayerId,
  sourceId: string | undefined,
  energy: number,
  power: number,
  domains: string[] = [],
  anyPower = 0,
  flexibleEnergy?: number,
  empower = false,
) {
  const cost = abilityCost(
    s,
    p,
    sourceId,
    energy,
    power,
    domains,
    anyPower,
    flexibleEnergy,
    empower,
  );
  pay(s, p, cost.energy, cost.power, domains, cost.anyPower);
  s.players[p].unitEnergy = (s.players[p].unitEnergy ?? 0) - cost.unitEnergy;
  s.players[p].gearPower = (s.players[p].gearPower ?? 0) - cost.gearPower;
  s.players[p].powerSpentThisTurn =
    (s.players[p].powerSpentThisTurn ?? 0) + cost.gearPower;
  return cost.actualEnergy;
}
/** Matching keeps universal Power available for costs whose domains have no rune. */
function powerPayment(s: GameState, p: PlayerId, groups: PowerGroup[]) {
  const player = s.players[p];
  const required = groups.reduce((n, group) => n + group.power, 0);
  const typedCount = Object.values(player.typedPower ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  if (required > player.runes.length + (player.power ?? 0) + typedCount)
    return null;
  const slots = groups.flatMap((group) =>
    Array.from({ length: group.power }, () => group.domains),
  );
  const resources = [
    ...Object.entries(player.typedPower ?? {}).flatMap(([domain, amount]) =>
      Array.from({ length: Math.min(required, amount) }, () => ({
        id: "",
        domain,
      })),
    ),
    ...Array.from({ length: Math.min(required, player.power ?? 0) }, () => ({
      id: "",
      domain: "",
    })),
    ...[...player.runes]
      .sort((a, b) => Number(a.ready) - Number(b.ready))
      .map((r) => ({ id: r.id, domain: r.domain })),
  ];
  const assigned = resources.map(() => -1);
  function match(slot: number, seen: Set<number>): boolean {
    for (let i = 0; i < resources.length; i++) {
      if (
        seen.has(i) ||
        (resources[i].domain &&
          slots[slot].length &&
          !slots[slot].includes(resources[i].domain))
      )
        continue;
      seen.add(i);
      if (assigned[i] < 0 || match(assigned[i], seen)) {
        assigned[i] = slot;
        return true;
      }
    }
    return false;
  }
  if (!slots.every((_, i) => match(i, new Set()))) return null;
  return resources.filter((_, i) => assigned[i] >= 0);
}
function canPay(
  s: GameState,
  p: PlayerId,
  energy: number,
  power: number,
  domains: string[] = [],
  anyPower = 0,
  additionalPower: PowerGroup[] = [],
) {
  const x = s.players[p];
  return (
    x.energy +
      (s.combat ? (x.showdownEnergy ?? 0) : 0) +
      x.runes.filter((r) => r.ready).length >=
      energy &&
    powerPayment(s, p, [
      { power, domains },
      { power: anyPower, domains: [] },
      ...additionalPower,
    ]) !== null
  );
}
function pay(
  s: GameState,
  p: PlayerId,
  energy: number,
  power: number,
  domains: string[] = [],
  anyPower = 0,
  additionalPower: PowerGroup[] = [],
) {
  const x = s.players[p];
  const restricted = s.combat ? Math.min(energy, x.showdownEnergy ?? 0) : 0;
  if (restricted) x.showdownEnergy = (x.showdownEnergy ?? 0) - restricted;
  energy -= restricted;
  const stored = Math.min(energy, x.energy);
  x.energy -= stored;
  energy -= stored;
  for (const r of x.runes) {
    if (energy > 0 && r.ready) {
      r.ready = false;
      energy--;
    }
  }
  const selected = powerPayment(s, p, [
    { power, domains },
    { power: anyPower, domains: [] },
    ...additionalPower,
  ]);
  if (!selected || energy > 0) throw new Error("Unpayable cost");
  x.powerSpentThisTurn =
    (x.powerSpentThisTurn ?? 0) +
    power +
    anyPower +
    additionalPower.reduce((sum, group) => sum + group.power, 0);
  const ids = new Set(selected.map((r) => r.id).filter(Boolean));
  recycleRunes(
    s,
    p,
    x.runes.filter((r) => ids.has(r.id)).map((r) => r.domain),
  );
  x.runes = x.runes.filter((r) => !ids.has(r.id));
  for (const resource of selected.filter((r) => !r.id)) {
    if (resource.domain) x.typedPower![resource.domain]--;
    else x.power = (x.power ?? 0) - 1;
  }
}
function channel(s: GameState, p: PlayerId, n: number, ready = true) {
  const x = s.players[p];
  const count = Math.min(n, x.runeDeck.length);
  for (let i = 0; i < count; i++)
    x.runes.push({ id: uid(s, "r"), domain: x.runeDeck.shift()!, ready });
  if (count)
    log(
      s,
      `${x.name} channels ${count} rune(s) ${ready ? "ready" : "exhausted"}.`,
      "info",
      p,
    );
}
function point(
  s: GameState,
  p: PlayerId,
  reason: string,
  scoring?: "hold" | "conquer",
) {
  if (
    s.units.some(
      (u) =>
        u.owner !== p &&
        u.location.startsWith("field:") &&
        getKeywords(s, u).includes("No enemy scoring"),
    )
  )
    return;
  if (
    scoring &&
    playerTurnNumber(s, p) <= 2 &&
    textUnits(s).some((u) => isFace(u.cardId, "VEN", 53))
  ) {
    draw(s, p, 1);
    log(
      s,
      `${s.players[p].name} draws instead of scoring because of Otterpus.`,
      "score",
      p,
    );
    return;
  }
  s.players[p].points++;
  log(
    s,
    `${s.players[p].name}: ${s.players[p].points} / ${getVictoryScore(s)} — ${reason}`,
    "score",
    p,
    undefined,
    {
      score: {
        player: p,
        from: s.players[p].points - 1,
        to: s.players[p].points,
        kind: scoring ?? "effect",
        fieldId: scoring ? stepEffects.get(s)?.locationId : undefined,
      },
    },
  );
  checkVictory(s);
  if (s.winner === null)
    event(s, "score", p, s.players[p].legendId, "legend", undefined, {
      amount: 1,
    });
}
/** Core 321/323/472: a resolving chain item completes before victory cleanup. */
function checkVictory(s: GameState) {
  if (
    s.winner !== null ||
    executingEffects.has(s) ||
    s.pendingChoice ||
    s.resolving?.length ||
    s.resolvingAbilities?.length
  )
    return;
  const winner = s.players.find(
    (p) =>
      p.points >= getVictoryScore(s) &&
      p.points > s.players[otherPlayer(p.id)].points,
  );
  if (winner) {
    s.winner = winner.id;
    s.phase = "ended";
    log(s, `${winner.name} wins the match.`, "score", winner.id);
  }
}
function draw(s: GameState, p: PlayerId, n: number) {
  const x = s.players[p];
  const before = x.hand.length;
  for (let i = 0; i < n && s.winner === null; i++) {
    let safety = 0;
    while (!x.deck.length && s.winner === null && safety++ < 10) {
      x.fatigue++;
      point(s, otherPlayer(p), "opponent burnout");
      if (s.winner !== null) break;
      x.deck = shuffle(s, emptyTrash(s, p));
    }
    if (x.deck.length) x.hand.push(x.deck.shift()!);
  }
  if (x.hand.length > before) {
    log(
      s,
      `${x.name} draws ${x.hand.length - before} card(s).`,
      "info",
      p,
      undefined,
      {
        draw: {
          player: p,
          count: x.hand.length - before,
          // Opponent card identities never enter presentation metadata.
          ...(p === 0 ? { cardIds: x.hand.slice(before) } : {}),
        },
      },
    );
    if (s.phase !== "mulligan")
      event(s, "draw", p, x.legendId, "legend", undefined, {
        amount: x.hand.length - before,
      });
  }
}
function createPlayer(
  id: PlayerId,
  deckId: string,
  imported?: StarterDeck,
): PlayerState {
  const d =
    imported ?? decks.find((x) => x.id === deckId) ?? decks[id % decks.length];
  const deckIds = [
    d.legendId,
    d.championId,
    ...(d.battlefieldIds?.length ? d.battlefieldIds : [d.battlefieldId]),
    ...d.main.map((entry) => entry.cardId),
    ...d.runes.map((entry) => entry.cardId),
  ];
  const missing = [...new Set(deckIds)].filter(
    (cardId) => !isImplemented(cardId),
  );
  if (missing.length)
    throw new Error(`Deck contains unsupported cards: ${missing.join(", ")}`);
  const main = d.main.flatMap(
    (x) => Array(x.count).fill(getRulesCardId(x.cardId)) as string[],
  );
  return {
    id,
    name: id === 0 ? "You" : "Nexus AI",
    deckId: d.id,
    legendId: getRulesCardId(d.legendId),
    championId: getRulesCardId(d.championId),
    championAvailable: true,
    deck: main,
    deckList: [...main].sort(),
    runeList: d.runes
      .flatMap(
        (e) => Array(e.count).fill(getCard(e.cardId).domains[0]) as string[],
      )
      .sort(),
    hand: [],
    discard: [],
    banished: [],
    runes: [],
    runeDeck: d.runes.flatMap(
      (e) => Array(e.count).fill(getCard(e.cardId).domains[0]) as string[],
    ),
    energy: 0,
    points: 0,
    conqueredThisTurn: [],
    scoredFieldsThisTurn: [],
    cardsPlayedThisTurn: 0,
    hasBegun: false,
    mulliganDone: false,
    fatigue: 0,
    legendUsedTurn: -1,
  };
}
export function createGame(options: GameOptions = {}): GameState {
  const seed = (options.seed ?? Date.now()) >>> 0 || 1;
  const s: GameState = {
    version: 1,
    revision: 0,
    botSettings: {
      difficulty: options.botDifficulty ?? "normal",
      seed: options.botSeed ?? 20261006,
    },
    matchConfig: {
      formatId: "duel-lab-supported-1v1",
      rulesVersion: "core-2026-07-16+vendetta-faq-2026-08-14",
      cardDataVersion: catalogMeta.cardDataSha256,
      supportedCardIds: cards
        .filter((c) => isImplemented(c.id))
        .map((c) => c.id)
        .sort(),
      openDecklists: options.openDecklists ?? false,
    },
    seed,
    rng: seed,
    turn: 0,
    currentPlayer: options.firstPlayer ?? 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    chainStarter: null,
    phase: "mulligan",
    players: [
      createPlayer(0, options.playerDeckId ?? "annie", options.playerDeck),
      createPlayer(1, options.botDeckId ?? "lux", options.botDeck),
    ],
    fields: [
      { id: "field:0", cardId: "ogn-275-298", controller: null },
      { id: "field:1", cardId: "ogn-280-298", controller: null },
    ],
    units: [],
    gears: [],
    hidden: [],
    stack: [],
    consecutivePasses: 0,
    combat: null,
    pendingMove: null,
    pendingChoice: null,
    winner: null,
    log: [],
    nextId: 1,
  };
  const selectedDecks = [
    options.playerDeck ?? decks.find((d) => d.id === s.players[0].deckId)!,
    options.botDeck ?? decks.find((d) => d.id === s.players[1].deckId)!,
  ];
  for (const [i, d] of selectedDecks.entries()) {
    const candidates = d.battlefieldIds?.length
      ? d.battlefieldIds
      : [d.battlefieldId];
    const selected =
      i === 0 ? options.playerBattlefieldId : options.botBattlefieldId;
    if (
      selected &&
      (!isCardType(getCard(selected), "Battlefield") ||
        !isImplemented(selected))
    )
      throw new Error("Choose a supported battlefield.");
    // Preserve the shuffle sequence when a field is explicitly chosen.
    const fallback = candidates[Math.floor(random(s) * candidates.length)];
    s.fields[i].cardId = getRulesCardId(selected ?? fallback);
  }
  for (const p of s.players) {
    p.deck = shuffle(s, p.deck);
    p.runeDeck = shuffle(s, p.runeDeck);
    draw(s, p.id, 4);
  }
  log(s, "Duel initialized. Each player may replace up to two cards.");
  return s;
}
function scoreField(
  s: GameState,
  p: PlayerId,
  field: LocationId,
  hold: boolean,
) {
  const index = Number(field.split(":")[1]),
    x = s.players[p];
  const cannotScore =
    isFace(s.fields[index].cardId, "SFD", 209) && playerTurnNumber(s, p) < 3;
  if (x.scoredFieldsThisTurn.includes(index)) return;
  x.scoredFieldsThisTurn.push(index);
  if (!hold) x.conqueredThisTurn.push(index);
  withStepEffect(
    s,
    {
      cardId: s.fields.find((f) => f.id === field)?.cardId,
      sourceId: field,
      locationId: field,
      player: p,
      type: "score",
      stage: "applied",
      scoring: hold ? "hold" : "conquer",
    },
    () => {
      if (cannotScore) return;
      if (
        !hold &&
        x.points >= getVictoryScore(s) - 1 &&
        x.scoredFieldsThisTurn.length < s.fields.length
      ) {
        draw(s, p, 1);
        log(
          s,
          `${x.name} conquers: draw 1 instead of the final point. Hold or score both battlefields to win.`,
          "score",
          p,
        );
      } else
        point(
          s,
          p,
          hold ? "holding a battlefield" : "conquering a battlefield",
          hold ? "hold" : "conquer",
        );
    },
  );
  if (s.winner !== null) return;
  // Additional triggers are additive, and never repeat the normal score action.
  const scoreRepeats =
    1 +
    textUnits(s).filter(
      (u) =>
        u.owner === p &&
        u.location === field &&
        isFace(u.cardId, "UNL", hold ? 87 : 29),
    ).length;
  scoreTriggerRepeats.set(s, { player: p, count: scoreRepeats });
  try {
    if (
      !hold &&
      x.legendId === "ogs-023-024" &&
      s.units.filter((u) => u.owner === p && u.location === field).length >= 4
    )
      pushStack(s, {
        player: p,
        cardId: x.legendId,
        effects: [{ type: "draw", amount: 2 }],
        kind: "trigger",
      });
    for (const u of [...s.units].filter(
      (u) => u.owner === p && u.location === field,
    )) {
      for (const effects of unitTriggerEffects(
        s,
        u,
        hold ? "onHold" : "onConquer",
      ))
        trigger(s, p, u.cardId, u.id, textEffects(u, effects), field);
    }
    event(
      s,
      hold ? "hold" : "conquer",
      p,
      s.fields.find((f) => f.id === field)!.cardId,
      field,
      field,
    );
    const crossIds = new Set(
      s.gears
        .filter(
          (g) =>
            g.attachedTo &&
            isFace(g.cardId, "SFD", 30) &&
            s.units.some(
              (u) =>
                u.id === g.attachedTo && u.owner === p && u.location === field,
            ),
        )
        .map((g) => g.attachedTo!),
    );
    if (crossIds.size) {
      const shadow = structuredClone(s);
      laterCardEvent(
        shadow,
        hold ? "conquer" : "hold",
        p,
        s.fields.find((f) => f.id === field)!.cardId,
        field,
        field,
        {
          ...context(undefined, field, field),
          trigger: (_state, player, card, source, effects, location) => {
            if (crossIds.has(source))
              trigger(s, player, card, source, effects, location);
          },
          pushStack: (_state, item) => {
            if (item.sourceId && crossIds.has(item.sourceId))
              pushStack(s, item);
          },
        },
      );
    }
    const fieldCard = s.fields.find((f) => f.id === field)!;
    const fieldEffects = hold
      ? getScript(fieldCard.cardId)?.onHold
      : getScript(fieldCard.cardId)?.onConquer;
    if (fieldEffects)
      trigger(s, p, fieldCard.cardId, field, fieldEffects, field);
    if (hold) {
      const f = s.fields.find((f) => f.id === field)!;
      if (
        f.cardId === "ogn-293-298" &&
        s.units.filter((u) => u.owner === p && u.location === field).length >= 7
      ) {
        s.winner = p;
        s.phase = "ended";
        log(s, "The Grand Plaza wins the game.", "score", p);
        return;
      }
      if (f.cardId === "ogn-275-298")
        pushStack(s, {
          player: p,
          cardId: f.cardId,
          sourceId: f.id,
          effects: [{ type: "token", amount: 1, location: "here" }],
          locationId: base(p),
          kind: "trigger",
        });
      if (f.cardId === "ogn-280-298")
        pushStack(s, {
          player: p,
          cardId: f.cardId,
          sourceId: f.id,
          effects: [{ type: "draw", amount: 1 }],
          kind: "trigger",
        });
    }
  } finally {
    scoreTriggerRepeats.delete(s);
  }
}
function beginTurn(s: GameState, p: PlayerId) {
  s.turnStep = "awaken";
  s.turn++;
  s.currentPlayer = p;
  s.priorityPlayer = p;
  s.focusPlayer = p;
  s.phase = "main";
  s.consecutivePasses = 0;
  s.chainStarter = null;
  for (const x of s.players) {
    x.scoredFieldsThisTurn = [];
    x.conqueredThisTurn = [];
    x.cardsPlayedThisTurn = 0;
    x.spellsPlayedThisTurn = 0;
    x.powerSpentThisTurn = 0;
    x.discardedThisTurn = 0;
    x.buffBonus = 0;
    x.energy = 0;
    x.spellEnergy = 0;
    x.spellPower = 0;
    x.gearPower = 0;
    x.nextSpellBonus = 0;
    x.nextCardEnergyDiscount = 0;
    x.nextCardPowerDiscount = 0;
    x.unitEnergy = 0;
    x.grantedFlow = [];
    x.showdownEnergy = 0;
    x.typedPower = {};
    x.power = 0;
  }
  const x = s.players[p];
  const readied = s.units.filter(
    (u) =>
      u.owner === p && !u.ready && !getKeywords(s, u).includes("Cannot ready"),
  );
  for (const r of x.runes) r.ready = true;
  for (const u of s.units.filter((u) => u.owner === p)) {
    if (!getKeywords(s, u).includes("Cannot ready")) u.ready = true;
    u.usedAbilities = [];
  }
  for (const g of s.gears.filter((g) => g.owner === p)) {
    g.ready = true;
    g.usedAbilities = [];
  }
  x.legendUsedTurn = -1;
  log(s, `Turn ${s.turn} — ${x.name}: ready units, gear and runes.`, "turn", p);
  for (const unit of readied)
    event(s, "ready", p, unit.cardId, unit.id, unit.location);
  if (s.stack.length || s.pendingChoice || s.pendingTriggers?.length) {
    s.pendingAwaken = p;
    drainTriggers(s);
    return;
  }
  startBeginning(s, p);
}
function startBeginning(s: GameState, p: PlayerId) {
  s.turnStep = "beginning";
  recordStep(s, "Beginning: resolve start-of-turn effects and holding points.");
  const x = s.players[p];
  s.pendingBeginning = p;
  event(s, "beginning", p, x.legendId, "legend");
  killUnits(
    s,
    s.units
      .filter(
        (u) =>
          u.owner === p &&
          u.temporary &&
          !s.units.some(
            (v) =>
              v.owner === p &&
              v.location === u.location &&
              v.location.startsWith("field:") &&
              getKeywords(s, v).includes("Suppress friendly Temporary"),
          ),
      )
      .map((u) => u.id),
  );
  for (const g of [...s.gears].filter(
    (g) => g.owner === p && g.temporary && !g.attachedTo,
  ))
    killGear(s, g.id);
  for (const source of [
    { cardId: x.legendId, id: "legend" },
    ...s.gears.filter((g) => g.owner === p),
    ...textUnits(s).filter((u) => u.owner === p),
  ]) {
    const effects = getScript(source.cardId)?.onBegin;
    if (effects)
      trigger(
        s,
        p,
        source.cardId,
        source.id,
        textEffects(source, effects),
        s.units.find((u) => u.id === source.id)?.location ?? base(p),
      );
  }
  if (!s.stack.length && !s.pendingChoice) {
    delete s.pendingBeginning;
    finishBeginning(s, p);
  }
}
function finishBeginning(s: GameState, p: PlayerId) {
  for (const f of s.fields) {
    if (
      f.controller === p &&
      s.units.some((u) => u.owner === p && u.location === f.id)
    ) {
      scoreField(s, p, f.id, true);
      if (s.winner !== null) return;
    }
  }
  if (s.stack.length || s.pendingChoice || s.pendingTriggers?.length) {
    s.pendingTurnStart = p;
    return;
  }
  finishTurnStart(s, p);
}
function finishTurnStart(s: GameState, p: PlayerId) {
  const x = s.players[p];
  s.turnStep = "channel";
  const hadRunes = x.runeDeck.length > 0;
  channel(
    s,
    p,
    textUnits(s).some(
      (u) => isFace(u.cardId, "VEN", 36) && u.location.startsWith("field:"),
    )
      ? 1
      : !x.hasBegun && s.turn === 2
        ? 3
        : 2,
  );
  // Keep C visible even when the rune deck is empty.
  if (!hadRunes) recordStep(s, "Channel: no runes left in the rune deck.");
  x.hasBegun = true;
  s.turnStep = "draw";
  if (!s.gears.some((g) => g.owner === p && isFace(g.cardId, "VEN", 22)))
    draw(s, p, 1);
  for (const player of s.players) {
    player.energy = 0;
    player.spellEnergy = 0;
    player.spellPower = 0;
    player.gearPower = 0;
    player.gearPlayPermissions = [];
    delete player.enemyChoices;
    player.unitEnergy = 0;
    player.showdownEnergy = 0;
    player.typedPower = {};
    player.power = 0;
  }
  s.turnStep = "main";
  event(s, "main", p, x.legendId, "legend");
}
function protectedFrom(s: GameState, u: Unit, p: PlayerId) {
  return (
    u.owner !== p &&
    (u.untargetableByEnemy || getKeywords(s, u).includes("Untargetable"))
  );
}
function matches(
  s: GameState,
  u: Unit,
  p: PlayerId,
  filter: TargetFilter,
  location?: LocationId,
  max?: number,
) {
  const own = u.owner === p;
  if (protectedFrom(s, u, p)) return false;
  if (max !== undefined && getMight(s, u) > max) return false;
  switch (filter) {
    case "unitInBase":
      return u.location.startsWith("base:");
    case "attackingUnit":
      return (
        s.combat?.attacker === u.owner &&
        s.combat.fieldId === u.location &&
        (s.combat.engaged ?? true) &&
        (!s.combat.designatedUnits || s.combat.designatedUnits.includes(u.id))
      );
    case "unitOrGear":
      return u.location.startsWith("field:");
    case "enemyUnitOrGear":
      return !own;
    case "anyUnit":
      return true;
    case "enemyAttackingUnit":
      return (
        !own &&
        s.combat?.attacker === u.owner &&
        s.combat.fieldId === u.location
      );
    case "enemyUnitInBase":
      return !own && u.location.startsWith("base:");
    case "enemyUnit":
      return !own;
    case "friendlyUnitThreatenedByFury":
      return (
        own &&
        ((s.combat?.engaged &&
          s.combat.fieldId === u.location &&
          (!s.combat.designatedUnits ||
            s.combat.designatedUnits.includes(u.id)) &&
          s.units.some(
            (v) =>
              v.owner !== p &&
              v.location === u.location &&
              getCard(v.cardId).domains.includes("Fury") &&
              (!s.combat!.designatedUnits ||
                s.combat!.designatedUnits.includes(v.id)),
          )) ||
          s.stack.some(
            (item) =>
              item.player !== p &&
              item.kind === "spell" &&
              getCard(item.cardId).domains.includes("Fury") &&
              ((item.targetId ?? "").split("~").includes(u.id) ||
                item.effects.some((e) =>
                  (e.chosenTargetId ?? "").split("~").includes(u.id),
                )),
          ))
      );
    case "friendlyUnit":
      return own;
    case "friendlyUnitWithoutTemporary":
      return own && !u.temporary && !getKeywords(s, u).includes("Temporary");
    case "friendlyBuffableUnit":
      return own && u.buff === 0;
    case "friendlyDamagedUnit":
      return own && u.damage > 0;
    case "friendlyReadyUnit":
      return own && u.ready;
    case "friendlyExhaustedUnit":
      return own && !u.ready;
    case "enemySmallUnit":
      return !own && getMight(s, u) <= (max ?? 3);
    case "friendlyUnitHere":
      return own && u.location === location;
    case "unitHere":
      return u.location === location;
    case "enemyUnitAtBattlefield":
      return !own && u.location.startsWith("field:");
    case "enemyUnitHere":
      return !own && u.location === location;
    case "unitAtBattlefield":
      return u.location.startsWith("field:");
    case "friendlyUnitAtBattlefield":
      return own && u.location.startsWith("field:");
    default:
      return false;
  }
}
function effectTargetMatches(
  s: GameState,
  object: Unit | Gear,
  e: Effect,
  sourceId?: string,
) {
  const c = getCard(object.cardId);
  const location = "location" in object ? object.location : base(object.owner);
  const source = s.units.find((u) => u.id === sourceId);
  return (
    (!e.targetDomain ||
      c.domains.some((domain) => domain === e.targetDomain)) &&
    (!e.targetLocations || e.targetLocations.includes(location)) &&
    (e.targetEmpowered === undefined ||
      Boolean(object.empowered) === e.targetEmpowered) &&
    (!e.targetDifferentLocationFromSource ||
      (source && location !== source.location)) &&
    (!e.excludeTag || !c.tags.includes(e.excludeTag)) &&
    (e.custom !== "wave15:dragons-duel" || object.id !== e.cardName) &&
    (e.condition !== "namedTag" ||
      getUnitTags(object).includes(
        s.gears.find((g) => g.id === sourceId)?.namedTag ?? "",
      )) &&
    (!e.lessMightThanSource ||
      (source &&
        "location" in object &&
        getMight(s, object) < getMight(s, source)))
  );
}
function* iterateTargets(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  location?: LocationId,
  sourceId?: string,
): Generator<string | undefined> {
  const e = effects.find((e) => e.target);
  if (!e) {
    yield undefined;
    return;
  }
  if (e.target === "boardCards") {
    if (
      !e.upTo &&
      e.targetCount &&
      boardCandidates(s, p, e, sourceId, location).length < e.targetCount
    )
      return;
    // The draft enumerates individual objects, never the board's power set.
    yield undefined;
    return;
  }
  if (
    e.target === "enemyChainItemChoosingFriendly" ||
    e.target === "friendlyUnitAndEnemyChainItem"
  ) {
    yield* s.stack
      .filter((item) => item.player !== p)
      .flatMap((item) => {
        const chosen = item.effects.flatMap((effect) =>
          effect.target
            ? (effect.chosenTargetId ?? item.targetId ?? "").split("~")
            : [],
        );
        const units = s.units.filter(
          (u) => u.owner === p && chosen.includes(u.id),
        );
        const gears = s.gears.filter(
          (g) => g.owner === p && chosen.includes(g.id),
        );
        if (e.target === "enemyChainItemChoosingFriendly")
          return units.length || gears.length ? [item.id] : [];
        return units.length === 1 && units[0].location.startsWith("field:")
          ? [`${units[0].id}~${item.id}`]
          : [];
      });
    return;
  }
  if (e.target === "trashCards") {
    if ((e.targetCount ?? 1) > 1) {
      yield undefined;
      return;
    }
    yield* [
      ...trashTargets(s, p, e)
        .filter(
          (card) =>
            e.condition !== "costBelowPoints" ||
            (getCard(card.cardId).energy ?? 0) < s.players[p].points,
        )
        .map((card) => card.id),
      ...(e.upTo ? [undefined] : []),
    ];
    return;
  }
  if (e.custom === "wave15:call-battle") {
    for (const u of s.units.filter((u) => u.owner === p))
      for (const f of s.fields.filter((f) => f.controller === p))
        if (u.location !== f.id) yield `${u.id}~${f.id}`;
    return;
  }
  if (["relentlessMove", "shurikenMove"].includes(e.target!)) {
    for (const u of s.units.filter((u) => u.owner === p))
      for (const to of [base(p), ...s.fields.map((f) => f.id)].filter(
        (to) => to !== u.location,
      )) {
        yield `${u.id}~${to}`;
        if (e.target === "relentlessMove")
          for (const gear of s.gears.filter(
            (g) => g.owner === p && getUnitTags(g).includes("Equipment"),
          ))
            yield `${u.id}~${to}~${gear.id}`;
        else
          for (const enemy of s.units.filter(
            (x) =>
              x.owner !== p &&
              x.location.startsWith("field:") &&
              !protectedFrom(s, x, p),
          ))
            yield `${u.id}~${to}~${enemy.id}`;
      }
    return;
  }
  if (e.target === "friendlyAndEnemyBattlefield") {
    for (const u of s.units.filter((u) => u.owner === p))
      for (const enemy of s.units.filter(
        (u) =>
          u.owner !== p &&
          u.location.startsWith("field:") &&
          !protectedFrom(s, u, p),
      ))
        yield `${u.id}~${enemy.id}`;
    return;
  }
  const units = s.units.filter((u) => effectTargetMatches(s, u, e, sourceId));
  const gears = s.gears.filter((g) => effectTargetMatches(s, g, e, sourceId));
  if (e.target === "empowerObject") {
    yield* [
      ...units.filter((u) => !protectedFrom(s, u, p)).map((u) => u.id),
      ...gears.map((g) => g.id),
      "legend:0",
      "legend:1",
    ];
    return;
  }
  if (e.target === "enemyMoveDestination") {
    for (const u of units.filter(
      (u) => u.owner !== p && !protectedFrom(s, u, p),
    ))
      for (const to of [base(u.owner), ...s.fields.map((f) => f.id)])
        if (to !== u.location) yield `${u.id}~${to}`;
    return;
  }
  if (
    e.target === "enemyAndOptionalFriendly" ||
    e.target === "friendlyAndOptionalEnemy"
  ) {
    const friendly = units.filter((u) => u.owner === p),
      enemy = units.filter(
        (u) =>
          u.owner !== p &&
          u.location.startsWith("field:") &&
          !protectedFrom(s, u, p),
      );
    const first = e.target === "enemyAndOptionalFriendly" ? enemy : friendly;
    const second = e.target === "enemyAndOptionalFriendly" ? friendly : enemy;
    for (const a of first) {
      yield a.id;
      for (const b of second) yield `${a.id}~${b.id}`;
    }
    return;
  }
  if (e.target === "ownTeemo") {
    yield* [
      ...(s.players[p].championAvailable &&
      getCard(s.players[p].championId).tags.includes("Teemo")
        ? [`champion:${p}`]
        : []),
      ...units
        .filter((u) => u.owner === p && getUnitTags(u).includes("Teemo"))
        .map((u) => u.id),
    ];
    return;
  }
  if (e.target === "exhaustedOther") {
    yield* [
      ...units
        .filter((u) => u.id !== sourceId && !u.ready && !protectedFrom(s, u, p))
        .map((u) => u.id),
      ...gears.filter((g) => g.id !== sourceId && !g.ready).map((g) => g.id),
      ...s.players.flatMap((x) => [
        ...x.runes.filter((r) => !r.ready).map((r) => r.id),
        ...(x.legendUsedTurn >= 0 && !(sourceId === "legend" && x.id === p)
          ? [`legend:${x.id}`]
          : []),
      ]),
    ];
    return;
  }
  if (e.target === "unitAndEquipment") {
    yield* units
      .filter(
        (u) =>
          !protectedFrom(s, u, p) &&
          (e.condition !== "azirSwap" || u.owner === p),
      )
      .flatMap((u) => [
        ...(e.condition === "azirSwap" ? [u.id] : []),
        ...gears
          .filter(
            (g) =>
              g.owner === u.owner &&
              (e.condition !== "friendlyPair" || g.owner === p) &&
              getUnitTags(g).includes("Equipment") &&
              (e.condition !== "detachedFriendly" ||
                (g.owner === p && !g.attachedTo)) &&
              (e.condition !== "attachedFriendly" ||
                (g.owner === p && !!g.attachedTo)) &&
              (e.condition !== "azirSwap" || g.attachedTo === u.id) &&
              (e.condition !== "attachedToChosen" || g.attachedTo === u.id),
          )
          .map((g) => `${u.id}~${g.id}`),
      ]);
    return;
  }
  if (e.target === "spell") {
    yield* s.stack
      .filter(
        (item) =>
          item.kind === "spell" &&
          (e.maxEnergy === undefined ||
            (getCard(item.cardId).energy ?? 0) <= e.maxEnergy) &&
          (e.maxPower === undefined ||
            (getCard(item.cardId).power ?? 0) <= e.maxPower),
      )
      .map((item) => item.id);
    return;
  }
  if (e.target === "battlefield") {
    yield* s.fields.map((f) => f.id);
    return;
  }
  if (
    [
      "friendlyBaseAndBattlefield",
      "friendlyUnitAndBattlefield",
      "friendlyUnitAndBaseMove",
    ].includes(e.target!)
  ) {
    {
      yield* units
        .filter(
          (u) =>
            u.owner === p &&
            (e.target !== "friendlyBaseAndBattlefield" ||
              u.location === base(p)),
        )
        .flatMap((u) =>
          (e.target === "friendlyUnitAndBaseMove" && u.location !== base(p)
            ? [base(p)]
            : s.fields.map((f) => f.id)
          ).map((f) => `${u.id}~${f}`),
        );
      return;
    }
  }
  if (e.target === "enemyUnitAndOccupiedLocation") {
    yield* units
      .filter((u) => u.owner !== p && !protectedFrom(s, u, p))
      .flatMap((u) =>
        [
          ...new Set(
            s.units.filter((v) => v.owner === u.owner).map((v) => v.location),
          ),
        ]
          .filter((f) => f !== u.location)
          .map((f) => `${u.id}~${f}`),
      );
    return;
  }
  if (e.target === "enemyHereAndDifferentBattlefield") {
    const source = s.units.find((u) => u.id === sourceId);
    {
      yield* units
        .filter(
          (u) =>
            source &&
            u.owner !== p &&
            !protectedFrom(s, u, p) &&
            u.location === source.location &&
            getMight(s, u) < getMight(s, source),
        )
        .flatMap((u) =>
          s.fields
            .filter((f) => f.id !== u.location)
            .map((f) => `${u.id}~${f.id}`),
        );
      return;
    }
  }
  if (e.target === "friendlyBattlefieldAndOptionalEnemy") {
    yield* s.fields
      .filter((f) => s.units.some((u) => u.owner === p && u.location === f.id))
      .flatMap((f) => [
        f.id,
        ...units
          .filter(
            (u) =>
              u.owner !== p && u.location !== f.id && !protectedFrom(s, u, p),
          )
          .map((u) => `${f.id}~${u.id}`),
      ]);
    return;
  }
  if (e.target === "battlefieldUnitAndOptionalOther") {
    yield* units
      .filter((u) => u.location.startsWith("field:") && !protectedFrom(s, u, p))
      .flatMap((u) => [
        u.id,
        ...units
          .filter((v) => v.id !== u.id && !protectedFrom(s, v, p))
          .map((v) => `${u.id}~${v.id}`),
      ]);
    return;
  }
  if (
    e.target === "upToThreeUnitsSameLocation" ||
    e.target === "upToFourFriendlyUnits"
  ) {
    const eligible = units.filter(
      (u) =>
        !protectedFrom(s, u, p) &&
        (e.target !== "upToFourFriendlyUnits" || u.owner === p),
    );
    yield undefined;
    function* visit(chosen: Unit[], start: number): Generator<string> {
      if (chosen.length) yield chosen.map((u) => u.id).join("~");
      if (chosen.length === (e!.target === "upToFourFriendlyUnits" ? 4 : 3))
        return;
      for (let i = start; i < eligible.length; i++)
        if (
          !chosen.length ||
          e!.target === "upToFourFriendlyUnits" ||
          eligible[i].location === chosen[0].location
        )
          yield* visit([...chosen, eligible[i]], i + 1);
    }
    yield* visit([], 0);
    return;
  }
  if (e.target === "friendlyAndWeakerEnemy") {
    yield* units
      .filter((u) => u.owner === p)
      .flatMap((u) =>
        units
          .filter(
            (v) =>
              v.owner !== p &&
              !protectedFrom(s, v, p) &&
              getMight(s, v) < getMight(s, u),
          )
          .map((v) => `${u.id}~${v.id}`),
      );
    return;
  }
  if (e.target === "upToOneEnemyUnitHere") {
    yield* [
      undefined,
      ...units
        .filter(
          (u) =>
            u.owner !== p && u.location === location && !protectedFrom(s, u, p),
        )
        .map((u) => u.id),
    ];
    return;
  }
  if (e.target === "twoUnitChoices") {
    const eligible = units.filter((u) => !protectedFrom(s, u, p));
    {
      yield* eligible.flatMap((a) => eligible.map((b) => `${a.id}~${b.id}`));
      return;
    }
  }
  if (
    e.target === "twoUnitsSameBattlefield" ||
    e.target === "twoFriendlyDifferentLocations"
  ) {
    const eligible = units.filter(
      (u) =>
        !protectedFrom(s, u, p) &&
        (e.target === "twoUnitsSameBattlefield"
          ? u.location.startsWith("field:")
          : u.owner === p),
    );
    {
      yield* eligible.flatMap((a, i) =>
        (e.target === "twoFriendlyDifferentLocations"
          ? eligible.filter((b) => b.id !== a.id)
          : eligible.slice(i + 1)
        )
          .filter((b) =>
            e.target === "twoUnitsSameBattlefield"
              ? a.location === b.location
              : a.location !== b.location,
          )
          .map((b) => `${a.id}~${b.id}`),
      );
      return;
    }
  }
  if (e.target === "twoGear") {
    yield* gears.flatMap((a, index) =>
      gears.slice(index + 1).map((b) => `${a.id}~${b.id}`),
    );
    return;
  }
  if (
    ["anyTwoUnits", "orderedTwoUnits", "orderedTwoFriendlyUnits"].includes(
      e.target!,
    )
  ) {
    const eligible = units.filter(
      (u) =>
        !protectedFrom(s, u, p) &&
        (e.target !== "orderedTwoFriendlyUnits" || u.owner === p),
    );
    {
      yield* eligible.flatMap((a, i) =>
        (e.target === "anyTwoUnits"
          ? eligible.slice(i + 1)
          : eligible.filter((b) => b.id !== a.id)
        ).map((b) => `${a.id}~${b.id}`),
      );
      return;
    }
  }
  if (e.target === "enemyUnitAndBattlefield") {
    yield* units
      .filter(
        (u) =>
          u.owner !== p &&
          u.location.startsWith("field:") &&
          !protectedFrom(s, u, p),
      )
      .map((u) => `${u.location}~${u.id}`);
    return;
  }
  if (e.target === "enemyUnitOrGear") {
    yield* [
      ...units
        .filter((u) => u.owner !== p && !protectedFrom(s, u, p))
        .map((u) => u.id),
      ...gears.filter((g) => g.owner !== p).map((g) => g.id),
    ];
    return;
  }
  if (e.target === "unitAndSpell") {
    yield* units
      .filter((u) => u.owner === p)
      .flatMap((u) =>
        s.stack.filter((i) => i.kind === "spell").map((i) => `${u.id}~${i.id}`),
      );
    return;
  }
  if (e.target === "upToTwoUnits" || e.target === "upToTwoFriendlyUnits") {
    const eligible = units.filter(
      (u) =>
        (e.target === "upToTwoUnits" || u.owner === p) &&
        !protectedFrom(s, u, p),
    );
    {
      yield* [
        undefined,
        ...eligible.map((u) => u.id),
        ...eligible.flatMap((u, i) =>
          eligible.slice(i + 1).map((v) => `${u.id}~${v.id}`),
        ),
      ];
      return;
    }
  }
  if (e.target === "twoFriendlyUnits") {
    const eligible = units.filter((u) => u.owner === p);
    {
      yield* eligible.flatMap((u, i) =>
        eligible.slice(i + 1).map((v) => `${u.id}~${v.id}`),
      );
      return;
    }
  }
  if (e.target === "unitOrGear") {
    yield* [
      ...units
        .filter(
          (u) => u.location.startsWith("field:") && !protectedFrom(s, u, p),
        )
        .map((u) => u.id),
      ...gears.map((g) => g.id),
    ];
    return;
  }
  if (
    [
      "duel",
      "duelSameBattlefield",
      "duelEnemyAtBattlefield",
      "friendlyAndEnemyHere",
    ].includes(e.target!)
  ) {
    yield* units
      .filter((u) => u.owner === p)
      .flatMap((a) =>
        units
          .filter(
            (u) =>
              u.owner !== p &&
              !protectedFrom(s, u, p) &&
              (e.target !== "duelSameBattlefield" ||
                (a.location.startsWith("field:") &&
                  u.location === a.location)) &&
              (e.target !== "duelEnemyAtBattlefield" ||
                u.location.startsWith("field:")) &&
              (e.target !== "friendlyAndEnemyHere" ||
                u.location === a.location),
          )
          .map((b) => a.id + "~" + b.id),
      );
    return;
  }
  if (
    e.target === "enemyGear" ||
    e.target === "anyGear" ||
    e.target === "friendlyEquipment"
  ) {
    yield* [
      ...gears
        .filter(
          (g) =>
            (e.target === "friendlyEquipment"
              ? g.owner === p && getUnitTags(g).includes("Equipment")
              : e.target === "anyGear" || g.owner !== p) &&
            (e.maxEnergy === undefined ||
              (getCard(g.cardId).energy ?? 0) <= e.maxEnergy),
        )
        .map((g) => g.id),
      ...(e.optional ? [undefined] : []),
    ];
    return;
  }
  {
    yield* units
      .filter((u) => matches(s, u, p, e.target!, location, e.maxMight))
      .map((u) => u.id);
    return;
  }
}
function targets(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  location?: LocationId,
  sourceId?: string,
) {
  return [...iterateTargets(s, p, effects, location, sourceId)];
}
function targetLabel(s: GameState, id?: string): string {
  if (!id) return "";
  if (/^(champion|legend):[01]$/.test(id)) {
    const [zone, owner] = id.split(":");
    return (
      " → " +
      cardName(
        zone === "champion"
          ? s.players[Number(owner)].championId
          : s.players[Number(owner)].legendId,
      )
    );
  }
  const rune = s.players.flatMap((p) => p.runes).find((r) => r.id === id);
  if (rune) return ` → ${rune.domain} rune`;
  if (id.startsWith("field:") && !id.includes("~"))
    return " → " + locationName(id as LocationId);
  if (id.includes("~"))
    return id
      .split("~")
      .map((part) => targetLabel(s, part))
      .join(" fights");
  const x =
    s.units.find((u) => u.id === id) ??
    s.gears.find((g) => g.id === id) ??
    s.stack.find((item) => item.id === id) ??
    s.players
      .flatMap((p) => trashCards(s, p.id))
      .find((card) => card.id === id);
  return x ? ` → ${cardName(x.cardId)}` : "";
}
function canMove(s: GameState, u: Unit, to: LocationId) {
  if (
    u.moveLockedTurn === s.turn ||
    !u.ready ||
    u.location === to ||
    to === base(otherPlayer(u.owner))
  )
    return false;
  if (to === base(u.owner))
    return (
      u.location.startsWith("field:") &&
      !getKeywords(s, u).includes("Cannot move to base")
    );
  if (u.location === base(u.owner)) return true;
  return (
    getKeywords(s, u).includes("Ganking") ||
    s.fields.some((f) => f.id === to && f.cardId === "token-baron-pit")
  );
}
function extendedAdditionalCost(sc: CardScript | undefined) {
  const extra = sc?.additionalCost;
  return Boolean(
    extra &&
    (extra.xp ||
      extra.energyReduction ||
      extra.condition ||
      extra.enterReady ||
      extra.board ||
      extra.exhaustLegend),
  );
}
function boardCostSources(
  s: GameState,
  p: PlayerId,
  script: CardScript,
  checkMight = true,
) {
  const cost = script.additionalCost?.board;
  if (!cost) return [];
  if (cost.kind === "killGear" || cost.kind === "returnGear")
    return s.gears.filter((g) => g.owner === p);
  return s.units.filter(
    (u) =>
      u.owner === p &&
      (!cost.tags || getUnitTags(u).some((tag) => cost.tags!.includes(tag))) &&
      (cost.kind !== "spendBuff" || u.buff > 0) &&
      (!checkMight ||
        cost.minMight === undefined ||
        getMight(s, u) >= cost.minMight),
  );
}
function boardCostPayable(
  s: GameState,
  p: PlayerId,
  script: CardScript,
  sourceId: string | undefined,
  cost: ReturnType<typeof playCost>,
  domains: string[],
) {
  if (!sourceId || script.additionalCost?.board?.minMight === undefined)
    return true;
  // Core rule 357 pays Energy/Power before nonstandard costs. Recycling runes
  // or spending Power can change Might before the unit is sacrificed.
  const projected: GameState = structuredClone(s);
  pay(
    projected,
    p,
    cost.energy,
    cost.power,
    domains,
    cost.extraPower,
    cost.additionalPower,
  );
  projected.players[p].powerSpentThisTurn =
    (projected.players[p].powerSpentThisTurn ?? 0) +
    cost.spellPower +
    cost.gearPower;
  return boardCostSources(projected, p, script).some((u) => u.id === sourceId);
}
function boardCostLabel(s: GameState, script: CardScript, sourceId?: string) {
  if (!sourceId) return "";
  const object =
    s.units.find((u) => u.id === sourceId?.split("~")[0]) ??
    s.gears.find((g) => g.id === sourceId);
  if (!object) return "";
  if (sourceId.includes("~"))
    return ` · pay ${sourceId.split("~").length} board costs`;
  const verb =
    script.additionalCost?.board?.kind === "spendBuff"
      ? "spend a buff from"
      : script.additionalCost?.board?.kind === "returnGear"
        ? "return to hand"
        : "kill";
  return ` · ${verb} ${cardName(object!.cardId)}`;
}
function payBoardCost(
  s: GameState,
  p: PlayerId,
  script: CardScript,
  sourceId: string,
) {
  const cost = script.additionalCost!.board!;
  if (cost.multiple) {
    const ids = sourceId.split("~").filter(Boolean);
    if (cost.kind === "killUnit") killUnits(s, ids);
    else
      for (const id of ids) {
        const u = s.units.find((u) => u.id === id);
        if (u?.buff) {
          u.buff--;
          event(s, "spendBuff", p, u.cardId, u.id, u.location);
        }
      }
    return;
  }
  // Legality is regenerated immediately before apply; never substitute a copy.
  const object = boardCostSources(s, p, script).find((o) => o.id === sourceId);
  if (!object) throw new Error("Additional cost source is no longer legal");
  const label = boardCostLabel(s, script, sourceId).slice(3);
  if (cost.kind === "spendBuff") {
    const unit = s.units.find((u) => u.id === sourceId)!;
    unit.buff--;
    event(s, "spendBuff", p, unit.cardId, unit.id, unit.location);
  } else if (cost.kind === "killUnit") killUnits(s, [sourceId]);
  else if (cost.kind === "killGear") killGear(s, sourceId);
  else {
    const gear = s.gears.find((g) => g.id === sourceId)!;
    event(s, "bounce", p, gear.cardId, gear.id, base(p));
    s.gears = s.gears.filter((g) => g.id !== sourceId);
    for (const unit of s.units)
      unit.gear = unit.gear.filter((id) => id !== sourceId);
    if (!gear.token) s.players[gear.owner].hand.push(gear.cardId);
  }
  log(s, `Additional cost: ${label}.`, "play", p);
}
function addPlayVariants(s: GameState, p: PlayerId, actions: GameAction[]) {
  const out: GameAction[] = [];
  for (const a of actions.filter(
    (a) =>
      a.category === "play" &&
      !a.cardIndices?.length &&
      !a.id.includes("|exhaust:"),
  )) {
    const c = getCard(a.cardId!),
      sc = getScript(c.id)!;
    for (const mode of ["additionalCost", "repeat"] as const) {
      const repeats = repeatPrices(s, p, c.id, sc);
      if (mode === "repeat" && repeats.length > 1) {
        for (let mask = 1; mask < 2 ** Math.min(repeats.length, 12); mask++) {
          if (
            isFace(c.id, "UNL", 182) &&
            mask.toString(2).replace(/0/g, "").length > 3
          )
            continue;
          const cost = playCost(s, p, c, a.targetId, a.sourceId, {
            ...a,
            repeated: true,
            repeatMask: mask,
          });
          if (
            canPay(
              s,
              p,
              cost.energy,
              cost.power,
              playPowerDomains(s, p, c, a.sourceId),
              cost.extraPower,
              cost.additionalPower,
            )
          )
            out.push({
              ...a,
              id: `${a.id}|repeat-mask:${mask}`,
              label: `${a.label} · Repeat (${mask.toString(2).replace(/0/g, "").length})`,
              repeated: true,
              repeatMask: mask,
            });
        }
        continue;
      }
      const extra =
        mode === "repeat" ? repeatCost(s, p, sc, c.id) : sc.additionalCost;
      if (!extra) continue;
      if (mode === "additionalCost" && extendedAdditionalCost(sc)) continue;
      const accelerated = a.id.includes("|accelerate");
      const repeatModes =
        mode === "repeat"
          ? (sc.spellModes ?? [
              { label: "", effects: a.effects ?? sc.spell ?? [] },
            ])
          : [{ label: "", effects: [] }];
      const secondChoices = repeatModes.flatMap((repeatMode, repeatModeIndex) =>
        (mode === "repeat"
          ? targets(s, p, repeatMode.effects)
          : [undefined]
        ).map((targetId) => ({ targetId, repeatMode, repeatModeIndex })),
      );
      for (const {
        targetId: repeatedTargetId,
        repeatMode,
        repeatModeIndex,
      } of secondChoices) {
        const cost = playCost(s, p, c, a.targetId, a.sourceId, {
          accelerated,
          locationId: a.locationId,
          repeated: mode === "repeat",
          repeatedTargetId,
          additionalCostPaid: mode === "additionalCost",
        });
        if (
          !canPay(
            s,
            p,
            cost.energy,
            cost.power,
            playPowerDomains(s, p, c, a.sourceId),
            cost.extraPower,
            cost.additionalPower,
          )
        )
          continue;
        const hidden = (s.hidden ?? []).find(
          (h) => a.sourceId === `hidden:${h.id}`,
        );
        if (
          hidden &&
          repeatedTargetId &&
          repeatedTargetId
            .split("~")
            .some(
              (id) =>
                s.units.find((u) => u.id === id)?.location !== hidden.location,
            )
        )
          continue;
        const indices = extra.discard
          ? s.players[p].hand.flatMap((_, i) =>
              a.sourceId === `hand:${i}` ? [] : [i],
            )
          : [-1];
        for (const index of indices)
          out.push({
            ...a,
            detail: `${cost.energy} energy · ${cost.power + cost.extraPower + cost.additionalPower.reduce((n, g) => n + g.power, 0)} power`,
            id: `${a.id}|${mode}:${index}:${repeatedTargetId ?? ""}${mode === "repeat" && sc.spellModes ? `:mode:${repeatModeIndex}` : ""}`,
            label: `${a.label} · ${mode === "repeat" ? "Repeat" + (repeatMode.label ? ` ${repeatMode.label}` : "") + targetLabel(s, repeatedTargetId) : "additional cost"}${index >= 0 ? ` (discard ${cardName(s.players[p].hand[index])})` : ""}`,
            cardIndices: index >= 0 ? [index] : undefined,
            ...(mode === "repeat"
              ? {
                  repeated: true,
                  repeatedTargetId,
                  repeatedEffects: repeatMode.effects,
                }
              : { additionalCostPaid: true }),
          });
      }
    }
  }
  return out;
}
function groupMoveTax(
  s: GameState,
  p: PlayerId,
  to: LocationId,
  count: number,
) {
  return (
    Math.max(0, count - 1) *
    textUnits(s).filter(
      (u) => u.owner !== p && u.location === to && u.cardId === "unl-163-219",
    ).length
  );
}
function equipEnergy(s: GameState, cardId: string, unitId: string) {
  const energy = getScript(cardId)?.equipEnergy ?? 0;
  const u = s.units.find((u) => u.id === unitId);
  return Math.max(
    0,
    energy - (cardId === "unl-188-219" && u ? getMight(s, u) : 0),
  );
}
function annotateEffects(
  effects: Effect[],
  fromHidden: boolean,
  additionalCostPaid: boolean,
  hiddenLocation?: LocationId,
): Effect[] {
  return effects.map((e) => ({
    ...e,
    fromHidden,
    additionalCostPaid,
    ...(e.custom === "wave16:conscription" && additionalCostPaid
      ? { maxMight: undefined }
      : {}),
    // CR 811.1.d.2: play-effect targets remain local through resolution.
    // Explicit other-location text overrides this restriction; compound
    // choices have their own per-target restrictions in their scripts.
    ...(fromHidden &&
    hiddenLocation &&
    e.target &&
    [
      "anyUnit",
      "friendlyUnit",
      "enemyUnit",
      "friendlyDamagedUnit",
      "friendlyReadyUnit",
      "friendlyExhaustedUnit",
      "enemySmallUnit",
      "friendlyUnitHere",
      "enemyUnitHere",
      "unitHere",
      "unitAtBattlefield",
      "friendlyUnitAtBattlefield",
      "enemyUnitAtBattlefield",
      "boardCards",
    ].includes(e.target) &&
    !e.targetDifferentLocationFromSource &&
    (!e.targetLocations || e.targetLocations.includes(hiddenLocation))
      ? { targetLocations: [hiddenLocation] }
      : {}),
    ...(e.effects
      ? {
          effects: annotateEffects(
            e.effects,
            fromHidden,
            additionalCostPaid,
            hiddenLocation,
          ),
        }
      : {}),
    ...(e.modes
      ? {
          modes: e.modes.map((mode) => ({
            ...mode,
            effects: annotateEffects(
              mode.effects,
              fromHidden,
              additionalCostPaid,
              hiddenLocation,
            ),
          })),
        }
      : {}),
  }));
}

/** Physical card selections for up-front costs; identical copies share a choice. */
function* recycleSelections(
  discard: string[],
  count: number,
): Generator<number[]> {
  function* visit(start: number, selected: number[]): Generator<number[]> {
    if (selected.length === count) {
      yield selected;
      return;
    }
    const seen = new Set<string>();
    for (let i = start; i <= discard.length - (count - selected.length); i++) {
      if (seen.has(discard[i])) continue;
      seen.add(discard[i]);
      yield* visit(i + 1, [...selected, i]);
    }
  }
  yield* visit(0, []);
}

type BoardObject = {
  id: string;
  cardId: string;
  owner: PlayerId;
  location: LocationId;
  might: number;
};
function boardCandidates(
  s: GameState,
  p: PlayerId,
  e: Effect,
  sourceId?: string,
  locationId?: LocationId,
): BoardObject[] {
  const sourceLocation = sourceId
    ? s.units.find((u) => u.id === sourceId)?.location
    : locationId;
  const owns = (owner: PlayerId) =>
    e.who === "all" || (e.who === "opponent" ? owner !== p : owner === p);
  const result: BoardObject[] = [];
  if (!e.cardTypes || e.cardTypes.includes("Unit"))
    for (const u of s.units) {
      if (
        !owns(u.owner) ||
        protectedFrom(s, u, p) ||
        !effectTargetMatches(s, u, e, sourceId) ||
        (e.chosenLocations?.[u.id] !== undefined &&
          e.chosenLocations[u.id] !== u.location) ||
        (e.excludeSource && u.id === sourceId) ||
        (e.maxMight !== undefined && getMight(s, u) > e.maxMight) ||
        (e.group?.tokensOnly && !u.token) ||
        (e.group?.atBattlefield && !u.location.startsWith("field:")) ||
        (e.group?.here && u.location !== sourceLocation)
      )
        continue;
      result.push({ ...u, might: getMight(s, u) });
    }
  if (e.cardTypes?.includes("Gear"))
    for (const g of s.gears)
      if (
        owns(g.owner) &&
        (!e.excludeSource || g.id !== sourceId) &&
        effectTargetMatches(s, g, e, sourceId)
      )
        result.push({ ...g, location: base(g.owner), might: 0 });
  if (e.cardTypes?.includes("Hidden"))
    for (const h of s.hidden ?? [])
      if (owns(h.owner) && (!e.excludeSource || h.id !== sourceId))
        result.push({ ...h, might: 0 });
  if (e.cardTypes?.includes("Rune"))
    for (const owner of s.players)
      if (owns(owner.id))
        for (const r of owner.runes) {
          const card = cards.find(
            (c) =>
              isCardType(c, "Rune") && c.domains.some((d) => d === r.domain),
          );
          if (card)
            result.push({
              id: r.id,
              cardId: card.id,
              owner: owner.id,
              location: base(owner.id),
              might: 0,
            });
        }
  return [...new Map(result.map((o) => [o.id, o])).values()];
}
function validBoardGroup(e: Effect, group: BoardObject[]) {
  return (
    group.length <= (e.targetCount ?? Infinity) &&
    (!e.group?.distinctLocations ||
      new Set(group.map((o) => o.location)).size === group.length) &&
    (!e.group?.sameLocation ||
      new Set(group.map((o) => o.location)).size <= 1) &&
    (e.group?.totalMight === undefined ||
      group.reduce((n, o) => n + o.might, 0) <= e.group.totalMight)
  );
}
function selectionPayable(
  s: GameState,
  p: PlayerId,
  choice: NonNullable<GameState["pendingChoice"]>,
  targetId?: string,
) {
  const draft = choice.boardSelection!;
  if (!draft.action) return true;
  if (draft.trigger) {
    const cost = triggerPrice(draft.action.effects ?? draft.trigger.effects);
    return canPay(
      s,
      p,
      cost.energy,
      cost.power,
      cost.domains,
      targetTax(s, p, targetId),
    );
  }
  const a = draft.action;
  if (a.category === "play") {
    const card = getCard(a.cardId!);
    const cost = playCost(s, p, card, targetId, a.sourceId, {
      ...a,
      accelerated: a.id.includes("|accelerate"),
    });
    return canPay(
      s,
      p,
      cost.energy,
      cost.power,
      playPowerDomains(s, p, card, a.sourceId),
      cost.extraPower,
      cost.additionalPower,
    );
  }
  const ability = getAbilities(s, p, a.cardId!, a.sourceId)[
    Number(a.id.split("|")[2])
  ];
  const cost = abilityCost(
    s,
    p,
    a.sourceId,
    ability.energy ?? 0,
    ability.power ?? 0,
    ability.domain ? [ability.domain] : [],
    targetTax(s, p, targetId),
  );
  return canPay(s, p, cost.energy, cost.power, cost.domains, cost.anyPower);
}
function stagedTarget(e: Effect) {
  return (
    e.target === "boardCards" ||
    (e.target === "trashCards" && (e.targetCount ?? 1) > 1)
  );
}

/** Lazy engine decisions; consumers may stop without enumerating the remaining choices. */
export function* iterateLegalActions(
  s: GameState,
  p: PlayerId,
  instructed?: PendingCardPlay,
): Generator<GameAction> {
  for (const a of iterateBaseLegalActions(s, p, instructed)) {
    if (a.category !== "play") {
      const u = s.units.find((u) => u.id === a.sourceId),
        ability = a.id.startsWith("ability|")
          ? getAbilities(s, p, a.cardId!, a.sourceId)[
              Number(a.id.split("|")[2])
            ]
          : undefined;
      if (
        ability?.label === "Empower" &&
        u &&
        s.fields.some(
          (f) => f.id === u.location && isFace(f.cardId, "VEN", 163),
        )
      ) {
        for (const n of [1, 0]) {
          const cost = abilityCost(
            s,
            p,
            u.id,
            ability.energy ?? 0,
            ability.power ?? 0,
            ability.domain ? [ability.domain] : [],
            targetTax(s, p, a.targetId),
            n,
            true,
          );
          if (
            canPay(s, p, cost.energy, cost.power, cost.domains, cost.anyPower)
          )
            yield {
              ...a,
              id: `${a.id}|discount:${n}`,
              flexibleEnergy: n,
              label: `${a.label} · ${cost.energy} Energy / ${cost.power + cost.anyPower} Power`,
            };
        }
      } else yield a;
      continue;
    }
    const c = getCard(a.cardId!),
      script = getScript(c.id)!;
    const flex = isCardType(c, "Spell")
      ? ireliaDiscounts(
          s,
          p,
          [a.targetId, a.repeatedTargetId].filter(Boolean).join("~"),
        )
      : 0;
    const repeats =
      a.repeatMask !== undefined
        ? a.repeatMask.toString(2).replace(/0/g, "").length
        : Number(!!a.repeated);
    const count =
      optionalDiscounts(s, p) *
      (repeats +
        Number(!!a.additionalCostPaid && !script.additionalCost?.required) +
        Number(a.id.includes("|accelerate")));
    if (!flex && !count) {
      yield a;
      continue;
    }
    const seen = new Set<string>();
    for (let oe = count; oe >= 0; oe--)
      for (let fe = flex; fe >= 0; fe--) {
        const cost = playCost(s, p, c, a.targetId, a.sourceId, {
          ...a,
          flexibleEnergy: fe,
          optionalEnergy: oe,
          accelerated: a.id.includes("|accelerate"),
        });
        const key = JSON.stringify([
          cost.energy,
          cost.power,
          cost.extraPower,
          cost.additionalPower,
        ]);
        if (
          seen.has(key) ||
          !canPay(
            s,
            p,
            cost.energy,
            cost.power,
            playPowerDomains(s, p, c, a.sourceId),
            cost.extraPower,
            cost.additionalPower,
          )
        )
          continue;
        seen.add(key);
        yield {
          ...a,
          id: `${a.id}|discount:${fe}:${oe}`,
          flexibleEnergy: fe,
          optionalEnergy: oe,
          label: `${a.label} · ${cost.energy} Energy / ${cost.power + cost.extraPower + cost.additionalPower.reduce((n, g) => n + g.power, 0)} Power`,
        };
      }
  }
}

function* iterateBaseLegalActions(
  s: GameState,
  p: PlayerId,
  instructed?: PendingCardPlay,
): Generator<GameAction> {
  const out: GameAction[] = [];
  const repeatCandidates: GameAction[] = [];
  const add = (a: Omit<GameAction, "player">): GameAction => {
    const action = { ...a, player: p };
    out.push(action);
    return action;
  };
  function* addMany(...actions: GameAction[]) {
    for (const action of actions) yield add(action);
  }
  if (s.phase === "ended" || s.winner !== null) return;
  const x = s.players[p];
  if (s.phase === "mulligan") {
    if (x.mulliganDone || s.priorityPlayer !== p) return;
    yield add({
      id: "mulligan:",
      label: "Keep all four cards",
      category: "mulligan",
      cardIndices: [],
    });
    for (let i = 0; i < x.hand.length; i++) {
      yield add({
        id: `mulligan:${i}`,
        label: p === 0 ? `Replace ${cardName(x.hand[i])}` : "Replace one card",
        category: "mulligan",
        cardIndices: [i],
        cardId: p === 0 ? x.hand[i] : undefined,
      });
      for (let j = i + 1; j < x.hand.length; j++)
        yield add({
          id: `mulligan:${i},${j}`,
          label:
            p === 0
              ? `Replace ${cardName(x.hand[i])} + ${cardName(x.hand[j])}`
              : "Replace two cards",
          category: "mulligan",
          cardIndices: [i, j],
        });
    }
    return;
  }
  if (s.priorityPlayer !== p) return;
  if (s.phase === "choice") {
    const choice = s.pendingChoice!;
    if (choice.kind === "effectPlay") {
      const pending = s.pendingPlays?.find(
        (item) => item.id === choice.sourceId,
      );
      if (!pending) return;
      const view = { ...s, phase: choice.returnPhase, pendingChoice: null };
      let playable = false;
      for (const action of iterateLegalActions(view, p, pending)) {
        if (action.category === "play" && action.sourceId === pending.id) {
          playable = true;
          yield action;
        } else if (action.category === "resource") yield action;
      }
      if (!playable || pending.spec.optional)
        yield add({
          id: "cancel-effect-play",
          label: "Cancel this play",
          category: "ability",
          cardId: pending.cardId,
        });
      return;
    }
    if (choice.kind === "effectDraft") {
      for (const a of draftChoices(
        s,
        (effects, location, source) => targets(s, p, effects, location, source),
        (e, source, location) => boardCandidates(s, p, e, source, location),
      )) {
        const d = choice.effectDraft!;
        if (
          a.id === "draft:done" &&
          !d.retargetId &&
          !selectionPayable(
            s,
            p,
            {
              ...choice,
              boardSelection: {
                selected: [],
                action: draftAction(d),
                trigger: d.trigger,
              },
            },
            draftAction(d).targetId,
          )
        )
          continue;
        yield add(a);
      }
      return;
    }
    if (choice.kind === "costTargets") {
      const draft = choice.boardSelection!,
        script = getScript(draft.action!.cardId!)!;
      for (const u of boardCostSources(s, p, script)) {
        const selected = draft.selected.filter((id) => id === u.id).length;
        const max =
          script.additionalCost!.board!.kind === "spendBuff" && "buff" in u
            ? u.buff
            : 1;
        if (selected < max)
          yield add({
            id: `choose-cost:add:${u.id}`,
            label: `Pay with ${cardName(u.cardId)}`,
            category: "ability",
            targetId: u.id,
          });
        if (selected)
          yield add({
            id: `choose-cost:remove:${u.id}`,
            label: `Remove ${cardName(u.cardId)}`,
            category: "ability",
            targetId: u.id,
          });
      }
      const action = {
        ...draft.action!,
        costSourceId: draft.selected.join("~"),
        costsFinalized: true,
      };
      const c = getCard(action.cardId!),
        cost = playCost(s, p, c, action.targetId, action.sourceId, {
          ...action,
          accelerated: action.id.includes("|accelerate"),
        });
      if (
        canPay(
          s,
          p,
          cost.energy,
          cost.power,
          playPowerDomains(s, p, c, action.sourceId),
          cost.extraPower,
          cost.additionalPower,
        )
      )
        yield add({
          id: "choose-cost:done",
          label: "Confirm additional costs",
          category: "ability",
        });
      return;
    }
    if (choice.kind === "boardTargets") {
      const draft = choice.boardSelection!,
        e = choice.effect!;
      const candidates = boardCandidates(
        s,
        p,
        e,
        choice.sourceId,
        choice.locationId,
      ).filter((o) => !draft.allowedIds || draft.allowedIds.includes(o.id));
      const selected = candidates.filter((o) => draft.selected.includes(o.id));
      for (const object of candidates) {
        const chosen = draft.selected.includes(object.id);
        const proposed = [...selected, object];
        if (
          !chosen &&
          (!validBoardGroup(e, proposed) ||
            !selectionPayable(
              s,
              p,
              choice,
              proposed.map((o) => o.id).join("~"),
            ))
        )
          continue;
        yield add({
          id: `choose-board:${object.id}`,
          label: `${chosen ? "Remove" : "Choose"} ${cardName(object.cardId)} · ${locationName(object.location)}`,
          cardId: object.cardId,
          targetId: object.id,
          amount: chosen ? -1 : 1,
          category: "ability",
        });
      }
      if (["any", "open"].includes(e.group?.destination ?? "") && draft.action)
        for (const destination of [
          ...(e.group?.destination === "any" ? [base(otherPlayer(p))] : []),
          ...s.fields
            .filter(
              (f) =>
                e.group?.destination !== "open" ||
                !s.units.some((u) => u.owner !== p && u.location === f.id),
            )
            .map((f) => f.id),
        ])
          yield add({
            id: `choose-board:destination:${destination}`,
            label: `Destination: ${locationName(destination)}${draft.destination === destination ? " ✓" : ""}`,
            locationId: destination,
            category: "ability",
          });
      if (
        validBoardGroup(e, selected) &&
        (e.upTo || !e.targetCount || selected.length === e.targetCount) &&
        selectionPayable(s, p, choice, draft.selected.join("~") || undefined) &&
        (!["any", "open"].includes(e.group?.destination ?? "") ||
          !draft.action ||
          draft.destination ||
          (e.group?.destination === "open" && e.upTo && !selected.length))
      )
        yield add({
          id: "choose-board:done",
          label: `Confirm ${selected.length} card${selected.length === 1 ? "" : "s"}`,
          category: "ability",
        });
      return;
    }
    if (choice.kind === "trashTargets") {
      const selection = choice.trashSelection!;
      const effect = choice.effect!;
      const candidates = trashTargets(s, p, effect);
      const selected = selection.selected;
      const maximum = Math.min(effect.targetCount ?? 1, candidates.length);
      for (const card of candidates) {
        const chosen = selected.includes(card.id);
        if (!chosen && selected.length >= maximum) continue;
        yield add({
          id: `choose-trash:${card.id}`,
          label: `${chosen ? "Remove" : "Choose"} ${cardName(card.cardId)} · ${card.owner === p ? "your trash" : "opponent's trash"}`,
          cardId: card.cardId,
          targetId: card.id,
          amount: chosen ? -1 : 1,
          category: "ability",
        });
      }
      if (effect.upTo || selected.length === maximum)
        yield add({
          id: "choose-trash:done",
          label: `Confirm ${selected.length} card${selected.length === 1 ? "" : "s"}`,
          category: "ability",
        });
      return;
    }
    if (choice.kind === "readyRunes") {
      for (const rune of x.runes.filter((r) =>
        choice.finalizingTrigger
          ? !choice.chosenRuneIds?.includes(r.id)
          : !r.ready,
      ))
        yield add({
          id: `choose-rune:${rune.id}`,
          label: `Ready ${rune.domain} rune`,
          category: "ability",
          sourceId: rune.id,
        });
      if (!out.length || choice.effect?.optional)
        yield add({
          id: "choose-rune:skip",
          label: "Finish readying runes",
          category: "ability",
        });
      return;
    }
    if (choice.kind === "custom") {
      const options = (choice.options ?? []).filter((a) => {
        const selected = (a.targetId ?? "")
          .split("~")
          .flatMap((id) => s.units.filter((u) => u.id === id));
        if (selected.some((u) => protectedFrom(s, u, p))) return false;
        const newTargets = selected.filter(
          (u) => !(choice.targetId ?? "").split("~").includes(u.id),
        );
        return canPay(
          s,
          p,
          0,
          0,
          [],
          targetTax(s, p, newTargets.map((u) => u.id).join("~")),
        );
      });
      yield* (
        options.length
          ? options
          : [
              {
                id: "choose-custom:no-target",
                label: "No legal target — continue",
                category: "ability" as const,
                player: p,
                effects: [],
              },
            ]
      ).map((a) => ({ ...a, player: p }));
      return;
    }
    if (["discard", "recycle", "retrieve"].includes(choice.kind)) {
      const zone = choice.kind === "discard" ? x.hand : x.discard;
      for (const [i, cardId] of zone.entries()) {
        if (
          choice.kind === "retrieve" &&
          ((choice.effect?.condition === "unit" &&
            !isCardType(getCard(cardId), "Unit")) ||
            (choice.effect?.condition === "spell" &&
              !isCardType(getCard(cardId), "Spell")))
        )
          continue;
        yield add({
          id: `choose-card:${i}`,
          label: `${choice.kind}: ${cardName(cardId)}`,
          category: "ability",
          cardId,
          amount: i,
        });
      }
      if (!out.length || choice.effect?.optional)
        yield add({
          id: "choose-card:skip",
          label: "Continue without selecting a card",
          category: "ability",
        });
      return;
    }
    if (choice.kind === "predict") {
      yield add({
        id: "choose-predict:keep",
        label: s.players[choice.effect?.who === "opponent" ? otherPlayer(p) : p]
          .deck.length
          ? `Keep ${cardName(s.players[choice.effect?.who === "opponent" ? otherPlayer(p) : p].deck[0])} on top`
          : "Deck empty: continue",
        category: "ability",
      });
      if (
        s.players[choice.effect?.who === "opponent" ? otherPlayer(p) : p].deck
          .length
      )
        yield add({
          id: "choose-predict:recycle",
          label: `Recycle ${cardName(s.players[choice.effect?.who === "opponent" ? otherPlayer(p) : p].deck[0])}`,
          category: "ability",
        });
      return;
    }
    if (choice.kind === "sacrifice" || choice.kind === "spendBuff") {
      for (const u of s.units.filter(
        (u) => u.owner === p && (choice.kind === "sacrifice" || u.buff > 0),
      ))
        yield add({
          id: `choose-unit:${u.id}`,
          label: `${choice.kind === "sacrifice" ? "Kill" : "Spend a buff from"} ${cardName(u.cardId)}`,
          category: "ability",
          targetId: u.id,
        });
      if (!out.length || choice.effect?.optional)
        yield add({
          id: "choose-unit:skip",
          label: "Decline optional effect",
          category: "ability",
        });
      return;
    }
    if (choice.kind === "optional") {
      yield add({
        id: "choose-optional:yes",
        label: choice.effect?.cardName ?? "Use optional ability",
        category: "ability",
      });
      yield add({
        id: "choose-optional:no",
        label: "Decline optional ability",
        category: "ability",
      });
      return;
    }
    if (choice.kind === "move") {
      const u = s.units.find((u) => u.id === choice.targetId);
      if (u)
        for (const locationId of [
          base(u.owner),
          ...s.fields.map((f) => f.id),
        ].filter((id) => id !== u.location))
          yield add({
            id: `choose-destination:${locationId}`,
            label: `Move to ${locationName(locationId)}`,
            category: "ability",
            locationId,
          });
      return;
    }
    if (choice.kind === "token") {
      for (const locationId of [
        base(p),
        ...s.fields.filter((f) => f.controller === p).map((f) => f.id),
      ].filter(
        (locationId) =>
          (!choice.effect?.fromHidden || locationId === choice.locationId) &&
          canPlayCard(
            s,
            p,
            tokenCard(choice.effect?.cardName ?? "Recruit")!,
            locationId,
            choice.effect?.condition !== "realCard",
          ),
      ))
        yield add({
          id: `choose-token:${locationId}`,
          label: `Place ${choice.effect?.cardName ?? "Recruit"} at ${locationName(locationId)} (${choice.remaining} remaining)`,
          category: "ability",
          locationId,
        });
      if (!out.length)
        yield add({
          id: "choose-token:skip",
          label: "No legal location: finish effect",
          category: "ability",
        });
    } else {
      for (const candidate of iterateTriggerActions(
        s,
        p,
        choice.effects ?? [],
        choice.sourceId ?? "",
        choice.cardId ?? "",
        choice.locationId ??
          s.units.find((u) => u.id === choice.sourceId)?.location ??
          s.combat?.fieldId,
      ))
        yield add(candidate);
      if (
        !out.length ||
        choice.effects?.some((e) => e.optional && !e.chooseRunes)
      )
        yield add({
          id: "choose-trigger:skip",
          label: "Decline optional trigger",
          category: "ability",
        });
    }
    return;
  }
  if (s.phase === "move") {
    const move = s.pendingMove!;
    for (const u of s.units.filter(
      (u) => u.owner === p && canMove(s, u, move.to),
    )) {
      const selected = move.unitIds.includes(u.id);
      yield add({
        id: `move-toggle:${u.id}`,
        label: `${selected ? "Remove" : "Add"} ${cardName(u.cardId)} (${getMight(s, u)} Might)`,
        category: "move",
        sourceId: u.id,
        locationId: move.to,
      });
    }
    if (
      move.unitIds.length &&
      canPay(s, p, 0, 0, [], groupMoveTax(s, p, move.to, move.unitIds.length))
    )
      yield add({
        id: "move-confirm",
        label: `Move ${move.unitIds.length} unit${move.unitIds.length === 1 ? "" : "s"} to ${locationName(move.to)}`,
        category: "move",
        locationId: move.to,
        unitIds: [...move.unitIds],
      });
    yield add({
      id: "move-cancel",
      label: "Cancel movement",
      category: "move",
    });
    return;
  }
  if (s.phase === "damage") {
    const c = s.combat!;
    if (c.assigningPlayer !== p) return;
    let enemies = s.units.filter(
      (u) =>
        u.owner !== p &&
        u.location === c.fieldId &&
        (c.assignments[p][u.id] ?? 0) < damageToKill(s, u),
    );
    const remainingTargets = enemies.length;
    const tanks = enemies.filter((u) => getKeywords(s, u).includes("Tank"));
    const ignoresTank = s.units.some(
      (u) =>
        u.owner === p &&
        u.location === c.fieldId &&
        getKeywords(s, u).includes("Ignore Tank"),
    );
    if (tanks.length && !ignoresTank) enemies = tanks;
    else if (enemies.some((u) => !getKeywords(s, u).includes("Backline")))
      enemies = enemies.filter((u) => !getKeywords(s, u).includes("Backline"));
    for (const u of enemies) {
      const amount =
        remainingTargets === 1
          ? c.remaining[p]
          : Math.min(
              c.remaining[p],
              Math.max(1, damageToKill(s, u) - (c.assignments[p][u.id] ?? 0)),
            );
      if (amount > 0)
        yield add({
          id: `damage:${u.id}:${amount}`,
          label: `Assign ${amount} damage to ${cardName(u.cardId)}`,
          category: "combat",
          targetId: u.id,
          amount,
        });
    }
    if (!enemies.length || !c.remaining[p])
      yield add({
        id: "damage-done",
        label: "Confirm damage assignment",
        category: "combat",
      });
    return;
  }
  const inChain = !instructed && s.stack.length > 0;
  const inShowdown = !instructed && s.phase === "showdown";
  const canMain =
    Boolean(instructed) || (!inChain && !inShowdown && p === s.currentPlayer);
  if (!inChain && p === s.currentPlayer) {
    const hideable = [
      ...x.hand.map((id, i) => ({ id, source: `hand:${i}`, key: String(i) })),
      ...(x.championAvailable
        ? [{ id: x.championId, source: "champion", key: "champion" }]
        : []),
    ];
    for (const { id, source, key } of hideable)
      if (getScript(id)?.hidden)
        for (const f of s.fields.filter(
          (f) =>
            f.controller === p &&
            (s.hidden?.filter((h) => h.location === f.id).length ?? 0) <
              (f.cardId === "ogn-278-298" ? 2 : 1),
        ))
          for (const cost of [
            hideCost(s, p),
            ...(isFace(x.legendId, "OGN", 263) && x.freeHideTurn !== s.turn
              ? [{ energy: 1, power: 0 }]
              : []),
          ].filter((cost) => canPay(s, p, cost.energy, 0, [], cost.power)))
            yield add({
              id: `hide:${key}:${f.id}${cost.energy ? ":energy" : ""}`,
              label: `Hide ${cardName(id)} at ${locationName(f.id)}`,
              category: "ability",
              cardId: id,
              sourceId: source,
              locationId: f.id,
            });
  }
  const playable = (
    instructed
      ? [{ id: instructed.cardId, source: instructed.id }]
      : [
          ...x.hand.map((id, index) => ({ id, source: `hand:${index}` })),
          ...x.hand.flatMap((id, index) =>
            isCardType(getCard(id), "Gear") && (getCard(id).energy ?? 0) <= 7
              ? (x.gearPlayPermissions ?? [])
                  .filter((g) => g.turn === s.turn)
                  .map((g) => ({ id, source: `hand:${index}:jayce:${g.id}` }))
              : [],
          ),
          ...(x.championAvailable
            ? [{ id: x.championId, source: "champion" }]
            : []),
          ...(s.hidden ?? [])
            .filter((h) => h.owner === p && h.hiddenTurn < s.turn)
            .map((h) => ({ id: h.cardId, source: `hidden:${h.id}` })),
          ...x.discard.flatMap((id, i) => {
            const flow = getScript(id)?.flow;
            const native =
              flow && (flow.condition !== "legion" || x.cardsPlayedThisTurn > 0)
                ? [{ id, source: `trash:${i}` }]
                : [];
            return [
              ...(s.gears.some(
                (g) => g.owner === p && isFace(g.cardId, "VEN", 22),
              )
                ? [{ id, source: `trash:${i}:riches` }]
                : []),
              ...native,
              ...(flowCost(s, p, id, `trash:${i}:granted`)
                ? [{ id, source: `trash:${i}:granted` }]
                : []),
            ];
          }),
        ]
  )
    .flatMap<{
      id: string;
      source: string;
      mode?: { label: string; effects: Effect[] };
      modeIndex?: number;
      paidAdditional?: boolean;
      costSourceId?: string;
      namedTag?: string;
      dragonRoost?: LocationId;
    }>((entry) => {
      const modes = getScript(entry.id)?.spellModes;
      return modes?.length
        ? modes.map((mode, modeIndex) => ({ ...entry, mode, modeIndex }))
        : [{ ...entry, mode: undefined, modeIndex: undefined }];
    })
    .flatMap((entry) =>
      extendedAdditionalCost(getScript(entry.id)!)
        ? [entry, { ...entry, paidAdditional: true }]
        : [entry],
    )
    .flatMap((entry) => {
      const script = getScript(entry.id);
      if (
        script?.additionalCost?.required &&
        !entry.paidAdditional &&
        !instructed?.spec.ignoreAllCosts
      )
        return [];
      return script?.additionalCost?.board &&
        entry.paidAdditional &&
        !script.additionalCost.board.multiple
        ? boardCostSources(s, p, script, false).map((source) => ({
            ...entry,
            costSourceId: source.id,
          }))
        : [entry];
    })
    .flatMap((entry) => {
      const tags = getScript(entry.id)?.asPlayTag;
      return tags
        ? (tags === "tribe" ? ["Bird", "Cat", "Dog", "Poro"] : allCardTags).map(
            (namedTag) => ({ ...entry, namedTag }),
          )
        : [entry];
    })
    .flatMap((entry) =>
      isCardType(getCard(entry.id), "Unit") &&
      getCard(entry.id).tags.includes("Dragon")
        ? [
            entry,
            ...s.fields
              .filter((f) => isFace(f.cardId, "VEN", 157))
              .map((f) => ({ ...entry, dragonRoost: f.id })),
          ]
        : [entry],
    );
  for (const entry of playable) {
    const c = getCard(entry.id),
      script = getScript(c.id);
    if (!script || !canPlayCard(s, p, c)) continue;
    if (
      entry.paidAdditional &&
      ((script.additionalCost?.exhaustLegend && x.legendUsedTurn >= 0) ||
        (x.xp ?? 0) < (script.additionalCost?.xp ?? 0) ||
        (script.additionalCost?.condition === "playedSpell" &&
          !(x.spellsPlayedThisTurn ?? 0)))
    )
      continue;
    if (isCardType(c, "Spell") && x.cannotPlaySpellsTurn === s.turn) continue;
    const hidden = (s.hidden ?? []).find(
      (h) => entry.source === `hidden:${h.id}`,
    );
    if (
      hidden &&
      textUnits(s).some(
        (u) =>
          u.owner !== p &&
          u.cardId === "ogn-018-298" &&
          u.location === hidden.location,
      )
    )
      continue;
    const ambushEnemy = script.keywords?.includes("AmbushEnemyOccupied");
    const quickDraw = hasQuickDraw(s, p, c, entry.source);
    const ambushAt = (u: Unit) =>
      (script.ambush && u.owner === p) || (ambushEnemy && u.owner !== p);
    const ambush = s.units.some(
      (u) => ambushAt(u) && u.location.startsWith("field:"),
    );
    if (inChain && !script.reaction && !quickDraw && !hidden && !ambush)
      continue;
    if (
      inShowdown &&
      !inChain &&
      !script.action &&
      !script.reaction &&
      !quickDraw &&
      !hidden &&
      !ambush
    )
      continue;
    if (!canMain && !inShowdown && !inChain) continue;
    const effects: Effect[] = isCardType(c, "Spell")
      ? (entry.mode?.effects ?? script.spell ?? []).map((e) => {
          const cost = s.units.find((u) => u.id === entry.costSourceId);
          return isFace(c.id, "UNL", 142) && cost
            ? {
                ...e,
                maxEnergy: getCard(cost.cardId).energy ?? 0,
                maxPower: getCard(cost.cardId).power ?? 0,
                play: {
                  ...e.play!,
                  maxEnergy: getCard(cost.cardId).energy ?? 0,
                  maxPower: getCard(cost.cardId).power ?? 0,
                },
              }
            : e;
        })
      : c.id === "ogn-208-298"
        ? [{ type: "sacrifice", target: "friendlyUnit" }]
        : [];
    for (const targetId of iterateTargets(
      s,
      p,
      annotateEffects(
        effects,
        Boolean(hidden),
        Boolean(entry.paidAdditional),
        isFace(c.id, "VEN", 34) ? undefined : hidden?.location,
      ),
    )) {
      if (
        c.id === "sfd-107-221" &&
        !s.units.find((u) => u.id === targetId?.split("~")[0])?.gear.length
      )
        continue;
      if (c.id === "sfd-206-221" && !s.stack.some((i) => i.kind === "spell"))
        continue;
      const choosesDestination =
        c.set === "VEN" && [34, 148].includes(c.collectorNumber);
      if (
        hidden &&
        !(
          c.id === "unl-083-219" &&
          s.units.find((u) => u.id === targetId?.split("~")[0])?.location ===
            hidden.location
        ) &&
        !(c.set === "VEN" && c.collectorNumber === 34) &&
        targetId &&
        targetId.split("~").some((id) => {
          const target = s.units.find((u) => u.id === id);
          return target
            ? target.location !== hidden.location
            : id.startsWith("field:") && id !== hidden.location;
        })
      )
        continue;
      let locations: Array<LocationId | undefined> = isCardType(c, "Unit")
        ? [
            ...(hidden || (ambush && !canMain) ? [] : [base(p)]),
            ...s.fields
              .filter(
                (f) =>
                  f.controller === p ||
                  ((script.keywords?.includes("Play to open battlefields") ||
                    textUnits(s).some(
                      (u) => u.owner === p && u.cardId === "ogn-193-298",
                    )) &&
                    f.controller === null &&
                    !s.units.some((u) => u.location === f.id)) ||
                  (script.keywords?.includes("Play to attacking battlefield") &&
                    s.combat?.attacker === p &&
                    s.combat.fieldId === f.id) ||
                  (script.keywords?.includes("Play to enemy battlefields") &&
                    s.units.some(
                      (u) => u.owner !== p && u.location === f.id,
                    )) ||
                  (s.units.filter((u) => u.location === f.id).length === 1 &&
                    s.units.some((u) => u.owner !== p && u.location === f.id) &&
                    (script.keywords?.includes("Play against lone enemy") ||
                      s.units.some(
                        (u) =>
                          u.owner === p &&
                          getKeywords(s, u).includes(
                            "Friendly units play against lone enemy",
                          ),
                      ))) ||
                  (["ogn-176-298", "ogn-174-298"].includes(c.id) &&
                    f.controller === null) ||
                  (c.id === "sfd-093-221" &&
                    s.units.some(
                      (u) => u.owner !== p && u.location === f.id,
                    )) ||
                  (ambush &&
                    s.units.some((u) => ambushAt(u) && u.location === f.id)),
              )
              .map((f) => f.id),
          ]
        : choosesDestination
          ? s.fields
              .filter(
                (f) =>
                  f.id !== s.units.find((u) => u.id === targetId)?.location &&
                  (c.collectorNumber === 34
                    ? f.controller === p &&
                      (!hidden || f.id === hidden.location)
                    : s.units.some(
                        (u) => u.owner === p && u.location === f.id,
                      )),
              )
              .map((f) => f.id)
          : [undefined];
      if (instructed && isCardType(c, "Unit")) {
        const permission = instructed.spec;
        if (permission.destination === "base") locations = [base(p)];
        if (permission.destination === "here")
          locations =
            permission.locationId &&
            permission.locationId !== base(otherPlayer(p))
              ? [permission.locationId]
              : [];
        if (permission.destination === "controlledBattlefield")
          locations = s.fields
            .filter((f) => f.controller === p)
            .map((f) => f.id);
        if (permission.destination === "anyBattlefield")
          locations = s.fields.map((f) => f.id);
        if (
          permission.alternativeHere &&
          permission.locationId?.startsWith("field:") &&
          !locations.includes(permission.locationId)
        )
          locations.push(permission.locationId);
      }
      if (
        isFace(c.id, "UNL", 147) &&
        !s.fields.some((f) => f.cardId === "token-baron-pit")
      )
        locations = ["field:2"];
      if (
        script.additionalCost?.board?.allowCostLocation &&
        entry.costSourceId
      ) {
        const cost = s.units.find((u) => u.id === entry.costSourceId);
        if (
          cost?.location.startsWith("field:") &&
          !locations.includes(cost.location)
        )
          locations.push(cost.location);
      }
      if (entry.dragonRoost) locations = [entry.dragonRoost];
      for (const locationId of locations) {
        const cost = playCost(s, p, c, targetId, entry.source, {
          additionalCostPaid: entry.paidAdditional,
          costSourceId:
            entry.costSourceId ??
            (entry.paidAdditional && script.additionalCost?.board?.multiple
              ? boardCostSources(s, p, script)
                  .flatMap((u) =>
                    Array(
                      script.additionalCost?.board?.kind === "spendBuff" &&
                        "buff" in u
                        ? u.buff
                        : 1,
                    ).fill(u.id),
                  )
                  .join("~")
              : undefined),
          dragonRoost: entry.dragonRoost,
          locationId,
        });
        const domains = playPowerDomains(s, p, c, entry.source);
        const payable =
          canPay(
            s,
            p,
            cost.energy,
            cost.power,
            domains,
            cost.extraPower,
            cost.additionalPower,
          ) &&
          boardCostPayable(s, p, script, entry.costSourceId, cost, domains);
        if (
          !payable &&
          !script.repeat &&
          !(
            c.id === "ogn-002-298" &&
            canPay(
              s,
              p,
              Math.max(0, cost.energy - 2),
              cost.power,
              c.domains,
              cost.extraPower,
            )
          )
        )
          continue;

        if (!canPlayCard(s, p, c, locationId)) continue;
        if (
          script.keywords?.includes("Play only to conquered battlefield") &&
          (!locationId?.startsWith("field:") ||
            !x.conqueredThisTurn.includes(Number(locationId.split(":")[1])))
        )
          continue;
        if (hidden && isCardType(c, "Unit") && locationId !== hidden.location)
          continue;
        if (c.id === "ogn-208-298" && !s.units.some((u) => u.owner === p))
          continue;

        if (payable)
          yield add({
            id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}${entry.mode ? `|mode:${entry.modeIndex}` : ""}${entry.paidAdditional ? "|additional" : ""}${entry.costSourceId ? `|cost:${entry.costSourceId}` : ""}${entry.namedTag ? `|tag:${entry.namedTag}` : ""}${entry.dragonRoost ? `|roost:${entry.dragonRoost}` : ""}`,
            label: `Play ${cardName(c.id)}${entry.mode ? ` · ${entry.mode.label}` : ""}${!entry.costSourceId && entry.paidAdditional ? (script.additionalCost?.xp ? ` · spend ${script.additionalCost.xp} XP` : " · pay additional cost") : ""}${locationId ? ` at ${locationName(locationId)}` : ""}${targetLabel(s, targetId)}${boardCostLabel(s, script, entry.costSourceId)}${entry.namedTag ? ` · ${entry.namedTag}` : ""}${entry.dragonRoost ? " · Dragon Roost (+2 Power)" : ""}`,
            category: "play",
            sourceId: entry.source,
            cardId: c.id,
            targetId,
            locationId,
            detail: `${cost.energy} energy · ${cost.power + cost.extraPower} power`,
            ...(entry.paidAdditional ? { additionalCostPaid: true } : {}),
            ...(entry.namedTag ? { namedTag: entry.namedTag } : {}),
            ...(entry.dragonRoost ? { dragonRoost: entry.dragonRoost } : {}),
            ...(entry.costSourceId ? { costSourceId: entry.costSourceId } : {}),
            ...(entry.mode || isFace(c.id, "UNL", 142) ? { effects } : {}),
            ...(c.id === "ogn-208-298"
              ? { effects: [{ type: "sacrifice" }] }
              : {}),
          });
        else if (repeatPrices(s, p, c.id, script).length)
          repeatCandidates.push({
            ...{
              id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}${entry.mode ? `|mode:${entry.modeIndex}` : ""}${entry.paidAdditional ? "|additional" : ""}`,
              label: `Play ${cardName(c.id)}${entry.mode ? ` · ${entry.mode.label}` : ""}${entry.paidAdditional ? (script.additionalCost?.xp ? ` · spend ${script.additionalCost.xp} XP` : " · pay additional cost") : ""}${locationId ? ` at ${locationName(locationId)}` : ""}${targetLabel(s, targetId)}`,
              category: "play",
              sourceId: entry.source,
              cardId: c.id,
              targetId,
              locationId,
              detail: `${cost.energy} energy · ${cost.power + cost.extraPower} power`,
              ...(entry.paidAdditional ? { additionalCostPaid: true } : {}),
              ...(entry.mode || isFace(c.id, "UNL", 142) ? { effects } : {}),
              ...(c.id === "ogn-208-298"
                ? { effects: [{ type: "sacrifice" }] }
                : {}),
            },
            player: p,
          });
        if (c.id === "ogn-048-298")
          for (const unit of s.units.filter((u) => u.owner === p && u.ready))
            yield add({
              id: `play|${entry.source}||${targetId ?? ""}|exhaust:${unit.id}`,
              label: `Meditation: exhaust ${cardName(unit.cardId)} to draw 2`,
              category: "play",
              sourceId: entry.source,
              cardId: c.id,
              targetId: unit.id,
            });
        if (c.id === "ogn-002-298")
          for (const [i, discardId] of x.hand.entries()) {
            if (
              entry.source === `hand:${i}` ||
              !canPay(
                s,
                p,
                Math.max(0, cost.energy - 2),
                cost.power,
                c.domains,
                cost.extraPower,
              )
            )
              continue;
            yield add({
              id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}|discard:${i}`,
              label: `Play ${cardName(c.id)}: discard ${cardName(discardId)} for -2 energy`,
              category: "play",
              sourceId: entry.source,
              cardId: c.id,
              targetId,
              locationId,
              cardIndices: [i],
            });
          }
        const acceleratedCost = playCost(s, p, c, targetId, entry.source, {
          costSourceId: entry.costSourceId,
          additionalCostPaid: entry.paidAdditional,
          accelerated: true,
          dragonRoost: entry.dragonRoost,
          locationId,
        });
        if (
          (script.accelerating ||
            ((instructed
              ? instructed.returnZone !== "hand"
              : !entry.source.startsWith("hand:")) &&
              isCardType(c, "Unit") &&
              textUnits(s).some(
                (u) => u.owner === p && isFace(u.cardId, "SFD", 29),
              ))) &&
          canPay(
            s,
            p,
            acceleratedCost.energy,
            acceleratedCost.power,
            c.domains,
            acceleratedCost.extraPower,
            acceleratedCost.additionalPower,
          )
        )
          yield add({
            id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}|accelerate${entry.paidAdditional ? "|additional" : ""}${entry.costSourceId ? `|cost:${entry.costSourceId}` : ""}${entry.namedTag ? `|tag:${entry.namedTag}` : ""}${entry.dragonRoost ? `|roost:${entry.dragonRoost}` : ""}`,
            label: `Accelerate ${cardName(c.id)}${locationId ? ` at ${locationName(locationId)}` : ""}${targetLabel(s, targetId)}${boardCostLabel(s, script, entry.costSourceId)}${entry.namedTag ? ` · ${entry.namedTag}` : ""}${entry.dragonRoost ? " · Dragon Roost (+2 Power)" : ""}`,
            category: "play",
            sourceId: entry.source,
            cardId: c.id,
            targetId,
            locationId,
            detail: `${acceleratedCost.energy} energy · ${acceleratedCost.power + acceleratedCost.extraPower} power · enters ready`,
            ...(entry.paidAdditional ? { additionalCostPaid: true } : {}),
            ...(entry.namedTag ? { namedTag: entry.namedTag } : {}),
            ...(entry.dragonRoost ? { dragonRoost: entry.dragonRoost } : {}),
            ...(entry.costSourceId ? { costSourceId: entry.costSourceId } : {}),
          });
      }
    }
  }
  if (canMain) {
    for (const u of s.units.filter((u) => u.owner === p && u.ready))
      for (const to of [base(p), ...s.fields.map((f) => f.id)])
        if (canMove(s, u, to))
          yield add({
            id: `move-start:${u.id}:${to}`,
            label: `Move ${cardName(u.cardId)} → ${locationName(to)}`,
            category: "move",
            sourceId: u.id,
            locationId: to,
          });
  }
  const sources = [
    { id: "legend", cardId: x.legendId, ready: x.legendUsedTurn < 0 },
    ...s.units
      .filter((u) => u.owner === p)
      .map((u) => ({ id: u.id, cardId: u.cardId, ready: u.ready })),
    ...s.gears
      .filter((g) => g.owner === p)
      .map((g) => ({ id: g.id, cardId: g.cardId, ready: g.ready })),
  ];
  for (const source of [...new Map(sources.map((o) => [o.id, o])).values()]) {
    const abilityList = getAbilities(s, p, source.cardId, source.id);
    for (const [index, a] of abilityList.entries()) {
      const sourceUnit = s.units.find((u) => u.id === source.id);
      const object = sourceUnit ?? s.gears.find((g) => g.id === source.id);
      if (
        a.condition === "choseEnemiesTwice" &&
        !(x.enemyChoices?.turn === s.turn && x.enemyChoices.count >= 2)
      )
        continue;
      if (
        a.disempowerSelf &&
        !(source.id === "legend" ? x.legendEmpowered : object?.empowered)
      )
        continue;
      if (a.condition === "playedEquipment" && x.equipmentPlayedTurn !== s.turn)
        continue;
      const cost = abilityCost(
        s,
        p,
        source.id,
        a.energy ?? 0,
        a.power ?? 0,
        a.domain ? [a.domain] : [],
        0,
        undefined,
        a.label === "Empower",
      );
      if (
        a.condition === "sourceEmpowered" &&
        !(source.id === "legend" ? x.legendEmpowered : object?.empowered)
      )
        continue;
      if (
        a.condition === "sourceNotEmpowered" &&
        (source.id === "legend" ? x.legendEmpowered : object?.empowered)
      )
        continue;
      if (
        a.condition === "unattached" &&
        s.gears.find((g) => g.id === source.id)?.attachedTo
      )
        continue;
      if (a.spendBuff && !sourceUnit?.buff) continue;
      if (
        a.condition === "sourceAtBattlefield" &&
        !sourceUnit?.location.startsWith("field:")
      )
        continue;
      if (
        a.oncePerTurn &&
        object?.usedAbilities?.includes(a.instanceKey ?? String(index))
      )
        continue;
      if (
        (a.recycleCost ?? 0) > x.discard.length ||
        (a.discard ?? 0) > x.hand.length
      )
        continue;
      if (a.exhaust && !source.ready) continue;
      if (inChain && a.timing !== "reaction") continue;
      if (
        inShowdown &&
        !inChain &&
        a.timing !== "action" &&
        a.timing !== "reaction"
      )
        continue;
      if (!canMain && !inShowdown && !inChain) continue;
      if (!canPay(s, p, cost.energy, cost.power, cost.domains, cost.anyPower))
        continue;
      for (const targetId of iterateTargets(
        s,
        p,
        a.effects,
        sourceUnit?.location ?? s.combat?.fieldId,
        source.id,
      )) {
        if (
          a.effects.some((effect) => effect.excludeSource) &&
          (targetId ?? "").split("~").includes(source.id)
        )
          continue;
        const targetedCost = abilityCost(
          s,
          p,
          source.id,
          a.energy ?? 0,
          a.power ?? 0,
          a.domain ? [a.domain] : [],
          targetTax(s, p, targetId),
          undefined,
          a.label === "Empower",
        );
        if (
          !canPay(
            s,
            p,
            targetedCost.energy,
            targetedCost.power,
            targetedCost.domains,
            targetedCost.anyPower,
          )
        )
          continue;
        const recycleOptions = recycleSelections(
          a.discard ? x.hand : x.discard,
          a.discard ?? a.recycleCost ?? 0,
        );
        for (const recycleIndices of recycleOptions)
          yield add({
            id: `ability|${source.id}|${index}|${targetId ?? ""}|${recycleIndices.join(",")}`,
            label: `${cardName(source.cardId)}: ${a.label}${targetLabel(s, targetId)}${recycleIndices.length ? ` · ${a.discard ? "discard" : "recycle"} ${recycleIndices.map((i) => cardName((a.discard ? x.hand : x.discard)[i])).join(" + ")}` : ""}`,
            amount: recycleIndices[0],
            ...(recycleIndices.length ? { cardIndices: recycleIndices } : {}),
            category: "ability",
            sourceId: source.id,
            cardId: source.cardId,
            targetId,
          });
      }
    }
  }
  for (const gear of s.gears.filter(
    (g) => g.owner === p && g.ready && g.cardId === "sfd-t03",
  ))
    yield add({
      id: `gold:${gear.id}`,
      label: "Spend Gold: add one universal power",
      category: "resource",
      sourceId: gear.id,
      cardId: gear.cardId,
    });
  yield* addMany(...addPlayVariants(s, p, [...out, ...repeatCandidates]));
  yield* addMany(
    ...getLaterActions(s, p, { ...context(), baseActions: out }).filter(
      (a) =>
        a.category !== "play" ||
        !a.cardId ||
        canPlayCard(s, p, getCard(a.cardId), a.locationId),
    ),
  );
  // Older expansion modules enumerate their own activated abilities. Offer the
  // unit-only pool to those costs too, without making it spendable on gear or
  // spells and without mutating the match during a legal-action query.
  if (x.unitEnergy) {
    const paymentView: GameState = {
      ...s,
      players: s.players.map((player) =>
        player.id === p
          ? { ...player, energy: player.energy + (player.unitEnergy ?? 0) }
          : player,
      ) as GameState["players"],
    };
    const known = new Set(out.map((action) => action.id));
    yield* addMany(
      ...getLaterActions(paymentView, p, {
        ...context(),
        baseActions: out,
      }).filter(
        (action) =>
          !known.has(action.id) &&
          ["ability", "resource"].includes(action.category) &&
          s.units.some(
            (unit) => unit.owner === p && unit.id === action.sourceId,
          ),
      ),
    );
  }
  if (x.gearPower || gearAbilityDiscount(s, p)) {
    const paymentView: GameState = {
      ...s,
      players: s.players.map((player) =>
        player.id === p
          ? {
              ...player,
              energy: player.energy + gearAbilityDiscount(s, p),
              power: (player.power ?? 0) + (player.gearPower ?? 0),
            }
          : player,
      ) as GameState["players"],
    };
    const known = new Set(out.map((action) => action.id));
    yield* addMany(
      ...getLaterActions(paymentView, p, {
        ...context(),
        baseActions: out,
      }).filter(
        (action) =>
          !known.has(action.id) &&
          ["ability", "resource"].includes(action.category) &&
          s.gears.some((g) => g.owner === p && g.id === action.sourceId),
      ),
    );
  }
  if (canMain)
    for (const g of s.gears.filter((g) => g.owner === p)) {
      const sc = getScript(g.cardId);
      if (sc?.equipCost !== undefined && (x.xp ?? 0) >= (sc.equipXP ?? 0))
        for (const u of s.units.filter(
          (u) => u.owner === p && u.id !== g.attachedTo,
        )) {
          const cost = abilityCost(
            s,
            p,
            g.id,
            equipEnergy(s, g.cardId, u.id),
            sc.equipCost,
            equipDomains(g.cardId),
          );
          if (
            !canPay(s, p, cost.energy, cost.power, cost.domains, cost.anyPower)
          )
            continue;
          const sacrifices = sc.equipKillUnit
            ? s.units.filter((v) => v.owner === p).map((v) => v.id)
            : [undefined];
          for (const costSourceId of sacrifices)
            for (const cardIndices of recycleSelections(
              x.discard,
              sc.equipRecycle ?? 0,
            ))
              yield add({
                id: `equip:${g.id}:${u.id}${costSourceId ? `:kill:${costSourceId}` : ""}${cardIndices.length ? `:recycle:${cardIndices.join(",")}` : ""}`,
                costSourceId,
                cardIndices,
                label: `Equip ${cardName(g.cardId)} to ${cardName(u.cardId)}${sc.equipXP ? ` · spend ${sc.equipXP} XP` : ""}`,
                category: "ability",
                sourceId: g.id,
                targetId: u.id,
                cardId: g.cardId,
              });
        }
    }
  if (inChain || inShowdown)
    yield add({
      id: "pass",
      label: inChain
        ? "Pass priority"
        : s.consecutivePasses
          ? "Resolve showdown"
          : "Pass focus",
      category: "pass",
    });
  else if (canMain)
    yield add({ id: "end-turn", label: "End turn", category: "end" });
  return;
}
export function getLegalActions(s: GameState, p: PlayerId): GameAction[] {
  return [...iterateLegalActions(s, p)];
}

/** Equivalent to selecting a group and confirming in the human movement UI. */
export function getGroupMoveAction(
  s: GameState,
  p: PlayerId,
  ids: string[],
  to: LocationId,
): GameAction | null {
  if (
    s.priorityPlayer !== p ||
    s.winner !== null ||
    s.phase !== "main" ||
    s.stack.length ||
    s.currentPlayer !== p
  )
    return null;
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ![base(p), ...s.fields.map((f) => f.id)].includes(to)
  )
    return null;
  if (
    !ids.every((id) =>
      s.units.some((u) => u.id === id && u.owner === p && canMove(s, u, to)),
    )
  )
    return null;
  if (!canPay(s, p, 0, 0, [], groupMoveTax(s, p, to, ids.length))) return null;
  const unitIds = [...ids].sort();
  return {
    id: `move-group:${to}:${unitIds.join(",")}`,
    player: p,
    category: "move",
    sourceId: unitIds[0],
    unitIds,
    locationId: to,
    label: `Move ${ids.length} unit(s) to ${locationName(to)}`,
  };
}

function getAbilities(
  s: GameState,
  p: PlayerId,
  cardId: string,
  sourceId?: string,
) {
  const own = [
    ...(getScript(cardId)?.abilities ?? []),
    ...copiedScripts(
      s,
      s.units.find((u) => u.id === sourceId)!,
    ).flatMap(({ unit, script }) =>
      (script.abilities ?? []).map((a, i) => ({
        ...a,
        instanceKey: `${unit.abilityInstance}:${i}`,
        effects: textEffects(unit, a.effects),
      })),
    ),
    ...(cardId === s.players[p].legendId ? grantedLegendAbilities(s, p) : []),
  ];
  if (cardId !== "ogn-111-298") return own;
  const ids = new Set([
    s.players[p].legendId,
    ...s.units
      .filter((u) => u.owner === p && u.cardId !== cardId)
      .map((u) => u.cardId),
    ...s.gears.filter((g) => g.owner === p).map((g) => g.cardId),
  ]);
  return [
    ...own,
    ...[...ids].flatMap((id) =>
      (getScript(id)?.abilities ?? []).filter((a) => a.exhaust),
    ),
  ];
}
export function locationName(id: LocationId) {
  return id.startsWith("base:")
    ? id === "base:0"
      ? "your base"
      : "enemy base"
    : `battlefield ${Number(id.split(":")[1]) + 1}`;
}
function tokenCard(name: string) {
  return name === "Sprite"
    ? getCard("ogn-274-298")
    : name === "Recruit"
      ? getCard("ogn-271-298")
      : cards.find(
          (c) =>
            (c.name === name || c.name.startsWith(name + " //")) &&
            ["Unit", "Gear"].some((type) => isCardType(c, type)) &&
            !c.variant,
        );
}
function spawnToken(
  s: GameState,
  p: PlayerId,
  name: string,
  location: LocationId,
  ready = false,
) {
  const c = tokenCard(name);
  if (!c) throw new Error(`Missing token ${name}`);
  if (!canPlayCard(s, p, c, location, c.supertype === "Token"))
    return undefined;
  if (isCardType(c, "Gear")) {
    const gear = {
      id: uid(s, "g"),
      cardId: c.id,
      owner: p,
      ready,
      token: true,
    };
    s.gears.push(gear);
    log(s, `${s.players[p].name} plays a ${name} gear token.`, "play", p);
    event(s, "play", p, c.id, gear.id, base(p));
    return gear as unknown as Unit;
  }
  const u: Unit = {
    id: uid(s, "u"),
    cardId: c.id,
    owner: p,
    location,
    ready:
      ready ||
      s.players[p].unitsEnterReadyTurn === s.turn ||
      textUnits(s).some((u) => u.owner === p && u.cardId === "ogn-011-298"),
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    token: true,
    temporary: name === "Sprite",
    summonedTurn: s.turn,
  };
  s.units.push(u);
  log(
    s,
    `${s.players[p].name} plays a ${name} at ${locationName(location)}.`,
    "play",
    p,
  );
  unitPlayed(s, p, u);
  queueTokenReplacements(s, p, u, name, ready);
  return u;
}
function unitPlayed(s: GameState, p: PlayerId, unit: Unit) {
  event(s, "unitPlayed", p, unit.cardId, unit.id, unit.location);
  for (const u of textUnits(s))
    if (u.owner === p && u.id !== unit.id && u.cardId === "ogn-139-298")
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "buff", condition: "self" }],
        targetId: u.id,
        kind: "trigger",
      });
}
function bonusDamage(s: GameState, p: PlayerId) {
  return (
    textUnits(s).filter((u) => u.owner === p && u.cardId === "ogs-001-024")
      .length +
    3 *
      s.gears.filter(
        (g) =>
          isFace(g.cardId, "SFD", 191) &&
          s.units.some((u) => u.owner === p && u.id === g.attachedTo),
      ).length +
    (s.resolving?.filter((item) => item.player === p).at(-1)
      ?.spellBonusDamage ?? 0)
  );
}
function killUnits(
  s: GameState,
  ids: string[],
  cleanup = false,
  delayedSpell?: string,
) {
  const waiting = new Set(s.deathBatches?.flatMap((b) => b.ids) ?? []);
  ids = ids.filter(
    (id) => !waiting.has(id) && s.units.some((u) => u.id === id),
  );
  if (!ids.length) return;
  const spell = delayedSpell ? undefined : s.resolving?.at(-1);
  const credited =
    spell && spell.player === effectActors.get(s)
      ? ids.filter(
          (id) =>
            !cleanup ||
            s.units.find((u) => u.id === id)?.spellDamageId === spell.id,
        )
      : [];
  (s.deathBatches ??= []).push({
    id: uid(s, "death"),
    ids,
    used: [],
    declined: [],
    actor: effectActors.get(s),
    combat: s.phase === "damage",
    spellId: spell?.id,
    credited,
    delayedSpell,
  });
  advanceDeaths(s, context());
}
function commitDeaths(
  s: GameState,
  ids: string[],
  actor?: PlayerId,
  spellId?: string,
  credited: string[] = [],
  delayedSpell?: string,
) {
  const spell = s.resolving?.find((i) => i.id === spellId);
  const dead = s.units.filter((u) => ids.includes(u.id));
  const inherited = new Map(
    dead.map((u) => [
      u.id,
      [
        ...textSources(s, u).flatMap((t) => {
          const e = getScript(t.cardId)?.onDeath;
          return e ? [textEffects(t, e)] : [];
        }),
        ...attachedEquipment(s, u).map((g) =>
          getScript(g.cardId)?.equipment?.onDeath?.map((e) => ({
            ...e,
            cardName: g.id,
          })),
        ),
      ].filter((e): e is Effect[] => Boolean(e)),
    ]),
  );
  const faces = new Map(dead.map((u) => [u.id, u.cardId]));
  const deathMultipliers = [0, 1].map(
    (p) =>
      1 +
      textUnits(s).filter((u) => u.owner === p && isFace(u.cardId, "OGN", 236))
        .length,
  );
  for (const u of dead)
    event(s, "death", u.owner, u.cardId, u.id, u.location, {
      dyingUnitIds: dead.map((unit) => unit.id),
      killer:
        actor ??
        effectActors.get(s) ??
        (s.phase === "damage" ? otherPlayer(u.owner) : undefined),
    });
  if (dead.length) s.unitDiedTurn = s.turn;
  for (const p of [0, 1] as const)
    if (
      dead.some((u) => u.owner === p) &&
      s.players[p].firstDeathTurn !== s.turn
    ) {
      s.players[p].firstDeathTurn = s.turn;
      for (const wraith of textUnits(s).filter(
        (u) => u.owner === p && u.cardId === "ogn-118-298",
      ))
        pushStack(s, {
          player: p,
          cardId: wraith.cardId,
          sourceId: wraith.id,
          effects: [{ type: "draw" }],
          kind: "trigger",
        });
    }
  s.units = s.units.filter((u) => !ids.includes(u.id));
  s.gears = s.gears.filter((g) => !ids.includes(g.id));
  for (const u of dead) {
    if (!u.token) {
      const previous = trashCards(s, physicalOwner(u)).at(-1)?.id;
      addToTrash(s, physicalOwner(u), physicalCard(u));
      const visit = trashCards(s, physicalOwner(u)).at(-1);
      u.deathTrashId =
        visit?.id !== previous && visit?.cardId === physicalCard(u)
          ? visit.id
          : undefined;
    }
    if (spell && credited.includes(u.id))
      spell.killedUnits = (spell.killedUnits ?? 0) + 1;
    for (const gid of u.gear) {
      const gear = s.gears.find((g) => g.id === gid);
      if (gear) detach(s, gear);
    }
    u.cardId = faces.get(u.id)!;
    log(s, `${cardName(u.cardId)} is defeated.`, "combat", u.owner);
  }
  // Simultaneous triggers enter active-player batch first, then nonactive.
  for (const u of [...dead].sort(
    (a, b) =>
      Number(a.owner !== s.currentPlayer) - Number(b.owner !== s.currentPlayer),
  )) {
    for (const effects of inherited.get(u.id) ?? [])
      for (let repeat = 0; repeat < deathMultipliers[u.owner]; repeat++)
        trigger(
          s,
          u.owner,
          u.cardId,
          u.id,
          textEffects(u, effects),
          u.location,
          structuredClone(u),
        );
  }
  if (delayedSpell && actor !== undefined && dead.length)
    event(s, "spellKill", actor, delayedSpell, undefined, undefined, {
      amount: dead.length,
    });
  refreshControl(s);
}
function killGear(s: GameState, id: string) {
  if (s.units.some((u) => u.id === id)) {
    killUnits(s, [id]);
    return;
  }
  const gear = s.gears.find((g) => g.id === id);
  if (!gear) return;
  event(s, "death", gear.owner, gear.cardId, gear.id, base(gear.owner));
  s.gears = s.gears.filter((g) => g.id !== id);
  for (const u of s.units) u.gear = u.gear.filter((g) => g !== id);
  detach(s, gear);
  if (!gear.token) addToTrash(s, physicalOwner(gear), physicalCard(gear));
  const effects = getScript(gear.cardId)?.onDeath;
  if (effects)
    for (
      let repeat = 0;
      repeat <
      1 +
        textUnits(s).filter(
          (u) => u.owner === gear.owner && isFace(u.cardId, "OGN", 236),
        ).length;
      repeat++
    )
      trigger(
        s,
        gear.owner,
        gear.cardId,
        gear.id,
        textEffects(gear, effects),
        base(gear.owner),
      );
}
function checkDeaths(s: GameState) {
  killUnits(
    s,
    s.units.filter((u) => lethal(s, u, getMight(s, u))).map((u) => u.id),
    true,
  );
}
function refreshControl(s: GameState) {
  for (const f of s.fields) {
    const here = s.units.filter((u) => u.location === f.id);
    if (!here.length && s.combat?.fieldId !== f.id) f.controller = null;
  }
  s.hidden = (s.hidden ?? []).filter((h) => {
    if (s.fields.find((f) => f.id === h.location)?.controller === h.owner)
      return true;
    addToTrash(s, h.owner, h.cardId);
    log(
      s,
      "A hidden card is trashed after losing control of its battlefield.",
      "info",
      h.owner,
    );
    return false;
  });
}
function effectDescription(e: Effect): string {
  const names: Record<string, string> = {
    damage: `deals ${e.amount ?? 1} damage`,
    damageAll: `deals ${e.amount ?? 1} damage to affected units`,
    might: `gives ${e.amount ?? 1} temporary Might`,
    mightAll: `gives friendly units ${e.amount ?? 1} temporary Might`,
    assault: `grants Assault ${e.amount ?? 1}`,
    buff: "gives a +1 Might buff",
    stun: "stuns the chosen unit",
    ready: "readies the chosen unit",
    readyRunes: `readies up to ${e.amount ?? 1} runes`,
    kill: "kills the chosen unit",
    moveTarget: "moves the chosen unit to its base",
    duel: "units deal Might damage to each other",
    draw: "draw effect complete",
    channel: "rune channel effect complete",
    token: "recruit effect begins",
  };
  return names[e.type] ?? `${e.type} effect resolves`;
}
function deflect(s: GameState, u: Unit) {
  if (s.fields.some((f) => f.id === u.location && isFace(f.cardId, "VEN", 158)))
    return 0;
  const keywordTax = (keywords: string[]) =>
    keywords
      .filter((k) => /^Deflect(?: \d+)?$/.test(k))
      .reduce((sum, k) => sum + (Number(k.split(" ")[1]) || 1), 0);
  const equipmentTax = keywordTax(
    attachedEquipment(s, u).flatMap(
      (gear) => getScript(gear.cardId)?.equipment?.keywords ?? [],
    ),
  );
  // Some older scripts store intrinsic Deflect only as a numeric field. Keep
  // that fallback separate so it cannot swallow an Equipment's added instance.
  return (
    Math.max(
      textSources(s, u).reduce(
        (n, t) => n + (getScript(t.cardId)?.deflect ?? 0),
        0,
      ),
      keywordTax(getKeywords(s, u)) - equipmentTax,
    ) + equipmentTax
  );
}
function targetTax(s: GameState, p: PlayerId, id?: string) {
  return (id ?? "").split("~").reduce((n, id) => {
    const u = s.units.find((u) => u.id === id);
    return n + (u && u.owner !== p ? deflect(s, u) : 0);
  }, 0);
}
function* iterateTriggerActions(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  sourceId: string,
  cardId: string,
  locationId?: LocationId,
): Generator<GameAction> {
  const modalIndex = effects.findIndex((e) => e.modes?.length);
  if (modalIndex >= 0) {
    const wrapper = effects[modalIndex];
    for (const [index, mode] of wrapper.modes!.entries()) {
      if (!wave14ModeAvailable(s, sourceId, mode.effects)) continue;
      const selected = mode.effects.map((e, i) => ({
        ...e,
        ...(i === 0 && wrapper.triggerCost
          ? { triggerCost: wrapper.triggerCost }
          : {}),
        ...(wrapper.optional ? { optional: true } : {}),
      }));
      for (const action of iterateTriggerActions(
        s,
        p,
        [
          ...effects.slice(0, modalIndex),
          ...selected,
          ...effects.slice(modalIndex + 1),
        ],
        sourceId,
        cardId,
        locationId,
      ))
        yield {
          ...action,
          id: `${action.id}:mode:${index}`,
          label: `${mode.label}${targetLabel(s, action.targetId)}`,
        };
    }
    return;
  }
  const cost = triggerPrice(effects),
    player = s.players[p];
  const source =
    s.units.find((u) => u.id === sourceId) ??
    s.gears.find((g) => g.id === sourceId);
  if (cost.sacrificeSelf && !source) return;
  if (cost.recycleSelf && !trashCards(s, p).some((c) => c.id === cost.trashId))
    return;
  if (
    (cost.exhaust &&
      !(sourceId === "legend"
        ? player.legendUsedTurn < 0
        : source?.owner === p && source.ready)) ||
    (player.xp ?? 0) < cost.xp
  )
    return;
  const runeEffect = effects.find((e) => e.chooseRunes);
  if (
    runeEffect &&
    !runeEffect.optional &&
    player.runes.length < (runeEffect.amount ?? 1)
  )
    return;
  for (const targetId of iterateTargets(s, p, effects, locationId, sourceId)) {
    if (
      targetId === sourceId &&
      ["ogn-132-298", "ogn-136-298"].includes(cardId)
    )
      continue;
    if (
      (targetId ?? "").split("~").includes(sourceId) &&
      effects.some((e) => e.excludeSource)
    )
      continue;
    if (
      targetId === undefined &&
      effects.some(
        (e) =>
          e.target &&
          e.target !== "boardCards" &&
          !e.target.startsWith("upTo") &&
          !(e.target === "trashCards" && ((e.targetCount ?? 1) > 1 || e.upTo)),
      )
    )
      continue;
    if (
      !canPay(
        s,
        p,
        cost.energy,
        cost.power,
        cost.domains,
        targetTax(s, p, targetId),
      )
    )
      continue;
    for (const costSourceId of cost.board
      ? triggerBoardSources(s, p, cost.board, locationId, sourceId)
      : [undefined])
      for (const cardIndices of recycleSelections(
        cost.discard ? player.hand : player.discard,
        cost.discard || cost.recycleCost,
      )) {
        yield {
          id: `choose-trigger:${targetId ?? ""}${costSourceId ? `:cost:${costSourceId}` : ""}${cardIndices.length ? `:${cost.discard ? "discard" : "recycle"}:${cardIndices.join(",")}` : ""}`,
          label: `${
            costSourceId
              ? `${cost.board === "disempower" ? "Disempower" : cost.board === "returnUnitHere" ? "Return to hand" : "Kill"} ${
                  costSourceId === "legend"
                    ? cardName(player.legendId)
                    : costSourceId
                        .split("~")
                        .map((id) =>
                          cardName(
                            [...s.units, ...s.gears].find((o) => o.id === id)!
                              .cardId,
                          ),
                        )
                        .join(" + ")
                } · `
              : ""
          }${targetId ? "Choose target" : "Use triggered ability"}${targetLabel(s, targetId)}${cardIndices.length ? ` · ${cost.discard ? "discard" : "recycle"} ${cardIndices.map((i) => cardName((cost.discard ? player.hand : player.discard)[i])).join(" + ")}` : ""}`,
          player: p,
          category: "ability",
          targetId,
          effects,
          ...(cardIndices.length ? { cardIndices } : {}),
          ...(costSourceId ? { costSourceId } : {}),
        };
      }
  }
}
function triggerPrice(effects: Effect[]) {
  const costs = effects.flatMap((e) => (e.triggerCost ? [e.triggerCost] : []));
  return {
    discard: costs.reduce((n, c) => n + (c.discard ?? 0), 0),
    board: costs.find((c) => c.board)?.board,
    energy: costs.reduce((n, c) => n + (c.energy ?? 0), 0),
    power: costs.reduce((n, c) => n + (c.power ?? 0), 0),
    domains: [...new Set(costs.flatMap((c) => (c.domain ? [c.domain] : [])))],
    exhaust: costs.some((c) => c.exhaust),
    xp: costs.reduce((n, c) => n + (c.xp ?? 0), 0),
    recycleCost: costs.reduce((n, c) => n + (c.recycleCost ?? 0), 0),
    recycleSelf: costs.some((c) => c.recycleSelf),
    sacrificeSelf: costs.some((c) => c.sacrificeSelf),
    trashId: costs.find((c) => c.recycleSelf)?.trashId,
  };
}
function finalizeTrigger(
  s: GameState,
  item: Omit<StackItem, "id" | "kind">,
  action: GameAction,
) {
  const effects = action.effects ?? item.effects;
  const draft =
    !action.draftFinalized &&
    makeDraft(s, { ...action, cardId: item.cardId, effects }, item);
  if (draft) {
    openChoice(s, item.player, {
      kind: "effectDraft",
      cardId: item.cardId,
      sourceId: item.sourceId,
      locationId: item.locationId,
      effectDraft: draft,
    });
    return;
  }
  const selection = effects.find(stagedTarget);
  if (selection && !action.targetsFinalized) {
    openChoice(s, item.player, {
      kind: selection.target === "boardCards" ? "boardTargets" : "trashTargets",
      effect: structuredClone(selection),
      cardId: item.cardId,
      sourceId: item.sourceId,
      locationId: item.locationId,
      [selection.target === "boardCards" ? "boardSelection" : "trashSelection"]:
        {
          selected: [],
          action: { ...action, effects },
          trigger: item,
        },
    });
    return;
  }
  const runeEffect = effects.find(
    (e) => e.type === "readyRunes" && e.chooseRunes && !e.runeIds,
  );
  if (runeEffect) {
    openChoice(s, item.player, {
      kind: "readyRunes",
      remaining: runeEffect.amount ?? 1,
      effect: runeEffect,
      effects,
      sourceId: item.sourceId,
      cardId: item.cardId,
      locationId: item.locationId,
      targetId: action.targetId,
      sourceSnapshot: item.sourceSnapshot,
      finalizingTrigger: true,
      chosenRuneIds: [],
      cardIndices: action.cardIndices,
    });
    return;
  }
  const cost = triggerPrice(effects),
    player = s.players[item.player];
  pay(
    s,
    item.player,
    cost.energy,
    cost.power,
    cost.domains,
    targetTax(s, item.player, action.targetId),
  );
  player.xp = (player.xp ?? 0) - cost.xp;
  if (cost.exhaust) {
    if (item.sourceId === "legend") player.legendUsedTurn = s.turn;
    else {
      const source =
        s.units.find((u) => u.id === item.sourceId) ??
        s.gears.find((g) => g.id === item.sourceId);
      if (source) source.ready = false;
    }
  }
  const boardDeferrals: Array<() => void> = [];
  if (cost.board || cost.discard)
    finalizingBoardCostPlay.set(s, boardDeferrals);
  if (cost.discard) {
    const selected = new Set(action.cardIndices ?? []);
    const discarded = player.hand.filter((_, i) => selected.has(i));
    player.hand = player.hand.filter((_, i) => !selected.has(i));
    discardCards(s, item.player, discarded);
  }
  if (cost.board)
    payTriggerBoard(
      s,
      item.player,
      cost.board,
      action.costSourceId!,
      context(undefined, item.sourceId, item.locationId),
    );
  if (cost.recycleCost) {
    const selected = new Set(action.cardIndices ?? []);
    const recycled = player.discard.filter((_, i) => selected.has(i));
    for (const i of [...selected].sort((a, b) => b - a))
      takeTrashAt(s, item.player, i);
    recycleCards(s, item.player, shuffle(s, recycled));
  }
  if (cost.recycleSelf) {
    const recycled = takeTrash(s, item.player, cost.trashId!);
    if (!recycled)
      throw new Error("The source's trash visit is no longer available");
    recycleCards(s, item.player, [recycled]);
  }
  if (cost.sacrificeSelf) {
    const nested = executingEffects.has(s);
    executingEffects.add(s);
    try {
      if (s.units.some((u) => u.id === item.sourceId))
        killUnits(s, [item.sourceId!]);
      else killGear(s, item.sourceId!);
    } finally {
      if (!nested) executingEffects.delete(s);
    }
  }
  markWave14Mode(s, item.sourceId, effects);
  pushStack(s, {
    ...item,
    kind: "trigger",
    locationId: action.locationId ?? item.locationId,
    targetId: action.targetId,
    effects: effects.map(({ triggerCost: _cost, ...effect }) => effect),
  });
  if (cost.board || cost.discard) {
    finalizingBoardCostPlay.delete(s);
    for (const finalize of boardDeferrals) finalize();
  }
  if (effects.some((e) => e.triggerCost))
    event(
      s,
      "stateChanged",
      item.player,
      item.cardId,
      item.sourceId,
      item.locationId,
    );
}
function context(
  targetId?: string,
  sourceId?: string,
  locationId?: LocationId,
  lastUnit?: Unit,
): PreconContext {
  return {
    targetId,
    shuffle,
    empower: (state, player, id) => {
      if (id === "legend") {
        if (state.players[player].legendEmpowered) return;
        state.players[player].legendEmpowered = true;
        event(state, "empower", player, state.players[player].legendId, id);
        return;
      }
      const unit = state.units.find((u) => u.id === id);
      const object = unit ?? state.gears.find((g) => g.id === id);
      if (unit && isFace(unit.cardId, "VEN", 134)) {
        const count = unit.empowerCount ?? Number(!!unit.empowered);
        if (count >= 3) return;
        unit.empowerCount = count + 1;
        unit.empowered = true;
        event(state, "empower", player, unit.cardId, id, unit.location);
        return;
      }
      if (!object || object.empowered) return;
      object.empowered = true;
      event(
        state,
        "empower",
        player,
        object.cardId,
        id,
        unit?.location ?? base(object.owner),
      );
    },
    sourceId,
    locationId,
    lastUnit,
    runEffects,
    pay,
    canPay,
    draw,
    trigger,
    pushStack,
    spawnToken,
    takeSpell,
    killUnits: (state, ids, delayedSpell) =>
      killUnits(state, ids, false, delayedSpell),
    commitDeaths,
    getMight,
    canTargetUnit: (state, player, unit) => !protectedFrom(state, unit, player),
    readyForbidden,
    channel,
    moveUnit,
    openChoice,
    log,
    playUnit,
    discardCards,
    spellPlayed,
    dealDamage,
    bonusDamage,
    costFor,
    targetTax,
    cardEvent: event,
    killGear,
  };
}
const event = emitGameEvent;
export function emitGameEvent(
  s: GameState,
  name: PreconEvent,
  p: PlayerId,
  cardId: string,
  sourceId?: string,
  locationId?: LocationId,
  details?: Pick<
    PreconContext,
    | "killer"
    | "dyingUnitIds"
    | "amount"
    | "choosingKind"
    | "previousLocation"
    | "fromHidden"
    | "paidAdditionalCost"
    | "energySpent"
    | "playOrdinal"
    | "playSource"
    | "abilityEnergyCost"
    | "resolvedSpell"
    | "spellTrashId"
  >,
) {
  if (name === "attach") {
    const gear = s.gears.find((g) => g.id === sourceId);
    if (gear) gear.attachedTurn = s.turn;
  }
  laterCardEvent(s, name, p, cardId, sourceId, locationId, {
    ...context(undefined, sourceId, locationId),
    ...details,
  });
  if (name === "attach") {
    const g = s.gears.find((g) => g.id === sourceId),
      u = s.units.find((u) => u.id === g?.attachedTo);
    if (g && u && (isFace(g.cardId, "JDG", 59) || isFace(g.cardId, "SFD", 59)))
      g.copiedText = u.cardId;
  }
}
function playUnit(
  s: GameState,
  p: PlayerId,
  cardId: string,
  location: LocationId,
  ready = false,
) {
  if (!canPlayCard(s, p, getCard(cardId), location)) return undefined;
  const sc = getScript(cardId);
  const unit: Unit = {
    id: uid(s, "u"),
    cardId,
    owner: p,
    location,
    ready:
      ready ||
      !!sc?.keywords?.includes("Enters ready") ||
      s.players[p].unitsEnterReadyTurn === s.turn ||
      textUnits(s).some((u) => u.owner === p && u.cardId === "ogn-011-298"),
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    temporary: sc?.keywords?.includes("Temporary") || undefined,
    summonedTurn: s.turn,
  };
  s.units.push(unit);
  s.players[p].cardsPlayedThisTurn++;
  const playOrdinal = s.players[p].cardsPlayedThisTurn;
  event(s, "cardFinalized", p, cardId, unit.id, location, {
    playOrdinal,
    energySpent: 0,
    playSource: "effect",
  });
  unitPlayed(s, p, unit);
  cardPlayed(s, p, cardId, unit.id, location, {
    playOrdinal,
    energySpent: 0,
    playSource: "effect",
  });
  if (sc?.onPlay)
    trigger(s, p, cardId, unit.id, textEffects(unit, sc.onPlay), location);
  return unit;
}
function dealDamage(s: GameState, u: Unit, n: number, unitDamage = false) {
  if (
    n <= 0 ||
    (!unitDamage && s.preventEffectDamageTurn === s.turn) ||
    (!unitDamage &&
      effectActors.get(s) !== undefined &&
      effectActors.get(s) !== u.owner &&
      isFace(u.cardId, "VEN", 25) &&
      s.players[u.owner].runes.length >= 7) ||
    getKeywords(s, u).includes("Prevent all damage")
  )
    return;
  if (u.preventNextDamageTurn === s.turn) {
    delete u.preventNextDamageTurn;
    return;
  }
  if (u.doubleDamageTurn === s.turn) n *= 2 ** (u.damageDoublings ?? 1);
  if (
    getKeywords(s, u).includes("Prevent damage while not in combat") &&
    !(
      s.combat?.engaged &&
      s.combat.fieldId === u.location &&
      (!s.combat.designatedUnits || s.combat.designatedUnits.includes(u.id))
    )
  )
    return;
  const prevented = Math.min(n, u.preventDamage ?? 0);
  u.preventDamage = (u.preventDamage ?? 0) - prevented;
  const dealt = Math.max(0, n - prevented);
  u.damage += dealt;
  const damageOwner = effectActors.get(s);
  if (damageOwner !== undefined && dealt > 0) {
    (u.damageByPlayer ??= [0, 0])[damageOwner] += dealt;
  }
  if (dealt > 0) {
    u.spellDamageId = !unitDamage ? s.resolving?.at(-1)?.id : undefined;
    u.damageTakenTurn = s.turn;
    const watches = (s.damageTriggers ?? []).filter(
      (w) => w.turn === s.turn && (!w.targetId || w.targetId === u.id),
    );
    s.damageTriggers = s.damageTriggers?.filter(
      (w) => !w.targetId || !watches.includes(w),
    );
    for (const watch of watches)
      trigger(s, watch.player, watch.cardId, `delayed:${watch.cardId}`, [
        {
          type: "special",
          custom: "wave9:damage-kill",
          cardName: u.id,
          keyword: watch.cardId,
        },
      ]);
  }
}
type ChoiceInput = Omit<
  NonNullable<GameState["pendingChoice"]>,
  "player" | "returnPhase" | "returnPriority" | "remaining" | "kind"
> & {
  kind?: NonNullable<GameState["pendingChoice"]>["kind"];
  remaining?: number;
};
function openChoice(s: GameState, p: PlayerId, input: ChoiceInput) {
  if (s.pendingChoice) throw new Error("Cannot overwrite an unresolved choice");
  s.pendingChoice = {
    player: p,
    kind: input.kind ?? "custom",
    remaining: input.remaining ?? 1,
    returnPhase: s.phase,
    returnPriority: s.priorityPlayer,
    ...input,
  };
  s.phase = "choice";
  s.priorityPlayer = p;
}
function resumeChoice(s: GameState, selected = true) {
  const choice = s.pendingChoice!;
  s.pendingChoice = null;
  s.phase = choice.returnPhase;
  s.priorityPlayer = choice.returnPriority;
  const actor = choice.actor ?? choice.player;
  const after = choice.afterEffects ?? [];
  if (selected && choice.effect?.effects)
    runEffects(
      s,
      actor,
      choice.effect.effects,
      choice.targetId,
      choice.sourceId,
      choice.locationId,
      choice.sourceSnapshot,
    );
  const nested = s.pendingChoice as GameState["pendingChoice"];
  if (nested) nested.afterEffects = [...(nested.afterEffects ?? []), ...after];
  else
    runEffects(
      s,
      actor,
      after,
      choice.targetId,
      choice.sourceId,
      choice.locationId,
      choice.sourceSnapshot,
    );
  if (!s.pendingChoice) finishResolvedCards(s);
  checkVictory(s);
  drainTriggers(s);
  continuePending(s);
}
function takeSpell(s: GameState, p: PlayerId, id: string) {
  const item = s.stack.find((i) => i.id === id && i.kind === "spell");
  if (!item) return;
  item.originalOwner ??= item.player;
  item.player = p;
  const modes = getScript(item.cardId)?.spellModes ?? [
    { label: "New targets", effects: item.effects },
  ];
  const options: GameAction[] = [
    {
      id: "choose-custom:retarget:keep",
      player: p,
      category: "ability",
      label: "Keep existing choices",
      effects: [],
    },
  ];
  const complex =
    item.effects.some(
      (e) =>
        e.chosenTargetId !== undefined ||
        e.target === "boardCards" ||
        e.custom?.startsWith("wave24:"),
    ) ||
    item.declaration?.repeated ||
    item.declaration?.repeatMask !== undefined;
  if (complex)
    options.push({
      id: "choose-custom:retarget:change",
      player: p,
      category: "ability",
      label: "Choose all modes and targets again",
      effects: [{ type: "special", custom: "retarget-draft", cardName: id }],
    });
  for (const [index, mode] of (complex ? [] : modes).entries()) {
    const effects = annotateEffects(
      mode.effects,
      Boolean(item.fromHidden),
      Boolean(item.additionalCostPaid),
      item.fromHidden ? item.locationId : undefined,
    ).map((e) => ({ ...e, chosenTargetId: undefined }));
    for (const targetId of targets(
      s,
      p,
      effects,
      item.locationId,
      item.sourceId,
    ))
      options.push({
        id: `choose-custom:retarget:${index}:${targetId ?? ""}`,
        player: p,
        category: "ability",
        label: `${mode.label}${targetLabel(s, targetId)}`,
        effects: [
          {
            type: "special",
            custom: "retarget-spell",
            cardName: id,
            chosenTargetId: targetId ?? null,
            effects,
          },
        ],
      });
  }
  openChoice(s, p, { options });
}
function finishResolvedCards(s: GameState) {
  drainTokenReplacements(s, context());
  if (s.pendingChoice) return;
  const resolved = [...(s.resolving ?? []), ...(s.resolvingAbilities ?? [])];
  s.resolving = [];
  s.resolvingAbilities = [];
  for (const item of resolved) {
    if (item.kind === "ability") {
      event(
        s,
        "abilityActivated",
        item.player,
        item.cardId,
        item.sourceId,
        item.locationId,
        { abilityEnergyCost: item.abilityEnergyCost },
      );
      continue;
    }
    spellPlayed(s, item.player, item.cardId);
    cardPlayed(s, item.player, item.cardId, undefined, item.locationId, {
      playOrdinal: item.playOrdinal,
      energySpent: item.energySpent,
      fromHidden: item.fromHidden,
      paidAdditionalCost: item.additionalCostPaid,
      playSource: item.playSource,
    });
    const previousTrashId = trashCards(s, item.originalOwner ?? item.player).at(
      -1,
    )?.id;
    if (item.recycleOnLeave) {
      recycleCards(
        s,
        item.originalOwner ?? item.player,
        [item.cardId],
        item.player,
      );
    } else if (
      isFace(item.cardId, "OGN", 122) ||
      isFace(item.cardId, "SFD", 200)
    ) {
      s.players[item.originalOwner ?? item.player].banished.push(item.cardId);
      event(s, "banish", item.player, item.cardId);
    } else if (
      item.flowed &&
      (item.grantedFlow || getScript(item.cardId)?.flow?.banishAfter !== false)
    ) {
      s.players[item.originalOwner ?? item.player].banished.push(item.cardId);
      event(s, "banish", item.player, item.cardId);
    } else addToTrash(s, item.originalOwner ?? item.player, item.cardId);
    const last = trashCards(s, item.originalOwner ?? item.player).at(-1);
    event(
      s,
      "spellResolved",
      item.player,
      item.cardId,
      item.id,
      item.locationId,
      {
        resolvedSpell: item,
        spellTrashId:
          last?.id !== previousTrashId && last?.cardId === item.cardId
            ? last.id
            : undefined,
      },
    );
  }
  if (s.resolving) s.resolving = [];
}
function continuePending(s: GameState) {
  drainTokenReplacements(s, context());
  if (s.pendingChoice) return;
  advanceDeaths(s, context());
  if (s.pendingChoice || s.deathBatches?.length) return;
  if (s.pendingCombatDamage) {
    const damage = s.pendingCombatDamage;
    delete s.pendingCombatDamage;
    finishCombatDamage(s, damage.preview, damage.hits);
  }
  advancePendingPlays(s);
  if (s.pendingChoice || s.stack.length || s.winner !== null) return;
  if (s.pendingAwaken !== undefined) {
    const p = s.pendingAwaken;
    delete s.pendingAwaken;
    startBeginning(s, p);
  } else if (s.pendingBeginning !== undefined) {
    const p = s.pendingBeginning;
    delete s.pendingBeginning;
    finishBeginning(s, p);
  } else if (s.pendingTurnStart !== undefined) {
    const p = s.pendingTurnStart;
    delete s.pendingTurnStart;
    finishTurnStart(s, p);
  } else if (s.pendingCombatFinish) finishCombat(s);
  else if (s.pendingEndTurn !== undefined) {
    const p = s.pendingEndTurn;
    delete s.pendingEndTurn;
    finishEndTurn(s, p);
  }
}
function discardCards(s: GameState, p: PlayerId, ids: string[], batch = true) {
  addToTrash(s, p, ...ids);
  s.players[p].discardedThisTurn =
    (s.players[p].discardedThisTurn ?? 0) + ids.length;
  if (batch && ids.length)
    event(s, "discardBatch", p, ids[0], undefined, undefined, {
      amount: ids.length,
    });
  for (const id of ids) {
    event(s, "discard", p, id);
    const effects = getScript(id)?.onDiscard;
    if (effects) trigger(s, p, id, `discard:${id}`, effects, base(p));
  }
}
function moveUnit(
  s: GameState,
  u: Unit,
  destination: LocationId,
  actor: PlayerId = u.owner,
) {
  if (u.location === destination) return;
  if (
    actor !== u.owner &&
    getKeywords(s, u).includes("Cannot be moved by enemies")
  )
    return;
  if (
    destination === base(u.owner) &&
    getKeywords(s, u).includes("Cannot move to base")
  )
    return;
  const previousLocation = u.location;
  u.movesThisTurn = (u.movesTurn === s.turn ? (u.movesThisTurn ?? 0) : 0) + 1;
  u.movesTurn = s.turn;
  u.location = destination;
  event(s, "move", actor, u.cardId, u.id, destination, { previousLocation });
  for (const effects of unitTriggerEffects(s, u, "onMove"))
    trigger(s, u.owner, u.cardId, u.id, textEffects(u, effects), destination);
}
function buffUnit(s: GameState, u: Unit) {
  if (u.buff && u.cardId !== "ogn-078-298") return;
  u.buff++;
  event(s, "buff", u.owner, u.cardId, u.id, u.location);
  for (const gear of s.gears.filter(
    (g) => g.owner === u.owner && g.cardId === "ogn-152-298" && g.ready,
  ))
    if (canPay(s, u.owner, 0, 1, ["Body"]))
      pushStack(s, {
        player: u.owner,
        cardId: gear.cardId,
        sourceId: gear.id,
        targetId: u.id,
        effects: [{ type: "special", custom: "mistfall" }],
        kind: "trigger",
      });
}
function runEffects(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
  locationId?: LocationId,
  sourceSnapshot?: Unit,
) {
  const nested = executingEffects.has(s);
  const previousActor = effectActors.get(s);
  effectActors.set(s, p);
  executingEffects.add(s);
  try {
    const active = stepEffects.get(s);
    const sourceCard =
      sourceSnapshot?.cardId ??
      s.units.find((u) => u.id === sourceId)?.cardId ??
      s.gears.find((g) => g.id === sourceId)?.cardId ??
      s.fields.find((f) => f.id === sourceId)?.cardId ??
      (sourceId === "legend" ? s.players[p].legendId : undefined);
    withStepEffect(
      s,
      {
        ...active,
        cardId: active?.cardId ?? sourceCard ?? s.resolving?.at(-1)?.cardId,
        sourceId,
        player: p,
        targetId,
        locationId,
        stage: "applied",
      },
      () => {
        executeEffects(
          s,
          p,
          effects,
          targetId,
          sourceId,
          locationId,
          sourceSnapshot,
        );
      },
    );
  } finally {
    if (previousActor === undefined) effectActors.delete(s);
    else effectActors.set(s, previousActor);
    if (!nested) executingEffects.delete(s);
  }
}
function executeEffects(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
  locationId?: LocationId,
  sourceSnapshot?: Unit,
) {
  const originalTargetId = targetId;
  for (const [effectIndex, e] of effects.entries()) {
    targetId =
      e.chosenTargetId === undefined
        ? originalTargetId
        : (e.chosenTargetId ?? undefined);
    const rest = effects.slice(effectIndex + 1);
    const inspection = inspectDeck(
      s,
      p,
      e,
      context(targetId, sourceId, locationId, sourceSnapshot),
    );
    if (inspection === "skip") continue;
    if (inspection === "pause") {
      if (s.pendingChoice) {
        s.pendingChoice.afterEffects = [
          ...(s.pendingChoice.afterEffects ?? []),
          ...rest,
        ];
        return;
      }
      continue;
    }
    if (stepFrames)
      stepEffects.set(s, {
        ...stepEffects.get(s),
        player: p,
        targetId,
        type: e.type,
        stage: "applied",
      });

    if (e.condition === "handAtMostOne" && s.players[p].hand.length > 1)
      continue;
    if (
      e.condition === "hiddenControlled" &&
      !s.hidden?.some(
        (h) =>
          h.owner === p &&
          s.fields.find((f) => f.id === h.location)?.controller === p,
      )
    )
      continue;
    if (e.condition === "atBattlefield" && !locationId?.startsWith("field:"))
      continue;
    if (e.condition === "paidAdditionalCost" && !e.additionalCostPaid) continue;
    if (
      e.condition === "sourceAtBattlefield" &&
      !s.units
        .find((unit) => unit.id === sourceId)
        ?.location.startsWith("field:")
    )
      continue;
    if (e.target === "boardCards") {
      const originallySelected = (targetId ?? "").split("~").filter(Boolean);
      const candidates = boardCandidates(s, p, e, sourceId, locationId);
      const remaining = candidates.filter((o) =>
        originallySelected.includes(o.id),
      );
      if (!validBoardGroup(e, remaining)) {
        openChoice(s, p, {
          kind: "boardTargets",
          effect: e,
          effects: [e],
          sourceId,
          locationId,
          targetId,
          boardSelection: {
            selected: [],
            allowedIds: remaining.map((o) => o.id),
          },
          afterEffects: rest,
          sourceSnapshot,
        });
        return;
      }
      const ids = remaining.map((o) => o.id);
      if (e.type === "special") {
        runLaterEffect(s, p, e, {
          ...context(ids.join("~"), sourceId, locationId, sourceSnapshot),
          abilityInstance: e.abilityInstance,
        });
        if (s.pendingChoice) {
          s.pendingChoice.afterEffects = [
            ...(s.pendingChoice.afterEffects ?? []),
            ...rest,
          ];
          return;
        }
      } else if (e.type === "kill") {
        killUnits(s, ids);
        for (const id of ids)
          if (s.gears.some((g) => g.id === id)) killGear(s, id);
      } else
        for (const object of remaining) {
          const unit = s.units.find((u) => u.id === object.id);
          const gear = s.gears.find((g) => g.id === object.id);
          if (e.type === "moveTarget" && unit) {
            const destination =
              e.group?.destination === "any"
                ? locationId
                : e.group?.destination === "here"
                  ? s.units.find((u) => u.id === sourceId)?.location
                  : base(unit.owner);
            if (
              destination &&
              (e.group?.destination !== "here" ||
                destination.startsWith("field:"))
            )
              moveUnit(s, unit, destination, p);
          } else if (e.type === "bounce" && unit) {
            runEffects(
              s,
              p,
              [{ type: "bounce", target: "anyUnit" }],
              unit.id,
              sourceId,
              locationId,
            );
          } else if (e.type === "damage" && unit) {
            runEffects(
              s,
              p,
              [{ type: "damage", amount: e.amount, target: "anyUnit" }],
              unit.id,
              sourceId,
              locationId,
            );
          } else if (e.type === "ready") {
            if (unit)
              runEffects(
                s,
                p,
                [{ type: "ready", target: "anyUnit" }],
                unit.id,
                sourceId,
                locationId,
              );
            else if (gear) {
              if (!gear.ready && !readyForbidden(s, gear.owner)) {
                gear.ready = true;
                event(s, "ready", p, gear.cardId, gear.id, base(gear.owner));
              }
            } else {
              const rune = s.players[object.owner].runes.find(
                (r) => r.id === object.id,
              );
              if (rune) rune.ready = true;
            }
          }
        }
      log(
        s,
        `${s.players[p].name}: ${e.type} affects ${remaining.length} chosen object(s).`,
        "play",
        p,
      );
      continue;
    }
    const candidate = s.units.find(
      (u) =>
        u.id ===
        (e.condition === "self"
          ? sourceId
          : ["duel", "duelSameBattlefield", "duelEnemyAtBattlefield"].includes(
                e.target ?? "",
              )
            ? targetId?.split("~")[0]
            : targetId),
    );
    const relativeSource = s.units.find((unit) => unit.id === sourceId);
    const relativeGear = s.gears.find((gear) => gear.id === sourceId);
    const relativeLocation = !sourceId
      ? locationId
      : sourceId.startsWith("field:")
        ? (sourceId as LocationId)
        : (relativeSource?.location ??
          (relativeGear
            ? base(relativeGear.owner)
            : sourceId === "legend"
              ? locationId
              : undefined));
    const u =
      candidate &&
      effectTargetMatches(s, candidate, e, sourceId) &&
      (!e.excludeSource || candidate.id !== sourceId) &&
      (!e.target ||
        ["duel", "duelSameBattlefield", "duelEnemyAtBattlefield"].includes(
          e.target,
        ) ||
        matches(
          s,
          candidate,
          p,
          e.target,
          ["friendlyUnitHere", "enemyUnitHere", "unitHere"].includes(e.target)
            ? relativeLocation
            : locationId,
          e.maxMight,
        ))
        ? candidate
        : undefined;
    const n = e.amount ?? 1;
    const targetPlayer = e.who === "opponent" ? otherPlayer(p) : p;
    if (
      (e.target === "anyGear" ||
        e.target === "friendlyEquipment" ||
        e.target === "enemyGear" ||
        e.target === "enemyUnitOrGear") &&
      !targets(s, p, [e], locationId, sourceId).includes(targetId)
    ) {
      log(
        s,
        "The chosen gear is no longer legal. That instruction is skipped.",
        "info",
        p,
      );
      continue;
    }
    if (
      e.target &&
      ![
        "battlefield",
        "trashCards",
        "ownTeemo",
        "exhaustedOther",
        "unitAndEquipment",
        "enemyChainItemChoosingFriendly",
        "friendlyUnitAndEnemyChainItem",
        "spell",
        "duel",
        "duelSameBattlefield",
        "duelEnemyAtBattlefield",
        "friendlyAndEnemyHere",
        "enemyUnitAndBattlefield",
        "twoUnitsSameBattlefield",
        "twoUnitChoices",
        "upToOneEnemyUnitHere",
        "twoFriendlyDifferentLocations",
        "orderedTwoUnits",
        "orderedTwoFriendlyUnits",
        "enemyUnitOrGear",
        "anyTwoUnits",
        "twoFriendlyUnits",
        "unitOrGear",
        "anyGear",
        "relentlessMove",
        "shurikenMove",
        "friendlyAndEnemyBattlefield",
        "empowerObject",
        "enemyMoveDestination",
        "enemyAndOptionalFriendly",
        "friendlyAndOptionalEnemy",
        "friendlyEquipment",
        "upToThreeUnitsSameLocation",
        "upToFourFriendlyUnits",
        "friendlyAndWeakerEnemy",

        "friendlyBaseAndBattlefield",
        "friendlyUnitAndBattlefield",
        "friendlyUnitAndBaseMove",
        "enemyUnitAndOccupiedLocation",
        "enemyHereAndDifferentBattlefield",
        "friendlyBattlefieldAndOptionalEnemy",
        "battlefieldUnitAndOptionalOther",

        "twoGear",
        "enemyGear",
        "upToTwoUnits",
        "upToTwoFriendlyUnits",
        "unitAndSpell",
      ].includes(e.target) &&
      !u &&
      e.custom !== "wave8:teemo" &&
      e.custom !== "wave15:baited-hook"
    ) {
      log(
        s,
        "The chosen target is no longer legal. That instruction is skipped.",
        "info",
        p,
      );
      continue;
    }
    switch (e.type) {
      case "draw":
        draw(s, targetPlayer, n);
        break;
      case "damage":
        if (n <= 0) break;
        if (
          e.target === "upToTwoUnits" ||
          e.target === "upToThreeUnitsSameLocation"
        ) {
          for (const id of (targetId ?? "").split("~")) {
            const target = s.units.find((u) => u.id === id);
            if (target && !protectedFrom(s, target, p))
              dealDamage(
                s,
                target,
                n +
                  bonusDamage(s, p) +
                  (s.fields.find((f) => f.id === target.location)?.cardId ===
                  "ogn-296-298"
                    ? 1
                    : 0),
              );
          }
          break;
        }
        if (u) {
          dealDamage(
            s,
            u,
            e.damageSource === "unit"
              ? n
              : n +
                  bonusDamage(s, p) +
                  (s.fields.find((f) => f.id === u.location)?.cardId ===
                  "ogn-296-298"
                    ? 1
                    : 0),
            e.damageSource === "unit",
          );
          const lethal = u.damage >= getMight(s, u);
          if (u.damage > 0 && lethal && e.condition === "drawOnKill") {
            killUnits(s, [u.id]);
            if (!s.units.some((v) => v.id === u.id)) draw(s, p, 1);
          }
        }
        break;
      case "duel": {
        const [first, second] = (targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        if (
          first &&
          second &&
          first.id !== second.id &&
          (e.target !== "duelSameBattlefield" ||
            (first.location.startsWith("field:") &&
              first.location === second.location)) &&
          (e.target !== "duelEnemyAtBattlefield" ||
            second.location.startsWith("field:")) &&
          (e.target === "anyTwoUnits" ||
            (first.owner === p && second.owner !== p)) &&
          !protectedFrom(s, first, p) &&
          !protectedFrom(s, second, p)
        ) {
          const a = getMight(s, first),
            b = getMight(s, second);
          effectActors.set(s, second.owner);
          dealDamage(s, first, b, true);
          effectActors.set(s, first.owner);
          dealDamage(s, second, a, true);
          effectActors.set(s, p);
        }
        break;
      }
      case "kill":
        if (u) {
          const owner = u.owner;
          killUnits(s, [u.id]);
          if (e.condition === "controllerDraw2") draw(s, owner, 2);
        } else if (
          e.target === "anyGear" ||
          e.target === "enemyGear" ||
          e.target === "enemyUnitOrGear"
        ) {
          const gear = s.gears.find((g) => g.id === targetId);
          if (
            gear &&
            effectTargetMatches(s, gear, e, sourceId) &&
            (e.target !== "enemyUnitOrGear" || gear.owner !== p)
          ) {
            killGear(s, gear.id);
            if (e.condition === "controllerDraw2") draw(s, gear.owner, 2);
          }
        }
        break;
      case "heal":
        if (u) u.damage = Math.max(0, u.damage - n);
        break;
      case "healAll":
        s.units.forEach((u) => {
          if (e.who === "all" || u.owner === targetPlayer) u.damage = 0;
        });
        break;
      case "buff":
        if (u) buffUnit(s, u);
        break;
      case "buffAll":
        s.units.forEach((u) => {
          if (u.owner === p) buffUnit(s, u);
        });
        break;
      case "might":
        if (e.target === "twoFriendlyUnits") {
          for (const id of (targetId ?? "").split("~")) {
            const unit = s.units.find((u) => u.id === id && u.owner === p);
            if (unit) unit.temporaryMight += n;
          }
          break;
        }
        if (u) {
          const amount =
            e.minMight !== undefined
              ? Math.min(0, Math.max(n, e.minMight - getMight(s, u)))
              : n +
                (e.condition === "aloneBonus" &&
                s.units.filter(
                  (x) => x.owner === p && x.location === u.location,
                ).length === 1
                  ? 1
                  : 0);
          changeMight(s, p, u, amount, Boolean(e.target));
        }
        break;
      case "assault":
        if (u) u.temporaryAssault += n;
        break;
      case "mightAll":
        s.units.forEach((u) => {
          if (e.who === "all" || u.owner === targetPlayer)
            u.temporaryMight += n;
        });
        break;
      case "ready":
        if (
          u &&
          !u.ready &&
          !readyForbidden(s, u.owner) &&
          !getKeywords(s, u).includes("Cannot ready")
        ) {
          u.ready = true;
          event(s, "ready", p, u.cardId, u.id, u.location);
        }
        break;
      case "readyRunes": {
        if (e.runeIds) {
          for (const rune of s.players[p].runes)
            if (e.runeIds.includes(rune.id)) rune.ready = true;
          break;
        }
        if (e.chooseRunes) {
          if (n > 0 && s.players[p].runes.some((r) => !r.ready))
            openChoice(s, p, {
              kind: "readyRunes",
              remaining: n,
              effect: e,
              sourceId,
              targetId,
              locationId,
              afterEffects: rest,
            });
          break;
        }
        let remaining = n;
        for (const rune of s.players[p].runes)
          if (!rune.ready && remaining-- > 0) rune.ready = true;
        break;
      }
      case "exhaust":
        if (u) u.ready = false;
        break;
      case "stun":
        if (u && !u.stunned && gangplank(s, u, Boolean(e.target))) {
          u.temporaryMight += 3;
          break;
        }
        if (u) {
          u.stunned = true;
          event(s, "stun", p, u.cardId, u.id, u.location);
        }
        break;
      case "recall":
        if (u) u.location = base(u.owner);
        break;
      case "moveTarget":
        if (e.target === "upToTwoFriendlyUnits") {
          for (const id of (targetId ?? "").split("~")) {
            const target = s.units.find((u) => u.id === id && u.owner === p);
            if (target) moveUnit(s, target, base(target.owner));
          }
          break;
        }
        if (u && e.condition === "chooseDestination")
          openChoice(s, p, {
            kind: "move",
            effect: e,
            afterEffects: rest,
            targetId: u.id,
            sourceId,
            locationId,
          });
        else if (u) moveUnit(s, u, base(u.owner), p);
        break;
      case "token":
        if (e.location === "here" || e.location === "base") {
          const tokenLocation =
            e.condition === "liveSourceLocation"
              ? relativeLocation
              : e.location === "base"
                ? base(p)
                : (locationId ?? base(p));
          if (!tokenLocation) break;
          for (let i = 0; i < n; i++) {
            const token = spawnToken(
              s,
              p,
              e.cardName ?? "Recruit",
              tokenLocation,
            );
            if (e.ready && token) token.ready = true;
          }
        } else {
          s.pendingChoice = {
            player: p,
            kind: "token",
            remaining: n,
            sourceId,
            returnPhase: s.phase,
            returnPriority: s.priorityPlayer,
            effect: e,
            afterEffects: rest,
            locationId,
            targetId,
          };
          s.phase = "choice";
          s.priorityPlayer = p;
        }
        break;
      case "channel":
        if (!s.players[p].runeDeck.length && e.condition === "drawIfEmpty")
          draw(s, p, 1);
        else channel(s, p, n, false);
        break;
      case "power":
        if (e.condition === "gearOnly")
          s.players[p].gearPower = (s.players[p].gearPower ?? 0) + n;
        else if (e.condition === "spellsOnly")
          s.players[p].spellPower = (s.players[p].spellPower ?? 0) + n;
        else if (e.domain)
          (s.players[p].typedPower ??= {})[e.domain] =
            (s.players[p].typedPower?.[e.domain] ?? 0) + n;
        else s.players[p].power = (s.players[p].power ?? 0) + n;
        break;
      case "energy":
        if (e.condition === "showdownsOnly")
          s.players[p].showdownEnergy = (s.players[p].showdownEnergy ?? 0) + n;
        else if (e.condition === "spellsOnly")
          s.players[p].spellEnergy = (s.players[p].spellEnergy ?? 0) + n;
        else if (e.condition === "unitsOnly")
          s.players[p].unitEnergy = (s.players[p].unitEnergy ?? 0) + n;
        else s.players[p].energy += n;
        break;
      case "damageAll":
        if (n <= 0) break;
        for (const unit of textUnits(s)) {
          if (
            (e.who === "all" || unit.owner === targetPlayer) &&
            (e.condition === "allLocations"
              ? true
              : e.condition === "allBattlefields"
                ? unit.location.startsWith("field:")
                : e.condition === "combat"
                  ? !!s.combat?.engaged && unit.location === s.combat.fieldId
                  : e.condition === "liveSourceLocation"
                    ? unit.location === relativeLocation
                    : unit.location === targetId)
          ) {
            dealDamage(
              s,
              unit,
              n +
                bonusDamage(s, p) +
                (s.fields.find((f) => f.id === unit.location)?.cardId ===
                "ogn-296-298"
                  ? 1
                  : 0),
            );
          }
        }
        break;
      case "discard":
      case "recycle":
      case "retrieve": {
        const zone =
          e.type === "discard"
            ? s.players[targetPlayer].hand
            : s.players[targetPlayer].discard;
        if (
          zone.some(
            (id) =>
              e.type !== "retrieve" ||
              ((e.condition !== "unit" || isCardType(getCard(id), "Unit")) &&
                (e.condition !== "spell" || isCardType(getCard(id), "Spell"))),
          )
        )
          openChoice(s, targetPlayer, {
            kind: e.type,
            remaining: Math.min(n, zone.length),
            effect: e,
            afterEffects: rest,
            targetId,
            sourceId,
            locationId,
            actor: p,
          });
        else if (e.type === "discard")
          for (const next of rest)
            if (next.condition === "discardEnergy") next.amount = 0;
        break;
      }
      case "drawDiscard":
        draw(s, p, n);
        if (s.players[p].hand.length)
          openChoice(s, p, {
            kind: "discard",
            remaining: n,
            effect: { type: "discard", amount: n },
            afterEffects: rest,
            targetId,
            sourceId,
            locationId,
          });
        break;
      case "predict":
        openChoice(s, p, {
          kind: "predict",
          effect: e,
          afterEffects: rest,
          targetId,
          sourceId,
          locationId,
        });
        break;
      case "sacrifice": {
        const players: PlayerId[] =
          e.who === "all"
            ? [s.currentPlayer, otherPlayer(s.currentPlayer)]
            : [targetPlayer];
        const first = players.find((owner) =>
          s.units.some((u) => u.owner === owner),
        );
        if (first !== undefined) {
          const later = players.slice(players.indexOf(first) + 1).map(
            (owner) =>
              ({
                type: "sacrifice",
                who: owner === p ? "self" : "opponent",
              }) as Effect,
          );
          openChoice(s, first, {
            kind: "sacrifice",
            effect: e,
            afterEffects: [...later, ...rest],
            targetId,
            sourceId,
            locationId,
            actor: p,
          });
        }
        break;
      }
      case "spendBuff":
        if (s.units.some((u) => u.owner === p && u.buff))
          openChoice(s, p, {
            kind: "spendBuff",
            effect: e,
            afterEffects: rest,
            targetId,
            sourceId,
            locationId,
          });
        break;
      case "buffBonus":
        s.players[p].buffBonus = (s.players[p].buffBonus ?? 0) + n;
        break;
      case "keyword":
        if (u) (u.temporaryKeywords ??= []).push(e.keyword!);
        break;
      case "temporary": {
        const target = u ?? s.gears.find((g) => g.id === targetId);
        if (target) target.temporary = true;
        break;
      }
      case "bounce":
        if (u && gangplank(s, u, Boolean(e.target))) {
          u.temporaryMight += 3;
          break;
        }
        if (u) {
          event(s, "bounce", u.owner, u.cardId, u.id, u.location);
          s.units = s.units.filter((v) => v.id !== u.id);
          if (!u.token) s.players[physicalOwner(u)].hand.push(physicalCard(u));
          for (const gear of s.gears.filter((g) => g.attachedTo === u.id))
            detach(s, gear);
        }
        break;
      case "equip": {
        const gear = s.gears.find((g) => g.id === sourceId);
        if (gear && u && gear.owner === u.owner && gear.attachedTo !== u.id) {
          detach(s, gear);
          gear.attachedTo = u.id;
          if (!u.gear.includes(gear.id)) u.gear.push(gear.id);
          event(s, "attach", p, gear.cardId, gear.id, u.location);
        }
        break;
      }
      case "score":
        point(s, targetPlayer, "card effect");
        break;
      case "mill":
        for (let i = 0; i < n && s.winner === null; i++) {
          const player = s.players[targetPlayer];
          while (!player.deck.length && s.winner === null) {
            player.fatigue++;
            point(s, otherPlayer(targetPlayer), "opponent burnout");
            if (s.winner !== null) break;
            player.deck = shuffle(s, emptyTrash(s, targetPlayer));
          }
          if (player.deck.length)
            burnToTrash(s, targetPlayer, player.deck.shift()!);
        }
        break;
      case "special":
        if (e.custom === "pending-order") {
          const index =
            s.pendingPlays?.findIndex((i) => i.id === e.cardName) ?? -1;
          if (index >= 0) {
            const item = s.pendingPlays!.splice(index, 1)[0];
            delete item.spec.orderGroup;
            s.pendingPlays!.push(item);
          }
        } else if (e.custom === "death-replacement") {
          advanceDeaths(s, context(), e.cardName);
        } else if (e.custom === "retarget-draft") {
          const item = s.stack.find((i) => i.id === e.cardName);
          if (item)
            openChoice(s, p, {
              kind: "effectDraft",
              cardId: item.cardId,
              locationId: item.locationId,
              effectDraft: retargetDraft(item),
            });
        } else if (e.custom === "retarget-spell") {
          const item = s.stack.find((i) => i.id === e.cardName);
          if (item) {
            item.effects = e.effects!;
            item.targetId = e.chosenTargetId ?? undefined;
          }
        } else if (e.custom === "confront")
          s.players[p].unitsEnterReadyTurn = s.turn;
        else if (e.custom === "optionalChannel")
          openChoice(s, p, {
            kind: "optional",
            effect: {
              type: "special",
              cardName: "Channel 1 rune exhausted",
              effects: [{ type: "channel" }],
            },
            afterEffects: rest,
            sourceId,
            targetId,
            locationId,
          });
        else if (e.custom === "duneDrake") {
          const source = s.units.find((u) => u.id === sourceId);
          if (
            source &&
            s.units.some(
              (u) => u.owner !== p && u.location === source.location && u.ready,
            )
          )
            source.temporaryMight += 2;
        } else if (e.custom === "combatShield") {
          if (u) u.combatShield = (u.combatShield ?? 0) + 2;
        } else if (e.custom === "highlander") {
          if (u) u.deathReplacementTurn = s.turn;
        } else if (e.custom === "targonsPeak")
          s.players[p].endReadyRunes = (s.players[p].endReadyRunes ?? 0) + 2;
        else if (e.custom === "mistfall") {
          const g = s.gears.find((g) => g.id === sourceId);
          if (g?.ready && u && canPay(s, p, 0, 1, ["Body"]))
            openChoice(s, p, {
              kind: "optional",
              effect: {
                type: "special",
                custom: "mistfallPay",
                cardName:
                  "Pay Body power and exhaust Mistfall to ready the buffed unit",
                effects: [{ type: "special", custom: "mistfallPay" }],
              },
              afterEffects: rest,
              targetId,
              sourceId,
              locationId,
            });
        } else if (e.custom === "mistfallPay") {
          const g = s.gears.find((g) => g.id === sourceId);
          if (g?.ready && u && canPay(s, p, 0, 1, ["Body"])) {
            pay(s, p, 0, 1, ["Body"]);
            g.ready = false;
            if (
              !readyForbidden(s, u.owner) &&
              !getKeywords(s, u).includes("Cannot ready")
            )
              u.ready = true;
          }
        } else if (e.custom === "flameChompers") {
          if (
            s.players[p].discard.includes("ogn-006-298") &&
            canPay(s, p, 0, 1, ["Fury"])
          )
            openChoice(s, p, {
              kind: "optional",
              effect: {
                type: "special",
                cardName: "Pay Fury power to play discarded Flame Chompers",
                effects: [{ type: "special", custom: "playChompers" }],
              },
              afterEffects: rest,
              targetId,
              sourceId,
              locationId,
            });
        } else if (e.custom === "playChompers") {
          const index = s.players[p].discard.indexOf("ogn-006-298");
          if (index >= 0 && canPay(s, p, 0, 1, ["Fury"])) {
            pay(s, p, 0, 1, ["Fury"]);
            openChoice(s, p, {
              kind: "token",
              effect: {
                type: "token",
                cardName: "Flame Chompers",
                condition: "realCard",
              },
              afterEffects: rest,
              sourceId,
              targetId,
              locationId,
            });
          }
        } else if (
          !runCardPlay(s, p, e, {
            ...context(targetId, sourceId, locationId, sourceSnapshot),
            abilityInstance: e.abilityInstance,
          }) &&
          !runLaterEffect(s, p, e, {
            ...{
              ...context(targetId, sourceId, locationId, sourceSnapshot),
              abilityInstance: e.abilityInstance,
            },
            fromHidden: e.fromHidden,
            paidAdditionalCost: e.additionalCostPaid,
          })
        )
          throw new Error(`Unsupported special: ${e.custom}`);
        break;
      case "playCard":
        runCardPlay(s, e.who === "opponent" ? otherPlayer(p) : p, e, {
          ...context(targetId, sourceId, locationId, sourceSnapshot),
          abilityInstance: e.abilityInstance,
        });
        break;
      case "counter": {
        const chainTarget =
          e.target === "friendlyUnitAndEnemyChainItem"
            ? targetId?.split("~")[1]
            : targetId;
        const anyAbility =
          e.target === "enemyChainItemChoosingFriendly" ||
          e.target === "friendlyUnitAndEnemyChainItem";
        const index = s.stack.findIndex(
          (item) =>
            item.id === chainTarget && (anyAbility || item.kind === "spell"),
        );
        if (
          index < 0 ||
          !targets(s, p, [e], locationId, sourceId).includes(targetId)
        )
          break;
        if (
          getScript(s.stack[index].cardId)?.uncounterable ||
          uncounterable(s, s.stack[index].player)
        )
          break;
        const item = s.stack.splice(index, 1)[0];
        if (item.kind !== "spell") {
          log(s, `${cardName(item.cardId)} ability is countered.`, "play", p);
          break;
        }
        if (item.recycleOnLeave) {
          recycleCards(
            s,
            item.originalOwner ?? item.player,
            [item.cardId],
            item.player,
          );
        } else if (
          item.flowed &&
          (item.grantedFlow ||
            getScript(item.cardId)?.flow?.banishAfter !== false)
        ) {
          s.players[item.originalOwner ?? item.player].banished.push(
            item.cardId,
          );
          event(s, "banish", item.player, item.cardId);
        } else if (e.condition === "returnCounteredToHand")
          s.players[item.originalOwner ?? item.player].hand.push(item.cardId);
        else addToTrash(s, item.originalOwner ?? item.player, item.cardId);
        log(s, `${cardName(item.cardId)} is countered.`, "play", p);
        break;
      }
      default:
        throw new Error(`Unimplemented effect operation: ${e.type}`);
    }
    event(
      s,
      "stateChanged",
      p,
      sourceSnapshot?.cardId ??
        s.units.find((u) => u.id === sourceId)?.cardId ??
        s.players[p].legendId,
      sourceId,
      locationId,
    );
    if (s.pendingChoice) {
      if (e.lookCount !== undefined && s.pendingChoice.options)
        s.pendingChoice.options = s.pendingChoice.options.map((a) => ({
          ...a,
          effects: a.effects?.map((f) =>
            f.custom &&
            /:(stacked-selected|candle-selected|ornn-finish|lightning-finish|herald-selected)$/.test(
              f.custom,
            )
              ? { ...f, lookCount: e.lookCount }
              : f,
          ),
        }));
      s.pendingChoice.afterEffects ??= rest;
      s.pendingChoice.sourceSnapshot ??= sourceSnapshot;
      return;
    }
    log(
      s,
      `${s.players[p].name}: ${effectDescription(e)}${targetLabel(s, targetId)}.`,
      "play",
      p,
    );
  }
  checkDeaths(s);
  refreshControl(s);
}
function cardPlayed(
  s: GameState,
  p: PlayerId,
  cardId: string,
  sourceId?: string,
  locationId?: LocationId,
  details?: Pick<
    PreconContext,
    | "fromHidden"
    | "paidAdditionalCost"
    | "energySpent"
    | "playOrdinal"
    | "playSource"
  >,
) {
  event(s, "play", p, cardId, sourceId, locationId, details);
  if (p !== s.currentPlayer)
    for (const u of textUnits(s).filter(
      (u) => u.owner === p && u.cardId === "ogn-117-298",
    ))
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "token", location: "here" }],
        locationId: base(p),
        kind: "trigger",
      });
}
function spellPlayed(s: GameState, p: PlayerId, cardId: string) {
  const card = getCard(cardId);
  for (const u of s.units.filter((u) => u.owner === p)) {
    if (u.cardId === "ogn-103-298")
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "might", amount: 1, condition: "self" }],
        targetId: u.id,
        kind: "trigger",
      });
    if (u.cardId === "ogs-006-024" && (card.energy ?? 0) >= 5)
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "might", amount: 3, condition: "self" }],
        targetId: u.id,
        kind: "trigger",
      });
  }
  if (s.players[p].legendId === "ogs-021-024" && (card.energy ?? 0) >= 5)
    pushStack(s, {
      player: p,
      cardId: s.players[p].legendId,
      effects: [{ type: "draw", amount: 1 }],
      kind: "trigger",
    });
}
function pushStack(
  s: GameState,
  item: Omit<StackItem, "id">,
  selectedTargets?: string[],
) {
  const deferred = finalizingBoardCostPlay.get(s);
  if (deferred && item.kind === "trigger") {
    deferred.push(() => pushStack(s, item, selectedTargets));
    return;
  }
  const repeat = scoreTriggerRepeats.get(s);
  if (
    item.kind === "trigger" &&
    repeat?.player === item.player &&
    repeat.count > 1
  ) {
    scoreTriggerRepeats.delete(s);
    try {
      for (let i = 0; i < repeat.count; i++)
        pushStack(s, item, selectedTargets);
    } finally {
      scoreTriggerRepeats.set(s, repeat);
    }
    return;
  }
  if (!s.stack.length && item.kind !== "trigger") s.chainStarter = item.player;
  s.stack.push({ ...item, id: uid(s, "stack") });
  s.consecutivePasses = 0;
  s.priorityPlayer = item.player;
  withStepEffect(
    s,
    {
      cardId: item.cardId,
      sourceId: item.sourceId,
      player: item.player,
      targetId: item.targetId,
      locationId: item.locationId,
      stage: "announced",
    },
    () => {
      log(
        s,
        `${cardName(item.cardId)}: ${item.kind === "trigger" ? "triggered ability" : "effect"} enters the chain.`,
        "play",
        item.player,
      );
    },
  );
  const ids =
    selectedTargets ??
    (item.effects.some((e) => e.target && e.chosenTargetId === undefined)
      ? (item.targetId ?? "").split("~")
      : []);
  const announced = selectedTargets
    ? ids.flatMap((target) => [...new Set(target.split("~"))])
    : [...new Set(ids.flatMap((target) => target.split("~")))];
  if (item.kind === "spell" || isCardType(getCard(item.cardId), "Unit")) {
    const count = announced.filter((id) =>
      [...s.units, ...s.gears].some(
        (o) => o.id === id && o.owner !== item.player,
      ),
    ).length;
    if (count) {
      const old = s.players[item.player].enemyChoices;
      s.players[item.player].enemyChoices = {
        turn: s.turn,
        count: (old?.turn === s.turn ? old.count : 0) + count,
      };
    }
  }
  for (const id of announced) {
    const unit = s.units.find((u) => u.id === id);
    if (unit)
      event(s, "target", item.player, unit.cardId, unit.id, unit.location, {
        choosingKind: item.kind,
      });
  }
}
function trigger(
  s: GameState,
  p: PlayerId,
  cardId: string,
  sourceId: string,
  effects: Effect[],
  locationId?: LocationId,
  sourceSnapshot?: Unit,
) {
  const repeat = scoreTriggerRepeats.get(s);
  if (repeat?.player === p && repeat.count > 1) {
    scoreTriggerRepeats.delete(s);
    try {
      for (let i = 0; i < repeat.count; i++)
        trigger(s, p, cardId, sourceId, effects, locationId, sourceSnapshot);
    } finally {
      scoreTriggerRepeats.set(s, repeat);
    }
    return;
  }
  if (
    effects.every((e) => e.condition === "atBattlefield") &&
    !locationId?.startsWith("field:")
  )
    return;
  // Empowered trigger restrictions are checked at the event, then frozen.
  const source =
    s.units.find((unit) => unit.id === sourceId) ??
    sourceSnapshot ??
    s.gears.find((gear) => gear.id === sourceId);
  effects = effects
    .filter(
      (e) =>
        e.condition !== "playedFromHidden" ||
        e.fromHidden ||
        (source && "playedFromHidden" in source && source.playedFromHidden),
    )
    .map((e) => ({
      ...e,
      ...(e.condition === "playedFromHidden" ? { condition: undefined } : {}),
      ...(e.triggerCost?.recycleSelf
        ? {
            triggerCost: {
              ...e.triggerCost,
              trashId: sourceSnapshot?.deathTrashId,
            },
          }
        : {}),
    }));
  effects = effects
    .filter(
      (effect) =>
        effect.condition !== "runesAtMostFour" ||
        s.players[p].runes.length <= 4,
    )
    .map((effect) =>
      effect.condition === "runesAtMostFour"
        ? { ...effect, condition: undefined }
        : effect,
    );
  effects = effects
    .filter(
      (effect) =>
        effect.condition !== "allFourTribes" ||
        ["Bird", "Cat", "Dog", "Poro"].every((tag) =>
          s.units.some(
            (unit) => unit.owner === p && getUnitTags(unit).includes(tag),
          ),
        ),
    )
    .map((effect) =>
      effect.condition === "allFourTribes"
        ? { ...effect, condition: undefined }
        : effect,
    );
  effects = effects
    .filter(
      (effect) =>
        effect.condition !== "enemyAloneHere" ||
        s.units.filter(
          (unit) => unit.owner !== p && unit.location === locationId,
        ).length === 1,
    )
    .map((effect) =>
      effect.condition === "enemyAloneHere"
        ? { ...effect, condition: undefined }
        : effect,
    );
  effects = effects
    .filter(
      (effect) => effect.condition !== "sourceEmpowered" || source?.empowered,
    )
    .map((effect) =>
      effect.condition === "sourceEmpowered"
        ? { ...effect, condition: undefined }
        : effect,
    );
  effects = effects.filter(
    (effect) =>
      effect.condition !== "atBattlefield" || locationId?.startsWith("field:"),
  );
  effects = effects
    .map((effect) =>
      effect.condition === "paidAdditionalCost"
        ? {
            ...effect,
            additionalCostPaid:
              effect.additionalCostPaid ||
              s.units.find((unit) => unit.id === sourceId)
                ?.additionalCostPaid ||
              false,
          }
        : effect,
    )
    .filter(
      (effect) =>
        effect.condition !== "paidAdditionalCost" || effect.additionalCostPaid,
    );
  effects = effects
    .filter(
      (effect) =>
        effect.condition !== "sourceAtBattlefield" ||
        s.units
          .find((unit) => unit.id === sourceId)
          ?.location.startsWith("field:"),
    )
    .map((effect) =>
      effect.condition === "sourceAtBattlefield"
        ? { ...effect, condition: undefined }
        : effect,
    );
  effects = effects.map((e) =>
    e.custom === "draft:volibear" ? { ...e, amount: 5 + bonusDamage(s, p) } : e,
  );
  if (!effects.length) return;
  const deferred = finalizingBoardCostPlay.get(s);
  if (deferred) {
    deferred.push(() =>
      trigger(s, p, cardId, sourceId, effects, locationId, sourceSnapshot),
    );
    return;
  }
  if (s.pendingChoice || executingEffects.has(s)) {
    (s.pendingTriggers ??= []).push({
      player: p,
      cardId,
      sourceId,
      effects,
      locationId,
      ...(sourceSnapshot ? { sourceSnapshot } : {}),
    });
    return;
  }
  const options: GameAction[] = [];
  for (const candidate of iterateTriggerActions(
    s,
    p,
    effects,
    sourceId,
    cardId,
    locationId,
  )) {
    options.push(candidate);
    if (options.length === 2) break;
  }
  if (!options.length) return;
  if (
    options.length === 1 &&
    !effects.some((e) => e.optional && !e.chooseRunes)
  ) {
    finalizeTrigger(
      s,
      { player: p, cardId, sourceId, effects, locationId, sourceSnapshot },
      options[0],
    );
    return;
  }
  s.pendingChoice = {
    player: p,
    kind: "trigger",
    remaining: 1,
    sourceId,
    cardId,
    effects,
    locationId,
    returnPhase: s.phase,
    returnPriority: s.priorityPlayer,
    ...(sourceSnapshot ? { sourceSnapshot } : {}),
  };
  s.phase = "choice";
  s.priorityPlayer = p;
}
function syncCombatParticipants(s: GameState) {
  const combat = s.combat;
  if (!combat || s.pendingChoice || combat.stage !== "priority") return;
  const field = combat.fieldId;
  const present = s.units.filter((u) => u.location === field);
  const newlyEngaged =
    !combat.engaged &&
    present.some((u) => u.owner === combat.attacker) &&
    present.some((u) => u.owner === combat.defender);
  if (newlyEngaged) {
    combat.engaged = true;
    event(
      s,
      "combatStart",
      combat.attacker,
      s.fields.find((f) => f.id === field)!.cardId,
      field,
      field,
    );
  }
  if (!combat.engaged) return;
  const previous = new Set(combat.designatedUnits ?? []);
  const arriving = present.filter((u) => !previous.has(u.id));
  // Attack/defend triggers occur only on the first designation in a combat.
  combat.designatedUnits = [
    ...new Set([...previous, ...present.map((u) => u.id)]),
  ];
  for (const u of arriving) {
    if (u.owner === combat.attacker)
      event(s, "attack", u.owner, u.cardId, u.id, field);
    for (const effects of unitTriggerEffects(
      s,
      u,
      u.owner === combat.attacker ? "onAttack" : "onDefend",
    )) {
      s.pendingTriggers ??= [];
      s.pendingTriggers.push({
        player: u.owner,
        cardId: u.cardId,
        sourceId: u.id,
        effects,
        locationId: field,
      });
    }
    const army = present.filter((v) => v.owner === u.owner);
    if (army.length === 1)
      for (const g of s.gears.filter(
        (g) => g.owner === u.owner && g.cardId === "ogn-060-298",
      ))
        pushStack(s, {
          player: u.owner,
          cardId: g.cardId,
          sourceId: g.id,
          targetId: u.id,
          effects: [{ type: "might", amount: 1, chosenTargetId: u.id }],
          kind: "trigger",
        });
  }
  if (newlyEngaged) {
    const f = s.fields.find((f) => f.id === field)!;
    const effects = getScript(f.cardId)?.onDefend;
    if (effects)
      s.pendingTriggers = [
        ...(s.pendingTriggers ?? []),
        {
          player: combat.defender,
          cardId: f.cardId,
          sourceId: f.id,
          effects,
          locationId: field,
        },
      ];
  }
  drainTriggers(s);
}
function openShowdown(s: GameState, p: PlayerId, field: LocationId) {
  // Reinforcement during an existing showdown keeps its focus and attack designation.
  // Other battlefields wait until this showdown and its chain have finished.
  if (s.combat) return;
  s.lastExcessDamage = 0;
  s.phase = "showdown";
  s.focusPlayer = p;
  s.priorityPlayer = p;
  s.consecutivePasses = 0;
  s.combat = {
    fieldId: field,
    attacker: p,
    defender: otherPlayer(p),
    stage: "priority",
    engaged: false,
    designatedUnits: [],
    total: [0, 0],
    remaining: [0, 0],
    assignments: [{}, {}],
    assigningPlayer: p,
  };
  log(
    s,
    `Showdown at ${locationName(field)}. ${s.players[p].name} has focus.`,
    "combat",
    p,
    { stage: "start", preview: getCombatPreview(s)! },
  );
  event(
    s,
    "showdownStart",
    p,
    s.fields.find((f) => f.id === field)!.cardId,
    field,
    field,
  );
  syncCombatParticipants(s);
}
function advancePendingPlays(s: GameState) {
  if (
    s.pendingChoice ||
    executingEffects.has(s) ||
    s.resolving?.length ||
    s.resolvingAbilities?.length
  )
    return;
  const pending = s.pendingPlays?.at(-1);
  const group = pending?.spec.orderGroup
    ? s.pendingPlays!.filter(
        (i) =>
          i.player === pending.player &&
          i.spec.orderGroup === pending.spec.orderGroup,
      )
    : [];
  if (pending && group.length > 1) {
    openChoice(s, pending.player, {
      options: group.map((i) => ({
        id: `choose-custom:pending-order:${i.id}`,
        player: i.player,
        category: "ability",
        label: `Play ${cardName(i.cardId)} next`,
        cardId: i.cardId,
        effects: [{ type: "special", custom: "pending-order", cardName: i.id }],
      })),
    });
    return;
  }
  if (pending)
    openChoice(s, pending.player, {
      kind: "effectPlay",
      cardId: pending.cardId,
      sourceId: pending.id,
    });
}
function drainTriggers(s: GameState) {
  advancePendingPlays(s);
  if (s.pendingChoice || executingEffects.has(s) || !s.pendingTriggers?.length)
    return;
  const next = s.pendingTriggers.shift()!;
  trigger(
    s,
    next.player,
    next.cardId,
    next.sourceId,
    next.effects,
    next.locationId,
    next.sourceSnapshot,
  );
  if (!s.pendingChoice) drainTriggers(s);
}
function concludeShowdown(s: GameState) {
  const c = s.combat!;
  const attackers = s.units.filter(
    (u) => u.owner === c.attacker && u.location === c.fieldId,
  );
  const defenders = s.units.filter(
    (u) => u.owner === c.defender && u.location === c.fieldId,
  );
  if (attackers.length && defenders.length) {
    c.stage = "assign";
    for (const p of [0, 1] as const) {
      c.total[p] = s.units
        .filter((u) => u.owner === p && u.location === c.fieldId)
        .reduce((sum, u) => sum + getCombatPower(s, u), 0);
      c.remaining[p] = c.total[p];
    }
    c.assigningPlayer = c.attacker;
    s.priorityPlayer = c.attacker;
    s.phase = "damage";
    recordStep(
      s,
      `Assign combat damage: ${s.players[c.attacker].name} ${c.total[c.attacker]} · ${s.players[c.defender].name} ${c.total[c.defender]}.`,
      { stage: "assign", preview: getCombatPreview(s)! },
    );
    advanceAssignment(s);
    return;
  }
  finishCombat(s);
}
function advanceAssignment(s: GameState) {
  const c = s.combat!;
  const done = (p: PlayerId) =>
    c.remaining[p] === 0 ||
    !s.units.some(
      (u) =>
        u.owner !== p &&
        u.location === c.fieldId &&
        (c.assignments[p][u.id] ?? 0) < damageToKill(s, u),
    );
  if (done(c.assigningPlayer)) {
    if (c.assigningPlayer === c.attacker) {
      c.assigningPlayer = c.defender;
      s.priorityPlayer = c.defender;
      if (done(c.defender)) resolveCombatDamage(s);
    } else resolveCombatDamage(s);
  }
}
function resolveCombatDamage(s: GameState) {
  const c = s.combat!;
  const preview = getCombatPreview(s)!;
  const hits: CombatHit[] = [];
  s.lastExcessDamage = Object.entries(c.assignments[c.attacker]).reduce(
    (total, [id, n]) => {
      const u = s.units.find((u) => u.id === id);
      return total + Math.max(0, n - (u ? damageToKill(s, u) : 0));
    },
    0,
  );
  for (const p of [0, 1] as const)
    for (const [id, n] of Object.entries(c.assignments[p])) {
      const u = s.units.find((u) => u.id === id);
      if (u) {
        const damageBefore = u.damage;
        const might = getMight(s, u);
        effectActors.set(s, p);
        dealDamage(s, u, n, true);
        effectActors.delete(s);
        hits.push({
          unitId: u.id,
          cardId: u.cardId,
          owner: u.owner,
          assigned: n,
          damageBefore,
          damageAfter: u.damage,
          prevented: Math.max(0, n - (u.damage - damageBefore)),
          might,
        });
      }
    }
  log(
    s,
    "Both sides deal their assigned combat damage simultaneously.",
    "combat",
    undefined,
    { stage: "impact", preview, hits },
  );
  checkDeaths(s);
  if (s.deathBatches?.length) {
    s.pendingCombatDamage = { preview, hits };
    return;
  }
  finishCombatDamage(s, preview, hits);
}
function finishCombatDamage(
  s: GameState,
  preview: CombatPreview,
  hits: CombatHit[],
) {
  const c = s.combat!;
  const defeatedIds = preview.units
    .filter(({ unit }) => !s.units.some((u) => u.id === unit.id))
    .map(({ unit }) => unit.id);
  const recalledIds = preview.units
    .filter(({ unit }) =>
      s.units.some((u) => u.id === unit.id && u.location === base(u.owner)),
    )
    .map(({ unit }) => unit.id);
  for (const u of s.units) {
    u.damage = 0;
    u.damageByPlayer = [0, 0];
  }
  const defenders = s.units.some(
    (u) => u.owner === c.defender && u.location === c.fieldId,
  );
  const solariTie =
    defenders &&
    s.units.some((u) => u.owner === c.attacker && u.location === c.fieldId) &&
    s.gears.some(
      (g) =>
        g.owner === c.attacker && !g.attachedTo && isFace(g.cardId, "OGN", 227),
    );
  if (defenders) {
    for (const u of s.units.filter(
      (u) => (solariTie || u.owner === c.attacker) && u.location === c.fieldId,
    )) {
      u.location = base(u.owner);
      recalledIds.push(u.id);
    }
    log(
      s,
      "The defenders hold. Surviving attackers are recalled to base.",
      "combat",
      c.defender,
    );
  } else
    log(
      s,
      "Combat damage resolves simultaneously. Surviving units heal.",
      "combat",
    );
  if (s.stack.length || s.pendingChoice || s.pendingTriggers?.length) {
    s.pendingCombatFinish = true;
    s.phase = "showdown";
    s.priorityPlayer =
      s.pendingChoice?.player ?? s.stack.at(-1)?.player ?? s.currentPlayer;
    s.consecutivePasses = 0;
    recordStep(
      s,
      "Combat damage resolved. Resolve triggers before final control.",
      {
        stage: "result",
        preview,
        hits,
        defeatedIds,
        recalledIds,
      },
    );
  } else
    finishCombat(s, {
      stage: "result",
      preview,
      hits,
      defeatedIds,
      recalledIds,
    });
}
function finishCombat(s: GameState, result?: CombatStep) {
  delete s.pendingCombatFinish;
  const c = s.combat!;
  const preview = result?.preview ?? getCombatPreview(s)!;
  const field = s.fields.find((f) => f.id === c.fieldId)!;
  const sides = [0, 1].filter((p) =>
    s.units.some((u) => u.owner === p && u.location === c.fieldId),
  ) as PlayerId[];
  if (sides.length === 1) {
    const controller = sides[0];
    const changed = field.controller !== controller;
    field.controller = controller;
    if (changed) scoreField(s, controller, field.id, false);
  } else if (!sides.length) field.controller = null;
  event(s, "combatEnd", c.attacker, field.cardId, field.id, field.id);
  for (const u of s.units) u.combatShield = 0;
  s.combat = null;
  refreshControl(s);
  if (s.winner === null) {
    s.phase = "main";
    s.priorityPlayer = s.currentPlayer;
    s.focusPlayer = s.currentPlayer;
    s.consecutivePasses = 0;
    if (s.stack.length) s.priorityPlayer = s.stack[s.stack.length - 1].player;
  }
  recordStep(
    s,
    field.controller === null
      ? `${locationName(field.id)} is uncontrolled after the showdown.`
      : `${s.players[field.controller].name} controls ${locationName(field.id)}.`,
    { ...result, stage: "result", preview, controller: field.controller },
  );
}
function passPriority(s: GameState) {
  const p = s.priorityPlayer;
  s.consecutivePasses++;
  if (s.consecutivePasses < 2) {
    s.priorityPlayer = otherPlayer(p);
    log(
      s,
      `${s.players[p].name} passes ${s.stack.length ? "priority" : "focus"}.`,
      "info",
      p,
    );
    return;
  }
  s.consecutivePasses = 0;
  if (s.stack.length) {
    const item = s.stack.pop()!;
    if (item.kind === "spell") (s.resolving ??= []).push(item);
    if (item.kind === "ability") (s.resolvingAbilities ??= []).push(item);
    withStepEffect(
      s,
      {
        cardId: item.cardId,
        sourceId: item.sourceId,
        player: item.player,
        targetId: item.targetId,
        locationId: item.locationId,
        stage: "resolving",
      },
      () => {
        log(s, `${cardName(item.cardId)} resolves.`, "play", item.player);
        runEffects(
          s,
          item.player,
          item.effects,
          item.targetId,
          item.sourceId,
          item.locationId,
          item.sourceSnapshot,
        );
      },
    );
    if (!s.pendingChoice) finishResolvedCards(s);
    checkVictory(s);
    drainTriggers(s);
    if (s.winner !== null) return;
    let nextPriority: PlayerId;
    if (s.stack.length) nextPriority = s.stack[s.stack.length - 1].player;
    else {
      if (
        s.phase === "showdown" ||
        s.pendingChoice?.returnPhase === "showdown"
      ) {
        if (s.chainStarter !== null)
          s.focusPlayer = otherPlayer(s.chainStarter);
        nextPriority = s.focusPlayer;
      } else nextPriority = s.currentPlayer;
      s.chainStarter = null;
    }
    if (s.pendingChoice) s.pendingChoice.returnPriority = nextPriority;
    else s.priorityPlayer = nextPriority;
    if (
      !s.stack.length &&
      !s.pendingChoice &&
      s.pendingTurnStart !== undefined
    ) {
      const pending = s.pendingTurnStart;
      delete s.pendingTurnStart;
      finishTurnStart(s, pending);
    }
    if (!s.stack.length && !s.pendingChoice && s.pendingCombatFinish)
      finishCombat(s);
    if (!s.stack.length && !s.pendingChoice && s.pendingEndTurn !== undefined) {
      const ending = s.pendingEndTurn;
      delete s.pendingEndTurn;
      finishEndTurn(s, ending);
    }
    continuePending(s);
    return;
  }
  concludeShowdown(s);
}
function finishEndTurn(s: GameState, p: PlayerId) {
  s.damageTriggers = [];
  for (const u of s.units) {
    u.damage = 0;
    u.damageByPlayer = [0, 0];
    u.temporaryMight = 0;
    u.temporaryAssault = 0;
    u.stunned = false;
    u.preventDamage = 0;
    u.untargetableByEnemy = false;
    delete u.baseMightOverride;
    u.temporaryKeywords = [];
    u.usedAbilities = [];
  }
  for (const player of s.players) {
    player.energy = 0;
    player.spellEnergy = 0;
    player.spellPower = 0;
    player.gearPower = 0;
    player.gearPlayPermissions = [];
    delete player.enemyChoices;
    player.nextSpellBonus = 0;
    player.nextCardEnergyDiscount = 0;
    player.nextCardPowerDiscount = 0;
    player.unitEnergy = 0;
    player.showdownEnergy = 0;
    player.typedPower = {};
    player.power = 0;
    player.buffBonus = 0;
  }
  log(
    s,
    `${s.players[p].name} ends the turn. Damage, stuns and temporary bonuses expire.`,
    "turn",
    p,
  );
  beginTurn(s, s.extraTurns?.pop() ?? otherPlayer(p));
}
function applyActionInternal(
  state: GameState,
  action: string | GameAction,
  declaredAction?: GameAction,
): GameState {
  const id = typeof action === "string" ? action : action.id;
  let legal: GameAction | undefined = declaredAction;
  if (!legal && id.startsWith("move-group:")) {
    const [, kind, number, members] = id.split(":");
    legal =
      getGroupMoveAction(
        state,
        state.priorityPlayer,
        (members ?? "").split(","),
        `${kind}:${number}` as LocationId,
      ) ?? undefined;
    if (legal?.id !== id) legal = undefined;
  }
  if (!legal)
    for (const candidate of iterateLegalActions(state, state.priorityPlayer)) {
      if (candidate.id === id) {
        legal = candidate;
        break;
      }
    }
  if (!legal) throw new Error(`Illegal action: ${id}`);
  const s: GameState = structuredClone(state);
  syncHybridObjects(s);
  const p = legal.player,
    x = s.players[p];
  if (typeof action !== "string" && action.paymentRuneOrder) {
    const ids = action.paymentRuneOrder;
    if (
      ids.length !== x.runes.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => x.runes.some((r) => r.id === id))
    )
      throw new Error("Invalid payment preference");
    x.runes.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }
  if (id === "cancel-effect-play") {
    const choice = s.pendingChoice!;
    const pending = s.pendingPlays!.find(
      (item) => item.id === choice.sourceId,
    )!;
    s.pendingPlays = s.pendingPlays!.filter((item) => item.id !== pending.id);
    if (pending.returnZone === "trash")
      addToTrash(s, pending.spec.zoneOwner ?? pending.player, pending.cardId);
    else
      s.players[pending.spec.zoneOwner ?? pending.player][
        pending.returnZone
      ].splice(pending.returnIndex, 0, pending.cardId);
    s.pendingChoice = null;
    s.phase = choice.returnPhase;
    s.priorityPlayer = choice.returnPriority;
    drainTriggers(s);
    continuePending(s);
    return s;
  }
  if (s.pendingChoice?.kind === "effectPlay" && legal.category === "play") {
    s.phase = s.pendingChoice.returnPhase;
    s.pendingChoice = null;
  }
  if (id.startsWith("move-group:")) {
    s.pendingMove = {
      player: p,
      from: s.units.find((u) => u.id === legal!.unitIds![0])!.location,
      to: legal.locationId!,
      unitIds: legal.unitIds!,
    };
    s.phase = "move";
    return applyActionInternal(s, "move-confirm");
  }
  if (id.startsWith("draft:")) {
    const choice = s.pendingChoice!,
      d = choice.effectDraft!;
    if (id === "draft:done" || id === "draft:cancel") {
      s.pendingChoice = null;
      s.phase = choice.returnPhase;
      s.priorityPlayer = choice.returnPriority;
      if (id === "draft:cancel") {
        if (d.retargetId) {
          s.pendingChoice = choice;
          resumeChoice(s);
        } else {
          drainTriggers(s);
          continuePending(s);
        }
        return s;
      }
      const declared = draftAction(d);
      if (d.retargetId) {
        const item = s.stack.find((i) => i.id === d.retargetId);
        if (item) {
          item.effects = declared.effects!;
          item.targetId = declared.targetId;
        }
        s.pendingChoice = choice;
        resumeChoice(s);
        return s;
      }
      if (d.trigger) {
        finalizeTrigger(s, d.trigger, declared);
        drainTriggers(s);
        return s;
      }
      return applyActionInternal(s, declared, declared);
    }
    draftChoose(s, legal);
    return s;
  }
  if (legal.category === "play" && !legal.draftFinalized) {
    const draft = makeDraft(s, legal);
    if (draft) {
      openChoice(s, p, {
        kind: "effectDraft",
        cardId: legal.cardId,
        sourceId: legal.sourceId,
        locationId: legal.locationId,
        effectDraft: draft,
      });
      return s;
    }
  }
  if (id.startsWith("choose-cost:")) {
    const choice = s.pendingChoice!,
      draft = choice.boardSelection!;
    if (id.startsWith("choose-cost:add:")) {
      draft.selected.push(legal.targetId!);
      return s;
    }
    if (id.startsWith("choose-cost:remove:")) {
      draft.selected.splice(draft.selected.indexOf(legal.targetId!), 1);
      return s;
    }
    s.pendingChoice = null;
    s.phase = choice.returnPhase;
    s.priorityPlayer = choice.returnPriority;
    const declared = {
      ...draft.action!,
      costSourceId: draft.selected.join("~"),
      costsFinalized: true,
    };
    return applyActionInternal(s, declared, declared);
  }
  if (
    legal.category === "play" &&
    legal.additionalCostPaid &&
    !legal.costsFinalized &&
    getScript(legal.cardId!)?.additionalCost?.board?.multiple
  ) {
    openChoice(s, p, {
      kind: "costTargets",
      cardId: legal.cardId,
      sourceId: legal.sourceId,
      boardSelection: { selected: [], action: legal },
    });
    return s;
  }
  if (id.startsWith("choose-board:")) {
    const choice = s.pendingChoice!,
      draft = choice.boardSelection!;
    if (id.startsWith("choose-board:destination:")) {
      draft.destination = legal.locationId;
      return s;
    }
    if (id !== "choose-board:done") {
      const target = legal.targetId!;
      draft.selected = draft.selected.includes(target)
        ? draft.selected.filter((id) => id !== target)
        : [...draft.selected, target];
      return s;
    }
    if (!draft.action) {
      choice.targetId = draft.selected.join("~") || undefined;
      choice.effect = { type: "special", effects: [choice.effect!] };
      resumeChoice(s);
      return s;
    }
    s.pendingChoice = null;
    s.phase = choice.returnPhase;
    s.priorityPlayer = choice.returnPriority;
    const declared = {
      ...draft.action,
      targetId: draft.selected.join("~") || undefined,
      locationId: draft.destination ?? draft.action.locationId,
      effects: (
        draft.action.effects ??
        draft.trigger?.effects ??
        getScript(draft.action.cardId!)?.spell
      )?.map((e) =>
        e.group?.distinctLocations
          ? {
              ...e,
              chosenLocations: Object.fromEntries(
                draft.selected.flatMap((id) => {
                  const u = s.units.find((u) => u.id === id);
                  return u ? [[id, u.location]] : [];
                }),
              ),
            }
          : e,
      ),
      targetsFinalized: true,
    };
    if (draft.trigger) {
      finalizeTrigger(s, draft.trigger, declared);
      drainTriggers(s);
      return s;
    }
    return applyActionInternal(s, declared, declared);
  }
  if (id.startsWith("choose-trash:")) {
    const choice = s.pendingChoice!;
    const draft = choice.trashSelection!;
    if (id !== "choose-trash:done") {
      const target = legal.targetId!;
      draft.selected = draft.selected.includes(target)
        ? draft.selected.filter((id) => id !== target)
        : [...draft.selected, target];
      return s;
    }
    s.pendingChoice = null;
    s.phase = choice.returnPhase;
    s.priorityPlayer = choice.returnPriority;
    const declared = {
      ...draft.action,
      targetId: draft.selected.join("~") || undefined,
      targetsFinalized: true,
    };
    if (draft.trigger) {
      finalizeTrigger(s, draft.trigger, declared);
      drainTriggers(s);
      return s;
    }
    return applyActionInternal(s, declared, declared);
  }
  if (
    !legal.targetsFinalized &&
    (legal.category === "play" || id.startsWith("ability|"))
  ) {
    const effects =
      legal.effects ??
      (legal.category === "play"
        ? getScript(legal.cardId!)?.spell
        : getAbilities(s, p, legal.cardId!, legal.sourceId)[
            Number(id.split("|")[2])
          ]?.effects);
    const hiddenSource = s.hidden?.find(
      (h) => `hidden:${h.id}` === legal.sourceId,
    );
    const selection = annotateEffects(
      effects ?? [],
      Boolean(hiddenSource),
      Boolean(legal.additionalCostPaid),
      hiddenSource?.location,
    ).find(stagedTarget);
    if (selection) {
      openChoice(s, p, {
        kind:
          selection.target === "boardCards" ? "boardTargets" : "trashTargets",
        effect: structuredClone(selection),
        cardId: legal.cardId,
        sourceId: legal.sourceId,
        locationId: legal.locationId,
        [selection.target === "boardCards"
          ? "boardSelection"
          : "trashSelection"]: { selected: [], action: legal },
      });
      return s;
    }
  }
  const activatedGear = s.gears.find((g) => g.id === legal.sourceId);
  const activatedUnit = s.units.find((u) => u.id === legal.sourceId);
  const extensionActivation =
    ["ability", "resource"].includes(legal.category) &&
    !id.startsWith("choose");
  let extensionEnergyCost = 0;
  const extensionContext = context();
  if (extensionActivation) {
    extensionContext.pay = (
      state,
      player,
      energy,
      power,
      domains,
      anyPower,
    ) => {
      extensionEnergyCost += payAbility(
        state,
        player,
        legal.sourceId,
        energy,
        power,
        domains,
        anyPower,
      );
    };
    extensionContext.canPay = (
      state,
      player,
      energy,
      power,
      domains,
      anyPower,
    ) => {
      const cost = abilityCost(
        state,
        player,
        legal.sourceId,
        energy,
        power,
        domains,
        anyPower,
      );
      return canPay(
        state,
        player,
        cost.energy,
        cost.power,
        cost.domains,
        cost.anyPower,
      );
    };
  }
  const previousStackIds = new Set(s.stack.map((item) => item.id));
  if (applyLaterAction(s, legal, extensionContext)) {
    if (activatedGear && extensionActivation) x.firstGearAbilityTurn = s.turn;
    if (extensionActivation)
      for (const item of s.stack.filter(
        (item) => item.kind === "ability" && !previousStackIds.has(item.id),
      ))
        item.abilityEnergyCost ??= extensionEnergyCost;
    if (
      (activatedGear || activatedUnit) &&
      extensionActivation &&
      !s.pendingChoice &&
      !s.stack.some(
        (item) => !previousStackIds.has(item.id) && item.kind === "ability",
      )
    )
      event(
        s,
        "abilityActivated",
        p,
        (activatedGear ?? activatedUnit)!.cardId,
        (activatedGear ?? activatedUnit)!.id,
        activatedUnit?.location,
        { abilityEnergyCost: extensionEnergyCost },
      );
    event(
      s,
      "stateChanged",
      p,
      legal.cardId ?? x.legendId,
      legal.sourceId,
      legal.locationId,
    );
    checkDeaths(s);
    refreshControl(s);
    log(s, legal.label, "play", p);
    return s;
  }
  if (legal.category === "mulligan") {
    const selected = new Set(legal.cardIndices ?? []);
    const recycle = x.hand.filter((_, i) => selected.has(i));
    x.hand = x.hand.filter((_, i) => !selected.has(i));
    draw(s, p, recycle.length);
    x.deck = [...x.deck, ...shuffle(s, recycle)];
    x.mulliganDone = true;
    log(s, `${x.name} replaced ${recycle.length} card(s).`, "info", p);
    if (s.players.every((x) => x.mulliganDone)) beginTurn(s, s.currentPlayer);
    else s.priorityPlayer = otherPlayer(p);
    return s;
  }
  if (s.pendingChoice?.kind === "custom") {
    const choice = s.pendingChoice!;
    const effects = legal.effects ?? [];
    const newTargets = (legal.targetId ?? "")
      .split("~")
      .filter((id) => !(choice.targetId ?? "").split("~").includes(id));
    pay(s, p, 0, 0, [], targetTax(s, p, newTargets.join("~")));
    for (const id of newTargets) {
      const target = s.units.find((u) => u.id === id);
      if (target)
        event(s, "target", p, target.cardId, target.id, target.location);
    }
    choice.targetId = legal.targetId ?? choice.targetId;
    choice.locationId = legal.locationId ?? choice.locationId;
    choice.sourceId = legal.sourceId ?? choice.sourceId;
    choice.afterEffects = [...effects, ...(choice.afterEffects ?? [])];
    resumeChoice(s);
    return s;
  }
  if (id.startsWith("choose-rune:")) {
    const choice = s.pendingChoice!;
    if (choice.finalizingTrigger) {
      const rune = x.runes.find((r) => r.id === legal.sourceId);
      if (rune) {
        (choice.chosenRuneIds ??= []).push(rune.id);
        choice.remaining--;
      }
      if (
        !rune ||
        !choice.remaining ||
        !x.runes.some((r) => !choice.chosenRuneIds?.includes(r.id))
      ) {
        s.pendingChoice = null;
        s.phase = choice.returnPhase;
        s.priorityPlayer = choice.returnPriority;
        const effects = (choice.effects ?? []).map((effect) =>
          effect.chooseRunes
            ? {
                ...effect,
                chooseRunes: false,
                runeIds: choice.chosenRuneIds ?? [],
              }
            : effect,
        );
        finalizeTrigger(
          s,
          {
            player: p,
            cardId: choice.cardId!,
            sourceId: choice.sourceId,
            locationId: choice.locationId,
            effects,
            sourceSnapshot: choice.sourceSnapshot,
          },
          {
            ...legal,
            effects,
            targetId: choice.targetId,
            cardIndices: choice.cardIndices,
          },
        );
        drainTriggers(s);
      }
      return s;
    }
    const rune = x.runes.find((r) => r.id === legal.sourceId && !r.ready);
    if (rune) {
      rune.ready = true;
      choice.remaining--;
      log(s, `${x.name} readies a ${rune.domain} rune.`, "play", p);
    }
    if (!rune || !choice.remaining || !x.runes.some((r) => !r.ready))
      resumeChoice(s);
    return s;
  }
  if (id.startsWith("choose-card:")) {
    const choice = s.pendingChoice!;
    if (legal.amount !== undefined) {
      const zone = choice.kind === "discard" ? x.hand : x.discard;
      const cardId =
        choice.kind === "discard"
          ? zone.splice(legal.amount, 1)[0]
          : takeTrashAt(s, p, legal.amount)!;
      if (choice.kind === "discard") {
        discardCards(s, p, [cardId], false);
        choice.discardBatchCount = (choice.discardBatchCount ?? 0) + 1;
        choice.discardBatchCardId ??= cardId;
        choice.lastDiscardEnergy = getCard(cardId).energy ?? 0;
        choice.lastDiscardType = getCardTypes(getCard(cardId)).join("|");
      } else if (choice.kind === "retrieve") x.hand.push(cardId);
      else recycleCards(s, p, [cardId]);
      choice.remaining--;
    } else choice.remaining = 0;
    const zone = choice.kind === "discard" ? x.hand : x.discard;
    if (!choice.remaining || !zone.length) {
      if (choice.discardBatchCardId)
        event(
          s,
          "discardBatch",
          p,
          choice.discardBatchCardId,
          undefined,
          undefined,
          { amount: choice.discardBatchCount },
        );
      choice.afterEffects = (choice.afterEffects ?? []).map((e) =>
        e.condition === "discardType"
          ? { ...e, cardName: choice.lastDiscardType }
          : e.condition === "discardEnergy"
            ? { ...e, amount: choice.lastDiscardEnergy ?? 0 }
            : e,
      );
      resumeChoice(s);
    }
    return s;
  }
  if (id.startsWith("choose-predict:")) {
    const owner =
        s.pendingChoice?.effect?.who === "opponent" ? otherPlayer(p) : p,
      deck = s.players[owner].deck;
    if (id.endsWith("recycle") && deck.length) {
      shiftInspectedPositions(s, owner, 0, true);
      recycleCards(s, owner, [deck.shift()!], p);
    }
    resumeChoice(s);
    return s;
  }
  if (id.startsWith("choose-unit:")) {
    const choice = s.pendingChoice!;
    const u = s.units.find((u) => u.id === legal.targetId);
    if (u) {
      if (choice.kind === "sacrifice") killUnits(s, [u.id]);
      else {
        u.buff--;
        event(s, "spendBuff", p, u.cardId, u.id, u.location);
      }
    }
    resumeChoice(s, !!u);
    return s;
  }
  if (id.startsWith("choose-optional:")) {
    resumeChoice(s, id.endsWith(":yes"));
    return s;
  }
  if (id.startsWith("choose-destination:")) {
    const choice = s.pendingChoice!;
    const u = s.units.find((u) => u.id === choice.targetId);
    if (u) moveUnit(s, u, legal.locationId!, p);
    resumeChoice(s);
    if (
      u?.location.startsWith("field:") &&
      !s.combat &&
      s.fields.find((f) => f.id === u.location)?.controller !== u.owner
    )
      openShowdown(s, u.owner, u.location);
    return s;
  }
  if (id.startsWith("hide:")) {
    const cost = id.endsWith(":energy")
      ? { energy: 1, power: 0 }
      : hideCost(s, p);
    pay(s, p, cost.energy, 0, [], cost.power);
    const cardId =
      legal.sourceId === "champion"
        ? x.championId
        : x.hand.splice(Number(legal.sourceId!.split(":")[1]), 1)[0];
    if (legal.sourceId === "champion") x.championAvailable = false;
    (s.hidden ??= []).push({
      id: uid(s, "hidden"),
      cardId,
      owner: p,
      location: legal.locationId!,
      hiddenTurn: s.turn,
    });
    event(s, "hide", p, cardId, s.hidden!.at(-1)!.id, legal.locationId);
    log(
      s,
      `${x.name} hides a card at ${locationName(legal.locationId!)}.`,
      "play",
      p,
    );
    return s;
  }
  if (id.startsWith("equip:")) {
    const sc = getScript(legal.cardId!)!;
    x.xp = (x.xp ?? 0) - (sc.equipXP ?? 0);
    const energyCost = payAbility(
      s,
      p,
      legal.sourceId,
      equipEnergy(s, legal.cardId!, legal.targetId!),
      sc.equipCost ?? 0,
      equipDomains(legal.cardId!),
    );
    x.firstGearAbilityTurn = s.turn;
    if (sc.equipRecycle) {
      const recycled = (legal.cardIndices ?? []).map((i) => x.discard[i]);
      for (const i of [...(legal.cardIndices ?? [])].sort((a, b) => b - a))
        takeTrashAt(s, p, i);
      recycleCards(s, p, shuffle(s, recycled));
    }
    if (sc.equipKillUnit && legal.costSourceId)
      killUnits(s, [legal.costSourceId]);
    pushStack(s, {
      player: p,
      cardId: legal.cardId!,
      sourceId: legal.sourceId,
      targetId: legal.targetId,
      effects: [{ type: "equip", target: "friendlyUnit" }],
      kind: "ability",
      abilityEnergyCost: energyCost,
    });
    return s;
  }
  if (id === "choose-token:skip") {
    resumeChoice(s);
    return s;
  }
  if (id.startsWith("choose-token:")) {
    const choice = s.pendingChoice!;
    const token = spawnToken(
      s,
      p,
      choice.effect?.cardName ?? "Recruit",
      legal.locationId!,
    );
    if (choice.effect?.ready && token) token.ready = true;
    if (token && choice.effect?.condition === "realCard") {
      x.cardsPlayedThisTurn++;
      token.token = false;
      const at = x.discard.indexOf(token.cardId);
      if (at >= 0) takeTrashAt(s, p, at);
      cardPlayed(s, p, token.cardId, undefined, token.location, {
        playSource: "trash",
      });
      event(s, "cardFinalized", p, token.cardId, token.id, token.location, {
        playSource: "trash",
      });
    }
    choice.remaining--;
    if (!choice.remaining) {
      resumeChoice(s);
    }
    return s;
  }
  if (id.startsWith("choose-trigger:")) {
    const choice = s.pendingChoice!;
    s.pendingChoice = null;
    s.phase = choice.returnPhase;
    s.priorityPlayer = choice.returnPriority;
    if (id !== "choose-trigger:skip")
      finalizeTrigger(
        s,
        {
          player: p,
          cardId: choice.cardId!,
          sourceId: choice.sourceId,
          effects: choice.effects ?? [],
          locationId:
            choice.locationId ??
            s.units.find((u) => u.id === choice.sourceId)?.location ??
            s.combat?.fieldId,
          sourceSnapshot: choice.sourceSnapshot,
        },
        legal,
      );
    drainTriggers(s);
    continuePending(s);
    return s;
  }
  if (id.startsWith("move-start:")) {
    const u = s.units.find((u) => u.id === legal.sourceId)!;
    s.pendingMove = {
      player: p,
      from: u.location,
      to: legal.locationId!,
      unitIds: [u.id],
    };
    s.phase = "move";
    return s;
  }
  if (id.startsWith("move-toggle:")) {
    const move = s.pendingMove!;
    if (move.unitIds.includes(legal.sourceId!))
      move.unitIds = move.unitIds.filter((x) => x !== legal.sourceId);
    else move.unitIds.push(legal.sourceId!);
    return s;
  }
  if (id === "move-cancel") {
    s.pendingMove = null;
    s.phase = "main";
    return s;
  }
  if (id === "move-confirm") {
    const move = s.pendingMove!;
    pay(s, p, 0, 0, [], groupMoveTax(s, p, move.to, move.unitIds.length));
    for (const u of s.units.filter((u) => move.unitIds.includes(u.id))) {
      u.ready = false;
      moveUnit(s, u, move.to);
    }
    s.pendingMove = null;
    refreshControl(s);
    log(
      s,
      `${x.name} moves ${move.unitIds.length} unit(s) to ${locationName(move.to)}.`,
      "combat",
      p,
    );
    if (
      move.to.startsWith("field:") &&
      s.fields.find((f) => f.id === move.to)?.controller !== p
    )
      openShowdown(s, p, move.to);
    else s.phase = "main";
    return s;
  }
  if (id.startsWith("damage:")) {
    const c = s.combat!;
    c.assignments[p][legal.targetId!] =
      (c.assignments[p][legal.targetId!] ?? 0) + legal.amount!;
    c.remaining[p] -= legal.amount!;
    log(
      s,
      `${x.name} assigns ${legal.amount} combat damage${targetLabel(s, legal.targetId)}.`,
      "combat",
      p,
      { stage: "assign", preview: getCombatPreview(s)! },
    );
    advanceAssignment(s);
    return s;
  }
  if (id === "damage-done") {
    s.combat!.remaining[p] = 0;
    advanceAssignment(s);
    return s;
  }
  if (id.startsWith("gold:")) {
    x.firstGearAbilityTurn = s.turn;
    const gear = s.gears.find((g) => g.id === legal.sourceId)!;
    s.gears = s.gears.filter((g) => g.id !== gear.id);
    x.power = (x.power ?? 0) + 1;
    event(s, "abilityActivated", p, gear.cardId, gear.id);
    log(s, `${x.name} spends Gold and adds one universal power.`, "play", p);
    return s;
  }
  if (id === "pass") {
    passPriority(s);
    return s;
  }
  if (id === "end-turn") {
    event(s, "end", p, x.legendId, "legend");
    for (const source of [
      { id: "legend", cardId: x.legendId, location: base(p) },
      ...textUnits(s).filter((u) => u.owner === p),
      ...s.gears
        .filter((g) => g.owner === p)
        .map((g) => ({ ...g, location: base(p) })),
    ]) {
      const effects = getScript(source.cardId)?.onEnd;
      if (effects)
        trigger(
          s,
          p,
          source.cardId,
          source.id,
          textEffects(source, effects),
          source.location,
        );
    }
    if (x.legendId === "ogs-017-024" || x.endReadyRunes) {
      s.pendingEndTurn = p;
      pushStack(s, {
        player: p,
        cardId: x.legendId,
        effects: [
          {
            type: "readyRunes",
            amount:
              (x.legendId === "ogs-017-024" ? 2 : 0) + (x.endReadyRunes ?? 0),
          },
        ],
        kind: "trigger",
      });
      x.endReadyRunes = 0;
    } else if (s.stack.length || s.pendingChoice || s.pendingTriggers?.length) {
      s.pendingEndTurn = p;
      drainTriggers(s);
    } else finishEndTurn(s, p);
    return s;
  }
  if (legal.category === "play") {
    const instructed = s.pendingPlays?.find(
      (item) => item.id === legal.sourceId,
    );
    const c = getCard(legal.cardId!),
      script = getScript(c.id)!;
    const accelerated = id.includes("|accelerate");
    const cost = playCost(s, p, c, legal.targetId, legal.sourceId, {
      ...legal,
      accelerated,
    });
    const hidden = (s.hidden ?? []).find(
      (h) => legal.sourceId === `hidden:${h.id}`,
    );
    const fromTrash = legal.sourceId?.startsWith("trash:");
    const flowed = fromTrash && !legal.sourceId?.endsWith(":riches");
    if (legal.cardIndices?.length && c.id === "ogn-002-298")
      cost.energy = Math.max(0, cost.energy - 2);
    if (legal.sourceId?.includes(":jayce:"))
      x.gearPlayPermissions = x.gearPlayPermissions?.filter(
        (g) => g.id !== legal.sourceId!.split(":jayce:")[1],
      );
    if (legal.additionalCostPaid && script.additionalCost?.exhaustLegend)
      x.legendUsedTurn = s.turn;
    if (legal.additionalCostPaid)
      x.xp = (x.xp ?? 0) - (script.additionalCost?.xp ?? 0);
    const costTriggers: Array<() => void> = [];
    finalizingBoardCostPlay.set(s, costTriggers);
    pay(
      s,
      p,
      cost.energy,
      cost.power,
      playPowerDomains(s, p, c, legal.sourceId),
      cost.extraPower,
      cost.additionalPower,
    );
    x.spellEnergy = Math.max(0, (x.spellEnergy ?? 0) - cost.spellEnergy);
    x.unitEnergy = Math.max(0, (x.unitEnergy ?? 0) - cost.unitEnergy);
    x.spellPower = Math.max(0, (x.spellPower ?? 0) - cost.spellPower);
    x.gearPower = Math.max(0, (x.gearPower ?? 0) - cost.gearPower);
    x.powerSpentThisTurn =
      (x.powerSpentThisTurn ?? 0) + cost.spellPower + cost.gearPower;
    if (legal.additionalCostPaid && script.additionalCost?.xp)
      event(s, "stateChanged", p, c.id);
    if (c.id === "ogn-208-298" && legal.targetId)
      killUnits(s, [legal.targetId]);
    if (c.id === "ogn-048-298" && id.includes("|exhaust:")) {
      const unit = s.units.find((u) => u.id === legal.targetId);
      if (unit) unit.ready = false;
    }
    const discarded = legal.cardIndices?.map((i) => x.hand[i]) ?? [];
    if (legal.sourceId === "champion") x.championAvailable = false;
    else if (hidden) s.hidden = s.hidden?.filter((h) => h.id !== hidden.id);
    else if (fromTrash)
      takeTrashAt(s, p, Number(legal.sourceId!.split(":")[1]));
    else if (instructed) {
      /* Already moved to the pending chain during the parent effect. */
    } else {
      const playedIndex = Number(legal.sourceId!.split(":")[1]);
      x.hand = x.hand.filter(
        (_, i) => i !== playedIndex && !legal.cardIndices?.includes(i),
      );
    }
    if (legal.cardIndices?.length && !legal.sourceId?.startsWith("hand:"))
      x.hand = x.hand.filter((_, i) => !legal.cardIndices?.includes(i));
    if (discarded.length) discardCards(s, p, discarded);
    if (legal.additionalCostPaid && script.additionalCost?.board) {
      payBoardCost(s, p, script, legal.costSourceId!);
    }
    x.cardsPlayedThisTurn++;
    const playOrdinal = x.cardsPlayedThisTurn;
    if (isCardType(c, "Spell"))
      x.spellsPlayedThisTurn = (x.spellsPlayedThisTurn ?? 0) + 1;
    log(
      s,
      `${x.name} plays ${cardName(c.id)}${targetLabel(s, legal.targetId)}.`,
      "play",
      p,
    );
    s.consecutivePasses = 0;
    if (isCardType(c, "Unit")) {
      if (
        isFace(c.id, "UNL", 147) &&
        !s.fields.some((f) => f.cardId === "token-baron-pit")
      ) {
        s.fields.push({
          id: "field:2",
          cardId: "token-baron-pit",
          controller: null,
        });
        legal.locationId = "field:2";
      }
      const u: Unit = {
        id: uid(s, "u"),
        cardId: c.id,
        originalOwner: instructed?.spec.zoneOwner,
        addedTag: legal.namedTag,
        owner: p,
        location: legal.locationId!,
        ready:
          accelerated ||
          (isFace(c.id, "VEN", 91) && getVictoryScore(s) - x.points > 3) ||
          Boolean(
            legal.additionalCostPaid && script.additionalCost?.enterReady,
          ) ||
          !!script.keywords?.includes("Enters ready") ||
          s.players[p].unitsEnterReadyTurn === s.turn ||
          textUnits(s).some((u) => u.owner === p && u.cardId === "ogn-011-298"),
        damage: 0,
        buff: 0,
        temporaryMight: 0,
        temporaryAssault: 0,
        stunned: false,
        gear: [],
        temporary: script.keywords?.includes("Temporary") || undefined,
        summonedTurn: s.turn,
        additionalCostPaid: legal.additionalCostPaid,
        playedFromHidden: Boolean(hidden),
      };
      s.units.push(u);
      log(
        s,
        `${cardName(c.id)} enters ${u.ready ? "ready" : "exhausted"} at ${locationName(u.location)}.`,
        "play",
        p,
      );
      unitPlayed(s, p, u);
      checkDeaths(s);
      if (
        u.location.startsWith("field:") &&
        s.fields.find((f) => f.id === u.location)?.controller !== p
      )
        openShowdown(s, p, u.location);
      if (script.onPlay)
        trigger(
          s,
          p,
          c.id,
          u.id,
          textEffects(
            u,
            annotateEffects(
              script.onPlay,
              Boolean(hidden),
              Boolean(legal.additionalCostPaid),
              hidden?.location,
            ),
          ),
          u.location,
        );
    } else if (isCardType(c, "Gear")) {
      const gear = {
        id: uid(s, "g"),
        cardId: c.id,
        originalOwner: instructed?.spec.zoneOwner,
        namedTag: legal.namedTag,
        owner: p,
        ready: true,
        temporary: script.keywords?.includes("Temporary") || undefined,
      };
      s.gears.push(gear);
      if (script.onPlay)
        trigger(
          s,
          p,
          c.id,
          gear.id,
          textEffects(
            gear,
            annotateEffects(
              script.onPlay,
              Boolean(hidden),
              Boolean(legal.additionalCostPaid),
              hidden?.location,
            ),
          ),
          hidden?.location ?? base(p),
        );
      if (
        hasQuickDraw(s, p, c, legal.sourceId) &&
        !/\[Quick-Draw\]/.test(c.text)
      )
        trigger(
          s,
          p,
          c.id,
          gear.id,
          textEffects(gear, [{ type: "equip", target: "friendlyUnit" }]),
          base(p),
        );
    } else if (isCardType(c, "Spell")) {
      const spellBonusDamage =
        (x.nextSpellBonus ?? 0) + (instructed?.spec.grenadeHits ?? 0);
      x.nextSpellBonus = 0;
      pushStack(
        s,
        {
          player: p,
          cardId: c.id,
          originalOwner: instructed?.spec.zoneOwner,
          declaration: {
            repeated: legal.repeated,
            repeatMask: legal.repeatMask,
          },
          targetId: legal.targetId,
          effects: annotateEffects(
            c.id === "ogn-048-298" && id.includes("|exhaust:")
              ? [{ type: "draw", amount: 2 }]
              : legal.repeated && !legal.draftFinalized
                ? [
                    ...(legal.effects ?? script.spell ?? []).map((e) => ({
                      ...e,
                      chosenTargetId: legal.targetId ?? null,
                    })),
                    ...(
                      legal.repeatedEffects ??
                      legal.effects ??
                      script.spell ??
                      []
                    ).map((e) => ({
                      ...e,
                      chosenTargetId: legal.repeatedTargetId ?? null,
                    })),
                  ]
                : (legal.effects ?? script.spell ?? []),
            Boolean(hidden),
            Boolean(legal.additionalCostPaid),
            isFace(c.id, "VEN", 34) ? undefined : hidden?.location,
          ),
          locationId: legal.locationId ?? hidden?.location,
          kind: "spell",
          grenadeHits: instructed?.spec.grenadeHits,
          ...(spellBonusDamage ? { spellBonusDamage } : {}),
          ...(flowed ? { flowed: true } : {}),
          ...(legal.sourceId?.endsWith(":granted")
            ? { grantedFlow: true }
            : {}),
          fromHidden: Boolean(hidden),
          recycleOnLeave: instructed?.spec.recycleOnLeave,
          additionalCostPaid: legal.additionalCostPaid,
          playOrdinal,
          energySpent: cost.energy + cost.spellEnergy + (accelerated ? 1 : 0),
          playSource: hidden
            ? "hidden"
            : flowed
              ? "trash"
              : instructed
                ? instructed.returnZone === "hand"
                  ? "hand"
                  : "effect"
                : "hand",
        },
        legal.draftFinalized
          ? (legal.targetId ?? "").split("~").filter(Boolean)
          : legal.repeated
            ? [legal.targetId, legal.repeatedTargetId].flatMap((target) =>
                target ? [target] : [],
              )
            : undefined,
      );
    }
    const entered = isCardType(c, "Unit")
      ? s.units.filter((u) => u.owner === p && u.cardId === c.id).at(-1)
      : isCardType(c, "Gear")
        ? s.gears.filter((g) => g.owner === p && g.cardId === c.id).at(-1)
        : undefined;
    event(
      s,
      "cardFinalized",
      p,
      c.id,
      entered?.id,
      isCardType(c, "Unit") ? legal.locationId : base(p),
      {
        playOrdinal,
        fromHidden: Boolean(hidden),
        paidAdditionalCost: Boolean(legal.additionalCostPaid),
        energySpent: cost.energy + cost.spellEnergy + (accelerated ? 1 : 0),
        playSource: instructed
          ? instructed.returnZone === "hand"
            ? "hand"
            : "effect"
          : hidden
            ? "hidden"
            : flowed
              ? "trash"
              : legal.sourceId === "champion"
                ? "champion"
                : "hand",
      },
    );
    if (!isCardType(c, "Spell"))
      cardPlayed(
        s,
        p,
        c.id,
        entered?.id,
        isCardType(c, "Unit") ? legal.locationId : base(p),
        {
          playOrdinal,
          fromHidden: Boolean(hidden),
          paidAdditionalCost: Boolean(legal.additionalCostPaid),
          energySpent: cost.energy + cost.spellEnergy + (accelerated ? 1 : 0),
          playSource: instructed
            ? instructed.returnZone === "hand"
              ? "hand"
              : "effect"
            : hidden
              ? "hidden"
              : flowed
                ? "trash"
                : legal.sourceId === "champion"
                  ? "champion"
                  : "hand",
        },
      );
    if (costTriggers) {
      checkDeaths(s);
      finalizingBoardCostPlay.delete(s);
      for (const finalize of costTriggers) finalize();
    }
    if (instructed) {
      if (entered && instructed.spec.stunAfterPlay)
        trigger(
          s,
          p,
          c.id,
          entered.id,
          textEffects(entered, [{ type: "stun", chosenTargetId: entered.id }]),
          legal.locationId,
        );
      if (entered && instructed.spec.empowerAfterPlay)
        trigger(
          s,
          p,
          c.id,
          entered.id,
          textEffects(entered, [
            {
              type: "special",
              custom: "wave14:empower-played",
              cardName: entered.id,
              optional: true,
            },
          ]),
          isCardType(c, "Unit") ? legal.locationId : base(p),
        );
      s.pendingPlays = s.pendingPlays!.filter(
        (item) => item.id !== instructed.id,
      );
      if (isCardType(c, "Gear") && entered && instructed.spec.attachToSource) {
        const unit = s.units.find(
          (u) => u.id === instructed.spec.sourceId && u.owner === p,
        );
        if (unit) runEffects(s, p, [{ type: "equip" }], unit.id, entered.id);
      }
      drainTriggers(s);
      continuePending(s);
    }
    return s;
  }
  if (legal.category === "ability") {
    const source = legal.sourceId!;
    const index = Number(id.split("|")[2]);
    const ability = getAbilities(s, p, legal.cardId!, legal.sourceId)[index];
    const unit = s.units.find((u) => u.id === source);
    const object = unit ?? s.gears.find((g) => g.id === source);
    const energyCost = payAbility(
      s,
      p,
      source,
      ability.energy ?? 0,
      ability.power ?? 0,
      ability.domain ? [ability.domain] : [],
      targetTax(s, p, legal.targetId),
      legal.flexibleEnergy,
      ability.label === "Empower",
    );
    if (object && !unit) x.firstGearAbilityTurn = s.turn;
    if (ability.disempowerSelf) {
      if (source === "legend") x.legendEmpowered = false;
      else if (unit) disempower(unit);
      else if (object) object.empowered = false;
    }
    if (ability.spendBuff && unit) {
      unit.buff--;
      event(s, "spendBuff", p, unit.cardId, unit.id, unit.location);
    }
    if (ability.oncePerTurn && object)
      (object.usedAbilities ??= []).push(ability.instanceKey ?? String(index));
    if (ability.discard) {
      const ids = (legal.cardIndices ?? []).map((i) => x.hand[i]);
      x.hand = x.hand.filter((_, i) => !legal.cardIndices?.includes(i));
      discardCards(s, p, ids);
    }
    if (ability.recycleCost) {
      const selected = new Set(legal.cardIndices ?? []);
      const recycled = x.discard.filter((_, i) => selected.has(i));
      for (const i of [...selected].sort((a, b) => b - a)) takeTrashAt(s, p, i);
      recycleCards(s, p, shuffle(s, recycled));
    }
    if (ability.exhaust) {
      if (source === "legend") x.legendUsedTurn = s.turn;
      else {
        const target =
          s.units.find((u) => u.id === source) ??
          s.gears.find((g) => g.id === source);
        if (target) target.ready = false;
      }
    }
    if (ability.banishSelf && object) {
      if (!object.token)
        banishCard(s, physicalOwner(object), physicalCard(object));
      if (unit) s.units = s.units.filter((u) => u.id !== source);
      else {
        detach(s, object as Gear);
        s.gears = s.gears.filter((g) => g.id !== source);
      }
      event(s, "banish", p, object.cardId, source);
    }
    if (ability.sacrificeSelf) {
      if (unit) killUnits(s, [source]);
      else killGear(s, source);
    }
    if (
      ability.effects.every((e) => e.type === "energy" || e.type === "power")
    ) {
      runEffects(s, p, ability.effects, legal.targetId, source, unit?.location);
      event(s, "abilityActivated", p, legal.cardId!, source, unit?.location, {
        abilityEnergyCost: energyCost,
      });
      return s;
    }
    pushStack(s, {
      player: p,
      cardId: legal.cardId!,
      sourceId: source,
      targetId: legal.targetId,
      effects: ability.effects,
      locationId: unit?.location,
      kind: "ability",
      abilityEnergyCost: energyCost,
    });
    return s;
  }
  throw new Error(`Action not implemented: ${id}`);
}
export function applyAction(
  state: GameState,
  action: string | GameAction,
): GameState {
  const next = applyActionInternal(state, action);
  syncHybridObjects(next);
  if (!next.pendingChoice) checkDeaths(next);
  next.revision = (state.revision ?? 0) + 1;
  checkVictory(next);
  if (next.winner !== null) {
    next.phase = "ended";
    next.pendingChoice = null;
    next.pendingTriggers = [];
    next.pendingMove = null;
    return next;
  }
  if (!next.pendingChoice) drainTriggers(next);
  const arrivals = next.units.filter(
    (u) =>
      u.location.startsWith("field:") &&
      !state.units.some(
        (old) => old.id === u.id && old.location === u.location,
      ),
  );
  next.stagedFields = [
    ...new Set([
      ...(next.stagedFields ?? []),
      ...arrivals.map((u) => u.location),
    ]),
  ];
  if (next.pendingChoice && next.phase !== "choice") {
    next.pendingChoice.returnPhase = next.phase;
    next.pendingChoice.returnPriority = next.priorityPlayer;
    next.phase = "choice";
    next.priorityPlayer = next.pendingChoice.player;
  }
  if (next.winner !== null || next.pendingChoice) return next;
  syncCombatParticipants(next);
  if (!next.combat && !next.stack.length && next.phase === "main") {
    const staged = next.fields.find(
      (f) =>
        next.stagedFields?.includes(f.id) &&
        next.units.some((u) => u.location === f.id && u.owner !== f.controller),
    );
    next.stagedFields = next.stagedFields.filter((id) =>
      next.fields.some(
        (f) =>
          f.id === id &&
          next.units.some((u) => u.location === id && u.owner !== f.controller),
      ),
    );
    if (staged) {
      next.stagedFields = next.stagedFields.filter((id) => id !== staged.id);
      const challenger =
        staged.controller === null
          ? next.units.some(
              (u) => u.location === staged.id && u.owner === next.currentPlayer,
            )
            ? next.currentPlayer
            : otherPlayer(next.currentPlayer)
          : otherPlayer(staged.controller);
      openShowdown(next, challenger, staged.id);
    }
  }
  return next;
}
export function getGameView(s: GameState, viewer: PlayerId): PublicGameView {
  const clone = structuredClone(s);
  return {
    ...clone,
    seed: 0,
    rng: 0,
    hidden: clone.hidden?.map((h) =>
      h.owner === viewer ||
      s.players[viewer].canLookAtEnemyHiddenTurn === s.turn
        ? h
        : { ...h, cardId: "hidden" },
    ),
    pendingChoice:
      clone.pendingChoice?.player !== viewer && clone.pendingChoice
        ? {
            ...clone.pendingChoice,
            options: undefined,
            effects: undefined,
            afterEffects: undefined,
            effect: undefined,
            sourceSnapshot: undefined,
            cardId: undefined,
          }
        : clone.pendingChoice,
    players: clone.players.map((p) => ({
      ...p,
      deckList:
        p.id === viewer || s.matchConfig?.openDecklists
          ? p.deckList
          : undefined,
      runeList:
        p.id === viewer || s.matchConfig?.openDecklists
          ? p.runeList
          : undefined,
      deckId:
        p.id === viewer || s.matchConfig?.openDecklists ? p.deckId : "private",
      hand: p.id === viewer ? p.hand : [],
      deck: [],
      runeDeck: [],
      handCount: p.hand.length,
      deckCount: p.deck.length,
    })) as unknown as PublicGameView["players"],
  };
}
export function serializeGame(s: GameState) {
  return JSON.stringify(s);
}
export function deserializeGame(raw: string): GameState {
  const state = JSON.parse(raw) as GameState;
  if (
    state.version !== 1 ||
    !Array.isArray(state.players) ||
    state.players.length !== 2
  )
    throw new Error("Invalid game save");
  syncHybridObjects(state);
  return state;
}

/** Each returned event is inert until the interface advances its Proceed gate. */
export function applyActionStepped(
  state: GameState,
  action: string | GameAction,
): { state: GameState; frames: StepFrame[] } {
  let legal = typeof action === "string" ? undefined : action;
  if (typeof action === "string")
    for (const candidate of iterateLegalActions(state, state.priorityPlayer)) {
      if (candidate.id === action) {
        legal = candidate;
        break;
      }
    }
  const collected: StepFrame[] = [];
  stepFrames = collected;
  try {
    const result = applyAction(state, action);
    const last = collected.at(-1);
    if (!last || JSON.stringify(last.state) !== JSON.stringify(result))
      collected.push({
        state: structuredClone(result),
        label: legal?.label ?? "Action complete",
      });
    return { state: result, frames: collected };
  } finally {
    stepFrames = null;
  }
}
