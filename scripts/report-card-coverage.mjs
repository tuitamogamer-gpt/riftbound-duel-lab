#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../docs/card-coverage.json", import.meta.url);
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
  const report = {
    schemaVersion: 1,
    catalogFetchedAt: catalogMeta.fetchedAt,
    provider: catalogMeta.provider,
    providerPrintings: catalogMeta.count,
    registered: entries.length,
    playable: entries.length - statuses.unsupported,
    statuses,
    sets,
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
  console.log(
    `${report.registered} registered (${report.providerPrintings} provider printings); ${report.playable} playable; ${statuses.unsupported} require rules implementation.`,
  );
  console.log(JSON.stringify(sets, null, 2));
} finally {
  await server.close();
}
