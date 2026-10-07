import { cards } from "../src/data/cards";
import { canonicalCardName } from "../src/data/card-identity";
import {
  officialPreconDecks,
  starterDecks,
  type StarterDeck,
} from "../src/data/decks";
import { exportDeckText, parseDeckText } from "../src/game/deck-import";
import { getRulesCardId } from "../src/game/scripts";
import { cardStrategy, type CardStrategy } from "../src/game/ai/config";

/** Legal mixed-expansion imports built from printed, domain-compatible themes. */
export function mixedBenchmarkDecks(): StarterDeck[] {
  const definitions = [
    ["precon-fiora", "equipment"],
    ["precon-vex", "xp"],
    ["precon-rumble", "tokens"],
  ] as const;
  return definitions.map(([baseId, theme]) => {
    const draft = structuredClone(
      officialPreconDecks.find((deck) => deck.id === baseId)!,
    );
    const existingNames = new Set(
      [draft.championId, ...draft.main.map((entry) => entry.cardId)].map((id) =>
        canonicalCardName(cards.find((card) => card.id === id)!.name),
      ),
    );
    const newNames = new Set<string>();
    const additions = cards
      .filter((card) => {
        const name = canonicalCardName(card.name);
        if (
          card.variant ||
          card.bannedInDuel ||
          ["Token", "Signature"].includes(card.supertype ?? "") ||
          !["Unit", "Spell", "Gear"].includes(card.type) ||
          card.keywords.includes("Unique") ||
          !card.domains.every(
            (domain) =>
              domain === "Colorless" || draft.domains.includes(domain),
          ) ||
          !cardStrategy(card.id)[theme as keyof CardStrategy] ||
          existingNames.has(name) ||
          newNames.has(name)
        )
          return false;
        newNames.add(name);
        return true;
      })
      .sort(
        (a, b) => (a.energy ?? 0) - (b.energy ?? 0) || a.id.localeCompare(b.id),
      )
      .slice(0, 4);
    if (additions.length !== 4)
      throw new Error(`Missing benchmark additions for ${theme}`);
    let replacements = 12;
    draft.main = draft.main.flatMap((entry) => {
      const removed = Math.min(entry.count, replacements);
      replacements -= removed;
      return entry.count > removed
        ? [{ ...entry, count: entry.count - removed }]
        : [];
    });
    draft.main.push(
      ...additions.map((card) => ({ cardId: card.id, count: 3 })),
    );
    draft.name = `Mixed ${theme} benchmark`;
    const result = parseDeckText(exportDeckText(draft));
    if (!result.deck || !result.playable)
      throw new Error(
        `Invalid mixed ${theme}: ${result.issues.map((issue) => issue.message).join("; ")}`,
      );
    return result.deck;
  });
}

export function benchmarkDeckPairs(
  catalog: boolean,
): [StarterDeck, StarterDeck][] {
  if (!catalog)
    return [
      ["annie", "lux"],
      ["garen", "master-yi"],
      ["lux", "garen"],
    ].map(([left, right]) => [
      starterDecks.find((deck) => deck.id === left)!,
      starterDecks.find((deck) => deck.id === right)!,
    ]);
  const [equipment, experience, tokens] = mixedBenchmarkDecks();
  const pairs: [StarterDeck, StarterDeck][] = [];
  for (let index = 0; index < officialPreconDecks.length - 1; index += 2)
    pairs.push([officialPreconDecks[index], officialPreconDecks[index + 1]]);
  pairs.push([officialPreconDecks.at(-1)!, equipment], [experience, tokens]);
  return pairs;
}

export const benchmarkList = (deck: StarterDeck) =>
  deck.main.flatMap((entry) =>
    Array<string>(entry.count).fill(getRulesCardId(entry.cardId)),
  );
