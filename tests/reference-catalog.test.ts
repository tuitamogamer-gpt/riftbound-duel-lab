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
  playableReferencePreconIds,
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
import { reviewedReferencePrintings as reviewed } from "../src/game/scripts";

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
      // Only individually reviewed printings leave the reference-only state.
      expect(cardRegistry[card.id].status === "unsupported").toBe(
        !reviewed.has(card.id),
      );
      expect(isImplemented(card.id)).toBe(reviewed.has(card.id));
    }
    expect([...supportedCardIds].sort()).toEqual(
      [
        ...[...providerCards, ...rulesTokens].map((card) => card.id),
        ...reviewed,
      ].sort(),
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

    // Reviewing one exact ID promotes that printing only.
    const reviewedOnly = buildCardRegistry(
      [base, equivalent, explicitReference, reviewedReference],
      { [base.id]: script, [explicitReference.id]: script },
      compile,
      { [reviewedReference.id]: base.id },
      new Set([explicitReference.id]),
    );
    expect(reviewedOnly[explicitReference.id].status).toBe("scripted");
    for (const card of [equivalent, reviewedReference])
      expect(reviewedOnly[card.id].status).toBe("unsupported");
    expect(compile).not.toHaveBeenCalled();
  });

  it("accepts reviewed Radiance runes but blocks an unsupported printing in an otherwise supported deck", () => {
    const deck = structuredClone(starterDecks[0]);
    const rune = deck.runes[0];
    const radianceRune = referenceCards.find(
      (card) =>
        card.type === "Rune" &&
        !card.variant &&
        card.name === getCard(rune.cardId).name,
    )!;
    rune.cardId = radianceRune.id;
    expect(getDeckScriptCoverage(deck).complete).toBe(true);
    const imported = parseDeckText(exportDeckText(deck));
    expect(imported.deck?.runes[0].cardId).toBe(radianceRune.id);
    expect(imported.playable).toBe(true);
    expect(() => createGame({ playerDeck: deck })).not.toThrow();

    // Every Radiance printing has now been reviewed, so an unknown printing
    // (as a future reference import would add) stands in for an unreviewed one.
    expect(referenceCards.filter((card) => !reviewed.has(card.id))).toEqual([]);
    const blocked = { id: "rad-999-167" };
    deck.main[0].cardId = blocked.id;
    const coverage = getDeckScriptCoverage(deck);
    expect(coverage.complete).toBe(false);
    expect(coverage.missing.map((card) => card.cardId)).toEqual([blocked.id]);
    expect(parseDeckText(exportDeckText(deck)).playable).toBe(false);
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

  it("imports both official lists and promotes exactly the fully executable ones", () => {
    expect(officialPreconDecks).toHaveLength(13);
    expect(referencePreconDecks).toHaveLength(2);
    for (const deck of referencePreconDecks) {
      expect(validateDeck(deck)).toEqual([]);
      expect(deck.main.reduce((sum, entry) => sum + entry.count, 1)).toBe(40);
      expect(deck.runes.reduce((sum, entry) => sum + entry.count, 0)).toBe(12);
      expect(deck.battlefieldIds).toHaveLength(3);
      const complete = getDeckScriptCoverage(deck).complete;
      expect(playableReferencePreconIds.has(deck.id)).toBe(complete);
      expect(decks.some((playable) => playable.id === deck.id)).toBe(complete);
      if (complete)
        expect(createGame({ playerDeck: deck }).players[0].deckId).toBe(
          deck.id,
        );
      else
        expect(() => createGame({ playerDeck: deck })).toThrow(
          "unsupported cards",
        );
    }
    expect(
      officialPreconDecks.every((deck) => getDeckScriptCoverage(deck).complete),
    ).toBe(true);
  });

  it("keeps existing match compatibility and adds only reviewed Radiance printings", () => {
    const state = createGame({ seed: 221026 });
    expect(state.matchConfig?.cardDataVersion).toBe(
      "0861c196b3100198a9fffa7b9465afc76a2e4b07db84e63e8efa6145fea25f6c",
    );
    expect(state.matchConfig?.supportedCardIds).toHaveLength(
      providerCards.length + rulesTokens.length + reviewed.size,
    );
    expect(
      state.matchConfig?.supportedCardIds.filter((id) => id.startsWith("rad-")),
    ).toEqual([...reviewed].sort());
    expect(deserializeGame(serializeGame(state))).toEqual(state);
  });
});
