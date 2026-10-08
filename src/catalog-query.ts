import { readableText } from "./data/cards";

/** Search retains every printing identifier even when a view groups rules faces. */
export interface CardSearchSource {
  id: string;
  name: string;
  text: string;
  set: string;
  setName: string;
  tags: string[];
  keywords: string[];
  providerId?: string;
  riftboundId?: string;
}

export interface CardSearchEntry {
  text: string;
  sets: string[];
}

export type CatalogSort = "name" | "energy-asc" | "energy-desc" | "might-desc";

/** Fold typography, accents and punctuation consistently for queries and cards. */
function searchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function createCardSearchIndex(
  source: readonly CardSearchSource[],
  canonicalId: (id: string) => string = (id) => id,
): Map<string, CardSearchEntry> {
  const index = new Map<string, CardSearchEntry>();
  for (const card of source) {
    const id = canonicalId(card.id);
    const entry = index.get(id) ?? { text: "", sets: [] };
    const identifiers = [card.id, card.providerId, card.riftboundId].filter(
      (value): value is string => Boolean(value),
    );
    const text = searchText(
      [
        card.name,
        readableText(card.text),
        card.set,
        card.setName,
        ...card.tags,
        ...card.keywords,
        ...identifiers,
        // Compact pasted collector codes work as well as their printed form.
        ...identifiers.map((value) => value.replace(/[^\p{L}\p{N}]/gu, "")),
      ].join(" "),
    );
    entry.text = entry.text ? `${entry.text} ${text}` : text;
    if (!entry.sets.includes(card.set)) entry.sets.push(card.set);
    index.set(id, entry);
  }
  for (const entry of index.values()) entry.sets.sort();
  return index;
}

/** All whitespace-separated terms must match; quotes preserve a phrase. */
export function matchesCardSearch(
  entry: CardSearchEntry | undefined,
  query: string,
): boolean {
  const terms = [...query.matchAll(/"([^"]+)"|(\S+)/g)]
    .map((match) => searchText(match[1] ?? match[2]))
    .filter(Boolean);
  return (
    terms.length === 0 ||
    Boolean(entry && terms.every((term) => entry.text.includes(term)))
  );
}

export function sortCatalogCards<
  T extends {
    id: string;
    name: string;
    energy: number | null;
    might: number | null;
  },
>(source: readonly T[], sort: CatalogSort): T[] {
  const names = (a: T, b: T) =>
    a.name.localeCompare(b.name, "en", {
      sensitivity: "base",
      numeric: true,
    }) || a.id.localeCompare(b.id, "en");
  const values = (a: number | null, b: number | null, descending: boolean) => {
    // A card without a printed value is not a zero-cost/zero-Might card.
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return descending ? b - a : a - b;
  };
  return [...source].sort((a, b) => {
    if (sort === "energy-asc")
      return values(a.energy, b.energy, false) || names(a, b);
    if (sort === "energy-desc")
      return values(a.energy, b.energy, true) || names(a, b);
    if (sort === "might-desc")
      return values(a.might, b.might, true) || names(a, b);
    return names(a, b);
  });
}
