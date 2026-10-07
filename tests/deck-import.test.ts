import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import {
  decks,
  starterDecks,
  validateDeck,
  MAX_MAIN_DECK_SIZE,
} from "../src/data/decks";
import {
  exportDeckText,
  getDeckScriptCoverage,
  IMPORTED_DECKS_KEY,
  loadImportedDecks,
  parseDeckText,
  saveImportedDecks,
  validateImportedDeck,
  type DeckStorage,
} from "../src/game/deck-import";

const example = () =>
  structuredClone(starterDecks.find((deck) => deck.id === "annie")!);
const text = () => exportDeckText(example());
const codes = (value: string) =>
  parseDeckText(value).issues.map((issue) => issue.code);
function storage(value: string | null = null): DeckStorage {
  return {
    getItem: (key) => (key === IMPORTED_DECKS_KEY ? value : null),
    setItem: (_key, next) => {
      value = next;
    },
  };
}
describe("local deck-list imports", () => {
  it("honors Spiderling's printed unlimited-copy exception in both validators", () => {
    const d = example();
    d.main = [{ cardId: "ven-097-166", count: 39 }];
    expect(
      validateDeck(d).filter((message) => message.includes("copies")),
    ).toEqual([]);
    expect(
      validateImportedDeck(d).filter((issue) => issue.code === "copy-limit"),
    ).toEqual([]);
    expect(
      parseDeckText(exportDeckText(d)).issues.filter(
        (issue) => issue.code === "copy-limit",
      ),
    ).toEqual([]);
    d.main = [{ cardId: "ogn-001-298", count: 39 }];
    expect(validateDeck(d).some((message) => message.includes("copies"))).toBe(
      true,
    );
    expect(
      validateImportedDeck(d).some((issue) => issue.code === "copy-limit"),
    ).toBe(true);
  });
  it("round-trips every available precon without conflating script coverage and legality", () => {
    for (const deck of decks) {
      const result = parseDeckText(exportDeckText(deck));
      expect(
        result.issues.filter((issue) => issue.severity === "error"),
        deck.id,
      ).toEqual([]);
      expect(result.deck?.main, deck.id).toEqual(deck.main);
      expect(result.deck?.runes, deck.id).toEqual(deck.runes);
      expect(result.deck?.championId).toBe(deck.championId);
      expect(result.coverage).toEqual(getDeckScriptCoverage(deck));
    }
  });
  it("accepts CRLF, BOM, headings, card names, x quantities, inline sections and short IDs", () => {
    const value = text()
      .replace(
        "Legend\n1 ogs-017-024 # Annie - Dark Child (Starter)",
        "Legend: Annie - Dark Child (Starter)",
      )
      .replace(
        "Champion\n1 ogs-001-024 # Annie - Fiery",
        "Champion: Annie, Fiery",
      )
      .replace("Main Deck", "## Main Deck (39)")
      .replace("3 ogn-001-298 #", "3x OGN-001 #")
      .replace("6 ogn-007-298 # Fury Rune", "Fury x6")
      .replace("6 ogn-166-298 # Chaos Rune", "6 Chaos Rune")
      .replaceAll("\n", "\r\n");
    const result = parseDeckText(`\uFEFF${value}`);
    expect(result.issues).toEqual([]);
    expect(result.deck?.main).toEqual(example().main);
  });
  it("requires a chosen champion instead of guessing from all champion units in the main deck", () => {
    expect(codes(text().replace(/Champion\n[^\n]+\n/, ""))).toContain(
      "champion-count",
    );
  });
  it("deducts the chosen champion once from a sectionless full deck list", () => {
    const result = parseDeckText(
      `${example()
        .main.map((entry) => `${entry.count} ${entry.cardId}`)
        .join(
          "\n",
        )}\n1 ogs-001-024\nLegend\n1 ogs-017-024\nChampion\n1 ogs-001-024\nRunes\n6 ogn-007-298\n6 ogn-166-298\nBattlefields\n1 ogn-280-298`,
    );
    expect(result.deck?.main).toEqual(example().main);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "champion-separated",
    ]);
  });
  it.each([40, 41])(
    "preserves a sectioned %i-card draw deck and its separately stored champion",
    (count) => {
      const d = example();
      d.main.push({ cardId: d.championId, count: count - 39 });
      expect(validateDeck(d)).toEqual([]);
      const result = parseDeckText(exportDeckText(d));
      expect(result.issues).toEqual([]);
      expect(result.deck?.main).toEqual(d.main);
      expect(result.deck?.main.reduce((n, entry) => n + entry.count, 0)).toBe(
        count,
      );
      const local = storage();
      expect(saveImportedDecks([result.deck!], local)).toBe(true);
      expect(loadImportedDecks(local)).toEqual([result.deck]);
    },
  );
  it("supports an explicit inclusive exporter without removing two chosen copies", () => {
    const d = example();
    d.main.push({ cardId: d.championId, count: 2 });
    const inclusive = exportDeckText(d).replace(
      `2 ${d.championId} #`,
      `3 ${d.championId} #`,
    );
    const result = parseDeckText(inclusive, { mainIncludesChampion: true });
    expect(result.deck?.main).toEqual(d.main);
    expect(result.issues.map((item) => item.code)).toEqual([
      "champion-separated",
    ]);
    expect(parseDeckText(exportDeckText(result.deck!)).deck).toEqual(
      result.deck,
    );
    expect(
      parseDeckText(text(), { mainIncludesChampion: true }).issues.map(
        (item) => item.code,
      ),
    ).toContain("champion-missing-from-main");
  });
  it("rejects undersized decks while allowing unlimited copies within a stated application bound", () => {
    const d = example();
    d.main = [{ cardId: "ven-097-166", count: 38 }];
    expect(validateImportedDeck(d).map((item) => item.code)).toContain(
      "main-count",
    );
    d.main[0].count = MAX_MAIN_DECK_SIZE - 1;
    expect(validateDeck(d)).toEqual([]);
    const result = parseDeckText(exportDeckText(d));
    expect(result.issues).toEqual([]);
    expect(result.deck?.main).toEqual(d.main);
    d.main[0].count = MAX_MAIN_DECK_SIZE;
    expect(validateImportedDeck(d).map((item) => item.code)).toContain(
      "main-size",
    );
    expect(parseDeckText(exportDeckText(d)).deck).toBeNull();
    d.main[0].count = MAX_MAIN_DECK_SIZE + 1;
    expect(validateImportedDeck(d).map((item) => item.code)).toContain(
      "invalid-quantity",
    );
    expect(
      parseDeckText(exportDeckText(d)).issues.map((item) => item.code),
    ).toContain("invalid-quantity");
  });
  it("aggregates duplicate entries and enforces a copy limit including the chosen champion", () => {
    const value = text().replace(
      "3 ogn-001-298",
      "1 ogn-001-298\n2 ogn-001-298",
    );
    expect(parseDeckText(value).deck?.main).toEqual(example().main);
    expect(codes(text().replace("3 ogn-001-298", "4 ogn-001-298"))).toContain(
      "copy-limit",
    );
    expect(codes(text().replace("3 ogn-001-298", "3 ogs-001-024"))).toContain(
      "copy-limit",
    );
  });
  it("reports exact lines for unknown, malformed quantity, and ambiguous names", () => {
    const invalid = text().replace(
      "3 ogn-001-298 # Blazing Scorcher",
      "0 ogn-001-298",
    );
    const quantity = parseDeckText(invalid).issues.find(
      (issue) => issue.code === "invalid-quantity",
    );
    expect(quantity?.line).toBeGreaterThan(1);
    const missing = parseDeckText(
      `${text()}\n1 Definitely Not A Card`,
    ).issues.find((issue) => issue.code === "unknown-card");
    expect(missing?.line).toBe(text().split("\n").length + 1);
    const ambiguous = parseDeckText(
      text().replace("Annie - Dark Child (Starter)", "Annie"),
    );
    // Full IDs remain unambiguous even when a human-readable trailing comment is abbreviated.
    expect(ambiguous.deck).not.toBeNull();
    expect(
      parseDeckText(
        text().replace(/1 ogs-017-024[^\n]*/, "Master Yi"),
      ).issues.some((issue) => issue.code === "ambiguous-card"),
    ).toBe(true);
  });
  it("does not silently skip wrong sections, foreign domains, or a mismatched chosen champion", () => {
    expect(codes(text().replace("3 ogn-001-298", "3 ogn-007-298"))).toContain(
      "section-type",
    );
    expect(codes(text().replace("3 ogn-001-298", "3 ogn-049-298"))).toContain(
      "domain",
    );
    expect(codes(text().replace("1 ogs-001-024", "1 ogs-007-024"))).toContain(
      "champion-identity",
    );
    expect(codes(text().replace("6 ogn-007-298", "6 ogn-042-298"))).toContain(
      "invalid-rune",
    );
  });
  it("validates runes, battlefields, blank lists and excessive input without throwing", () => {
    expect(codes(text().replace("6 ogn-007-298", "5 ogn-007-298"))).toContain(
      "rune-count",
    );
    expect(codes(`${text()}1 ogn-280-298`)).toContain("duplicate-battlefield");
    expect(codes(text().replace("1 ogn-280-298", "1 ogn-001-298"))).toContain(
      "battlefield-type",
    );
    expect(parseDeckText("").deck).toBeNull();
    expect(codes("x".repeat(100_001))).toEqual(["text-size"]);
    for (const quantity of ["-3", "3.5", "99999999999999999999"])
      expect(
        codes(text().replace("3 ogn-001-298", `${quantity} ogn-001-298`)),
      ).toContain("invalid-quantity");
  });
  it("validates malformed programmatic entries and unknown cards without getCard exceptions", () => {
    const deck = example();
    deck.main[0] = { cardId: "unknown-card", count: NaN };
    const issues = validateImportedDeck(deck);
    expect(issues.map((issue) => issue.code)).toContain("invalid-quantity");
    expect(issues.map((issue) => issue.code)).toContain("unknown-card");
  });
  it("separates supported effects from structural validity and does not count basic runes as missing", () => {
    const deck = example();
    expect(
      getDeckScriptCoverage(deck).missing.some((card) =>
        card.name.endsWith("Rune"),
      ),
    ).toBe(false);
    const candidate = cards.find(
      (card) =>
        !card.variant &&
        card.type === "Unit" &&
        card.supertype !== "Token" &&
        card.domains.every((domain) => deck.domains.includes(domain)) &&
        !deck.main.some((entry) => entry.cardId === card.id) &&
        !getDeckScriptCoverage({
          ...deck,
          main: [{ cardId: card.id, count: 1 }],
        }).complete,
    );
    if (candidate) {
      deck.main[0].cardId = candidate.id;
      const result = parseDeckText(exportDeckText(deck));
      expect(result.deck).not.toBeNull();
      expect(result.playable).toBe(false);
      expect(
        result.coverage?.missing.some((card) => card.cardId === candidate.id),
      ).toBe(true);
    }
  });
});
describe("safe local imported-deck persistence", () => {
  it("saves validated lists and restores a unique stable deck ID", () => {
    const deck = parseDeckText(text()).deck!;
    const local = storage();
    expect(saveImportedDecks([deck, deck], local)).toBe(true);
    const restored = loadImportedDecks(local);
    expect(restored).toEqual([deck]);
    expect(saveImportedDecks([{ ...deck, main: [] }], local)).toBe(false);
    expect(loadImportedDecks(local)).toEqual([deck]);
  });
  it("tolerates corrupted JSON, wrong schemas, invalid deck strings and denied storage", () => {
    for (const value of ["{broken", "{}", "[null, 42, {}]", '["bogus deck"]'])
      expect(loadImportedDecks(storage(value))).toEqual([]);
    const denied = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadImportedDecks(denied)).toEqual([]);
    expect(saveImportedDecks([example()], denied)).toBe(false);
  });
});
