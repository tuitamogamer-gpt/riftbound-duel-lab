import { describe, expect, it } from "vitest";
import audit from "../src/data/card-art-manifest.json";
import runtime from "../src/data/card-art-paths.json";
import {
  cardArtUrl,
  hasLocalCardArt,
  localCardArtBytes,
  localCardArtCount,
} from "../src/data/art";

describe("compact card art index", () => {
  it("preserves every audited path and total without shipping provenance", () => {
    expect(runtime).toEqual({
      cardCount: audit.cardCount,
      bytes: audit.bytes,
      cards: Object.fromEntries(
        Object.entries(audit.cards).map(([id, card]) => [id, card.path]),
      ),
    });
    expect(localCardArtCount).toBe(Object.keys(audit.cards).length);
    expect(localCardArtBytes).toBe(audit.bytes);
    for (const [id, card] of Object.entries(audit.cards)) {
      expect(hasLocalCardArt(id)).toBe(true);
      expect(cardArtUrl({ id, image: card.sourceUrl })).toBe(card.path);
    }
  });
  it("retains remote art for uncached printings", () => {
    const card = {
      id: "uncached-printing",
      image: "https://example.com/card.png",
    };
    expect(hasLocalCardArt(card.id)).toBe(false);
    expect(cardArtUrl(card)).toBe(card.image);
  });
});
