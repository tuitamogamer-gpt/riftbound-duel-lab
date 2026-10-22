import { describe, expect, it, vi } from "vitest";
import {
  cards,
  catalogMeta,
  getCard,
  providerCards,
  referenceCards,
  referenceCatalogMeta,
} from "../src/data/cards";
import { rulesTokens } from "../src/data/tokens";
import {
  decks,
  officialPreconDecks,
  referencePreconDecks,
  starterDecks,
  validateDeck,
} from "../src/data/decks";
import { catalogDigest } from "../scripts/catalog-sync.mjs";
import { buildCardRegistry } from "../src/game/card-registry";
import {
  cardRegistry,
  isImplemented,
  supportedCardIds,
} from "../src/game/scripts";
import {
  getDeckScriptCoverage,
  exportDeckText,
  parseDeckText,
  resolveImportCard,
} from "../src/game/deck-import";
import { createGame, deserializeGame, serializeGame } from "../src/game/engine";

describe("Radiance reference catalog", () => {
  it("imports every base number and retains source identity without modifying the playable snapshot", () => {
    expect(referenceCards).toHaveLength(219);
    expect(catalogDigest(referenceCards)).toBe(
      referenceCatalogMeta.cardDataSha256,
    );
    expect(catalogDigest(providerCards)).toBe(catalogMeta.cardDataSha256);
    expect(providerCards).toHaveLength(1451);
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
    for (let number = 1; number <= 167; number++)
      expect(
        getCard(`rad-${String(number).padStart(3, "0")}-167`).referenceOnly,
      ).toBe(true);
    for (const card of referenceCards) {
      expect(card.providerId).toBe(`hextech:${card.riftboundId}`);
      expect(card.sourceUrl).toBe(
        `https://hextechanalytics.com/cards/${card.riftboundId}`,
      );
      expect(new URL(card.image).hostname).toBe("cmsassets.rgpub.io");
      expect(cardRegistry[card.id].status).toBe("unsupported");
      expect(isImplemented(card.id)).toBe(false);
    }
    expect([...supportedCardIds].sort()).toEqual(
      [...providerCards, ...rulesTokens].map((card) => card.id).sort(),
    );
  });

  it("retains all four official October errata in the imported reference text", () => {
    expect(getCard("rad-081-167").text).toContain("give a friendly unit +3");
    expect(getCard("rad-081-167").text).not.toContain("another friendly unit");
    expect(getCard("rad-154-167").text).toContain(
      "this turn, even from face down,",
    );
    expect(getCard("rad-010-167").text).toContain("Then banish this.");
    expect(getCard("rad-167-167").text).toContain(
      "choose up to 3 different legends",
    );
  });

  it("never promotes references through compilation, equivalent printings, explicit scripts or reviewed aliases", () => {
    const base = getCard("ogn-001-298");
    const equivalent = {
      ...base,
      id: "reference-equivalent",
      referenceOnly: true,
    };
    const explicitReference = { ...equivalent, id: "reference-explicit" };
    const reviewedReference = {
      ...equivalent,
      id: "reference-reviewed",
      text: "Different printed text.",
    };
    const script = { implemented: true as const };
    const compile = vi.fn(() => script);
    const result = buildCardRegistry(
      [base, equivalent, explicitReference, reviewedReference],
      { [base.id]: script, [explicitReference.id]: script },
      compile,
      { [reviewedReference.id]: base.id },
    );
    expect(compile).not.toHaveBeenCalled();
    expect(result[base.id].script).toBe(script);
    for (const card of [equivalent, explicitReference, reviewedReference]) {
      expect(result[card.id].status).toBe("unsupported");
      expect(result[card.id].script).toBeUndefined();
      expect(result[card.id].reason).toContain("Reference import");
    }
  });

  it("blocks a reference rune even when every other card in an imported deck is supported", () => {
    const deck = structuredClone(starterDecks[0]);
    deck.runes[0].cardId = "rad-r01";
    const coverage = getDeckScriptCoverage(deck);
    expect(coverage.complete).toBe(false);
    expect(coverage.missing.map((card) => card.cardId)).toEqual(["rad-r01"]);
    const imported = parseDeckText(exportDeckText(deck));
    expect(imported.deck?.runes[0].cardId).toBe("rad-r01");
    expect(imported.playable).toBe(false);
    expect(() => createGame({ playerDeck: deck })).toThrow("unsupported cards");
  });

  it("keeps name-only basic runes unambiguous without replacing requested reference printing IDs", () => {
    for (const domain of ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"]) {
      for (const name of [domain, `${domain} Rune`]) {
        const matches = resolveImportCard(name, "runes");
        expect(matches).toHaveLength(1);
        expect(matches[0].referenceOnly).not.toBe(true);
        expect(isImplemented(matches[0].id)).toBe(true);
      }
    }
    expect(
      resolveImportCard("rad-r01", "runes").map((card) => card.id),
    ).toEqual(["rad-r01"]);
    expect(
      resolveImportCard("Fury Rune [rad-r01]", "runes").map((card) => card.id),
    ).toEqual(["rad-r01"]);
  });

  it("imports both official lists for inspection while preserving all playable presets", () => {
    expect(officialPreconDecks).toHaveLength(13);
    expect(referencePreconDecks).toHaveLength(2);
    for (const deck of referencePreconDecks) {
      expect(validateDeck(deck)).toEqual([]);
      expect(deck.main.reduce((sum, entry) => sum + entry.count, 1)).toBe(40);
      expect(deck.runes.reduce((sum, entry) => sum + entry.count, 0)).toBe(12);
      expect(deck.battlefieldIds).toHaveLength(3);
      expect(decks.some((playable) => playable.id === deck.id)).toBe(false);
      expect(getDeckScriptCoverage(deck).complete).toBe(false);
      expect(() => createGame({ playerDeck: deck })).toThrow(
        "unsupported cards",
      );
    }
    expect(
      officialPreconDecks.every((deck) => getDeckScriptCoverage(deck).complete),
    ).toBe(true);
  });

  it("keeps existing match compatibility and restores the original playable ID set", () => {
    const state = createGame({ seed: 221026 });
    expect(state.matchConfig?.cardDataVersion).toBe(
      "0861c196b3100198a9fffa7b9465afc76a2e4b07db84e63e8efa6145fea25f6c",
    );
    expect(state.matchConfig?.supportedCardIds).toHaveLength(1459);
    expect(
      state.matchConfig?.supportedCardIds.some((id) => id.startsWith("rad-")),
    ).toBe(false);
    expect(deserializeGame(serializeGame(state))).toEqual(state);
  });
});
