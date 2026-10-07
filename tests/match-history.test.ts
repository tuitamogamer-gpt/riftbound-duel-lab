import { describe, expect, it } from "vitest";
import {
  applyAction,
  getGroupMoveAction,
  getLegalActions,
} from "../src/game/engine";
import { createReplay } from "../src/game/ai/replay";
import { createTrainingPosition } from "../src/game/training";
import {
  buildMatchTimeline,
  clearMatchHistory,
  deleteCompletedMatch,
  historyCompatibility,
  historyDeckStats,
  importCompletedMatch,
  MATCH_HISTORY_KEY,
  MAX_HISTORY_MATCHES,
  parseCompletedMatch,
  readMatchHistory,
  validateCompletedReplay,
  writeCompletedMatch,
} from "../src/game/match-history";
import type { BotReplay } from "../src/game/ai/replay";
import type { GameState } from "../src/game/types";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}
function completed(seed = 123) {
  let game = createTrainingPosition("hold");
  game.seed = seed;
  const replay = createReplay(game);
  for (const id of ["end-turn", "end-turn"]) {
    const action = getLegalActions(game, game.priorityPlayer).find(
      (action) => action.id === id,
    )!;
    replay.decisions.push({ action });
    game = applyAction(game, action);
    replay.finalRevision = game.revision!;
  }
  expect(game.winner).toBe(0);
  return { replay, final: game };
}
function add(replay: BotReplay, game: GameState, id: string) {
  const action = getLegalActions(game, game.priorityPlayer).find(
    (action) => action.id === id,
  )!;
  replay.decisions.push({ action });
  const next = applyAction(game, action);
  replay.finalRevision = next.revision!;
  return next;
}

describe("completed match replay validation", () => {
  it("reconstructs the actual winner, points and decisions instead of trusting metadata", () => {
    const { replay, final } = completed();
    const entry = parseCompletedMatch(
      JSON.stringify({
        schema: 1,
        winner: 1,
        points: [0, 99],
        replay,
        playerDeckName: "Practice deck",
        opponentDeckName: "Other deck",
        endedAt: "2026-10-07T19:00:00Z",
      }),
    );
    expect(entry.winner).toBe(0);
    expect(entry.points).toEqual([8, 0]);
    expect(entry.turns).toBe(7);
    expect(entry.decisionCount).toBe(2);
    expect(validateCompletedReplay(entry.replay).final).toEqual(final);
  });
  it("supports known planner versions while rejecting unknown future versions", () => {
    const { replay } = completed();
    expect(
      parseCompletedMatch(
        JSON.stringify({ ...replay, version: "battlefield-planner-1" }),
      ).winner,
    ).toBe(0);
    expect(
      parseCompletedMatch(
        JSON.stringify({ ...replay, version: "battlefield-planner-2" }),
      ).winner,
    ).toBe(0);
    expect(() =>
      parseCompletedMatch(
        JSON.stringify({ ...replay, version: "battlefield-planner-999" }),
      ),
    ).toThrow();
  });
  it("rejects incomplete games, invalid revisions, illegal actions and wrong actors", () => {
    const { replay } = completed();
    expect(() =>
      validateCompletedReplay({
        ...replay,
        decisions: replay.decisions.slice(0, 1),
        finalRevision: replay.finalRevision - 1,
      }),
    ).toThrow("completed");
    expect(() =>
      validateCompletedReplay({
        ...replay,
        finalRevision: replay.finalRevision + 1,
      }),
    ).toThrow("revision");
    const illegal = structuredClone(replay);
    illegal.decisions[0].action.id = "play:bogus";
    expect(() => validateCompletedReplay(illegal)).toThrow("illegal");
    const wrongActor = structuredClone(replay);
    wrongActor.decisions[0].action.player = 1;
    expect(() => validateCompletedReplay(wrongActor)).toThrow("out-of-turn");
  });
  it("rejects unknown catalog cards and malformed or oversized files", () => {
    const { replay } = completed();
    replay.initial.players[0].hand = ["not-a-card"];
    expect(() => validateCompletedReplay(replay)).toThrow();
    expect(() => parseCompletedMatch("not json")).toThrow("JSON");
    expect(() => parseCompletedMatch(" ".repeat(8 * 1024 * 1024 + 1))).toThrow(
      "large",
    );
  });
  it("reconstructs action captions and card declarations from their legal IDs", () => {
    const { replay } = completed();
    replay.decisions[0].action.label = "Forged private face";
    replay.decisions[0].action.cardId = "not-a-card";
    const checked = validateCompletedReplay(replay);
    expect(checked.replay.decisions[0].action.label).toBe("End turn");
    expect(checked.replay.decisions[0].action.cardId).toBeUndefined();
  });
  it("validates direct bot group moves and retains an exact payment order", () => {
    let game = createTrainingPosition("movement");
    game.players[0].points = 7;
    const replay = createReplay(game);
    const group = getGroupMoveAction(
      game,
      0,
      game.units.map((unit) => unit.id),
      "field:0",
    )!;
    group.paymentRuneOrder = game.players[0].runes
      .map((rune) => rune.id)
      .reverse();
    replay.decisions.push({ action: group });
    game = applyAction(game, group);
    replay.finalRevision = game.revision!;
    game = add(replay, game, "pass");
    game = add(replay, game, "pass");
    game = add(replay, game, "end-turn");
    game = add(replay, game, "end-turn");
    expect(game.winner).toBe(0);
    expect(validateCompletedReplay(replay).final).toEqual(game);
    const invalid = structuredClone(replay);
    invalid.decisions[0].action.paymentRuneOrder = ["bogus"];
    expect(() => validateCompletedReplay(invalid)).toThrow();
  });
});

