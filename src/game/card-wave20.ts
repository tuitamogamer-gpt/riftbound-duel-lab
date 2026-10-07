import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import { instructedPlay } from "./card-wave13";
import type { CardScript, Effect } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
const fx = (key: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave20:${key}`,
  ...rest,
});
export const cardWave20Scripts: Record<string, CardScript> = {
  "ogn-150-298": {
    ...plain,
    accelerating: true,
    assault: 1,
    keywords: ["Assault"],
    additionalCost: {
      board: { kind: "spendBuff", multiple: true, discount: "powerEach" },
    },
  },
  "ogn-231-298": {
    ...plain,
    deflect: 1,
    keywords: ["Ganking", "Deflect"],
    additionalCost: {
      board: { kind: "killUnit", multiple: true, discount: "powerEach" },
    },
  },
  "unl-142-219": {
    ...plain,
    reaction: true,
    additionalCost: { required: true, board: { kind: "killUnit" } },
    spell: [
      instructedPlay({ zone: "trash", cardTypes: ["Unit"], ignoreCost: true }),
    ],
  },
  "unl-166-219": {
    ...plain,
    ambush: true,
    additionalCost: {
      required: true,
      board: {
        kind: "killUnit",
        tags: ["Bird", "Cat", "Dog", "Poro"],
        allowCostLocation: true,
      },
    },
  },
  "unl-170-219": {
    ...plain,
    keywords: ["Ganking"],
    additionalCost: { board: { kind: "killUnit", discount: "energyPower" } },
    onAttack: [fx("atakhan")],
  },
};
for (const c of cards.filter(
  (c) => c.set === "VEN" && c.collectorNumber === 67,
))
  cardWave20Scripts[c.id] = plain;
export const cardWave20Module: ExpansionModule = {
  event(s, name, p, _cardId, _sourceId, _location, ctx) {
    if (name === "main")
      for (const gear of s.gears.filter(
        (g) => g.owner === p && !g.attachedTo && isFace(g.cardId, "VEN", 67),
      ))
        ctx.trigger(
          s,
          p,
          gear.cardId,
          gear.id,
          textEffects(gear, [
            {
              type: "score",
              optional: true,
              triggerCost: { board: "killThree" },
            },
          ]),
        );
  },
  effect(s, p, e, ctx) {
    if (e.custom !== "wave20:atakhan") return false;
    const source = s.units.find((u) => u.id === ctx.sourceId);
    if (!source) return true;
    const enemy = (1 - p) as 0 | 1;
    const options = s.units
      .filter((u) => u.owner === enemy && u.location === source.location)
      .map((u) => ({
        id: `choose-custom:atakhan:${u.id}`,
        player: enemy,
        category: "ability" as const,
        label: `Kill ${getCard(u.cardId).name}`,
        effects: [{ type: "kill" as const, chosenTargetId: u.id }],
      }));
    if (options.length) ctx.openChoice(s, enemy, { options });
    return true;
  },
};
