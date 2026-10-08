import { describe, expect, it } from "vitest";
import {
  applyTrainingAction,
  createTrainingPosition,
  trainingActions,
} from "../src/game/training";
import { trainingGuidance } from "../src/game/training-guidance";
import type { TrainingLessonId } from "../src/game/training";
import type { GameState } from "../src/game/types";

function choose(
  id: TrainingLessonId,
  game: GameState,
  test: (action: ReturnType<typeof trainingActions>[number]) => boolean,
) {
  const action = trainingActions(id, game).find(test)!;
  expect(action).toBeTruthy();
  return applyTrainingAction(id, game, action.id);
}
function pass(id: TrainingLessonId, game: GameState) {
  for (let index = 0; index < 12; index++) {
    if (!trainingActions(id, game).some((action) => action.id === "pass"))
      break;
    game = applyTrainingAction(id, game, "pass");
  }
  return game;
}

describe("contextual practice explanations", () => {
  it("keeps grouping, physical movement and control as distinct progress steps", () => {
    let game = createTrainingPosition("movement");
    expect(
      trainingGuidance("movement", game).steps.every((step) => !step.complete),
    ).toBe(true);
    game = choose("movement", game, (action) =>
      action.id.startsWith("move-start:"),
    );
    expect(trainingGuidance("movement", game).hint).toContain(
      "Add the other unit",
    );
    expect(
      trainingGuidance("movement", game).steps.map((step) => step.complete),
    ).toEqual([true, false, false, false]);
    const other = game.units.find(
      (unit) => !game.pendingMove!.unitIds.includes(unit.id),
    )!;
    game = applyTrainingAction("movement", game, `move-toggle:${other.id}`);
    expect(trainingGuidance("movement", game).hint).toContain(
      "Confirm movement",
    );
    expect(
      trainingGuidance("movement", game).steps.map((step) => step.complete),
    ).toEqual([true, true, false, false]);
    game = applyTrainingAction("movement", game, "move-confirm");
    expect(
      trainingGuidance("movement", game).steps.map((step) => step.complete),
    ).toEqual([true, true, true, false]);
    game = pass("movement", game);
    expect(
      trainingGuidance("movement", game).steps.every((step) => step.complete),
    ).toBe(true);
  });
  it("identifies a premature single-unit move and a missed counter window with an actionable undo hint", () => {
    let movement = createTrainingPosition("movement");
    movement = choose("movement", movement, (action) =>
      action.id.startsWith("move-start:"),
    );
    movement = applyTrainingAction("movement", movement, "move-confirm");
    expect(trainingGuidance("movement", movement).retry).toContain(
      "Only one unit moved",
    );
    const before = createTrainingPosition("reaction");
    const failed = pass("reaction", before);
    expect(trainingGuidance("reaction", failed).retry).toContain(
      "Undo the pass",
    );
    expect(trainingGuidance("reaction", before).retry).toBeUndefined();
    expect(trainingGuidance("reaction", before).hint).toContain(
      "before passing",
    );
  });
  it("matches the engine's lethal assignments, including existing damage and prevention, in either legal order", () => {
    for (const first of ["practice-shielded", "practice-defender"]) {
      let game = createTrainingPosition("damage");
      const guidance = trainingGuidance("damage", game);
      expect(
        guidance.damage?.map((target) => [
          target.damage,
          target.prevention,
          target.lethal,
        ]),
      ).toEqual([
        [0, 2, 6],
        [1, 0, 2],
      ]);
      for (const action of trainingActions("damage", game)) {
        if (action.targetId) {
          const target = game.units.find(
            (unit) => unit.id === action.targetId,
          )!;
          expect(action.amount).toBe(
            guidance.damage!.find((row) => row.cardId === target.cardId)!
              .lethal,
          );
        }
      }
      game = choose("damage", game, (action) => action.targetId === first);
      expect(trainingGuidance("damage", game).hint).toContain(
        "remaining damage",
      );
      expect(
        trainingGuidance("damage", game).damage?.reduce(
          (sum, target) => sum + target.assigned,
          0,
        ),
      ).toBe(first === "practice-shielded" ? 6 : 2);
      game = choose("damage", game, (action) => action.targetId !== first);
      expect(
        trainingGuidance("damage", game).steps.every((step) => step.complete),
      ).toBe(true);
    }
  });
  it("guides a local Hidden trigger without copying private enemy card identities into feedback", () => {
    let game = createTrainingPosition("hidden");
    const initial = trainingGuidance("hidden", game);
    expect(JSON.stringify(initial)).not.toContain("ogn-199-298");
    game = choose(
      "hidden",
      game,
      (action) => action.sourceId === "hidden:practice-own-hidden",
    );
    expect(trainingGuidance("hidden", game).hint).toContain(
      "sharing Blastcone Fae's battlefield",
    );
    expect(
      trainingGuidance("hidden", game).steps.map((step) => step.complete),
    ).toEqual([true, false, false]);
    game = choose(
      "hidden",
      game,
      (action) => action.targetId === "practice-hidden-target",
    );
    game = pass("hidden", game);
    expect(
      trainingGuidance("hidden", game).steps.every((step) => step.complete),
    ).toBe(true);
  });
});
