import cardData from "./cards.json";
import { rulesTokens } from "./tokens";
import metadata from "./catalog-meta.json";

export type CardType =
  "Unit" | "Spell" | "Gear" | "Legend" | "Battlefield" | "Rune";
export type Domain =
  "Fury" | "Calm" | "Mind" | "Body" | "Chaos" | "Order" | "Colorless";
export interface Card {
  id: string;
  riftboundId: string;
  providerId: string;
  name: string;
  type: CardType;
  supertype: string | null;
  domains: Domain[];
  energy: number | null;
  power: number | null;
  might: number | null;
  text: string;
  image: string;
  set: string;
  setName: string;
  rarity: string;
  tags: string[];
  keywords: string[];
  collectorNumber: number;
  variant: boolean;
  artist: string | null;
  bannedInDuel: boolean;
}

export const cards: Card[] = [...(cardData as Card[]), ...rulesTokens];
export const catalogMeta = metadata;
export const cardsById: Record<string, Card> = Object.fromEntries(
  cards.map((card) => [card.id, card]),
);
export const getCard = (id: string): Card => {
  const card = cardsById[id];
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
};

/** Human-readable symbol fallback while preserving the provider's English rules text. */
export function readableText(text: string): string {
  return text
    .replace(/:rb_energy_(\d+):/g, "$1 Energy ")
    .replace(
      /:rb_rune_(\w+):/g,
      (_, domain: string) =>
        `${domain === "rainbow" ? "Any" : domain[0].toUpperCase() + domain.slice(1)} Power `,
    )
    .replace(/:rb_might:/g, "Might")
    .replace(/:rb_exhaust:/g, "Exhaust")
    .replace(/:rb_([^:]+):/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