describe("bounded atomic match history", () => {
  it("archives completed matches once and computes per-deck results", () => {
    const target = storage();
    const first = completed(1);
    const second = completed(2);
    expect(
      writeCompletedMatch(
        first.replay,
        { playerDeckName: "Annie", final: first.final },
        target,
      ).saved,
    ).toBe(true);
    expect(
      writeCompletedMatch(
        first.replay,
        { playerDeckName: "Annie", final: first.final },
        target,
      ).entries,
    ).toHaveLength(1);
    expect(
      writeCompletedMatch(second.replay, { playerDeckName: "Annie" }, target)
        .entries,
    ).toHaveLength(2);
    const loaded = readMatchHistory(target);
    expect(loaded.error).toBeUndefined();
    expect(historyDeckStats(loaded.entries)).toEqual([
      { id: "annie", deck: "Annie", matches: 2, wins: 2, turns: 14 },
    ]);
  });
  it("keeps different registered decks separate even when their names match", () => {
    const one = parseCompletedMatch(JSON.stringify(completed(1).replay));
    const two = {
      ...parseCompletedMatch(JSON.stringify(completed(2).replay)),
      playerDeckId: "custom-annie",
    };
    expect(historyDeckStats([one, two])).toHaveLength(2);
  });
  it("keeps prior archive bytes when quota blocks a save", () => {
    const target = storage();
    const first = completed(1);
    writeCompletedMatch(first.replay, {}, target);
    const before = target.getItem(MATCH_HISTORY_KEY);
    const failed = writeCompletedMatch(
      completed(2).replay,
      {},
      {
        getItem: target.getItem,
        setItem: () => {
          throw new Error("quota");
        },
      },
    );
    expect(failed.saved).toBe(false);
    expect(failed.error).toContain("Previous entries were kept");
    expect(target.getItem(MATCH_HISTORY_KEY)).toBe(before);
  });
  it("rejects a mismatched trusted live ending and preserves unreadable archives", () => {
    const first = completed(1);
    const other = completed(2);
    expect(
      writeCompletedMatch(first.replay, { final: other.final }, storage())
        .saved,
    ).toBe(false);
    const target = storage();
    target.setItem(MATCH_HISTORY_KEY, "unreadable prior bytes");
    expect(writeCompletedMatch(first.replay, {}, target).saved).toBe(false);
    expect(target.getItem(MATCH_HISTORY_KEY)).toBe("unreadable prior bytes");
    expect(readMatchHistory(target).error).toBeTruthy();
  });
  it("bounds the archive, deletes one entry and clears only when invoked", () => {
    const target = storage();
    for (let seed = 1; seed <= MAX_HISTORY_MATCHES + 2; seed++) {
      const match = completed(seed);
      expect(
        writeCompletedMatch(match.replay, { final: match.final }, target).saved,
      ).toBe(true);
    }
    const history = readMatchHistory(target).entries;
    expect(history).toHaveLength(MAX_HISTORY_MATCHES);
    expect(deleteCompletedMatch(history[0].id, target).entries).toHaveLength(
      MAX_HISTORY_MATCHES - 1,
    );
    expect(clearMatchHistory(target).entries).toEqual([]);
  });
  it("restores exported backups atomically and rejects a malformed entry without partial import", () => {
    const target = storage();
    writeCompletedMatch(completed(1).replay, {}, target);
    writeCompletedMatch(completed(2).replay, {}, target);
    const backup = target.getItem(MATCH_HISTORY_KEY)!;
    const restored = storage();
    expect(importCompletedMatch(backup, restored).entries).toHaveLength(2);
    expect(importCompletedMatch(backup, restored).entries).toHaveLength(2);
    const before = restored.getItem(MATCH_HISTORY_KEY);
    const corrupt = JSON.parse(backup);
    corrupt.entries[1].replay.finalRevision++;
    expect(importCompletedMatch(JSON.stringify(corrupt), restored).saved).toBe(
      false,
    );
    expect(restored.getItem(MATCH_HISTORY_KEY)).toBe(before);
  });
});

