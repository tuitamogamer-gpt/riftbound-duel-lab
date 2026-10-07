import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { recycleCards, recycleRunes } from "./zone-events";
import { isCardType } from "../data/cards";
import { ruleFamily } from "./rule-families";
import { getCard } from "../data/cards";
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
const special = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave3:${custom}`,
  ...extra,
});
const self = (type: Effect["type"], amount?: number): Effect => ({
  type,
  condition: "self",
  ...(amount === undefined ? {} : { amount }),
});
const paid = (
  effects: Effect[],
  cost: NonNullable<Effect["triggerCost"]>,
): Effect[] =>
  effects.map((e, i) => (i ? e : { ...e, optional: true, triggerCost: cost }));
const dravenBoost = () =>
  paid([self("might", 2)], { power: 1, domain: "Fury" });
export const originsWave3Scripts: Record<string, CardScript> = {
  "ogn-034-298": plain,
  "ogn-035-298": {
    ...plain,
    assault: 3,
    keywords: ["Assault 3"],
    onConquer: paid([self("bounce")], { energy: 1 }),
  },
  "ogn-068-298": {
    ...plain,
    keywords: ["Backline"],
    abilities: [
      {
        label: "Deal damage equal to my Might",
        exhaust: true,
        condition: "sourceAtBattlefield",
        effects: [special("caitlyn", { target: "unitAtBattlefield" })],
      },
    ],
  },
  "ogn-071-298": { ...plain, spell: [special("party-favors")] },
  "ogn-249-298": plain,
  "sfd-003-221": {
    ...plain,
    action: true,
    repeat: { energy: 1 },
    spell: [{ type: "assault", amount: 2, target: "anyUnit" }],
  },
  "sfd-014-221": plain,
  "sfd-015-221": { ...plain, keywords: ["Play only to conquered battlefield"] },
  "sfd-040-221": {
    ...plain,
    action: true,
    repeat: { energy: 2 },
    spell: [{ type: "stun", target: "attackingUnit" }],
  },
  "sfd-020-221": { ...plain, onAttack: dravenBoost(), onDefend: dravenBoost() },
  // Finalization chooses the public legend; the unbulleted ready/exhaust choice remains at resolution.
  "sfd-039-221": {
    ...plain,
    onPlay: [
      special("royal-choice", {
        modes: ([0, 1] as const).map((owner) => ({
          label: `Choose player ${owner + 1}'s legend`,
          effects: [special("royal-state", { amount: owner })],
        })),
      }),
    ],
  },
  "sfd-046-221": { ...plain, onPlay: [{ type: "draw", amount: 1 }] },
  "sfd-057-221": { ...plain, deflect: 1, keywords: ["Deflect"] },
  "sfd-063-221": plain,
  "sfd-077-221": {
    ...plain,
    repeat: { energy: 4, power: 1, domain: "Mind" },
    spellModes: [
      {
        label: "Deal 4 to a unit in a base",
        effects: [{ type: "damage", amount: 4, target: "unitInBase" }],
      },
      { label: "Kill a gear", effects: [{ type: "kill", target: "anyGear" }] },
    ],
  },
  "sfd-081-221": { ...plain, onPlay: [special("card-sharp")] },
  "sfd-083-221": plain,
  "sfd-117-221": plain,
  "sfd-120-221": { ...plain, deflect: 2, keywords: ["Deflect 2"] },
  "sfd-122-221": {
    ...plain,
    action: true,
    repeat: { power: 1, domain: "Chaos" },
    spell: [special("called-shot")],
  },
  "sfd-142-221": plain,
  "sfd-144-221": plain,
  "sfd-148-221": { ...plain, deflect: 1, keywords: ["Deflect"] },
  "sfd-169-221": plain,
  "sfd-195-221": plain,
  "sfd-201-221": plain,
  "sfd-210-221": {
    ...plain,
    onConquer: paid([special("ready-legend")], { energy: 1 }),
  },
  "sfd-214-221": {
    ...plain,
    onHold: paid([{ type: "score", amount: 1 }], { power: 4 }),
  },
};
type WaveState = GameState & { wave3CombatWin?: Record<string, number> };
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const opt = (
  p: PlayerId,
  key: string,
  label: string,
  effects: Effect[],
): GameAction => ({
  id: `choose-custom:wave3:${key}`,
  player: p,
  category: "ability",
  label,
  effects,
});
function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: GameAction[],
) {
  if (options.length)
    ctx.openChoice(s, p, {
      options,
      sourceId: ctx.sourceId,
      locationId: ctx.locationId,
    });
}
export const originsWave3Module: ExpansionModule = {
  keywords(s) {
    return textUnits(s).some((u) => u.cardId === "sfd-014-221")
      ? ["Cannot move to base"]
      : [];
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave3:")) return false;
    const source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance);
    switch (e.custom.slice(6)) {
      case "caitlyn": {
        const might = source ? ctx.getMight(s, source) : undefined;
        if (might !== undefined)
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: might, target: "unitAtBattlefield" }],
            ctx.targetId,
            ctx.sourceId,
            ctx.locationId,
          );
        break;
      }
      case "party-favors": {
        const opponent = other(p);
        choose(s, opponent, ctx, [
          opt(opponent, "party-cards", "Both players draw 1", [
            special("party-cards"),
          ]),
          opt(opponent, "party-runes", "Both players channel 1 exhausted", [
            special("party-runes"),
          ]),
        ]);
        break;
      }
      case "party-cards":
        ctx.draw(s, 0, 1);
        ctx.draw(s, 1, 1);
        break;
      case "party-runes":
        ctx.channel(s, 0, 1, false);
        ctx.channel(s, 1, 1, false);
        break;
      case "royal-choice":
        throw new Error(
          "Royal Entourage's choices must be finalized before resolution.",
        );
      case "royal-state":
        choose(s, p, ctx, [
          opt(p, "royal-ready", "Ready the chosen legend", [
            special("legend-state", { amount: e.amount, ready: true }),
          ]),
          opt(p, "royal-exhaust", "Exhaust the chosen legend", [
            special("legend-state", { amount: e.amount, ready: false }),
          ]),
        ]);
        break;
      case "legend-state":
        s.players[e.amount as PlayerId].legendUsedTurn = e.ready ? -1 : s.turn;
        break;
      case "ready-legend":
        s.players[p].legendUsedTurn = -1;
        break;
      case "gold":
        ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
        break;
      case "card-sharp":
      case "card-sharp-next": {
        const caster = e.amount === undefined ? p : (e.amount as PlayerId);
        const owner = e.custom.endsWith("-next") ? other(caster) : caster;
        const after =
          owner === caster
            ? [special("card-sharp-next", { amount: caster })]
            : [];
        choose(s, owner, ctx, [
          opt(owner, "sharp-yes", "Play an exhausted Gold", [
            special("card-sharp-gold", { amount: caster }),
            ...after,
          ]),
          opt(owner, "sharp-no", "Decline playing Gold", after),
        ]);
        break;
      }
      case "card-sharp-gold": {
        ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
        const caster = e.amount as PlayerId;
        if (caster !== p)
          ctx.spawnToken(s, caster, "Gold", `base:${caster}`, false);
        break;
      }
      case "called-shot":
        choose(
          s,
          p,
          ctx,
          s.players[p].deck
            .slice(0, e.lookCount ?? 2)
            .map((id, i) =>
              opt(p, `called:${i}`, `Draw ${getCard(id).name}`, [
                special("called-draw", { amount: i }),
              ]),
            ),
        );
        break;
      case "called-draw": {
        const cards = s.players[p].deck.splice(0, e.lookCount ?? 2),
          i = e.amount!;
        if (cards[i]) {
          s.players[p].deck.unshift(cards.splice(i, 1)[0]);
          ctx.draw(s, p, 1);
        }
        recycleCards(s, p, [...cards], p);
        break;
      }
      case "altar": {
        ctx.draw(s, p, 1);
        choose(
          s,
          p,
          ctx,
          s.players[p].hand.flatMap((id, index) =>
            [true, false].map((top) =>
              opt(
                p,
                `altar:${index}:${top}`,
                `Put ${getCard(id).name} on ${top ? "top" : "bottom"}`,
                [
                  special("altar-return", {
                    amount: index,
                    ready: top,
                    cardName: id,
                  }),
                ],
              ),
            ),
          ),
        );
        break;
      }
      case "altar-return": {
        const x = s.players[p];
        if (x.hand[e.amount!] !== e.cardName) break;
        const [id] = x.hand.splice(e.amount!, 1);
        if (e.ready) x.deck.unshift(id);
        else recycleCards(s, p, [id], p);
        break;
      }
      default:
        throw new Error(`Unknown wave3 effect ${e.custom}`);
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const u = s.units.find((u) => u.id === sourceId);
    const trig = (unit: Unit, effects: Effect[]) =>
      ctx.trigger(
        s,
        unit.owner,
        unit.cardId,
        unit.id,
        textEffects(unit, effects),
        unit.location,
      );
    if (
      event === "unitPlayed" &&
      u &&
      ruleFamily(u.cardId) === "ogn-035-298" &&
      s.fields.some((f) => f.controller === other(u.owner))
    )
      u.ready = true;
    if (
      event === "play" &&
      u &&
      isCardType(getCard(cardId), "Unit") &&
      ruleFamily(s.players[p].legendId) === "ogn-249-298" &&
      ctx.getMight(s, u) >= 5
    )
      ctx.trigger(
        s,
        p,
        "ogn-249-298",
        "legend",
        paid([{ type: "channel", amount: 1 }], { exhaust: true }),
        locationId,
      );
    if (
      event === "play" &&
      isCardType(getCard(cardId), "Spell") &&
      s.currentPlayer !== p
    )
      for (const g of s.gears.filter(
        (g) => g.owner === p && g.cardId === "sfd-063-221",
      ))
        ctx.trigger(
          s,
          p,
          g.cardId,
          g.id,
          textEffects(g, paid([special("gold")], { exhaust: true })),
          `base:${p}`,
        );
    if (
      (event === "target" || event === "ready") &&
      u &&
      u.owner === p &&
      u.cardId === "sfd-057-221"
    )
      trig(u, [self("might", 1)]);
    if (event === "target" && u && u.owner === p) {
      if (u.cardId === "sfd-142-221" && ctx.choosingKind === "spell")
        trig(u, [{ type: "draw", amount: 1 }]);
      for (const g of s.gears.filter(
        (g) => g.owner === p && g.cardId === "sfd-144-221",
      ))
        ctx.trigger(
          s,
          p,
          g.cardId,
          g.id,
          textEffects(
            g,
            paid([{ type: "draw", amount: 1 }], { energy: 1, exhaust: true }),
          ),
          `base:${p}`,
        );
      if (s.players[p].legendId === "sfd-195-221")
        ctx.trigger(
          s,
          p,
          "sfd-195-221",
          "legend",
          paid([{ type: "ready", chosenTargetId: u.id }], {
            power: 1,
            exhaust: true,
          }),
          u.location,
        );
    }
    if (event === "conquer") {
      if (s.players[p].legendId === "sfd-195-221")
        ctx.trigger(
          s,
          p,
          "sfd-195-221",
          "legend",
          paid([special("ready-legend")], { energy: 1 }),
          locationId,
        );
      if (
        s.combat?.attacker === p &&
        s.combat.engaged &&
        (s.lastExcessDamage ?? 0) >= 5
      )
        for (const unit of own(s, p).filter(
          (u) =>
            u.location === locationId &&
            s.combat?.designatedUnits?.includes(u.id),
        )) {
          if (unit.cardId === "ogn-034-298")
            trig(unit, [{ type: "score", amount: 1 }]);
          if (unit.cardId === "sfd-120-221")
            trig(unit, [
              {
                type: "damage",
                amount: s.lastExcessDamage,
                target: "enemyUnit",
                optional: true,
              },
            ]);
        }
    }
    if (event === "hold" && s.players[p].legendId === "sfd-201-221")
      ctx.trigger(
        s,
        p,
        "sfd-201-221",
        "legend",
        paid([special("gold")], { exhaust: true }),
        locationId,
      );
    if (event === "combatEnd" && s.combat?.engaged && locationId) {
      const survivors = s.units.filter((u) => u.location === locationId);
      for (const unit of survivors.filter(
        (u) => u.cardId === "sfd-020-221" || u.cardId === "sfd-148-221",
      ))
        if (survivors.every((u) => u.owner === unit.owner)) {
          if (unit.cardId === "sfd-020-221") trig(unit, [special("gold")]);
          else {
            const wins = ((s as WaveState).wave3CombatWin ??= {});
            if (wins[unit.id] !== s.turn) {
              wins[unit.id] = s.turn;
              trig(unit, [{ type: "score", amount: 1 }]);
            }
          }
        }
    }
    if (event === "death" && u) {
      if (
        u.cardId === "sfd-148-221" &&
        s.combat?.engaged &&
        u.location === s.combat.fieldId
      )
        trig(u, [{ type: "score", who: "opponent", amount: 1 }]);
      for (const gear of s.gears.filter(
        (g) => g.owner === u.owner && g.cardId === "sfd-169-221",
      ))
        ctx.trigger(
          s,
          u.owner,
          gear.cardId,
          gear.id,
          textEffects(gear, paid([special("altar")], { exhaust: true })),
          `base:${u.owner}`,
        );
    }
  },
  actions(s, p, ctx) {
    if (s.phase !== "main" && s.phase !== "showdown") return [];
    const out: GameAction[] = [];
    for (const g of s.gears.filter((g) => g.owner === p && g.ready)) {
      if (
        g.cardId === "sfd-046-221" &&
        s.phase === "main" &&
        !s.stack.length &&
        s.currentPlayer === p &&
        ctx.canPay(s, p, 1, 1, ["Calm"])
      )
        out.push({
          id: `wave3:snax:${g.id}`,
          player: p,
          sourceId: g.id,
          cardId: g.cardId,
          label: "Pay 1 Energy and Calm, exhaust and kill Poro Snax: draw 1",
          category: "ability",
        });
      if (g.cardId !== "sfd-083-221" && g.cardId !== "sfd-117-221") continue;
      const toEnergy = g.cardId === "sfd-083-221";
      const max = toEnergy
        ? (s.players[p].power ?? 0) + s.players[p].runes.length
        : s.players[p].energy +
          s.players[p].runes.filter((r) => r.ready).length;
      for (let amount = 0; amount <= max; amount++)
        if (
          ctx.canPay(s, p, toEnergy ? 0 : amount, 0, [], toEnergy ? amount : 0)
        )
          out.push({
            id: `wave3:convert:${g.id}:${amount}`,
            player: p,
            sourceId: g.id,
            cardId: g.cardId,
            amount,
            label: `Exhaust ${getCard(g.cardId).name}: convert ${amount} ${toEnergy ? "Power to Energy" : "Energy to Power"}`,
            category: "resource",
          });
    }
    return out;
  },
  apply(s, a, ctx) {
    if (a.id.startsWith("wave3:snax:")) {
      ctx.pay(s, a.player, 1, 1, ["Calm"]);
      const gear = s.gears.find((g) => g.id === a.sourceId)!;
      gear.ready = false;
      ctx.killGear(s, gear.id);
      ctx.pushStack(s, {
        player: a.player,
        cardId: a.cardId!,
        sourceId: a.sourceId,
        effects: [{ type: "draw", amount: 1 }],
        kind: "ability",
      });
      return true;
    }
    if (a.id.startsWith("wave3:convert:")) {
      const gear = s.gears.find((g) => g.id === a.sourceId)!;
      gear.ready = false;
      const toEnergy = gear.cardId === "sfd-083-221",
        n = a.amount ?? 0;
      ctx.pay(s, a.player, toEnergy ? 0 : n, 0, [], toEnergy ? n : 0);
      if (toEnergy) s.players[a.player].energy += n;
      else s.players[a.player].power = (s.players[a.player].power ?? 0) + n;
      return true;
    }
    if (
      a.id.startsWith("gold:") &&
      s.players[a.player].legendId === "sfd-201-221"
    ) {
      ctx.killGear(s, a.sourceId!);
      s.players[a.player].power = (s.players[a.player].power ?? 0) + 1;
      if (s.players[a.player].points >= 5) s.players[a.player].energy++;
      return true;
    }
    return false;
  },
};
