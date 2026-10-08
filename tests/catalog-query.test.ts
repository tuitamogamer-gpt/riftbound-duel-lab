import { describe, expect, it } from "vitest";
import {
  createCardSearchIndex,
  matchesCardSearch,
  sortCatalogCards,
} from "../src/catalog-query";
import { cards, cardsById } from "../src/data/cards";
import { canonicalBuilderId } from "../src/game/deck-builder";

describe("catalog discovery", () => {
  it("finds a rules face by its alternate printing ID and preserves that printing's set", () => {
    const alternate = cardsById["ogn-027a-298"];
    const canonical = canonicalBuilderId(alternate.id);
    expect(canonical).not.toBe(alternate.id);
    const index = createCardSearchIndex(cards, canonicalBuilderId);
    expect(
      matchesCardSearch(index.get(canonical), alternate.id.toUpperCase()),
    ).toBe(true);
    expect(matchesCardSearch(index.get(canonical), "ogn027a298")).toBe(true);
    expect(index.get(canonical)?.sets).toContain(alternate.set);
    const printingIndex = createCardSearchIndex(cards);
    expect(matchesCardSearch(printingIndex.get(canonical), alternate.id)).toBe(
      false,
    );
    expect(
      matchesCardSearch(printingIndex.get(alternate.id), alternate.id),
    ).toBe(true);
  });

  it("keeps a same-name card with different rules separate", () => {
    const index = createCardSearchIndex(cards, canonicalBuilderId);
    const alternate = cards.find(
      (card) =>
        card.name.includes("Jinx") &&
        card.id !== canonicalBuilderId("ogn-030a-298") &&
        canonicalBuilderId(card.id) !== canonicalBuilderId("ogn-030a-298"),
    )!;
    expect(alternate).toBeDefined();
    expect(
      matchesCardSearch(
        index.get(canonicalBuilderId("ogn-030a-298")),
        alternate.id,
      ),
    ).toBe(false);
  });

  it("matches all terms in any order across readable rules, tags and keywords", () => {
    const index = createCardSearchIndex([
      {
        id: "X-1",
        name: "Éowyn – Hero",
        set: "ABC",
        setName: "An Expansion",
        text: "Deal :rb_energy_2: damage to an enemy.",
        tags: ["Warrior"],
        keywords: ["Shield"],
      },
    ]);
    const entry = index.get("X-1");
    expect(matchesCardSearch(entry, "WARRIOR eowyn damage")).toBe(true);
    expect(matchesCardSearch(entry, 'shield "2 energy"')).toBe(true);
    expect(matchesCardSearch(entry, "shield nonexistent")).toBe(false);
    expect(matchesCardSearch(entry, '"enemy damage"')).toBe(false);
    expect(matchesCardSearch(undefined, "  ")).toBe(true);
    expect(matchesCardSearch(undefined, "damage")).toBe(false);
  });

  it("sorts costs and Might deterministically without treating missing values as zero", () => {
    const input = [
      { id: "rune", name: "A rune", energy: null, might: null },
      { id: "cheap-b", name: "Z unit", energy: 0, might: 2 },
      { id: "expensive", name: "Big unit", energy: 8, might: 8 },
      { id: "cheap-a", name: "A spell", energy: 0, might: null },
    ];
    expect(
      sortCatalogCards(input, "energy-asc").map((card) => card.id),
    ).toEqual(["cheap-a", "cheap-b", "expensive", "rune"]);
    expect(
      sortCatalogCards(input, "energy-desc").map((card) => card.id),
    ).toEqual(["expensive", "cheap-a", "cheap-b", "rune"]);
    expect(
      sortCatalogCards(input, "might-desc").map((card) => card.id),
    ).toEqual(["expensive", "cheap-b", "rune", "cheap-a"]);
    expect(sortCatalogCards([...input].reverse(), "energy-asc")).toEqual(
      sortCatalogCards(input, "energy-asc"),
    );
    expect(input.map((card) => card.id)).toEqual([
      "rune",
      "cheap-b",
      "expensive",
      "cheap-a",
    ]);
  });
});
