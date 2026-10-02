import { cards, getCard } from "../data/cards";
import { getKeywords } from "./engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "./types";
import type { ExpansionModule } from "./later-precon-engine";

const plain: CardScript = { implemented: true };
const fx = (key: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `ven-wave4:${key}`,
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
  4: { ...plain, keywords: ["Ignore Tank"] },
  15: {
    ...spell(
      [
        {
          type: "damage",
          amount: 4,
          target: "enemyUnit",
          targetDomain: "Calm",
        },
      ],
      "action",
    ),
    uncounterable: true,
  },
  21: plain,
  35: {
    ...plain,
    reaction: true,
    spellModes: [
      {
        label: "Empower a unit until end of turn",
        effects: [fx("sanction", { target: "anyUnit", amount: 1 })],
      },
      {
        label: "Disempower a unit until end of turn",
        effects: [
          fx("sanction", {
            target: "anyUnit",
            targetEmpowered: true,
            amount: 0,
          }),
        ],
      },
    ],
  },
  39: spell([fx("crumbling", { target: "spell" })], "reaction"),
  60: plain,
  61: {
    ...spell(
      [
        {
          type: "might",
          target: "enemyUnit",
          targetDomain: "Body",
          amount: -5,
        },
      ],
      "reaction",
    ),
    ignoreDeflect: true,
  },
  115: {
    ...plain,
    keywords: ["Play to open battlefields"],
    onPlay: [
      {
        type: "bounce",
        target: "anyUnit",
        excludeTag: "Dragon",
        optional: true,
      },
    ],
  },
  131: spell([
    { type: "kill", target: "enemyUnitOrGear", targetDomain: "Chaos" },
  ]),
  136: {
    ...plain,
    onAttack: [
      {
        type: "kill",
        target: "enemyUnitHere",
        lessMightThanSource: true,
        condition: "sourceEmpowered",
      },
    ],
  },
  142: spell([fx("dominus", { target: "anyUnit" })], "action"),
  149: {
    ...plain,
    // Both abilities are present; Heimerdinger copies the dependent ability and
    // checks his own Empowered state (official Vendetta FAQ, 2026-08-14).
    // https://playriftbound.com/en-us/news/rules-and-releases/vendetta-rules-faq-and-clarifications/
    abilities: [
      {
        label: "Ready a gear",
        energy: 1,
        exhaust: true,
        effects: [fx("ready-gear", { target: "anyGear" })],
      },
      {
        label: "Ready 2 gear",
        energy: 1,
        exhaust: true,
        condition: "sourceEmpowered",
        effects: [fx("ready-gear", { target: "twoGear" })],
      },
    ],
  },
  // Official 2026-04-03 erratum grants Ambush at enemy-occupied battlefields.
  // https://playriftbound.com/en-us/news/rules-and-releases/unleashed-errata-updates/
  179: { ...plain, ambush: true, keywords: ["AmbushEnemyOccupied"] },
  180: {
    ...plain,
    keywords: ["Hunt"],
    onConquer: [fx("xp", { amount: 1 })],
    onHold: [fx("xp", { amount: 1 })],
    onAttack: [
      fx("hunter", {
        target: "enemyUnitHere",
        optional: true,
        triggerCost: { xp: 3 },
      }),
    ],
  },
  193: {
    ...plain,
    abilities: [
      {
        label: "Give a friendly unit Tank this turn",
        exhaust: true,
        timing: "action",
        effects: [{ type: "keyword", keyword: "Tank", target: "friendlyUnit" }],
      },
    ],
  },
  // Compact printings whose source text is shorter than their original face.
  1019: {
    ...plain,
    accelerating: true,
    onAttack: [fx("rage", { condition: "runesAtMostFour" })],
  },
  1046: {
    ...plain,
    deflect: 2,
    onConquer: [{ type: "score", amount: 1, condition: "sourceEmpowered" }],
  },
  1063: plain,
  1092: {
    ...plain,
    abilities: [
      { label: "+1 Might this turn", energy: 1, effects: [self("might", 1)] },
    ],
  },
};
const codes = new Map(
  Object.keys(faces)
    .filter((n) => Number(n) < 1000)
    .map((n) => [`ven-${n.padStart(3, "0")}-166`, Number(n)]),
);
for (const [code, n] of [
  ["ven-021a-166", 21],
  ["ven-136a-166", 136],
  ["ven-187-166", 136],
  ["ven-194-166", 149],
  ["ven-019a-166", 1019],
  ["ven-046a-166", 1046],
  ["ven-063a-166", 1063],
  ["ven-178-166", 1063],
  ["ven-092a-166", 1092],
  ["ven-177-166", 1092],
] as const)
  codes.set(code, n);
