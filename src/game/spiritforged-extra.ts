import { getCard } from "../data/cards";
import { getScript } from "./scripts";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "./types";
const plain: CardScript = { implemented: true };
const sf = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `sfd-extra:${custom}`,
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
export const spiritforgedExtraScripts: Record<string, CardScript> = {
  "sfd-001-221": spell(
    [sf("against-odds", { target: "friendlyUnitAtBattlefield" })],
    "reaction",
  ),
  "sfd-004-221": {
    ...spell([{ type: "special", custom: "confront" }, sf("gold")]),
    hidden: true,
  },
  "sfd-005-221": spell([sf("detonate", { target: "anyGear" })]),
  "sfd-012-221": plain,
  "sfd-013-221": {
    ...plain,
    additionalCost: { energy: 1, power: 1, domain: "Fury" },
    onPlay: [
      {
        type: "damage",
        amount: 2,
        target: "unitAtBattlefield",
        condition: "paidAdditionalCost",
      },
    ],
  },
  "sfd-017-221": {
    ...spell([sf("sudden-storm", { target: "unitAtBattlefield" })], "action"),
    hidden: true,
  },
  "sfd-027-221": { ...plain, onHold: [{ type: "draw", amount: 2 }] },
  "sfd-032-221": {
    ...plain,
    onPlay: [{ type: "kill", target: "anyGear", optional: true }],
  },
  "sfd-036-221": { ...plain, onDeath: [sf("lonely")] },
  "sfd-038-221": {
    ...plain,
    onMove: [
      {
        type: "might",
        amount: 1,
        target: "friendlyUnit",
        excludeSource: true,
        condition: "atBattlefield",
      },
    ],
  },
  "sfd-041-221": { ...plain, onMove: [sf("smith")] },
  "sfd-047-221": plain,
  "sfd-048-221": { ...plain, onMove: [{ type: "draw", amount: 1 }] },
  "sfd-052-221": {
    ...plain,
    abilities: [
      {
        label: "Give a unit +3 Might this turn",
        exhaust: true,
        effects: [{ type: "might", amount: 3, target: "anyUnit" }],
      },
    ],
  },
  "sfd-055-221": { ...plain, shield: 5, keywords: ["Shield 5", "Tank"] },
  "sfd-058-221": {
    ...plain,
    onPlay: [sf("ornn-select")],
    onHold: [sf("ornn-select")],
  },
  "sfd-067-221": {
    ...plain,
    additionalCost: { power: 1, domain: "Mind" },
    onPlay: [
      {
        type: "might",
        amount: -2,
        target: "anyUnit",
        condition: "paidAdditionalCost",
      },
    ],
  },
  "sfd-068-221": { ...plain, accelerating: true },
  "sfd-072-221": { ...plain, onPlay: [sf("dropboarder")] },
  "sfd-074-221": {
    ...plain,
    onPlay: [
      sf("pickpocket-kill", {
        target: "anyGear",
        maxEnergy: 1,
        optional: true,
      }),
    ],
  },
  "sfd-091-221": { ...plain, onPlay: [sf("buhru", { optional: true })] },
  "sfd-094-221": plain,
  "sfd-098-221": {
    ...plain,
    additionalCost: { energy: 1 },
    onPlay: [sf("sea-monkey")],
  },
  "sfd-100-221": plain,
  "sfd-105-221": plain,
  "sfd-130-221": { ...plain, onMove: [sf("gold")] },
  "sfd-131-221": { ...plain, accelerating: true },
  "sfd-135-221": spell([sf("gear-bounce", { target: "anyGear" })], "action"),
  "sfd-147-221": spell([sf("downwell")]),
  "sfd-152-221": { ...plain, onHold: [sf("gold", { amount: 2 })] },
  "sfd-155-221": { ...plain, onDeath: [sf("gold")] },
  "sfd-158-221": {
    ...plain,
    onPlay: [{ type: "kill", target: "enemyUnit", maxMight: 3 }],
  },
  "sfd-159-221": plain,
  "sfd-162-221": spell(
    [sf("blood-money", { target: "unitAtBattlefield", maxMight: 2 })],
    "action",
  ),
  "sfd-166-221": spell([sf("rally"), { type: "draw", amount: 1 }], "action"),
  "sfd-168-221": {
    ...plain,
    abilities: [
      {
        label: "Play three Recruits",
        exhaust: true,
        effects: [{ type: "token", amount: 3 }],
      },
    ],
  },
  "sfd-171-221": plain,
  "sfd-174-221": { ...plain, onPlay: [sf("gold", { amount: 4 })] },
  "sfd-176-221": { ...plain, keywords: ["Tank"] },
  "sfd-179-221": {
    ...plain,
    accelerating: true,
    onMove: [
      {
        type: "token",
        amount: 3,
        location: "here",
        condition: "atBattlefield",
      },
    ],
  },
  "sfd-183-221": plain,
  "sfd-185-221": plain,
  "sfd-204-221": spell([sf("ready-all")]),
  "sfd-217-221": { ...plain, onConquer: [sf("seat")] },
  "sfd-219-221": { ...plain, onHold: [sf("papertree")] },
};

