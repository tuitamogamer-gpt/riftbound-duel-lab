import { describe, expect, it } from "vitest";
import { MAX_MAIN_DECK_SIZE, starterDecks } from "../src/data/decks";
import {
  canonicalBuilderId,
  cloneDeckForBuilder,
  builderCount,
} from "../src/game/deck-builder";
import { createGame } from "../src/game/engine";
import {
  clearMatchSeries,
  createSeries,
  loadMatchSeries,
  MATCH_SERIES_KEY,
  prepareNextSeriesGame,
  previousSeriesLoser,
  recordSeriesGame,
  saveMatchSeries,
  seriesGameOptions,
  seriesMatchesGame,
  swapSeriesCards,
  updateSeriesDeck,
  validateMatchSeries,
  validateSeriesDeck,
  type MatchSeries,
  type SeriesStorage,
} from "../src/game/match-series";
import type { PlayerId } from "../src/game/types";

const example = () => {
  const playerDeck = cloneDeckForBuilder(
    starterDecks.find((deck) => deck.id === "annie")!,
  );
  playerDeck.sideboard = [
    { cardId: canonicalBuilderId("ven-097-166"), count: 3 },
  ];
  return createSeries({
    playerDeck,
    botDeck: cloneDeckForBuilder(
      starterDecks.find((deck) => deck.id === "lux")!,
    ),
    firstPlayer: 0,
    seed: 101,
    botSeed: 202,
    botDifficulty: "normal",
    createdAt: 12345,
  });
};
const end = (series: MatchSeries, winner: PlayerId) => {
  const game = createGame(seriesGameOptions(series));
  game.winner = winner;
  game.phase = "ended";
  game.turn = 9;
  game.revision = 67;
  game.players[winner].points = 8;
  game.players[winner === 0 ? 1 : 0].points = 4;
  return game;
};
const memory = (initial: string | null = null): SeriesStorage => {
  let value = initial;
  return {
    getItem: (key) => (key === MATCH_SERIES_KEY ? value : null),
    setItem: (key, next) => {
      if (key === MATCH_SERIES_KEY) value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
};

describe("best-of-three practice series", () => {
  it("creates an isolated series and feeds its exact decks, fields, seed and starting player into the engine", () => {
    const series = example();
    expect(validateMatchSeries(series)).toBe(true);
    const options = seriesGameOptions(series);
    const game = createGame(options);
    expect(game.seed).toBe(101);
    expect(game.currentPlayer).toBe(0);
    expect(seriesMatchesGame(series, game)).toBe(true);
    expect(options.playerDeck).not.toBe(series.decks[0]);
    expect(series.decks[0]).not.toBe(series.originalDecks[0]);
    expect(game.fields.map((field) => field.cardId)).toEqual(
      series.battlefieldIds,
    );
  });

  it("records one result per game, survives reload, and ends at two wins", () => {
    const first = example();
    const game = end(first, 0);
    const one = recordSeriesGame(first, game);
    expect(one.scores).toEqual([1, 0]);
    expect(one.phase).toBe("sideboarding");
    expect(recordSeriesGame(one, { ...game, revision: 99 })).toBe(one);
    const storage = memory();
    expect(saveMatchSeries(one, storage)).toBe(true);
    const restored = loadMatchSeries(storage)!;
    expect(restored).toEqual(one);
    const next = prepareNextSeriesGame(
      restored,
      restored.decks[0],
      previousSeriesLoser(restored),
    );
    expect(next.activeGame.number).toBe(2);
    expect(next.activeGame.firstPlayer).toBe(1);
    expect(next.activeGame.seed).not.toBe(game.seed);
    const finished = recordSeriesGame(next, end(next, 0));
    expect(finished.scores).toEqual([2, 0]);
    expect(finished.winner).toBe(0);
    expect(finished.phase).toBe("complete");
    expect(validateMatchSeries(finished)).toBe(true);
    expect(() => prepareNextSeriesGame(finished, finished.decks[0], 1)).toThrow(
      /between games/,
    );
  });

  it("plays a deciding third game after split wins and defaults to the previous loser", () => {
    let series = example();
    series = recordSeriesGame(series, end(series, 1));
    expect(previousSeriesLoser(series)).toBe(0);
    series = prepareNextSeriesGame(
      series,
      series.decks[0],
      previousSeriesLoser(series),
    );
    expect(createGame(seriesGameOptions(series)).currentPlayer).toBe(0);
    series = recordSeriesGame(series, end(series, 0));
    expect(series.scores).toEqual([1, 1]);
    expect(series.phase).toBe("sideboarding");
    expect(previousSeriesLoser(series)).toBe(1);
    series = prepareNextSeriesGame(series, series.decks[0], 1);
    expect(series.activeGame.number).toBe(3);
    series = recordSeriesGame(series, end(series, 1));
    expect(series.winner).toBe(1);
    expect(series.games).toHaveLength(3);
    expect(validateMatchSeries(series)).toBe(true);
  });

  it("ignores incomplete games, mismatching seeds and unrelated registered decks", () => {
    const series = example();
    expect(
      recordSeriesGame(series, createGame(seriesGameOptions(series))),
    ).toBe(series);
    const wrongSeed = end(series, 0);
    wrongSeed.seed++;
    expect(recordSeriesGame(series, wrongSeed)).toBe(series);
    const wrongDeck = createGame({
      ...seriesGameOptions(series),
      playerDeck: series.decks[1],
    });
    wrongDeck.winner = 0;
    expect(seriesMatchesGame(series, wrongDeck)).toBe(false);
    expect(recordSeriesGame(series, wrongDeck)).toBe(series);
  });

  it("atomically exchanges one main and sideboard copy without changing pool, size or chosen champion", () => {
    const original = example().decks[0];
    const main = original.main[0].cardId;
    const side = original.sideboard![0].cardId;
    const next = swapSeriesCards(original, main, side);
    expect(next.main.find((entry) => entry.cardId === main)?.count).toBe(
      original.main[0].count - 1,
    );
    expect(next.main.find((entry) => entry.cardId === side)?.count).toBe(1);
    expect(builderCount(next.main)).toBe(builderCount(original.main));
    expect(builderCount(next.sideboard!)).toBe(
      builderCount(original.sideboard!),
    );
    expect(next.championId).toBe(original.championId);
    expect(validateSeriesDeck(original, next)).toEqual([]);
    expect(original.sideboard![0].count).toBe(3);
    expect(
      swapSeriesCards(next, side, main).main.find(
        (entry) => entry.cardId === main,
      )?.count,
    ).toBe(original.main[0].count);
  });

  it("retains sideboard exchanges through save/reload and launches the edited registered list", () => {
    const initial = example();
    const between = recordSeriesGame(initial, end(initial, 1));
    const deck = swapSeriesCards(
      between.decks[0],
      between.decks[0].main[0].cardId,
      between.decks[0].sideboard![0].cardId,
    );
    const changed = updateSeriesDeck(between, deck);
    const storage = memory();
    expect(saveMatchSeries(changed, storage)).toBe(true);
    const restored = loadMatchSeries(storage)!;
    const next = prepareNextSeriesGame(restored, restored.decks[0], 0);
    expect(seriesMatchesGame(next, createGame(seriesGameOptions(next)))).toBe(
      true,
    );
    expect(next.decks[0].main).toEqual(deck.main);
    expect(next.decks[1]).toEqual(initial.decks[1]);
  });

  it("blocks added cards, removed cards, count changes and changes to locked deck construction", () => {
    const series = example();
    const between = recordSeriesGame(series, end(series, 0));
    const original = between.decks[0];
    const added = structuredClone(original);
    added.main.push({ cardId: "ven-097-166", count: 1 });
    expect(validateSeriesDeck(original, added)).toContain(
      "Sideboarding must preserve the main deck card count.",
    );
    expect(() => prepareNextSeriesGame(between, added, 1)).toThrow(/preserve/);
    const replaced = structuredClone(original);
    replaced.main[0].count--;
    replaced.main.push({ cardId: "ven-097-166", count: 1 });
    expect(validateSeriesDeck(original, replaced)).toContain(
      "Sideboarding must preserve every registered main and sideboard card.",
    );
    for (const change of [
      (deck: typeof original) => {
        deck.legendId = series.decks[1].legendId;
      },
      (deck: typeof original) => {
        deck.championId = series.decks[1].championId;
      },
      (deck: typeof original) => {
        deck.runes[0].count--;
        deck.runes[1].count++;
      },
      (deck: typeof original) => {
        deck.battlefieldId = "ogn-275-298";
        deck.battlefieldIds = ["ogn-275-298"];
      },
    ]) {
      const invalid = structuredClone(original);
      change(invalid);
      expect(validateSeriesDeck(original, invalid)).toContain(
        "Legend, chosen champion, runes, battlefields and format stay fixed within a series.",
      );
    }
  });

  it("rejects unregistered swap sources and sideboarding while a game is running", () => {
    const series = example();
    expect(() => updateSeriesDeck(series, series.decks[0])).toThrow(
      /between games/,
    );
    expect(() =>
      swapSeriesCards(
        series.decks[0],
        "unknown",
        series.decks[0].sideboard![0].cardId,
      ),
    ).toThrow(/Choose one/);
    expect(() =>
      swapSeriesCards(
        series.decks[0],
        series.decks[0].main[0].cardId,
        "unknown",
      ),
    ).toThrow(/Choose one/);
  });

  it("allows a new valid seed and practice starting-player override, but never reuses a recorded seed", () => {
    const series = example();
    const between = recordSeriesGame(series, end(series, 0));
    expect(() =>
      prepareNextSeriesGame(between, between.decks[0], 1, 101),
    ).toThrow(/new valid seed/);
    const next = prepareNextSeriesGame(between, between.decks[0], 0, 303);
    expect(next.activeGame.seed).toBe(303);
    expect(next.activeGame.firstPlayer).toBe(0);
    expect(validateMatchSeries(next)).toBe(true);
  });

  it("accepts larger legal registered decks up to the shared app limit during reload", () => {
    const series = example();
    for (const deck of [series.originalDecks[0], series.decks[0]])
      deck.main = [{ cardId: "ven-097-166", count: MAX_MAIN_DECK_SIZE - 1 }];
    expect(validateMatchSeries(series)).toBe(true);
    const storage = memory();
    expect(saveMatchSeries(series, storage)).toBe(true);
    expect(builderCount(loadMatchSeries(storage)!.decks[0].main)).toBe(
      MAX_MAIN_DECK_SIZE - 1,
    );
  });

  it("fails closed on corrupted saves, forged scores, duplicate results, invalid card pools and future versions", () => {
    const series = example();
    const between = recordSeriesGame(series, end(series, 0));
    const corruptions = [
      (value: MatchSeries) => {
        value.scores = [2, 0];
      },
      (value: MatchSeries) => {
        value.winner = 0;
      },
      (value: MatchSeries) => {
        value.version = 2 as 1;
      },
      (value: MatchSeries) => {
        value.games.push(value.games[0]);
      },
      (value: MatchSeries) => {
        value.decks[0].main[0].count++;
      },
      (value: MatchSeries) => {
        value.activeGame.number = 3;
      },
      (value: MatchSeries) => {
        value.decks[0].legendId = "unknown";
      },
      (value: MatchSeries) => {
        value.baseSeed = 0;
      },
    ];
    for (const tamper of corruptions) {
      const value = structuredClone(between);
      tamper(value);
      expect(validateMatchSeries(value)).toBe(false);
      expect(loadMatchSeries(memory(JSON.stringify(value)))).toBeNull();
    }
    expect(loadMatchSeries(memory("{broken"))).toBeNull();
    expect(loadMatchSeries(memory("x".repeat(1_000_001)))).toBeNull();
  });

  it("reports storage failure, clears only its own key, and never writes an invalid series", () => {
    const series = example();
    const storage = memory();
    expect(saveMatchSeries(series, storage)).toBe(true);
    expect(clearMatchSeries(storage)).toBe(true);
    expect(loadMatchSeries(storage)).toBeNull();
    let writes = 0;
    const failing: SeriesStorage = {
      getItem: () => null,
      setItem: () => {
        writes++;
        throw new Error("quota");
      },
    };
    expect(saveMatchSeries(series, failing)).toBe(false);
    expect(writes).toBe(1);
    const invalid = structuredClone(series);
    invalid.scores = [1, 0];
    expect(saveMatchSeries(invalid, failing)).toBe(false);
    expect(writes).toBe(1);
    expect(
      loadMatchSeries({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {},
      }),
    ).toBeNull();
  });
});
