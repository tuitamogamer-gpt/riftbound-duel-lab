import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyActionStepped,
  getCombatPower,
  getCombatPreview,
  getLegalActions,
  getMight,
  type StepFrame,
} from "../src/game/engine";
import type { GameState } from "../src/game/types";
import { parseSession, validState } from "../src/persistence";
import type { Review } from "../src/components/StepFlow";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

function assign(s: GameState, targetId: string) {
  const action = getLegalActions(s, s.priorityPlayer).find(
    (a) => a.targetId === targetId,
  );
  expect(action, `No assignment to ${targetId}`).toBeDefined();
  const result = applyActionStepped(s, action!);
  // Reviewing a combat must never change the underlying rules or random state.
  expect(result.state).toEqual(applyAction(s, action!));
  return result;
}

function resolveFixture(firstTarget = "defender-guard") {
  let s = createCombatFixture();
  const frames: StepFrame[] = [];
  for (const target of [
    firstTarget,
    firstTarget === "defender-guard" ? "defender-front" : "defender-guard",
    "attacker-front",
    "attacker-guard",
  ]) {
    const result = assign(s, target);
    frames.push(...result.frames);
    s = result.state;
  }
  return { state: s, frames };
}

function resolutionReview(): Review {
  let before = createCombatFixture();
  for (const target of ["defender-guard", "defender-front", "attacker-front"])
    before = assign(before, target).state;
  const action = getLegalActions(before, before.priorityPlayer).find(
    (a) => a.targetId === "attacker-guard",
  )!;
  const result = applyActionStepped(before, action);
  return {
    before,
    final: result.state,
    frames: result.frames,
    index: 0,
    action,
  };
}

describe("combat presentation follows the real simulation", () => {
  it("provides a valid fixture with two legal target choices and genuine alternate casualties", () => {
    const s = createCombatFixture();
    expect(validState(s)).toBe(true);
    expect(getLegalActions(s, 0).map((a) => a.targetId)).toEqual([
      "defender-guard",
      "defender-front",
    ]);
    const guardFirst = resolveFixture();
    const frontFirst = resolveFixture("defender-front");
    expect(guardFirst.state.units.map((u) => u.id)).toContain("defender-front");
    expect(guardFirst.state.units.map((u) => u.id)).not.toContain(
      "defender-guard",
    );
    expect(frontFirst.state.units.map((u) => u.id)).toContain("defender-guard");
    expect(frontFirst.state.units.map((u) => u.id)).not.toContain(
      "defender-front",
    );
  });

  it("captures simultaneous hits before casualties, including prevention and existing wounds", () => {
    const { state, frames } = resolveFixture();
    const impactIndex = frames.findIndex((f) => f.combat?.stage === "impact");
    const impact = frames[impactIndex];
    expect(impact.state.units).toHaveLength(4);
    expect(impact.combat?.hits).toEqual([
      {
        unitId: "defender-guard",
        cardId: "ogn-088-298",
        owner: 1,
        assigned: 6,
        damageBefore: 0,
        damageAfter: 4,
        prevented: 2,
        might: 4,
      },
      {
        unitId: "defender-front",
        cardId: "ogn-219-298",
        owner: 1,
        assigned: 1,
        damageBefore: 0,
        damageAfter: 1,
        prevented: 0,
        might: 3,
      },
      {
        unitId: "attacker-front",
        cardId: "ogn-049-298",
        owner: 0,
        assigned: 2,
        damageBefore: 2,
        damageAfter: 4,
        prevented: 0,
        might: 4,
      },
      {
        unitId: "attacker-guard",
        cardId: "ogn-175-298",
        owner: 0,
        assigned: 5,
        damageBefore: 0,
        damageAfter: 2,
        prevented: 3,
        might: 3,
      },
    ]);
    expect(
      frames.slice(0, impactIndex).every((f) => f.state.units.length === 4),
    ).toBe(true);
    const result = [...frames]
      .reverse()
      .find((f) => f.combat?.stage === "result")!;
    expect(result.combat?.defeatedIds).toEqual([
      "attacker-front",
      "defender-guard",
    ]);
    expect(result.combat?.recalledIds).toEqual(["attacker-guard"]);
    expect(result.combat?.controller).toBe(1);
    expect(result.combat?.hits).toEqual(impact.combat?.hits);
    expect(result.combat?.preview.units).toHaveLength(4);
    expect(state.units.find((u) => u.id === "attacker-guard")?.location).toBe(
      "base:0",
    );
    expect(state.units.every((u) => u.damage === 0)).toBe(true);
    expect(validState(state)).toBe(true);
  });

  it("uses the same power for previews and assignment totals, including stunned and Shield units", () => {
    const s = createCombatFixture();
    s.phase = "showdown";
    s.combat!.stage = "priority";
    s.units = [
      { ...combatUnit("stunned", 0, 4), stunned: true },
      combatUnit("attacker", 0, 3),
      combatUnit("shield", 1, 3, "ogn-052-298"),
    ];
    s.consecutivePasses = 1;
    const preview = getCombatPreview(s)!;
    expect(preview.total).toEqual([3, 4]);
    expect(preview.units.find((u) => u.unit.id === "stunned")?.power).toBe(0);
    expect(preview.units.find((u) => u.unit.id === "shield")?.might).toBe(4);
    const result = applyActionStepped(s, "pass");
    const assignment = result.frames.find((f) => f.combat?.stage === "assign")!;
    expect(assignment.combat?.preview.total).toEqual(preview.total);
    expect(result.state.combat?.total).toEqual(preview.total);
  });

  it("shows paired restrictions as zero combat power while preserving the unit's Might", () => {
    const s = createCombatFixture();
    const paired = combatUnit(
      "paired",
      0,
      4,
      "ven-129-166--6a518b2837f518eaadf8bb10",
    );
    s.units = [paired, combatUnit("enemy", 1)];
    expect(getMight(s, paired)).toBe(4);
    expect(getCombatPower(s, paired)).toBe(0);
    s.units.push(combatUnit("ally", 0));
    expect(getCombatPower(s, paired)).toBe(4);
  });

  it("records fully prevented hits without inventing wounds or defeat", () => {
    const s = createCombatFixture();
    s.units = [
      combatUnit("attacker", 0, 1),
      { ...combatUnit("guard", 1, 2), preventDamage: 3 },
    ];
    s.combat!.total = [1, 2];
    s.combat!.remaining = [1, 2];
    let result = assign(s, "guard");
    result = assign(result.state, "attacker");
    const hit = result.frames
      .find((f) => f.combat?.stage === "impact")
      ?.combat?.hits?.find((h) => h.unitId === "guard");
    expect(hit).toMatchObject({
      assigned: 1,
      damageBefore: 0,
      damageAfter: 0,
      prevented: 1,
    });
    expect(result.state.units.map((u) => u.id)).toEqual(["guard"]);
  });

  it("keeps combat previews detached from later state mutations and private hands", () => {
    const s = createCombatFixture();
    const preview = getCombatPreview(s)!;
    s.units[0].damage = 100;
    s.combat!.assignments[0]["defender-guard"] = 99;
    expect(preview.units[0].unit.damage).toBe(2);
    expect(preview.assignments).toEqual([{}, {}]);
    expect(preview).not.toHaveProperty("players");
  });

  it("does not announce final control until pending death triggers have resolved", () => {
    const s = createCombatFixture();
    s.units = [
      combatUnit("attacker", 0, 3),
      combatUnit("death-trigger", 1, 3, "ogn-096-298"),
    ];
    s.combat!.total = [3, 3];
    s.combat!.remaining = [3, 3];
    let result = assign(s, "death-trigger");
    result = assign(result.state, "attacker");
    const pending = result.frames.find((f) => f.combat?.stage === "result")!;
    expect(pending.combat?.defeatedIds).toEqual(["attacker", "death-trigger"]);
    expect(pending.combat?.controller).toBeUndefined();
    expect(pending.state.units).toEqual([]);
    expect(pending.state.fields[0].controller).toBe(1);
    expect(result.state.pendingCombatFinish).toBe(true);
    expect(result.state.stack).toHaveLength(1);
    for (let i = 0; i < 4 && result.state.combat; i++)
      result = applyActionStepped(result.state, "pass");
    const final = result.frames.find((f) => f.combat?.stage === "result")!;
    expect(final.combat?.controller).toBeNull();
    expect(result.state.combat).toBeNull();
    expect(result.state.fields[0].controller).toBeNull();
  });
});