const exactIds = new Map(
  cards.flatMap((c) =>
    codes.has(c.riftboundId)
      ? [[c.id, codes.get(c.riftboundId)!] as const]
      : [],
  ),
);
export const vendettaWave4Scripts: Record<string, CardScript> =
  Object.fromEntries([...exactIds].map(([id, n]) => [id, faces[n]]));
const number = (id: string) => exactIds.get(id) ?? -1;
const is = (o: { cardId: string }, n: number) => number(o.cardId) === n;
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const cardIdFor = (n: number) =>
  [...exactIds].find(([, value]) => value === n)![0];
type Sanction = {
  id: string;
  empower: boolean;
  turn: number;
  player: PlayerId;
};
type State = GameState & {
  vendettaWave4?: {
    turn: number;
    spells: [number, number];
    dominus: string[];
    sanctions: Sanction[];
    nasus: Record<string, number>;
    bruteAbove: Record<string, boolean>;
  };
};
function data(s: GameState, write = true) {
  const old = (s as State).vendettaWave4;
  if (old?.turn === s.turn) return old;
  const value = {
    turn: s.turn,
    spells: [0, 0] as [number, number],
    dominus: [] as string[],
    sanctions: old?.sanctions ?? [],
    nasus: old?.nasus ?? {},
    bruteAbove: old?.bruteAbove ?? {},
  };
  if (write) (s as State).vendettaWave4 = value;
  return value;
}
const empowerCosts: Record<
  number,
  { energy: number; power: number; domain?: string }
> = {
  21: { energy: 2, power: 1, domain: "Fury" },
  136: { energy: 1, power: 2, domain: "Order" },
  149: { energy: 2, power: 2 },
  1046: { energy: 8, power: 0 },
};
const targetable = (s: GameState, u: Unit, p: PlayerId) =>
  u.owner === p ||
  (!u.untargetableByEnemy && !getKeywords(s, u).includes("Untargetable"));

