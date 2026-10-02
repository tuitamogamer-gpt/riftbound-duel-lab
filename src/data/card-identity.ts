import type { Card } from "./cards";

/** Printing labels are not part of a card's rules name or copy limit. */
export function canonicalCardName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(
      /\s*\((?:starter|alternate art|signature|promo|metal|overnumbered|gg ez|launch exclusive|ultimate|\d+)\)/g,
      "",
    )
    .replace(/\s*[-–—,]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Printed deck-construction exceptions apply only to the named rules face. */
export function hasUnlimitedCopies(card: Card): boolean {
  const match = card.text.match(
    /Your deck can have any number of cards named ([^.]+)\./,
  );
  return Boolean(
    match && canonicalCardName(match[1]) === canonicalCardName(card.name),
  );
}

/** Require the complete rules face to agree before sharing executable behavior. */
export function gameplayFingerprint(card: Card): string {
  return JSON.stringify([
    canonicalCardName(card.name),
    card.type,
    card.supertype,
    [...card.domains].sort(),
    card.energy ?? 0,
    card.power ?? 0,
    card.might,
    card.text
      .normalize("NFKC")
      .replace(/\[NO TEXT\]/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
    [...card.tags].sort(),
  ]);
}
