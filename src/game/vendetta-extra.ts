import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { isCardType } from "../data/cards";
import { burnToTrash } from "./trash";
import { cards, getCard } from "../data/cards";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  Gear,
  PlayerId,
  Unit,
} from "./types";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";

const plain: CardScript = { implemented: true };
const fx = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `ven-extra:${custom}`,
  ...extra,
});
const self = (type: Effect["type"], amount?: number): Effect => ({
  type,
  condition: "self",
  ...(amount === undefined ? {} : { amount }),
});
const spell = (
  effects: Effect[],
  timing?: "action" | "reaction",
): CardScript => ({
  ...plain,
  spell: effects,
  ...(timing ? { [timing]: true } : {}),
});

const faces: Record<number, CardScript> = {
  1: plain,
  3: {
    ...spell([{ type: "kill", target: "anyGear" }]),
    flow: { energy: 4, power: 1, domain: "Fury" },
  },
  5: plain,
  6: plain,
  9: { ...plain, onAttack: [fx("reaper")] },
  10: spell([fx("curse", { target: "unitAtBattlefield" })], "action"),
  16: { ...plain, accelerating: true, onMove: [fx("eclipse")] },
  18: plain,
  19: { ...plain, accelerating: true, onAttack: [fx("rage-fueled")] },
  32: plain,
  37: plain,
  46: {
    ...plain,
    deflect: 2,
    keywords: ["Deflect 2"],
    onConquer: [{ type: "score", amount: 1, condition: "sourceEmpowered" }],
  },
  50: plain,
  54: plain,
  57: {
    ...plain,
    onMove: [{ type: "draw", amount: 1, condition: "sourceEmpowered" }],
  },
  59: spell(
    [{ type: "damage", amount: 4, target: "unitAtBattlefield" }],
    "action",
  ),
  62: {
    ...plain,
    abilities: [
      {
        label: "Empower another gear",
        exhaust: true,
        effects: [
          fx("empower-target", { target: "anyGear", excludeSource: true }),
        ],
      },
    ],
  },
  63: plain,
  64: { ...plain, deflect: 1, keywords: ["Deflect"] },
  70: plain,
  71: plain,
  72: spell([fx("roar", { target: "anyUnit" })], "action"),
  74: plain,
  75: plain,
  76: plain,
  77: {
    ...plain,
    abilities: [
      {
        label: "Give a unit +2 Might (+4 while Empowered)",
        exhaust: true,
        effects: [fx("tools", { target: "anyUnit" })],
      },
    ],
  },
  78: {
    ...plain,
    onDeath: [
      {
        type: "channel",
        amount: 2,
        ready: false,
        condition: "sourceEmpowered",
      },
    ],
  },
  87: plain,
  92: {
    ...plain,
    abilities: [
      {
        label: "Give me +1 Might this turn",
        energy: 1,
        effects: [self("might", 1)],
      },
    ],
  },
  94: {
    ...plain,
    onDiscard: [fx("mask", { target: "friendlyUnit", optional: true })],
  },
  97: { ...plain, hidden: true },
  108: { ...plain, onPlay: [fx("relic")] },
  120: {
    ...plain,
    additionalCost: { power: 1, domain: "Order" },
    onPlay: [
      {
        type: "stun",
        target: "enemyUnitAtBattlefield",
        condition: "paidAdditionalCost",
      },
    ],
  },
  121: plain,
  122: plain,
  124: plain,
  130: plain,
  146: spell([fx("siphon", { target: "unitAtBattlefield" })]),
  156: {
    ...spell([fx("lightning")]),
    flow: { energy: 2, power: 1, domain: "" },
  },
  162: { ...plain, onConquer: [fx("sands")] },
};
// Match full provider card codes, not collector numbers (which collide with runes/showcases).
const codes = new Map(
  Object.keys(faces).map((n) => [`ven-${n.padStart(3, "0")}-166`, Number(n)]),
);
const exactIds = new Map<string, number>();
for (const c of cards) {
  const n = codes.get(c.riftboundId);
  if (n !== undefined) exactIds.set(c.id, n);
}
export const vendettaExtraScripts: Record<string, CardScript> =
  Object.fromEntries([...exactIds].map(([id, n]) => [id, faces[n]]));
