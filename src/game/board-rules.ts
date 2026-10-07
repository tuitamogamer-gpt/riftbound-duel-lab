import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { repeatPrices } from "./card-wave23";
import { isCardType } from "../data/cards";
import { ruleFamily } from "./rule-families";
import { getCard, type Card } from "../data/cards";
import { canonicalCardName } from "../data/card-identity";
import type { CardScript, GameState, LocationId, PlayerId } from "./types";

export const isFace = (id: string, set: string, number: number) => {
  const card = getCard(ruleFamily(id));
  return card.set === set && card.collectorNumber === number;
};
export function playerTurnNumber(s: GameState, p: PlayerId) {
  return Math.floor((s.turn + Number(s.currentPlayer === p)) / 2);
}
export function getVictoryScore(s: GameState) {
  return 8 + s.fields.filter((f) => isFace(f.cardId, "OGN", 276)).length;
}
/** Applies to ordinary plays and plays instructed by resolving effects. */
export function canPlayCard(
  s: GameState,
  p: PlayerId,
  card: Card,
  location?: LocationId,
  token = false,
) {
  if (!token && s.players[p].cannotPlayCardsTurn === s.turn) return false;
  if (
    isCardType(card, "Unit") &&
    location &&
    location !== `base:${p}` &&
    textUnits(s).some(
      (u) =>
        u.owner !== p &&
        isFace(u.cardId, "OGN", 70) &&
        u.location.startsWith("field:"),
    )
  )
    return false;
  if (isCardType(card, "Spell") && s.players[p].cannotPlaySpellsTurn === s.turn)
    return false;
  if (
    isCardType(card, "Spell") &&
    textUnits(s).some(
      (u) =>
        u.owner !== p &&
        isFace(u.cardId, "VEN", 132) &&
        u.location.startsWith("field:") &&
        u.namedSpell === canonicalCardName(card.name),
    )
  )
    return false;
  if (isFace(card.id, "VEN", 29) && playerTurnNumber(s, p) <= 3) return false;
  if (
    isCardType(card, "Unit") &&
    location &&
    s.fields.some((f) => f.id === location && isFace(f.cardId, "SFD", 216))
  )
    return false;
  return true;
}
export function readyForbidden(s: GameState, owner: PlayerId) {
  return textUnits(s).some(
    (u) =>
      u.owner !== owner &&
      isFace(u.cardId, "OGN", 70) &&
      u.location.startsWith("field:"),
  );
}
export function disempower(object: {
  empowered?: boolean;
  empowerCount?: number;
}) {
  if (object.empowerCount !== undefined) {
    object.empowerCount = Math.max(0, object.empowerCount - 1);
    object.empowered = object.empowerCount > 0;
  } else object.empowered = false;
}
export function hideCost(s: GameState, p: PlayerId) {
  if (s.players[p].freeHideTurn === s.turn) return { energy: 0, power: 0 };
  return { energy: 0, power: 1 };
}
export function hasQuickDraw(
  s: GameState,
  p: PlayerId,
  card: Card,
  source?: string,
) {
  return (
    isCardType(card, "Gear") &&
    card.tags.includes("Equipment") &&
    (!!source?.startsWith("hand:") ||
      s.pendingPlays?.some(
        (play) => play.id === source && play.returnZone === "hand",
      )) &&
    textUnits(s).some((u) => u.owner === p && isFace(u.cardId, "SFD", 54))
  );
}
export function repeatCost(
  s: GameState,
  p: PlayerId,
  script: CardScript,
  cardId?: string,
) {
  if (cardId) return repeatPrices(s, p, cardId, script)[0];
  const cost = script.repeat;
  if (!cost) return undefined;
  return {
    ...cost,
    energy: Math.max(
      0,
      (cost.energy ?? 0) -
        s.fields.filter(
          (f) => f.controller === p && isFace(f.cardId, "SFD", 211),
        ).length,
    ),
  };
}

export const getUnitTags = (u: {
  cardId: string;
  addedTag?: string;
  grantedTags?: { tag: string }[];
}) => [
  ...getCard(u.cardId).tags,
  ...(u.addedTag ? [u.addedTag] : []),
  ...(u.grantedTags?.map((t) => t.tag) ?? []),
];