describe("saved combat review metadata", () => {
  it("restores the exact impact or result frame and its measured combat values", () => {
    const review = resolutionReview();
    for (const stage of ["impact", "result"] as const) {
      review.index = review.frames.findIndex((f) => f.combat?.stage === stage);
      expect(review.index).toBeGreaterThanOrEqual(0);
      const session = { match: review.final, review };
      expect(parseSession(JSON.stringify(session))).toEqual(session);
    }
  });

  it("discards malformed review metadata while retaining the valid final match", () => {
    const review = resolutionReview();
    const frameIndex = review.frames.findIndex(
      (f) => f.combat?.stage === "impact",
    );
    const corruptions: ((step: any) => void)[] = [
      (step) => {
        step.stage = "invented";
      },
      (step) => {
        step.preview = null;
      },
      (step) => {
        step.preview.total[0] = "7";
      },
      (step) => {
        step.preview.assignments = null;
      },
      (step) => {
        step.preview.units[0].unit.cardId = "unknown";
      },
      (step) => {
        step.hits[0].damageAfter = -1;
      },
      (step) => {
        step.controller = 2;
      },
    ];
    for (const corrupt of corruptions) {
      const damaged = structuredClone(review);
      corrupt(damaged.frames[frameIndex].combat);
      expect(
        parseSession(JSON.stringify({ match: review.final, review: damaged })),
      ).toEqual({ match: review.final, review: null });
    }
  });

  it("continues restoring legacy combat frames without metadata", () => {
    const review = resolutionReview();
    for (const frame of review.frames) delete frame.combat;
    const session = { match: review.final, review };
    expect(parseSession(JSON.stringify(session))).toEqual(session);
  });
});