type ExtraState = GameState & {
  sfdExtraHold?: Partial<Record<PlayerId, { turn: number; count: number }>>;
  sfdExtraRally?: Partial<Record<PlayerId, { turn: number; count: number }>>;
  sfdExtraAlone?: Record<string, boolean>;
};
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
function option(
  p: PlayerId,
  key: string,
  label: string,
  effects: Effect[],
  extra: Partial<GameAction> = {},
): GameAction {
  return {
    id: `choose-custom:sfd-extra:${key}`,
    player: p,
    label,
    category: "ability",
    effects,
    ...extra,
  };
}
function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: GameAction[],
  optional = false,
) {
  if (!options.length) return;
  ctx.openChoice(s, p, {
    options: [
      ...options,
      ...(optional
        ? [option(p, "decline", "Decline optional effect", [])]
        : []),
    ],
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
  });
}
function bounceGear(s: GameState, id: string, ctx: PreconContext) {
  const g = s.gears.find((g) => g.id === id);
  if (!g) return;
  ctx.cardEvent(s, "bounce", g.owner, g.cardId, g.id, `base:${g.owner}`);
  for (const u of s.units) u.gear = u.gear.filter((id) => id !== g.id);
  s.gears = s.gears.filter((x) => x.id !== g.id);
  if (!g.token) s.players[g.owner].hand.push(g.cardId);
}
export const spiritforgedExtraModule: ExpansionModule = {
  might(s, u, value) {
    if (u.cardId === "sfd-068-221")
      for (const id of u.gear) {
        const g = s.gears.find((g) => g.id === id);
        if (g) value += getScript(g.cardId)?.gearMight ?? 0;
      }
    if (
      u.cardId === "sfd-159-221" &&
      s.units.some(
        (v) =>
          v.id !== u.id && v.owner === u.owner && v.location === u.location,
      )
    )
      value++;
    if (
      s.combat &&
      (s.combat.engaged ?? true) &&
      s.combat.fieldId === u.location &&
      s.combat.attacker === u.owner
    ) {
      if (u.cardId === "sfd-131-221")
        value += s.units.filter(
          (v) => v.owner !== u.owner && v.location === u.location,
        ).length;
      if (s.players[u.owner].legendId === "sfd-183-221")
        value += u.gear.filter((id) => {
          const g = s.gears.find((g) => g.id === id);
          return g && getScript(g.cardId)?.equipCost !== undefined;
        }).length;
    }
    return value;
  },
  keywords(s, u) {
    const result: string[] = [];
    if (u.cardId === "sfd-131-221") {
      const n = s.units.filter(
        (v) => v.owner !== u.owner && v.location === u.location,
      ).length;
      if (n) result.push(`Assault ${n}`);
    }
    if (s.players[u.owner].legendId === "sfd-183-221" && u.gear.length)
      result.push(`Assault ${u.gear.length}`);
    return result;
  },
  cost(s, p, c) {
    if (c.id === "sfd-012-221")
      return {
        energy: -Math.min(
          Math.max(0, (c.energy ?? 0) - 1),
          s.players[p].cardsPlayedThisTurn,
        ),
      };
    if (c.id === "sfd-055-221") {
      const h = (s as ExtraState).sfdExtraHold?.[p],
        n = h?.turn === s.turn ? h.count : 0;
      return { energy: -2 * n, power: -n };
    }
    return {};
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("sfd-extra:")) return false;
    const key = e.custom.slice("sfd-extra:".length),
      source = s.units.find((u) => u.id === ctx.sourceId) ?? ctx.lastUnit;
    const target = s.units.find((u) => u.id === ctx.targetId);
    const run = (effects: Effect[], targetId = ctx.targetId) =>
      ctx.runEffects(s, p, effects, targetId, ctx.sourceId, ctx.locationId);
    const gold = (count = 1) => {
      for (let i = 0; i < count; i++)
        ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
    };
    switch (key) {
      case "against-odds":
        if (target)
          target.temporaryMight +=
            2 *
            s.units.filter(
              (u) => u.owner !== p && u.location === target.location,
            ).length;
        break;
      case "gold":
        gold(e.amount ?? 1);
        break;
      case "detonate": {
        const g = s.gears.find((g) => g.id === ctx.targetId);
        if (g) {
          const owner = g.owner;
          ctx.killGear(s, g.id);
          ctx.draw(s, owner, 2);
        }
        break;
      }
      case "sudden-storm":
        if (target)
          run([
            {
              type: "damage",
              amount:
                s.combat &&
                (s.combat.engaged ?? true) &&
                target.location === s.combat.fieldId &&
                target.owner === s.combat.attacker
                  ? 4
                  : 2,
              target: "unitAtBattlefield",
            },
          ]);
        break;
      case "pickpocket-kill":
        if (
          s.gears.some(
            (g) =>
              g.id === ctx.targetId && (getCard(g.cardId).energy ?? 0) <= 1,
          )
        ) {
          ctx.killGear(s, ctx.targetId!);
          gold();
        }
        break;
      case "lonely":
        if (ctx.sourceId && (s as ExtraState).sfdExtraAlone?.[ctx.sourceId])
          ctx.draw(s, p, 1);
        break;
      case "smith": {
        const top = s.players[p].deck[0];
        if (top) {
          ctx.log?.(
            s,
            `Apprentice Smith reveals ${getCard(top).name}.`,
            "info",
            p,
          );
          if (getCard(top).type === "Gear") ctx.draw(s, p, 1);
          else s.players[p].deck.push(s.players[p].deck.shift()!);
        }
        break;
      }
      case "ornn-select": {
        const top = s.players[p].deck.slice(0, 4);
        const opts = top.flatMap((cardId, index) =>
          getCard(cardId).type === "Gear"
            ? [
                option(p, `ornn:${index}`, `Draw ${getCard(cardId).name}`, [
                  sf("ornn-finish", { amount: index }),
                ]),
              ]
            : [],
        );
        opts.push(
          option(p, "ornn-none", "Recycle all revealed cards", [
            sf("ornn-finish", { amount: -1 }),
          ]),
        );
        choose(s, p, ctx, opts);
        break;
      }
      case "ornn-finish": {
        const top = s.players[p].deck.splice(0, 4);
        const i = e.amount ?? -1;
        if (i >= 0 && top[i]) {
          ctx.log?.(
            s,
            `Ornn - Blacksmith reveals ${getCard(top[i]).name}.`,
            "info",
            p,
          );
          s.players[p].deck.unshift(top.splice(i, 1)[0]);
          ctx.draw(s, p, 1);
        }
        s.players[p].deck.push(...ctx.shuffle!(s, top));
        break;
      }
      case "dropboarder":
        if (source && s.gears.filter((g) => g.owner === p).length >= 2)
          run([self("ready")]);
        break;
      case "buhru":
        choose(s, p, ctx, [
          option(p, "buhru-draw", "Draw 1", [{ type: "draw", amount: 1 }]),
          option(p, "buhru-buff", "Buff this unit", [self("buff")]),
        ]);
        break;
      case "sea-monkey":
        if (ctx.paidAdditionalCost || source?.additionalCostPaid)
          run([self("buff")]);
        break;
      case "gear-bounce":
        if (ctx.targetId) bounceGear(s, ctx.targetId, ctx);
        break;
      case "downwell": {
        // Return the complete simultaneous group before any state-based death check.
        const units = [...s.units],
          gears = [...s.gears];
        for (const u of units)
          ctx.cardEvent(s, "bounce", u.owner, u.cardId, u.id, u.location);
        for (const g of gears)
          ctx.cardEvent(
            s,
            "bounce",
            g.owner,
            g.cardId,
            g.id,
            `base:${g.owner}`,
          );
        const unitIds = new Set(units.map((u) => u.id));
        const gearIds = new Set(gears.map((g) => g.id));
        s.units = s.units.filter((u) => !unitIds.has(u.id));
        s.gears = s.gears.filter((g) => !gearIds.has(g.id));
        for (const u of s.units)
          u.gear = u.gear.filter((id) => !gearIds.has(id));
        for (const u of units)
          if (!u.token) s.players[u.owner].hand.push(u.cardId);
        for (const g of gears)
          if (!g.token) s.players[g.owner].hand.push(g.cardId);
        break;
      }
      case "blood-money":
        if (target) {
          const amount = target.owner === p ? 2 : 1;
          ctx.killUnits(s, [target.id]);
          if (!s.units.some((u) => u.id === target.id)) gold(amount);
        }
        break;
      case "rally":
        {
          const map = ((s as ExtraState).sfdExtraRally ??= {}),
            old = map[p];
          map[p] = {
            turn: s.turn,
            count: (old?.turn === s.turn ? old.count : 0) + 1,
          };
        }
        break;
      case "rally-buff":
        if (target) run([{ type: "buff" }]);
        break;
      case "ready-all":
        for (const u of own(s, p)) run([{ type: "ready" }], u.id);
        break;
      case "seat":
        ctx.draw(
          s,
          p,
          s.fields.filter((f) => f.id !== ctx.locationId && f.controller === p)
            .length,
        );
        break;
      case "papertree":
        ctx.channel(s, 0, 1, false);
        ctx.channel(s, 1, 1, false);
        break;
      default:
        throw new Error(`Unknown Spiritforged extra effect: ${e.custom}`);
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const u = s.units.find((u) => u.id === sourceId);
    if (event === "unitPlayed" && u) {
      if (cardId === "sfd-027-221" && s.players[p].hand.length <= 2)
        u.ready = true;
      if (
        cardId === "sfd-094-221" &&
        own(s, p).some(
          (x) => x.id !== u.id && getCard(x.cardId).tags.includes("Dragon"),
        )
      )
        u.ready = true;
      if (
        cardId === "sfd-176-221" &&
        own(s, p).filter((x) => x.id !== u.id && x.location === `base:${p}`)
          .length >= 2
      )
        u.ready = true;
      if (u.token && own(s, p).some((x) => x.cardId === "sfd-171-221"))
        u.ready = true;
      const rally = (s as ExtraState).sfdExtraRally?.[p];
      if (rally?.turn === s.turn)
        for (let i = 0; i < rally.count; i++)
          ctx.trigger(s, p, cardId, u.id, [self("buff")], u.location);
    }
    if (event === "play") {
      const gear = s.gears.find((g) => g.id === sourceId);
      if (gear?.token && own(s, p).some((u) => u.cardId === "sfd-171-221"))
        gear.ready = true;
      if ((getCard(cardId).power ?? 0) >= 2)
        for (const explorer of own(s, p).filter(
          (u) => u.cardId === "sfd-100-221",
        ))
          ctx.trigger(
            s,
            p,
            explorer.cardId,
            explorer.id,
            [{ type: "draw", amount: 1 }],
            explorer.location,
          );
    }
    if (event === "buff" && u?.cardId === "sfd-047-221")
      ctx.trigger(s, p, u.cardId, u.id, [self("ready")], u.location);
    if (event === "hold") {
      const map = ((s as ExtraState).sfdExtraHold ??= {}),
        prev = map[p];
      map[p] = {
        turn: s.turn,
        count: (prev?.turn === s.turn ? prev.count : 0) + 1,
      };
    }
    if (event === "death" && u?.cardId === "sfd-036-221")
      ((s as ExtraState).sfdExtraAlone ??= {})[u.id] = !s.units.some(
        (v) =>
          v.id !== u.id && v.owner === u.owner && v.location === u.location,
      );
    if (event === "combatEnd" && locationId && s.combat?.engaged) {
      const survivors = s.units.filter((u) => u.location === locationId);
      for (const owner of [0, 1] as const)
        if (
          s.players[owner].legendId === "sfd-185-221" &&
          survivors.length &&
          survivors.every((u) => u.owner === owner)
        )
          ctx.trigger(
            s,
            owner,
            "sfd-185-221",
            "legend",
            [{ type: "draw", amount: 1 }],
            locationId,
          );
    }
    if (
      event === "unitPlayed" ||
      event === "beginning" ||
      event === "stateChanged"
    )
      for (const runner of s.units.filter((u) => u.cardId === "sfd-105-221"))
        runner.untargetableByEnemy = true;
  },
};
