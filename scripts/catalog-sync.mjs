/** Pure import/validation code. Importing this module never fetches or writes. */
import { createHash } from "node:crypto";

export const API_BASE = "https://api.riftcodex.com";
const CARD_TYPES = new Set([
  "Unit",
  "Spell",
  "Gear",
  "Legend",
  "Battlefield",
  "Rune",
]);
const DOMAINS = new Set([
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
]);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const normalizeName = (name) =>
  name
    .replace(/\([^)]*\)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export const serializeCatalog = (value) =>
  `${JSON.stringify(value, null, 2)}\n`;
export const catalogDigest = (cards) =>
  createHash("sha256").update(serializeCatalog(cards)).digest("hex");

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function string(value, label) {
  requireThat(
    typeof value === "string" && value.trim().length > 0,
    `Invalid ${label}: expected nonempty string`,
  );
  return value;
}
function nullableString(value, label) {
  requireThat(
    value == null || typeof value === "string",
    `Invalid ${label}: expected string or null`,
  );
  return value ?? null;
}
function stringArray(value, label) {
  requireThat(
    Array.isArray(value) && value.every((item) => typeof item === "string"),
    `Invalid ${label}: expected string array`,
  );
  return [...value];
}
function statistic(value, label) {
  requireThat(
    value == null || (Number.isInteger(value) && value >= 0),
    `Invalid ${label}: expected nonnegative integer or null`,
  );
  return value ?? null;
}
function date(value, label) {
  string(value, label);
  requireThat(
    Number.isFinite(Date.parse(value)),
    `Invalid ${label}: expected date`,
  );
  return value;
}
function distinct(items, key, label) {
  requireThat(
    new Set(items.map(key)).size === items.length,
    `Duplicate ${label}`,
  );
}

/** Verify every page's envelope, totals and IDs before the caller can save it. */
export async function downloadPages(
  get,
  path,
  { pageSize = 100, onPage = () => {} } = {},
) {
  requireThat(
    Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100,
    "Invalid page size",
  );
  const all = [];
  let total;
  let pages;
  for (let page = 1; page <= (pages ?? 1); page += 1) {
    const result = await get(`${path}?size=${pageSize}&page=${page}`);
    requireThat(
      result && Array.isArray(result.items),
      `Missing items on ${path} page ${page}`,
    );
    requireThat(
      Number.isInteger(result.total) &&
        result.total >= 0 &&
        Number.isInteger(result.pages),
      `Invalid pagination on ${path} page ${page}`,
    );
    requireThat(
      result.page === page && result.size === pageSize,
      `Wrong pagination on ${path} page ${page}`,
    );
    requireThat(
      result.pages === Math.ceil(result.total / pageSize),
      `Invalid page count on ${path} page ${page}`,
    );
    if (page === 1) {
      total = result.total;
      pages = result.pages;
    }
    requireThat(
      result.total === total && result.pages === pages,
      `Catalogue changed while downloading ${path}; retry the snapshot`,
    );
    const expected = Math.min(
      pageSize,
      Math.max(0, total - (page - 1) * pageSize),
    );
    requireThat(
      result.items.length === expected,
      `Incomplete ${path} page ${page}: ${result.items.length}/${expected}`,
    );
    for (const item of result.items) string(item?.id, `${path} provider ID`);
    all.push(...result.items);
    await onPage({ path, page, pages });
  }
  requireThat(
    all.length === total,
    `Incomplete ${path} catalogue: ${all.length}/${total}`,
  );
  distinct(all, (item) => item.id, `${path} provider IDs; retry the snapshot`);
  return all;
}

