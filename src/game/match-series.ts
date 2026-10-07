import { cardsById, type Domain } from "../data/cards";
import { gameplayFingerprint } from "../data/card-identity";
import {
  MAX_MAIN_DECK_SIZE,
  type DeckEntry,
  type StarterDeck,
} from "../data/decks";
import { getDeckScriptCoverage, validateImportedDeck } from "./deck-import";
import { builderCount } from "./deck-builder";
import type { GameOptions, GameState, PlayerId } from "./types";

export const MATCH_SERIES_KEY = "riftbound-match-series-v1";
export type SeriesPhase = "playing" | "sideboarding" | "complete";
export interface SeriesGameResult {
  number: number;
  seed: number;
  revision: number;
  winner: PlayerId;
  turns: number;
  points: [number, number];
}
export interface MatchSeries {
  version: 1;
  id: string;
  createdAt: number;
  phase: SeriesPhase;
  originalDecks: [StarterDeck, StarterDeck];
  decks: [StarterDeck, StarterDeck];
  battlefieldIds: [string, string];
  difficulty: NonNullable<GameOptions["botDifficulty"]>;
  baseSeed: number;
  botSeed: number;
  openDecklists: boolean;
  activeGame: { number: number; seed: number; firstPlayer: PlayerId };
  scores: [number, number];
  games: SeriesGameResult[];
  winner: PlayerId | null;
}
export type CreateSeriesOptions = GameOptions & {
  playerDeck: StarterDeck;
  botDeck: StarterDeck;
  createdAt?: number;
};
export interface SeriesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fieldIds = (deck: StarterDeck) =>
  deck.battlefieldIds?.length ? deck.battlefieldIds : [deck.battlefieldId];
const validSeed = (value: unknown): value is number =>
  Number.isSafeInteger(value) &&
  Number(value) > 0 &&
  Number(value) <= 0xffffffff;
const player = (value: unknown): value is PlayerId =>
  value === 0 || value === 1;
const integer = (
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function inventory(entries: DeckEntry[]): string {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const card = cardsById[entry.cardId];
    const key = card ? gameplayFingerprint(card) : entry.cardId;
    counts.set(key, (counts.get(key) ?? 0) + entry.count);
  }
  return JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b)));
}
const pool = (deck: StarterDeck) =>
  inventory([...deck.main, ...(deck.sideboard ?? [])]);

/** Main and sideboard may exchange copies; the registered card pool cannot change. */
export function validateSeriesDeck(
  original: StarterDeck,
  deck: StarterDeck,
): string[] {
  const errors = validateImportedDeck(deck)
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
  const fixed = JSON.stringify([
    original.legendId,
    original.championId,
    original.domains,
    original.runes,
    original.battlefieldId,
    fieldIds(original),
    original.format ?? "standard",
  ]);
  const current = JSON.stringify([
    deck.legendId,
    deck.championId,
    deck.domains,
    deck.runes,
    deck.battlefieldId,
    fieldIds(deck),
    deck.format ?? "standard",
  ]);
  if (fixed !== current)
    errors.push(
      "Legend, chosen champion, runes, battlefields and format stay fixed within a series.",
    );
  if (builderCount(deck.main) !== builderCount(original.main))
    errors.push("Sideboarding must preserve the main deck card count.");
  if (pool(original) !== pool(deck))
    errors.push(
      "Sideboarding must preserve every registered main and sideboard card.",
    );
  if (!getDeckScriptCoverage(deck).complete)
    errors.push("Every main deck card must be supported for play.");
  return [...new Set(errors)];
}

