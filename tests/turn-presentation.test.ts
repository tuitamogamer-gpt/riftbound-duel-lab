import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import {
  automaticDelay,
  priorityWindow,
  reviewDelay,
} from "../src/game/presentation";
import { getAutomaticAction } from "../src/game/flow";
import { parseSession } from "../src/persistence";
import { TurnFlow, ShowdownCue } from "../src/components/TurnFlow";
import { getHighlights, type Review } from "../src/components/StepFlow";
import { createCombatFixture } from "./fixtures/combat";

function opening(firstPlayer: 0 | 1 = 0) {
  const before = applyAction(
    createGame({ seed: 44, firstPlayer }),
    "mulligan:",
  );
  const action = getLegalActions(before, 1).find((a) => a.id === "mulligan:")!;
  const result = applyActionStepped(before, action);
  return {
    before,
    final: result.state,
    frames: result.frames,
    index: 0,
    action,
  } satisfies Review;
}
describe("readable turn presentation", () => {
  it("records A B C D in order before main and recovers the precise displayed step", () => {
    const review = opening();
    const steps = review.frames
      .map((f) => f.state.turnStep)
      .filter((v, i, a) => v && v !== a[i - 1]);
    expect(steps).toEqual(["awaken", "beginning", "channel", "draw", "main"]);
    const awake = review.frames.find(
      (f) => f.state.turnStep === "awaken",
    )!.state;
    const channel = review.frames.find(
      (f) => f.state.turnStep === "channel",
    )!.state;
    const drawn = review.frames.find((f) => f.state.turnStep === "draw")!.state;
    expect(channel.players[0].runes.length).toBe(
      awake.players[0].runes.length + 2,
    );
    expect(drawn.players[0].hand.length).toBe(
      channel.players[0].hand.length + 1,
    );
    review.index = review.frames.findIndex(
      (f) => f.state.turnStep === "channel",
    );
    expect(
      parseSession(JSON.stringify({ match: review.final, review })).review
        ?.frames[review.index].state.turnStep,
    ).toBe("channel");
  });
  it("gives both players readable opening phases regardless of the preceding action owner", () => {
    const human = opening(0),
      bot = opening(1);
    human.index = human.frames.findIndex((f) => f.state.turnStep === "channel");
    bot.index = bot.frames.findIndex((f) => f.state.turnStep === "channel");
    expect(human.action.player).toBe(1);
    expect(reviewDelay(human)).toBeGreaterThanOrEqual(2400);
    expect(reviewDelay(bot)).toBe(reviewDelay(human));
    expect(automaticDelay(human.final, 0)).toBeGreaterThan(
      automaticDelay(bot.final, 1),
    );
  });
  it("still shows C after exhausting the rune deck", () => {
    const game = opening().final;
    game.players[1].runeDeck = [];
    game.players[0].legendId = "ogs-009-024";
    game.players[1].legendId = "ogs-009-024";
    const result = applyActionStepped(game, "end-turn");
    expect(
      result.frames.some((frame) => frame.state.turnStep === "channel"),
    ).toBe(true);
  });
  it("distinguishes Action focus from Reaction priority and waits for a real response", () => {
    const game = createCombatFixture();
    game.phase = "showdown";
    game.combat!.stage = "priority";
    expect(priorityWindow(game)).toBe("action");
    game.stack = [
      {
        id: "spell",
        cardId: "ogn-004-298",
        player: 1,
        targetId: game.units[0].id,
        effects: [{ type: "damage", amount: 3 }],
        kind: "spell",
      },
    ];
    expect(priorityWindow(game)).toBe("reaction");
    game.players[0].hand = ["ogn-046-298"];
    game.players[0].energy = 20;
    game.players[0].runes = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i}`,
      domain: "Calm",
      ready: true,
    }));
    const own = getLegalActions(game, 0);
    expect(own.length).toBeGreaterThan(1);
    expect(getAutomaticAction(game)).toBeUndefined();
    const html = renderToStaticMarkup(
      createElement(TurnFlow, { game, review: null, paused: false }),
    );
    expect(html).toContain("Reaction window");
    expect(html).toContain("You have priority");
  });
  it("does not mark every rune or the Legend when only a hand changes", () => {
    const review = opening();
    review.index = review.frames.findIndex((f) => f.state.turnStep === "draw");
    const h = getHighlights(review);
    expect(h.runes.size).toBe(0);
    expect(h.legends.size).toBe(0);
    expect(h.newCards.size).toBe(1);
  });
  it("renders a field-specific showdown cue rather than covering unrelated fields", () => {
    const game = createCombatFixture();
    const result = applyActionStepped(game, getLegalActions(game, 0)[0]);
    const frame = result.frames.find((f) => f.combat)!;
    frame.combat!.stage = "start";
    const review = {
      before: game,
      final: result.state,
      frames: [frame],
      index: 0,
      action: getLegalActions(game, 0)[0],
    };
    expect(
      renderToStaticMarkup(
        createElement(ShowdownCue, { game, review, fieldId: "field:0" }),
      ),
    ).toContain("SHOWDOWN");
    expect(
      renderToStaticMarkup(
        createElement(ShowdownCue, { game, review, fieldId: "field:1" }),
      ),
    ).toBe("");
  });
});
