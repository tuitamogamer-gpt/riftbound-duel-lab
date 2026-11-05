#!/usr/bin/env node
/**
 * Read-only check: is there anything new to import?
 *
 * Compares the live Riftcodex set list and card total, and the Hextech
 * Radiance query, with the saved snapshots. Nothing is written. Use
 * `--full` to download every Hextech page and compare the source digest.
 * `--strict` exits with status 1 when a source differs from the snapshot.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { API_BASE, catalogDigest, downloadPages } from "./catalog-sync.mjs";
import {
  buildHextechExport,
  fetchHextechText,
  parseHextechPage,
} from "./hextech-source.mjs";

const data = new URL("../src/data/", import.meta.url);
const read = async (name) =>
  JSON.parse(await readFile(new URL(name, data), "utf8"));

async function getJson(path) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          "User-Agent": "RiftboundPractice/1.0 (card source check)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status}: ${path}`);
      return await response.json();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw last;
}

/** Pure comparison so the report can be tested without the network. */
export function compareSources({ meta, liveSets, liveCardTotal }) {
  const saved = new Map(meta.sets.map((set) => [set.id, set.providerCount]));
  const changes = [];
  for (const set of liveSets) {
    if (!saved.has(set.set_id))
      changes.push(
        `New Riftcodex set ${set.set_id} (${set.name}): ${set.card_count} printings`,
      );
    else if (saved.get(set.set_id) !== set.card_count)
      changes.push(
        `Riftcodex ${set.set_id} changed: ${saved.get(set.set_id)} → ${set.card_count} printings`,
      );
  }
  const live = new Set(liveSets.map((set) => set.set_id));
  for (const id of saved.keys())
    if (!live.has(id)) changes.push(`Riftcodex no longer lists set ${id}`);
  if (liveCardTotal !== meta.count)
    changes.push(`Riftcodex card total ${meta.count} → ${liveCardTotal}`);
  return changes;
}

export async function checkCardSources({ full = false } = {}) {
  const [meta, referenceMeta] = await Promise.all([
    read("catalog-meta.json"),
    read("reference-catalog-meta.json"),
  ]);
  const liveSets = await downloadPages(getJson, "/sets");
  const liveCardTotal = (await getJson("/cards?size=1&page=1")).total;
  const changes = compareSources({ meta, liveSets, liveCardTotal });

  const query = decodeURIComponent(
    new URL(referenceMeta.sourceUrl).searchParams.get("q"),
  );
  if (full) {
    const source = await buildHextechExport(query);
    if (catalogDigest(source.cards) !== referenceMeta.sourceDataSha256)
      changes.push(
        `Hextech ${query} records changed (${source.count} records); review a new export`,
      );
  } else {
    const { total } = parseHextechPage(
      await fetchHextechText(referenceMeta.sourceUrl),
    );
    if (total !== referenceMeta.sourceRecordCount)
      changes.push(
        `Hextech ${query} total ${referenceMeta.sourceRecordCount} → ${total}`,
      );
  }
  return { changes, liveSets, liveCardTotal };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = new Set(process.argv.slice(2));
  const unknown = [...args].filter((a) => !["--full", "--strict"].includes(a));
  if (unknown.length) {
    process.stderr.write(
      "Usage: node scripts/check-card-sources.mjs [--full] [--strict]\n",
    );
    process.exitCode = 1;
  } else {
    const { changes, liveSets, liveCardTotal } = await checkCardSources({
      full: args.has("--full"),
    });
    process.stdout.write(
      `Riftcodex: ${liveSets.length} sets, ${liveCardTotal} printings.\n`,
    );
    if (!changes.length)
      process.stdout.write("No source changes since the saved snapshots.\n");
    else {
      for (const change of changes) process.stdout.write(`• ${change}\n`);
      process.stdout.write(
        "Run `npm run sync:cards` for Riftcodex changes, or review a Hextech export before `import-reference-cards`.\n",
      );
      if (args.has("--strict")) process.exitCode = 1;
    }
  }
}
