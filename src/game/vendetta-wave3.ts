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
import type { ExpansionModule, PreconContext } from "./later-precon-engine";

const plain: CardScript = { implemented: true };
const fx = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `ven-wave3:${custom}`,
  ...extra,
});
const self = (type: Effect["type"], amount?: number): Effect => ({
  type,
  condition: "self",
  ...(amount === undefined ? {} : { amount }),
});
const tentacle: Effect = { type: "token", cardName: "Tentacle", amount: 1 };
const spell = (
  effects: Effect[],
  timing?: "action" | "reaction",
): CardScript => ({
  ...plain,
  spell: effects,
  ...(timing ? { [timing]: true } : {}),
});

/** Verified against the full Riot card images, including the omitted attachment panel.
 * Provider text remains unchanged; these sources explain the additional scripted rules.
 */
export const vendettaWave3Sources = {
  "ven-011-166": {
    image:
      "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/857a5cee28f403454b1825dd112c07e9ac06b8a4-744x1039.png?accountingTag=RB",
    verified: "2026-10-02",
    attachedRules:
      "+1 Might. When I move to a battlefield, give me +2 Might this turn.",
  },
  "ven-073-166": {
    image:
      "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/22aae23e1ac1797beb50f3f735becfe65b51ee02-744x1039.png?accountingTag=RB",
    verified: "2026-10-02",
    attachedRules: "+2 Might. I can't be moved by enemy spells and abilities.",
  },
};
const faces: Record<number, CardScript> = {
  11: { ...plain, gearMight: 1, equipCost: 1 },
  38: plain,
  47: plain,
  52: {
    ...plain,
    reaction: true,
    spellModes: [
      {
        label: "Return a friendly unit",
        effects: [{ type: "bounce", target: "friendlyUnit" }],
      },
      {
        label: "Give an enemy unit -2 Might",
        effects: [{ type: "might", target: "enemyUnit", amount: -2 }],
      },
    ],
  },
  56: spell(
    [fx("predict", { amount: 5 }), { type: "draw", amount: 2 }],
    "reaction",
  ),
  65: { ...plain, keywords: ["Vision"], onPlay: [{ type: "predict" }] },
  73: { ...plain, gearMight: 2, equipCost: 1 },
  79: {
    ...plain,
    onAttack: [
      fx("dame", { target: "unitHere", condition: "sourceEmpowered" }),
    ],
    onDefend: [
      fx("dame", { target: "unitHere", condition: "sourceEmpowered" }),
    ],
  },
  80: plain,
  83: {
    ...spell([fx("rampage", { target: "duel" })]),
    additionalCost: { power: 1, domain: "Body" },
  },
  84: plain,
  85: spell([fx("strength")]),
  88: plain,
  90: spell([fx("cataclysm")]),
  100: {
    ...spell([{ ...tentacle, amount: 2 }]),
    flow: { energy: 3, power: 0 },
  },
  109: {
    ...plain,
    onPlay: [tentacle],
    onConquer: [tentacle],
    onHold: [tentacle],
  },
  111: {
    ...plain,
    onMove: [
      {
        type: "special",
        condition: "atBattlefield",
        modes: [
          {
            label: "Each player discards 1",
            effects: [
              { type: "discard", amount: 1 },
              { type: "discard", amount: 1, who: "opponent" },
            ],
          },
          {
            label: "Each player draws 1",
            effects: [
              { type: "draw", amount: 1 },
              { type: "draw", amount: 1, who: "opponent" },
            ],
          },
        ],
      },
    ],
  },
  125: plain,
  139: plain,
  151: plain,
  153: plain,
  172: plain,
  174: { ...plain, deflect: 1 },
  176: plain,
  183: { ...plain, ambush: true },
  186: {
    ...plain,
    ambush: true,
    onPlay: [fx("vindictive", { target: "anyUnit" })],
  },
  1004: {
    ...plain,
    onPlay: [self("buff")],
    onConquer: [self("buff")],
    abilities: [
      {
        label: "Spend my buff: +4 Might this turn",
        spendBuff: true,
        effects: [self("might", 4)],
      },
    ],
  },
  1006: {
    ...plain,
    abilities: [
      {
        label: "Add 2 energy for spells",
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "energy", amount: 2, condition: "spellsOnly" }],
      },
    ],
  },
};
// Every mapping is an explicit, reviewed full card code. Collector numbers alone collide.
const codes = new Map(
  Object.keys(faces)
    .filter((n) => Number(n) < 1000)
    .map((n) => [`ven-${n.padStart(3, "0")}-166`, Number(n)]),
);
for (const [code, n] of [
  ["ven-038a-166", 38],
  ["ven-084a-166", 84],
  ["ven-088a-166", 88],
  ["ven-173-166", 65],
  ["ven-182-166", 109],
  ["ven-189-166", 139],
  ["ven-195-166", 151],
  ["ven-196-166", 153],
  ["ven-sp4-006", 1004],
  ["ven-sp6-006", 1006],
] as const)
  codes.set(code, n);
