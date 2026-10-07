import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { ruleFamily } from "./rule-families";
import { readyForbidden } from "./board-rules";
import { getCard } from "../data/cards";
import { getKeywords } from "./engine";
import { getScript } from "./scripts";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";

const plain: CardScript = { implemented: true };
const fx = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave4:${custom}`,
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
const seal = (domain: string): CardScript => ({
  ...plain,
  abilities: [
    {
      label: `Add one ${domain} Power`,
      exhaust: true,
      timing: "reaction",
      effects: [{ type: "power", amount: 1, domain }],
    },
  ],
});

/** Complete scripts for the fourth Origins/Spiritforged implementation wave. */
export const originsWave4Scripts: Record<string, CardScript> = {
  "ogn-040-298": seal("Fury"),
  "ogn-081-298": seal("Calm"),
  "ogn-108-298": spell(
    [fx("mutation", { target: "orderedTwoFriendlyUnits" })],
    "reaction",
  ),
  "ogn-120-298": seal("Mind"),
  "ogn-153-298": spell([fx("overt")], "action"),
  "ogn-163-298": seal("Body"),
  "ogn-173-298": spell(
    [
      {
        type: "moveTarget",
        target: "friendlyUnit",
        condition: "chooseDestination",
      },
      { type: "ready", target: "friendlyUnit" },
    ],
    "action",
  ),
  "ogn-199-298": {
    ...plain,
    hidden: true,
    // Origins errata restricts the partner to a different location.
    onPlay: [
      fx("tideturner", {
        target: "friendlyUnit",
        optional: true,
        targetDifferentLocationFromSource: true,
      }),
    ],
  },
  "ogn-204-298": seal("Chaos"),
  "ogn-230-298": { ...plain, onPlay: [fx("albus")] },
  "ogn-245-298": seal("Order"),
  "ogn-255-298": plain,
  "ogn-292-298": plain,
  "ogn-295-298": plain,
  "sfd-028-221": {
    ...plain,
    assault: 1,
    keywords: ["Assault"],
    onAttack: [fx("assault-damage", { target: "enemyUnitHere" })],
  },
  "sfd-060-221": { ...plain, deflect: 1, keywords: ["No enemy scoring"] },
  "sfd-082-221": {
    ...plain,
    keywords: ["No combat damage"],
    onAttack: [fx("might-damage", { target: "enemyUnitHere" })],
    onDefend: [fx("might-damage", { target: "enemyUnitHere" })],
    abilities: [
      {
        label: "Move me to base",
        power: 1,
        domain: "Mind",
        timing: "action",
        effects: [self("moveTarget")],
      },
    ],
  },
  "sfd-114-221": {
    ...spell([{ type: "duel", target: "duelEnemyAtBattlefield" }], "action"),
    repeat: { energy: 3 },
  },
  "sfd-125-221": {
    ...plain,
    onMove: [
      fx("porter", {
        target: "friendlyUnit",
        condition: "atBattlefield",
        optional: true,
        triggerCost: { power: 1, domain: "Chaos" },
      }),
    ],
  },
  "sfd-126-221": plain,
  "sfd-136-221": {
    ...spell([fx("bargain", { target: "spell" })], "reaction"),
    repeat: { energy: 2 },
  },
  "sfd-154-221": { ...spell([fx("guards")]), hidden: true },
  "sfd-163-221": spell(
    [
      // Spiritforged errata makes both units targets; the kill is not a cost.
      fx("deathgrip", { target: "orderedTwoFriendlyUnits" }),
      { type: "draw", amount: 1 },
    ],
    "reaction",
  ),
  "sfd-196-221": spell(
    [fx("dance", { target: "orderedTwoUnits" })],
    "reaction",
  ),
};
type WaveState = GameState & { wave4Dream?: { turn: number; used: string[] } };
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
function choose(
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
      id: `choose-custom:wave4:${s.nextId++}:${i}`,
      category: "ability",
      player: p,
    })),
  });
}
function spend(s: GameState, p: PlayerId, u: Unit, ctx: PreconContext) {
  u.buff--;
  ctx.cardEvent(s, "spendBuff", p, u.cardId, u.id, u.location);
}
function run(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  effects: Effect[],
  targetId = ctx.targetId,
) {
  ctx.runEffects(s, p, effects, targetId, ctx.sourceId, ctx.locationId);
}
export const originsWave4Module: ExpansionModule = {
  keywords(s, u) {
    return s.fields.find((f) => f.id === u.location)?.cardId === "ogn-295-298"
      ? ["Cannot move to base"]
      : [];
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const source = s.units.find((u) => u.id === sourceId);
    if (event === "attack" && source) {
      const defender = other(source.owner);
      if (
        ruleFamily(s.players[defender].legendId) === "ogn-255-298" &&
        s.fields.find((f) => f.id === locationId)?.controller === defender
      )
        ctx.trigger(
          s,
          defender,
          s.players[defender].legendId,
          "legend",
          [
            {
              type: "might",
              amount: -1,
              minMight: 1,
              chosenTargetId: source.id,
            },
          ],
          locationId,
        );
    }
    if (event === "combatStart" && s.combat) {
      const defender = s.combat.defender;
      for (const u of textUnits(s).filter(
        (u) => u.owner === defender && u.cardId === "sfd-126-221",
      ))
        ctx.trigger(
          s,
          defender,
          u.cardId,
          u.id,
          textEffects(u, [fx("pup", { optional: true, cardName: locationId })]),
          u.location,
        );
    }
    if (
      event === "target" &&
      ctx.choosingKind === "spell" &&
      source?.owner === p &&
      s.fields.find((f) => f.id === locationId)?.cardId === "ogn-292-298"
    ) {
      const state = s as WaveState;
      if (state.wave4Dream?.turn !== s.turn)
        state.wave4Dream = { turn: s.turn, used: [] };
      const key = `${p}:${locationId}`;
      if (!state.wave4Dream.used.includes(key)) {
        state.wave4Dream.used.push(key);
        ctx.trigger(
          s,
          p,
          "ogn-292-298",
          locationId!,
          [{ type: "draw", amount: 1 }],
          locationId,
        );
      }
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave4:")) return false;
    const key = e.custom.slice(6);
    const source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance);
    const target = s.units.find((u) => u.id === ctx.targetId);
    switch (key) {
      case "mutation": {
        const [a, b] = (ctx.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id && u.owner === p));
        if (a && b)
          a.temporaryMight += Math.max(
            0,
            ctx.getMight(s, b, false) - ctx.getMight(s, a, false),
          );
        break;
      }
      case "dance": {
        const [a, b] = (ctx.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        if (
          a &&
          !(
            a.owner !== p &&
            (a.untargetableByEnemy ||
              getKeywords(s, a).includes("Untargetable"))
          )
        )
          a.temporaryMight += 2;
        if (
          b &&
          !(
            b.owner !== p &&
            (b.untargetableByEnemy ||
              getKeywords(s, b).includes("Untargetable"))
          )
        )
          b.temporaryMight -= 2;
        break;
      }
      case "tideturner": {
        if (source && target?.owner === p) {
          const original = source.location;
          ctx.moveUnit(s, source, target.location, p);
          ctx.moveUnit(s, target, original, p);
        }
        break;
      }
      case "overt":
      case "overt-next": {
        const remaining: string[] = e.cardName
          ? JSON.parse(e.cardName)
          : s.units.filter((u) => u.owner === p).map((u) => u.id);
        const next = remaining.shift();
        if (!next) {
          run(s, p, ctx, [{ type: "buffAll" }]);
          break;
        }
        const u = s.units.find((u) => u.id === next && u.owner === p);
        if (!u?.buff) {
          run(s, p, ctx, [
            fx("overt-next", { cardName: JSON.stringify(remaining) }),
          ]);
          break;
        }
        const after = fx("overt-next", { cardName: JSON.stringify(remaining) });
        choose(s, p, ctx, [
          {
            label: `Spend ${getCard(u.cardId).name}'s buff and ready it`,
            effects: [fx("spend-ready", { cardName: u.id }), after],
          },
          { label: `Keep ${getCard(u.cardId).name}'s buff`, effects: [after] },
        ]);
        break;
      }
      case "spend-ready": {
        const u = s.units.find(
          (u) => u.id === e.cardName && u.owner === p && u.buff,
        );
        if (u) {
          spend(s, p, u, ctx);
          if (
            !u.ready &&
            !readyForbidden(s, u.owner) &&
            !getKeywords(s, u).includes("Cannot ready")
          ) {
            u.ready = true;
            ctx.cardEvent(s, "ready", p, u.cardId, u.id, u.location);
          }
        }
        break;
      }
      case "albus": {
        const units = s.units.filter((u) => u.owner === p && u.buff);
        choose(s, p, ctx, [
          ...units.map((u) => ({
            label: `Spend ${getCard(u.cardId).name}'s buff`,
            effects: [
              fx("albus-spend", { cardName: u.id, amount: e.amount ?? 0 }),
            ],
          })),
          {
            label: "Finish spending buffs",
            effects: [{ type: "channel", amount: e.amount ?? 0 }],
          },
        ]);
        break;
      }
      case "albus-spend": {
        const u = s.units.find(
          (u) => u.id === e.cardName && u.owner === p && u.buff,
        );
        if (u) spend(s, p, u, ctx);
        run(s, p, ctx, [
          fx("albus", { amount: (e.amount ?? 0) + (u ? 1 : 0) }),
        ]);
        break;
      }
      case "assault-damage":
        if (source)
          run(s, p, ctx, [
            {
              type: "damage",
              target: "enemyUnitHere",
              amount: getKeywords(s, source)
                .filter((k) => /^Assault(?: \d+)?$/.test(k))
                .reduce(
                  (n, k) => n + Number(k.split(" ")[1] ?? 1),
                  source.temporaryAssault,
                ),
            },
          ]);
        break;
      case "might-damage":
        if (source)
          run(s, p, ctx, [
            {
              type: "damage",
              target: "enemyUnitHere",
              amount: ctx.getMight(s, source),
            },
          ]);
        break;
      case "porter":
        if (target?.owner === p && ctx.locationId?.startsWith("field:"))
          ctx.moveUnit(s, target, ctx.locationId, p);
        break;
      case "pup":
        if (source && e.cardName?.startsWith("field:"))
          ctx.moveUnit(s, source, e.cardName as LocationId, p);
        break;
      case "bargain": {
        const item = s.stack.find(
          (item) => item.id === ctx.targetId && item.kind === "spell",
        );
        if (item)
          choose(s, item.player, ctx, [
            ...(ctx.canPay(s, item.player, 2, 0)
              ? [{ label: "Pay 2 Energy", effects: [fx("bargain-pay")] }]
              : []),
            {
              label: "Decline payment: counter the spell",
              effects: [{ type: "counter", target: "spell" }],
            },
          ]);
        break;
      }
      case "bargain-pay":
        ctx.pay(s, p, 2, 0);
        break;
      case "guards":
        choose(
          s,
          p,
          ctx,
          [
            `base:${p}` as LocationId,
            ...s.fields
              .filter(
                (f) =>
                  f.controller === p &&
                  !getScript(f.cardId)?.keywords?.includes(
                    "Units cannot be played here",
                  ),
              )
              .map((f) => f.id),
          ]
            .filter((location) => !e.fromHidden || location === ctx.locationId)
            .map((location) => ({
              label: `Play Sand Soldier to ${location}`,
              effects: [fx("guards-play", { cardName: location })],
            })),
        );
        break;
      case "guards-play": {
        const before = new Set(s.units.map((u) => u.id));
        ctx.spawnToken(s, p, "Sand Soldier", e.cardName as LocationId);
        const token = s.units.find((u) => !before.has(u.id));
        if (token)
          // The Unleashed errata's "Then do this" creates a reflexive trigger.
          ctx.trigger(
            s,
            p,
            "sfd-154-221",
            `guards:${token.id}`,
            [
              {
                type: "ready",
                chosenTargetId: token.id,
                optional: true,
                triggerCost: { power: 1, domain: "Order" },
              },
            ],
            token.location,
          );
        break;
      }
      case "deathgrip": {
        const [victim, recipient] = (ctx.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id && u.owner === p));
        if (victim) {
          const might = ctx.getMight(s, victim);
          ctx.killUnits(s, [victim.id]);
          if (!s.units.some((u) => u.id === victim.id) && recipient)
            recipient.temporaryMight += might;
        }
        break;
      }
      default:
        throw new Error(`Unknown Origins wave4 effect ${key}`);
    }
    return true;
  },
};
