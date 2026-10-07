import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import {
  applyTrainingAction,
  createTrainingPosition,
  parseTrainingProgress,
  readTrainingProgress,
  saveTrainingProgress,
  trainingActions,
  trainingComplete,
  trainingLessons,
  trainingPublicPosition,
} from "../src/game/training";
import { validState } from "../src/persistence";
import type { TrainingLessonId } from "../src/game/training";
import type { GameState } from "../src/game/types";

function choose(
  id: TrainingLessonId,
  game: GameState,
  predicate: (action: ReturnType<typeof trainingActions>[number]) => boolean,
) {
  const action = trainingActions(id, game).find(predicate);
  expect(action, `Missing ${id} action`).toBeDefined();
  return applyTrainingAction(id, game, action!.id);
}

function passUntil(id: TrainingLessonId, game: GameState) {
  for (let step = 0; step < 12 && !trainingComplete(id, game); step++) {
    const pass = trainingActions(id, game).find(
      (action) => action.id === "pass",
    );
    if (!pass) break;
    game = applyTrainingAction(id, game, pass.id);
  }
  return game;
}

describe("interactive training uses the duel engine", () => {
  it("starts six independent valid positions with achievable legal actions", () => {
    for (const lesson of trainingLessons) {
      const game = createTrainingPosition(lesson.id);
      expect(validState(game), lesson.id).toBe(true);
      expect(trainingComplete(lesson.id, game), lesson.id).toBe(false);
      expect(
        trainingActions(lesson.id, game).length,
        lesson.id,
      ).toBeGreaterThan(0);
      expect(
        trainingActions(lesson.id, game).every((action) =>
          getLegalActions(game, 0).some((legal) => legal.id === action.id),
        ),
        lesson.id,
      ).toBe(true);
    }
  });

  it("pays for deployment and requires an actual unit in the base", () => {
    const before = createTrainingPosition("deploy");
    const game = choose(
      "deploy",
      before,
      (action) => action.category === "play" && action.locationId === "base:0",
    );
    expect(trainingComplete("deploy", game)).toBe(true);
    expect(game.players[0].energy).toBeLessThan(before.players[0].energy);
    expect(game.units[0].ready).toBe(false);
    expect(before.units).toEqual([]);
    expect(createTrainingPosition("deploy").players[0].hand).toEqual(
      before.players[0].hand,
    );
  });

  it("requires both movers and completed conquest, not a proposed group", () => {
    const before = createTrainingPosition("movement");
    let game = choose(
      "movement",
      before,
      (action) =>
        action.id.startsWith("move-start:") &&
        action.sourceId === "practice-mover-a",
    );
    game = choose(
      "movement",
      game,
      (action) => action.id === "move-toggle:practice-mover-b",
    );
    expect(trainingComplete("movement", game)).toBe(false);
    expect(game.units).toEqual(before.units);
    game = applyTrainingAction("movement", game, "move-confirm");
    expect(trainingComplete("movement", game)).toBe(false);
    game = passUntil("movement", game);
    expect(trainingComplete("movement", game)).toBe(true);
    expect(game.players[0].points).toBe(1);
  });

  it("does not award movement completion for moving only one unit", () => {
    let game = createTrainingPosition("movement");
    game = choose("movement", game, (action) =>
      action.id.startsWith("move-start:"),
    );
    game = applyTrainingAction("movement", game, "move-confirm");
    game = passUntil("movement", game);
    expect(game.players[0].points).toBe(1);
    expect(trainingComplete("movement", game)).toBe(false);
  });

  it("resolves Wind Wall and checks that the threatened unit took no damage", () => {
    let game = createTrainingPosition("reaction");
    const spellId = game.stack[0].id;
    game = choose(
      "reaction",
      game,
      (action) =>
        action.cardId === "ogn-064-298" && action.targetId === spellId,
    );
    expect(trainingComplete("reaction", game)).toBe(false);
    game = passUntil("reaction", game);
    expect(trainingComplete("reaction", game)).toBe(true);
  });

  it("recognizes passing instead of countering as an unsuccessful attempt", () => {
    const game = passUntil("reaction", createTrainingPosition("reaction"));
    expect(trainingComplete("reaction", game)).toBe(false);
    expect(
      game.units.find((unit) => unit.id === "practice-protected")?.damage,
    ).toBeGreaterThan(0);
  });

  it("keeps Hidden faces private and enforces the local trigger target", () => {
    let game = createTrainingPosition("hidden");
    const publicGame = trainingPublicPosition(game);
    expect(
      publicGame.hidden?.find((hidden) => hidden.owner === 1)?.cardId,
    ).toBe("hidden");
    expect(publicGame.players[1].hand).toEqual([]);
    game = choose(
      "hidden",
      game,
      (action) => action.sourceId === "hidden:practice-own-hidden",
    );
    expect(game.pendingChoice?.kind).toBe("trigger");
    const legalTargets = getLegalActions(game, 0)
      .filter((action) => action.targetId)
      .map((action) => action.targetId);
    expect(legalTargets).toContain("practice-hidden-target");
    expect(legalTargets).not.toContain("practice-distant-target");
    game = choose(
      "hidden",
      game,
      (action) => action.targetId === "practice-hidden-target",
    );
    game = passUntil("hidden", game);
    expect(trainingComplete("hidden", game)).toBe(true);
    expect(game.hidden?.find((hidden) => hidden.owner === 1)?.cardId).toBe(
      "ogn-199-298",
    );
  });

  it("assigns 6 plus 2 through the engine and resolves simultaneous combat", () => {
    let game = createTrainingPosition("damage");
    const shielded = trainingActions("damage", game).find(
      (action) => action.targetId === "practice-shielded",
    )!;
    expect(shielded.amount).toBe(6);
    game = applyTrainingAction("damage", game, shielded.id);
    expect(game.combat?.remaining[0]).toBe(2);
    expect(trainingComplete("damage", game)).toBe(false);
    expect(game.units).toHaveLength(3);
    game = choose(
      "damage",
      game,
      (action) => action.targetId === "practice-defender",
    );
    expect(trainingComplete("damage", game)).toBe(true);
    expect(
      game.units.find((unit) => unit.id === "practice-attacker")?.damage,
    ).toBe(0);
    expect(
      game.log.some(
        (entry) =>
          entry.text ===
          "Both sides deal their assigned combat damage simultaneously.",
      ),
    ).toBe(true);
  });

  it("wins by a real next-turn hold score", () => {
    const before = createTrainingPosition("hold");
    const game = applyTrainingAction("hold", before, "end-turn");
    expect(trainingComplete("hold", game)).toBe(true);
    expect(game.winner).toBe(0);
    expect(game.players[0].points).toBe(8);
    expect(game.turn).toBe(7);
    expect(game.players[1].fatigue).toBe(0);
    expect(before.winner).toBeNull();
    expect(before.turn).toBe(5);
  });

  it("rejects stale or unrelated actions and replay starts from an independent position", () => {
    const game = createTrainingPosition("movement");
    const serialized = JSON.stringify(game);
    expect(() => applyTrainingAction("movement", game, "end-turn")).toThrow();
    expect(JSON.stringify(game)).toBe(serialized);
    const action = trainingActions("movement", game)[0];
    expect(JSON.stringify(applyAction(game, action))).not.toBe(serialized);
    expect(JSON.stringify(createTrainingPosition("movement"))).toBe(serialized);
  });
});

describe("training progress storage", () => {
  it("accepts only known unique completed lessons in the current schema", () => {
    expect(
      parseTrainingProgress(
        JSON.stringify({
          version: 1,
          completed: ["deploy", "movement", "deploy", "bogus", 42],
        }),
      ),
    ).toEqual(["deploy", "movement"]);
    expect(parseTrainingProgress("not json")).toEqual([]);
    expect(
      parseTrainingProgress(
        JSON.stringify({ version: 99, completed: ["deploy"] }),
      ),
    ).toEqual([]);
    expect(
      parseTrainingProgress(
        JSON.stringify({ version: 1, completed: "deploy" }),
      ),
    ).toEqual([]);
  });
  it("works when browser storage is unavailable", () => {
    expect(
      readTrainingProgress({
        getItem: () => {
          throw new Error("storage denied");
        },
      }),
    ).toEqual([]);
    expect(
      saveTrainingProgress(["deploy"], {
        setItem: () => {
          throw new Error("storage denied");
        },
      }),
    ).toBe(false);
  });
});
