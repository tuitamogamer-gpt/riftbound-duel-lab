import { describe, expect, it, vi } from "vitest";
import {
  buildCatalogSnapshot,
  catalogDigest,
  downloadPages,
} from "../scripts/catalog-sync.mjs";
import savedCards from "../src/data/cards.json";
import savedMeta from "../src/data/catalog-meta.json";

const fetchedAt = "2026-10-02T10:00:00.000Z";
const banList = {
  names: ["Banned Card"],
  effectiveAt: "2026-09-18",
  source: "https://playriftbound.com/en-us/rules-hub/",
};
const options = { banList, fetchedAt };
function rawCard(id = "provider-a", code = "ogn-001-298") {
  return {
    id,
    riftbound_id: code,
    name: "Test Unit",
    collector_number: 1,
    attributes: {
      energy: 2 as number | null,
      power: 1 as number | null,
      might: 3 as number | null,
    },
    classification: {
      type: "Unit",
      supertype: null,
      rarity: "Common",
      domain: ["Fury"],
    },
    text: { plain: "[Assault] [Assault] Draw 1." as string | null },
    set: { set_id: "OGN", label: "Origins" },
    media: { image_url: "https://example.com/card.png", artist: "Artist" },
    tags: ["Noxus"],
    metadata: {
      alternate_art: false,
      signature: false,
      overnumbered: false,
      updated_on: "2026-09-01T00:00:00Z",
    },
  };
}
function rawSet(count = 1) {
  return {
    id: "set-ogn",
    set_id: "OGN",
    name: "Origins",
    card_count: count,
    published_on: "2025-10-31T00:00:00",
  };
}
function envelope(page: number, items: { id: string }[], total = 3, size = 2) {
  return { page, items, total, size, pages: Math.ceil(total / size) };
}

describe("complete paginated imports", () => {
  it.each(["/cards", "/sets"])(
    "downloads every %s page without excluding variants or new sets",
    async (path) => {
      const get = vi
        .fn()
        .mockResolvedValueOnce(envelope(1, [{ id: "a" }, { id: "b" }]))
        .mockResolvedValueOnce(envelope(2, [{ id: "c" }]));
      const progress = vi.fn();
      expect(
        await downloadPages(get, path, { pageSize: 2, onPage: progress }),
      ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
      expect(get.mock.calls).toEqual([
        [`${path}?size=2&page=1`],
        [`${path}?size=2&page=2`],
      ]);
      expect(progress).toHaveBeenLastCalledWith({ path, page: 2, pages: 2 });
    },
  );

  it.each([
    [
      "a changing total",
      { ...envelope(2, [{ id: "c" }, { id: "d" }], 4) },
      /changed while downloading/,
    ],
    [
      "the wrong page",
      { ...envelope(2, [{ id: "c" }]), page: 1 },
      /Wrong pagination/,
    ],
    [
      "the wrong size",
      { ...envelope(2, [{ id: "c" }]), size: 1 },
      /Wrong pagination/,
    ],
    ["a missing final item", envelope(2, []), /Incomplete/],
    [
      "an incorrect page count",
      { ...envelope(2, [{ id: "c" }]), pages: 3 },
      /Invalid page count/,
    ],
    [
      "missing items",
      { ...envelope(2, [{ id: "c" }]), items: null },
      /Missing items/,
    ],
    ["a repeated provider ID", envelope(2, [{ id: "a" }]), /Duplicate/],
  ])(
    "rejects %s instead of returning a partial snapshot",
    async (_label, lastPage, error) => {
      const get = vi
        .fn()
        .mockResolvedValueOnce(envelope(1, [{ id: "a" }, { id: "b" }]))
        .mockResolvedValueOnce(lastPage);
      await expect(
        downloadPages(get, "/cards", { pageSize: 2 }),
      ).rejects.toThrow(error);
    },
  );

  it("propagates transport failure instead of silently skipping a page", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(envelope(1, [{ id: "a" }, { id: "b" }]))
      .mockRejectedValueOnce(new Error("offline"));
    await expect(downloadPages(get, "/cards", { pageSize: 2 })).rejects.toThrow(
      "offline",
    );
  });
});

