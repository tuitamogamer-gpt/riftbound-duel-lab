import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import type { ExpansionModule } from "./later-precon-engine";
import type { CardPlaySpec, CardScript, Effect } from "./types";

const plain: CardScript = { implemented: true };
export const instructedPlay = (
  play: CardPlaySpec,
  extra: Partial<Effect> = {},
): Effect => ({
  type: "playCard",
  play,
  ...(play.zone === "trash"
    ? {
        target: "trashCards",
        cardTypes: play.cardTypes,
        cardTags: play.cardTags,
        maxEnergy: play.maxEnergy,
        maxPower: play.maxPower,
        optional: play.optional,
      }
    : {}),
  ...extra,
});
const revive = (extra: Partial<CardPlaySpec> = {}) =>
  instructedPlay({
    zone: "trash",
    cardTypes: ["Unit"],
    ignoreEnergy: true,
    ...extra,
  });
const discover = (extra: Partial<CardPlaySpec> = {}) =>
  instructedPlay({ zone: "top", count: 2, optional: true, ...extra });
export const cardWave13Scripts: Record<string, CardScript> = {
  "ogn-062-298": {
    ...plain,
    spell: [discover({ count: 5, cardTypes: ["Unit"], energyReduction: 5 })],
  },
  "ogn-102-298": {
    ...plain,
    action: true,
    spell: [
      instructedPlay(
        { zone: "blink", ignoreCost: true, destination: "base" },
        { target: "friendlyUnit" },
      ),
    ],
  },
  "ogn-112-298": {
    ...plain,
    keywords: ["Ganking"],
    onConquer: [
      instructedPlay(
        {
          zone: "trash",
          cardTypes: ["Spell"],
          optional: true,
          ignoreEnergy: true,
          recycleOnLeave: true,
        },
        { condition: "costBelowPoints" },
      ),
    ],
  },
  "ogn-160-298": {
    ...plain,
    onEnd: [
      discover({
        untilUnit: true,
        optional: false,
        cardTypes: ["Unit"],
        ignoreCost: true,
        revealed: true,
      }),
    ],
  },
  "ogn-196-298": { ...plain, onPlay: [revive({ optional: true })] },
  "ogn-198-298": { ...plain, spell: [revive()] },
  "ogn-226-298": {
    ...plain,
    onPlay: [
      revive({ optional: true, maxEnergy: 3, maxPower: 1, ignoreCost: true }),
    ],
  },
  "sfd-024-221": {
    ...plain,
    keywords: ["Tank"],
    onAttack: [
      instructedPlay({
        zone: "hand",
        cardTags: ["Equipment"],
        maxEnergy: 2,
        ignoreCost: true,
        attachToSource: true,
        optional: true,
      }),
    ],
  },
  "sfd-029-221": { ...plain, accelerating: true, assault: 1 },
  "sfd-111-221": {
    ...plain,
    hidden: true,
    action: true,
    spell: [
      instructedPlay({
        zone: "hand",
        cardTypes: ["Unit"],
        energyReduction: 3,
        destination: "controlledBattlefield",
        optional: true,
      }),
    ],
  },
  "sfd-140-221": {
    ...plain,
    onPlay: [
      instructedPlay({
        zone: "trash",
        cardTypes: ["Spell"],
        maxEnergy: 3,
        ignoreEnergy: true,
        recycleOnLeave: true,
        optional: true,
      }),
    ],
  },
  "sfd-165-221": {
    ...plain,
    onDeath: [
      revive({ optional: true, maxEnergy: 3, maxPower: 1, ignoreCost: true }),
    ],
  },
  "sfd-170-221": {
    ...plain,
    onAttack: [discover({ revealed: true, alternativeHere: true })],
  },
  "sfd-187-221": plain,
  "sfd-188-221": {
    ...plain,
    spell: [
      discover({ revealed: true, energyReduction: 2, unplayedToHand: true }),
    ],
  },
  "unl-168-219": {
    ...plain,
    spell: [revive({ maxEnergy: 2, maxPower: 1, ignoreCost: true })],
  },
  "unl-184-219": {
    ...plain,
    reaction: true,
    spell: [
      instructedPlay(
        { zone: "blink", ignoreCost: true, destination: "anyBattlefield" },
        { target: "friendlyUnit" },
      ),
    ],
  },
};
for (const c of cards.filter(
  (c) => c.set === "VEN" && c.collectorNumber === 66,
)) {
  cardWave13Scripts[c.id] = {
    ...plain,
    hidden: true,
    spell: [
      instructedPlay(
        { zone: "blink", ignoreCost: true, destination: "here" },
        { target: "anyUnit" },
      ),
    ],
  };
}
export const cardWave13Module: ExpansionModule = {
  cost(s, p, c, ctx) {
    if (
      isFace(c.id, "UNL", 168) ||
      (c.set === "OPP" && c.collectorNumber === 168)
    ) {
      const id = s.players[p].discard.find(
        (id, i) =>
          ctx?.targetId ===
          (s.players[p].trashCards?.[i]?.id ?? `trash:${p}:legacy:${i}:${id}`),
      );
      if (
        id &&
        getCard(id).tags.some((t) => ["Bird", "Cat", "Dog", "Poro"].includes(t))
      )
        return { energy: -2 };
    }
    return {};
  },
  event(s, event, p, _cardId, _sourceId, locationId, ctx) {
    if (event === "conquer" && isFace(s.players[p].legendId, "SFD", 187))
      ctx.trigger(
        s,
        p,
        s.players[p].legendId,
        "legend",
        [discover({ revealed: true, optional: true })].map((e) => ({
          ...e,
          triggerCost: { exhaust: true },
          optional: true,
        })),
        locationId,
      );
  },
};