function transformCard(card, bannedNames) {
  const label = card?.id ?? "card";
  for (const key of [
    "attributes",
    "classification",
    "text",
    "set",
    "media",
    "metadata",
  ]) {
    requireThat(
      card?.[key] && typeof card[key] === "object",
      `Missing ${label}.${key}`,
    );
  }
  const type = string(card.classification.type, `${label}.type`);
  requireThat(
    CARD_TYPES.has(type),
    `Unsupported card type ${type} for ${label}`,
  );
  const domains = stringArray(card.classification.domain, `${label}.domains`);
  requireThat(
    domains.every((domain) => DOMAINS.has(domain)),
    `Unsupported domain for ${label}`,
  );
  const name = string(card.name, `${label}.name`);
  const text = nullableString(card.text.plain, `${label}.text`) ?? "";
  for (const key of ["alternate_art", "signature", "overnumbered"]) {
    requireThat(
      typeof card.metadata[key] === "boolean",
      `Invalid ${label}.metadata.${key}`,
    );
  }
  requireThat(
    Number.isInteger(card.collector_number) && card.collector_number >= 0,
    `Invalid ${label}.collector_number`,
  );
  if (card.metadata.updated_on != null)
    date(card.metadata.updated_on, `${label}.updated_on`);
  return {
    id: "",
    riftboundId: string(card.riftbound_id, `${label}.riftbound_id`),
    providerId: string(card.id, `${label}.id`),
    name,
    type,
    supertype: nullableString(
      card.classification.supertype,
      `${label}.supertype`,
    ),
    domains,
    energy: statistic(card.attributes.energy, `${label}.energy`),
    power: statistic(card.attributes.power, `${label}.power`),
    might: statistic(card.attributes.might, `${label}.might`),
    text,
    image: nullableString(card.media.image_url, `${label}.image`) ?? "",
    set: string(card.set.set_id, `${label}.set`),
    setName: string(card.set.label, `${label}.setName`),
    rarity: string(card.classification.rarity, `${label}.rarity`),
    tags: stringArray(card.tags, `${label}.tags`),
    keywords: [
      ...new Set([...text.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1])),
    ],
    collectorNumber: card.collector_number,
    variant: Boolean(
      card.metadata.alternate_art ||
      card.metadata.signature ||
      card.metadata.overnumbered ||
      /\((?:Metal|Promo|Alternate|Signature)/i.test(name),
    ),
    artist: nullableString(card.media.artist, `${label}.artist`),
    bannedInDuel: bannedNames.has(normalizeName(name)),
  };
}

/** Preserve saved-deck IDs even when a code gains another printing or a UUID changes. */
function assignStableIds(cards, previousCards) {
  distinct(previousCards, (card) => card.id, "previous local IDs");
  distinct(previousCards, (card) => card.providerId, "previous provider IDs");
  for (const card of previousCards) {
    string(card.id, "previous local ID");
    string(card.providerId, "previous provider ID");
    string(card.riftboundId, "previous Riftbound ID");
  }
  const previousByProvider = new Map(
    previousCards.map((card) => [card.providerId, card]),
  );
  const presentProviders = new Set(cards.map((card) => card.providerId));
  const reservedIds = new Set(previousCards.map((card) => card.id));
  const usedIds = new Set();
  const identity = (card) =>
    JSON.stringify([card.riftboundId, card.name, card.variant]);
  const previousByIdentity = new Map();
  const currentIdentityCounts = new Map();
  const riftboundCounts = new Map();
  for (const card of previousCards) {
    if (!presentProviders.has(card.providerId)) {
      const key = identity(card);
      previousByIdentity.set(key, [
        ...(previousByIdentity.get(key) ?? []),
        card,
      ]);
    }
  }
  for (const card of cards) {
    currentIdentityCounts.set(
      identity(card),
      (currentIdentityCounts.get(identity(card)) ?? 0) + 1,
    );
    riftboundCounts.set(
      card.riftboundId,
      (riftboundCounts.get(card.riftboundId) ?? 0) + 1,
    );
  }
  for (const card of cards) {
    const byProvider = previousByProvider.get(card.providerId);
    if (byProvider) {
      requireThat(
        byProvider.riftboundId === card.riftboundId,
        `Provider ID ${card.providerId} changed Riftbound identity`,
      );
      card.id = byProvider.id;
    } else {
      const candidates = previousByIdentity.get(identity(card)) ?? [];
      if (
        candidates.length === 1 &&
        currentIdentityCounts.get(identity(card)) === 1
      )
        card.id = candidates[0].id;
    }
    if (card.id) {
      requireThat(!usedIds.has(card.id), `Local ID collision: ${card.id}`);
      usedIds.add(card.id);
    }
  }
  for (const card of cards) {
    if (card.id) continue;
    const simple = card.riftboundId;
    card.id =
      riftboundCounts.get(simple) === 1 &&
      !reservedIds.has(simple) &&
      !usedIds.has(simple)
        ? simple
        : `${simple}--${card.providerId}`;
    requireThat(
      !reservedIds.has(card.id) && !usedIds.has(card.id),
      `Local ID collision: ${card.id}`,
    );
    usedIds.add(card.id);
  }
  return previousCards
    .filter((card) => !usedIds.has(card.id))
    .map((card) => card.id)
    .sort(compare);
}

