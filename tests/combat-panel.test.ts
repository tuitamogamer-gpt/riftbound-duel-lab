import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../src/i18n";
import type { Locale } from "../src/i18n";

afterEach(() => vi.unstubAllGlobals());
import { CombatPanel, getCombatView } from "../src/components/CombatPanel";
import type { Review } from "../src/components/StepFlow";
import {
  applyActionStepped,
  getCombatPreview,
  getLegalActions,
} from "../src/game/engine";
import type { GameState } from "../src/game/types";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

function assign(state: GameState, target: string) {
  const action = getLegalActions(state, state.priorityPlayer).find(
    (entry) => entry.targetId === target,
  )!;
  const result = applyActionStepped(state, action);
  return {
    ...result,
    review: {
      before: state,
      final: result.state,
      frames: result.frames,
      index: 0,
      action,
    } satisfies Review,
  };
}

function resolution() {
  let game = createCombatFixture();
  for (const target of ["defender-guard", "defender-front", "attacker-front"])
    game = assign(game, target).state;
  return assign(game, "attacker-guard");
}

function render(
  game: GameState,
  review: Review | null = null,
  locale?: Locale,
) {
  if (locale) vi.stubGlobal("localStorage", { getItem: () => locale });
  let called = false;
  const panel = createElement(CombatPanel, {
    game,
    review,
    legal: getLegalActions(game, 0),
    onAction: () => {
      called = true;
    },
    inspect: () => {},
  });
  const html = renderToStaticMarkup(
    locale ? createElement(LanguageProvider, null, panel) : panel,
  );
  expect(called).toBe(false);
  return html;
}

describe("visible combat overview", () => {
  it.each([
    ["sr", "Dodijeli", "štete:", "7 preostalo"],
    ["it", "Assegna", "danni:", "7 rimanenti"],
  ] as const)(
    "localizes combat actions and quantities in %s without changing the game",
    (locale, actionLabel, damageLabel, remaining) => {
      const game = createCombatFixture();
      const before = JSON.stringify(game);
      const html = render(game, null, locale);
      for (const action of getLegalActions(game, 0))
        expect(html).toContain(
          `${actionLabel} ${action.amount} ${damageLabel}`,
        );
      expect(html).toContain(remaining);
      expect(html).not.toContain("Assign ");
      expect(JSON.stringify(game)).toBe(before);
    },
  );
  it("shows every legal assignment without revealing an outcome or running actions", () => {
    const game = createCombatFixture();
    const html = render(game);
    for (const action of getLegalActions(game, 0))
      expect(html).toContain(`Assign ${action.amount} damage:`);
    expect(html).toContain("7 remaining");
    expect(html).toContain('data-card-might="4"');
    expect(html).toContain('data-card-damage="2"');
    expect(html).not.toContain("Survived");
    expect(html).not.toContain("Defeated");
  });

  it("does not read casualties or final control from later review frames", () => {
    const { review } = resolution();
    review.index = review.frames.findIndex(
      (frame) => frame.combat?.stage === "impact",
    );
    const game = review.frames[review.index].state;
    const view = getCombatView(game, review)!;
    expect(view.stage).toBe("impact");
    expect(view.units).toHaveLength(4);
    expect(view.units.every((entry) => entry.status === "present")).toBe(true);
    expect(view.controller).toBeUndefined();
    const html = render(game, review);
    expect(html).toContain("combat-clash-active");
    expect(html).not.toContain("Defeated");
    expect(html).not.toContain("Survived");
    expect(html).not.toContain("Assign 6 damage:");
  });

  it("keeps the actual damage, defeated units and recalled survivor after the field clears", () => {
    const { review } = resolution();
    review.index = review.frames.findIndex(
      (frame) => frame.combat?.stage === "result",
    );
    const game = review.frames[review.index].state;
    const view = getCombatView(game, review)!;
    expect(
      view.units
        .filter((entry) => entry.status === "defeated")
        .map((entry) => entry.unit.id)
        .sort(),
    ).toEqual(["attacker-front", "defender-guard"]);
    expect(
      view.units.find((entry) => entry.unit.id === "attacker-guard")?.status,
    ).toBe("recalled");
    expect(
      view.units.find((entry) => entry.unit.id === "defender-guard")?.hit
        ?.damageAfter,
    ).toBe(4);
    const html = render(game, review);
    expect(html).toContain("Recalled to base");
    expect(html).toContain("Survived");
    expect(html).toContain("AI controls the battlefield after this combat.");
  });

  it("updates current Might after a start frame instead of holding onto an earlier preview", () => {
    const game = createCombatFixture();
    game.phase = "showdown";
    game.combat!.stage = "priority";
    const before = structuredClone(game);
    const preview = getCombatPreview(before)!;
    game.units[0].temporaryMight += 3;
    const review: Review = {
      before,
      final: game,
      action: { id: "pass", label: "Pass", category: "pass", player: 0 },
      frames: [
        { state: before, label: "Start", combat: { stage: "start", preview } },
        { state: game, label: "Buff" },
      ],
      index: 1,
    };
    expect(getCombatView(game, review)?.units[0].might).toBe(
      preview.units[0].might + 3,
    );
  });

  it("does not announce control while death effects are waiting", () => {
    const game = createCombatFixture();
    game.units = [
      combatUnit("attacker", 0, 3),
      combatUnit("trigger", 1, 3, "ogn-096-298"),
    ];
    game.combat!.total = [3, 3];
    game.combat!.remaining = [3, 3];
    const { review } = assign(assign(game, "trigger").state, "attacker");
    review.index = review.frames.findIndex(
      (frame) => frame.combat?.stage === "result",
    );
    const current = review.frames[review.index].state;
    expect(getCombatView(current, review)?.controller).toBeUndefined();
    expect(render(current, review)).toContain(
      "Remaining effects may still change battlefield control.",
    );
    expect(render(current, review)).not.toContain(
      "AI controls the battlefield after this combat.",
    );
  });

  it("distinguishes movement and removal effects from a confirmed combat defeat", () => {
    const before = createCombatFixture();
    before.phase = "showdown";
    before.combat!.stage = "priority";
    const game = structuredClone(before);
    game.units[0].location = "field:1";
    game.units = game.units.filter((unit) => unit.id !== "attacker-guard");
    const review: Review = {
      before,
      final: game,
      frames: [{ state: game, label: "Movement and removal effects" }],
      index: 0,
      action: { id: "pass", label: "Pass", category: "pass", player: 0 },
    };
    const view = getCombatView(game, review)!;
    expect(
      view.units.find((entry) => entry.unit.id === "attacker-front")?.status,
    ).toBe("moved");
    expect(
      view.units.find((entry) => entry.unit.id === "attacker-guard")?.status,
    ).toBe("removed");
    const html = render(game, review);
    expect(html).toContain("Left the battlefield");
    expect(html).toContain("Removed from the board");
    expect(html).not.toContain("Defeated");
    expect(html).not.toContain("Recalled to base");
  });

  it("hides the overview outside combat", () => {
    const game = createCombatFixture();
    game.combat = null;
    game.phase = "main";
    expect(getCombatView(game, null)).toBeNull();
    expect(render(game)).toBe("");
  });
});
