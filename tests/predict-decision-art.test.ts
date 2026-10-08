import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchControls } from "../src/components/MatchControls";
import { getLegalActions } from "../src/game/engine";
import { act, fixture, ogn } from "./fixtures/cards";
import type { GameState, PlayerId } from "../src/game/types";

function predict(actor: PlayerId, who: "self" | "opponent") {
  let game = fixture();
  game.currentPlayer = game.priorityPlayer = game.focusPlayer = actor;
  game.players[0].deck = [ogn(49), ogn(9), ogn(37)];
  game.players[1].deck = [ogn(88), ogn(219), ogn(58)];
  game.stack = [
    {
      id: "predict-art",
      player: actor,
      cardId: ogn(25),
      kind: "ability",
      effects: [{ type: "predict", who }],
    },
  ];
  game = act(act(game, "pass"), "pass");
  expect(game.pendingChoice?.kind).toBe("predict");
  return game;
}
function render(game: GameState) {
  return renderToStaticMarkup(
    createElement(MatchControls, {
      game,
      legal: getLegalActions(game, 0),
      selected: null,
      target: null,
      clear: vi.fn(),
      act: vi.fn(),
      review: null,
      busy: game.priorityPlayer !== 0,
      paused: false,
      resume: vi.fn(),
      mulligan: [],
      inspect: vi.fn(),
    }),
  );
}

describe("authorized Predict option artwork", () => {
  it("shows the actually inspected enemy card and never the viewer's uninspected top", () => {
    const game = predict(0, "opponent");
    const html = render(game);
    expect(html).toContain("Keep Mega-Mech on top");
    expect(html).toContain('data-card-preview="ogn-088-298"');
    expect(html).not.toContain('data-card-preview="ogn-049-298"');
    expect(html).not.toContain('alt="Playful Phantom"');
    const changed = structuredClone(game);
    changed.players[0].deck.reverse();
    changed.players[1].deck[1] = ogn(175);
    expect(render(changed)).toBe(html);
  });

  it("keeps an own Predict's inspected face while leaving the opponent's order private", () => {
    const game = predict(0, "self");
    const html = render(game);
    expect(html).toContain("Keep Playful Phantom on top");
    expect(html).toContain('data-card-preview="ogn-049-298"');
    expect(html).not.toContain('data-card-preview="ogn-088-298"');
    const changed = structuredClone(game);
    changed.players[1].deck.reverse();
    changed.players[0].deck[1] = ogn(175);
    expect(render(changed)).toBe(html);
  });

  it.each(["self", "opponent"] as const)(
    "never renders either private deck's top during the opponent's %s Predict",
    (who) => {
      const game = predict(1, who);
      const html = render(game);
      expect(html).not.toContain('class="decision-option-art"');
      expect(html).not.toContain('data-card-preview="ogn-049-298"');
      expect(html).not.toContain('data-card-preview="ogn-088-298"');
      const changed = structuredClone(game);
      changed.players[0].deck.reverse();
      changed.players[1].deck.reverse();
      expect(render(changed)).toBe(html);
    },
  );

  it("does not render future cards without an active authorized inspection", () => {
    const game = fixture();
    game.players[0].deck = [ogn(49)];
    game.players[1].deck = [ogn(88)];
    const html = render(game);
    expect(html).not.toContain('data-card-preview="ogn-049-298"');
    expect(html).not.toContain('data-card-preview="ogn-088-298"');
    const changed = structuredClone(game);
    changed.players[0].deck = [ogn(9)];
    changed.players[1].deck = [ogn(175)];
    expect(render(changed)).toBe(html);
  });
});
