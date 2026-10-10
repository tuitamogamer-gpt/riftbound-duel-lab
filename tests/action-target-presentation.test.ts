import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchControls } from "../src/components/MatchControls";
import { publicActionTargets } from "../src/game/action-target-presentation";
import { applyAction, getLegalActions } from "../src/game/engine";
import type { Review } from "../src/components/StepFlow";
import { fixture, ogn, unit } from "./fixtures/cards";

function position() {
  const game = fixture();
  game.players[0].hand = [ogn(58)];
  game.units = [
    unit("ally-base"),
    unit("ally-field", 0, "field:1"),
    unit("enemy", 1, "base:1"),
  ];
  return game;
}
function controls(
  game = position(),
  target: string | null = null,
  review: Review | null = null,
) {
  return renderToStaticMarkup(
    createElement(MatchControls, {
      game,
      target,
      review,
      legal: review ? [] : getLegalActions(game, 0),
      selected: review ? null : "hand:0",
      clear: vi.fn(),
      act: vi.fn(),
      inspect: vi.fn(),
      resume: vi.fn(),
      paused: false,
      busy: false,
      mulligan: [],
    }),
  );
}

describe("public target identity in the decision bar", () => {
  it("distinguishes identical friendly cards by their locations and shows the buff", () => {
    const html = controls();
    expect(html).toContain("Discipline");
    expect(html).toContain("+2");
    expect(html).toContain('data-target-id="ally-base"');
    expect(html).toContain('data-target-id="ally-field"');
    expect(html).toContain("You · Your base");
    expect(html).toContain("You · Right battlefield");
    expect(html).not.toContain('data-target-id="enemy"');
  });
  it("keeps the chosen card named before confirmation and during playback", () => {
    const game = position();
    expect(controls(game, "ally-field")).toContain("Target: Playful Phantom");
    const action = getLegalActions(game, 0).find(
      (a) => a.sourceId === "hand:0" && a.targetId === "ally-field",
    )!;
    const review: Review = {
      before: game,
      final: game,
      frames: [{ state: game, label: "Resolving Discipline" }],
      index: 0,
      action,
    };
    expect(controls(game, null, review)).toContain("Target: Playful Phantom");
  });
  it("names the third battlefield and preserves the chosen buff target there", () => {
    const game = position();
    game.fields.push({
      id: "field:2",
      cardId: "token-baron-pit",
      controller: 0,
    });
    game.units.find((entry) => entry.id === "ally-field")!.location = "field:2";
    const action = getLegalActions(game, 0).find(
      (entry) => entry.sourceId === "hand:0" && entry.targetId === "ally-field",
    )!;
    expect(action).toBeDefined();
    expect(publicActionTargets(game, action)).toMatchObject([
      { id: "ally-field", owner: 0, location: "Treće bojište" },
    ]);
    const html = controls(game, "ally-field");
    expect(html).toContain("Target: Playful Phantom");
    expect(html).toContain("You · Third battlefield");
    expect(html).toContain('data-target-id="ally-field"');
    expect(html).not.toContain('data-target-id="ally-base"');
    expect(applyAction(game, action).stack.at(-1)?.targetId).toBe("ally-field");
  });
  it("keeps distinct and repeated public targets without duplicating the same object", () => {
    const game = position();
    expect(
      publicActionTargets(game, {
        targetId: "ally-base~ally-field",
        repeatedTargetId: "ally-base",
      }).map((item) => item.id),
    ).toEqual(["ally-base", "ally-field"]);
  });
  it("never resolves a private hand, deck, or hidden card as a target face", () => {
    const game = position();
    game.players[1].hand = [ogn(88)];
    game.players[1].deck = [ogn(219)];
    game.hidden = [
      {
        id: "private-hidden",
        cardId: ogn(97),
        owner: 1,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    for (const targetId of [ogn(88), ogn(219), "private-hidden", "hand:0"])
      expect(publicActionTargets(game, { targetId })).toEqual([]);
  });
});
