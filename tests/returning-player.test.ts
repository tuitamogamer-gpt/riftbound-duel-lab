import { describe, expect, it } from "vitest";
import { decks } from "../src/data/decks";
import { createGame } from "../src/game/engine";
import {
  LOBBY_PREFERENCES_KEY,
  readLobbyPreferences,
  saveLobbyPreferences,
} from "../src/game/lobby-preferences";
import {
  defaultHistoryFilters,
  filterMatchHistory,
} from "../src/game/history-search";
import type { CompletedMatch } from "../src/game/match-history";
import { battlefieldChoices } from "../src/game/battlefield-selection";

const savedGame = () =>
  createGame({
    seed: 700,
    playerDeck: decks[3],
    botDeck: decks[4],
    botDifficulty: "hard",
  });
const read = (value: unknown, saved = savedGame()) =>
  readLobbyPreferences(decks, saved, { getItem: () => JSON.stringify(value) });

describe("returning player setup", () => {
  it("restores all choices independently of the currently saved duel", () => {
    const value = {
      version: 1 as const,
      playerDeck: decks[2].id,
      botDeck: decks[5].id,
      difficulty: "expert" as const,
      firstPlayerChoice: "bot" as const,
      matchFormat: "bo3" as const,
      fieldChoices: {
        [`player:${decks[2].id}`]: battlefieldChoices[2].id,
        [`bot:${decks[5].id}`]: battlefieldChoices[3].id,
      },
    };
    const memory = new Map<string, string>();
    expect(
      saveLobbyPreferences(value, {
        setItem: (key, text) => memory.set(key, text),
      }),
    ).toBe(true);
    expect(memory.has(LOBBY_PREFERENCES_KEY)).toBe(true);
    const game = savedGame(),
      before = structuredClone(game);
    expect(
      readLobbyPreferences(decks, game, {
        getItem: (key) => memory.get(key) ?? null,
      }),
    ).toEqual(value);
    expect(game).toEqual(before);
  });
  it("uses a returning player's saved matchup when no setup has been stored yet", () => {
    const game = savedGame();
    const setup = read(null, game);
    expect(setup.playerDeck).toBe(game.players[0].deckId);
    expect(setup.botDeck).toBe(game.players[1].deckId);
    expect(setup.difficulty).toBe("hard");
    expect(setup.fieldChoices[`player:${game.players[0].deckId}`]).toBe(
      game.fields[0].cardId,
    );
    expect(setup.fieldChoices[`bot:${game.players[1].deckId}`]).toBe(
      game.fields[1].cardId,
    );
    expect(setup.matchFormat).toBe("single");
  });
  it("discards deleted decks, non-battlefield cards and invalid enum values", () => {
    const setup = read({
      version: 1,
      playerDeck: "deleted",
      botDeck: 99,
      difficulty: "impossible",
      firstPlayerChoice: "anyone",
      matchFormat: "bo99",
      fieldChoices: {
        "player:deleted": battlefieldChoices[0].id,
        [`bot:${decks[0].id}`]: decks[0].championId,
        [`player:${decks[1].id}`]: battlefieldChoices[4].id,
        arbitrary: battlefieldChoices[0].id,
      },
    });
    expect(setup.playerDeck).toBe(decks[3].id);
    expect(setup.botDeck).toBe(decks[4].id);
    expect(setup.difficulty).toBe("hard");
    expect(setup.firstPlayerChoice).toBe("random");
    expect(read({ version: 1, difficulty: ["expert"] }).difficulty).toBe(
      "hard",
    );
    expect(setup.matchFormat).toBe("single");
    expect(setup.fieldChoices).toEqual({
      [`player:${decks[1].id}`]: battlefieldChoices[4].id,
    });
  });
  it("preserves imported deck choices while they exist and falls back after removal", () => {
    const imported = {
      ...decks[0],
      id: "import-custom",
      source: "Imported deck" as const,
    };
    const storage = {
      getItem: () => JSON.stringify({ version: 1, playerDeck: imported.id }),
    };
    expect(
      readLobbyPreferences([...decks, imported], null, storage).playerDeck,
    ).toBe(imported.id);
    expect(readLobbyPreferences(decks, null, storage).playerDeck).toBe(
      decks[0].id,
    );
  });
  it("survives corrupt and unavailable storage without replacing the saved duel", () => {
    const game = savedGame(),
      before = structuredClone(game);
    for (const raw of ["invalid", "null", "[]", '{"version":8}'])
      expect(
        readLobbyPreferences(decks, game, { getItem: () => raw }).playerDeck,
      ).toBe(decks[3].id);
    const unavailable = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("full");
      },
    };
    const setup = readLobbyPreferences(decks, game, unavailable);
    expect(saveLobbyPreferences(setup, unavailable)).toBe(false);
    expect(game).toEqual(before);
  });
});

const entry = (
  id: string,
  player: string,
  opponent: string,
  winner: 0 | 1,
  turns: number,
  day: number,
) =>
  ({
    id,
    playerDeckName: player,
    opponentDeckName: opponent,
    winner,
    turns,
    endedAt: `2026-10-${day}T12:00:00Z`,
    get replay(): CompletedMatch["replay"] {
      throw Error("Search must not read or simulate a replay");
    },
  }) as CompletedMatch;
const archive = [
  entry("a", "Vi · Unleashed", "Viktor · Origins", 0, 12, 12),
  entry("b", "Shén · Vendetta", "Jinx · Origins", 1, 9, 15),
  entry("c", "Vi · Unleashed", "Lux", 1, 6, 13),
];

describe("saved match discovery", () => {
  it("matches names across both players, independent of case and accents", () => {
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        query: " VI  viktor ",
      }).map((e) => e.id),
    ).toEqual(["a"]);
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        query: "shen",
      }).map((e) => e.id),
    ).toEqual(["b"]);
  });
  it("combines result and name filters", () => {
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        query: "vi",
        result: "wins",
      }).map((e) => e.id),
    ).toEqual(["a"]);
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        query: "vi",
        result: "losses",
      }).map((e) => e.id),
    ).toEqual(["c"]);
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        query: "unknown",
      }),
    ).toEqual([]);
  });
  it("sorts without changing the archive or touching replay data", () => {
    expect(
      filterMatchHistory(archive, defaultHistoryFilters).map((e) => e.id),
    ).toEqual(["b", "c", "a"]);
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        order: "oldest",
      }).map((e) => e.id),
    ).toEqual(["a", "c", "b"]);
    expect(
      filterMatchHistory(archive, {
        ...defaultHistoryFilters,
        order: "shortest",
      }).map((e) => e.id),
    ).toEqual(["c", "b", "a"]);
    expect(archive.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