const number = (id: string) => exactIds.get(id) ?? -1;
const is = (object: { cardId: string }, n: number) =>
  number(object.cardId) === n;
type EmpoweredGear = Gear & { empowered?: boolean };
type State = GameState & {
  vendettaExtra?: {
    nasus: Record<string, number>;
    bruteAbove: Record<string, boolean>;
    siphons: { unitId: string; player: PlayerId; turn: number }[];
  };
};
const state = (s: GameState) =>
  ((s as State).vendettaExtra ??= {
    nasus: {},
    bruteAbove: {},
    siphons: [],
  });
const empowered = (s: GameState, id?: string) =>
  Boolean(
    s.units.find((u) => u.id === id)?.empowered ??
    (s.gears.find((g) => g.id === id) as EmpoweredGear | undefined)?.empowered,
  );
const allEmpowered = (s: GameState, p: PlayerId) =>
  s.players[p].legendEmpowered ||
  s.units.some((u) => u.owner === p && u.empowered) ||
  s.gears.some((g) => g.owner === p && (g as EmpoweredGear).empowered);
function empower(
  s: GameState,
  p: PlayerId,
  id: string | undefined,
  ctx: PreconContext,
) {
  if (!id) return;
  ctx.empower!(s, p, id);
}
function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: { label: string; effects: Effect[] }[],
  optional = false,
) {
  const actions: GameAction[] = options.map((o, i) => ({
    ...o,
    id: `choose-custom:ven-extra:${s.nextId}:${i}`,
    category: "ability",
    player: p,
  }));
  if (optional)
    actions.push({
      id: `choose-custom:ven-extra:${s.nextId}:skip`,
      label: "Decline optional effect",
      category: "ability",
      player: p,
      effects: [],
    });
  if (actions.length)
    ctx.openChoice(s, p, {
      options: actions,
      sourceId: ctx.sourceId,
      targetId: ctx.targetId,
      locationId: ctx.locationId,
    });
}
type Cost = {
  energy: number;
  power?: number;
  domain?: string;
  exhaust?: boolean;
  sacrifice?: boolean;
};
function empowerCosts(s: GameState, p: PlayerId, n: number): Cost[] {
  const runes = s.players[p].runes.length;
  const costs: Record<number, Cost> = {
    1: { energy: runes <= 4 ? 2 : 5 },
    18: { energy: 6, power: 1, domain: "Fury" },
    32: { energy: Math.max(0, 12 - runes) },
    46: { energy: 8 },
    50: { energy: Math.max(0, 12 - runes) },
    54: { energy: 0, exhaust: true },
    57: { energy: 3 },
    70: { energy: 3 },
    75: { energy: 1, exhaust: true },
    77: { energy: 2 },
    78: { energy: 1, power: 2 },
    87: { energy: 0, exhaust: true },
    122: { energy: 2 },
    124: { energy: 0, sacrifice: true },
    130: { energy: 3, power: 1, domain: "Order" },
    136: { energy: 1, power: 2, domain: "Order" },
  };
  return n === 74
    ? [{ energy: 1 }, { energy: 0, power: 1, domain: "Body" }]
    : costs[n]
      ? [costs[n]]
      : [];
}
export const vendettaExtraModule: ExpansionModule = {
  might(s, u, value) {
    for (const textSource of textSources(s, u)) {
      const u = textSource,
        n = number(u.cardId);
      if (u.empowered)
        value +=
          (
            { 32: 3, 70: 2, 74: 1, 78: 2, 122: 1, 124: 2 } as Record<
              number,
              number
            >
          )[n] ?? 0;
      if (n === 97)
        value += s.units.filter(
          (x) =>
            x.id !== u.id &&
            x.owner === u.owner &&
            x.location === u.location &&
            getCard(x.cardId).name === getCard(u.cardId).name,
        ).length;
      if (s.combat?.engaged && s.combat.fieldId === u.location) {
        if (s.combat.attacker === u.owner) {
          if (u.empowered && n === 1) value += 2;
          if (n === 76)
            value += s.gears.filter((g) => g.owner === u.owner).length;
        } else if (u.empowered && n === 50) value += 3;
      }
    }
    for (const g of s.gears)
      if (g.owner === u.owner && is(g, 18))
        value += (g as EmpoweredGear).empowered ? 2 : 1;
    if (u.empowered)
      value +=
        2 *
        textUnits(s).filter(
          (x) => x.owner === u.owner && is(x, 130) && x.empowered,
        ).length;
    return value;
  },
  keywords(s, u) {
    if (!u.empowered) return [];
    return textSources(s, u).flatMap((u) => {
      return (
        (
          {
            1: ["Deflect", "Assault 2"],
            50: ["Deflect", "Shield 3"],
            70: ["Ganking"],
            92: ["Deflect", "Ganking"],
            122: ["Deflect 2"],
          } as Record<number, string[]>
        )[number(u.cardId)] ?? []
      );
    });
  },
  cost(s, p, card) {
    if (number(card.id) === 59 && allEmpowered(s, p)) return { energy: -2 };
    if (number(card.id) === 64)
      return { energy: -s.gears.filter((g) => g.owner === p).length };
    return {};
  },
  actions(s, p, ctx) {
    const result: GameAction[] = s.gears
      .filter((g) => g.owner === p && is(g, 75) && g.ready)
      .map((g) => ({
        id: `ven-extra-egg:${g.id}`,
        label: `Exhaust Platewyrm Egg: Add ${g.empowered ? 2 : 1} Energy`,
        category: "resource",
        player: p,
        sourceId: g.id,
      }));
    if (s.phase !== "main" || s.stack.length || s.currentPlayer !== p)
      return result;
    for (const o of [...s.units, ...s.gears].filter((o) => o.owner === p)) {
      const n = number(o.cardId);
      if (!empowered(s, o.id))
        for (const [i, c] of empowerCosts(s, p, n).entries()) {
          if (
            (c.exhaust && !o.ready) ||
            !ctx.canPay(
              s,
              p,
              c.energy,
              c.power ?? 0,
              c.domain ? [c.domain] : [],
            )
          )
            continue;
          const victims = c.sacrifice
            ? s.units.filter((u) => u.owner === p).map((u) => u.id)
            : [undefined];
          for (const victim of victims)
            result.push({
              id: `ven-extra-empower:${o.id}:${i}:${victim ?? ""}`,
              label: `Empower ${getCard(o.cardId).name}${victim ? ` — kill ${getCard(s.units.find((u) => u.id === victim)!.cardId).name}` : ""}`,
              category: "ability",
              player: p,
              sourceId: o.id,
              amount: i,
              targetId: victim,
            });
        }
      if (
        [54, 87].includes(n) &&
        o.ready &&
        empowered(s, o.id) &&
        ctx.canPay(s, p, 1, 0)
      )
        result.push({
          id: `ven-extra-discharge:${o.id}`,
          label:
            n === 54
              ? "Disempower, exhaust, pay 1: Draw 1"
              : "Disempower, exhaust, pay 1: Play a Mech",
          category: "ability",
          player: p,
          sourceId: o.id,
        });
    }
    return result;
  },
  apply(s, a, ctx) {
    if (a.id.startsWith("ven-extra-egg:")) {
      const g = s.gears.find((g) => g.id === a.sourceId);
      if (g) {
        g.ready = false;
        s.players[a.player].energy += g.empowered ? 2 : 1;
      }
      return true;
    }
    if (a.id.startsWith("ven-extra-empower:")) {
      const o = [...s.units, ...s.gears].find((o) => o.id === a.sourceId);
      if (!o) return true;
      const c = empowerCosts(s, a.player, number(o.cardId))[a.amount ?? 0];
      ctx.pay(s, a.player, c.energy, c.power ?? 0, c.domain ? [c.domain] : []);
      if (c.exhaust) o.ready = false;
      ctx.pushStack(s, {
        player: a.player,
        cardId: o.cardId,
        sourceId: o.id,
        kind: "ability",
        effects: [fx("empower-source")],
      });
      if (c.sacrifice && a.targetId) ctx.killUnits(s, [a.targetId]);
      return true;
    }
    if (a.id.startsWith("ven-extra-discharge:")) {
      const g = s.gears.find((g) => g.id === a.sourceId) as
        EmpoweredGear | undefined;
      if (!g) return true;
      ctx.pay(s, a.player, 1, 0);
      g.ready = false;
      g.empowered = false;
      ctx.pushStack(s, {
        player: a.player,
        cardId: g.cardId,
        sourceId: g.id,
        kind: "ability",
        effects: is(g, 54)
          ? [{ type: "draw", amount: 1 }]
          : [{ type: "token", cardName: "Mech", amount: 1, location: "base" }],
      });
      return true;
    }
    return false;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const u = s.units.find((u) => u.id === sourceId);
    const n = number(cardId);
    if (event === "unitPlayed") {
      if (u && n === 37 && s.players[p].runes.length >= 7)
        ctx.trigger(
          s,
          p,
          cardId,
          u.id,
          textEffects(u, [fx("barbara", { target: "enemyGear" })]),
          u.location,
        );
      for (const ally of textUnits(s).filter(
        (x) => x.owner === p && x.id !== sourceId && is(x, 121),
      ))
        ctx.trigger(
          s,
          p,
          ally.cardId,
          ally.id,
          textEffects(ally, [self("might", 2)]),
          ally.location,
        );
    }
    if (event === "play" && [62, 75].includes(n)) {
      const g = s.gears.find((g) => g.id === sourceId);
      if (g) g.ready = false;
    }
    if (event === "ready" && u) {
      if (n === 71)
        ctx.trigger(
          s,
          u.owner,
          cardId,
          u.id,
          textEffects(u, [self("might", 2)]),
          u.location,
        );
    }
    if (event === "beginning") {
      for (const unit of textUnits(s).filter(
        (x) => x.owner === p && [5, 6].includes(number(x.cardId)),
      ))
        if (s.players[p].runes.length < s.players[p === 0 ? 1 : 0].runes.length)
          ctx.trigger(
            s,
            p,
            unit.cardId,
            unit.id,
            textEffects(unit, [
              self("might", is(unit, 5) ? 1 : 2),
              ...(is(unit, 6)
                ? [
                    {
                      type: "keyword",
                      keyword: "Ganking",
                      condition: "self",
                    } as Effect,
                  ]
                : []),
            ]),
            unit.location,
          );
      for (const g of s.gears.filter((g) => g.owner === p && is(g, 108)))
        ctx.trigger(
          s,
          p,
          g.cardId,
          g.id,
          textEffects(g, [fx("relic")]),
          `base:${p}`,
        );
    }
    if (event === "death") {
      if (u)
        for (const witness of textUnits(s).filter(
          (x) =>
            x.owner !== p &&
            x.location === locationId &&
            is(x, 63) &&
            !ctx.dyingUnitIds?.includes(x.id),
        )) {
          if (state(s).nasus[witness.id] === s.turn) continue;
          state(s).nasus[witness.id] = s.turn;
          ctx.trigger(
            s,
            witness.owner,
            witness.cardId,
            witness.id,
            textEffects(witness, [
              { type: "channel", amount: 1, ready: false },
            ]),
            witness.location,
          );
        }
      const marked = state(s).siphons.filter(
        (m) => m.unitId === sourceId && m.turn === s.turn,
      );
      state(s).siphons = state(s).siphons.filter((m) => m.unitId !== sourceId);
      for (const m of marked)
        ctx.trigger(
          s,
          m.player,
          [...exactIds].find(([, n]) => n === 146)![0],
          `siphon:${sourceId}`,
          [{ type: "channel", amount: 1, ready: false }],
        );
    }
    if (event === "stateChanged")
      for (const unit of textUnits(s).filter((u) => is(u, 92))) {
        const above = ctx.getMight(s, unit) >= 10;
        if (above && !state(s).bruteAbove[unit.id] && !unit.empowered)
          ctx.trigger(
            s,
            unit.owner,
            unit.cardId,
            unit.id,
            textEffects(unit, [fx("empower-source")]),
            unit.location,
          );
        state(s).bruteAbove[unit.id] = above;
      }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("ven-extra:")) return false;
    const key = e.custom.slice(10),
      source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance),
      target = s.units.find((u) => u.id === ctx.targetId),
      gear = s.gears.find((g) => g.id === ctx.sourceId) as
        EmpoweredGear | undefined;
    const run = (effects: Effect[], targetId = ctx.targetId) =>
      ctx.runEffects(
        s,
        p,
        effects,
        targetId,
        ctx.sourceId,
        source?.location ?? ctx.locationId,
      );
    switch (key) {
      case "empower-source":
        empower(s, p, ctx.sourceId, ctx);
        break;
      case "empower-target":
        empower(s, p, ctx.targetId, ctx);
        break;
      case "reaper":
        if (ctx.canPay(s, p, 0, 1, ["Fury"]))
          choose(
            s,
            p,
            ctx,
            [{ label: "Pay Fury: Assault 2", effects: [fx("reaper-pay")] }],
            true,
          );
        break;
      case "reaper-pay":
        if (ctx.canPay(s, p, 0, 1, ["Fury"])) {
          ctx.pay(s, p, 0, 1, ["Fury"]);
          run([self("assault", 2)]);
        }
        break;
      case "curse":
        run([
          {
            type: "damage",
            amount:
              2 +
              s.players[p].discard.filter(
                (id) => getCard(id).name === "Consuming Curse",
              ).length,
            target: "unitAtBattlefield",
          },
        ]);
        break;
      case "eclipse":
        if (s.players[p].runes.length <= 4) ctx.draw(s, p, 1);
        break;
      case "rage-fueled":
        if (source && s.players[p].runes.length <= 4)
          run(
            [{ type: "damageAll", who: "opponent", amount: 2 }],
            source.location,
          );
        break;
      case "barbara": {
        const g = s.gears.find((g) => g.id === ctx.targetId) as
          EmpoweredGear | undefined;
        if (g) {
          if (g.empowered) g.empowered = false;
          else ctx.killGear(s, g.id);
        }
        break;
      }
      case "roar":
        if (target)
          run([
            {
              type: "might",
              amount: target.empowered ? 4 : 2,
              target: "anyUnit",
            },
          ]);
        break;
      case "tools":
        if (target)
          run([
            {
              type: "might",
              amount: gear?.empowered ? 4 : 2,
              target: "anyUnit",
            },
          ]);
        break;
      case "mask":
        if (ctx.canPay(s, p, 1, 0))
          choose(
            s,
            p,
            ctx,
            [
              {
                label: "Pay 1 energy: +2 Might",
                effects: [fx("mask-pay", { target: "friendlyUnit" })],
              },
            ],
            true,
          );
        break;
      case "mask-pay":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          run([{ type: "might", amount: 2, target: "friendlyUnit" }]);
        }
        break;
      case "relic": {
        const id = s.players[p].deck.shift();
        if (id) {
          burnToTrash(s, p, id);
          ctx.log?.(s, `Forgotten Relic burns ${getCard(id).name}.`, "info", p);
          if (isCardType(getCard(id), "Unit"))
            ctx.trigger(
              s,
              p,
              gear?.cardId ?? [...exactIds].find(([, n]) => n === 108)![0],
              ctx.sourceId ?? "relic",
              [
                {
                  type: "might",
                  target: "friendlyUnit",
                  amount: getCard(id).might ?? 0,
                },
              ],
              ctx.locationId,
            );
        }
        break;
      }
      case "siphon":
        if (target) {
          state(s).siphons.push({ unitId: target.id, player: p, turn: s.turn });
          run([
            {
              type: "damage",
              target: "unitAtBattlefield",
              amount: s.players[p].runes.length >= 7 ? 7 : 4,
            },
          ]);
        }
        break;
      case "lightning": {
        const top = s.players[p].deck.slice(0, e.lookCount ?? 3);
        choose(s, p, ctx, [
          ...top.map((id, i) => ({
            label: `Draw ${getCard(id).name}`,
            effects: [fx("lightning-finish", { amount: i })],
          })),
          {
            label: "Put all three into trash",
            effects: [fx("lightning-finish", { amount: -1 })],
          },
        ]);
        break;
      }
      case "lightning-finish": {
        const top = s.players[p].deck.splice(0, e.lookCount ?? 3),
          index = e.amount ?? -1;
        if (index >= 0 && top[index])
          s.players[p].hand.push(top.splice(index, 1)[0]);
        burnToTrash(s, p, ...top);
        break;
      }
      case "sands":
        if (s.players[p].runes.length <= 4 && ctx.canPay(s, p, 1, 0))
          choose(
            s,
            p,
            ctx,
            [{ label: "Pay 1 energy: Draw 1", effects: [fx("sands-pay")] }],
            true,
          );
        break;
      case "sands-pay":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.draw(s, p, 1);
        }
        break;
      default:
        throw new Error(`Unknown Vendetta effect: ${key}`);
    }
    return true;
  },
};
