import { findCard, type CatalogCard } from "../catalog";
import { selectedCardId } from "./flow";
import type { GameAction, GameState } from "./types";

/** A response shortcut selects an own, legal source; it never commits a play. */
export function reactionSources(game: GameState, legal: GameAction[]) {
  const sources = new Map<string, CatalogCard>();
  if (!game.stack.length || game.priorityPlayer !== 0 || game.pendingChoice)
    return sources;
  for (const action of legal) {
    if (
      action.player !== 0 ||
      !action.sourceId ||
      ["pass", "end"].includes(action.category)
    )
      continue;
    const source = action.sourceId.split(":jayce:")[0];
    const card = findCard(selectedCardId(game, source) ?? action.cardId);
    if (card) sources.set(source, card);
  }
  return sources;
}
