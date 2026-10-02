#!/usr/bin/env node
/** Refresh the read-only, local card catalogue from Riftcodex's documented API. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = 'https://api.riftcodex.com';
const output = fileURLToPath(new URL('../src/data/', import.meta.url));
const headers = { 'User-Agent': 'RiftboundPractice/1.0 (card catalogue sync)', Accept: 'application/json' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const banList = JSON.parse(await readFile(new URL('../src/data/banned-cards.json', import.meta.url), 'utf8'));
const normalizeName = (name) => name.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const bannedNames = new Set(banList.names.map(normalizeName));

async function get(path) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${path}`);
      return await response.json();
    } catch (error) {
      last = error;
      await sleep(1000 * (attempt + 1));
    }
  }
  throw last;
}

const first = await get('/cards?size=100&page=1');
if (!Array.isArray(first.items) || !Number.isInteger(first.pages)) throw new Error('Unexpected Riftcodex response');
const raw = [...first.items];
for (let page = 2; page <= first.pages; page += 1) {
  await sleep(200);
  const result = await get(`/cards?size=100&page=${page}`);
  if (!Array.isArray(result.items)) throw new Error(`Missing items on page ${page}`);
  raw.push(...result.items);
  process.stdout.write(`Downloaded page ${page}/${first.pages}\n`);
}
if (raw.length !== first.total) throw new Error(`Incomplete catalogue: ${raw.length}/${first.total}`);
if (new Set(raw.map((c) => c.id)).size !== raw.length) throw new Error('Duplicate provider IDs, retry the snapshot');
const idCounts = new Map();
for (const card of raw) idCounts.set(card.riftbound_id, (idCounts.get(card.riftbound_id) ?? 0) + 1);
const cards = raw.map((card) => ({
  id: idCounts.get(card.riftbound_id) === 1 ? card.riftbound_id : `${card.riftbound_id}--${card.id}`,
  riftboundId: card.riftbound_id,
  providerId: card.id,
  name: card.name,
  type: card.classification.type,
  supertype: card.classification.supertype ?? null,
  domains: card.classification.domain ?? [],
  energy: card.attributes.energy ?? null,
  power: card.attributes.power ?? null,
  might: card.attributes.might ?? null,
  text: card.text.plain ?? '',
  image: card.media.image_url ?? '',
  set: card.set.set_id,
  setName: card.set.label,
  rarity: card.classification.rarity,
  tags: card.tags ?? [],
  keywords: [...new Set([...((card.text.plain ?? '').matchAll(/\[([^\]]+)\]/g))].map((match) => match[1]))],
  collectorNumber: card.collector_number,
  variant: Boolean(card.metadata.alternate_art || card.metadata.signature || card.metadata.overnumbered || /\((?:Metal|Promo|Alternate|Signature)/i.test(card.name)),
  artist: card.media.artist ?? null,
  bannedInDuel: bannedNames.has(normalizeName(card.name)),
})).sort((a, b) => a.id.localeCompare(b.id));

const setResponse = await get('/sets?size=100');
const meta = {
  provider: 'Riftcodex',
  apiBase: base,
  documentation: `${base}/docs`,
  schema: `${base}/openapi.json`,
  fetchedAt: new Date().toISOString(),
  count: cards.length,
  uniqueNames: new Set(cards.filter((card) => !card.variant).map((card) => card.name)).size,
  banListDate: banList.effectiveAt,
  banListSource: banList.source,
  sets: setResponse.items.map((set) => ({ id: set.set_id, name: set.name, releasedAt: set.published_on })),
  attribution: 'Unofficial fan project. Riftbound, card names, rules text, and artwork are property of Riot Games, Inc.',
};

await mkdir(output, { recursive: true });
await writeFile(`${output}cards.json`, `${JSON.stringify(cards, null, 2)}\n`);
await writeFile(`${output}catalog-meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
process.stdout.write(`Saved ${cards.length} printings from ${meta.sets.length} sets.\n`);