describe("stable printing identity", () => {
  it("keeps a saved ID when a second printing with the same Riftbound code arrives", () => {
    const original = rawCard();
    const previous = buildCatalogSnapshot(
      [original],
      [rawSet()],
      options,
    ).cards;
    const alternate = rawCard("provider-b");
    alternate.name = "Test Unit (Alternate Art)";
    alternate.metadata.alternate_art = true;
    const { cards } = buildCatalogSnapshot([alternate, original], [rawSet(2)], {
      ...options,
      previousCards: previous,
    });
    expect(cards.find((card) => card.providerId === original.id)?.id).toBe(
      previous[0].id,
    );
    expect(cards.find((card) => card.providerId === alternate.id)?.id).toBe(
      `${alternate.riftbound_id}--${alternate.id}`,
    );
  });

  it("is deterministic when provider result ordering changes", () => {
    const raw = [
      rawCard(),
      rawCard("provider-b"),
      rawCard("provider-c", "ogn-002-298"),
    ];
    const first = buildCatalogSnapshot(raw, [rawSet(3)], options);
    const second = buildCatalogSnapshot(
      [...raw].reverse(),
      [rawSet(3)],
      options,
    );
    expect(first).toEqual(second);
    expect(new Set(first.cards.map((card) => card.id)).size).toBe(3);
  });

  it("keeps a previous suffixed ID when a duplicate disappears after explicit review", () => {
    const original = rawCard();
    const alternate = rawCard("provider-b");
    alternate.name = "Test Unit (Metal)";
    const previous = buildCatalogSnapshot(
      [original, alternate],
      [rawSet(2)],
      options,
    ).cards;
    expect(() =>
      buildCatalogSnapshot([original], [rawSet()], {
        ...options,
        previousCards: previous,
      }),
    ).toThrow(/disappeared/);
    const next = buildCatalogSnapshot([original], [rawSet()], {
      ...options,
      previousCards: previous,
      allowRemovals: true,
    });
    expect(next.cards[0].id).toBe(
      previous.find((card) => card.providerId === original.id)?.id,
    );
    expect(next.meta.removedIds).toEqual([
      previous.find((card) => card.providerId === alternate.id)?.id,
    ]);
  });

  it("preserves the local ID when a unique printing gets a replacement provider UUID", () => {
    const original = rawCard();
    const previous = buildCatalogSnapshot(
      [original],
      [rawSet()],
      options,
    ).cards;
    const replaced = { ...original, id: "new-provider-uuid" };
    const next = buildCatalogSnapshot([replaced], [rawSet()], {
      ...options,
      previousCards: previous,
    });
    expect(next.cards[0].id).toBe(previous[0].id);
    expect(next.cards[0].providerId).toBe("new-provider-uuid");
    expect(next.meta.removedIds).toEqual([]);
  });

  it("fails rather than guessing when replacement provider IDs are ambiguous", () => {
    const previous = buildCatalogSnapshot(
      [rawCard(), rawCard("provider-b")],
      [rawSet(2)],
      options,
    ).cards;
    expect(() =>
      buildCatalogSnapshot(
        [rawCard("provider-c"), rawCard("provider-d")],
        [rawSet(2)],
        { ...options, previousCards: previous },
      ),
    ).toThrow(/disappeared/);
  });

  it("rejects a provider UUID reused for a different card", () => {
    const previous = buildCatalogSnapshot(
      [rawCard()],
      [rawSet()],
      options,
    ).cards;
    expect(() =>
      buildCatalogSnapshot([rawCard("provider-a", "ogn-099-298")], [rawSet()], {
        ...options,
        previousCards: previous,
      }),
    ).toThrow(/changed Riftbound identity/);
  });
});