export function createSeries(options: CreateSeriesOptions): MatchSeries {
  for (const deck of [options.playerDeck, options.botDeck]) {
    const issues = validateImportedDeck(deck).filter(
      (issue) => issue.severity === "error",
    );
    if (issues.length || !getDeckScriptCoverage(deck).complete)
      throw new Error(
        "Choose two legal, supported decks before starting a series.",
      );
  }
  const baseSeed = (options.seed ?? Date.now()) >>> 0 || 1;
  const botSeed = (options.botSeed ?? baseSeed ^ 0x85ebca6b) >>> 0 || 1;
  const createdAt = options.createdAt ?? Date.now();
  const originals: [StarterDeck, StarterDeck] = [
    clone(options.playerDeck),
    clone(options.botDeck),
  ];
  const fields: [string, string] = [
    options.playerBattlefieldId ?? originals[0].battlefieldId,
    options.botBattlefieldId ?? originals[1].battlefieldId,
  ];
  if (fields.some((id, index) => !fieldIds(originals[index]).includes(id)))
    throw new Error(
      "Selected battlefields must belong to the registered decks.",
    );
  return {
    version: 1,
    id: `series-${baseSeed.toString(36)}-${createdAt.toString(36)}`,
    createdAt,
    phase: "playing",
    originalDecks: originals,
    decks: clone(originals),
    battlefieldIds: fields,
    difficulty: options.botDifficulty ?? "normal",
    baseSeed,
    botSeed,
    openDecklists: options.openDecklists ?? false,
    activeGame: {
      number: 1,
      seed: baseSeed,
      firstPlayer: options.firstPlayer ?? 0,
    },
    scores: [0, 0],
    games: [],
    winner: null,
  };
}

export function seriesGameOptions(series: MatchSeries): GameOptions {
  return {
    playerDeck: clone(series.decks[0]),
    botDeck: clone(series.decks[1]),
    playerDeckId: series.decks[0].id,
    botDeckId: series.decks[1].id,
    playerBattlefieldId: series.battlefieldIds[0],
    botBattlefieldId: series.battlefieldIds[1],
    botDifficulty: series.difficulty,
    botSeed:
      (series.botSeed + (series.activeGame.number - 1) * 0x9e3779b9) >>> 0 || 1,
    seed: series.activeGame.seed,
    firstPlayer: series.activeGame.firstPlayer,
    openDecklists: series.openDecklists,
  };
}

/** Seed and registered lists bind the result to this series, never a standalone duel. */
export function seriesMatchesGame(
  series: MatchSeries,
  game: GameState,
): boolean {
  if (game.seed !== series.activeGame.seed) return false;
  return series.decks.every((deck, index) => {
    const actual = game.players[index];
    const legend = cardsById[actual.legendId],
      champion = cardsById[actual.championId];
    if (
      !legend ||
      !champion ||
      gameplayFingerprint(legend) !==
        gameplayFingerprint(cardsById[deck.legendId]) ||
      gameplayFingerprint(champion) !==
        gameplayFingerprint(cardsById[deck.championId])
    )
      return false;
    if (actual.deckList)
      return (
        inventory(actual.deckList.map((cardId) => ({ cardId, count: 1 }))) ===
        inventory(deck.main)
      );
    return actual.deckId === deck.id;
  });
}

export function recordSeriesGame(
  series: MatchSeries,
  game: GameState,
): MatchSeries {
  if (
    series.phase !== "playing" ||
    game.winner === null ||
    !seriesMatchesGame(series, game) ||
    series.games.some((result) => result.seed === game.seed)
  )
    return series;
  const scores: [number, number] = [...series.scores];
  scores[game.winner]++;
  const result: SeriesGameResult = {
    number: series.activeGame.number,
    seed: game.seed,
    revision: game.revision ?? 0,
    winner: game.winner,
    turns: game.turn,
    points: [game.players[0].points, game.players[1].points],
  };
  const winner = scores[game.winner] >= 2 ? game.winner : null;
  return {
    ...series,
    scores,
    games: [...series.games, result],
    winner,
    phase: winner === null ? "sideboarding" : "complete",
  };
}

export function previousSeriesLoser(series: MatchSeries): PlayerId {
  return series.games.length
    ? series.games[series.games.length - 1].winner === 0
      ? 1
      : 0
    : series.activeGame.firstPlayer;
}

export function updateSeriesDeck(
  series: MatchSeries,
  editedDeck: StarterDeck,
): MatchSeries {
  if (series.phase !== "sideboarding")
    throw new Error("Sideboarding is available between games.");
  const issues = validateSeriesDeck(series.originalDecks[0], editedDeck);
  if (issues.length) throw new Error(issues.join("\n"));
  return { ...series, decks: [clone(editedDeck), clone(series.decks[1])] };
}

