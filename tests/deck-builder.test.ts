import { describe, expect, it } from "vitest";
import { cards, cardsById } from "../src/data/cards";
import {
  canonicalCardName,
  gameplayFingerprint,
} from "../src/data/card-identity";
import { decks, MAX_MAIN_DECK_SIZE, starterDecks } from "../src/data/decks";
import {
  exportDeckText,
  parseDeckText,
  validateImportedDeck,
} from "../src/game/deck-import";
import {
  balancedBuilderRunes,
  builderAddIssue,
  builderChampions,
  builderCopies,
  builderCount,
  builderCurve,
  canonicalBuilderCards,
  canonicalBuilderId,
  changeBuilderQuantity,
  cloneDeckForBuilder,
  finalizeBuilderDeck,
} from "../src/game/deck-builder";

const example = () =>
  cloneDeckForBuilder(starterDecks.find((deck) => deck.id === "annie")!);

describe("local deck construction", () => {
  it("keeps every available deck legal while leaving the source collections untouched", () => {
    for (const source of decks) {
      const original = JSON.stringify(source);
      const draft = cloneDeckForBuilder(source);
      expect(
        validateImportedDeck(draft).filter(
          (issue) => issue.severity === "error",
        ),
        source.id,
      ).toEqual([]);
      expect(builderCount(draft.main), source.id).toBe(
        builderCount(source.main),
      );
      expect(draft.main).not.toBe(source.main);
      expect(draft.domains).not.toBe(source.domains);
      draft.main[0].count--;
      draft.domains.reverse();
      expect(JSON.stringify(source), source.id).toBe(original);
    }
  });

  it("collapses equivalent printings but preserves distinct rules under the same name", () => {
    const byName = new Map<string, typeof cards>();
    for (const card of cards.filter((card) => card.supertype !== "Token")) {
      const name = canonicalCardName(card.name);
      byName.set(name, [...(byName.get(name) ?? []), card]);
    }
    const faces = [...byName.values()].find(
      (group) =>
        new Set(group.map(gameplayFingerprint)).size > 1 &&
        group.length > new Set(group.map(gameplayFingerprint)).size,
    )!;
    expect(faces).toBeDefined();
    const grouped = canonicalBuilderCards(faces);
    expect(grouped).toHaveLength(new Set(faces.map(gameplayFingerprint)).size);
    expect(
      canonicalBuilderCards([...faces].reverse()).map((card) => card.id),
    ).toEqual(grouped.map((card) => card.id));
    expect(new Set(grouped.map(gameplayFingerprint)).size).toBe(grouped.length);
  });

  it("counts the chosen champion together with main and sideboard copies", () => {
    const deck = example();
    const id = deck.championId;
    deck.main = [];
    deck.sideboard = [];
    const two = changeBuilderQuantity(
      changeBuilderQuantity(deck, id, "main", 1),
      id,
      "sideboard",
      1,
    );
    expect(builderCopies(two, id)).toBe(3);
    expect(builderAddIssue(two, id, "main")).toBe("copies");
    expect(changeBuilderQuantity(two, id, "main", 1)).toBe(two);
    const removed = changeBuilderQuantity(two, id, "sideboard", -1);
    expect(builderAddIssue(removed, id, "main")).toBeNull();
    expect(removed.sideboard).toEqual([]);
  });

  it("enforces the same copy limit across distinct printings of one rules name", () => {
    const deck = example();
    const card = cardsById[deck.main[0].cardId];
    const alternate = cards.find(
      (candidate) =>
        candidate.id !== card.id &&
        gameplayFingerprint(candidate) === gameplayFingerprint(card),
    )!;
    expect(alternate).toBeDefined();
    expect(builderCopies(deck, alternate.id)).toBe(3);
    expect(builderAddIssue(deck, alternate.id, "sideboard")).toBe("copies");
    expect(canonicalBuilderId(card.id)).toBe(canonicalBuilderId(alternate.id));
  });

  it("honors unlimited copies while rejecting normal copy excess", () => {
    const deck = example();
    const id = canonicalBuilderId("ven-097-166");
    deck.main = [{ cardId: id, count: 38 }];
    deck.sideboard = [];
    expect(builderAddIssue(deck, id, "main")).toBeNull();
    const updated = changeBuilderQuantity(deck, id, "main", 1);
    expect(updated.main[0].count).toBe(39);
    expect(
      validateImportedDeck(updated).filter(
        (issue) => issue.code === "copy-limit",
      ),
    ).toEqual([]);
    updated.main[0].count = MAX_MAIN_DECK_SIZE - 1;
    expect(finalizeBuilderDeck(updated).deck).not.toBeNull();
    expect(builderAddIssue(updated, id, "main")).toBe("quantity");
    expect(changeBuilderQuantity(updated, id, "main", 1)).toBe(updated);
  });

  it("enforces Unique and Signature limits across main and sideboard", () => {
    const deck = example();
    deck.domains = ["Calm", "Mind"];
    const unique = canonicalBuilderId("sfd-190-221");
    deck.main = [{ cardId: unique, count: 1 }];
    deck.sideboard = [];
    expect(builderAddIssue(deck, unique, "sideboard")).toBe("unique");
    const annie = example();
    const signature = canonicalBuilderId("ogs-018-024");
    annie.main = [{ cardId: signature, count: 2 }];
    annie.sideboard = [{ cardId: signature, count: 1 }];
    expect(builderAddIssue(annie, signature, "main")).toBe("copies");
    annie.main = [];
    expect(builderAddIssue(annie, "ogn-252-298", "main")).toBe("signature-tag");
    const yi = cloneDeckForBuilder(
      starterDecks.find((deck) => deck.id === "master-yi")!,
    );
    yi.main = [{ cardId: canonicalBuilderId("ogs-020-024"), count: 2 }];
    yi.sideboard = [{ cardId: canonicalBuilderId("unl-192-219"), count: 1 }];
    expect(builderAddIssue(yi, canonicalBuilderId("ogs-020-024"), "main")).toBe(
      "signature",
    );
  });

  it("requires compatible domains, preserves historical banned cards, and bounds rune and sideboard pools", () => {
    const deck = example();
    expect(builderAddIssue(deck, "ogn-085-298", "main")).toBe("domain");
    expect(builderAddIssue(deck, deck.runes[0].cardId, "runes")).toBe("runes");
    deck.runes[0].count--;
    expect(builderAddIssue(deck, deck.runes[0].cardId, "runes")).toBeNull();
    const banned = cards.find(
      (card) =>
        card.bannedInDuel && ["Unit", "Spell", "Gear"].includes(card.type),
    )!;
    deck.domains = [...banned.domains];
    deck.main = [];
    deck.sideboard = [];
    expect(builderAddIssue(deck, banned.id, "main")).toBe("banned");
    deck.format = "historical-precon";
    expect(builderAddIssue(deck, banned.id, "main")).toBeNull();
    deck.sideboard = [{ cardId: banned.id, count: 10 }];
    expect(builderAddIssue(deck, banned.id, "sideboard")).toBe("sideboard");
  });

  it("only offers champions sharing the selected legend's tag and domains", () => {
    for (const source of decks) {
      const champions = builderChampions(source.legendId);
      const legend = cardsById[source.legendId];
      expect(champions.length, source.id).toBeGreaterThan(0);
      expect(
        champions.every(
          (card) =>
            card.tags.some((tag) => legend.tags.includes(tag)) &&
            card.domains.every(
              (domain) =>
                domain === "Colorless" || legend.domains.includes(domain),
            ),
        ),
      ).toBe(true);
    }
  });

  it("balances exactly twelve runes for one, two or three supported domains", () => {
    for (const domains of [
      ["Fury"],
      ["Fury", "Chaos"],
      ["Fury", "Chaos", "Mind"],
    ] as const) {
      const runes = balancedBuilderRunes([...domains]);
      expect(builderCount(runes)).toBe(12);
      expect(
        runes.every((entry) =>
          cardsById[entry.cardId].domains.every((domain) =>
            domains.includes(domain as never),
          ),
        ),
      ).toBe(true);
    }
  });

  it("includes the chosen champion in energy curves and groups high costs in 9+", () => {
    const deck = example();
    const curve = builderCurve(deck);
    expect(curve.reduce((total, count) => total + count, 0)).toBe(40);
    const cost = Math.min(9, cardsById[deck.championId].energy ?? 0);
    const mainAtCost = deck.main
      .filter(
        (entry) => Math.min(9, cardsById[entry.cardId].energy ?? 0) === cost,
      )
      .reduce((count, entry) => count + entry.count, 0);
    expect(curve[cost]).toBe(mainAtCost + 1);
  });

  it("round-trips canonical drafts with stable identities and separate champion copies in a larger deck", () => {
    const deck = example();
    const original = finalizeBuilderDeck(deck);
    expect(original.deck).not.toBeNull();
    deck.name = "Renamed deck";
    deck.main.reverse();
    expect(finalizeBuilderDeck(deck).deck?.id).toBe(original.deck?.id);
    expect(finalizeBuilderDeck(deck).deck?.name).toBe("Renamed deck");
    const champion = deck.main.find(
      (entry) => entry.cardId === deck.championId,
    );
    if (champion) champion.count--;
    deck.main = deck.main.filter((entry) => entry.count > 0);
    while (builderCount(deck.main) < 40) {
      const candidate = cards.find(
        (card) => builderAddIssue(deck, card.id, "main") === null,
      )!;
      const next = changeBuilderQuantity(deck, candidate.id, "main", 1);
      expect(next).not.toBe(deck);
      deck.main = next.main;
    }
    expect(builderCount(deck.main)).toBe(40);
    const larger = finalizeBuilderDeck(deck);
    expect(larger.issues.filter((issue) => issue.severity === "error")).toEqual(
      [],
    );
    expect(builderCount(larger.deck!.main)).toBe(40);
    expect(larger.deck?.id).not.toBe(original.deck?.id);
    expect(parseDeckText(exportDeckText(larger.deck!)).deck).toEqual(
      larger.deck,
    );
  });
});