describe("public replay frame analysis", () => {
  it("uses each perspective's legitimate hand and Hidden knowledge at that frame", () => {
    let game = createTrainingPosition("hold");
    game.players[0].hand = ["ogn-049-298"];
    game.players[1].hand = ["ogn-009-298"];
    game.hidden = [
      {
        id: "private-own",
        owner: 0,
        cardId: "ogn-097-298",
        location: "field:0",
        hiddenTurn: 4,
      },
      {
        id: "private-opponent",
        owner: 1,
        cardId: "ogn-199-298",
        location: "field:1",
        hiddenTurn: 4,
      },
    ];
    const replay = createReplay(game);
    game = add(replay, game, "end-turn");
    game = add(replay, game, "end-turn");
    const entry = parseCompletedMatch(JSON.stringify(replay));
    const frames = buildMatchTimeline(entry);
    expect(frames[0].views[0].players[1].hand).toEqual([]);
    expect(frames[0].views[0].players[0].hand).toEqual(["ogn-049-298"]);
    expect(
      frames[0].views[0].hidden?.find((hidden) => hidden.owner === 1)?.cardId,
    ).toBe("unknown");
    expect(frames[0].views[1].players[1].hand).toEqual(["ogn-009-298"]);
    expect(
      frames[0].views[1].hidden?.find((hidden) => hidden.owner === 0)?.cardId,
    ).toBe("unknown");
    expect(frames.at(-1)?.views[0].winner).toBe(0);
    expect(
      frames.some((frame) =>
        frame.moments.some((moment) => moment.kind === "hold"),
      ),
    ).toBe(true);
    expect(
      frames.some((frame) =>
        frame.moments.some((moment) => moment.kind === "victory"),
      ),
    ).toBe(true);
  });
  it("marks alternate rules and catalog data explicitly", () => {
    const entry = parseCompletedMatch(JSON.stringify(completed().replay));
    expect(historyCompatibility(entry)).toEqual([]);
    expect(
      historyCompatibility({
        ...entry,
        rulesVersion: "older",
        cardDataVersion: "older",
      }),
    ).toHaveLength(2);
  });
});
