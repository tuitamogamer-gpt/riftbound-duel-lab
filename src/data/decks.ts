import { canonicalCardName, hasUnlimitedCopies } from "./card-identity";
export { canonicalCardName } from "./card-identity";
import preconData from "./precon-lists.json";
import { cardsById, getCard, type Domain } from "./cards";

export interface DeckEntry {
  cardId: string;
  count: number;
}

/** Application resource limit, including the separately stored chosen champion. */
export const MAX_MAIN_DECK_SIZE = 1000;

/** Main stores at least 39 cards; the chosen champion is stored separately. */
export interface StarterDeck {
  id: string;
  name: string;
  champion: string;
  title: string;
  description: string;
  difficulty: "Početnik" | "Srednje";
  archetype: string;
  color: string;
  domains: Domain[];
  legendId: string;
  championId: string;
  battlefieldId: string;
  main: DeckEntry[];
  runes: DeckEntry[];
  /** Preserved for exchange; not shuffled into a single Duel. */
  sideboard?: DeckEntry[];
  source:
    "Curated practice deck" | "Official preconstructed deck" | "Imported deck";
  battlefieldIds?: string[];
  sourceUrl?: string;
  sourceUrls?: string[];
  verifiedAt?: string;
  importNotes?: string[];
  product?: string;
  format?: "standard" | "historical-precon";
}

const ogn = (number: number) => `ogn-${String(number).padStart(3, "0")}-298`;
const ogs = (number: number) => `ogs-${String(number).padStart(3, "0")}-024`;
const three = (ids: string[]): DeckEntry[] =>
  ids.map((cardId) => ({ cardId, count: 3 }));
const runePair = (a: number, b: number): DeckEntry[] => [
  { cardId: ogn(a), count: 6 },
  { cardId: ogn(b), count: 6 },
];

export const starterDecks: StarterDeck[] = [
  {
    id: "annie",
    name: "Annie",
    champion: "Annie",
    title: "Igra s vatrom",
    description:
      "Brze jedinice i vatrene čarolije. Očisti protivničku odbranu i osvoji bojišta.",
    difficulty: "Početnik",
    archetype: "Agresija · Direktna šteta",
    color: "#f07352",
    domains: ["Fury", "Chaos"],
    legendId: ogs(17),
    championId: ogs(1),
    battlefieldId: ogn(280),
    main: three([
      ...[1, 4, 5, 9, 10, 12, 13, 175, 176, 191].map(ogn),
      ogs(2),
      ogs(3),
      ogs(18),
    ]),
    runes: runePair(7, 166),
    source: "Curated practice deck",
  },
  {
    id: "lux",
    name: "Lux",
    champion: "Lux",
    title: "Moć svjetlosti",
    description:
      "Kontroliši igru moćnim čarolijama i povlači dodatne karte za završni udarac.",
    difficulty: "Srednje",
    archetype: "Kontrola · Čarolije",
    color: "#9f9bff",
    domains: ["Mind", "Order"],
    legendId: ogs(21),
    championId: ogs(6),
    battlefieldId: ogn(280),
    main: three([
      ...[85, 87, 88, 96, 103, 114, 210, 215, 219].map(ogn),
      ogs(12),
      ogs(15),
      ogs(16),
      ogs(22),
    ]),
    runes: runePair(89, 214),
    source: "Curated practice deck",
  },
  {
    id: "garen",
    name: "Garen",
    champion: "Garen",
    title: "Za Demaciju",
    description:
      "Okupi vojsku, ojačaj svoje jedinice i osvoji bojišta snažnim grupnim napadima.",
    difficulty: "Početnik",
    archetype: "Vojska · Jačanje jedinica",
    color: "#ddb96b",
    domains: ["Body", "Order"],
    legendId: ogs(23),
    championId: ogs(7),
    battlefieldId: ogn(275),
    main: three([
      ...[128, 130, 132, 136, 137, 139, 142, 154, 210, 211, 215, 219].map(ogn),
      ogs(24),
    ]),
    runes: runePair(126, 214),
    source: "Curated practice deck",
  },
  {
    id: "master-yi",
    name: "Master Yi",
    champion: "Master Yi",
    title: "Put Wujua",
    description:
      "Zaustavi napad omamljivanjem i odbranom, pa uzvrati spremnim snažnim jedinicama.",
    difficulty: "Srednje",
    archetype: "Odbrana · Omamljivanje",
    color: "#63c9aa",
    domains: ["Calm", "Body"],
    legendId: ogs(19),
    championId: ogs(9),
    battlefieldId: ogn(275),
    main: three([
      ...[46, 49, 50, 51, 52, 54, 55, 58, 125, 132, 134, 142].map(ogn),
      ogs(5),
    ]),
    runes: runePair(42, 126),
    source: "Curated practice deck",
  },
];

export const practiceDecks = starterDecks;
export const officialPreconDecks = preconData as StarterDeck[];
export const decks: StarterDeck[] = [...officialPreconDecks, ...practiceDecks];
export const decksById = Object.fromEntries(
  decks.map((deck) => [deck.id, deck]),
);
export const getDeck = (id: string): StarterDeck => {
  const deck = decksById[id];
  if (!deck) throw new Error(`Unknown deck: ${id}`);
  return deck;
};
export const expandDeck = (entries: DeckEntry[]): string[] =>
  entries.flatMap(({ cardId, count }) => Array<string>(count).fill(cardId));
