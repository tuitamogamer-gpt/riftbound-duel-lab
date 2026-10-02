import manifest from './card-art-manifest.json';

interface ArtCard {
  id: string;
  image: string;
}

const localArt: Record<string, { path: string }> = manifest.cards;

/** Practice decks and the engine's Recruit token work without external requests. */
export function cardArtUrl(card: ArtCard): string {
  return localArt[card.id]?.path ?? card.image;
}

export function hasLocalCardArt(cardId: string): boolean {
  return cardId in localArt;
}

export const localCardArtCount = manifest.cardCount;
export const localCardArtBytes = manifest.bytes;
