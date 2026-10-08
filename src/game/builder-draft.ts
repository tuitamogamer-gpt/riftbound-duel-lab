import { cardsById, isCardType, type Domain } from "../data/cards";
import {
  MAX_MAIN_DECK_SIZE,
  type DeckEntry,
  type StarterDeck,
} from "../data/decks";

export const BUILDER_DRAFT_KEY = "riftbound-builder-draft-v1";
export const MAX_BUILDER_DRAFT_LENGTH = 200_000;

export interface BuilderDraft {
  version: 1;
  savedAt: string;
  deck: StarterDeck;
  previousId?: string;
  sourceId: string;
}

export type BuilderDraftRead =
  | { status: "empty"; raw: null }
  | { status: "ready"; raw: string; draft: BuilderDraft }
  | { status: "invalid"; raw: string }
  | { status: "unavailable"; raw: null };

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DraftWriteResult =
  | { ok: true; raw: string | null }
  | { ok: false; reason: "unavailable" | "invalid" | "size" | "conflict" };

const domains = new Set<Domain>([
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
]);
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, maximum: number): value is string =>
  typeof value === "string" && value.length <= maximum;

function entries(
  value: unknown,
  maximum: number,
  types: string[],
): DeckEntry[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const result: DeckEntry[] = [];
  const ids = new Set<string>();
  let total = 0;
  for (const entry of value) {
    if (
      !object(entry) ||
      !text(entry.cardId, 160) ||
      !Number.isInteger(entry.count) ||
      (entry.count as number) < 1
    )
      return null;
    const card = cardsById[entry.cardId];
    if (
      !card ||
      card.supertype === "Token" ||
      !types.some((type) => isCardType(card, type)) ||
      ids.has(card.id)
    )
      return null;
    total += entry.count as number;
    if (total > maximum) return null;
    ids.add(card.id);
    result.push({ cardId: card.id, count: entry.count as number });
  }
  return result;
}

