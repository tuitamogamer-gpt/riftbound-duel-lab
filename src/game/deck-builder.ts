import {
  cards,
  cardsById,
  isCardType,
  type Card,
  type Domain,
} from "../data/cards";
import {
  canonicalCardName,
  gameplayFingerprint,
  hasUnlimitedCopies,
} from "../data/card-identity";
import {
  MAX_MAIN_DECK_SIZE,
  type DeckEntry,
  type StarterDeck,
} from "../data/decks";
import { exportDeckText, parseDeckText } from "./deck-import";
import { isImplemented } from "./scripts";

export type BuilderSection = "main" | "sideboard" | "runes";
export type BuilderAddIssue =
  | "type"
  | "domain"
  | "banned"
  | "copies"
  | "unique"
  | "signature"
  | "signature-tag"
  | "runes"
  | "sideboard"
  | "quantity";

/** Art variants share one catalog entry only when their complete rules agree. */
export function canonicalBuilderCards(source: Card[] = cards): Card[] {
  const faces = new Map<string, Card>();
  const preference = (card: Card) =>
    (isImplemented(card.id) ? 0 : 4) + (card.variant ? 2 : 0);
  for (const card of source) {
    if (card.supertype === "Token") continue;
    const key = gameplayFingerprint(card);
    const current = faces.get(key);
    if (
      !current ||
      preference(card) < preference(current) ||
      (preference(card) === preference(current) &&
        card.id.localeCompare(current.id) < 0)
    )
      faces.set(key, card);
  }
  return [...faces.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

export const builderCards = canonicalBuilderCards();
const faceId = new Map(
  builderCards.map((card) => [gameplayFingerprint(card), card.id]),
);
export const canonicalBuilderId = (cardId: string) => {
  const card = cardsById[cardId];
  return card ? (faceId.get(gameplayFingerprint(card)) ?? cardId) : cardId;
};

export function canonicalBuilderEntries(entries: DeckEntry[]): DeckEntry[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const id = canonicalBuilderId(entry.cardId);
    counts.set(id, (counts.get(id) ?? 0) + entry.count);
  }
  return [...counts].map(([cardId, count]) => ({ cardId, count }));
}

/** Clone all mutable collections; opening a builder never edits a saved/precon deck. */
export function cloneDeckForBuilder(deck: StarterDeck): StarterDeck {
  return {
    ...deck,
    domains: [...deck.domains],
    legendId: canonicalBuilderId(deck.legendId),
    championId: canonicalBuilderId(deck.championId),
    battlefieldId: canonicalBuilderId(deck.battlefieldId),
    battlefieldIds: (deck.battlefieldIds ?? [deck.battlefieldId]).map(
      canonicalBuilderId,
    ),
    main: canonicalBuilderEntries(deck.main),
    runes: canonicalBuilderEntries(deck.runes),
    sideboard: canonicalBuilderEntries(deck.sideboard ?? []),
    source: "Imported deck",
    importNotes: deck.importNotes ? [...deck.importNotes] : undefined,
    sourceUrls: deck.sourceUrls ? [...deck.sourceUrls] : undefined,
  };
}

export const builderCompatible = (card: Card, domains: Domain[]) =>
  card.domains.every(
    (domain) => domain === "Colorless" || domains.includes(domain),
  );
export function builderChampions(legendId: string): Card[] {
  const legend = cardsById[legendId];
  return legend
    ? builderCards.filter(
        (card) =>
          isCardType(card, "Unit") &&
          card.supertype === "Champion" &&
          builderCompatible(card, legend.domains) &&
          card.tags.some((tag) => legend.tags.includes(tag)),
      )
    : [];
}

export const builderCount = (entries: DeckEntry[]) =>
  entries.reduce((count, entry) => count + entry.count, 0);
export function builderCopies(deck: StarterDeck, cardId: string): number {
  const name = canonicalCardName(cardsById[cardId]?.name ?? cardId);
  return [
    { cardId: deck.championId, count: 1 },
    ...deck.main,
    ...(deck.sideboard ?? []),
  ].reduce(
    (count, entry) =>
      count +
      (canonicalCardName(cardsById[entry.cardId]?.name ?? entry.cardId) === name
        ? entry.count
        : 0),
    0,
  );
}

/** Construction limits span the chosen champion, main deck and sideboard. */
export function builderAddIssue(
  deck: StarterDeck,
  cardId: string,
  section: BuilderSection,
): BuilderAddIssue | null {
  const card = cardsById[cardId];
  if (
    !card ||
    card.supertype === "Token" ||
    !(section === "runes"
      ? isCardType(card, "Rune")
      : ["Unit", "Spell", "Gear"].some((type) => isCardType(card, type)))
  )
    return "type";
  if (card.bannedInDuel && deck.format !== "historical-precon") return "banned";
  if (!builderCompatible(card, deck.domains)) return "domain";
  if (section === "runes")
    return builderCount(deck.runes) >= 12 ? "runes" : null;
  if (section === "sideboard" && builderCount(deck.sideboard ?? []) >= 10)
    return "sideboard";
  if (section === "main" && builderCount(deck.main) + 1 >= MAX_MAIN_DECK_SIZE)
    return "quantity";
  const copies = builderCopies(deck, cardId);
  const name = canonicalCardName(card.name);
  const existingUnique = [
    { cardId: deck.championId, count: 1 },
    ...deck.main,
    ...(deck.sideboard ?? []),
  ].some((entry) => {
    const existing = cardsById[entry.cardId];
    return (
      existing &&
      canonicalCardName(existing.name) === name &&
      (existing.keywords.includes("Unique") ||
        /\[Unique\]/i.test(existing.text))
    );
  });
  if (
    (existingUnique ||
      card.keywords.includes("Unique") ||
      /\[Unique\]/i.test(card.text)) &&
    copies >= 1
  )
    return "unique";
  if (!hasUnlimitedCopies(card) && copies >= 3) return "copies";
  if (card.supertype === "Signature") {
    const legend = cardsById[deck.legendId];
    if (!legend || !card.tags.some((tag) => legend.tags.includes(tag)))
      return "signature-tag";
    const signatures = [
      { cardId: deck.championId, count: 1 },
      ...deck.main,
      ...(deck.sideboard ?? []),
    ]
      .filter((entry) => cardsById[entry.cardId]?.supertype === "Signature")
      .reduce((count, entry) => count + entry.count, 0);
    if (signatures >= 3) return "signature";
  }
  return null;
}

export function changeBuilderQuantity(
  deck: StarterDeck,
  cardId: string,
  section: BuilderSection,
  delta: 1 | -1,
): StarterDeck {
  const id = canonicalBuilderId(cardId);
  if (delta > 0 && builderAddIssue(deck, id, section)) return deck;
  const entries = deck[section] ?? [];
  const count = entries.find((entry) => entry.cardId === id)?.count ?? 0;
  if (delta < 0 && count === 0) return deck;
  return {
    ...deck,
    [section]:
      count === 0
        ? [...entries, { cardId: id, count: 1 }]
        : entries
            .map((entry) =>
              entry.cardId === id
                ? { ...entry, count: entry.count + delta }
                : entry,
            )
            .filter((entry) => entry.count > 0),
  };
}

export function balancedBuilderRunes(domains: Domain[]): DeckEntry[] {
  const runes = domains
    .filter((domain) => domain !== "Colorless")
    .map((domain) =>
      builderCards.find(
        (card) =>
          isCardType(card, "Rune") &&
          card.domains.length === 1 &&
          card.domains[0] === domain,
      ),
    )
    .filter((card): card is Card => Boolean(card));
  return runes.map((card, index) => ({
    cardId: card.id,
    count: Math.floor(12 / runes.length) + (index < 12 % runes.length ? 1 : 0),
  }));
}

export function builderCurve(deck: StarterDeck): number[] {
  const curve = Array<number>(10).fill(0);
  for (const entry of [{ cardId: deck.championId, count: 1 }, ...deck.main]) {
    const card = cardsById[entry.cardId];
    if (card) curve[Math.min(9, Math.max(0, card.energy ?? 0))] += entry.count;
  }
  return curve;
}

/** Use the importer as the only source of saved identity and structural legality. */
export function finalizeBuilderDeck(deck: StarterDeck) {
  return parseDeckText(exportDeckText(deck));
}
