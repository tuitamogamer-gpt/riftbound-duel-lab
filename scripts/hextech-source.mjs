#!/usr/bin/env node
/**
 * Build a reviewed Hextech Analytics source export for import-reference-cards.
 *
 * The public library embeds its card records as JSON inside Next.js flight
 * payloads. This reads that JSON as data; page scripts are never executed.
 *
 * Usage: node scripts/hextech-source.mjs <query> <output.json>
 *   e.g. node scripts/hextech-source.mjs set:RAD /tmp/rad-export.json
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const HEXTECH_BASE = "https://hextechanalytics.com/cards";
const PUSH = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

export const hextechUrl = (query, page = 1) =>
  `${HEXTECH_BASE}?q=${encodeURIComponent(query)}${page > 1 ? `&page=${page}` : ""}`;

/** Read the JSON value that starts at `start` without evaluating anything. */
function readJsonValue(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === "[" || char === "{") depth++;
    else if (char === "]" || char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("Unterminated JSON value in Hextech payload");
}

/** Extract one page's card array and the advertised result total. */
export function parseHextechPage(html) {
  const flight = [...html.matchAll(PUSH)]
    .map((match) => JSON.parse(match[1]))
    .join("");
  const arrays = [];
  for (const match of flight.matchAll(/"cards":\[/g)) {
    let value;
    try {
      value = readJsonValue(flight, match.index + match[0].length - 1);
    } catch {
      continue;
    }
    if (value[0] && typeof value[0] === "object" && "riftbound_id" in value[0])
      arrays.push(value);
  }
  if (!arrays.length) throw new Error("No card records found on Hextech page");
  const ids = (cards) => cards.map((card) => card.id).join("\n");
  if (arrays.some((cards) => ids(cards) !== ids(arrays[0])))
    throw new Error("Hextech page contains inconsistent card arrays");
  const total = html.match(/\b(\d+) cards\b/);
  return { cards: arrays[0], total: total ? Number(total[1]) : null };
}

export async function fetchHextechText(url, { attempts = 3 } = {}) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "RiftboundPractice/1.0 (card source check)" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      return await response.text();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw last;
}

/** Download every advertised page and validate totals and unique identities. */
export async function buildHextechExport(
  query,
  { fetchText = fetchHextechText, onPage = () => {} } = {},
) {
  const first = parseHextechPage(await fetchText(hextechUrl(query)));
  if (!first.total || !first.cards.length)
    throw new Error("Hextech did not advertise a result total");
  const pageCount = Math.ceil(first.total / first.cards.length);
  const cards = [...first.cards];
  onPage(1, pageCount);
  for (let page = 2; page <= pageCount; page++) {
    const next = parseHextechPage(await fetchText(hextechUrl(query, page)));
    if (next.total !== first.total)
      throw new Error("Hextech results changed while downloading; retry");
    cards.push(...next.cards);
    onPage(page, pageCount);
  }
  if (new Set(cards.map((card) => card.id)).size !== cards.length)
    throw new Error("Duplicate Hextech card IDs across pages");
  if (cards.length !== first.total)
    throw new Error(
      `Incomplete Hextech export: ${cards.length}/${first.total}`,
    );
  return {
    sourceUrl: hextechUrl(query),
    pageCount,
    count: cards.length,
    fetchedAt: new Date().toISOString(),
    cards,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [query, output] = process.argv.slice(2);
  if (!query || !output || process.argv.length !== 4) {
    process.stderr.write(
      "Usage: node scripts/hextech-source.mjs <query> <output.json>\n",
    );
    process.exitCode = 1;
  } else {
    const result = await buildHextechExport(query, {
      onPage: (page, pages) =>
        process.stdout.write(`Downloaded Hextech page ${page}/${pages}\n`),
    });
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(
      `Saved ${result.count} records from ${result.pageCount} pages to ${output}. Review before importing.\n`,
    );
  }
}
