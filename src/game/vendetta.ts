import { disempower } from "./board-rules";
import { takeTrashAt } from "./trash";
import { cards, getCard } from "../data/cards";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";

// Collector numbers identify the exact scripted faces, including duplicate provider records.
const number = (id: string) =>
  /^ven-\d{3}[a-z]?-166$/.test(getCard(id).riftboundId)
    ? getCard(id).collectorNumber
    : -1;
const is = (u: { cardId: string }, n: number) => number(u.cardId) === n;
type VUnit = Unit & {
  empowered?: boolean;
  preventDamage?: number;
  untargetableByEnemy?: boolean;
  baseMightOverride?: number;
  additionalCostPaid?: boolean;
};
type VPlayer = GameState["players"][0] & { legendEmpowered?: boolean };
type VState = GameState & {
  vendetta?: { moved: Record<string, number>; combatants?: string[] };
};
const ownHere = (s: GameState, u: Unit) =>
  s.units.filter((x) => x.owner === u.owner && x.location === u.location);
const special = (custom: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `ven:${custom}`,
  ...rest,
});
const script = (rest: Partial<CardScript> = {}): CardScript => ({
  implemented: true,
  ...rest,
});
const action = (effects: Effect[]): CardScript =>
  script({ action: true, spell: effects });
const reaction = (effects: Effect[]): CardScript =>
  script({ reaction: true, spell: effects });
const flow = (
  spell: Effect[],
  energy: number,
  power = 0,
  domain?: string,
): CardScript =>
  script({ spell, flow: { energy, power, domain } } as Partial<CardScript>);
const faceScripts: Record<number, CardScript> = {
  147: script({
    abilities: [
      {
        label: "Eye of Twilight — grant Tank",
        exhaust: true,
        timing: "action",
        effects: [{ type: "keyword", keyword: "Tank", target: "friendlyUnit" }],
      },
    ],
  }),
  138: script({
    shield: 1,
    keywords: ["Shield"],
    onHold: [special("shen-score")],
  }),
  42: script({ onHold: [special("shen-draw")] }),
  159: script({ notes: "Tank units here have +1 Might." }),
  166: script({ notes: "Both players add 1 energy when combat starts here." }),
  148: flow([special("shadow-dash", { target: "enemyUnit" })], 5, 2),
  43: script({
    deflect: 1,
    keywords: ["Deflect"],
    notes: "Empower 7 energy; +7 Might while empowered.",
  }),
  135: script({
    hidden: true,
    onPlay: [special("kennen")],
    onAttack: [special("kennen")],
  }),
  129: script({
    combatCondition: "paired",
    notes: "Combat contribution requires exactly one other friendly unit here.",
  }),
  34: script({
    reaction: true,
    hidden: true,
    spell: [special("resonating-strike", { target: "friendlyUnit" })],
  }),
  126: reaction([special("barrier", { target: "anyUnit" })]),
  128: script({ onDeath: [special("emissary-death")] }),
  33: script({ onMove: [special("pakaa")] }),
  127: flow([special("lacerate", { target: "anyUnit" })], 4, 2, "Order"),
  28: script({ notes: "Empower after surviving combat; empowered +2 Might." }),
  117: script({
    hidden: true,
    notes: "Shield 3 when accompanied by exactly one friendly unit.",
  }),
  27: script({
    gearMight: 1,
    equipCost: 1,
    notes:
      "Equipped unit additionally has +2 Might at a battlefield with exactly one other friendly unit.",
  }),
  31: flow(
    [
      { type: "might", amount: 1, target: "friendlyUnit" },
      special("shroud", { target: "friendlyUnit" }),
    ],
    2,
  ),
  123: script({ ambush: true } as Partial<CardScript>),
  119: script({
    notes:
      "Discount 2 energy and 1 Order power when controlling a battlefield with exactly two units.",
  }),
  26: script({ onPlay: [{ type: "might", amount: 3, target: "anyUnit" }] }),
  30: script({
    notes: "Empower 3 energy; Deflect and Shield 3 while empowered.",
  }),
  116: flow([special("dragon-form", { target: "anyUnit" })], 3),
  143: script({
    notes:
      "Own banishes empower legend; exhaust and disempower for Action discard then draw.",
  }),
  23: script({
    additionalCost: { discard: 1 },
    onPlay: [special("zed-play")],
  } as Partial<CardScript>),
  165: script({ notes: "Hold: Burn 3." }),
  112: script({
    onConquer: [special("zed-conquer")],
    notes: "Action energy1 Chaos1: swap with a friendly Shadow Clone.",
  }),
  110: script({
    notes:
      "Empower by discarding a spell; banish a small enemy unit on empowering.",
  }),
  17: script({
    ambush: true,
    onPlay: [special("morgana", { target: "anyUnit" })],
  } as Partial<CardScript>),
  144: flow(
    [
      { type: "mill", amount: 3 },
      { type: "token", cardName: "Shadow Clone", amount: 1 },
    ],
    1,
    2,
  ),
  20: script({ onAttack: [special("twilight-reveler")] }),
  105: flow(
    [
      {
        type: "moveTarget",
        target: "anyUnit",
        maxMight: 3,
        condition: "chooseDestination",
      },
    ],
    4,
    1,
    "Chaos",
  ),
  12: flow(
    [
      { type: "ready", target: "anyUnit" },
      { type: "assault", target: "anyUnit", amount: 3 },
    ],
    3,
    1,
    "Fury",
  ),
  106: action([special("wind-ghosts", { target: "unitAtBattlefield" })]),
  101: script({
    additionalCost: { energy: 1 },
    onPlay: [special("gust-monk")],
  } as Partial<CardScript>),
  14: script({
    notes: "Empower 2 energy and Fury power; Assault 3 while empowered.",
  }),
  13: script({
    notes: "Enters ready if another card with this name is in own trash.",
  }),
  102: script({ notes: "May banish self to banish a just-played enemy gear." }),
  95: script({ onMove: [special("disciple")] }),
  7: script({
    notes: "Empower by discarding a card; +1 Might while empowered.",
  }),
  8: script({
    action: true,
    additionalCost: { discard: 1 },
    spell: [special("ruthless", { target: "unitAtBattlefield" })],
  } as Partial<CardScript>),
  96: script({ notes: "Costs 2 less per same-name card in own trash." }),
  2: script({ onMove: [special("blade-twirler")] }),
  93: script({
    notes: "Empower 2 energy; +1 Might and Ganking while empowered.",
  }),
};
export const vendettaScripts: Record<string, CardScript> = Object.fromEntries(
  cards
    .filter(
      (c) =>
        /^ven-\d{3}[a-z]?-166$/.test(c.riftboundId) &&
        faceScripts[c.collectorNumber],
    )
    .map((c) => [c.id, faceScripts[c.collectorNumber]]),
);
vendettaScripts["ogn-241-298"] = script({
  reaction: true,
  shield: 2,
  keywords: ["Shield 2", "Tank"],
});
vendettaScripts["token-shadow-clone"] = script({
  onAttack: [special("clone-attack")],
});

