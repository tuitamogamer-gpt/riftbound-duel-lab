import { recycleCards, recycleRunes } from "./zone-events";
import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import type { ExpansionModule } from "./later-precon-engine";
import type { CardScript, Effect } from "./types";

const plain: CardScript = { implemented: true };
const group = (type: Effect["type"], extra: Partial<Effect> = {}): Effect => ({
  type,
  target: "boardCards",
  cardTypes: ["Unit"],
  upTo: true,
  who: "all",
  ...extra,
});
const teemo: Effect = {
  type: "special",
  custom: "wave8:teemo",
  target: "enemyUnitHere",
};

export const cardWave8Scripts: Record<string, CardScript> = {
  "ogn-110-298": {
    ...plain,
    accelerating: true,
    onDeath: [
      { type: "readyRunes", amount: 1000, triggerCost: { recycleSelf: true } },
    ],
  },
  "ogn-121-298": {
    ...plain,
    hidden: true,
    onDefend: [teemo],
  },
  "ogn-256-298": {
    ...plain,
    action: true,
    hidden: true,
    spell: [
      group("kill", {
        group: { sameLocation: true, atBattlefield: true, totalMight: 4 },
      }),
    ],
  },
  "sfd-010-221": plain,
  "sfd-043-221": {
    ...plain,
    action: true,
    hidden: true,
    spell: [
      group("moveTarget", {
        who: "self",
        group: { sameLocation: true, atBattlefield: true, destination: "base" },
      }),
    ],
  },
  "sfd-128-221": {
    ...plain,
    onDefend: [
      {
        type: "moveTarget",
        target: "enemyAttackingUnit",
        optional: true,
        triggerCost: { sacrificeSelf: true },
      },
    ],
  },
  "sfd-164-221": {
    ...plain,
    action: true,
    spell: [{ type: "kill", target: "unitAtBattlefield" }],
  },
  "sfd-177-221": {
    ...plain,
    accelerating: true,
    onAttack: [
      group("moveTarget", {
        who: "self",
        optional: true,
        group: { tokensOnly: true, destination: "here" },
      }),
    ],
  },
  "unl-054-219": {
    ...plain,
    spell: [
      group("moveTarget", {
        who: "opponent",
        group: { totalMight: 8, destination: "any" },
      }),
    ],
  },
};
// Exact provider faces; the registry compares all gameplay attributes for reprints.
for (const card of cards.filter((c) => c.set === "VEN" && !c.variant)) {
  if (card.collectorNumber === 91)
    cardWave8Scripts[card.id] = {
      ...plain,
      onAttack: [
        group("moveTarget", {
          who: "opponent",
          maxMight: 5,
          optional: true,
          group: { here: true, destination: "base" },
        }),
      ],
    };
  if (card.collectorNumber === 107)
    cardWave8Scripts[card.id] = {
      ...plain,
      spell: [
        group("bounce", {
          who: "opponent",
          targetDomain: "Order",
          group: { totalMight: 5 },
        }),
      ],
    };
  if (card.collectorNumber === 150)
    cardWave8Scripts[card.id] = {
      ...plain,
      spell: [
        group("ready", { cardTypes: ["Unit", "Gear", "Rune"], targetCount: 4 }),
      ],
    };
}

export const cardWave8Module: ExpansionModule = {
  effect(s, p, e, ctx) {
    if (e.custom !== "wave8:teemo") return false;
    const revealed = s.players[p].deck.splice(0, e.lookCount ?? 5);
    // Reveal is public; it neither draws nor discards the inspected cards.
    ctx.log?.(
      s,
      `Teemo reveals ${revealed.map((id) => getCard(id).name).join(", ") || "no cards"}.`,
      "play",
      p,
    );
    for (const id of revealed) ctx.cardEvent(s, "reveal", p, id);
    const amount = revealed.filter((id) =>
      /\[Hidden\]/.test(getCard(id).text),
    ).length;
    ctx.runEffects(
      s,
      p,
      [
        {
          type: "damage",
          damageSource: "unit",
          amount,
          target: "enemyUnitHere",
        },
      ],
      ctx.targetId,
      ctx.sourceId,
      ctx.locationId,
    );
    recycleCards(s, p, [...(ctx.shuffle?.(s, revealed) ?? revealed)], p);
    return true;
  },
};

export const discountedOutsideHand = (cardId: string) =>
  isFace(cardId, "SFD", 10) || isFace(cardId, "SFD", 164);
