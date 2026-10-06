import { reviewedPrintingAliases } from "../src/game/printing-aliases";
import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  canonicalCardName,
  gameplayFingerprint,
} from "../src/data/card-identity";
import { buildCardRegistry } from "../src/game/card-registry";
import {
  cardRegistry,
  getRulesCardId,
  getScript,
  isImplemented,
} from "../src/game/scripts";
import { createGame } from "../src/game/engine";
import { starterDecks } from "../src/data/decks";
import {
  exportDeckText,
  parseDeckText,
  validateImportedDeck,
} from "../src/game/deck-import";

describe("complete printing registry", () => {
  it("keeps both hybrid Porobot records unavailable until Unit/Gear rules exist", () => {
    const porobots = cards.filter(
      (card) => canonicalCardName(card.name) === "patched porobot",
    );
    expect(porobots).toHaveLength(2);
    for (const card of porobots) {
      expect(cardRegistry[card.id].status).toBe("unsupported");
      expect(cardRegistry[card.id].reason).toContain("both Unit and Gear");
      expect(getScript(card.id)).toBeUndefined();
    }
  });
  it("cannot restore a hybrid card through compilation or printing aliases", () => {
    const base = cards.find((card) => card.name === "Patched Porobot")!;
    const alias = {
      ...base,
      id: "porobot-promo",
      name: "Patched Porobot (Promo)",
    };
    const script = { implemented: true as const };
    const result = buildCardRegistry(
      [base, alias],
      { [base.id]: script },
      () => script,
    );
    for (const card of [base, alias]) {
      expect(result[card.id].status).toBe("unsupported");
      expect(result[card.id].script).toBeUndefined();
    }
  });
  it("registers every catalog printing and rules token with explicit support status", () => {
    expect(Object.keys(cardRegistry).sort()).toEqual(
      cards.map((c) => c.id).sort(),
    );
    const reviewed = reviewedPrintingAliases(cards);
    for (const card of cards) {
      const record = cardRegistry[card.id];
      expect(record.cardId).toBe(card.id);
      expect(isImplemented(card.id)).toBe(record.status !== "unsupported");
      expect(getScript(card.id)).toEqual(record.script);
      if (record.status === "unsupported") expect(record.reason).toBeTruthy();
      if (record.status === "alias") {
        if (reviewed[card.id]) {
          expect(record.rulesCardId).toBe(getRulesCardId(reviewed[card.id]));
          expect(gameplayFingerprint({ ...card, text: "" })).toBe(
            gameplayFingerprint({ ...getCard(record.rulesCardId), text: "" }),
          );
        } else
          expect(gameplayFingerprint(card)).toBe(
            gameplayFingerprint(getCard(record.rulesCardId)),
          );
        expect(record.script).toBe(getScript(record.rulesCardId));
      }
    }
    expect(getScript("__proto__")).toBeUndefined();
    expect(getScript("constructor")).toBeUndefined();
    expect(isImplemented("not-a-card")).toBe(false);
  });
  it("shares only complete equivalent faces, never a matching name or collector number alone", () => {
    const base = getCard("ogn-001-298");
    const same = {
      ...base,
      id: "alias",
      name: "Blazing Scorcher (Alternate Art)",
    };
    const changedText = {
      ...same,
      id: "changed-text",
      text: base.text + " Draw 1.",
    };
    const changedCost = { ...same, id: "changed-cost", energy: 1 };
    const changedTags = { ...same, id: "changed-tags", tags: ["Mech"] };
    const script = { implemented: true as const, accelerating: true };
    const result = buildCardRegistry(
      [base, same, changedText, changedCost, changedTags],
      { [base.id]: script },
      () => undefined,
    );
    expect(result.alias.rulesCardId).toBe(base.id);
    expect(result.alias.script).toBe(script);
    for (const key of ["changed-text", "changed-cost", "changed-tags"])
      expect(result[key].status).toBe("unsupported");
    expect(
      buildCardRegistry([same, base], { [base.id]: script }, () => undefined),
    ).toEqual(
      buildCardRegistry([base, same], { [base.id]: script }, () => undefined),
    );
  });
  it("does not assign Blade Twirler's script to Vendetta runes or showcase Sona", () => {
    const sona = cards.find((c) => c.riftboundId === "ven-sp2-006")!;
    const rune = cards.find((c) => c.riftboundId === "ven-r02")!;
    expect(getScript(sona.id)).not.toEqual(
      getScript(cards.find((c) => c.riftboundId === "ven-002-166")!.id),
    );
    expect(getScript(rune.id)?.onMove).toBeUndefined();
    // The showcase has revised text/tags; it must not inherit a different face blindly.
    expect(getScript(sona.id)?.onMove).toBeUndefined();
  });
  it("preserves variant selections in saved decks but initializes the exact canonical engine hooks", () => {
    const deck = structuredClone(starterDecks[0]);
    const legend = cards.find((c) => c.name === "Annie - Dark Child (Metal)")!;
    deck.legendId = legend.id;
    deck.main[0].cardId = "opp-001-298";
    const parsed = parseDeckText(exportDeckText(deck));
    expect(parsed.issues).toEqual([]);
    expect(parsed.deck?.legendId).toBe(legend.id);
    expect(parsed.deck?.main[0].cardId).toBe("opp-001-298");
    const canonical = createGame({ playerDeck: starterDecks[0], seed: 215 });
    const alias = createGame({ playerDeck: deck, seed: 215 });
    expect(alias).toEqual(canonical);
    expect(deck.legendId).toBe(legend.id);
  });
  it("counts alternate art, overnumbered, and promotional copies together", () => {
    expect(canonicalCardName("Jinx, Demolitionist (Overnumbered)")).toBe(
      canonicalCardName("Jinx - Demolitionist"),
    );
    const deck = structuredClone(starterDecks[0]);
    deck.main[0].count = 2;
    deck.main.push({ cardId: "opp-001-298", count: 2 });
    expect(
      validateImportedDeck(deck).some((i) => i.code === "copy-limit"),
    ).toBe(true);
  });
  it("resolves equivalent name-only promo records without artificial ambiguity", () => {
    const text = exportDeckText(starterDecks[0]).replace(
      /1 ogs-017-024[^\n]*/,
      "1 Annie",
    );
    const result = parseDeckText(text);
    expect(result.issues).toEqual([]);
    expect(result.playable).toBe(true);
  });
  it("blocks unsupported engine initialization even if a caller bypasses the lobby", () => {
    const unsupported = cards.find(
      (c) => c.type === "Unit" && !isImplemented(c.id),
    )!;
    const deck = structuredClone(starterDecks[0]);
    deck.main[0].cardId = unsupported.id;
    expect(() => createGame({ playerDeck: deck })).toThrow("unsupported cards");
  });
  it("uses the supplied single battlefield when an imported optional pool is empty", () => {
    const deck = { ...structuredClone(starterDecks[0]), battlefieldIds: [] };
    expect(validateImportedDeck(deck)).toEqual([]);
    expect(createGame({ playerDeck: deck, seed: 4 }).fields[0].cardId).toBe(
      deck.battlefieldId,
    );
  });
});
