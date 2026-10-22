#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { catalogDigest } from "./catalog-sync.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../docs/card-coverage.json", import.meta.url);
const summaryFiles = [
  new URL("../README.md", import.meta.url),
  new URL("../docs/CARD-COVERAGE.md", import.meta.url),
];
const summaryStart = "<!-- card-catalog-summary:start -->";
const summaryEnd = "<!-- card-catalog-summary:end -->";
const count = (value) => value.toLocaleString("en-US");
const date = (value) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const {
    cards,
    catalogMeta,
    providerCards,
    referenceCards,
    referenceCatalogMeta,
  } = await server.ssrLoadModule("/src/data/cards.ts");
  const { cardRegistry } = await server.ssrLoadModule("/src/game/scripts.ts");
  const { officialPreconDecks, referencePreconDecks, validateDeck } =
    await server.ssrLoadModule("/src/data/decks.ts");
  if (
    providerCards.length !== catalogMeta.count ||
    catalogDigest(providerCards) !== catalogMeta.cardDataSha256
  )
    throw new Error(
      "Saved catalog count or SHA-256 differs from its metadata.",
    );
  if (
    referenceCards.length !== referenceCatalogMeta.count ||
    catalogDigest(referenceCards) !== referenceCatalogMeta.cardDataSha256 ||
    referenceCards.some((card) => !card.referenceOnly || !card.sourceUrl)
  )
    throw new Error(
      "Reference catalog count, provenance or SHA-256 differs from its metadata.",
    );
  if (new Set(cards.map((card) => card.id)).size !== cards.length)
    throw new Error("Duplicate catalog card ID.");
  const statuses = { scripted: 0, compiled: 0, alias: 0, unsupported: 0 };
  const sets = {};
  const entries = cards
    .map((card) => {
      const entry = cardRegistry[card.id];
      if (!entry) throw new Error(`Unregistered card: ${card.id}`);
      if (card.referenceOnly && entry.script)
        throw new Error(
          `Unreviewed reference card became playable: ${card.id}`,
        );
      statuses[entry.status]++;
      sets[card.set] ??= { total: 0, playable: 0, unsupported: 0 };
      sets[card.set].total++;
      sets[card.set][entry.script ? "playable" : "unsupported"]++;
      return { name: card.name, set: card.set, type: card.type, ...entry };
    })
    .sort((a, b) => a.cardId.localeCompare(b.cardId));
  for (const set of catalogMeta.sets) {
    if (sets[set.id]?.total !== set.count || set.count !== set.providerCount)
      throw new Error(`Saved catalog count differs for set ${set.id}.`);
  }
  if (
    new Set(providerCards.map((card) => card.set)).size !==
    catalogMeta.sets.length
  )
    throw new Error("Saved catalog sets differ from its metadata.");
  const preconCoverage = (deck) => {
    const errors = validateDeck(deck);
    if (errors.length)
      throw new Error(
        `Invalid bundled precon ${deck.id}: ${errors.join(", ")}`,
      );
    const cardIds = [
      ...new Set([
        deck.legendId,
        deck.championId,
        ...(deck.battlefieldIds ?? [deck.battlefieldId]),
        ...deck.main.map((card) => card.cardId),
        ...deck.runes.map((card) => card.cardId),
      ]),
    ];
    const missingCardIds = cardIds.filter((id) => !cardRegistry[id]?.script);
    return {
      id: deck.id,
      name: deck.name,
      product: deck.product,
      uniqueCards: cardIds.length,
      executableCards: cardIds.length - missingCardIds.length,
      complete: missingCardIds.length === 0,
      missingCardIds,
    };
  };
  const precons = officialPreconDecks.map(preconCoverage);
  const referencePrecons = referencePreconDecks.map(preconCoverage);
  if (referencePrecons.some((deck) => deck.complete))
    throw new Error(
      "Reference precon is executable; review its placement in the playable catalog.",
    );
  const report = {
    schemaVersion: 2,
    catalogFetchedAt: catalogMeta.fetchedAt,
    provider: catalogMeta.provider,
    catalogScope: catalogMeta.scope,
    catalogSourceUpdatedAt: catalogMeta.sourceUpdatedAt,
    catalogDataSha256: catalogMeta.cardDataSha256,
    providerPrintings: catalogMeta.count,
    providerSets: catalogMeta.sets.length,
    localRulesTokens: cards.filter((card) => card.set === "TOKEN").length,
    referencePrintings: referenceCards.length,
    referenceCatalog: referenceCatalogMeta,
    registered: entries.length,
    playable: entries.length - statuses.unsupported,
    statuses,
    sets,
    precons,
    referencePrecons,
    entries,
  };
  const content = JSON.stringify(report, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if ((await readFile(output, "utf8")) !== content)
      throw new Error(
        "Card coverage snapshot is stale. Run npm run cards:report.",
      );
  } else {
    await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
    await writeFile(output, content);
  }
  const completePrecons = precons.filter((deck) => deck.complete).length;
  const summary = [
    summaryStart,
    "",
    `Saved catalog fetched **${date(report.catalogFetchedAt)}**: **${count(report.providerPrintings)} provider printings** in **${report.providerSets} sets**, plus **${report.localRulesTokens} local rules tokens**. Completeness is relative to ${report.provider}; its latest reported record update is **${date(report.catalogSourceUpdatedAt)}**.`,
    "",
    `Supplemental reference catalog fetched **${date(referenceCatalogMeta.fetchedAt)}**: **${count(report.referencePrintings)} Radiance printings** from **${referenceCatalogMeta.provider}**, including all **167 numbered base cards**. These entries are available for browsing and are blocked from play pending reviewed rules implementations. Source coverage does not claim every token or promotion.`,
    "",
    `Executable registration: **${count(report.playable)} / ${count(report.registered)} entries**, with **${count(statuses.unsupported)} unsupported** (${count(statuses.scripted)} scripted, ${count(statuses.compiled)} compiled, ${count(statuses.alias)} aliases). Counts include printings and tokens, rather than only distinct card designs.`,
    "",
    `Retail precons: **${completePrecons} / ${precons.length}** have complete executable coverage. All ${precons.length} lists have valid structure and complete catalog references. Historical retail contents and current tournament legality remain separate.`,
    "",
    `Additional official lists: **${referencePrecons.length} Radiance Showdown precons** (Seraphine and Evelynn) have valid structure and complete catalog references. They are visible as reference lists and excluded from playable presets and bot matrices.`,
    summaryEnd,
  ].join("\n");
  for (const file of summaryFiles) {
    const saved = await readFile(file, "utf8");
    const start = saved.indexOf(summaryStart);
    const end = saved.indexOf(summaryEnd, start);
    if (start < 0 || end < 0)
      throw new Error(
        `Missing generated catalog summary markers: ${fileURLToPath(file)}`,
      );
    const updated =
      saved.slice(0, start) + summary + saved.slice(end + summaryEnd.length);
    if (process.argv.includes("--check")) {
      if (saved !== updated)
        throw new Error(
          `Catalog summary is stale: ${fileURLToPath(file)}. Run npm run cards:report.`,
        );
    } else if (saved !== updated) {
      await writeFile(file, updated);
    }
  }
  console.log(
    `${report.registered} registered (${report.providerPrintings} provider + ${report.referencePrintings} reference printings + ${report.localRulesTokens} tokens); ${report.playable} playable; ${statuses.unsupported} require rules implementation.`,
  );
  console.log(JSON.stringify(sets, null, 2));
  console.log(
    `${completePrecons}/${precons.length} retail precons have complete executable coverage.`,
  );
} finally {
  await server.close();
}