/** Validate structure and resource bounds while retaining an unfinished, illegal list. */
export function parseBuilderDraft(raw: string | null): BuilderDraft | null {
  if (!raw || raw.length > MAX_BUILDER_DRAFT_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !object(value) ||
      value.version !== 1 ||
      !text(value.savedAt, 40) ||
      !Number.isFinite(Date.parse(value.savedAt)) ||
      !text(value.sourceId, 160) ||
      (value.previousId !== undefined && !text(value.previousId, 160)) ||
      !object(value.deck)
    )
      return null;
    const deck = value.deck;
    for (const [field, maximum] of [
      ["id", 160],
      ["name", 120],
      ["champion", 200],
      ["title", 300],
      ["description", 6_000],
      ["archetype", 300],
      ["color", 40],
    ] as const) {
      if (!text(deck[field], maximum)) return null;
    }
    if (
      !/^#[\da-f]{3,8}$/i.test(deck.color as string) ||
      !["Početnik", "Srednje"].includes(deck.difficulty as string) ||
      deck.source !== "Imported deck" ||
      ![undefined, "standard", "historical-precon"].includes(
        deck.format as string | undefined,
      )
    )
      return null;
    if (
      !Array.isArray(deck.domains) ||
      deck.domains.length > 7 ||
      !deck.domains.every((domain) => domains.has(domain as Domain)) ||
      new Set(deck.domains).size !== deck.domains.length
    )
      return null;
    if (
      !text(deck.legendId, 160) ||
      !isCardType(cardsById[deck.legendId], "Legend") ||
      !text(deck.championId, 160) ||
      (deck.championId !== "" &&
        (cardsById[deck.championId]?.supertype !== "Champion" ||
          !isCardType(cardsById[deck.championId], "Unit")))
    )
      return null;
    if (
      !text(deck.battlefieldId, 160) ||
      (deck.battlefieldId !== "" &&
        (!isCardType(cardsById[deck.battlefieldId], "Battlefield") ||
          cardsById[deck.battlefieldId]?.supertype === "Token"))
    )
      return null;
    const fields =
      deck.battlefieldIds ?? (deck.battlefieldId ? [deck.battlefieldId] : []);
    if (
      !Array.isArray(fields) ||
      fields.length > 3 ||
      !fields.every(
        (id) =>
          typeof id === "string" &&
          isCardType(cardsById[id], "Battlefield") &&
          cardsById[id]?.supertype !== "Token",
      ) ||
      new Set(fields).size !== fields.length ||
      (fields.length > 0 && fields[0] !== deck.battlefieldId) ||
      (fields.length === 0 && deck.battlefieldId !== "")
    )
      return null;
    const main = entries(deck.main, MAX_MAIN_DECK_SIZE - 1, [
      "Unit",
      "Spell",
      "Gear",
    ]);
    const runes = entries(deck.runes, 12, ["Rune"]);
    const sideboard = entries(deck.sideboard ?? [], 10, [
      "Unit",
      "Spell",
      "Gear",
    ]);
    if (!main || !runes || !sideboard) return null;
    return {
      version: 1,
      savedAt: value.savedAt,
      sourceId: value.sourceId,
      ...(value.previousId === undefined
        ? {}
        : { previousId: value.previousId }),
      deck: {
        id: deck.id as string,
        name: deck.name as string,
        champion: deck.champion as string,
        title: deck.title as string,
        description: deck.description as string,
        difficulty: deck.difficulty as StarterDeck["difficulty"],
        archetype: deck.archetype as string,
        color: deck.color as string,
        domains: [...deck.domains] as Domain[],
        legendId: deck.legendId,
        championId: deck.championId,
        battlefieldId: deck.battlefieldId,
        battlefieldIds: [...fields] as string[],
        main,
        runes,
        sideboard,
        source: "Imported deck",
        ...(deck.format === undefined
          ? {}
          : { format: deck.format as StarterDeck["format"] }),
      },
    };
  } catch {
    return null;
  }
}

export function readBuilderDraft(storage?: DraftStorage): BuilderDraftRead {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(BUILDER_DRAFT_KEY);
    if (raw === null) return { status: "empty", raw };
    const draft = parseBuilderDraft(raw);
    return draft ? { status: "ready", raw, draft } : { status: "invalid", raw };
  } catch {
    return { status: "unavailable", raw: null };
  }
}

/** setItem is atomic; never delete the existing backup before a replacement succeeds. */
export function writeBuilderDraft(
  draft: BuilderDraft,
  storage?: DraftStorage,
  expectedRaw?: string | null,
): DraftWriteResult {
  try {
    const target = storage ?? globalThis.localStorage;
    const existing = target.getItem(BUILDER_DRAFT_KEY);
    if (expectedRaw !== undefined && existing !== expectedRaw)
      return { ok: false, reason: "conflict" };
    if (existing !== null && !parseBuilderDraft(existing))
      return { ok: false, reason: "invalid" };
    const raw = JSON.stringify(draft);
    if (raw.length > MAX_BUILDER_DRAFT_LENGTH)
      return { ok: false, reason: "size" };
    const validated = parseBuilderDraft(raw);
    if (!validated) return { ok: false, reason: "invalid" };
    const clean = JSON.stringify(validated);
    target.setItem(BUILDER_DRAFT_KEY, clean);
    return { ok: true, raw: clean };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function clearBuilderDraft(
  storage?: DraftStorage,
  expectedRaw?: string | null,
): DraftWriteResult {
  try {
    const target = storage ?? globalThis.localStorage;
    if (
      expectedRaw !== undefined &&
      target.getItem(BUILDER_DRAFT_KEY) !== expectedRaw
    )
      return { ok: false, reason: "conflict" };
    target.removeItem(BUILDER_DRAFT_KEY);
    return { ok: true, raw: null };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
