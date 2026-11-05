import { describe, expect, it } from "vitest";
import {
  buildHextechExport,
  hextechUrl,
  parseHextechPage,
} from "../scripts/hextech-source.mjs";
import { compareSources } from "../scripts/check-card-sources.mjs";
import catalogMeta from "../src/data/catalog-meta.json";
import referenceMeta from "../src/data/reference-catalog-meta.json";

const REFERENCE_SOURCE = referenceMeta.sourceUrl;

/** A page shaped like the Next.js flight payload, with a script-like decoy. */
function page(cards: object[], total: number) {
  const payload = `2:["$","div",null,{"cards":${JSON.stringify(cards)},"other":"]}"}]`;
  return [
    `<p>${total} cards</p>`,
    `<script>self.__next_f.push([1,${JSON.stringify('1:I["x"]\n')}])</script>`,
    `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`,
    `<script>alert("never executed")</script>`,
  ].join("");
}
const card = (n: number) => ({
  id: `id-${n}`,
  riftbound_id: `rad-${String(n).padStart(3, "0")}-167`,
  name: `Card ${n} "quoted" [brackets]`,
});

describe("card source checks", () => {
  it("builds the same source URL the reviewed importer accepts", () => {
    expect(hextechUrl("set:RAD")).toBe(REFERENCE_SOURCE);
    expect(hextechUrl("set:RAD", 3)).toBe(`${REFERENCE_SOURCE}&page=3`);
  });

  it("reads card JSON from flight payloads, including brackets inside strings", () => {
    const parsed = parseHextechPage(page([card(1), card(2)], 3));
    expect(parsed.total).toBe(3);
    expect(parsed.cards.map((c) => c.id)).toEqual(["id-1", "id-2"]);
    expect(() => parseHextechPage("<p>3 cards</p>")).toThrow("No card");
  });

  it("downloads every advertised page and rejects incomplete exports", async () => {
    const pages: Record<string, string> = {
      [hextechUrl("set:RAD")]: page([card(1), card(2)], 3),
      [hextechUrl("set:RAD", 2)]: page([card(3)], 3),
    };
    const result = await buildHextechExport("set:RAD", {
      fetchText: async (url: string) => pages[url],
    });
    expect(result).toMatchObject({
      sourceUrl: REFERENCE_SOURCE,
      pageCount: 2,
      count: 3,
    });
    pages[hextechUrl("set:RAD", 2)] = page([card(2)], 3);
    await expect(
      buildHextechExport("set:RAD", {
        fetchText: async (url: string) => pages[url],
      }),
    ).rejects.toThrow("Duplicate");
  });

  it("reports new, changed and missing Riftcodex sets", () => {
    const liveSets = catalogMeta.sets.map((set) => ({
      set_id: set.id,
      name: set.name,
      card_count: set.providerCount,
    }));
    expect(
      compareSources({
        meta: catalogMeta,
        liveSets,
        liveCardTotal: catalogMeta.count,
      }),
    ).toEqual([]);
    const changed = [
      ...liveSets.filter((set) => set.set_id !== "JDG"),
      { set_id: "RAD", name: "Radiance", card_count: 219 },
    ].map((set) =>
      set.set_id === "OGN" ? { ...set, card_count: set.card_count + 1 } : set,
    );
    expect(
      compareSources({
        meta: catalogMeta,
        liveSets: changed,
        liveCardTotal: catalogMeta.count + 217,
      }),
    ).toEqual([
      "Riftcodex OGN changed: 352 → 353 printings",
      "New Riftcodex set RAD (Radiance): 219 printings",
      "Riftcodex no longer lists set JDG",
      "Riftcodex card total 1451 → 1668",
    ]);
  });
});