export function prepareNextSeriesGame(
  series: MatchSeries,
  editedDeck: StarterDeck,
  firstPlayer: PlayerId,
  requestedSeed?: number,
): MatchSeries {
  const next = updateSeriesDeck(series, editedDeck);
  if (!player(firstPlayer)) throw new Error("Choose a valid starting player.");
  const number = series.games.length + 1;
  const seed =
    requestedSeed ?? ((series.baseSeed + (number - 1) * 0x9e3779b9) >>> 0 || 1);
  if (!validSeed(seed) || series.games.some((game) => game.seed === seed))
    throw new Error("Each series game needs a new valid seed.");
  return {
    ...next,
    phase: "playing",
    activeGame: { number, seed, firstPlayer },
  };
}

/** One exact swap is atomic, so no incomplete list can start the next game. */
export function swapSeriesCards(
  deck: StarterDeck,
  mainCardId: string,
  sideCardId: string,
): StarterDeck {
  if (
    !deck.main.some(
      (entry) => entry.cardId === mainCardId && entry.count > 0,
    ) ||
    !(deck.sideboard ?? []).some(
      (entry) => entry.cardId === sideCardId && entry.count > 0,
    )
  )
    throw new Error(
      "Choose one main deck card and one sideboard card to exchange.",
    );
  const adjust = (entries: DeckEntry[], remove: string, add: string) => {
    const next = entries
      .map((entry) =>
        entry.cardId === remove
          ? { ...entry, count: entry.count - 1 }
          : { ...entry },
      )
      .filter((entry) => entry.count > 0);
    const existing = next.find((entry) => entry.cardId === add);
    if (existing) existing.count++;
    else next.push({ cardId: add, count: 1 });
    return next;
  };
  const next = {
    ...deck,
    main: adjust(deck.main, mainCardId, sideCardId),
    sideboard: adjust(deck.sideboard ?? [], sideCardId, mainCardId),
  };
  const issues = validateSeriesDeck(deck, next);
  if (issues.length) throw new Error(issues.join("\n"));
  return next;
}

function deckShape(value: unknown): value is StarterDeck {
  if (!record(value)) return false;
  for (const key of [
    "id",
    "name",
    "champion",
    "title",
    "description",
    "archetype",
    "color",
    "legendId",
    "championId",
    "battlefieldId",
  ])
    if (typeof value[key] !== "string" || (value[key] as string).length > 5000)
      return false;
  if (
    !["Početnik", "Srednje"].includes(String(value.difficulty)) ||
    ![
      "Imported deck",
      "Official preconstructed deck",
      "Curated practice deck",
    ].includes(String(value.source))
  )
    return false;
  if (
    value.format !== undefined &&
    value.format !== "standard" &&
    value.format !== "historical-precon"
  )
    return false;
  const domainNames: Domain[] = [
    "Fury",
    "Calm",
    "Mind",
    "Body",
    "Chaos",
    "Order",
    "Colorless",
  ];
  if (
    !Array.isArray(value.domains) ||
    value.domains.length > 7 ||
    !value.domains.every((domain) => domainNames.includes(domain))
  )
    return false;
  const entries = (raw: unknown) =>
    Array.isArray(raw) &&
    raw.length <= MAX_MAIN_DECK_SIZE &&
    raw.every(
      (entry) =>
        record(entry) &&
        typeof entry.cardId === "string" &&
        integer(entry.count, 1, MAX_MAIN_DECK_SIZE),
    );
  if (
    !entries(value.main) ||
    !entries(value.runes) ||
    (value.sideboard !== undefined && !entries(value.sideboard))
  )
    return false;
  if (
    value.battlefieldIds !== undefined &&
    (!Array.isArray(value.battlefieldIds) ||
      value.battlefieldIds.length > 3 ||
      !value.battlefieldIds.every((id) => typeof id === "string"))
  )
    return false;
  try {
    return !validateImportedDeck(value as unknown as StarterDeck).some(
      (issue) => issue.severity === "error",
    );
  } catch {
    return false;
  }
}

