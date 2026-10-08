import { describe, expect, it } from "vitest";
import { createGame, applyAction, getLegalActions } from "../src/game/engine";
import { getObservation } from "../src/game/ai/observation";
import {
  requestFromObservation,
  validateDecision,
} from "../src/game/ai/decisions";
import { preparedFallback } from "../src/game/ai/prepared-fallback";
import { publicExplanation } from "../src/game/ai/presentation";
import { createReplay, replayMatch } from "../src/game/ai/replay";
import { createCombatFixture, combatUnit } from "./fixtures/combat";

const options = { difficulty: "expert" as const, seed: 321 };
describe("worker-independent prepared legal recovery", () => {
  it("replays recorded v1 and v2 actions with v3 while rejecting unknown replay versions", () => {
    const game = createGame({ seed: 44 });
    const action = getLegalActions(game, 0).find(
      (candidate) => candidate.id === "mulligan:0,1",
    )!;
    const replay = createReplay(game);
    replay.decisions.push({ action });
    for (const version of [
      "battlefield-planner-1",
      "battlefield-planner-2",
    ] as const) {
      replay.version = version;
      expect(replayMatch(replay)).toEqual(applyAction(game, action));
    }
    expect(createReplay(game).version).toBe("battlefield-planner-3");
    expect(() =>
      replayMatch({
        ...replay,
        version: "unrecognized" as typeof replay.version,
      }),
    ).toThrow("Unsupported bot replay version");
  });
  it("recovers bot-first mulligan without starting a planner search", () => {
    const game = createGame({ seed: 44, firstPlayer: 1 });
    const observation = getObservation(game, 1),
      request = requestFromObservation(observation)!;
    const result = preparedFallback(
      request,
      observation,
      options,
      "Worker unavailable",
    );
    expect(validateDecision(game, request, result.decision).valid).toBe(true);
    expect(applyAction(game, result.action).priorityPlayer).toBe(0);
    expect(result.trace.nodes).toBe(0);
    expect(result.trace.usedFallback).toBe(true);
    expect(result.trace.error).toBe("Worker unavailable");
    expect(publicExplanation(result)).not.toHaveProperty("error");
  });
  it("completes real mandatory damage and movement choices instead of endlessly toggling a selection", () => {
    const damage = createCombatFixture();
    const observation = getObservation(damage, 0),
      request = requestFromObservation(observation)!;
    const result = preparedFallback(request, observation, options, "Watchdog");
    expect(validateDecision(damage, request, result.decision).valid).toBe(true);
    const applied = applyAction(damage, result.action);
    expect(applied.combat?.remaining[0]).toBeLessThan(
      damage.combat!.remaining[0],
    );
    const game = createGame({ seed: 44 });
    game.phase = "main";
    game.units = [
      { ...combatUnit("mover", 0, 3), location: "base:0", ready: true },
    ];
    const start = getLegalActions(game, 0).find(
      (action) =>
        action.id.startsWith("move-start:") && action.locationId === "field:0",
    )!;
    const moved = applyAction(game, start);
    const movedObservation = getObservation(moved, 0),
      movedRequest = requestFromObservation(movedObservation)!;
    const recovered = preparedFallback(
      movedRequest,
      movedObservation,
      options,
      "Watchdog",
    );
    expect(recovered.action.id).toBe("move-confirm");
    expect(applyAction(moved, recovered.action).pendingMove).toBeNull();
  });
  it("retains stale-response validation and refuses mismatched or missing prepared options", () => {
    const game = createGame({ seed: 44, firstPlayer: 1 });
    const observation = getObservation(game, 1),
      request = requestFromObservation(observation)!;
    const recovered = preparedFallback(
      request,
      observation,
      options,
      "Watchdog",
    );
    expect(
      validateDecision(
        applyAction(game, recovered.action),
        request,
        recovered.decision,
      ).reason,
    ).toBe("Stale decision");
    expect(() =>
      preparedFallback(
        { ...request, observationVersion: "stale" },
        observation,
        options,
        "Watchdog",
      ),
    ).toThrow("Mismatched observation");
    expect(() =>
      preparedFallback(
        { ...request, legalOptions: [] },
        observation,
        options,
        "Watchdog",
      ),
    ).toThrow("missing fallback");
  });
});
