import { describe, expect, it } from "vitest";
import { decks, MAX_MAIN_DECK_SIZE, starterDecks } from "../src/data/decks";
import { cloneDeckForBuilder } from "../src/game/deck-builder";
import {
  BUILDER_DRAFT_KEY,
  MAX_BUILDER_DRAFT_LENGTH,
  clearBuilderDraft,
  parseBuilderDraft,
  readBuilderDraft,
  writeBuilderDraft,
  type BuilderDraft,
} from "../src/game/builder-draft";

const example = (): BuilderDraft => ({
  version: 1,
  savedAt: "2026-10-07T22:45:00.000Z",
  sourceId: "annie",
  previousId: "imported-example",
  deck: cloneDeckForBuilder(starterDecks[0]),
});
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("unfinished builder draft recovery", () => {
  it("retains exact cards, quantities, identity and format for every source deck", () => {
    for (const source of decks) {
      const original = cloneDeckForBuilder(source);
      const restored = parseBuilderDraft(
        JSON.stringify({ ...example(), deck: original }),
      )!;
      expect(restored, source.id).not.toBeNull();
      expect(restored.deck.main, source.id).toEqual(original.main);
      expect(restored.deck.runes, source.id).toEqual(original.runes);
      expect(restored.deck.sideboard, source.id).toEqual(original.sideboard);
      expect(restored.deck.championId, source.id).toBe(original.championId);
      expect(restored.deck.format, source.id).toBe(original.format);
      expect(restored.previousId).toBe("imported-example");
    }
  });

  it("can recover an unfinished illegal list without making it playable", () => {
    const unfinished = example();
    unfinished.deck.name = "";
    unfinished.deck.main = [{ ...unfinished.deck.main[0], count: 8 }];
    unfinished.deck.runes = [];
    unfinished.deck.battlefieldId = "";
    unfinished.deck.battlefieldIds = [];
    unfinished.deck.championId = "";
    const restored = parseBuilderDraft(JSON.stringify(unfinished));
    expect(restored?.deck.main).toEqual(unfinished.deck.main);
    expect(restored?.deck.name).toBe("");
    expect(restored?.deck.championId).toBe("");
  });

  it("rejects unknown cards, unsafe quantities, overlarge payloads and future versions", () => {
    const bad = example();
    bad.deck.main[0].cardId = "missing-card";
    expect(parseBuilderDraft(JSON.stringify(bad))).toBeNull();
    const excessive = example();
    excessive.deck.main = [
      { ...excessive.deck.main[0], count: MAX_MAIN_DECK_SIZE },
    ];
    expect(parseBuilderDraft(JSON.stringify(excessive))).toBeNull();
    expect(
      parseBuilderDraft(JSON.stringify({ ...example(), version: 2 })),
    ).toBeNull();
    expect(
      parseBuilderDraft(" ".repeat(MAX_BUILDER_DRAFT_LENGTH + 1)),
    ).toBeNull();
    const fractions = example();
    fractions.deck.runes[0].count = 0.5;
    expect(parseBuilderDraft(JSON.stringify(fractions))).toBeNull();
  });

  it("preserves a good backup when quota errors prevent replacing it", () => {
    const storage = memory();
    const written = writeBuilderDraft(example(), storage);
    expect(written.ok).toBe(true);
    const previous = storage.getItem(BUILDER_DRAFT_KEY);
    const failing = {
      ...storage,
      setItem: () => {
        throw new Error("quota");
      },
    };
    const updated = example();
    updated.deck.name = "Later changes";
    expect(writeBuilderDraft(updated, failing)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(storage.getItem(BUILDER_DRAFT_KEY)).toBe(previous);
    expect(readBuilderDraft(storage).status).toBe("ready");
  });

  it("leaves corrupt input untouched until the user explicitly clears it", () => {
    const storage = memory();
    storage.setItem(BUILDER_DRAFT_KEY, "{broken");
    expect(readBuilderDraft(storage)).toEqual({
      status: "invalid",
      raw: "{broken",
    });
    expect(writeBuilderDraft(example(), storage)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(storage.getItem(BUILDER_DRAFT_KEY)).toBe("{broken");
    expect(clearBuilderDraft(storage, "{broken").ok).toBe(true);
    expect(writeBuilderDraft(example(), storage, null).ok).toBe(true);
  });

  it("refuses to replace or clear a backup changed by another tab", () => {
    const storage = memory();
    const first = writeBuilderDraft(example(), storage);
    if (!first.ok) throw new Error("setup");
    const second = example();
    second.deck.name = "Other tab";
    expect(writeBuilderDraft(second, storage, first.raw).ok).toBe(true);
    const current = storage.getItem(BUILDER_DRAFT_KEY);
    expect(writeBuilderDraft(example(), storage, first.raw)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(clearBuilderDraft(storage, first.raw)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(storage.getItem(BUILDER_DRAFT_KEY)).toBe(current);
  });
});
