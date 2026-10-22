#!/usr/bin/env node
/** Import a reviewed public source export without changing the playable snapshot. */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  buildCatalogSnapshot,
  catalogDigest,
  serializeCatalog,
} from "./catalog-sync.mjs";

export const REFERENCE_SOURCE =
  "https://hextechanalytics.com/cards?q=set%3ARAD";
export const RADIANCE_OVERVIEW =
  "https://playriftbound.com/en-us/news/announcements/the-radiance-overview/";
export const RADIANCE_ERRATA =
  "https://playriftbound.com/en-us/news/announcements/radiance-errata-updates/";

export function buildReferenceSnapshot(
  source,
  { banList, previousCards = [], providerCards = [] },
) {
  if (
    source.sourceUrl !== REFERENCE_SOURCE ||
    source.pageCount !== 10 ||
    source.count !== 219 ||
    source.cards?.length !== source.count
  )
    throw new Error(
      "Expected the complete 219-printing, 10-page Radiance source export.",
    );
  if (
    source.cards.some(
      (card) => card.set?.set_id !== "RAD" || !/^rad-/.test(card.riftbound_id),
    )
  )
    throw new Error("Reference export contains a card outside Radiance.");
  const codes = new Set(source.cards.map((card) => card.riftbound_id));
  for (let number = 1; number <= 167; number++)
    if (!codes.has(`rad-${String(number).padStart(3, "0")}-167`))
      throw new Error(`Missing Radiance base card ${number}.`);
  const raw = source.cards.map((card) => ({
    ...card,
    id: `hextech:${card.id}`,
  }));
  const normalized = buildCatalogSnapshot(
    raw,
    [
      {
        set_id: "RAD",
        name: "Radiance",
        card_count: source.count,
        published_on: "2026-10-23",
      },
    ],
    { banList, previousCards, fetchedAt: source.fetchedAt },
  );
  const providerIds = new Set(providerCards.map((card) => card.id));
  const cards = normalized.cards.map((card) => {
    if (providerIds.has(card.id))
      throw new Error(`Reference/provider ID collision: ${card.id}`);
    return {
      ...card,
      variant: card.variant || /^rad-sp\d+-/.test(card.riftboundId),
      referenceOnly: true,
      sourceUrl: `https://hextechanalytics.com/cards/${card.riftboundId}`,
    };
  });
  return {
    cards,
    meta: {
      schemaVersion: 1,
      provider: "Hextech Analytics",
      sourceUrl: source.sourceUrl,
      fetchedAt: source.fetchedAt,
      sourceUpdatedAt: null,
      sourcePageCount: source.pageCount,
      sourceRecordCount: source.count,
      sourceDataSha256: catalogDigest(source.cards),
      count: cards.length,
      cardDataSha256: catalogDigest(cards),
      scope:
        "All 219 Radiance records returned by the public Hextech Analytics set:RAD library on 22 October 2026. Includes all numbered base cards 001–167, 40 additional numbered/alternate/showcase printings and 12 rune printings. Completeness is relative to this community source; tokens and any other promotional printings are not claimed complete.",
      referenceOnly: true,
      playableCount: 0,
      reason:
        "Radiance mechanics and individual card behavior require reviewed engine implementations and tests. Even reprints and runes remain blocked until reviewed.",
      sets: [
        {
          id: "RAD",
          name: "Radiance",
          releasedAt: "2026-10-23",
          preRiftStartedAt: "2026-10-16",
          baseCardCount: 167,
          count: cards.length,
        },
      ],
      officialSources: [RADIANCE_OVERVIEW, RADIANCE_ERRATA],
      verifiedErrataCardIds: [
        "rad-010-167",
        "rad-081-167",
        "rad-154-167",
        "rad-167-167",
      ],
      attribution:
        "Unofficial fan project. Structured records are from Hextech Analytics, not Riftcodex or an official Riot API. Card names, rules text, and Riot CDN artwork are property of Riot Games, Inc.",
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 3)
    throw new Error(
      "Usage: node scripts/import-reference-cards.mjs <reviewed-source-export.json>",
    );
  const directory = new URL("../src/data/", import.meta.url);
  const read = async (name) =>
    JSON.parse(await readFile(new URL(name, directory), "utf8"));
  const previousCards = await read("reference-cards.json").catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const source = JSON.parse(await readFile(process.argv[2], "utf8"));
  const snapshot = buildReferenceSnapshot(source, {
    previousCards,
    providerCards: await read("cards.json"),
    banList: await read("banned-cards.json"),
  });
  await writeFile(
    new URL("reference-cards.json", directory),
    serializeCatalog(snapshot.cards),
  );
  await writeFile(
    new URL("reference-catalog-meta.json", directory),
    serializeCatalog(snapshot.meta),
  );
  console.log(
    `Imported ${snapshot.cards.length} reference-only Radiance printings; playable provider snapshot unchanged.`,
  );
}