function choice(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: {
    label: string;
    effects: Effect[];
    targetId?: string;
    sourceId?: string;
    locationId?: LocationId;
  }[],
  optional = false,
) {
  const list = options.map((o, i): GameAction => ({
    id: `choose-custom:ven:${s.nextId}:${i}`,
    category: "ability",
    player: p,
    ...o,
  }));
  if (optional)
    list.push({
      id: `choose-custom:ven:${s.nextId}:skip`,
      label: "Skip optional effect",
      category: "ability",
      player: p,
      effects: [],
    });
  if (list.length)
    ctx.openChoice(s, p, {
      options: list,
      sourceId: ctx.sourceId,
      targetId: ctx.targetId,
      locationId: ctx.locationId,
    });
}
function empower(s: GameState, u: VUnit, ctx: PreconContext) {
  if (ctx.empower) {
    ctx.empower(s, u.owner, u.id);
    return;
  }
  if (u.empowered) return;
  u.empowered = true;
  ctx.log?.(s, `${getCard(u.cardId).name} becomes Empowered.`, "play", u.owner);
  if (is(u, 110))
    ctx.trigger(
      s,
      u.owner,
      u.cardId,
      u.id,
      [special("banish", { target: "enemyUnitAtBattlefield", maxMight: 3 })],
      u.location,
    );
}
function banish(s: GameState, p: PlayerId, id: string, ctx: PreconContext) {
  const u = s.units.find((x) => x.id === id),
    g = s.gears.find((x) => x.id === id);
  const obj = u ?? g;
  if (!obj) return;
  if (!(obj as { token?: boolean }).token)
    s.players[obj.owner].banished.push(obj.cardId);
  if (u) {
    s.units = s.units.filter((x) => x.id !== id);
    for (const gear of s.gears)
      if (gear.attachedTo === id) gear.attachedTo = undefined;
  } else {
    s.gears = s.gears.filter((x) => x.id !== id);
    for (const unit of s.units) unit.gear = unit.gear.filter((x) => x !== id);
  }
  if (p === obj.owner && !obj.token)
    ctx.cardEvent(s, "banish", p, obj.cardId, obj.id);
  ctx.log?.(s, `${getCard(obj.cardId).name} is banished.`, "play", p);
}
const empoweredCosts: Record<
  number,
  {
    energy?: number;
    power?: number;
    domain?: string;
    discard?: "any" | "Spell";
  }
