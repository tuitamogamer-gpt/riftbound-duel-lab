import { describe, expect, it } from "vitest";
import { getCodeFromDeck } from "@piltoverarchive/riftbound-deck-codes";
import { starterDecks, MAX_MAIN_DECK_SIZE } from "../src/data/decks";
import { cardsById } from "../src/data/cards";
import { importDeckSource } from "../src/game/deck-sources";
import {
  exportDeckText,
  loadImportedDecks,
  saveImportedDecks,
  resolveImportCard,
} from "../src/game/deck-import";

const example = () => structuredClone(starterDecks[0]);
const short = (id: string) => {
  const [set, number] = id.split("-");
  return `${set.toUpperCase()}-${number.replace(/^r/, "R").replace(/^sp/, "SP")}`;
};
function encoded(deck = example(), champion = true) {
  return getCodeFromDeck(
    [
      ...deck.main,
      ...deck.runes,
      { cardId: deck.legendId, count: 1 },
      { cardId: deck.championId, count: 1 },
      ...(deck.battlefieldIds ?? [deck.battlefieldId]).map((cardId) => ({
        cardId,
        count: 1,
      })),
    ].map((e) => ({ cardCode: short(e.cardId), count: e.count })),
    (deck.sideboard ?? []).map((e) => ({
      cardCode: short(e.cardId),
      count: e.count,
    })),
    champion ? short(deck.championId) : undefined,
  );
}
describe("website deck exchange", () => {
  it.each(starterDecks)(
    "imports $name from an actual Piltover codec packet",
    (d) => {
      const result = importDeckSource(encoded(d), { name: "My website deck" });
      expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
      expect(result.deck?.name).toBe("My website deck");
      expect(result.deck?.championId).toBe(d.championId);
      expect(result.deck?.main.reduce((n, c) => n + c.count, 0)).toBe(39);
      expect(result.playable).toBe(true);
      expect(result.sourceFormat).toBe("piltover-code");
    },
  );
  it("asks for the chosen champion for legacy/sectionless exports and deducts it exactly once", () => {
    const d = example(),
      code = encoded(d, false);
    const pending = importDeckSource(code);
    expect(pending.deck).toBeNull();
    expect(pending.championCandidates.map((c) => c.id)).toContain(d.championId);
    const result = importDeckSource(code, { championId: d.championId });
    expect(result.deck?.main).toHaveLength(d.main.length);
    expect(result.deck?.main.reduce((n, c) => n + c.count, 0)).toBe(39);
  });
  it("decodes whitespace, lower case and an explicit code prefix", () => {
    expect(
      importDeckSource(
        `Deck code: ${encoded()
          .toLowerCase()
          .match(/.{1,20}/g)!
          .join("\n")}`,
      ).playable,
    ).toBe(true);
  });
  it.each([40, 41])(
    "imports a larger %i-card draw deck from codec and legacy packets without losing an extra champion",
    (count) => {
      const d = example();
      d.main.push({ cardId: d.championId, count: count - 39 });
      for (const includeChoice of [true, false]) {
        const result = importDeckSource(encoded(d, includeChoice), {
          championId: d.championId,
        });
        expect(
          result.issues.filter((item) => item.severity === "error"),
        ).toEqual([]);
        expect(result.deck?.main).toEqual(d.main);
        expect(result.deck?.main.reduce((n, entry) => n + entry.count, 0)).toBe(
          count,
        );
        expect(importDeckSource(exportDeckText(result.deck!)).deck).toEqual(
          result.deck,
        );
      }
    },
  );
  it("decodes legal unlimited copies above the old codec quantity bound", () => {
    const d = example();
    d.main = [{ cardId: "ven-097-166", count: MAX_MAIN_DECK_SIZE - 1 }];
    const result = importDeckSource(encoded(d));
    expect(result.issues.filter((item) => item.severity === "error")).toEqual(
      [],
    );
    expect(result.deck?.main).toEqual(d.main);
    d.main[0].count = MAX_MAIN_DECK_SIZE + 1;
    expect(importDeckSource(encoded(d)).issues[0].code).toBe(
      "deck-code-invalid",
    );
  });
  it("preserves sideboard across code, text export, local save and reload", () => {
    const d = example();
    d.sideboard = [{ cardId: "ogn-026-298", count: 1 }];
    const result = importDeckSource(encoded(d));
    expect(result.deck?.sideboard).toEqual(d.sideboard);
    expect(result.playable).toBe(true); // Unsupported reserve cards are not in the duel.
    let value = "";
    const storage = {
      getItem: () => value,
      setItem: (_k: string, v: string) => {
        value = v;
      },
    };
    expect(saveImportedDecks([result.deck!], storage)).toBe(true);
    expect(loadImportedDecks(storage)[0].sideboard).toEqual(d.sideboard);
    expect(exportDeckText(result.deck!)).toContain("Sideboard");
  });
  it("enforces combined copy limits and does not mix reserves into the main deck", () => {
    const d = example();
    d.sideboard = [{ ...d.main[0], count: 1 }];
    expect(importDeckSource(encoded(d)).issues.map((i) => i.code)).toContain(
      "copy-limit",
    );
  });
  it("accepts site text with Rune Pool and collector annotations", () => {
    const text = exportDeckText(example())
      .replace("Runes", "Rune Pool")
      .replace(
        "3 ogn-001-298 # Blazing Scorcher",
        "3x Blazing Scorcher [OGN-001]",
      );
    expect(importDeckSource(text).playable).toBe(true);
    expect(
      importDeckSource(
        text.replace("Blazing Scorcher [OGN-001]", "Wrong Name [OGN-001]"),
      ).deck,
    ).toBeNull();
  });
  it("resolves signed, alternate and rune-prefixed codes without collapsing different faces", () => {
    expect(resolveImportCard("OGN-041a")[0].id).toBe("ogn-041a-298");
    expect(resolveImportCard("OGN-300s")[0].id).toBe("ogn-300*-298");
    expect(resolveImportCard("VEN-R01")[0].type).toBe("Rune");
    const collision = resolveImportCard("VEN-139");
    expect(collision.length).toBeGreaterThan(1);
  });
  it("handles rune codes and high copy-count v5 packets", () => {
    const d = example();
    d.main = [{ cardId: "ven-097-166", count: 39 }];
    d.runes = d.runes.map((e) => ({
      ...e,
      cardId: resolveImportCard(
        cardsById[e.cardId].name === "Fury Rune" ? "VEN-R01" : "VEN-R05",
      )[0].id,
    }));
    const result = importDeckSource(encoded(d));
    expect(result.deck?.main).toEqual(d.main);
    expect(result.deck?.runes.reduce((n, c) => n + c.count, 0)).toBe(12);
  });
  it("rejects additional legends explicitly without silently dropping them", () => {
    const code = getCodeFromDeck(
      [{ cardCode: "OGN-001", count: 1 }],
      [],
      undefined,
      ["OGN-247"],
    );
    expect(importDeckSource(code).issues[0].code).toBe("additional-legends");
  });
  it("reports unsupported links, corrupted codes and excessive input without throwing", () => {
    expect(
      importDeckSource("https://piltoverarchive.com/decks/view/example")
        .issues[0].code,
    ).toBe("website-url");
    for (const code of [
      "A".repeat(32),
      encoded().slice(0, -8),
      encoded() + "AAAAAAAA",
    ])
      expect(importDeckSource(code).issues[0].code).toBe("deck-code-invalid");
    expect(importDeckSource("C".repeat(4097)).issues[0].code).toBe(
      "deck-code-size",
    );
    expect(importDeckSource("C".repeat(100001)).issues[0].code).toBe(
      "text-size",
    );
  });
});
