#!/usr/bin/env node
/** Import every printing exposed by Riftcodex, including promos and variants. */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  API_BASE,
  buildCatalogSnapshot,
  downloadPages,
  serializeCatalog,
} from "./catalog-sync.mjs";

const output = fileURLToPath(new URL("../src/data/", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          "User-Agent": "RiftboundPractice/1.0 (card catalogue sync)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new Error(`${response.status} ${response.statusText}: ${path}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < 2) await sleep(1000 * (attempt + 1));
    }
  }
  throw last;
}

export async function syncCards({ allowRemovals = false } = {}) {
  const [banList, previousCards] = await Promise.all([
    readFile(`${output}banned-cards.json`, "utf8").then(JSON.parse),
    readFile(`${output}cards.json`, "utf8")
      .then(JSON.parse)
      .catch((error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      }),
  ]);
  const startedAt = new Date().toISOString();
  const onPage = async ({ path, page, pages }) => {
    process.stdout.write(`Downloaded ${path} page ${page}/${pages}\n`);
    if (page < pages) await sleep(200);
  };
  // No set/new/rarity filters: include the provider's entire catalogue.
  const rawCards = await downloadPages(get, "/cards", { onPage });
  const rawSets = await downloadPages(get, "/sets", { onPage });
  const snapshot = buildCatalogSnapshot(rawCards, rawSets, {
    previousCards,
    banList,
    startedAt,
    fetchedAt: new Date().toISOString(),
    allowRemovals,
  });
  // Fully validate and stage both outputs before replacing either saved file.
  const staged = [
    [`${output}cards.json`, serializeCatalog(snapshot.cards)],
    [`${output}catalog-meta.json`, serializeCatalog(snapshot.meta)],
  ].map(([path, content]) => ({
    path,
    content,
    temp: `${path}.${process.pid}.tmp`,
  }));
  await mkdir(output, { recursive: true });
  try {
    for (const file of staged)
      await writeFile(file.temp, file.content, { flag: "wx" });
    for (const file of staged) await rename(file.temp, file.path);
  } finally {
    for (const file of staged) await rm(file.temp, { force: true });
  }
  process.stdout.write(
    `Saved ${snapshot.meta.count} printings from ${snapshot.meta.sets.length} sets (${snapshot.meta.uniqueNames} non-variant names).\n`,
  );
  return snapshot;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--allow-removals")) {
    process.stderr.write(
      "Usage: node scripts/sync-cards.mjs [--allow-removals]\n",
    );
    process.exitCode = 1;
  } else {
    syncCards({ allowRemovals: args.includes("--allow-removals") }).catch(
      (error) => {
        process.stderr.write(`Card import failed: ${error.message}\n`);
        process.exitCode = 1;
      },
    );
  }
}