describe("catalogue data and provenance", () => {
  it("preserves rules, stats, artwork, tags and variants and applies bans across printings", () => {
    const original = rawCard();
    original.name = "Banned Card (Signature)";
    original.metadata.signature = true;
    const next = buildCatalogSnapshot([original], [rawSet()], options);
    expect(next.cards[0]).toMatchObject({
      riftboundId: original.riftbound_id,
      providerId: original.id,
      name: original.name,
      text: original.text.plain,
      energy: 2,
      power: 1,
      might: 3,
      image: original.media.image_url,
      tags: ["Noxus"],
      keywords: ["Assault"],
      variant: true,
      bannedInDuel: true,
    });
    expect(next.meta).toMatchObject({
      count: 1,
      variantCount: 1,
      fetchedAt,
      sourceUpdatedAt: original.metadata.updated_on,
      removedIds: [],
    });
    expect(next.meta.cardDataSha256).toBe(catalogDigest(next.cards));
    expect(next.meta.sets[0]).toMatchObject({
      id: "OGN",
      count: 1,
      providerCount: 1,
    });
  });

  it("accepts zero costs, nullable stats and cards without rules text", () => {
    const raw = rawCard();
    raw.attributes = { energy: 0, power: 0, might: null };
    raw.text.plain = null;
    expect(
      buildCatalogSnapshot([raw], [rawSet()], options).cards[0],
    ).toMatchObject({ energy: 0, power: 0, might: null, text: "" });
  });

  it("rejects duplicate provider IDs and empty catalogues", () => {
    expect(() =>
      buildCatalogSnapshot([rawCard(), rawCard()], [rawSet(2)], options),
    ).toThrow(/Duplicate provider IDs/);
    expect(() => buildCatalogSnapshot([], [rawSet(0)], options)).toThrow(
      /empty card catalogue/,
    );
    expect(() => buildCatalogSnapshot([rawCard()], [], options)).toThrow(
      /empty set catalogue/,
    );
  });

  it.each([
    [
      "type",
      (raw: ReturnType<typeof rawCard>) => {
        raw.classification.type = "Unknown";
      },
      /Unsupported card type/,
    ],
    [
      "domain",
      (raw: ReturnType<typeof rawCard>) => {
        raw.classification.domain = ["Unknown"];
      },
      /Unsupported domain/,
    ],
    [
      "cost",
      (raw: ReturnType<typeof rawCard>) => {
        raw.attributes.energy = -1;
      },
      /Invalid.*energy/,
    ],
    [
      "date",
      (raw: ReturnType<typeof rawCard>) => {
        raw.metadata.updated_on = "not a date";
      },
      /Invalid.*updated_on/,
    ],
    [
      "name",
      (raw: ReturnType<typeof rawCard>) => {
        raw.name = "";
      },
      /Invalid.*name/,
    ],
  ])(
    "rejects malformed %s before writing a catalogue",
    (_label, mutate, error) => {
      const raw = rawCard();
      mutate(raw);
      expect(() => buildCatalogSnapshot([raw], [rawSet()], options)).toThrow(
        error,
      );
    },
  );

  it("cross-checks set membership and the provider count for each set", () => {
    expect(() =>
      buildCatalogSnapshot([rawCard()], [rawSet(2)], options),
    ).toThrow(/Incomplete set OGN/);
    const card = rawCard();
    card.set.set_id = "UNKNOWN";
    expect(() => buildCatalogSnapshot([card], [rawSet(0)], options)).toThrow(
      /unknown set/,
    );
    expect(() =>
      buildCatalogSnapshot([rawCard()], [rawSet(), rawSet()], options),
    ).toThrow(/Duplicate set IDs/);
  });

  it("keeps the committed offline catalogue complete and matched to its metadata", () => {
    expect(savedCards.length).toBe(savedMeta.count);
    expect(new Set(savedCards.map((card) => card.id)).size).toBe(
      savedCards.length,
    );
    expect(new Set(savedCards.map((card) => card.providerId)).size).toBe(
      savedCards.length,
    );
    expect(catalogDigest(savedCards)).toBe(savedMeta.cardDataSha256);
    expect(savedCards.filter((card) => card.variant)).toHaveLength(
      savedMeta.variantCount,
    );
    expect(
      new Set(
        savedCards.filter((card) => !card.variant).map((card) => card.name),
      ).size,
    ).toBe(savedMeta.uniqueNames);
    expect(savedMeta.sets.reduce((count, set) => count + set.count, 0)).toBe(
      savedCards.length,
    );
    for (const set of savedMeta.sets) {
      expect(savedCards.filter((card) => card.set === set.id)).toHaveLength(
        set.count,
      );
      expect(set.count).toBe(set.providerCount);
    }
  });
});
