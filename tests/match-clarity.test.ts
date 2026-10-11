import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchControls } from "../src/components/MatchControls";
import { DecisionPayment } from "../src/components/DecisionPayment";
import { CombatAssignment } from "../src/components/CombatAssignment";
import { readableText } from "../src/data/cards";
import { reactionSources } from "../src/game/reaction-presentation";
import { decisionReason } from "../src/game/decision-reasons";
import {
  applyAction,
  getCombatPreview,
  getLegalActions,
} from "../src/game/engine";
import { createTrainingPosition } from "../src/game/training";
import { fixture, ogn } from "./fixtures/cards";
import type { Review } from "../src/components/StepFlow";
import type { GameState } from "../src/game/types";

const renderControls = (game: GameState, review: Review | null = null) =>
  renderToStaticMarkup(
    createElement(MatchControls, {
      game,
      review,
      legal: getLegalActions(game, 0),
      selected: null,
      target: null,
      clear: vi.fn(),
      act: vi.fn(),
      inspect: vi.fn(),
      resume: vi.fn(),
      selectSource: vi.fn(),
      paused: false,
      busy: false,
      mulligan: [],
    }),
  );

describe("readable decisions without predicting hidden outcomes", () => {
  it("surfaces the legal reaction source and pending target before selecting a card", () => {
    const game = createTrainingPosition("reaction");
    const before = structuredClone(game);
    const legal = getLegalActions(game, 0);
    expect([...reactionSources(game, legal).keys()]).toEqual(["hand:0"]);
    const html = renderControls(game);
    expect(html).toContain("On the chain: Hextech Ray");
    expect(html).toContain("→ Playful Phantom");
    expect(html).toContain('data-response-source="hand:0"');
    expect(html).toContain("Select Wind Wall to respond");
    expect(html).toContain('class="gold-button end-turn secondary-ending"');
    expect(game).toEqual(before);
  });

  it("does not offer opponent sources, nonlegal hand cards or responses during playback", () => {
    const game = createTrainingPosition("reaction");
    game.players[0].hand.push(ogn(9)); // Action, not Reaction.
    game.players[1].hand = [ogn(64)];
    expect([...reactionSources(game, getLegalActions(game, 0)).keys()]).toEqual(
      ["hand:0"],
    );
    expect(reactionSources(game, getLegalActions(game, 1)).size).toBe(0);
    const review: Review = {
      before: game,
      final: game,
      index: 0,
      action: getLegalActions(game, 0).find((action) => action.id === "pass")!,
      frames: [{ state: game, label: "Resolving effects" }],
    };
    expect(renderControls(game, review)).not.toContain("data-response-source");
  });

  it("shows exact rune retention before play, and keeps restricted Energy separate", () => {
    const game = fixture();
    game.players[0].hand = [ogn(9)];
    game.players[0].energy = 0;
    game.players[0].power = 0;
    game.players[0].spellEnergy = 1;
    game.players[0].unitEnergy = 7;
    game.players[0].runes = [
      { id: "fury-1", domain: "Fury", ready: true },
      { id: "fury-2", domain: "Fury", ready: true },
      { id: "calm", domain: "Calm", ready: true },
    ];
    game.units = createTrainingPosition("reaction").units;
    const action = getLegalActions(game, 0).find(
      (entry) => entry.sourceId === "hand:0",
    )!;
    expect(action).toBeDefined();
    const before = structuredClone(game);
    const html = renderToStaticMarkup(
      createElement(DecisionPayment, { game, action }),
    );
    expect(html).toContain("Pay 1 Energy · 1 Power");
    expect(html).toContain("After payment: 2 ready / 2 runes");
    expect(html).toContain("Spell Energy");
    expect(html).toContain("1 → 0");
    expect(html).not.toContain("Unit Energy");
    expect(game).toEqual(before);
    const next = applyAction(game, action);
    expect(next.players[0].runes.filter((rune) => rune.ready)).toHaveLength(2);
    expect(next.players[0].unitEnergy).toBe(7);
  });

  it("shows prevention and the lethal assignment threshold without promising a defeat", () => {
    let game = createTrainingPosition("damage");
    let entry = getCombatPreview(game)!.units.find(
      (item) => item.unit.id === "practice-shielded",
    )!;
    let html = renderToStaticMarkup(createElement(CombatAssignment, { entry }));
    expect(html).toContain("Assigned 0 / 6");
    expect(html).toContain("Prevents 2");
    expect(html).toContain('data-lethal="false"');
    game = applyAction(
      game,
      getLegalActions(game, 0).find(
        (action) => action.targetId === "practice-shielded",
      )!,
    );
    entry = getCombatPreview(game)!.units.find(
      (item) => item.unit.id === "practice-shielded",
    )!;
    html = renderToStaticMarkup(createElement(CombatAssignment, { entry }));
    expect(html).toContain("Assigned 6 / 6");
    expect(html).toContain('data-lethal="true"');
    expect(html).toContain("damage resolves after confirmation");
    expect(game.units.some((unit) => unit.id === "practice-shielded")).toBe(
      true,
    );
  });

  it("explains a missing battlefield target using the card's target rule", () => {
    const game = fixture();
    game.players[0].hand = [ogn(9)];
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "No units on battlefields. This spell needs a battlefield unit.",
    );
  });

  it("separates timing reminders and effect text in card details", () => {
    expect(
      readableText(
        "[Action] (Play on your turn or in showdowns.)Deal 2 damage.",
      ),
    ).toBe("[Action] (Play on your turn or in showdowns.) Deal 2 damage.");
    expect(readableText("[Reaction]Counter a spell.")).toBe(
      "[Reaction] Counter a spell.",
    );
  });
});
