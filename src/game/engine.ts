import { cards, getCard, type Card } from "../data/cards";
import { decks } from "../data/decks";
import { getScript } from "./scripts";
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
}
let stepFrames: StepFrame[] | null = null;
const cardName = (id: string) => getCard(id).name.replace(" (Starter)", "");
function log(
  s: GameState,
  text: string,
  kind: GameState["log"][number]["kind"] = "info",
  player?: PlayerId,
) {
  s.log.push({ id: s.nextId++, turn: s.turn, text, kind, player });
  if (s.log.length > 250) s.log.shift();
  if (stepFrames) stepFrames.push({ state: structuredClone(s), label: text });
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
  let value = (c.might ?? 0) + u.buff + u.temporaryMight;
  for (const id of u.gear) {
    const g = s.gears.find((g) => g.id === id);
    if (g) value += getScript(g.cardId)?.gearMight ?? 0;
  }
  if (s.combat?.fieldId === u.location && (s.combat.engaged ?? true)) {
    value +=
      u.owner === s.combat.attacker
        ? (sc?.assault ?? 0) + (u.temporaryAssault ?? 0)
        : (sc?.shield ?? 0);
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
  return Math.max(0, value);
}
export function getKeywords(s: GameState, u: Unit) {
  const result = [...(getScript(u.cardId)?.keywords ?? [])];
  if (u.cardId === "ogn-125-298" && u.buff) result.push("Ganking");
  if (s.fields.find((f) => f.id === u.location)?.cardId === "ogn-297-298")
    result.push("Ganking");
  return result;
}
export function getResources(s: GameState, p: PlayerId) {
  const x = s.players[p];
  return {
    energy: x.energy + x.runes.filter((r) => r.ready).length,
    power: x.runes.length,
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
  const power = c.power ?? 0;
  if (c.id === "ogn-012-298" && s.players[p].cardsPlayedThisTurn > 0)
    energy -= 2;
  const extraPower = (targetId ?? "").split("~").reduce((n, id) => {
    const target = s.units.find((u) => u.id === id);
    return (
      n +
      (target && target.owner !== p
        ? (getScript(target.cardId)?.deflect ?? 0)
        : 0)
    );
  }, 0);
  return { energy, power, extraPower };
}
function canPay(
  s: GameState,
  p: PlayerId,
  energy: number,
  power: number,
  domains: string[] = [],
  anyPower = 0,
) {
  const x = s.players[p];
  return (
    x.energy + x.runes.filter((r) => r.ready).length >= energy &&
    x.runes.filter((r) => !domains.length || domains.includes(r.domain))
      .length >= power &&
    x.runes.length >= power + anyPower
  );
}
function pay(
  s: GameState,
  p: PlayerId,
  energy: number,
  power: number,
  domains: string[] = [],
  anyPower = 0,
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
  if (x.hand.length > before)
    log(s, `${x.name} draws ${x.hand.length - before} card(s).`, "info", p);
}
function createPlayer(id: PlayerId, deckId: string): PlayerState {
  const d = decks.find((x) => x.id === deckId) ?? decks[id % decks.length];
  const main = d.main.flatMap((x) => Array(x.count).fill(x.cardId) as string[]);
  return {
    id,
    name: id === 0 ? "You" : "Nexus AI",
    deckId: d.id,
    legendId: d.legendId,
    championId: d.championId,
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
      createPlayer(0, options.playerDeckId ?? decks[0].id),
      createPlayer(1, options.botDeckId ?? decks[1].id),
    ],
    fields: [
      { id: "field:0", cardId: "ogn-275-298", controller: null },
      { id: "field:1", cardId: "ogn-280-298", controller: null },
    ],
    units: [],
    gears: [],
    stack: [],
    consecutivePasses: 0,
    combat: null,
    pendingMove: null,
    pendingChoice: null,
    winner: null,
    log: [],
    nextId: 1,
  };
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
    if (effects) runEffects(s, p, effects, undefined, u.id, field);
  }
  if (hold) {
    const f = s.fields.find((f) => f.id === field)!;
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
    x.energy = 0;
  }
  const x = s.players[p];
  for (const r of x.runes) r.ready = true;
  for (const u of s.units.filter((u) => u.owner === p)) u.ready = true;
  for (const g of s.gears.filter((g) => g.owner === p)) g.ready = true;
  log(s, `Turn ${s.turn} — ${x.name}: ready units, gear and runes.`, "turn", p);
  for (const f of s.fields) {
    if (
      f.controller === p &&
      s.units.some((u) => u.owner === p && u.location === f.id)
    ) {
      scoreField(s, p, f.id, true);
      if (s.winner !== null) return;
    }
  }
  if (s.stack.length) {
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
  switch (filter) {
    case "anyUnit":
      return true;
    case "enemyUnit":
      return !own;
    case "friendlyUnit":
      return own;
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
  if (e.target === "battlefield") return s.fields.map((f) => f.id);
  if (e.target === "duel")
    return s.units
      .filter((u) => u.owner === p)
      .flatMap((a) =>
        s.units.filter((u) => u.owner !== p).map((b) => a.id + "~" + b.id),
      );
  if (e.target === "enemyGear" || e.target === "anyGear")
    return s.gears
      .filter((g) => e.target === "anyGear" || g.owner !== p)
      .map((g) => g.id);
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
    s.units.find((u) => u.id === id) ?? s.gears.find((g) => g.id === id);
  return x ? ` → ${cardName(x.cardId)}` : "";
}
function canMove(s: GameState, u: Unit, to: LocationId) {
  if (!u.ready || u.location === to || to === base(otherPlayer(u.owner)))
    return false;
  if (to === base(u.owner)) return u.location.startsWith("field:");
  if (u.location === base(u.owner)) return true;
  return getKeywords(s, u).includes("Ganking");
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
    if (choice.kind === "token") {
      for (const locationId of [
        base(p),
        ...s.fields.filter((f) => f.controller === p).map((f) => f.id),
      ])
        add({
          id: `choose-token:${locationId}`,
          label: `Place Recruit at ${locationName(locationId)} (${choice.remaining} remaining)`,
          category: "ability",
          locationId,
        });
    } else {
      for (const targetId of triggerTargets(
        s,
        p,
        choice.effects ?? [],
        choice.sourceId ?? "",
        choice.cardId ?? "",
        s.units.find((u) => u.id === choice.sourceId)?.location ??
          s.combat?.fieldId,
      ))
        add({
          id: `choose-trigger:${targetId ?? ""}`,
          label: `Choose target${targetLabel(s, targetId)}`,
          category: "ability",
          targetId,
        });
      if (!out.length)
        add({
          id: "choose-trigger:",
          label: "Resolve ability (no target)",
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
    if (move.unitIds.length)
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
        (c.assignments[p][u.id] ?? 0) < Math.max(1, getMight(s, u) - u.damage),
    );
    const remainingTargets = enemies.length;
    const tanks = enemies.filter((u) => getKeywords(s, u).includes("Tank"));
    if (tanks.length) enemies = tanks;
    for (const u of enemies) {
      const amount =
        remainingTargets === 1
          ? c.remaining[p]
          : Math.min(
              c.remaining[p],
              Math.max(
                1,
                getMight(s, u) - u.damage - (c.assignments[p][u.id] ?? 0),
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
  const playable = [
    ...x.hand.map((id, index) => ({ id, source: `hand:${index}` })),
    ...(x.championAvailable ? [{ id: x.championId, source: "champion" }] : []),
  ];
  for (const entry of playable) {
    const c = getCard(entry.id),
      script = getScript(c.id);
    if (!script) continue;
    if (inChain && !script.reaction) continue;
    if (inShowdown && !inChain && !script.action && !script.reaction) continue;
    if (!canMain && !inShowdown && !inChain) continue;
    const effects = c.type === "Spell" ? (script.spell ?? []) : [];
    for (const targetId of targets(s, p, effects).length
      ? targets(s, p, effects)
      : c.type === "Unit"
        ? [undefined]
        : []) {
      const cost = costFor(s, p, c, targetId);
      if (!canPay(s, p, cost.energy, cost.power, c.domains, cost.extraPower))
        continue;
      const locations: Array<LocationId | undefined> =
        c.type === "Unit"
          ? [
              base(p),
              ...s.fields
                .filter(
                  (f) =>
                    f.controller === p ||
                    (c.id === "ogn-176-298" && f.controller === null),
                )
                .map((f) => f.id),
            ]
          : [undefined];
      for (const locationId of locations) {
        add({
          id: `play|${entry.source}|${locationId ?? ""}|${targetId ?? ""}`,
          label: `Play ${cardName(c.id)}${locationId ? ` at ${locationName(locationId)}` : ""}${targetLabel(s, targetId)}`,
          category: "play",
          sourceId: entry.source,
          cardId: c.id,
          targetId,
          locationId,
          detail: `${cost.energy} energy · ${cost.power + cost.extraPower} power`,
        });
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
    { id: "legend", cardId: x.legendId, ready: x.legendUsedTurn !== s.turn },
    ...s.units
      .filter((u) => u.owner === p)
      .map((u) => ({ id: u.id, cardId: u.cardId, ready: u.ready })),
    ...s.gears
      .filter((g) => g.owner === p)
      .map((g) => ({ id: g.id, cardId: g.cardId, ready: g.ready })),
  ];
  for (const source of sources) {
    const script = getScript(source.cardId);
    for (const [index, a] of (script?.abilities ?? []).entries()) {
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
      if (!canPay(s, p, a.energy ?? 0, a.power ?? 0)) continue;
      for (const targetId of targets(s, p, a.effects, s.combat?.fieldId))
        add({
          id: `ability|${source.id}|${index}|${targetId ?? ""}`,
          label: `${cardName(source.cardId)}: ${a.label}${targetLabel(s, targetId)}`,
          category: "ability",
          sourceId: source.id,
          cardId: source.cardId,
          targetId,
        });
    }
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
export function locationName(id: LocationId) {
  return id.startsWith("base:")
    ? id === "base:0"
      ? "your base"
      : "enemy base"
    : id === "field:0"
      ? "Altar to Unity"
      : "Grove of the God-Willow";
}
function spawnToken(
  s: GameState,
  p: PlayerId,
  name: string,
  location: LocationId,
) {
  const c =
    name === "Recruit"
      ? getCard("ogn-271-298")
      : cards.find((c) => c.name === name && c.type === "Unit" && !c.variant);
  if (!c) throw new Error(`Missing token ${name}`);
  const u: Unit = {
    id: uid(s, "u"),
    cardId: c.id,
    owner: p,
    location,
    ready: false,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    token: true,
    summonedTurn: s.turn,
  };
  s.units.push(u);
  log(
    s,
    `${s.players[p].name} plays a Recruit at ${locationName(location)}.`,
    "play",
    p,
  );
  unitPlayed(s, p, u);
  return u;
}
function unitPlayed(s: GameState, p: PlayerId, unit: Unit) {
  for (const u of s.units)
    if (u.owner === p && u.id !== unit.id && u.cardId === "ogn-139-298")
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "buff", target: "friendlyUnit" }],
        targetId: u.id,
        kind: "trigger",
      });
}
function bonusDamage(s: GameState, p: PlayerId) {
  return s.units.filter((u) => u.owner === p && u.cardId === "ogs-001-024")
    .length;
}
function killUnits(s: GameState, ids: string[]) {
  const dead = s.units.filter((u) => ids.includes(u.id));
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
      pushStack(s, {
        player: u.owner,
        cardId: u.cardId,
        sourceId: u.id,
        effects,
        kind: "trigger",
        locationId: u.location,
      });
  }
  refreshControl(s);
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
function targetTax(s: GameState, p: PlayerId, id?: string) {
  return (id ?? "").split("~").reduce((n, id) => {
    const u = s.units.find((u) => u.id === id);
    return n + (u && u.owner !== p ? (getScript(u.cardId)?.deflect ?? 0) : 0);
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
      canPay(s, p, 0, 0, [], targetTax(s, p, id)),
  );
}
function runEffects(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
  locationId?: LocationId,
) {
  for (const e of effects) {
    const candidate = s.units.find((u) => u.id === targetId);
    const u =
      candidate &&
      (!e.target || matches(s, candidate, p, e.target, locationId, e.maxMight))
        ? candidate
        : undefined;
    const n = e.amount ?? 1;
    const targetPlayer = e.who === "opponent" ? otherPlayer(p) : p;
    if (e.target && !["battlefield", "duel"].includes(e.target) && !u) {
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
        if (u) {
          u.damage += n + bonusDamage(s, p);
          const lethal = u.damage >= getMight(s, u);
          if (lethal && e.condition === "drawOnKill") {
            killUnits(s, [u.id]);
            draw(s, p, 1);
          }
        }
        break;
      case "duel": {
        const [first, second] = (targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        if (first && second) {
          const a = getMight(s, first),
            b = getMight(s, second);
          first.damage += b;
          second.damage += a;
        }
        break;
      }
      case "kill":
        if (u) killUnits(s, [u.id]);
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
        if (u) u.buff = 1;
        break;
      case "buffAll":
        s.units.forEach((u) => {
          if (u.owner === p) u.buff = 1;
        });
        break;
      case "might":
        if (u)
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
        if (u) u.ready = true;
        break;
      case "readyRunes": {
        let remaining = n;
        for (const rune of s.players[p].runes)
          if (!rune.ready && remaining-- > 0) rune.ready = true;
        break;
      }
      case "exhaust":
        if (u) u.ready = false;
        break;
      case "stun":
        if (u) u.stunned = true;
        break;
      case "recall":
        if (u) {
          u.location = base(u.owner);
          u.ready = false;
        }
        break;
      case "moveTarget":
        if (u) u.location = base(u.owner);
        break;
      case "token":
        if (e.location === "here") {
          for (let i = 0; i < n; i++)
            spawnToken(s, p, e.cardName ?? "Recruit", locationId ?? base(p));
        } else {
          s.pendingChoice = {
            player: p,
            kind: "token",
            remaining: n,
            sourceId,
            returnPhase: s.phase,
            returnPriority: s.priorityPlayer,
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
        s.players[p].energy += n;
        break;
      case "damageAll":
        for (const unit of s.units) {
          if (
            (e.who === "all" || unit.owner === targetPlayer) &&
            (e.condition === "allBattlefields"
              ? unit.location.startsWith("field:")
              : unit.location === targetId)
          ) {
            unit.damage += n + bonusDamage(s, p);
          }
        }
        break;
      case "discard":
        for (let i = 0; i < n && s.players[targetPlayer].hand.length; i++)
          s.players[targetPlayer].discard.push(
            s.players[targetPlayer].hand.pop()!,
          );
        break;
      case "counter":
        s.stack.pop();
        break;
      default:
        throw new Error(`Unimplemented effect operation: ${e.type}`);
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
function spellPlayed(s: GameState, p: PlayerId, cardId: string) {
  const card = getCard(cardId);
  for (const u of s.units.filter((u) => u.owner === p)) {
    if (u.cardId === "ogn-103-298")
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "might", amount: 1, target: "friendlyUnit" }],
        targetId: u.id,
        kind: "trigger",
      });
    if (u.cardId === "ogs-006-024" && (card.energy ?? 0) >= 5)
      pushStack(s, {
        player: p,
        cardId: u.cardId,
        sourceId: u.id,
        effects: [{ type: "might", amount: 3, target: "friendlyUnit" }],
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
function pushStack(s: GameState, item: Omit<StackItem, "id">) {
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
}
function trigger(
  s: GameState,
  p: PlayerId,
  cardId: string,
  sourceId: string,
  effects: Effect[],
  locationId?: LocationId,
) {
  const options = triggerTargets(
    s,
    p,
    effects,
    sourceId,
    cardId,
    locationId,
  ).filter(
    (target) =>
      target !== sourceId || !["ogn-132-298", "ogn-136-298"].includes(cardId),
  );
  if (!options.length) return;
  if (options.length === 1) {
    pay(s, p, 0, 0, [], targetTax(s, p, options[0]));
    pushStack(s, {
      player: p,
      cardId,
      sourceId,
      effects,
      targetId: options[0],
      locationId,
      kind: "trigger",
    });
    return;
  }
  s.pendingChoice = {
    player: p,
    kind: "trigger",
    remaining: 1,
    sourceId,
    cardId,
    effects,
    returnPhase: s.phase,
    returnPriority: s.priorityPlayer,
  };
  s.phase = "choice";
  s.priorityPlayer = p;
}
function openShowdown(s: GameState, p: PlayerId, field: LocationId) {
  s.phase = "showdown";
  s.focusPlayer = p;
  s.priorityPlayer = p;
  s.consecutivePasses = 0;
  s.combat = {
    fieldId: field,
    attacker: p,
    defender: otherPlayer(p),
    stage: "priority",
    engaged: s.units.some((u) => u.owner !== p && u.location === field),
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
  );
  const attackers = s.units.filter(
    (u) => u.owner === p && u.location === field,
  );
  for (const u of s.combat.engaged ? attackers : []) {
    const effects = getScript(u.cardId)?.onAttack;
    if (effects) {
      const opts = targets(s, p, effects, field);
      if (opts.length === 1)
        pushStack(s, {
          player: p,
          cardId: u.cardId,
          sourceId: u.id,
          effects,
          targetId: opts[0],
          locationId: field,
          kind: "trigger",
        });
      else if (opts.length > 1) {
        // Multiple Corsairs trigger in the same order, each gets its own target choice.
        s.pendingTriggers ??= [];
        s.pendingTriggers.push({
          player: p,
          cardId: u.cardId,
          sourceId: u.id,
          effects,
          locationId: field,
        });
      }
    }
  }
  drainTriggers(s);
}
function drainTriggers(s: GameState) {
  if (s.pendingChoice || !s.pendingTriggers?.length) return;
  const next = s.pendingTriggers.shift()!;
  trigger(
    s,
    next.player,
    next.cardId,
    next.sourceId,
    next.effects,
    next.locationId,
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
        .filter((u) => u.owner === p && u.location === c.fieldId && !u.stunned)
        .reduce((sum, u) => sum + getMight(s, u), 0);
      c.remaining[p] = c.total[p];
    }
    c.assigningPlayer = c.attacker;
    s.priorityPlayer = c.attacker;
    s.phase = "damage";
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
        (c.assignments[p][u.id] ?? 0) < Math.max(1, getMight(s, u) - u.damage),
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
  for (const p of [0, 1] as const)
    for (const [id, n] of Object.entries(c.assignments[p])) {
      const u = s.units.find((u) => u.id === id);
      if (u) u.damage += n;
    }
  log(
    s,
    "Both sides deal their assigned combat damage simultaneously.",
    "combat",
  );
  checkDeaths(s);
  for (const u of s.units) u.damage = 0;
  const defenders = s.units.some(
    (u) => u.owner === c.defender && u.location === c.fieldId,
  );
  if (defenders) {
    for (const u of s.units.filter(
      (u) => u.owner === c.attacker && u.location === c.fieldId,
    )) {
      u.location = base(u.owner);
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
  if (s.stack.length) {
    s.pendingCombatFinish = true;
    s.phase = "showdown";
    s.priorityPlayer = s.stack[s.stack.length - 1].player;
    s.consecutivePasses = 0;
  } else finishCombat(s);
}
function finishCombat(s: GameState) {
  delete s.pendingCombatFinish;
  const c = s.combat!;
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
  s.combat = null;
  if (s.winner !== null) return;
  s.phase = "main";
  s.priorityPlayer = s.currentPlayer;
  s.focusPlayer = s.currentPlayer;
  s.consecutivePasses = 0;
  if (s.stack.length) s.priorityPlayer = s.stack[s.stack.length - 1].player;
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
    log(s, `${cardName(item.cardId)} resolves.`, "play", item.player);
    runEffects(
      s,
      item.player,
      item.effects,
      item.targetId,
      item.sourceId,
      item.locationId,
    );
    if (item.kind === "spell") {
      s.players[item.player].discard.push(item.cardId);
      spellPlayed(s, item.player, item.cardId);
    }
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
    if (!s.stack.length && s.pendingTurnStart !== undefined) {
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
  }
  for (const player of s.players) player.energy = 0;
  log(
    s,
    `${s.players[p].name} ends the turn. Damage, stuns and temporary bonuses expire.`,
    "turn",
    p,
  );
  beginTurn(s, otherPlayer(p));
}
export function applyAction(
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
  if (id.startsWith("choose-token:")) {
    const choice = s.pendingChoice!;
    spawnToken(s, p, "Recruit", legal.locationId!);
    choice.remaining--;
    if (!choice.remaining) {
      s.phase = choice.returnPhase;
      s.priorityPlayer = choice.returnPriority;
      s.pendingChoice = null;
      drainTriggers(s);
    }
    return s;
  }
  if (id.startsWith("choose-trigger:")) {
    const choice = s.pendingChoice!;
    s.pendingChoice = null;
    s.phase = choice.returnPhase;
    s.priorityPlayer = choice.returnPriority;
    if (legal.targetId || !choice.effects?.some((e) => e.target)) {
      pay(s, p, 0, 0, [], targetTax(s, p, legal.targetId));
      pushStack(s, {
        player: p,
        cardId: choice.cardId!,
        sourceId: choice.sourceId,
        effects: choice.effects ?? [],
        targetId: legal.targetId,
        locationId:
          s.units.find((u) => u.id === choice.sourceId)?.location ??
          s.combat?.fieldId,
        kind: "trigger",
      });
    }
    drainTriggers(s);
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
    for (const u of s.units.filter((u) => move.unitIds.includes(u.id))) {
      u.ready = false;
      u.location = move.to;
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
    );
    advanceAssignment(s);
    return s;
  }
  if (id === "damage-done") {
    s.combat!.remaining[p] = 0;
    advanceAssignment(s);
    return s;
  }
  if (id === "pass") {
    passPriority(s);
    return s;
  }
  if (id === "end-turn") {
    if (x.legendId === "ogs-017-024") {
      s.pendingEndTurn = p;
      pushStack(s, {
        player: p,
        cardId: x.legendId,
        effects: [{ type: "readyRunes", amount: 2 }],
        kind: "trigger",
      });
    } else finishEndTurn(s, p);
    return s;
  }
  if (legal.category === "play") {
    const c = getCard(legal.cardId!),
      script = getScript(c.id)!;
    const cost = costFor(s, p, c, legal.targetId);
    const accelerated = id.endsWith("|accelerate");
    pay(
      s,
      p,
      cost.energy + (accelerated ? 1 : 0),
      cost.power + (accelerated ? 1 : 0),
      c.domains,
      cost.extraPower,
    );
    if (legal.sourceId === "champion") x.championAvailable = false;
    else x.hand.splice(Number(legal.sourceId!.split(":")[1]), 1);
    x.cardsPlayedThisTurn++;
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
        ready: accelerated || !!script.keywords?.includes("Enters ready"),
        damage: 0,
        buff: 0,
        temporaryMight: 0,
        temporaryAssault: 0,
        stunned: false,
        gear: [],
        summonedTurn: s.turn,
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
      if (script.onPlay) trigger(s, p, c.id, u.id, script.onPlay, u.location);
    } else if (c.type === "Spell") {
      pushStack(s, {
        player: p,
        cardId: c.id,
        targetId: legal.targetId,
        effects: script.spell ?? [],
        kind: "spell",
      });
    }
    return s;
  }
  if (legal.category === "ability") {
    const source = legal.sourceId!;
    const index = Number(id.split("|")[2]);
    const ability = getScript(legal.cardId!)!.abilities![index];
    pay(s, p, ability.energy ?? 0, ability.power ?? 0);
    if (ability.exhaust) {
      if (source === "legend") x.legendUsedTurn = s.turn;
      else {
        const target =
          s.units.find((u) => u.id === source) ??
          s.gears.find((g) => g.id === source);
        if (target) target.ready = false;
      }
    }
    pushStack(s, {
      player: p,
      cardId: legal.cardId!,
      sourceId: source,
      targetId: legal.targetId,
      effects: ability.effects,
      kind: "ability",
    });
    return s;
  }
  throw new Error(`Action not implemented: ${id}`);
}
export function getGameView(s: GameState, viewer: PlayerId): PublicGameView {
  const clone = structuredClone(s);
  return {
    ...clone,
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