const exactIds = new Map(
  cards.flatMap((c) =>
    codes.has(c.riftboundId)
      ? [[c.id, codes.get(c.riftboundId)!] as const]
      : [],
  ),
);
export const vendettaWave3Scripts: Record<string, CardScript> =
  Object.fromEntries([...exactIds].map(([id, n]) => [id, faces[n]]));
const number = (id: string) => exactIds.get(id) ?? -1;
const is = (u: { cardId: string }, n: number) => number(u.cardId) === n;
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
type State = GameState & {
  vendettaWave3?: {
    turn: number;
    played: [string[], string[]];
    targetedEnemy: [boolean, boolean];
    wolfUsed: string[];
  };
};
function data(s: GameState, write = true) {
  const state = (s as State).vendettaWave3;
  if (state?.turn === s.turn) return state;
  const next = {
    turn: s.turn,
    played: [[], []] as [string[], string[]],
    targetedEnemy: [false, false] as [boolean, boolean],
    wolfUsed: [] as string[],
  };
  if (write) (s as State).vendettaWave3 = next;
  return next;
}
type Predict = {
  top: string[];
  remaining: number[];
  kept: number[];
  recycled: number[];
};
function choice(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: { label: string; effects: Effect[] }[],
) {
  if (!options.length) return;
  ctx.openChoice(s, p, {
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
    options: options.map((o, i): GameAction => ({
      ...o,
      id: `choose-custom:ven-wave3:${s.nextId++}:${i}`,
      category: "ability",
      player: p,
    })),
  });
}
function predictChoices(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  picked: Predict,
) {
  if (!picked.remaining.length) {
    if (picked.top.some((id, i) => s.players[p].deck[i] !== id))
      throw new Error("Inspected cards changed during Predict resolution");
    s.players[p].deck.splice(0, picked.top.length);
    s.players[p].deck.unshift(...picked.kept.map((i) => picked.top[i]));
    s.players[p].deck.push(
      ...ctx.shuffle!(
        s,
        picked.recycled.map((i) => picked.top[i]),
      ),
    );
    return;
  }
  choice(
    s,
    p,
    ctx,
    picked.remaining.flatMap((index) =>
      (["keep", "recycle"] as const).map((mode) => ({
        label: `${mode === "keep" ? "Keep next" : "Recycle"}: ${getCard(picked.top[index]).name}`,
        effects: [
          fx("predict-step", {
            cardName: JSON.stringify({
              ...picked,
              remaining: picked.remaining.filter((i) => i !== index),
              kept: mode === "keep" ? [...picked.kept, index] : picked.kept,
              recycled:
                mode === "recycle"
                  ? [...picked.recycled, index]
                  : picked.recycled,
            }),
          }),
        ],
      })),
    ),
  );
}
const costs: Record<
  number,
  { energy: number; power: number; domain?: string }
