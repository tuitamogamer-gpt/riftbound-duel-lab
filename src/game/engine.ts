import { cards, getCard, type Card } from "../data/cards";
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
  GameOptions,
  PlayerId,
  LocationId,
  Unit,
  GameAction,
  Effect,
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
const cardName = (id: string) => getCard(id).name.replace(" (Starter)", "");
function log(
  s: GameState,
  text: string,
  kind: GameState["log"][number]["kind"] = "info",
  player?: PlayerId,
  combat?: CombatStep,
) {
  s.log.push({ id: s.nextId++, turn: s.turn, text, kind, player });
  if (s.log.length > 250) s.log.shift();
  recordStep(s, text, combat);
}
function recordStep(s: GameState, label: string, combat?: CombatStep) {
  if (stepFrames)
    stepFrames.push({
      state: structuredClone(s),
      label,
      ...(combat ? { combat: structuredClone(combat) } : {}),
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
export function getMight(s: GameState, u: Unit): number {
  const c = getCard(u.cardId),
    sc = getScript(c.id);
  let value =
    (u.baseMightOverride ?? c.might ?? 0) +
    u.buff * (1 + (s.players[u.owner].buffBonus ?? 0)) +
    u.temporaryMight;
  if (u.cardId === "ogs-004-024" && s.players[u.owner].runes.length >= 8)
    value += 4;
  value += s.units.filter(
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
      s.units.filter(
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
  return Math.max(0, laterMight(s, u, value));
}
export function getKeywords(s: GameState, u: Unit) {
  const result = [
    ...(getScript(u.cardId)?.keywords ?? []),
    ...(u.temporaryKeywords ?? []),
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
/** The actual damage contribution used by combat, including zero-power units. */
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
      lethalAt: Math.max(1, getMight(s, u) - u.damage + (u.preventDamage ?? 0)),
      keywords: getKeywords(s, u),
    })),
  };
}
export function getResources(s: GameState, p: PlayerId) {
  const x = s.players[p];
  return {
    energy: x.energy + x.runes.filter((r) => r.ready).length,
    power: x.runes.length + (x.power ?? 0),
    domains: Object.fromEntries(
      ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map((d) => [
        d,
        x.runes.filter((r) => r.domain === d).length,
      ]),
    ),
  };
}
function costFor(s: GameState, p: PlayerId, c: Card, targetId?: string) {
  let energy = c.energy ?? 0;
  let power = c.power ?? 0;
  if (c.id === "ogn-195-298")
    energy = Math.max(0, energy - s.players[p].discard.length);
  if (c.type === "Spell")
    energy = Math.max(
      Math.min(energy, 1),
      energy -
        s.units.filter(
          (u) =>
            u.owner === p &&
            u.cardId === "ogn-084-298" &&
            u.location.startsWith("field:"),
        ).length,
    );
  if (c.id === "ogn-012-298" && s.players[p].cardsPlayedThisTurn > 0)
    energy -= 2;
  const extraPower = (targetId ?? "").split("~").reduce((n, id) => {
    const target = s.units.find((u) => u.id === id);
    return n + (target && target.owner !== p ? deflect(s, target) : 0);
  }, 0);
  const adjustment = laterCost(s, p, c, context());
  energy = Math.max(0, energy + adjustment.energy);
  const spellEnergy =
    c.type === "Spell" ? Math.min(s.players[p].spellEnergy ?? 0, energy) : 0;
  return {
    spellEnergy,
    energy: energy - spellEnergy,
    power: Math.max(0, power + adjustment.power),
    extraPower,
  };
}
function alternateCost(
  s: GameState,
  p: PlayerId,
  c: ReturnType<typeof costFor>,
  energy: number,
  power: number,
) {
  c.spellEnergy = Math.min(s.players[p].spellEnergy ?? 0, energy);
  c.energy = energy - c.spellEnergy;
  c.power = power;
}
type PowerGroup = { power: number; domains: string[] };
/** Matching keeps universal Power available for costs whose domains have no rune. */
function powerPayment(s: GameState, p: PlayerId, groups: PowerGroup[]) {
  const player = s.players[p];
  const required = groups.reduce((n, group) => n + group.power, 0);
  if (required > player.runes.length + (player.power ?? 0)) return null;
  const slots = groups.flatMap((group) =>
    Array.from({ length: group.power }, () => group.domains),
  );
  const resources = [
    ...[...player.runes]
      .sort((a, b) => Number(a.ready) - Number(b.ready))
      .map((r) => ({ id: r.id, domain: r.domain })),
    ...Array.from({ length: Math.min(required, player.power ?? 0) }, () => ({
      id: "",
      domain: "",
    })),
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
  if (additionalPower.length)
    return (
      x.energy + x.runes.filter((r) => r.ready).length >= energy &&
      powerPayment(s, p, [
        { power, domains },
        { power: anyPower, domains: [] },
        ...additionalPower,
      ]) !== null
    );
  return (
    x.energy + x.runes.filter((r) => r.ready).length >= energy &&
    x.runes.filter((r) => !domains.length || domains.includes(r.domain))
      .length +
      (x.power ?? 0) >=
      power &&
    x.runes.length + (x.power ?? 0) >= power + anyPower
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
  const stored = Math.min(energy, x.energy);
  x.energy -= stored;
  energy -= stored;
  for (const r of x.runes) {
    if (energy > 0 && r.ready) {
      r.ready = false;
      energy--;
    }
  }
  if (additionalPower.length) {
    const selected = powerPayment(s, p, [
      { power, domains },
      { power: anyPower, domains: [] },
      ...additionalPower,
    ]);
    if (!selected || energy > 0) throw new Error("Unpayable cost");
    const ids = new Set(selected.map((r) => r.id).filter(Boolean));
    x.runeDeck.push(
      ...x.runes.filter((r) => ids.has(r.id)).map((r) => r.domain),
    );
    x.runes = x.runes.filter((r) => !ids.has(r.id));
    x.power = (x.power ?? 0) - selected.filter((r) => !r.id).length;
    return;
  }
  const storedPower = Math.min(power, x.power ?? 0);
  power -= storedPower;
  x.power = (x.power ?? 0) - storedPower;
  const storedAny = Math.min(anyPower, x.power ?? 0);
  anyPower -= storedAny;
  x.power = (x.power ?? 0) - storedAny;
  const eligible = x.runes
    .filter((r) => !domains.length || domains.includes(r.domain))
    .sort((a, b) => Number(a.ready) - Number(b.ready));
  const recycled: string[] = [];
  for (const r of eligible.slice(0, power)) {
    x.runes.splice(x.runes.indexOf(r), 1);
    recycled.push(r.domain);
  }
  const extra = [...x.runes].sort((a, b) => Number(a.ready) - Number(b.ready));
  for (const r of extra.slice(0, anyPower)) {
    x.runes.splice(x.runes.indexOf(r), 1);
    recycled.push(r.domain);
  }
  if (energy > 0 || eligible.length < power || extra.length < anyPower)
    throw new Error("Unpayable cost");
  // Payment is automated; retain its deterministic chosen order at the bottom.
  x.runeDeck.push(...recycled);
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
function point(s: GameState, p: PlayerId, reason: string) {
  s.players[p].points++;
  log(
    s,
    `${s.players[p].name}: ${s.players[p].points} / 8 — ${reason}`,
    "score",
    p,
  );
  if (s.players[p].points >= 8) {
    s.winner = p;
    s.phase = "ended";
    log(s, `${s.players[p].name} wins the match.`, "score", p);
  }
  if (s.winner === null)
    event(s, "score", p, s.players[p].legendId, "legend", undefined, {
      amount: 1,
    });
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
      x.deck = shuffle(s, x.discard);
      x.discard = [];
    }
    if (x.deck.length) x.hand.push(x.deck.shift()!);
  }
  if (x.hand.length > before) {
    log(s, `${x.name} draws ${x.hand.length - before} card(s).`, "info", p);
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
    s.fields[i].cardId = getRulesCardId(
      candidates[Math.floor(random(s) * candidates.length)],
    );
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
  if (x.scoredFieldsThisTurn.includes(index)) return;
  x.scoredFieldsThisTurn.push(index);
  if (!hold) x.conqueredThisTurn.push(index);
  if (!hold && x.points === 7 && x.scoredFieldsThisTurn.length < 2) {
    draw(s, p, 1);
    log(
      s,
      `${x.name} conquers: draw 1 instead of the final point. Hold or score both battlefields to win.`,
      "score",
      p,
    );
  } else
    point(s, p, hold ? "holding a battlefield" : "conquering a battlefield");
  if (s.winner !== null) return;
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
    const effects = hold
      ? getScript(u.cardId)?.onHold
      : getScript(u.cardId)?.onConquer;
    if (effects) trigger(s, p, u.cardId, u.id, effects, field);
  }
  event(
    s,
    hold ? "hold" : "conquer",
    p,
    s.fields.find((f) => f.id === field)!.cardId,
    field,
    field,
  );
  const fieldCard = s.fields.find((f) => f.id === field)!;
  const fieldEffects = hold
    ? getScript(fieldCard.cardId)?.onHold
    : getScript(fieldCard.cardId)?.onConquer;
  if (fieldEffects) trigger(s, p, fieldCard.cardId, field, fieldEffects, field);
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
        effects: [{ type: "token", amount: 1, location: "here" }],
        locationId: base(p),
        kind: "trigger",
      });
    if (f.cardId === "ogn-280-298")
      pushStack(s, {
        player: p,
        cardId: f.cardId,
        effects: [{ type: "draw", amount: 1 }],
        kind: "trigger",
      });
  }
}
function beginTurn(s: GameState, p: PlayerId) {
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
    x.discardedThisTurn = 0;
    x.buffBonus = 0;
    x.energy = 0;
    x.spellEnergy = 0;
    x.power = 0;
  }
  const x = s.players[p];
  const readied = s.units.filter((u) => u.owner === p && !u.ready);
  for (const r of x.runes) r.ready = true;
  for (const u of s.units.filter((u) => u.owner === p)) {
    u.ready = true;
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
  const x = s.players[p];
  s.pendingBeginning = p;
  event(s, "beginning", p, x.legendId, "legend");
  killUnits(
    s,
    s.units.filter((u) => u.owner === p && u.temporary).map((u) => u.id),
  );
  for (const g of [...s.gears].filter((g) => g.owner === p && g.temporary))
    killGear(s, g.id);
  for (const source of [
    { cardId: x.legendId, id: "legend" },
    ...s.gears.filter((g) => g.owner === p),
    ...s.units.filter((u) => u.owner === p),
  ]) {
    const effects = getScript(source.cardId)?.onBegin;
    if (effects)
      trigger(
        s,
        p,
        source.cardId,
        source.id,
        effects,
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
  channel(s, p, !x.hasBegun && s.turn === 2 ? 3 : 2);
  x.hasBegun = true;
  draw(s, p, 1);
  for (const player of s.players) {
    player.energy = 0;
    player.spellEnergy = 0;
    player.power = 0;
  }
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
function targets(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  location?: LocationId,
): Array<string | undefined> {
  const e = effects.find((e) => e.target);
  if (!e) return [undefined];
  if (e.target === "spell")
    return s.stack
      .filter(
        (item) =>
          item.kind === "spell" &&
          (e.maxEnergy === undefined ||
            (getCard(item.cardId).energy ?? 0) <= e.maxEnergy) &&
          (e.maxPower === undefined ||
            (getCard(item.cardId).power ?? 0) <= e.maxPower),
      )
      .map((item) => item.id);
  if (e.target === "battlefield") return s.fields.map((f) => f.id);
  if (e.target === "anyTwoUnits") {
    const units = s.units.filter((u) => !protectedFrom(s, u, p));
    return units.flatMap((a, i) =>
      units.slice(i + 1).map((b) => `${a.id}~${b.id}`),
    );
  }
  if (e.target === "unitAndSpell")
    return s.units
      .filter((u) => u.owner === p)
      .flatMap((u) =>
        s.stack.filter((i) => i.kind === "spell").map((i) => `${u.id}~${i.id}`),
      );
  if (e.target === "upToTwoUnits" || e.target === "upToTwoFriendlyUnits") {
    const units = s.units.filter(
      (u) =>
        (e.target === "upToTwoUnits" || u.owner === p) &&
        !protectedFrom(s, u, p),
    );
    return [
      undefined,
      ...units.map((u) => u.id),
      ...units.flatMap((u, i) =>
        units.slice(i + 1).map((v) => `${u.id}~${v.id}`),
      ),
    ];
  }
  if (e.target === "twoFriendlyUnits") {
    const units = s.units.filter((u) => u.owner === p);
    return units.flatMap((u, i) =>
      units.slice(i + 1).map((v) => `${u.id}~${v.id}`),
    );
  }
  if (e.target === "unitOrGear")
    return [
      ...s.units
        .filter(
          (u) => u.location.startsWith("field:") && !protectedFrom(s, u, p),
        )
        .map((u) => u.id),
      ...s.gears.map((g) => g.id),
    ];
  if (e.target === "duel")
    return s.units
      .filter((u) => u.owner === p)
      .flatMap((a) =>
        s.units
          .filter((u) => u.owner !== p && !protectedFrom(s, u, p))
          .map((b) => a.id + "~" + b.id),
      );
  if (e.target === "enemyGear" || e.target === "anyGear")
    return [
      ...s.gears
        .filter(
          (g) =>
            (e.target === "anyGear" || g.owner !== p) &&
            (e.maxEnergy === undefined ||
              (getCard(g.cardId).energy ?? 0) <= e.maxEnergy),
        )
        .map((g) => g.id),
      ...(e.optional ? [undefined] : []),
    ];
  return s.units
    .filter((u) => matches(s, u, p, e.target!, location, e.maxMight))
    .map((u) => u.id);
}
function targetLabel(s: GameState, id?: string): string {
  if (!id) return "";
  if (id.startsWith("field:")) return " → " + locationName(id as LocationId);
  if (id.includes("~"))
    return id
      .split("~")
      .map((part) => targetLabel(s, part))
      .join(" fights");
  const x =
    s.units.find((u) => u.id === id) ??
    s.gears.find((g) => g.id === id) ??
    s.stack.find((item) => item.id === id);
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
  return getKeywords(s, u).includes("Ganking");
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
      const extra = sc[mode];
      if (!extra) continue;
      const cost = costFor(s, p, c, a.targetId);
      if (a.sourceId?.startsWith("hidden:")) alternateCost(s, p, cost, 0, 0);
      if (a.sourceId?.startsWith("trash:") && sc.flow)
        alternateCost(s, p, cost, sc.flow.energy, sc.flow.power);
      const accelerated = a.id.includes("|accelerate");
      const extraSpellEnergy =
        c.type === "Spell"
          ? Math.min(
              extra.energy ?? 0,
              Math.max(0, (s.players[p].spellEnergy ?? 0) - cost.spellEnergy),
            )
          : 0;
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
        const extraAny =
          mode === "repeat"
            ? (extra.domain ? 0 : (extra.power ?? 0)) +
              targetTax(s, p, repeatedTargetId)
            : 0;
        if (
          !canPay(
            s,
            p,
            cost.energy +
              (extra.energy ?? 0) -
              extraSpellEnergy +
              (accelerated ? 1 : 0),
            cost.power +
              (mode === "additionalCost" ? (extra.power ?? 0) : 0) +
              (accelerated ? 1 : 0),
            a.sourceId?.startsWith("trash:")
              ? sc.flow?.domain
                ? [sc.flow.domain]
                : []
              : c.domains,
            cost.extraPower + extraAny,
            mode === "repeat" && extra.domain
              ? [{ power: extra.power ?? 0, domains: [extra.domain] }]
              : [],
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
    s.units.filter(
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
): Effect[] {
  return effects.map((e) => ({
    ...e,
    fromHidden,
    additionalCostPaid,
    ...(e.effects
      ? { effects: annotateEffects(e.effects, fromHidden, additionalCostPaid) }
      : {}),
  }));
}

/** Physical card selections for up-front costs; identical copies share a choice. */
function recycleSelections(discard: string[], count: number): number[][] {
  if (!count) return [[]];
  const result: number[][] = [];
  const visit = (start: number, selected: number[]) => {
    if (selected.length === count) {
      result.push(selected);
      return;
    }
    const seen = new Set<string>();
    for (let i = start; i <= discard.length - (count - selected.length); i++) {
      if (seen.has(discard[i])) continue;
      seen.add(discard[i]);
      visit(i + 1, [...selected, i]);
    }
  };
  visit(0, []);
  return result;
}

export function getLegalActions(s: GameState, p: PlayerId): GameAction[] {
  const out: GameAction[] = [];
  const add = (a: Omit<GameAction, "player">) => out.push({ ...a, player: p });
  if (s.phase === "ended" || s.winner !== null) return out;
  const x = s.players[p];
  if (s.phase === "mulligan") {
    if (x.mulliganDone || s.priorityPlayer !== p) return out;
    add({
      id: "mulligan:",
      label: "Keep all four cards",
      category: "mulligan",
      cardIndices: [],
    });
    for (let i = 0; i < x.hand.length; i++) {
      add({
        id: `mulligan:${i}`,
        label: p === 0 ? `Replace ${cardName(x.hand[i])}` : "Replace one card",
        category: "mulligan",
        cardIndices: [i],
        cardId: p === 0 ? x.hand[i] : undefined,
      });
      for (let j = i + 1; j < x.hand.length; j++)
        add({
          id: `mulligan:${i},${j}`,
          label:
            p === 0
              ? `Replace ${cardName(x.hand[i])} + ${cardName(x.hand[j])}`
              : "Replace two cards",
          category: "mulligan",
          cardIndices: [i, j],
        });
    }
    return out;
  }
  if (s.priorityPlayer !== p) return out;
  if (s.phase === "choice") {
    const choice = s.pendingChoice!;
    if (choice.kind === "readyRunes") {
      for (const rune of x.runes.filter((r) =>
        choice.finalizingTrigger
          ? !choice.chosenRuneIds?.includes(r.id)
          : !r.ready,
      ))
        add({
          id: `choose-rune:${rune.id}`,
          label: `Ready ${rune.domain} rune`,
          category: "ability",
          sourceId: rune.id,
        });
      if (!out.length || choice.effect?.optional)
        add({
          id: "choose-rune:skip",
          label: "Finish readying runes",
          category: "ability",
        });
      return out;
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
      return (
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
    }
    if (["discard", "recycle", "retrieve"].includes(choice.kind)) {
      const zone = choice.kind === "discard" ? x.hand : x.discard;
      for (const [i, cardId] of zone.entries()) {
        if (
          choice.kind === "retrieve" &&
          ((choice.effect?.condition === "unit" &&
            getCard(cardId).type !== "Unit") ||
            (choice.effect?.condition === "spell" &&
              getCard(cardId).type !== "Spell"))
        )
          continue;
        add({
          id: `choose-card:${i}`,
          label: `${choice.kind}: ${cardName(cardId)}`,
          category: "ability",
          cardId,
          amount: i,
        });
      }
      if (!out.length || choice.effect?.optional)
        add({
          id: "choose-card:skip",
          label: "Continue without selecting a card",
          category: "ability",
        });
      return out;
    }
    if (choice.kind === "predict") {
      add({
        id: "choose-predict:keep",
        label: x.deck.length
          ? `Keep ${cardName(x.deck[0])} on top`
          : "Deck empty: continue",
        category: "ability",
      });
      if (x.deck.length)
        add({
          id: "choose-predict:recycle",
          label: `Recycle ${cardName(x.deck[0])}`,
          category: "ability",
        });
      return out;
    }
    if (choice.kind === "sacrifice" || choice.kind === "spendBuff") {
      for (const u of s.units.filter(
        (u) => u.owner === p && (choice.kind === "sacrifice" || u.buff > 0),
      ))
        add({
          id: `choose-unit:${u.id}`,
          label: `${choice.kind === "sacrifice" ? "Kill" : "Spend a buff from"} ${cardName(u.cardId)}`,
          category: "ability",
          targetId: u.id,
        });
      if (!out.length || choice.effect?.optional)
        add({
          id: "choose-unit:skip",
          label: "Decline optional effect",
          category: "ability",
        });
      return out;
    }
    if (choice.kind === "optional") {
      add({
        id: "choose-optional:yes",
        label: choice.effect?.cardName ?? "Use optional ability",
        category: "ability",
      });
      add({
        id: "choose-optional:no",
        label: "Decline optional ability",
        category: "ability",
      });
      return out;
    }
    if (choice.kind === "move") {
      const u = s.units.find((u) => u.id === choice.targetId);
      if (u)
        for (const locationId of [
          base(u.owner),
          ...s.fields.map((f) => f.id),
        ].filter(
          (id) =>
            id !== u.location &&
            !(
              id === base(u.owner) &&
              getKeywords(s, u).includes("Cannot move to base")
            ),
        ))
          add({
            id: `choose-destination:${locationId}`,
            label: `Move to ${locationName(locationId)}`,
            category: "ability",
            locationId,
          });
      return out;
    }
    if (choice.kind === "token") {
      for (const locationId of [
        base(p),
        ...s.fields.filter((f) => f.controller === p).map((f) => f.id),
      ].filter(
        (locationId) =>
          !choice.effect?.fromHidden || locationId === choice.locationId,
      ))
        add({
          id: `choose-token:${locationId}`,
          label: `Place ${choice.effect?.cardName ?? "Recruit"} at ${locationName(locationId)} (${choice.remaining} remaining)`,
          category: "ability",
          locationId,
        });
    } else {
      out.push(
        ...triggerActions(
          s,
          p,
          choice.effects ?? [],
          choice.sourceId ?? "",
          choice.cardId ?? "",
          choice.locationId ??
            s.units.find((u) => u.id === choice.sourceId)?.location ??
            s.combat?.fieldId,
        ),
      );
      if (
        !out.length ||
        choice.effects?.some((e) => e.optional && !e.chooseRunes)
      )
        add({
          id: "choose-trigger:skip",
          label: "Decline optional trigger",
          category: "ability",
        });
    }
    return out;
  }
  if (s.phase === "move") {
    const move = s.pendingMove!;
    for (const u of s.units.filter(
      (u) => u.owner === p && canMove(s, u, move.to),
    )) {
      const selected = move.unitIds.includes(u.id);
      add({
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
      add({
        id: "move-confirm",
        label: `Move ${move.unitIds.length} unit${move.unitIds.length === 1 ? "" : "s"} to ${locationName(move.to)}`,
        category: "move",
        locationId: move.to,
        unitIds: [...move.unitIds],
      });
    add({ id: "move-cancel", label: "Cancel movement", category: "move" });
    return out;
  }
  if (s.phase === "damage") {
    const c = s.combat!;
    if (c.assigningPlayer !== p) return out;
    let enemies = s.units.filter(
      (u) =>
        u.owner !== p &&
        u.location === c.fieldId &&
        (c.assignments[p][u.id] ?? 0) <
          Math.max(1, getMight(s, u) - u.damage + (u.preventDamage ?? 0)),
    );
    const remainingTargets = enemies.length;
    const tanks = enemies.filter((u) => getKeywords(s, u).includes("Tank"));
    if (tanks.length) enemies = tanks;
    else if (enemies.some((u) => !getKeywords(s, u).includes("Backline")))
      enemies = enemies.filter((u) => !getKeywords(s, u).includes("Backline"));
    for (const u of enemies) {
      const amount =
        remainingTargets === 1
          ? c.remaining[p]
          : Math.min(
              c.remaining[p],
              Math.max(
                1,
                getMight(s, u) -
                  u.damage +
                  (u.preventDamage ?? 0) -
                  (c.assignments[p][u.id] ?? 0),
              ),
            );
      if (amount > 0)
        add({
          id: `damage:${u.id}:${amount}`,
          label: `Assign ${amount} damage to ${cardName(u.cardId)}`,
          category: "combat",
          targetId: u.id,
          amount,
        });
    }
    if (!enemies.length || !c.remaining[p])
      add({
        id: "damage-done",
        label: "Confirm damage assignment",
        category: "combat",
      });
    return out;
  }
  const inChain = s.stack.length > 0;
  const inShowdown = s.phase === "showdown";
  const canMain = !inChain && !inShowdown && p === s.currentPlayer;
  if (canMain) {
    for (const [i, id] of x.hand.entries())
      if (getScript(id)?.hidden && canPay(s, p, 0, 0, [], 1))
        for (const f of s.fields.filter(
          (f) =>
            f.controller === p && !s.hidden?.some((h) => h.location === f.id),
        ))
          add({
            id: `hide:${i}:${f.id}`,
            label: `Hide ${cardName(id)} at ${locationName(f.id)}`,
            category: "ability",
            cardId: id,
            sourceId: `hand:${i}`,
            locationId: f.id,
          });
  }
  const playable = [
    ...x.hand.map((id, index) => ({ id, source: `hand:${index}` })),
    ...(x.championAvailable ? [{ id: x.championId, source: "champion" }] : []),
    ...(s.hidden ?? [])
      .filter((h) => h.owner === p && h.hiddenTurn < s.turn)
      .map((h) => ({ id: h.cardId, source: `hidden:${h.id}` })),
    ...x.discard.flatMap((id, i) =>
      getScript(id)?.flow ? [{ id, source: `trash:${i}` }] : [],
    ),
  ].flatMap<{
    id: string;
    source: string;
    mode?: { label: string; effects: Effect[] };
    modeIndex?: number;
  }>((entry) => {
    const modes = getScript(entry.id)?.spellModes;
    return modes?.length
      ? modes.map((mode, modeIndex) => ({ ...entry, mode, modeIndex }))
      : [{ ...entry, mode: undefined, modeIndex: undefined }];
  });
  for (const entry of playable) {
    const c = getCard(entry.id),
      script = getScript(c.id);
    if (!script) continue;
    if (c.type === "Spell" && x.cannotPlaySpellsTurn === s.turn) continue;
    const hidden = (s.hidden ?? []).find(
      (h) => entry.source === `hidden:${h.id}`,
    );
    const ambushEnemy = script.keywords?.includes("AmbushEnemyOccupied");
    const ambushAt = (u: Unit) =>
      (script.ambush && u.owner === p) || (ambushEnemy && u.owner !== p);
    const ambush = s.units.some(
      (u) => ambushAt(u) && u.location.startsWith("field:"),
    );
    if (inChain && !script.reaction && !hidden && !ambush) continue;
    if (
      inShowdown &&
      !inChain &&
      !script.action &&
      !script.reaction &&
      !hidden &&
      !ambush
    )
      continue;
    if (!canMain && !inShowdown && !inChain) continue;
    const effects: Effect[] =
      c.type === "Spell"
        ? (entry.mode?.effects ?? script.spell ?? [])
        : c.id === "ogn-208-298"
          ? [{ type: "sacrifice", target: "friendlyUnit" }]
          : [];
    for (const targetId of targets(s, p, effects).length
      ? targets(s, p, effects)
      : c.type === "Unit"
        ? [undefined]
        : []) {
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
      const cost = costFor(s, p, c, targetId);
      if (hidden) alternateCost(s, p, cost, 0, 0);
      if (entry.source.startsWith("trash:") && script.flow)
        alternateCost(s, p, cost, script.flow.energy, script.flow.power);
      if (
        !canPay(
          s,
          p,
          c.id === "ogn-002-298" ? Math.max(0, cost.energy - 2) : cost.energy,
          cost.power,
          entry.source.startsWith("trash:")
            ? script.flow?.domain
              ? [script.flow.domain]
              : []
            : c.domains,
          cost.extraPower,
        )
      )
        continue;
      const locations: Array<LocationId | undefined> =
        c.type === "Unit"
          ? [
              ...(hidden || (ambush && !canMain) ? [] : [base(p)]),
              ...s.fields
                .filter(
                  (f) =>
                    f.controller === p ||
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
      for (const locationId of locations) {
        if (
          script.keywords?.includes("Play only to conquered battlefield") &&
          (!locationId?.startsWith("field:") ||
            !x.conqueredThisTurn.includes(Number(locationId.split(":")[1])))
        )
          continue;
        if (hidden && c.type === "Unit" && locationId !== hidden.location)
          continue;
        if (c.id === "ogn-208-298" && !s.units.some((u) => u.owner === p))
          continue;
        if (
          canPay(
            s,
            p,
            cost.energy,
            cost.power,
            entry.source.startsWith("trash:")
              ? script.flow?.domain
                ? [script.flow.domain]
                : []
              : c.domains,
            cost.extraPower,
          )
        )
          add({
            id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}${entry.mode ? `|mode:${entry.modeIndex}` : ""}`,
            label: `Play ${cardName(c.id)}${entry.mode ? ` · ${entry.mode.label}` : ""}${locationId ? ` at ${locationName(locationId)}` : ""}${targetLabel(s, targetId)}`,
            category: "play",
            sourceId: entry.source,
            cardId: c.id,
            targetId,
            locationId,
            detail: `${cost.energy} energy · ${cost.power + cost.extraPower} power`,
            ...(entry.mode ? { effects: entry.mode.effects } : {}),
            ...(c.id === "ogn-208-298"
              ? { effects: [{ type: "sacrifice" }] }
              : {}),
          });
        if (c.id === "ogn-048-298")
          for (const unit of s.units.filter((u) => u.owner === p && u.ready))
            add({
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
            add({
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
        if (
          script.accelerating &&
          canPay(
            s,
            p,
            cost.energy + 1,
            cost.power + 1,
            c.domains,
            cost.extraPower,
          )
        )
          add({
            id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}|accelerate`,
            label: `Accelerate ${cardName(c.id)}${locationId ? ` at ${locationName(locationId)}` : ""}${targetLabel(s, targetId)}`,
            category: "play",
            sourceId: entry.source,
            cardId: c.id,
            targetId,
            locationId,
            detail: `${cost.energy + 1} energy · ${cost.power + cost.extraPower + 1} power · enters ready`,
          });
      }
    }
  }
  if (canMain) {
    for (const u of s.units.filter((u) => u.owner === p && u.ready))
      for (const to of [base(p), ...s.fields.map((f) => f.id)])
        if (canMove(s, u, to))
          add({
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
  for (const source of sources) {
    const abilityList = getAbilities(s, p, source.cardId);
    for (const [index, a] of abilityList.entries()) {
      const sourceUnit = s.units.find((u) => u.id === source.id);
      const object = sourceUnit ?? s.gears.find((g) => g.id === source.id);
      if (a.spendBuff && !sourceUnit?.buff) continue;
      if (
        a.condition === "sourceAtBattlefield" &&
        !sourceUnit?.location.startsWith("field:")
      )
        continue;
      if (a.oncePerTurn && object?.usedAbilities?.includes(String(index)))
        continue;
      if ((a.recycleCost ?? 0) > x.discard.length) continue;
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
      if (
        !canPay(s, p, a.energy ?? 0, a.power ?? 0, a.domain ? [a.domain] : [])
      )
        continue;
      for (const targetId of targets(
        s,
        p,
        a.effects,
        sourceUnit?.location ?? s.combat?.fieldId,
      )) {
        if (
          a.effects.some((effect) => effect.excludeSource) &&
          (targetId ?? "").split("~").includes(source.id)
        )
          continue;
        if (
          !canPay(
            s,
            p,
            a.energy ?? 0,
            a.power ?? 0,
            a.domain ? [a.domain] : [],
            targetTax(s, p, targetId),
          )
        )
          continue;
        const recycleOptions = recycleSelections(x.discard, a.recycleCost ?? 0);
        for (const recycleIndices of recycleOptions)
          add({
            id: `ability|${source.id}|${index}|${targetId ?? ""}|${recycleIndices.join(",")}`,
            label: `${cardName(source.cardId)}: ${a.label}${targetLabel(s, targetId)}${recycleIndices.length ? ` · recycle ${recycleIndices.map((i) => cardName(x.discard[i])).join(" + ")}` : ""}`,
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
    add({
      id: `gold:${gear.id}`,
      label: "Spend Gold: add one universal power",
      category: "resource",
      sourceId: gear.id,
      cardId: gear.cardId,
    });
  out.push(...addPlayVariants(s, p, out));
  out.push(...getLaterActions(s, p, { ...context(), baseActions: out }));
  if (canMain)
    for (const g of s.gears.filter((g) => g.owner === p)) {
      const sc = getScript(g.cardId);
      if (sc?.equipCost !== undefined)
        for (const u of s.units.filter(
          (u) => u.owner === p && u.id !== g.attachedTo,
        ))
          if (
            canPay(
              s,
              p,
              equipEnergy(s, g.cardId, u.id),
              sc.equipCost,
              g.cardId === "unl-188-219" ? [] : getCard(g.cardId).domains,
            )
          )
            add({
              id: `equip:${g.id}:${u.id}`,
              label: `Equip ${cardName(g.cardId)} to ${cardName(u.cardId)}`,
              category: "ability",
              sourceId: g.id,
              targetId: u.id,
              cardId: g.cardId,
            });
    }
  if (inChain || inShowdown)
    add({
      id: "pass",
      label: inChain
        ? "Pass priority"
        : s.consecutivePasses
          ? "Resolve showdown"
          : "Pass focus",
      category: "pass",
    });
  else if (canMain) add({ id: "end-turn", label: "End turn", category: "end" });
  return out;
}
function getAbilities(s: GameState, p: PlayerId, cardId: string) {
  const own = getScript(cardId)?.abilities ?? [];
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
    : id === "field:0"
      ? "battlefield 1"
      : "battlefield 2";
}
function spawnToken(
  s: GameState,
  p: PlayerId,
  name: string,
  location: LocationId,
  ready = false,
) {
  const c =
    name === "Sprite"
      ? getCard("ogn-274-298")
      : name === "Recruit"
        ? getCard("ogn-271-298")
        : cards.find(
            (c) =>
              (c.name === name || c.name.startsWith(name + " //")) &&
              ["Unit", "Gear"].includes(c.type) &&
              !c.variant,
          );
  if (!c) throw new Error(`Missing token ${name}`);
  if (c.type === "Gear") {
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
      s.units.some((u) => u.owner === p && u.cardId === "ogn-011-298"),
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
  return u;
}
function unitPlayed(s: GameState, p: PlayerId, unit: Unit) {
  event(s, "unitPlayed", p, unit.cardId, unit.id, unit.location);
  for (const u of s.units)
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
  return s.units.filter((u) => u.owner === p && u.cardId === "ogs-001-024")
    .length;
}
function killUnits(s: GameState, ids: string[]) {
  for (const u of s.units.filter(
    (u) => ids.includes(u.id) && u.deathReplacementTurn === s.turn,
  )) {
    u.deathReplacementTurn = undefined;
    u.damage = 0;
    u.ready = false;
    u.location = base(u.owner);
    ids = ids.filter((id) => id !== u.id);
  }
  const dead = s.units.filter((u) => ids.includes(u.id));
  for (const u of dead)
    event(s, "death", u.owner, u.cardId, u.id, u.location, {
      dyingUnitIds: dead.map((unit) => unit.id),
    });
  if (dead.length) s.unitDiedTurn = s.turn;
  for (const p of [0, 1] as const)
    if (
      dead.some((u) => u.owner === p) &&
      s.players[p].firstDeathTurn !== s.turn
    ) {
      s.players[p].firstDeathTurn = s.turn;
      for (const wraith of s.units.filter(
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
  for (const u of dead) {
    if (!u.token) s.players[u.owner].discard.push(u.cardId);
    for (const gid of u.gear) {
      const gear = s.gears.find((g) => g.id === gid);
      if (gear) gear.attachedTo = undefined;
    }
    log(s, `${cardName(u.cardId)} is defeated.`, "combat", u.owner);
  }
  // Simultaneous triggers enter active-player batch first, then nonactive.
  for (const u of [...dead].sort(
    (a, b) =>
      Number(a.owner !== s.currentPlayer) - Number(b.owner !== s.currentPlayer),
  )) {
    const effects = getScript(u.cardId)?.onDeath;
    if (effects)
      trigger(
        s,
        u.owner,
        u.cardId,
        u.id,
        effects,
        u.location,
        structuredClone(u),
      );
  }
  refreshControl(s);
}
function killGear(s: GameState, id: string) {
  const gear = s.gears.find((g) => g.id === id);
  if (!gear) return;
  event(s, "death", gear.owner, gear.cardId, gear.id, base(gear.owner));
  s.gears = s.gears.filter((g) => g.id !== id);
  for (const u of s.units) u.gear = u.gear.filter((g) => g !== id);
  if (!gear.token) s.players[gear.owner].discard.push(gear.cardId);
  const effects = getScript(gear.cardId)?.onDeath;
  if (effects)
    trigger(s, gear.owner, gear.cardId, gear.id, effects, base(gear.owner));
}
function checkDeaths(s: GameState) {
  killUnits(
    s,
    s.units
      .filter((u) => u.damage > 0 && u.damage >= getMight(s, u))
      .map((u) => u.id),
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
    s.players[h.owner].discard.push(h.cardId);
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
  return Math.max(
    getScript(u.cardId)?.deflect ?? 0,
    getKeywords(s, u)
      .filter((k) => /^Deflect(?: \d+)?$/.test(k))
      .reduce((sum, k) => sum + (Number(k.split(" ")[1]) || 1), 0),
  );
}
function targetTax(s: GameState, p: PlayerId, id?: string) {
  return (id ?? "").split("~").reduce((n, id) => {
    const u = s.units.find((u) => u.id === id);
    return n + (u && u.owner !== p ? deflect(s, u) : 0);
  }, 0);
}
function triggerTargets(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  sourceId: string,
  cardId: string,
  locationId?: LocationId,
) {
  return targets(s, p, effects, locationId).filter(
    (id) =>
      (id !== sourceId || !["ogn-132-298", "ogn-136-298"].includes(cardId)) &&
      (!(id ?? "").split("~").includes(sourceId) ||
        !effects.some((effect) => effect.excludeSource)) &&
      canPay(s, p, 0, 0, [], targetTax(s, p, id)),
  );
}
/** Enumerate modes and public cost choices before a trigger enters the chain. */
function triggerActions(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  sourceId: string,
  cardId: string,
  locationId?: LocationId,
): GameAction[] {
  const modalIndex = effects.findIndex((e) => e.modes?.length);
  if (modalIndex >= 0) {
    const wrapper = effects[modalIndex];
    return wrapper.modes!.flatMap((mode, index) => {
      const selected = mode.effects.map((e, i) => ({
        ...e,
        ...(i === 0 && wrapper.triggerCost
          ? { triggerCost: wrapper.triggerCost }
          : {}),
        ...(wrapper.optional ? { optional: true } : {}),
      }));
      return triggerActions(
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
      ).map((action) => ({
        ...action,
        id: `${action.id}:mode:${index}`,
        label: `${mode.label}${targetLabel(s, action.targetId)}`,
      }));
    });
  }
  const cost = triggerPrice(effects);
  const player = s.players[p];
  const source =
    s.units.find((u) => u.id === sourceId) ??
    s.gears.find((g) => g.id === sourceId);
  if (
    (cost.exhaust &&
      !(sourceId === "legend"
        ? player.legendUsedTurn < 0
        : source?.owner === p && source.ready)) ||
    (player.xp ?? 0) < cost.xp
  )
    return [];
  const runeEffect = effects.find((e) => e.chooseRunes);
  if (
    runeEffect &&
    !runeEffect.optional &&
    player.runes.length < (runeEffect.amount ?? 1)
  )
    return [];
  return triggerTargets(s, p, effects, sourceId, cardId, locationId).flatMap(
    (targetId) => {
      // A leading "may" declines the whole trigger; it is not a zero-target
      // option for an instruction that still requires a chosen object.
      if (
        targetId === undefined &&
        effects.some((e) => e.target && !e.target.startsWith("upTo"))
      )
        return [];
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
        return [];
      return recycleSelections(player.discard, cost.recycleCost).map(
        (cardIndices) => ({
          id: `choose-trigger:${targetId ?? ""}${cardIndices.length ? `:recycle:${cardIndices.join(",")}` : ""}`,
          label: `${targetId ? "Choose target" : "Use triggered ability"}${targetLabel(s, targetId)}${cardIndices.length ? ` · recycle ${cardIndices.map((i) => cardName(player.discard[i])).join(" + ")}` : ""}`,
          player: p,
          category: "ability" as const,
          targetId,
          effects,
          ...(cardIndices.length ? { cardIndices } : {}),
        }),
      );
    },
  );
}
function triggerPrice(effects: Effect[]) {
  const costs = effects.flatMap((e) => (e.triggerCost ? [e.triggerCost] : []));
  return {
    energy: costs.reduce((n, c) => n + (c.energy ?? 0), 0),
    power: costs.reduce((n, c) => n + (c.power ?? 0), 0),
    domains: [...new Set(costs.flatMap((c) => (c.domain ? [c.domain] : [])))],
    exhaust: costs.some((c) => c.exhaust),
    xp: costs.reduce((n, c) => n + (c.xp ?? 0), 0),
    recycleCost: costs.reduce((n, c) => n + (c.recycleCost ?? 0), 0),
  };
}
function finalizeTrigger(
  s: GameState,
  item: Omit<StackItem, "id" | "kind">,
  action: GameAction,
) {
  const effects = action.effects ?? item.effects;
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
  if (cost.recycleCost) {
    const selected = new Set(action.cardIndices ?? []);
    const recycled = player.discard.filter((_, i) => selected.has(i));
    player.discard = player.discard.filter((_, i) => !selected.has(i));
    player.deck.push(...shuffle(s, recycled));
  }
  pushStack(s, {
    ...item,
    kind: "trigger",
    targetId: action.targetId,
    effects: effects.map(({ triggerCost: _cost, ...effect }) => effect),
  });
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
    killUnits,
    getMight,
    channel,
    moveUnit,
    openChoice,
    log,
    playUnit,
    discardCards,
    spellPlayed,
    dealDamage,
    costFor,
    targetTax,
    cardEvent: event,
    killGear,
  };
}
function event(
  s: GameState,
  name: PreconEvent,
  p: PlayerId,
  cardId: string,
  sourceId?: string,
  locationId?: LocationId,
  details?: Pick<
    PreconContext,
    | "dyingUnitIds"
    | "amount"
    | "choosingKind"
    | "previousLocation"
    | "fromHidden"
    | "paidAdditionalCost"
    | "energySpent"
    | "playOrdinal"
  >,
) {
  laterCardEvent(s, name, p, cardId, sourceId, locationId, {
    ...context(undefined, sourceId, locationId),
    ...details,
  });
}
function playUnit(
  s: GameState,
  p: PlayerId,
  cardId: string,
  location: LocationId,
  ready = false,
) {
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
      s.units.some((u) => u.owner === p && u.cardId === "ogn-011-298"),
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
  });
  unitPlayed(s, p, unit);
  cardPlayed(s, p, cardId, unit.id, location, { playOrdinal, energySpent: 0 });
  if (sc?.onPlay) trigger(s, p, cardId, unit.id, sc.onPlay, location);
  return unit;
}
function dealDamage(s: GameState, u: Unit, n: number) {
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
  u.damage += Math.max(0, n - prevented);
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
  drainTriggers(s);
  continuePending(s);
}
function finishResolvedCards(s: GameState) {
  const resolved = s.resolving ?? [];
  s.resolving = [];
  for (const item of resolved) {
    spellPlayed(s, item.player, item.cardId);
    cardPlayed(s, item.player, item.cardId, undefined, item.locationId, {
      playOrdinal: item.playOrdinal,
      energySpent: item.energySpent,
      fromHidden: item.fromHidden,
      paidAdditionalCost: item.additionalCostPaid,
    });
    if (item.flowed) {
      s.players[item.player].banished.push(item.cardId);
      event(s, "banish", item.player, item.cardId);
    } else s.players[item.player].discard.push(item.cardId);
  }
  if (s.resolving) s.resolving = [];
}
function continuePending(s: GameState) {
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
function discardCards(s: GameState, p: PlayerId, ids: string[]) {
  s.players[p].discard.push(...ids);
  s.players[p].discardedThisTurn =
    (s.players[p].discardedThisTurn ?? 0) + ids.length;
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
  u.location = destination;
  event(s, "move", actor, u.cardId, u.id, destination, { previousLocation });
  const effects = getScript(u.cardId)?.onMove;
  if (effects) trigger(s, u.owner, u.cardId, u.id, effects, destination);
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
  executingEffects.add(s);
  try {
    executeEffects(
      s,
      p,
      effects,
      targetId,
      sourceId,
      locationId,
      sourceSnapshot,
    );
  } finally {
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
    const candidate = s.units.find(
      (u) =>
        u.id ===
        (e.condition === "self"
          ? sourceId
          : e.target === "duel"
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
          (relativeGear ? base(relativeGear.owner) : undefined));
    const u =
      candidate &&
      (!e.excludeSource || candidate.id !== sourceId) &&
      (!e.target ||
        e.target === "duel" ||
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
      (e.target === "anyGear" || e.target === "enemyGear") &&
      !targets(s, p, [e], locationId).includes(targetId)
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
        "spell",
        "duel",
        "anyTwoUnits",
        "twoFriendlyUnits",
        "unitOrGear",
        "anyGear",
        "enemyGear",
        "upToTwoUnits",
        "upToTwoFriendlyUnits",
        "unitAndSpell",
      ].includes(e.target) &&
      !u
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
        if (e.target === "upToTwoUnits") {
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
            n +
              bonusDamage(s, p) +
              (s.fields.find((f) => f.id === u.location)?.cardId ===
              "ogn-296-298"
                ? 1
                : 0),
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
          (e.target === "anyTwoUnits" ||
            (first.owner === p && second.owner !== p)) &&
          !protectedFrom(s, first, p) &&
          !protectedFrom(s, second, p)
        ) {
          const a = getMight(s, first),
            b = getMight(s, second);
          dealDamage(s, first, b);
          dealDamage(s, second, a);
        }
        break;
      }
      case "kill":
        if (u) {
          const owner = u.owner;
          killUnits(s, [u.id]);
          if (e.condition === "controllerDraw2") draw(s, owner, 2);
        } else if (e.target === "anyGear" || e.target === "enemyGear") {
          const gear = s.gears.find((g) => g.id === targetId);
          if (gear) {
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
        if (u && e.minMight !== undefined)
          u.temporaryMight += Math.min(
            0,
            Math.max(n, e.minMight - getMight(s, u)),
          );
        else if (u)
          u.temporaryMight +=
            n +
            (e.condition === "aloneBonus" &&
            s.units.filter((x) => x.owner === p && x.location === u.location)
              .length === 1
              ? 1
              : 0);
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
        if (u && !u.ready) {
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
          for (let i = 0; i < n; i++) {
            const token = spawnToken(
              s,
              p,
              e.cardName ?? "Recruit",
              e.location === "base" ? base(p) : (locationId ?? base(p)),
            );
            if (e.ready) token.ready = true;
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
      case "energy":
        if (e.condition === "spellsOnly")
          s.players[p].spellEnergy = (s.players[p].spellEnergy ?? 0) + n;
        else s.players[p].energy += n;
        break;
      case "damageAll":
        for (const unit of s.units) {
          if (
            (e.who === "all" || unit.owner === targetPlayer) &&
            (e.condition === "allBattlefields"
              ? unit.location.startsWith("field:")
              : e.condition === "combat"
                ? !!s.combat?.engaged && unit.location === s.combat.fieldId
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
              ((e.condition !== "unit" || getCard(id).type === "Unit") &&
                (e.condition !== "spell" || getCard(id).type === "Spell")),
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
        if (u) {
          event(s, "bounce", u.owner, u.cardId, u.id, u.location);
          s.units = s.units.filter((v) => v.id !== u.id);
          if (!u.token) s.players[u.owner].hand.push(u.cardId);
          for (const gear of s.gears.filter((g) => g.attachedTo === u.id))
            gear.attachedTo = undefined;
        }
        break;
      case "equip": {
        const gear = s.gears.find((g) => g.id === sourceId);
        if (gear && u && gear.owner === u.owner) {
          const old = s.units.find((v) => v.id === gear.attachedTo);
          if (old) old.gear = old.gear.filter((id) => id !== gear.id);
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
            player.deck = shuffle(s, player.discard);
            player.discard = [];
          }
          if (player.deck.length) player.discard.push(player.deck.shift()!);
        }
        break;
      case "special":
        if (e.custom === "confront") s.players[p].unitsEnterReadyTurn = s.turn;
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
          !runLaterEffect(s, p, e, {
            ...context(targetId, sourceId, locationId, sourceSnapshot),
            fromHidden: e.fromHidden,
            paidAdditionalCost: e.additionalCostPaid,
          })
        )
          throw new Error(`Unsupported special: ${e.custom}`);
        break;
      case "counter": {
        const index = s.stack.findIndex(
          (item) => item.id === targetId && item.kind === "spell",
        );
        if (index < 0 || !targets(s, p, [e], locationId).includes(targetId))
          break;
        const item = s.stack.splice(index, 1)[0];
        if (item.flowed) {
          s.players[item.player].banished.push(item.cardId);
          event(s, "banish", item.player, item.cardId);
        } else if (e.condition === "returnCounteredToHand")
          s.players[item.player].hand.push(item.cardId);
        else s.players[item.player].discard.push(item.cardId);
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
    "fromHidden" | "paidAdditionalCost" | "energySpent" | "playOrdinal"
  >,
) {
  event(s, "play", p, cardId, sourceId, locationId, details);
  if (p !== s.currentPlayer)
    for (const u of s.units.filter(
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
  if (!s.stack.length && item.kind !== "trigger") s.chainStarter = item.player;
  s.stack.push({ ...item, id: uid(s, "stack") });
  s.consecutivePasses = 0;
  s.priorityPlayer = item.player;
  log(
    s,
    `${cardName(item.cardId)}: ${item.kind === "trigger" ? "triggered ability" : "effect"} enters the chain.`,
    "play",
    item.player,
  );
  const ids =
    selectedTargets ??
    (item.effects.some((e) => e.target && e.chosenTargetId === undefined)
      ? (item.targetId ?? "").split("~")
      : []);
  const announced = selectedTargets
    ? ids.flatMap((target) => [...new Set(target.split("~"))])
    : [...new Set(ids.flatMap((target) => target.split("~")))];
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
  // Empowered trigger restrictions are checked at the event, then frozen.
  const source =
    s.units.find((unit) => unit.id === sourceId) ??
    sourceSnapshot ??
    s.gears.find((gear) => gear.id === sourceId);
  effects = effects
    .filter(
      (effect) =>
        effect.condition !== "allFourTribes" ||
        ["Bird", "Cat", "Dog", "Poro"].every((tag) =>
          s.units.some(
            (unit) =>
              unit.owner === p && getCard(unit.cardId).tags.includes(tag),
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
  if (!effects.length) return;
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
  const options = triggerActions(s, p, effects, sourceId, cardId, locationId);
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
    const effects =
      u.owner === combat.attacker
        ? getScript(u.cardId)?.onAttack
        : getScript(u.cardId)?.onDefend;
    if (effects) {
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
function drainTriggers(s: GameState) {
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
        (c.assignments[p][u.id] ?? 0) <
          Math.max(1, getMight(s, u) - u.damage + (u.preventDamage ?? 0)),
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
      return (
        total +
        Math.max(
          0,
          n -
            (u
              ? Math.max(1, getMight(s, u) - u.damage + (u.preventDamage ?? 0))
              : 0),
        )
      );
    },
    0,
  );
  for (const p of [0, 1] as const)
    for (const [id, n] of Object.entries(c.assignments[p])) {
      const u = s.units.find((u) => u.id === id);
      if (u) {
        const damageBefore = u.damage;
        const might = getMight(s, u);
        dealDamage(s, u, n);
        hits.push({
          unitId: u.id,
          cardId: u.cardId,
          owner: u.owner,
          assigned: n,
          damageBefore,
          damageAfter: u.damage,
          prevented: n - (u.damage - damageBefore),
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
  const defeatedIds = preview.units
    .filter(({ unit }) => !s.units.some((u) => u.id === unit.id))
    .map(({ unit }) => unit.id);
  const recalledIds = preview.units
    .filter(({ unit }) =>
      s.units.some((u) => u.id === unit.id && u.location === base(u.owner)),
    )
    .map(({ unit }) => unit.id);
  for (const u of s.units) u.damage = 0;
  const defenders = s.units.some(
    (u) => u.owner === c.defender && u.location === c.fieldId,
  );
  if (defenders) {
    for (const u of s.units.filter(
      (u) => u.owner === c.attacker && u.location === c.fieldId,
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
    if (!s.pendingChoice) finishResolvedCards(s);
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
  for (const u of s.units) {
    u.damage = 0;
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
    player.power = 0;
    player.buffBonus = 0;
  }
  log(
    s,
    `${s.players[p].name} ends the turn. Damage, stuns and temporary bonuses expire.`,
    "turn",
    p,
  );
  beginTurn(s, otherPlayer(p));
}
function applyActionInternal(
  state: GameState,
  action: string | GameAction,
): GameState {
  const id = typeof action === "string" ? action : action.id;
  const legal = getLegalActions(state, state.priorityPlayer).find(
    (a) => a.id === id,
  );
  if (!legal) throw new Error(`Illegal action: ${id}`);
  const s: GameState = structuredClone(state);
  const p = legal.player,
    x = s.players[p];
  if (applyLaterAction(s, legal, context())) {
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
      const cardId = zone.splice(legal.amount, 1)[0];
      if (choice.kind === "discard") {
        discardCards(s, p, [cardId]);
        choice.lastDiscardEnergy = getCard(cardId).energy ?? 0;
      } else if (choice.kind === "retrieve") x.hand.push(cardId);
      else x.deck.push(cardId);
      choice.remaining--;
    } else choice.remaining = 0;
    const zone = choice.kind === "discard" ? x.hand : x.discard;
    if (!choice.remaining || !zone.length) {
      choice.afterEffects = (choice.afterEffects ?? []).map((e) =>
        e.condition === "discardEnergy"
          ? { ...e, amount: choice.lastDiscardEnergy ?? 0 }
          : e,
      );
      resumeChoice(s);
    }
    return s;
  }
  if (id.startsWith("choose-predict:")) {
    if (id.endsWith("recycle") && x.deck.length) x.deck.push(x.deck.shift()!);
    resumeChoice(s);
    return s;
  }
  if (id.startsWith("choose-unit:")) {
    const choice = s.pendingChoice!;
    const u = s.units.find((u) => u.id === legal.targetId);
    if (u) {
      if (choice.kind === "sacrifice") killUnits(s, [u.id]);
      else u.buff--;
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
    pay(s, p, 0, 0, [], 1);
    const cardId = x.hand.splice(Number(legal.sourceId!.split(":")[1]), 1)[0];
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
    pay(
      s,
      p,
      equipEnergy(s, legal.cardId!, legal.targetId!),
      sc.equipCost ?? 0,
      legal.cardId === "unl-188-219" ? [] : getCard(legal.cardId!).domains,
    );
    pushStack(s, {
      player: p,
      cardId: legal.cardId!,
      sourceId: legal.sourceId,
      targetId: legal.targetId,
      effects: [{ type: "equip", target: "friendlyUnit" }],
      kind: "ability",
    });
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
    if (choice.effect?.ready) token.ready = true;
    if (choice.effect?.condition === "realCard") {
      x.cardsPlayedThisTurn++;
      token.token = false;
      const at = x.discard.indexOf(token.cardId);
      if (at >= 0) x.discard.splice(at, 1);
      cardPlayed(s, p, token.cardId);
      event(s, "cardFinalized", p, token.cardId, token.id, token.location);
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
    const gear = s.gears.find((g) => g.id === legal.sourceId)!;
    s.gears = s.gears.filter((g) => g.id !== gear.id);
    x.power = (x.power ?? 0) + 1;
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
      ...s.units.filter((u) => u.owner === p),
      ...s.gears
        .filter((g) => g.owner === p)
        .map((g) => ({ ...g, location: base(p) })),
    ]) {
      const effects = getScript(source.cardId)?.onEnd;
      if (effects)
        trigger(s, p, source.cardId, source.id, effects, source.location);
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
    const c = getCard(legal.cardId!),
      script = getScript(c.id)!;
    const cost = costFor(s, p, c, legal.targetId);
    const accelerated = id.includes("|accelerate");
    const hidden = (s.hidden ?? []).find(
      (h) => legal.sourceId === `hidden:${h.id}`,
    );
    if (hidden) alternateCost(s, p, cost, 0, 0);
    const flowed = legal.sourceId?.startsWith("trash:");
    if (flowed && script.flow)
      alternateCost(s, p, cost, script.flow.energy, script.flow.power);
    if (legal.cardIndices?.length && c.id === "ogn-002-298")
      cost.energy = Math.max(0, cost.energy - 2);
    const extra = legal.additionalCostPaid
      ? script.additionalCost
      : legal.repeated
        ? script.repeat
        : undefined;
    cost.energy += extra?.energy ?? 0;
    if (c.type === "Spell") {
      const remainingSpellEnergy = Math.min(
        cost.energy,
        Math.max(0, (x.spellEnergy ?? 0) - cost.spellEnergy),
      );
      cost.energy -= remainingSpellEnergy;
      cost.spellEnergy += remainingSpellEnergy;
    }
    if (legal.additionalCostPaid) cost.power += extra?.power ?? 0;
    else if (legal.repeated)
      cost.extraPower +=
        (extra?.domain ? 0 : (extra?.power ?? 0)) +
        targetTax(s, p, legal.repeatedTargetId);
    pay(
      s,
      p,
      cost.energy + (accelerated ? 1 : 0),
      cost.power + (accelerated ? 1 : 0),
      flowed ? (script.flow?.domain ? [script.flow.domain] : []) : c.domains,
      cost.extraPower,
      legal.repeated && extra?.domain
        ? [{ power: extra.power ?? 0, domains: [extra.domain] }]
        : [],
    );
    x.spellEnergy = Math.max(0, (x.spellEnergy ?? 0) - cost.spellEnergy);
    if (c.id === "ogn-208-298" && legal.targetId)
      killUnits(s, [legal.targetId]);
    if (c.id === "ogn-048-298" && id.includes("|exhaust:")) {
      const unit = s.units.find((u) => u.id === legal.targetId);
      if (unit) unit.ready = false;
    }
    const discarded = legal.cardIndices?.map((i) => x.hand[i]) ?? [];
    if (legal.sourceId === "champion") x.championAvailable = false;
    else if (hidden) s.hidden = s.hidden?.filter((h) => h.id !== hidden.id);
    else if (flowed) x.discard.splice(Number(legal.sourceId!.split(":")[1]), 1);
    else {
      const playedIndex = Number(legal.sourceId!.split(":")[1]);
      x.hand = x.hand.filter(
        (_, i) => i !== playedIndex && !legal.cardIndices?.includes(i),
      );
    }
    if (legal.cardIndices?.length && !legal.sourceId?.startsWith("hand:"))
      x.hand = x.hand.filter((_, i) => !legal.cardIndices?.includes(i));
    if (discarded.length) discardCards(s, p, discarded);
    x.cardsPlayedThisTurn++;
    const playOrdinal = x.cardsPlayedThisTurn;
    log(
      s,
      `${x.name} plays ${cardName(c.id)}${targetLabel(s, legal.targetId)}.`,
      "play",
      p,
    );
    s.consecutivePasses = 0;
    if (c.type === "Unit") {
      const u: Unit = {
        id: uid(s, "u"),
        cardId: c.id,
        owner: p,
        location: legal.locationId!,
        ready:
          accelerated ||
          !!script.keywords?.includes("Enters ready") ||
          s.players[p].unitsEnterReadyTurn === s.turn ||
          s.units.some((u) => u.owner === p && u.cardId === "ogn-011-298"),
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
          annotateEffects(
            script.onPlay,
            Boolean(hidden),
            Boolean(legal.additionalCostPaid),
          ),
          u.location,
        );
    } else if (c.type === "Gear") {
      const gear = {
        id: uid(s, "g"),
        cardId: c.id,
        owner: p,
        ready: true,
        temporary: script.keywords?.includes("Temporary") || undefined,
      };
      s.gears.push(gear);
      if (script.onPlay) trigger(s, p, c.id, gear.id, script.onPlay, base(p));
    } else if (c.type === "Spell") {
      pushStack(
        s,
        {
          player: p,
          cardId: c.id,
          targetId: legal.targetId,
          effects: annotateEffects(
            c.id === "ogn-048-298" && id.includes("|exhaust:")
              ? [{ type: "draw", amount: 2 }]
              : legal.repeated
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
          ),
          locationId: legal.locationId ?? hidden?.location,
          kind: "spell",
          ...(flowed ? { flowed: true } : {}),
          fromHidden: Boolean(hidden),
          additionalCostPaid: legal.additionalCostPaid,
          playOrdinal,
          energySpent: cost.energy + cost.spellEnergy + (accelerated ? 1 : 0),
        },
        legal.repeated
          ? [legal.targetId, legal.repeatedTargetId].flatMap((target) =>
              target ? [target] : [],
            )
          : undefined,
      );
    }
    const entered =
      c.type === "Unit"
        ? s.units.filter((u) => u.owner === p && u.cardId === c.id).at(-1)
        : c.type === "Gear"
          ? s.gears.filter((g) => g.owner === p && g.cardId === c.id).at(-1)
          : undefined;
    event(
      s,
      "cardFinalized",
      p,
      c.id,
      entered?.id,
      c.type === "Unit" ? legal.locationId : base(p),
      {
        playOrdinal,
        fromHidden: Boolean(hidden),
        paidAdditionalCost: Boolean(legal.additionalCostPaid),
        energySpent: cost.energy + cost.spellEnergy + (accelerated ? 1 : 0),
      },
    );
    if (c.type !== "Spell")
      cardPlayed(
        s,
        p,
        c.id,
        entered?.id,
        c.type === "Unit" ? legal.locationId : base(p),
        {
          playOrdinal,
          fromHidden: Boolean(hidden),
          paidAdditionalCost: Boolean(legal.additionalCostPaid),
          energySpent: cost.energy + cost.spellEnergy + (accelerated ? 1 : 0),
        },
      );
    return s;
  }
  if (legal.category === "ability") {
    const source = legal.sourceId!;
    const index = Number(id.split("|")[2]);
    const ability = getAbilities(s, p, legal.cardId!)[index];
    pay(
      s,
      p,
      ability.energy ?? 0,
      ability.power ?? 0,
      ability.domain ? [ability.domain] : [],
      targetTax(s, p, legal.targetId),
    );
    const unit = s.units.find((u) => u.id === source);
    const object = unit ?? s.gears.find((g) => g.id === source);
    if (ability.spendBuff && unit) unit.buff--;
    if (ability.oncePerTurn && object)
      (object.usedAbilities ??= []).push(String(index));
    if (ability.recycleCost) {
      const selected = new Set(legal.cardIndices ?? []);
      const recycled = x.discard.filter((_, i) => selected.has(i));
      x.discard = x.discard.filter((_, i) => !selected.has(i));
      x.deck.push(...shuffle(s, recycled));
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
    if (ability.effects.every((e) => e.type === "energy")) {
      runEffects(s, p, ability.effects, legal.targetId, source, unit?.location);
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
    hidden: clone.hidden?.map((h) =>
      h.owner === viewer ? h : { ...h, cardId: "hidden" },
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
  return state;
}

/** Each returned event is inert until the interface advances its Proceed gate. */
export function applyActionStepped(
  state: GameState,
  action: string | GameAction,
): { state: GameState; frames: StepFrame[] } {
  const legal = getLegalActions(state, state.priorityPlayer).find(
    (a) => a.id === (typeof action === "string" ? action : action.id),
  );
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