export const vendettaWave4Module: ExpansionModule = {
  might(s, u, value) {
    if (is(u, 21) && u.empowered) value++;
    if (
      is(u, 136) &&
      u.empowered &&
      s.combat?.engaged &&
      u.location === s.combat.fieldId &&
      u.owner === s.combat.attacker &&
      (!s.combat.designatedUnits || s.combat.designatedUnits.includes(u.id))
    )
      value += 2;
    return value;
  },
  keywords(_s, u) {
    if (is(u, 1092) && u.empowered) return ["Deflect", "Ganking"];
    if (is(u, 136) && u.empowered) return ["Assault 2"];
    return [];
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const source = s.units.find((u) => u.id === sourceId);
    if (event === "cardFinalized" && getCard(cardId).type === "Spell")
      data(s).spells[p]++;
    if (event === "move" && source && is(source, 21)) {
      const locations = [ctx.previousLocation, locationId].filter(
        (id): id is Unit["location"] => !!id?.startsWith("field:"),
      );
      if (locations.length)
        ctx.trigger(
          s,
          source.owner,
          source.cardId,
          source.id,
          [
            fx("akali", {
              target: "unitAtBattlefield",
              targetLocations: [...new Set(locations)],
              optional: true,
            }),
          ],
          source.location,
        );
    }
    if (event === "end") {
      const delayed = data(s).sanctions.filter((x) => x.turn === s.turn);
      data(s).sanctions = data(s).sanctions.filter((x) => x.turn !== s.turn);
      for (const instruction of delayed)
        ctx.trigger(
          s,
          instruction.player,
          cardIdFor(35),
          `sanction:${instruction.id}`,
          [
            fx("sanction-end", {
              cardName: instruction.id,
              amount: instruction.empower ? 1 : 0,
            }),
          ],
        );
    }
    if (event === "death" && source) {
      for (const u of s.units.filter(
        (u) =>
          is(u, 1063) &&
          u.owner !== p &&
          u.location === locationId &&
          !ctx.dyingUnitIds?.includes(u.id),
      )) {
        if (data(s).nasus[u.id] === s.turn) continue;
        data(s).nasus[u.id] = s.turn;
        ctx.trigger(
          s,
          u.owner,
          u.cardId,
          u.id,
          [{ type: "channel", amount: 1 }],
          u.location,
        );
      }
    }
    if (
      [
        "stateChanged",
        "unitPlayed",
        "combatStart",
        "combatEnd",
        "beginning",
        "move",
        "buff",
      ].includes(event)
    ) {
      for (const u of s.units.filter(
        (u) => is(u, 1092) && !ctx.dyingUnitIds?.includes(u.id),
      )) {
        const above = ctx.getMight(s, u) >= 10,
          state = data(s);
        const became = above && !state.bruteAbove[u.id];
        state.bruteAbove[u.id] = above;
        if (became && !u.empowered)
          ctx.trigger(s, u.owner, u.cardId, u.id, [fx("empower")], u.location);
      }
    }
  },
  actions(s, p, ctx) {
    if (
      s.phase !== "main" ||
      s.stack.length ||
      s.pendingChoice ||
      s.currentPlayer !== p
    )
      return [];
    const result: GameAction[] = [];
    const legend = s.players[p];
    const objects = [
      ...s.units.filter((u) => u.owner === p),
      {
        id: "legend",
        cardId: legend.legendId,
        empowered: legend.legendEmpowered,
      },
    ];
    for (const o of objects) {
      const c = empowerCosts[number(o.cardId)];
      if (
        c &&
        !o.empowered &&
        ctx.canPay(s, p, c.energy, c.power, c.domain ? [c.domain] : [])
      )
        result.push({
          id: `ven-wave4:empower:${o.id}`,
          label: `Empower ${getCard(o.cardId).name}`,
          category: "ability",
          player: p,
          sourceId: o.id,
          cardId: o.cardId,
        });
    }
    for (const u of s.units.filter((u) => u.owner === p)) {
      if (data(s, false).dominus.includes(u.id) && ctx.canPay(s, p, 0, 2))
        result.push({
          id: `ven-wave4:dominus:${u.id}`,
          label: "Pay 2 power: ready me",
          category: "ability",
          player: p,
          sourceId: u.id,
          cardId: u.cardId,
        });
      if (is(u, 60) && u.ready) {
        for (const [index, id] of legend.hand.entries()) {
          if (getCard(id).type !== "Gear") continue;
          for (const target of s.units.filter(
            (target) =>
              target.location.startsWith("field:") && targetable(s, target, p),
          )) {
            const tax = ctx.targetTax?.(s, p, target.id) ?? 0;
            if (ctx.canPay(s, p, 1, 0, [], tax))
              result.push({
                id: `ven-wave4:cruiser:${u.id}:${index}:${target.id}`,
                label: `Discard ${getCard(id).name}, pay 1 and exhaust: deal 4 to ${getCard(target.cardId).name}`,
                category: "ability",
                player: p,
                sourceId: u.id,
                cardId: u.cardId,
                targetId: target.id,
                cardIndices: [index],
              });
          }
        }
      }
    }
    return result;
  },
  apply(s, a, ctx) {
    if (!a.id.startsWith("ven-wave4:")) return false;
    const p = a.player,
      source = s.units.find((u) => u.id === a.sourceId);
    const push = (effects: Effect[]) =>
      ctx.pushStack(s, {
        kind: "ability",
        player: p,
        cardId: a.cardId!,
        sourceId: a.sourceId,
        targetId: a.targetId,
        locationId: source?.location,
        effects,
      });
    if (a.id.startsWith("ven-wave4:empower:")) {
      const c = empowerCosts[number(a.cardId!)];
      ctx.pay(s, p, c.energy, c.power, c.domain ? [c.domain] : []);
      push([fx("empower")]);
    } else if (a.id.startsWith("ven-wave4:dominus:")) {
      ctx.pay(s, p, 0, 2);
      push([self("ready")]);
    } else if (a.id.startsWith("ven-wave4:cruiser:")) {
      ctx.pay(s, p, 1, 0, [], ctx.targetTax?.(s, p, a.targetId) ?? 0);
      source!.ready = false;
      const discarded = s.players[p].hand.splice(a.cardIndices![0], 1);
      ctx.discardCards(s, p, discarded);
      push([{ type: "damage", target: "unitAtBattlefield", amount: 4 }]);
    } else throw new Error(`Unknown Vendetta wave4 action: ${a.id}`);
    return true;
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("ven-wave4:")) return false;
    const source = s.units.find((u) => u.id === ctx.sourceId),
      target = s.units.find((u) => u.id === ctx.targetId);
    const run = (effects: Effect[], targetId = ctx.targetId) =>
      ctx.runEffects(
        s,
        p,
        effects,
        targetId,
        ctx.sourceId,
        source?.location ?? ctx.locationId,
      );
    switch (e.custom.slice("ven-wave4:".length)) {
      case "empower":
        if (ctx.sourceId) ctx.empower!(s, p, ctx.sourceId);
        break;
      case "akali":
        // Its move-to/from information is captured by the trigger, so departure
        // does not cancel it (official Vendetta FAQ, 2026-08-14, Akali question).
        if (target)
          run([
            {
              type: "damage",
              target: "unitAtBattlefield",
              amount: source?.empowered ? 2 : 1,
              targetLocations: e.targetLocations,
            },
          ]);
        break;
      case "sanction":
        if (target) {
          if (e.amount) ctx.empower!(s, p, target.id);
          else target.empowered = false;
          data(s).sanctions.push({
            id: target.id,
            empower: !e.amount,
            turn: s.turn,
            player: p,
          });
        }
        break;
      case "sanction-end": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (unit) {
          if (e.amount) ctx.empower!(s, p, unit.id);
          else unit.empowered = false;
        }
        break;
      }
      case "crumbling": {
        const spell = s.stack.find(
          (item) => item.id === ctx.targetId && item.kind === "spell",
        );
        if (
          spell &&
          data(s, false).spells[other(p)] > (spell.player === other(p) ? 1 : 0)
        )
          run([{ type: "counter", target: "spell" }]);
        break;
      }
      case "dominus":
        if (target) {
          // Official core rule 432.1: snapshot the current value as a fixed bonus.
          target.temporaryMight += ctx.getMight(s, target, false);
          if (!data(s).dominus.includes(target.id))
            data(s).dominus.push(target.id);
        }
        break;
      case "ready-gear": {
        for (const id of new Set((ctx.targetId ?? "").split("~"))) {
          const gear = s.gears.find((g) => g.id === id);
          if (gear && !gear.ready) {
            gear.ready = true;
            ctx.cardEvent(
              s,
              "ready",
              p,
              gear.cardId,
              gear.id,
              `base:${gear.owner}`,
            );
          }
        }
        break;
      }
      case "hunter":
        if (source && target)
          run([
            {
              type: "damage",
              target: "enemyUnitHere",
              amount: ctx.getMight(s, source),
            },
          ]);
        break;
      case "xp":
        s.players[p].xp = (s.players[p].xp ?? 0) + (e.amount ?? 1);
        break;
      case "rage":
        if (source)
          run(
            [{ type: "damageAll", who: "opponent", amount: 2 }],
            source.location,
          );
        break;
      default:
        throw new Error(`Unknown Vendetta wave4 effect: ${e.custom}`);
    }
    return true;
  },
};
