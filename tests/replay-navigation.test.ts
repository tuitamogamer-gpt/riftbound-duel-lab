import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import { createReplay } from "../src/game/ai/replay";
import { createTrainingPosition } from "../src/game/training";
import {
  buildMatchTimeline,
  parseCompletedMatch,
} from "../src/game/match-history";
import {
  adjacentMoment,
  replayMoves,
  replayTurns,
} from "../src/game/replay-navigation";

function timeline() {
  let game = createTrainingPosition("hold");
  game.players[0].hand = ["ogn-049-298"];
  game.players[1].hand = ["ogn-009-298"];
  game.hidden = [
    {
      id: "private-enemy",
      owner: 1,
      cardId: "ogn-199-298",
      location: "field:1",
      hiddenTurn: 4,
    },
  ];
  const replay = createReplay(game);
  for (let index = 0; index < 2; index++) {
    const action = getLegalActions(game, game.priorityPlayer).find(
      (action) => action.id === "end-turn",
    )!;
    replay.decisions.push({ action });
    game = applyAction(game, action);
    replay.finalRevision = game.revision!;
  }
  return buildMatchTimeline(parseCompletedMatch(JSON.stringify(replay)));
}

describe("public replay navigation", () => {
  it("covers every observed frame with contiguous turn ranges", () => {
    const frames = timeline();
    const turns = replayTurns(frames);
    expect(turns.map((turn) => turn.turn)).toEqual([5, 6, 7]);
    expect(turns.map((turn) => turn.player)).toEqual([0, 1, 0]);
    expect(
      turns.flatMap((turn) =>
        Array.from(
          { length: turn.lastFrame - turn.firstFrame + 1 },
          (_, index) => index + turn.firstFrame,
        ),
      ),
    ).toEqual(frames.map((_, index) => index));
  });
  it("groups stepped effects under their actual decision without modifying frames or exposing private cards", () => {
    const frames = timeline();
    const before = JSON.stringify(frames);
    const moves = replayMoves(frames);
    expect(moves).toHaveLength(2);
    expect(moves.map((move) => move.actor)).toEqual([0, 1]);
    expect(moves[1].moments.some((moment) => moment.kind === "hold")).toBe(
      true,
    );
    expect(moves[1].moments.some((moment) => moment.kind === "victory")).toBe(
      true,
    );
    expect(JSON.stringify(moves)).not.toContain("ogn-199-298");
    expect(JSON.stringify(moves)).not.toContain("Hextech Ray");
    moves[1].moments.push({ kind: "death", label: "external change" });
    expect(JSON.stringify(frames)).toBe(before);
  });
  it("finds the strictly previous and next public moment and stops at the ends", () => {
    const frames = timeline();
    const first = adjacentMoment(frames, 0, 1)!;
    expect(first).toBeGreaterThan(0);
    expect(frames[first].moments.length).toBeGreaterThan(0);
    expect(adjacentMoment(frames, first, -1)).toBeUndefined();
    const last = frames
      .map((frame, index) => (frame.moments.length ? index : -1))
      .filter((index) => index >= 0)
      .at(-1)!;
    expect(adjacentMoment(frames, last, 1)).toBeUndefined();
    expect(adjacentMoment([], 0, -1)).toBeUndefined();
    expect(replayTurns([])).toEqual([]);
    expect(replayMoves([])).toEqual([]);
  });
});