> = {
  47: { energy: 2, power: 0 },
  79: { energy: 5, power: 1, domain: "Body" },
  84: { energy: 3, power: 1, domain: "Body" },
  139: { energy: 3, power: 1 },
};
export const vendettaWave3Module: ExpansionModule = {
  might(s, u, value) {
    if (is(u, 172)) value += s.players[u.owner].points;
    if (u.empowered && is(u, 47)) value++;
    if (u.empowered && is(u, 84)) value += 3;
    if (is(u, 109))
      value += s.units.filter((x) => x.owner === u.owner && x.token).length;
    return value;
  },
  keywords(s, u) {
    const keywords: string[] = [];
    if (
      is(u, 38) &&
      !(
        s.combat?.engaged &&
        s.combat.fieldId === u.location &&
        (!s.combat.designatedUnits || s.combat.designatedUnits.includes(u.id))
      )
    )
      keywords.push("Untargetable");
    if (is(u, 84) && u.empowered)
      keywords.push("Prevent damage while not in combat");
    if (s.gears.some((g) => g.attachedTo === u.id && is(g, 73)))
      keywords.push("Cannot be moved by enemies");
    return keywords;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const source = s.units.find((u) => u.id === sourceId);
    if (
      (event === "target" || event === "ready") &&
      source &&
      is(source, 174) &&
      source.owner === p
    )
      ctx.trigger(
        s,
        p,
        source.cardId,
        source.id,
        [self("might", 1)],
        source.location,
      );
    if (event === "ready" && source && is(source, 88))
      ctx.trigger(
        s,
        source.owner,
        source.cardId,
        source.id,
        [
          {
            type: "special",
            modes: [
              { label: "Assault 2", effects: [self("assault", 2)] },
              {
                label: "Deflect 2",
                effects: [
                  { type: "keyword", condition: "self", keyword: "Deflect 2" },
                ],
              },
              {
                label: "Ganking",
                effects: [
                  { type: "keyword", condition: "self", keyword: "Ganking" },
                ],
              },
            ],
          },
        ],
        source.location,
      );
    if (
      event === "move" &&
      source &&
      is(source, 38) &&
      locationId?.startsWith("field:")
    )
      ctx.trigger(
        s,
        source.owner,
        source.cardId,
        source.id,
        [self("might", 2)],
        locationId,
      );
    if (event === "move" && source && locationId?.startsWith("field:"))
      for (const g of s.gears.filter(
        (g) => g.attachedTo === source.id && is(g, 11),
      ))
        ctx.trigger(
          s,
          source.owner,
          g.cardId,
          source.id,
          [self("might", 2)],
          locationId,
        );
    if (event === "empower") {
      if (source && is(source, 47))
        ctx.trigger(
          s,
          source.owner,
          source.cardId,
          source.id,
          [fx("predict", { amount: 2 })],
          source.location,
        );
      if (
        sourceId !== "legend" &&
        [151, 153].includes(number(s.players[p].legendId))
      )
        ctx.trigger(s, p, s.players[p].legendId, "legend", [
          fx("empower-legend"),
        ]);
    }
    if (event === "target" && source && source.owner !== p)
      data(s).targetedEnemy[p] = true;
    if (event === "play") {
      const card = getCard(cardId);
      for (const u of s.units.filter((u) => u.owner === p)) {
        if (is(u, 183) && card.type === "Spell")
          ctx.trigger(s, p, u.cardId, u.id, [self("might", 2)], u.location);
        if (
          is(u, 176) &&
          p !== s.currentPlayer &&
          card.supertype !== "Token" &&
          !source?.token
        )
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            [{ type: "token", cardName: "Recruit", location: "base" }],
            u.location,
          );
      }
      if (
        ["Unit", "Gear", "Spell"].includes(card.type) &&
        card.supertype !== "Token" &&
        !source?.token
      ) {
        const played = data(s).played[p];
        if (!played.includes(card.type)) played.push(card.type);
      }
    }
    if (event === "conquer") {
      for (const u of s.units.filter(
        (u) => u.owner === p && u.location === locationId,
      )) {
        if (
          is(u, 65) &&
          ["Unit", "Gear", "Spell"].every((type) =>
            data(s, false).played[p].includes(type),
          )
        )
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            [{ type: "score", amount: 1 }],
            u.location,
          );
        if (is(u, 80))
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            [
              fx("demolish", {
                target: "anyGear",
                maxEnergy: ctx.getMight(s, u),
                optional: true,
              }),
            ],
            u.location,
          );
      }
    }
  },
  actions(s, p, ctx) {
    const open =
      s.phase === "main" &&
      s.currentPlayer === p &&
      !s.stack.length &&
      !s.pendingChoice;
    const showdown =
      s.phase === "showdown" && !s.stack.length && s.focusPlayer === p;
    const result: GameAction[] = [];
    const legend = s.players[p],
      ln = number(legend.legendId);
    if (open) {
      const objects = [
        ...s.units
          .filter((u) => u.owner === p)
          .map((u) => ({ id: u.id, cardId: u.cardId, empowered: u.empowered })),
        {
          id: "legend",
          cardId: legend.legendId,
          empowered: legend.legendEmpowered,
        },
      ];
      for (const o of objects) {
        const c = costs[number(o.cardId)];
        if (
          c &&
          !o.empowered &&
          ctx.canPay(s, p, c.energy, c.power, c.domain ? [c.domain] : [])
        )
          result.push({
            id: `ven-wave3:empower:${o.id}`,
            label: `Empower ${getCard(o.cardId).name}`,
            category: "ability",
            player: p,
            sourceId: o.id,
            cardId: o.cardId,
          });
      }
      for (const u of s.units.filter((u) => u.owner === p && is(u, 125)))
        if (
          data(s, false).targetedEnemy[p] &&
          !data(s, false).wolfUsed.includes(u.id) &&
          ctx.canPay(s, p, 0, 1, ["Order"])
        )
          result.push({
            id: `ven-wave3:wolf:${u.id}`,
            label: "Pay Order: ready me and give me +1 Might",
            category: "ability",
            player: p,
            cardId: u.cardId,
            sourceId: u.id,
          });
    }
    if (
      legend.legendUsedTurn < 0 &&
      ((ln === 139 && s.currentPlayer === p && showdown) ||
        (open && [151, 153].includes(ln) && legend.legendEmpowered))
    ) {
      for (const u of s.units) {
        if (ln === 139 && (u.owner !== p || u.location !== s.combat?.fieldId))
          continue;
        if (ln === 151 && !u.location.startsWith("field:")) continue;
        if (
          u.owner !== p &&
          (u.untargetableByEnemy || getKeywords(s, u).includes("Untargetable"))
        )
          continue;
        const tax = ctx.targetTax?.(s, p, u.id) ?? 0;
        if (!ctx.canPay(s, p, 0, 0, [], (ln === 153 ? 1 : 0) + tax)) continue;
        result.push({
          id: `ven-wave3:legend:${u.id}`,
          label:
            ln === 139
              ? `Move ${getCard(u.cardId).name} to base${legend.legendEmpowered ? " and ready it" : ""}`
              : ln === 151
                ? `Disempower and give ${getCard(u.cardId).name} -2 Might`
                : `Disempower, pay 1 power, ready ${getCard(u.cardId).name}`,
          category: "ability",
          player: p,
          cardId: legend.legendId,
          sourceId: "legend",
          targetId: u.id,
        });
      }
    }
    return result;
  },
  apply(s, a, ctx) {
    if (!a.id.startsWith("ven-wave3:")) return false;
    const p = a.player;
    if (a.id.startsWith("ven-wave3:empower:")) {
      const c = costs[number(a.cardId!)];
      ctx.pay(s, p, c.energy, c.power, c.domain ? [c.domain] : []);
      ctx.pushStack(s, {
        player: p,
        cardId: a.cardId!,
        sourceId: a.sourceId,
        kind: "ability",
        effects: [fx("empower-source")],
      });
      return true;
    }
    if (a.id.startsWith("ven-wave3:wolf:")) {
      ctx.pay(s, p, 0, 1, ["Order"]);
      data(s).wolfUsed.push(a.sourceId!);
      ctx.pushStack(s, {
        player: p,
        cardId: a.cardId!,
        sourceId: a.sourceId,
        kind: "ability",
        effects: [self("ready"), self("might", 1)],
      });
      return true;
    }
    if (a.id.startsWith("ven-wave3:legend:")) {
      const n = number(s.players[p].legendId),
        tax = ctx.targetTax?.(s, p, a.targetId) ?? 0;
      ctx.pay(s, p, 0, 0, [], (n === 153 ? 1 : 0) + tax);
      s.players[p].legendUsedTurn = s.turn;
      if (n !== 139) s.players[p].legendEmpowered = false;
      ctx.pushStack(s, {
        player: p,
        cardId: a.cardId!,
        sourceId: "legend",
        targetId: a.targetId,
        kind: "ability",
        effects:
          n === 139
            ? [fx("rogue", { target: "friendlyUnitAtBattlefield" })]
            : n === 151
              ? [{ type: "might", amount: -2, target: "unitAtBattlefield" }]
              : [{ type: "ready", target: "anyUnit" }],
      });
      return true;
    }
    throw new Error(`Unknown Vendetta wave3 action ${a.id}`);
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("ven-wave3:")) return false;
    const key = e.custom.slice("ven-wave3:".length),
      source = s.units.find((u) => u.id === ctx.sourceId),
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
    switch (key) {
      case "rampage": {
        const friendly = s.units.find(
          (u) => u.id === ctx.targetId?.split("~")[0],
        );
        if (friendly?.owner === p && e.additionalCostPaid)
          friendly.temporaryMight += 2;
        run([{ type: "duel", target: "duel" }]);
        break;
      }
      case "vindictive":
        if (target)
          run([{ type: "damage", amount: target.damage, target: "anyUnit" }]);
        break;
      case "cataclysm":
      case "cataclysm-pick": {
        const selection: { remaining: PlayerId[]; kept: string[] } = e.cardName
          ? JSON.parse(e.cardName)
          : { remaining: [s.currentPlayer, other(s.currentPlayer)], kept: [] };
        // Each player's choice is a non-target selection during resolution. Finish
        // every selection before removing the remaining units as one kill event.
        while (selection.remaining.length) {
          const chooser = selection.remaining.shift()!;
          const units = s.units.filter((u) => u.owner === chooser);
          if (!units.length) continue;
          choice(
            s,
            chooser,
            ctx,
            units.map((u) => ({
              label: `Keep ${getCard(u.cardId).name}`,
              effects: [
                fx("cataclysm-pick", {
                  cardName: JSON.stringify({
                    remaining: selection.remaining,
                    kept: [...selection.kept, u.id],
                  }),
                }),
              ],
            })),
          );
          return true;
        }
        ctx.killUnits(
          s,
          s.units
            .filter((u) => !selection.kept.includes(u.id))
            .map((u) => u.id),
        );
        break;
      }
      case "empower-source":
        if (ctx.sourceId) ctx.empower!(s, p, ctx.sourceId);
        break;
      case "empower-legend":
        ctx.empower!(s, p, "legend");
        break;
      case "predict": {
        const top = s.players[p].deck.slice(0, e.amount ?? 1);
        predictChoices(s, p, ctx, {
          top,
          remaining: top.map((_, i) => i),
          kept: [],
          recycled: [],
        });
        break;
      }
      case "predict-step":
        predictChoices(s, p, ctx, JSON.parse(e.cardName!) as Predict);
        break;
      case "dame":
        if (source && target && source.location === target.location)
          source.temporaryMight +=
            Math.max(
              0,
              ctx.getMight(s, target, false) - ctx.getMight(s, source, false),
            ) + 1;
        break;
      case "demolish": {
        const g = s.gears.find((g) => g.id === ctx.targetId);
        if (
          source &&
          g &&
          (getCard(g.cardId).energy ?? 0) <= ctx.getMight(s, source)
        )
          ctx.killGear(s, g.id);
        break;
      }
      case "strength": {
        const hand = s.players[other(p)].hand;
        ctx.log?.(
          s,
          `${s.players[other(p)].name} reveals: ${hand.map((id) => getCard(id).name).join(", ") || "empty hand"}.`,
          "info",
          p,
        );
        choice(
          s,
          p,
          ctx,
          hand.flatMap((id, index) =>
            getCard(id).domains.includes("Mind")
              ? [
                  {
                    label: `Recycle ${getCard(id).name}`,
                    effects: [
                      fx("strength-picked", { amount: index, cardName: id }),
                    ],
                  },
                ]
              : [],
          ),
        );
        break;
      }
      case "strength-picked": {
        const hand = s.players[other(p)].hand;
        if (hand[e.amount!] === e.cardName)
          s.players[other(p)].deck.push(hand.splice(e.amount!, 1)[0]);
        break;
      }
      case "rogue":
        if (
          target &&
          target.owner === p &&
          s.currentPlayer === p &&
          target.location === s.combat?.fieldId
        ) {
          ctx.moveUnit(s, target, `base:${p}`, p);
          if (s.players[p].legendEmpowered)
            run([{ type: "ready", target: "friendlyUnit" }]);
        }
        break;
      default:
        throw new Error(`Unknown Vendetta wave3 effect ${key}`);
    }
    return true;
  },
};
