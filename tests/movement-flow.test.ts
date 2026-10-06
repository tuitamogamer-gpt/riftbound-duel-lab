import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchControls } from "../src/components/MatchControls";
import { LanguageProvider } from "../src/i18n";
import { applyActionStepped, getLegalActions } from "../src/game/engine";
import {
  decisionActions,
  isMovementSelection,
  sourceActions,
} from "../src/game/flow";
import { createCombatFixture, combatUnit } from "./fixtures/combat";

function position() {
  const game = createCombatFixture();
  game.phase = "main";
  game.combat = null;
  game.units = Array.from({ length: 8 }, (_, i) => ({
    ...combatUnit(`unit-${i}`, 0),
    location: "base:0" as const,
    ready: true,
  }));
  return game;
}

function prepare() {
  const game = position();
  const action = getLegalActions(game, 0).find(
    (a) => a.sourceId === "unit-0" && a.locationId === "field:1",
  )!;
  return { before: game, action, result: applyActionStepped(game, action) };
}

describe("board-first movement selection", () => {
  it("changes only the proposed group until the player confirms", () => {
    const { before, action, result } = prepare();
    expect(isMovementSelection(action)).toBe(true);
    let game = result.state;
    for (const id of ["unit-1", "unit-2", "unit-1"]) {
      const toggle = getLegalActions(game, 0).find(
        (a) => a.id === `move-toggle:${id}`,
      )!;
      expect(isMovementSelection(toggle)).toBe(true);
      game = applyActionStepped(game, toggle).state;
    }
    expect(game.pendingMove?.unitIds).toEqual(["unit-0", "unit-2"]);
    expect(game.units).toEqual(before.units);
    expect(game.players).toEqual(before.players);
    const confirm = getLegalActions(game, 0).find(
      (a) => a.id === "move-confirm",
    )!;
    expect(isMovementSelection(confirm)).toBe(false);
    const moved = applyActionStepped(game, confirm);
    expect(
      moved.state.units
        .filter((u) => u.location === "field:1")
        .map((u) => u.id),
    ).toEqual(["unit-0", "unit-2"]);
    expect(moved.frames.length).toBeGreaterThan(0);
  });
  it("can cancel a group without changing positions or resources", () => {
    const { before, result } = prepare();
    const cancel = getLegalActions(result.state, 0).find(
      (a) => a.id === "move-cancel",
    )!;
    expect(isMovementSelection(cancel)).toBe(true);
    const game = applyActionStepped(result.state, cancel).state;
    expect(game.phase).toBe("main");
    expect(game.pendingMove).toBeNull();
    expect(game.units).toEqual(before.units);
    expect(game.players).toEqual(before.players);
  });
  it("keeps confirmation and cancellation visible with eight eligible units", () => {
    const { result } = prepare();
    const game = result.state;
    const legal = getLegalActions(game, 0);
    expect(legal.filter((a) => a.id.startsWith("move-toggle:")).length).toBe(8);
    const controls = decisionActions(game, sourceActions(game, legal, null));
    expect(controls.options).toEqual([]);
    expect(controls.confirm?.id).toBe("move-confirm");
    expect(controls.cancel?.id).toBe("move-cancel");
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(MatchControls, {
          inspect: () => {},
          game,
          legal,
          selected: null,
          target: null,
          clear() {},
          act() {},
          review: null,
          busy: false,
          paused: false,
          resume() {},
          mulligan: [],
        }),
      ),
    );
    expect(html).toContain("Move 1 unit");
    expect(html).toContain("Cancel movement");
    expect(html).toContain("1 selected");
    expect(html).not.toContain("More options");
    expect(html).not.toContain("Add Shipyard");
  });
  it("does not turn opponent actions or damage effects into instant preparation", () => {
    const { action } = prepare();
    expect(isMovementSelection({ ...action, player: 1 })).toBe(false);
    const game = createCombatFixture();
    expect(getLegalActions(game, 0).every((a) => !isMovementSelection(a))).toBe(
      true,
    );
  });
  it("keeps confirmation disabled when the group is empty", () => {
    const { result } = prepare();
    const toggle = getLegalActions(result.state, 0).find(
      (a) => a.id === "move-toggle:unit-0",
    )!;
    const game = applyActionStepped(result.state, toggle).state;
    const legal = getLegalActions(game, 0);
    expect(decisionActions(game, legal).confirm).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(MatchControls, {
          inspect: () => {},
          game,
          legal,
          selected: null,
          target: null,
          clear() {},
          act() {},
          review: null,
          busy: false,
          paused: false,
          resume() {},
          mulligan: [],
        }),
      ),
    );
    expect(html).toMatch(/class="gold-button confirm-decision" disabled=""/);
    expect(html).toContain("Click a ready unit to add it.");
  });
});
