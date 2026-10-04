import { getCard, type Card } from "../data/cards";
import type { CardScript, GameState, LocationId, PlayerId } from "./types";

export const isFace = (id: string, set: string, number: number) => {
  const card = getCard(id);
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
  if (card.type === "Spell" && s.players[p].cannotPlaySpellsTurn === s.turn)
    return false;
  if (isFace(card.id, "VEN", 29) && playerTurnNumber(s, p) <= 3) return false;
  if (
    card.type === "Unit" &&
    location &&
    s.fields.some((f) => f.id === location && isFace(f.cardId, "SFD", 216))
  )
    return false;
  return true;
}
export function repeatCost(s: GameState, p: PlayerId, script: CardScript) {
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
