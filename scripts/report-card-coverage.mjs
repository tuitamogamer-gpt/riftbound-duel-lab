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
  const { cards, catalogMeta } =
    await server.ssrLoadModule("/src/data/cards.ts");
  const { cardRegistry } = await server.ssrLoadModule("/src/game/scripts.ts");
  const { officialPreconDecks, validateDeck } =
    await server.ssrLoadModule("/src/data/decks.ts");
  const providerCards = cards.filter((card) => card.set !== "TOKEN");
  if (
    providerCards.length !== catalogMeta.count ||
    catalogDigest(providerCards) !== catalogMeta.cardDataSha256
  )
    throw new Error(
      "Saved catalog count or SHA-256 differs from its metadata.",
    );
  if (new Set(cards.map((card) => card.id)).size !== cards.length)
    throw new Error("Duplicate catalog card ID.");
  const statuses = { scripted: 0, compiled: 0, alias: 0, unsupported: 0 };
  const sets = {};
  const entries = cards
    .map((card) => {
      const entry = cardRegistry[card.id];
      if (!entry) throw new Error(`Unregistered card: ${card.id}`);
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
    Object.keys(sets).filter((set) => set !== "TOKEN").length !==
    catalogMeta.sets.length
  )
    throw new Error("Saved catalog sets differ from its metadata.");
  const precons = officialPreconDecks.map((deck) => {
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
  });
  const report = {
    schemaVersion: 1,
    catalogFetchedAt: catalogMeta.fetchedAt,
    provider: catalogMeta.provider,
    catalogScope: catalogMeta.scope,
    catalogSourceUpdatedAt: catalogMeta.sourceUpdatedAt,
    catalogDataSha256: catalogMeta.cardDataSha256,
    providerPrintings: catalogMeta.count,
    providerSets: catalogMeta.sets.length,
    localRulesTokens: cards.length - providerCards.length,
    registered: entries.length,
    playable: entries.length - statuses.unsupported,
    statuses,
    sets,
    precons,
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
    `Executable registration: **${count(report.playable)} / ${count(report.registered)} entries**, with **${count(statuses.unsupported)} unsupported** (${count(statuses.scripted)} scripted, ${count(statuses.compiled)} compiled, ${count(statuses.alias)} aliases). Counts include printings and tokens, rather than only distinct card designs.`,
    "",
    `Retail precons: **${completePrecons} / ${precons.length}** have complete executable coverage. All ${precons.length} lists have valid structure and complete catalog references. Historical retail contents and current tournament legality remain separate.`,
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
    `${report.registered} registered (${report.providerPrintings} provider printings); ${report.playable} playable; ${statuses.unsupported} require rules implementation.`,
  );
  console.log(JSON.stringify(sets, null, 2));
  console.log(
    `${completePrecons}/${precons.length} retail precons have complete executable coverage.`,
  );
} finally {
  await server.close();
}
