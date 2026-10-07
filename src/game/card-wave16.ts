import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { cards, getCard } from "../data/cards";
import { isFace, disempower } from "./board-rules";
import { control, detach } from "./objects";
import { banishCard, takeBanished } from "./banishment";
import { instructedPlay } from "./card-wave13";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  PlayerId,
} from "./types";
const plain: CardScript = { implemented: true };
export const w16 = (custom: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave16:${custom}`,
  ...rest,
});
export const option = (
  p: PlayerId,
  id: string,
  label: string,
  effects: Effect[],
  cardId?: string,
): GameAction => ({
  id: `choose-custom:${id}`,
  player: p,
  category: "ability",
  label,
  effects,
  cardId,
});
export function choices(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: GameAction[],
) {
  if (options.length)
    ctx.openChoice(s, p, {
      options,
      sourceId: ctx.sourceId,
      targetId: ctx.targetId,
      locationId: ctx.locationId,
    });
}
export const cardWave16Scripts: Record<string, CardScript> = {
  "ogn-025-298": { ...plain, action: true, spell: [w16("blind-fury")] },
  "ogn-080-298": {
    ...plain,
    reaction: true,
    spell: [w16("take-spell", { target: "spell" })],
  },
  "ogn-203-298": {
    ...plain,
    action: true,
    spell: [w16("control", { target: "enemyUnitAtBattlefield" })],
  },
  "sfd-109-221": {
    ...plain,
    additionalCost: { power: 2, domain: "Body" },
    onPlay: [
      {
        type: "special",
        custom: "sfd:weaponmaster",
        target: "friendlyEquipment",
        optional: true,
      },
    ],
  },
  "sfd-202-221": {
    ...plain,
    hidden: true,
    spell: [w16("takeover", { target: "enemyUnitAtBattlefield" })],
  },
  "unl-140-219": {
    ...plain,
    additionalCost: { xp: 5 },
    spell: [
      w16("conscription", { target: "enemyUnitAtBattlefield", maxMight: 3 }),
    ],
  },
  "unl-169-219": { ...plain, onPlay: [w16("ashe")] },
  "unl-139-219": {
    ...plain,
    hidden: true,
    spell: [w16("skewer", { target: "battlefield" })],
  },
  "ven-114-166": {
    ...plain,
    abilities: [
      {
        label: "Empower",
        energy: 6,
        power: 2,
        domain: "Chaos",
        condition: "sourceNotEmpowered",
        effects: [{ type: "special", custom: "wave14:empower-source" }],
      },
    ],
  },
};
for (const c of cards.filter((c) => c.set === "VEN")) {
  if (c.collectorNumber === 133)
    cardWave16Scripts[c.id] = {
      ...plain,
      abilities: [
        {
          label: "Empower",
          power: 2,
          condition: "sourceNotEmpowered",
          effects: [{ type: "special", custom: "wave14:empower-source" }],
        },
        {
          label: "Give Glowstone to a player",
          disempowerSelf: true,
          exhaust: true,
          effects: [w16("glowstone")],
        },
      ],
    };
  if (c.collectorNumber === 152)
    cardWave16Scripts[c.id] = {
      ...plain,
      reaction: true,
      spell: [w16("rebuttal", { target: "spell", maxEnergy: 4 })],
    };
}
export const cardWave16Module: ExpansionModule = {
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    if (name === "stateChanged" || name === "end") {
      for (const effect of [...(s.controlEffects ?? [])].reverse()) {
        if (
          (effect.sourceId && !s.units.some((u) => u.id === effect.sourceId)) ||
          (name === "end" && effect.endTurn === s.turn)
        ) {
          const o = [...s.units, ...s.gears].find((o) => o.id === effect.id);
          if (o) {
            control(s, o, effect.previous);
            if ("location" in o) o.location = `base:${o.owner}`;
          }
          s.controlEffects = s.controlEffects!.filter((e) => e !== effect);
        }
      }
    }
    if (name === "hold") {
      for (const entry of (s.heldBanishments ?? []).filter(
        (e) => e.owner === p,
      )) {
        const card = takeBanished(s, p, entry.id);
        if (card) s.players[p].hand.push(card);
      }
      s.heldBanishments = s.heldBanishments?.filter((e) => e.owner !== p);
    }
    if (name === "play" && isFace(cardId, "SFD", 109) && ctx.paidAdditionalCost)
      ctx.trigger(
        s,
        p,
        cardId,
        sourceId!,
        [w16("akshan", { target: "enemyGear" })],
        locationId,
      );
    if (name === "empower")
      for (const u of textSources(
        s,
        s.units.find((u) => u.id === sourceId),
      ))
        if (isFace(u.cardId, "VEN", 114))
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            textEffects(u, [
              { type: "mill", amount: 3, who: "opponent" },
              w16("kharox"),
            ]),
            locationId,
          );
    if (name === "end")
      for (const gear of s.gears.filter(
        (g) => g.owner === p && !g.attachedTo && isFace(g.cardId, "VEN", 133),
      ))
        ctx.trigger(
          s,
          p,
          gear.cardId,
          gear.id,
          textEffects(gear, [w16("glowstone-end")]),
        );
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave16:")) return false;
    const key = e.custom.slice(7),
      enemy = (1 - p) as PlayerId;
    const unit = s.units.find((u) => u.id === ctx.targetId);
    const source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance);
    const gear = s.gears.find((g) => g.id === ctx.sourceId);
    switch (key) {
      case "control":
      case "takeover":
      case "conscription":
        if (unit && unit.owner !== p && unit.location.startsWith("field:")) {
          const previous = unit.owner;
          control(s, unit, p);
          if (key === "takeover") {
            ctx.runEffects(s, p, [{ type: "ready", chosenTargetId: unit.id }]);
            (s.controlEffects ??= []).push({
              id: unit.id,
              previous,
              endTurn: s.turn,
            });
          } else {
            unit.location = `base:${p}`;
            if (key === "conscription") unit.ready = false;
          }
        }
        break;
      case "akshan": {
        const target = s.gears.find(
          (g) => g.id === ctx.targetId && g.owner !== p,
        );
        if (!target || !source) break;
        const previous = target.owner;
        detach(s, target);
        control(s, target, p);
        (s.controlEffects ??= []).push({
          id: target.id,
          previous,
          sourceId: source.id,
        });
        if (getCard(target.cardId).tags.includes("Equipment"))
          ctx.runEffects(s, p, [{ type: "equip" }], source.id, target.id);
        break;
      }
      case "blind-fury":
        ctx.runEffects(s, p, [
          {
            type: "playCard",
            play: {
              zone: "top",
              zoneOwner: enemy,
              count: 1,
              revealed: true,
              ignoreCost: true,
            },
          },
        ]);
        break;
      case "ashe": {
        ctx.log?.(
          s,
          `Revealed hand: ${s.players[enemy].hand.map((id) => getCard(id).name).join(", ")}.`,
          "info",
          enemy,
        );
        choices(
          s,
          p,
          ctx,
          s.players[enemy].hand.map((id, i) =>
            option(
              p,
              `ashe:${i}`,
              `Banish ${getCard(id).name}`,
              [w16("ashe-banish", { amount: i })],
              id,
            ),
          ),
        );
        break;
      }
      case "ashe-banish": {
        const cardId = s.players[enemy].hand.splice(e.amount!, 1)[0];
        if (cardId) {
          const id = banishCard(s, enemy, cardId);
          (s.heldBanishments ??= []).push({ id, cardId, owner: enemy });
          ctx.cardEvent(s, "banish", enemy, cardId);
        }
        break;
      }
      case "skewer": {
        ctx.log?.(
          s,
          `Revealed hand: ${s.players[enemy].hand.map((id) => getCard(id).name).join(", ")}.`,
          "info",
          enemy,
        );
        ctx.runEffects(s, p, [
          {
            type: "playCard",
            play: {
              zone: "hand",
              zoneOwner: enemy,
              controller: enemy,
              cardTypes: ["Unit"],
              optional: true,
              ignoreCost: true,
              ignoreAllCosts: true,
              destination: "here",
              locationId: ctx.targetId as "field:0",
              stunAfterPlay: true,
            },
          },
        ]);
        break;
      }
      case "kharox":
        ctx.trigger(
          s,
          p,
          getCard("ven-114-166").id,
          ctx.sourceId!,
          [
            w16("kharox-play", {
              target: "trashCards",
              who: "opponent",
              cardTypes: ["Unit"],
              optional: true,
            }),
          ],
          ctx.locationId,
        );
        break;
      case "kharox-play":
        ctx.runEffects(
          s,
          p,
          [
            instructedPlay({
              zone: "trash",
              zoneOwner: enemy,
              sourceRef: ctx.targetId,
              cardTypes: ["Unit"],
              ignoreCost: true,
            }),
          ],
          ctx.targetId,
        );
        break;
      case "glowstone":
        choices(
          s,
          p,
          ctx,
          ([0, 1] as const).map((owner) =>
            option(
              p,
              `glowstone:${owner}`,
              `Give to ${s.players[owner].name}`,
              [w16("glowstone-give", { amount: owner })],
            ),
          ),
        );
        break;
      case "glowstone-give":
        if (gear) {
          disempower(gear);
          detach(s, gear);
          control(s, gear, e.amount as PlayerId);
        }
        break;
      case "glowstone-end":
        if (gear) ctx.killGear(s, gear.id);
        ctx.runEffects(s, p, [
          {
            type: "damageAll",
            amount: 5,
            who: "self",
            condition: "allLocations",
          },
        ]);
        break;
      case "take-spell":
        ctx.takeSpell!(s, p, ctx.targetId!);
        break;
      case "rebuttal":
        choices(s, p, ctx, [
          option(p, "rebuttal:counter", "Counter the spell", [
            { type: "counter", target: "spell", maxEnergy: 4 },
          ]),
          ...(ctx.canPay(s, p, 0, 1)
            ? [
                option(p, "rebuttal:take", "Pay 1 Power and take control", [
                  w16("rebuttal-pay"),
                ]),
              ]
            : []),
        ]);
        break;
      case "rebuttal-pay":
        if (ctx.canPay(s, p, 0, 1)) {
          ctx.pay(s, p, 0, 1);
          ctx.takeSpell!(s, p, ctx.targetId!);
        }
        break;
    }
    return true;
  },
};
