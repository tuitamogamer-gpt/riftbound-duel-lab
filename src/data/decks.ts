import { getCard, type Domain } from './cards';

export interface DeckEntry {
  cardId: string;
  count: number;
}

/** The chosen champion is one of the deck's 40 cards; main contains the remaining 39. */
export interface StarterDeck {
  id: string;
  name: string;
  champion: string;
  title: string;
  description: string;
  difficulty: 'Početnik' | 'Srednje';
  archetype: string;
  color: string;
  domains: Domain[];
  legendId: string;
  championId: string;
  battlefieldId: string;
  main: DeckEntry[];
  runes: DeckEntry[];
  source: 'Curated practice deck';
}

const ogn = (number: number) => `ogn-${String(number).padStart(3, '0')}-298`;
const ogs = (number: number) => `ogs-${String(number).padStart(3, '0')}-024`;
const three = (ids: string[]): DeckEntry[] => ids.map((cardId) => ({ cardId, count: 3 }));
const runePair = (a: number, b: number): DeckEntry[] => [
  { cardId: ogn(a), count: 6 },
  { cardId: ogn(b), count: 6 },
];

export const starterDecks: StarterDeck[] = [
  {
    id: 'annie',
    name: 'Annie',
    champion: 'Annie',
    title: 'Igra s vatrom',
    description: 'Brze jedinice i vatrene čarolije. Očisti protivničku odbranu i osvoji bojišta.',
    difficulty: 'Početnik',
    archetype: 'Agresija · Direktna šteta',
    color: '#f07352',
    domains: ['Fury', 'Chaos'],
    legendId: ogs(17),
    championId: ogs(1),
    battlefieldId: ogn(280),
    main: three([...([1, 4, 5, 9, 10, 12, 13, 175, 176, 191].map(ogn)), ogs(2), ogs(3), ogs(18)]),
    runes: runePair(7, 166),
    source: 'Curated practice deck',
  },
  {
    id: 'lux',
    name: 'Lux',
    champion: 'Lux',
    title: 'Moć svjetlosti',
    description: 'Kontroliši igru moćnim čarolijama i povlači dodatne karte za završni udarac.',
    difficulty: 'Srednje',
    archetype: 'Kontrola · Čarolije',
    color: '#9f9bff',
    domains: ['Mind', 'Order'],
    legendId: ogs(21),
    championId: ogs(6),
    battlefieldId: ogn(280),
    main: three([...([85, 87, 88, 96, 103, 114, 210, 215, 219].map(ogn)), ogs(12), ogs(15), ogs(16), ogs(22)]),
    runes: runePair(89, 214),
    source: 'Curated practice deck',
  },
  {
    id: 'garen',
    name: 'Garen',
    champion: 'Garen',
    title: 'Za Demaciju',
    description: 'Okupi vojsku, ojačaj svoje jedinice i osvoji bojišta snažnim grupnim napadima.',
    difficulty: 'Početnik',
    archetype: 'Vojska · Jačanje jedinica',
    color: '#ddb96b',
    domains: ['Body', 'Order'],
    legendId: ogs(23),
    championId: ogs(7),
    battlefieldId: ogn(275),
    main: three([...([128, 130, 132, 136, 137, 139, 142, 154, 210, 211, 215, 219].map(ogn)), ogs(24)]),
    runes: runePair(126, 214),
    source: 'Curated practice deck',
  },
  {
    id: 'master-yi',
    name: 'Master Yi',
    champion: 'Master Yi',
    title: 'Put Wujua',
    description: 'Zaustavi napad omamljivanjem i odbranom, pa uzvrati spremnim snažnim jedinicama.',
    difficulty: 'Srednje',
    archetype: 'Odbrana · Omamljivanje',
    color: '#63c9aa',
    domains: ['Calm', 'Body'],
    legendId: ogs(19),
    championId: ogs(9),
    battlefieldId: ogn(275),
    main: three([...([46, 49, 50, 51, 52, 54, 55, 58, 125, 132, 134, 142].map(ogn)), ogs(5)]),
    runes: runePair(42, 126),
    source: 'Curated practice deck',
  },
];

export const decks = starterDecks;
export const decksById = Object.fromEntries(starterDecks.map((deck) => [deck.id, deck]));
export const getDeck = (id: string): StarterDeck => {
  const deck = decksById[id];
  if (!deck) throw new Error(`Unknown practice deck: ${id}`);
  return deck;
};
export const expandDeck = (entries: DeckEntry[]): string[] => entries.flatMap(({ cardId, count }) => Array<string>(count).fill(cardId));
export const practiceCardIds = new Set(starterDecks.flatMap((deck) => [
  deck.legendId, deck.championId, deck.battlefieldId,
  ...deck.main.map((entry) => entry.cardId),
  ...deck.runes.map((entry) => entry.cardId),
]));

/** Structural deck validation, separate from the engine's script-coverage checks. */
export function validateDeck(deck: StarterDeck): string[] {
  const errors: string[] = [];
  if (deck.main.reduce((count, entry) => count + entry.count, 0) !== 39) errors.push('Main deck must contain 39 cards plus the chosen champion.');
  if (deck.runes.reduce((count, entry) => count + entry.count, 0) !== 12) errors.push('Rune deck must contain 12 runes.');
  const legend = getCard(deck.legendId);
  const champion = getCard(deck.championId);
  if (legend.bannedInDuel || champion.bannedInDuel || getCard(deck.battlefieldId).bannedInDuel) errors.push('A legend, champion, or battlefield is banned in Duel.');
  if (legend.type !== 'Legend') errors.push('Legend must be a Legend card.');
  if (champion.type !== 'Unit' || champion.supertype !== 'Champion') errors.push('Chosen champion must be a Champion Unit.');
  const copies: Record<string, number> = { [champion.name]: 1 };
  for (const entry of deck.main) {
    const card = getCard(entry.cardId);
    if (card.bannedInDuel) errors.push(`Banned in Duel: ${card.name}`);
    if (!['Unit', 'Spell', 'Gear'].includes(card.type)) errors.push(`Invalid main deck type: ${card.name}`);
    if (!card.domains.every((domain) => domain === 'Colorless' || legend.domains.includes(domain))) errors.push(`Domain mismatch: ${card.name}`);
    copies[card.name] = (copies[card.name] ?? 0) + entry.count;
  }
  for (const [name, count] of Object.entries(copies)) if (count > 3) errors.push(`More than 3 copies: ${name}`);
  for (const entry of deck.runes) {
    const card = getCard(entry.cardId);
    if (card.type !== 'Rune' || !card.domains.every((domain) => legend.domains.includes(domain))) errors.push(`Invalid rune: ${card.name}`);
  }
  return errors;
}