export function buildCatalogSnapshot(
  rawCards,
  rawSets,
  {
    previousCards = [],
    banList,
    fetchedAt,
    startedAt = fetchedAt,
    allowRemovals = false,
  } = {},
) {
  requireThat(
    Array.isArray(rawCards) && rawCards.length > 0,
    "Cannot save an empty card catalogue",
  );
  requireThat(
    Array.isArray(rawSets) && rawSets.length > 0,
    "Cannot save an empty set catalogue",
  );
  requireThat(
    Array.isArray(previousCards),
    "Previous catalogue must be an array",
  );
  date(fetchedAt, "fetch date");
  date(startedAt, "fetch start date");
  requireThat(
    Date.parse(startedAt) <= Date.parse(fetchedAt),
    "Fetch start date is after completion",
  );
  const bannedNames = new Set(
    stringArray(banList?.names, "ban list names").map(normalizeName),
  );
  date(banList.effectiveAt, "ban list date");
  string(banList.source, "ban list source");
  const cards = rawCards.map((card) => transformCard(card, bannedNames));
  distinct(cards, (card) => card.providerId, "provider IDs");
  const removedIds = assignStableIds(cards, previousCards);
  requireThat(
    allowRemovals || removedIds.length === 0,
    `${removedIds.length} saved printing IDs disappeared; inspect the provider changes before using --allow-removals`,
  );
  cards.sort((a, b) => compare(a.id, b.id));
  const counts = new Map();
  for (const card of cards)
    counts.set(card.set, (counts.get(card.set) ?? 0) + 1);
  const sets = rawSets
    .map((set) => {
      const id = string(set.set_id, "set ID");
      requireThat(
        Number.isInteger(set.card_count) && set.card_count >= 0,
        `Invalid ${id} card_count`,
      );
      const count = counts.get(id) ?? 0;
      requireThat(
        count === set.card_count,
        `Incomplete set ${id}: ${count}/${set.card_count}`,
      );
      return {
        id,
        name: string(set.name, `${id} name`),
        releasedAt: date(set.published_on, `${id} release date`),
        count,
        providerCount: set.card_count,
      };
    })
    .sort((a, b) => compare(a.id, b.id));
  distinct(sets, (set) => set.id, "set IDs");
  const setIds = new Set(sets.map((set) => set.id));
  for (const card of cards)
    requireThat(
      setIds.has(card.set),
      `Card ${card.id} references unknown set ${card.set}`,
    );
  const updatedDates = rawCards
    .map((card) => card.metadata.updated_on)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const meta = {
    provider: "Riftcodex",
    apiBase: API_BASE,
    documentation: `${API_BASE}/docs`,
    schema: `${API_BASE}/openapi.json`,
    schemaVersion: 2,
    startedAt,
    fetchedAt,
    scope:
      "All printings returned by /cards without set, new, rarity, or variant filters; completeness is relative to Riftcodex.",
    count: cards.length,
    uniqueNames: new Set(
      cards.filter((card) => !card.variant).map((card) => card.name),
    ).size,
    variantCount: cards.filter((card) => card.variant).length,
    sourceUpdatedAt: updatedDates.at(-1) ?? null,
    cardDataSha256: catalogDigest(cards),
    banListDate: banList.effectiveAt,
    banListSource: banList.source,
    sets,
    removedIds,
    attribution:
      "Unofficial fan project. Riftbound, card names, rules text, and artwork are property of Riot Games, Inc.",
  };
  return { cards, meta };
}
