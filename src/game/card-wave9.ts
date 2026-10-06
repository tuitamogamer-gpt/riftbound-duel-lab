import { cards, getCard } from "../data/cards";
import { canonicalCardName } from "../data/card-identity";
import { isFace } from "./board-rules";
import type { ExpansionModule } from "./later-precon-engine";
import type { CardScript, Effect, GameState, PlayerId } from "./types";

const plain: CardScript = { implemented: true };
const fx = (key: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave9:${key}`,
  ...extra,
});
export const cardWave9Scripts: Record<string, CardScript> = {
  "ogn-032-298": {
    ...plain,
    abilities: [
      {
        label: "Give the next spell 1 Bonus Damage",
        exhaust: true,
        effects: [fx("spell-bonus")],
      },
    ],
  },
  "ogn-221-298": { ...plain, action: true, spell: [fx("imperial-decree")] },
  "ogn-254-298": {
    ...plain,
    action: true,
    spell: [fx("guillotine", { target: "anyUnit" })],
  },
  "sfd-189-221": {
    ...plain,
    abilities: [
      {
        label: "Add one Power for gear",
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "power", amount: 1, condition: "gearOnly" }],
      },
    ],
  },
  "sfd-197-221": {
    ...plain,
    abilities: [
      {
        label: "Play a Sand Soldier",
        energy: 1,
        exhaust: true,
        condition: "playedEquipment",
        effects: [
          {
            type: "token",
            cardName: "Sand Soldier",
            location: "base",
            amount: 1,
          },
        ],
      },
    ],
  },
  "unl-029-219": {
    ...plain,
    accelerating: true,
    onConquer: [{ type: "buff", target: "friendlyUnit" }],
  },
  "unl-087-219": { ...plain, shield: 2, onHold: [fx("main-power")] },
};
for (const c of cards.filter((c) => c.set === "VEN" && !c.variant)) {
  if ([24, 44, 53, 161].includes(c.collectorNumber))
    cardWave9Scripts[c.id] = plain;
  if (c.collectorNumber === 132)
    cardWave9Scripts[c.id] = { ...plain, onPlay: [fx("name-spell")] };
}

export function gearAbilityDiscount(s: GameState, p: PlayerId) {
  return s.players[p].firstGearAbilityTurn === s.turn
    ? 0
    : s.fields.filter((f) => f.controller === p && isFace(f.cardId, "VEN", 161))
        .length;
}
export const hasSandWeaponmaster = (
  s: GameState,
  p: PlayerId,
  cardId: string,
) =>
  isFace(s.players[p].legendId, "SFD", 197) &&
  getCard(cardId).tags.includes("Sand Soldier");

export const cardWave9Module: ExpansionModule = {
  cost(s, p) {
    return {
      energy: -(s.players[p].nextCardEnergyDiscount ?? 0),
      power: -(s.players[p].nextCardPowerDiscount ?? 0),
    };
  },
  keywords(s, u) {
    return hasSandWeaponmaster(s, u.owner, u.cardId) ? ["Weaponmaster"] : [];
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const player = s.players[p];
    if (event === "cardFinalized") {
      player.nextCardEnergyDiscount = 0;
      player.nextCardPowerDiscount = 0;
      if (getCard(cardId).tags.includes("Equipment"))
        player.equipmentPlayedTurn = s.turn;
    }
    if (event === "unitPlayed" && sourceId && hasSandWeaponmaster(s, p, cardId))
      ctx.trigger(
        s,
        p,
        cardId,
        sourceId,
        [
          {
            type: "special",
            custom: "sfd:weaponmaster",
            target: "friendlyEquipment",
            optional: true,
          },
        ],
        locationId,
      );
    if (event === "play" && ctx.playOrdinal === 1)
      for (const u of s.units.filter(
        (u) =>
          u.owner === p &&
          isFace(u.cardId, "VEN", 44) &&
          u.location.startsWith("field:"),
      ))
        ctx.trigger(s, p, u.cardId, u.id, [fx("next-card")], u.location);
    if (event === "main" && player.nextMainPower) {
      player.power = (player.power ?? 0) + player.nextMainPower;
      player.nextMainPower = 0;
    }
    if (event === "combatEnd" && s.combat?.engaged)
      for (const u of s.units.filter(
        (u) =>
          isFace(u.cardId, "VEN", 24) &&
          u.damageTakenTurn !== s.turn &&
          (s.combat?.designatedUnits?.includes(u.id) ??
            u.location === locationId),
      ))
        ctx.trigger(
          s,
          u.owner,
          u.cardId,
          u.id,
          [{ type: "draw", amount: 1 }],
          u.location,
        );
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave9:")) return false;
    const player = s.players[p];
    switch (e.custom.slice(6)) {
      case "spell-bonus":
        player.nextSpellBonus = (player.nextSpellBonus ?? 0) + 1;
        break;
      case "next-card":
        player.nextCardEnergyDiscount =
          (player.nextCardEnergyDiscount ?? 0) + 2;
        player.nextCardPowerDiscount = (player.nextCardPowerDiscount ?? 0) + 2;
        break;
      case "main-power":
        player.nextMainPower = (player.nextMainPower ?? 0) + 1;
        break;
      case "imperial-decree":
        (s.damageTriggers ??= []).push({
          player: p,
          cardId: "ogn-221-298",
          turn: s.turn,
        });
        break;
      case "guillotine": {
        const unit = s.units.find((u) => u.id === ctx.targetId);
        if (!unit) break;
        if (player.cardsPlayedThisTurn > 1) ctx.killUnits(s, [unit.id]);
        else
          (s.damageTriggers ??= []).push({
            player: p,
            cardId: "ogn-254-298",
            turn: s.turn,
            targetId: unit.id,
          });
        break;
      }
      case "damage-kill":
        ctx.killUnits(s, [e.cardName!]);
        break;
      case "name-spell": {
        const seen = new Set<string>();
        ctx.openChoice(s, p, {
          sourceId: ctx.sourceId,
          options: cards
            .filter((c) => {
              if (c.type !== "Spell") return false;
              const name = canonicalCardName(c.name);
              if (seen.has(name)) return false;
              seen.add(name);
              return true;
            })
            .map((c) => ({
              id: `choose-custom:wave9-name:${c.id}`,
              player: p,
              category: "ability",
              cardId: c.id,
              label: `Name ${c.name}`,
              effects: [
                fx("named-spell", { cardName: canonicalCardName(c.name) }),
              ],
            })),
        });
        break;
      }
      case "named-spell": {
        const source = s.units.find((u) => u.id === ctx.sourceId);
        if (source) source.namedSpell = e.cardName;
        break;
      }
    }
    return true;
  },
};
