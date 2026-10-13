import manifest from "./card-art-paths.json";

interface ArtCard {
  id: string;
  image: string;
}

const localArt: Record<string, string> = manifest.cards;

/** Practice decks and the engine's Recruit token work without external requests. */
export function cardArtUrl(card: ArtCard): string {
  return localArt[card.id] ?? card.image;
}

export function hasLocalCardArt(cardId: string): boolean {
  return cardId in localArt;
}

export const localCardArtCount = manifest.cardCount;
export const localCardArtBytes = manifest.bytes;
