import { emitGameEvent } from "./engine";
import type { GameState, PlayerId } from "./types";

/** Moving cards to the bottom is one recycle event, even for a batch. */
export function recycleCards(
  s: GameState,
  owner: PlayerId,
  cards: string[],
  actor = owner,
) {
  if (!cards.length) return;
  s.players[owner].deck.push(...cards);
  emitGameEvent(s, "recycleCards", actor, cards[0], undefined, undefined, {
    amount: cards.length,
  });
}
export function recycleRunes(
  s: GameState,
  owner: PlayerId,
  domains: string[],
  actor = owner,
) {
  if (!domains.length) return;
  s.players[owner].runeDeck.push(...domains);
  emitGameEvent(s, "recycleRunes", actor, "", undefined, undefined, {
    amount: domains.length,
  });
}