export function validateMatchSeries(value: unknown): value is MatchSeries {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.id !== "string" ||
    !/^series-[a-z0-9]+-[a-z0-9]+$/.test(value.id) ||
    !integer(value.createdAt, 1) ||
    !["playing", "sideboarding", "complete"].includes(String(value.phase))
  )
    return false;
  if (
    !validSeed(value.baseSeed) ||
    !validSeed(value.botSeed) ||
    typeof value.openDecklists !== "boolean" ||
    !["beginner", "normal", "hard", "expert"].includes(String(value.difficulty))
  )
    return false;
  if (
    value.id !==
    `series-${value.baseSeed.toString(36)}-${value.createdAt.toString(36)}`
  )
    return false;
  if (
    !Array.isArray(value.originalDecks) ||
    value.originalDecks.length !== 2 ||
    !value.originalDecks.every(deckShape) ||
    !Array.isArray(value.decks) ||
    value.decks.length !== 2 ||
    !value.decks.every(deckShape)
  )
    return false;
  if (
    !Array.isArray(value.battlefieldIds) ||
    value.battlefieldIds.length !== 2 ||
    !value.battlefieldIds.every(
      (id, index) =>
        typeof id === "string" &&
        fieldIds((value.originalDecks as StarterDeck[])[index]).includes(id),
    )
  )
    return false;
  if (
    !record(value.activeGame) ||
    !integer(value.activeGame.number, 1, 3) ||
    !validSeed(value.activeGame.seed) ||
    !player(value.activeGame.firstPlayer)
  )
    return false;
  if (
    !Array.isArray(value.scores) ||
    value.scores.length !== 2 ||
    !value.scores.every((score) => integer(score, 0, 2)) ||
    !Array.isArray(value.games) ||
    value.games.length > 3 ||
    (value.winner !== null && !player(value.winner))
  )
    return false;
  const wins = [0, 0],
    seeds = new Set<number>();
  for (let index = 0; index < value.games.length; index++) {
    const game = value.games[index];
    if (
      !record(game) ||
      game.number !== index + 1 ||
      !validSeed(game.seed) ||
      seeds.has(game.seed) ||
      !player(game.winner) ||
      !integer(game.revision) ||
      !integer(game.turns) ||
      !Array.isArray(game.points) ||
      game.points.length !== 2 ||
      !game.points.every((points) => integer(points))
    )
      return false;
    if (wins.some((score) => score >= 2)) return false;
    if (index === 0 && game.seed !== value.baseSeed) return false;
    seeds.add(game.seed);
    wins[game.winner]++;
  }
  if (wins.some((score, index) => score !== (value.scores as number[])[index]))
    return false;
  const won = wins.findIndex((score) => score >= 2);
  if (
    (won < 0 ? null : won) !== value.winner ||
    won >= 0 !== (value.phase === "complete")
  )
    return false;
  if (value.phase === "playing") {
    if (
      value.activeGame.number !== value.games.length + 1 ||
      seeds.has(value.activeGame.seed) ||
      value.games.length > 2
    )
      return false;
    if (!value.games.length && value.activeGame.seed !== value.baseSeed)
      return false;
  } else {
    const last = value.games[value.games.length - 1];
    if (
      !last ||
      value.activeGame.number !== value.games.length ||
      value.activeGame.seed !== last.seed
    )
      return false;
  }
  try {
    return (value.decks as StarterDeck[]).every(
      (deck, index) =>
        !validateSeriesDeck((value.originalDecks as StarterDeck[])[index], deck)
          .length,
    );
  } catch {
    return false;
  }
}

function browserStorage(): SeriesStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
export function loadMatchSeries(
  storage: SeriesStorage | undefined = browserStorage(),
): MatchSeries | null {
  try {
    const raw = storage?.getItem(MATCH_SERIES_KEY);
    if (!raw || raw.length > 1_000_000) return null;
    const value: unknown = JSON.parse(raw);
    return validateMatchSeries(value) ? value : null;
  } catch {
    return null;
  }
}
export function saveMatchSeries(
  series: MatchSeries,
  storage: SeriesStorage | undefined = browserStorage(),
): boolean {
  if (!storage || !validateMatchSeries(series)) return false;
  try {
    const text = JSON.stringify(series);
    if (text.length > 1_000_000) return false;
    storage.setItem(MATCH_SERIES_KEY, text);
    return true;
  } catch {
    return false;
  }
}
export function clearMatchSeries(
  storage: SeriesStorage | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    if (storage.removeItem) storage.removeItem(MATCH_SERIES_KEY);
    else storage.setItem(MATCH_SERIES_KEY, "");
    return true;
  } catch {
    return false;
  }
}