> = {
  43: { energy: 7 },
  128: { energy: 1, power: 1, domain: "Order" },
  30: { energy: 3 },
  110: { discard: "Spell" },
  14: { energy: 2, power: 1, domain: "Fury" },
  7: { discard: "any" },
  93: { energy: 2 },
};

export const vendettaModule: ExpansionModule = {
  might(s, u, value) {
    const x = u as VUnit,
      n = number(u.cardId),
      friendly = ownHere(s, u);
    if (x.empowered)
      value +=
        ({ 43: 7, 28: 2, 7: 1, 93: 1 } as Record<number, number>)[n] ?? 0;
    if (
      n === 135 &&
      s.units.some(
        (t) => t.owner !== u.owner && t.location === u.location && t.stunned,
      )
    )
      value += 2;
    if (s.combat?.engaged && s.combat.fieldId === u.location) {
      if (s.combat.defender === u.owner) {
        if (n === 117 && friendly.length === 2) value += 3;
        if (n === 30 && x.empowered) value += 3;
      } else if (n === 14 && x.empowered) value += 3;
    }
    for (const gear of s.gears.filter(
      (g) => g.attachedTo === u.id && number(g.cardId) === 27,
    ))
      if (u.location.startsWith("field:") && friendly.length === 2) value += 2;
    if (s.fields.some((f) => f.id === u.location && number(f.cardId) === 159)) {
      const tank =
        getCard(u.cardId).keywords.includes("Tank") ||
        u.temporaryKeywords?.includes("Tank");
      if (tank) value++;
    }
    return value;
  },
  keywords(s, u) {
    const x = u as VUnit,
      n = number(u.cardId);
    return [
      ...(x.empowered && n === 30 ? ["Deflect", "Shield 3"] : []),
      ...(x.empowered && n === 93 ? ["Ganking"] : []),
    ];
  },
  cost(s, p, c) {
    const n = number(c.id);
    if (
      n === 119 &&
      s.fields.some(
        (f) =>
          f.controller === p &&
          s.units.filter((u) => u.location === f.id && u.owner === p).length ===
            2,
      )
    )
      return { energy: -2, power: -1 };
    if (n === 96)
      return {
        energy:
          -2 *
          s.players[p].discard.filter((id) => getCard(id).name === c.name)
            .length,
      };
    return {};
  },
  actions(s, p, ctx) {
    const result: GameAction[] = [];
    const open = s.phase === "main" && !s.stack.length && s.currentPlayer === p;
    const actionTiming =
      open ||
      (s.phase === "showdown" && !s.stack.length && s.focusPlayer === p);
    if (open)
      for (const u of s.units.filter((u) => u.owner === p)) {
        const cost = empoweredCosts[number(u.cardId)];
        if (!cost || (u as VUnit).empowered) continue;
        if (
          !ctx.canPay(
            s,
            p,
            cost.energy ?? 0,
            cost.power ?? 0,
            cost.domain ? [cost.domain] : [],
          )
        )
          continue;
        const indices = cost.discard
          ? s.players[p].hand.flatMap((id, i) =>
              cost.discard === "any" || getCard(id).type === cost.discard
                ? [i]
                : [],
            )
          : [-1];
        for (const i of indices)
          result.push({
            id: `ven-empower:${u.id}:${i}`,
            label: `Empower ${getCard(u.cardId).name}${i >= 0 ? ` — discard ${getCard(s.players[p].hand[i]).name}` : ""}`,
            category: "ability",
            player: p,
            sourceId: u.id,
            amount: i,
          });
      }
    if (actionTiming) {
      const player = s.players[p] as VPlayer;
      if (
        number(player.legendId) === 143 &&
        player.legendEmpowered &&
        player.legendUsedTurn < 0
      )
        result.push({
          id: "ven-legend",
          label: "Master of Shadows — disempower, discard 1, draw 1",
          category: "ability",
          player: p,
          sourceId: `legend:${p}`,
        });
      for (const u of s.units.filter((u) => u.owner === p && is(u, 112)))
        if (ctx.canPay(s, p, 1, 1, ["Chaos"]))
          for (const clone of s.units.filter(
            (x) => x.owner === p && x.cardId === "token-shadow-clone",
          ))
            result.push({
              id: `ven-swap:${u.id}:${clone.id}`,
              label: `Swap Zed and Shadow Clone (${clone.location})`,
              category: "ability",
              player: p,
              sourceId: u.id,
              targetId: clone.id,
            });
    }
    return result;
  },
  apply(s, a, ctx) {
    if (a.id.startsWith("ven-empower:")) {
      const u = s.units.find((x) => x.id === a.sourceId)!;
      const cost = empoweredCosts[number(u.cardId)];
      ctx.pay(
        s,
        a.player,
        cost.energy ?? 0,
        cost.power ?? 0,
        cost.domain ? [cost.domain] : [],
      );
      if (cost.discard) {
        const id = s.players[a.player].hand.splice(a.amount!, 1)[0];
        ctx.discardCards(s, a.player, [id]);
      }
      ctx.pushStack(s, {
        player: a.player,
        cardId: u.cardId,
        sourceId: u.id,
        kind: "ability",
        effects: [special("empower")],
      });
      return true;
    }
    if (a.id === "ven-legend") {
      const p = s.players[a.player] as VPlayer;
      p.legendEmpowered = false;
      p.legendUsedTurn = s.turn;
      ctx.pushStack(s, {
        player: a.player,
        cardId: p.legendId,
        sourceId: `legend:${a.player}`,
        kind: "ability",
        effects: [
          { type: "discard", amount: 1 },
          { type: "draw", amount: 1 },
        ],
      });
      return true;
    }
    if (a.id.startsWith("ven-swap:")) {
      const u = s.units.find((x) => x.id === a.sourceId)!,
        clone = s.units.find((x) => x.id === a.targetId)!;
      ctx.pay(s, a.player, 1, 1, ["Chaos"]);
      ctx.pushStack(s, {
        player: a.player,
        cardId: u.cardId,
        sourceId: u.id,
        targetId: clone.id,
        kind: "ability",
        effects: [special("swap")],
      });
      return true;
    }
    return false;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    if (event === "empower") {
      const empowered = s.units.find((u) => u.id === sourceId);
      if (empowered && is(empowered, 110))
        ctx.trigger(
          s,
          empowered.owner,
          empowered.cardId,
          empowered.id,
          [
            special("banish", {
              target: "enemyUnitAtBattlefield",
              maxMight: 3,
            }),
          ],
          empowered.location,
        );
    }
    const u = s.units.find((x) => x.id === sourceId) as VUnit | undefined;
    if (event === "banish" && number(s.players[p].legendId) === 143)
      ctx.pushStack(s, {
        player: p,
        cardId: s.players[p].legendId,
        sourceId: `legend:${p}`,
        kind: "trigger",
        effects: [special("empower-legend")],
      });
    if (
      event === "unitPlayed" &&
      u &&
      is(u, 13) &&
      s.players[p].discard.some(
        (id) => getCard(id).name === getCard(cardId).name,
      )
    )
      u.ready = true;
    if (event === "play" && getCard(cardId).type === "Gear")
      for (const pref of s.units.filter((x) => x.owner !== p && is(x, 102)))
        ctx.trigger(
          s,
          pref.owner,
          pref.cardId,
          pref.id,
          [special("prefect", { cardName: sourceId })],
          pref.location,
        );
    if (event === "combatStart") {
      const state = s as VState;
      state.vendetta ??= { moved: {} };
      state.vendetta.combatants = s.units
        .filter((x) => x.location === locationId)
        .map((x) => x.id);
      if (
        s.fields.some((f) => f.id === locationId && number(f.cardId) === 166)
      ) {
        s.players[0].energy++;
        s.players[1].energy++;
      }
    }
    if (event === "combatEnd" && s.combat?.engaged)
      for (const id of s.combat.designatedUnits ??
        (s as VState).vendetta?.combatants ??
        []) {
        const witness = s.units.find((x) => x.id === id);
        if (witness && is(witness, 28))
          ctx.trigger(
            s,
            witness.owner,
            witness.cardId,
            witness.id,
            [special("empower")],
            witness.location,
          );
      }
    if (
      event === "hold" &&
      s.fields.some((f) => f.id === locationId && number(f.cardId) === 165)
    )
      ctx.trigger(
        s,
        p,
        cardId,
        sourceId ?? locationId!,
        [{ type: "mill", amount: 3 }],
        locationId,
      );
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("ven:")) return false;
    const key = e.custom.slice(4),
      u = s.units.find((x) => x.id === ctx.targetId) as VUnit | undefined,
      source = s.units.find((x) => x.id === ctx.sourceId) as VUnit | undefined;
    const here = source?.location ?? ctx.locationId;
    switch (key) {
      case "empower-legend":
        s.players[p].legendEmpowered = true;
        break;
      case "empower":
        if (source) empower(s, source, ctx);
        break;
      case "shen-score":
      case "shen-draw":
        if (source && ownHere(s, source).length === 2)
          ctx.runEffects(s, p, [
            { type: key === "shen-score" ? "score" : "draw", amount: 1 },
          ]);
        break;
      case "barrier":
        if (u) u.preventDamage = (u.preventDamage ?? 0) + 7;
        break;
      case "shroud":
        if (u) u.untargetableByEnemy = true;
        break;
      case "dragon-form":
        if (u) u.baseMightOverride = 5;
        break;
      case "lacerate":
        if (u) {
          disempower(u);
          if (ctx.getMight(s, u) <= 3) ctx.killUnits(s, [u.id]);
        }
        break;
      case "banish":
        if (
          u &&
          u.owner !== p &&
          u.location.startsWith("field:") &&
          ctx.getMight(s, u) <= 3
        )
          banish(s, p, u.id, ctx);
        break;
      case "morgana":
        if (u)
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: u.damage, target: "anyUnit" }],
            u.id,
            ctx.sourceId,
            here,
          );
        break;
      case "wind-ghosts":
        if (u) {
          if (ctx.getMight(s, u) <= 3) banish(s, p, u.id, ctx);
          else
            ctx.runEffects(
              s,
              p,
              [{ type: "bounce", target: "anyUnit" }],
              u.id,
              ctx.sourceId,
              here,
            );
        }
        break;
      case "ruthless":
        ctx.runEffects(
          s,
          p,
          [
            {
              type: "damage",
              target: "unitAtBattlefield",
              amount: (ctx as PreconContext & { paidAdditionalCost?: boolean })
                .paidAdditionalCost
                ? 5
                : 3,
            },
          ],
          ctx.targetId,
          ctx.sourceId,
          here,
        );
        break;
      case "zed-conquer":
        ctx.spawnToken(s, p, "Shadow Clone", `base:${p}`);
        break;
      case "zed-play":
        if (source?.additionalCostPaid)
          ctx.runEffects(
            s,
            p,
            [{ type: "token", cardName: "Shadow Clone", amount: 1 }],
            undefined,
            source.id,
            here,
          );
        break;
      case "emissary-death":
        if (source?.empowered || ctx.lastUnit?.empowered)
          ctx.runEffects(
            s,
            p,
            [
              {
                type: "token",
                cardName: "Recruit",
                amount: 2,
                location: "here",
              },
            ],
            undefined,
            ctx.sourceId,
            `base:${p}`,
          );
        break;
      case "shadow-dash":
        if (
          u &&
          ctx.locationId &&
          s.units.some((x) => x.owner === p && x.location === ctx.locationId)
        ) {
          ctx.moveUnit(s, u, ctx.locationId, p);
          ctx.runEffects(
            s,
            p,
            [special("dash-bonus")],
            u.id,
            ctx.sourceId,
            ctx.locationId,
          );
        }
        break;
      case "dash-bonus":
        if (u) {
          const allies = s.units.filter(
            (x) => x.owner === p && x.location === u.location,
          );
          if (allies.length === 2)
            for (const ally of allies) ally.temporaryMight++;
        }
        break;
      case "resonating-strike":
        if (u) {
          if (
            ctx.locationId &&
            s.fields.some((f) => f.id === ctx.locationId && f.controller === p)
          )
            ctx.moveUnit(s, u, ctx.locationId, p);
          u.temporaryMight += 2;
        }
        break;
      case "move-chosen":
        if (u) ctx.moveUnit(s, u, e.cardName as LocationId, p);
        break;
      case "kennen":
        if (ctx.canPay(s, p, 2, 0))
          choice(
            s,
            p,
            ctx,
            s.units
              .filter((x) => !ctx.fromHidden || x.location === here)
              .map((x) => ({
                label: `Pay 2: stun ${getCard(x.cardId).name}`,
                targetId: x.id,
                effects: [
                  special("pay", { amount: 2 }),
                  { type: "stun", target: "anyUnit" },
                ],
              })),
            true,
          );
        break;
      case "pay":
        ctx.pay(s, p, e.amount ?? 0, 0);
        break;
      case "pakaa": {
        const id = s.players[p].deck[0];
        if (!id) break;
        ctx.log?.(s, `Pakaa Protector reveals ${getCard(id).name}.`, "play", p);
        if (getCard(id).type === "Unit") ctx.draw(s, p, 1);
        else {
          ctx.runEffects(s, p, [{ type: "mill", amount: 1 }]);
          if (source) source.temporaryMight += 2;
        }
        break;
      }
      case "twilight-reveler":
        choice(
          s,
          p,
          ctx,
          s.units
            .filter((x) => x.owner === p && x.id !== ctx.sourceId)
            .map((x) => ({
              label: `Ready ${getCard(x.cardId).name}`,
              targetId: x.id,
              effects: [{ type: "ready", target: "friendlyUnit" }],
            })),
        );
        break;
      case "disciple":
        choice(
          s,
          p,
          ctx,
          [
            {
              label: "Burn 1: +1 Might this turn",
              effects: [
                { type: "mill", amount: 1 },
                special("self-might", { amount: 1 }),
              ],
            },
          ],
          true,
        );
        break;
      case "self-might":
        if (source) source.temporaryMight += e.amount ?? 1;
        break;
      case "blade-twirler": {
        const state = s as VState;
        state.vendetta ??= { moved: {} };
        if (!source || state.vendetta.moved[source.id] === s.turn) break;
        state.vendetta.moved[source.id] = s.turn;
        choice(s, p, ctx, [
          { label: "You Burn 1", effects: [{ type: "mill", amount: 1 }] },
          {
            label: "Opponent Burns 1",
            effects: [{ type: "mill", amount: 1, who: "opponent" }],
          },
        ]);
        break;
      }
      case "clone-attack":
        choice(
          s,
          p,
          ctx,
          s.players[p].discard.flatMap((id, i) =>
            getCard(id).type === "Unit"
              ? [
                  {
                    label: `Banish ${getCard(id).name}: Assault 4`,
                    effects: [
                      special("banish-trash", { amount: i, cardName: id }),
                      special("self-assault", { amount: 4 }),
                    ],
                  },
                ]
              : [],
          ),
          true,
        );
        break;
      case "banish-trash": {
        const owner = e.who === "opponent" ? ((1 - p) as PlayerId) : p,
          index = e.amount ?? -1;
        if (s.players[owner].discard[index] !== e.cardName) break;
        const id = takeTrashAt(s, owner, index)!;
        s.players[owner].banished.push(id);
        if (owner === p) ctx.cardEvent(s, "banish", p, id);
        break;
      }
      case "self-assault":
        if (source) source.temporaryAssault += e.amount ?? 1;
        break;
      case "gust-monk":
        if (source?.additionalCostPaid) {
          const choices = s.players.flatMap((player) =>
            player.discard.flatMap((id, i) =>
              s.units.map((t) => ({
                label: `Banish ${getCard(id).name}; Assault 2 to ${getCard(t.cardId).name}`,
                targetId: t.id,
                effects: [
                  special("banish-trash", {
                    amount: i,
                    cardName: id,
                    who: player.id === p ? "self" : "opponent",
                  }),
                  {
                    type: "assault",
                    target: "anyUnit" as const,
                    amount: 2,
                  } as Effect,
                ],
              })),
            ),
          );
          choice(s, p, ctx, choices);
        }
        break;
      case "prefect":
        if (source && s.gears.some((g) => g.id === e.cardName))
          choice(
            s,
            p,
            ctx,
            [
              {
                label: "Banish Ravenbloom Prefect and that gear",
                effects: [special("prefect-banish", { cardName: e.cardName })],
              },
            ],
            true,
          );
        break;
      case "prefect-banish":
        if (source && s.gears.some((g) => g.id === e.cardName)) {
          banish(s, p, source.id, ctx);
          banish(s, p, e.cardName!, ctx);
        }
        break;
      case "swap":
        if (source && u) {
          const from = source.location,
            to = u.location;
          ctx.moveUnit(s, source, to, p);
          ctx.moveUnit(s, u, from, p);
          ctx.log?.(s, "Zed and Shadow Clone exchange locations.", "play", p);
        }
        break;
      default:
        return false;
    }
    return true;
  },
};
