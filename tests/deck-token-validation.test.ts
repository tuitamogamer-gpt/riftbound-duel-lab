import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import { decks, starterDecks, validateDeck } from "../src/data/decks";
import {
  cloneDeckForBuilder,
  canonicalBuilderId,
  finalizeBuilderDeck,
} from "../src/game/deck-builder";
import {
  exportDeckText,
  parseDeckText,
  validateImportedDeck,
} from "../src/game/deck-import";
import { parseBuilderDraft } from "../src/game/builder-draft";

describe("generated token registration", () => {
  it("rejects generated Unit tokens in the main deck and sideboard in both formats", () => {
    const token = cards.find(
      (card) => card.supertype === "Token" && card.type === "Unit",
    )!;
    for (const format of ["standard", "historical-precon"] as const) {
      for (const section of ["main", "sideboard"] as const) {
        const deck = cloneDeckForBuilder(starterDecks[0]);
        deck.format = format;
        if (section === "main")
          deck.main = [
            ...deck.main.slice(1),
            { cardId: token.id, count: deck.main[0].count },
          ];
        else deck.sideboard = [{ cardId: token.id, count: 1 }];
        expect(
          validateDeck(deck).some((message) =>
            message.startsWith("Tokens cannot"),
          ),
          `${format}/${section}`,
        ).toBe(true);
        expect(
          validateImportedDeck(deck).some(
            (issue) => issue.code === "token-card" && issue.cardId === token.id,
          ),
          `${format}/${section}`,
        ).toBe(true);
        expect(
          parseDeckText(exportDeckText(deck)).deck,
          `${format}/${section}`,
        ).toBeNull();
      }
    }
  });

  it("rejects generated Battlefields instead of mistaking them for registered practice fields", () => {
    const tokens = cards.filter(
      (card) => card.supertype === "Token" && card.type === "Battlefield",
    );
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      const deck = cloneDeckForBuilder(starterDecks[0]);
      deck.battlefieldId = token.id;
      deck.battlefieldIds = [token.id];
      expect(
        validateDeck(deck).some((message) =>
          message.startsWith("Tokens cannot"),
        ),
        token.id,
      ).toBe(true);
      expect(
        validateImportedDeck(deck).some(
          (issue) => issue.code === "token-card" && issue.cardId === token.id,
        ),
        token.id,
      ).toBe(true);
      expect(finalizeBuilderDeck(deck).deck, token.id).toBeNull();
      expect(
        parseBuilderDraft(
          JSON.stringify({
            version: 1,
            savedAt: "2026-10-07T22:45:00.000Z",
            sourceId: "annie",
            deck,
          }),
        ),
        token.id,
      ).toBeNull();
    }
  });

  it("keeps every historical precon and real unlimited Spiderling card legal", () => {
    for (const deck of decks)
      expect(
        validateImportedDeck(deck).filter(
          (issue) => issue.code === "token-card",
        ),
        deck.id,
      ).toEqual([]);
    const deck = cloneDeckForBuilder(
      starterDecks.find((candidate) => candidate.domains.includes("Chaos"))!,
    );
    deck.main = [{ cardId: canonicalBuilderId("ven-097-166"), count: 39 }];
    expect(
      validateImportedDeck(deck).filter(
        (issue) => issue.code === "token-card" || issue.code === "copy-limit",
      ),
    ).toEqual([]);
    expect(
      validateDeck(deck).some((message) => message.startsWith("Tokens cannot")),
    ).toBe(false);
  });
});
