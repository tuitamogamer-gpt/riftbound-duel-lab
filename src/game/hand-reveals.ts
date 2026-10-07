import { cardsById } from "../data/cards";
import { MAX_MAIN_DECK_SIZE } from "../data/decks";
import type { GameState, PlayerId } from "./types";

/** A past public reveal, never a claim about the owner's current private hand. */
export interface PublicHandReveal {
  owner: PlayerId;
  turn: number;
  sourceCardId: "unl-053-219" | "unl-135-219";
  cards: string[];
}

export function recordPublicHandReveal(
  state: GameState,
  owner: PlayerId,
  sourceCardId: PublicHandReveal["sourceCardId"],
) {
  // One last snapshot replaces the previous reveal; later draws never mutate it.
  state.publicReveals = {
    owner,
    turn: state.turn,
    sourceCardId,
    cards: [...state.players[owner].hand],
  };
}

export function validPublicHandReveal(
  value: unknown,
): value is PublicHandReveal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reveal = value as Record<string, unknown>;
  return (
    (reveal.owner === 0 || reveal.owner === 1) &&
    Number.isSafeInteger(reveal.turn) &&
    (reveal.turn as number) >= 0 &&
    (reveal.sourceCardId === "unl-053-219" ||
      reveal.sourceCardId === "unl-135-219") &&
    Array.isArray(reveal.cards) &&
    reveal.cards.length <= MAX_MAIN_DECK_SIZE &&
    reveal.cards.every((id) => typeof id === "string" && !!cardsById[id])
  );
}
