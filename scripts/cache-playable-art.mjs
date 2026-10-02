#!/usr/bin/env node
/** Cache only official public art observed in the checked-in card catalog.
 * Run: node scripts/cache-playable-art.mjs [--refresh]
 * Uses esbuild supplied with Vite and a local ffmpeg executable (FFMPEG_PATH override).
 * Native card dimensions are retained up to 744 px wide; metadata records provenance.
 */
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  rename,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "public/cards");
const manifestPath = join(root, "src/data/card-art-manifest.json");
const refresh = process.argv.includes("--refresh");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const quality = 86;
const maxWidth = 744;
const concurrency = 4;
const catalog = JSON.parse(
  await readFile(join(root, "src/data/cards.json"), "utf8"),
);
const catalogById = new Map(catalog.map((card) => [card.id, card]));
const bundled = await build({
  entryPoints: [join(root, "src/data/decks.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const deckModule = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
// The engine creates this exact official Recruit token when an effect requests one.
const cardIds = [
  ...new Set([
    ...deckModule.practiceCardIds,
    "ogn-271-298",
    "ogn-274-298",
    "sfd-t03",
  ]),
].sort();
let previous = { cards: {} };
try {
  previous = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  /* First run. */
}
await mkdir(outputDir, { recursive: true });
const temporaryDir = await mkdtemp(join(tmpdir(), "riftbound-art-"));
const entries = {};
const errors = [];
let cursor = 0;
let completed = 0;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

async function fetchImage(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.headers.get("content-type")?.startsWith("image/"))
        throw new Error("Response is not an image");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 20 * 1024 * 1024)
        throw new Error("Unexpected image size");
      return buffer;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}
async function cacheCard(id) {
  const card = catalogById.get(id);
  if (!card) throw new Error(`Card ${id} is missing from the catalog`);
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Unsafe output id ${id}`);
  const sourceUrl = card.image;
  const source = new URL(sourceUrl);
  if (source.protocol !== "https:" || source.hostname !== "cmsassets.rgpub.io")
    throw new Error(`Unexpected public art source for ${id}`);
  const path = `/cards/${id}.webp`;
  const destination = join(outputDir, `${id}.webp`);
  const cached = previous.cards?.[id];
  if (
    !refresh &&
    cached?.sourceUrl === sourceUrl &&
    cached?.quality === quality &&
    cached?.maxWidth === maxWidth
  ) {
    try {
      const bytes = await readFile(destination);
      if (sha256(bytes) === cached.sha256) {
        entries[id] = cached;
        return;
      }
    } catch {
      /* Regenerate a missing or modified artifact. */
    }
  }
  const original = await fetchImage(sourceUrl);
  const input = join(temporaryDir, `${id}.png`);
  const output = join(temporaryDir, `${id}.webp`);
  await writeFile(input, original);
  await run(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-vf",
      `scale=w=min(${maxWidth}\\,iw):h=-1`,
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      String(quality),
      "-compression_level",
      "6",
      "-preset",
      "picture",
      output,
    ],
    { timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  const { stdout } = await run(
    ffprobe,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      output,
    ],
    { timeout: 10000 },
  );
  const { width, height } = JSON.parse(stdout).streams[0];
  const converted = await readFile(output);
  entries[id] = {
    path,
    name: card.name,
    sourceUrl,
    sourceSha256: sha256(original),
    sourceBytes: original.length,
    sha256: sha256(converted),
    bytes: converted.length,
    width,
    height,
    quality,
    maxWidth,
  };
  await rename(output, destination);
}
async function worker() {
  while (cursor < cardIds.length) {
    const id = cardIds[cursor++];
    try {
      await cacheCard(id);
    } catch (error) {
      errors.push(`${id}: ${error.message}`);
    }
    completed++;
    if (completed % 10 === 0 || completed === cardIds.length)
      console.log(`Cached ${completed}/${cardIds.length} card images`);
  }
}
try {
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (errors.length) throw new Error(errors.join("\n"));
  const ordered = Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((id) => [id, entries[id]]),
  );
  const bytes = Object.values(ordered).reduce((sum, e) => sum + e.bytes, 0);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source:
      "Official Riot public card art URLs in src/data/cards.json; catalog obtained through Riftcodex.",
    cardCount: cardIds.length,
    bytes,
    cards: ordered,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Done: ${cardIds.length} local WebP images, ${(bytes / 1024 / 1024).toFixed(2)} MiB; manifest ${manifestPath}`,
  );
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