export const practiceCardIds = new Set(
  decks.flatMap((deck) => [
    deck.legendId,
    deck.championId,
    ...(deck.battlefieldIds ?? [deck.battlefieldId]),
    ...deck.main.map((entry) => entry.cardId),
    ...deck.runes.map((entry) => entry.cardId),
  ]),
);

/** Structural legality is independent from executable script coverage. */
export function validateDeck(deck: StarterDeck): string[] {
  const errors: string[] = [];
  const historical = deck.format === "historical-precon";
  const entries = [...deck.main, ...deck.runes];
  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > MAX_MAIN_DECK_SIZE
    )
      errors.push(`Invalid quantity: ${entry.cardId}`);
  }
  const fieldIds = deck.battlefieldIds ?? [deck.battlefieldId];
  const allIds = [
    deck.legendId,
    deck.championId,
    ...fieldIds,
    ...entries.map((e) => e.cardId),
  ];
  const missing = allIds.filter((id) => !cardsById[id]);
  if (missing.length)
    return [
      ...errors,
      ...[...new Set(missing)].map((id) => `Unknown card: ${id}`),
    ];
  const mainCount = deck.main.reduce((count, entry) => count + entry.count, 0);
  if (mainCount < 39)
    errors.push(
      "Main deck must contain at least 39 cards plus the chosen champion.",
    );
  if (mainCount >= MAX_MAIN_DECK_SIZE)
    errors.push(
      `This app supports up to ${MAX_MAIN_DECK_SIZE} main-deck cards, including the chosen champion.`,
    );
  if (deck.runes.reduce((count, entry) => count + entry.count, 0) !== 12)
    errors.push("Rune deck must contain 12 runes.");
  const legend = getCard(deck.legendId),
    champion = getCard(deck.championId);
  if (legend.type !== "Legend") errors.push("Legend must be a Legend card.");
  if (champion.type !== "Unit" || champion.supertype !== "Champion")
    errors.push("Chosen champion must be a Champion Unit.");
  if (!champion.tags.some((tag) => legend.tags.includes(tag)))
    errors.push("Chosen champion must match the legend champion tag.");
  if (
    !champion.domains.every(
      (domain) => domain === "Colorless" || legend.domains.includes(domain),
    )
  )
    errors.push("Chosen champion domains must match the legend.");
  if (
    deck.domains.length !== legend.domains.length ||
    !deck.domains.every((domain) => legend.domains.includes(domain))
  )
    errors.push("Deck domains must match the legend.");
  if (!fieldIds.length || (fieldIds.length !== 1 && fieldIds.length !== 3))
    errors.push(
      "Supply one practice battlefield or three different constructed battlefields.",
    );
  if (deck.battlefieldIds && !fieldIds.includes(deck.battlefieldId))
    errors.push(
      "Default battlefield must belong to the supplied battlefields.",
    );
  if (
    new Set(fieldIds.map((id) => canonicalCardName(getCard(id).name))).size !==
    fieldIds.length
  )
    errors.push("Battlefields must have different names.");
  for (const id of fieldIds)
    if (getCard(id).type !== "Battlefield")
      errors.push(`Invalid battlefield: ${getCard(id).name}`);
  if (!historical)
    for (const id of new Set(allIds))
      if (getCard(id).bannedInDuel)
        errors.push(`Banned in Duel: ${getCard(id).name}`);
  const copies = new Map<
    string,
    { count: number; name: string; unique: boolean; unlimited: boolean }
  >();
  let signatures = 0;
  for (const entry of [{ cardId: deck.championId, count: 1 }, ...deck.main]) {
    const card = getCard(entry.cardId);
    if (!["Unit", "Spell", "Gear"].includes(card.type))
      errors.push(`Invalid main deck type: ${card.name}`);
    if (
      !card.domains.every(
        (domain) => domain === "Colorless" || legend.domains.includes(domain),
      )
    )
      errors.push(`Domain mismatch: ${card.name}`);
    const key = canonicalCardName(card.name),
      previous = copies.get(key);
    copies.set(key, {
      count: (previous?.count ?? 0) + entry.count,
      name: card.name,
      unique: card.keywords.includes("Unique") || /\[Unique\]/i.test(card.text),
      unlimited: hasUnlimitedCopies(card),
    });
    if (card.supertype === "Signature") {
      signatures += entry.count;
      if (!card.tags.some((tag) => legend.tags.includes(tag)))
        errors.push(`Signature champion mismatch: ${card.name}`);
    }
  }
  if (signatures > 3)
    errors.push("At most three signature cards are allowed in total.");
  for (const { name, count, unique, unlimited } of copies.values()) {
    if (!unlimited && count > (unique ? 1 : 3))
      errors.push(`More than ${unique ? 1 : 3} copies: ${name}`);
  }
  for (const entry of deck.runes) {
    const card = getCard(entry.cardId);
    if (
      card.type !== "Rune" ||
      !card.domains.every((domain) => legend.domains.includes(domain))
    )
      errors.push(`Invalid rune: ${card.name}`);
  }
  return [...new Set(errors)];
}
