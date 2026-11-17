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
import { combatUnit, createCombatFixture } from "./fixtures/combat";

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
  it("shows the movement tax on confirmation, without paying while selecting the group", () => {
    let game = createCombatFixture();
    game.phase = "main";
    game.turnStep = "main";
    game.combat = null;
    game.players[0].runes = [
      { id: "mind", domain: "Mind", ready: false },
      { id: "order", domain: "Order", ready: false },
    ];
    game.units = [
      { ...combatUnit("mover", 0), location: "base:0", ready: true },
      { ...combatUnit("second", 0), location: "base:0", ready: true },
      combatUnit("tax", 1, 4, "unl-163-219"),
    ];
    const start = getLegalActions(game, 0).find((action) =>
      action.id.startsWith("move-start:mover:field:0"),
    )!;
    expect(start).toBeDefined();
    game = applyAction(game, start);
    game = applyAction(game, "move-toggle:second");
    const before = structuredClone(game);
    const html = renderControls(game);
    const confirm = html.match(
      /<button[^>]*class="gold-button confirm-decision"[\s\S]*?<\/button>/,
    )?.[0];
    expect(confirm).toContain("Move 2 units");
    expect(confirm).toContain("Pay 0 Energy · 1 Power");
    expect(confirm).toContain("After payment: 0 ready / 1 runes");
    expect(confirm).toContain("aria-describedby=");
    expect(game).toEqual(before);
    const committed = applyAction(game, "move-confirm");
    expect(committed.players[0].runes).toHaveLength(1);
    expect(committed.units.find((unit) => unit.id === "mover")?.location).toBe(
      "field:0",
    );
  });

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

describe("dock commands are drawn, not written out", () => {
  const renderSelected = (game: GameState, selected: string | null) =>
    renderToStaticMarkup(
      createElement(MatchControls, {
        game,
        review: null,
        legal: getLegalActions(game, 0),
        selected,
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
  const count = (html: string, text: string) => html.split(text).length - 1;
  const options = (html: string) =>
    html.match(/<button[^>]*class="context-action[\s\S]*?<\/button>/g) ?? [];

  it("gives a receipt that every listed option shares once, in the heading", () => {
    const game = createTrainingPosition("deploy");
    game.fields[0].controller = 0;
    const before = structuredClone(game);
    const html = renderSelected(game, "hand:0");
    expect(options(html)).toHaveLength(2);
    expect(count(html, 'class="decision-payment"')).toBe(1);
    const sharedId = html.match(
      /class="decision-shared-payment" id="([^"]+)"/,
    )?.[1];
    expect(sharedId).toBeTruthy();
    // Each option is still described by the receipt it shares.
    for (const option of options(html))
      expect(option).toMatch(
        new RegExp(`aria-describedby="[^"]* ${sharedId}"`),
      );
    expect(game).toEqual(before);
  });

  it("draws a play to a place as the place, with the full label kept for readers", () => {
    const game = createTrainingPosition("deploy");
    game.fields[0].controller = 0;
    const [base, field] = options(renderSelected(game, "hand:0"));
    expect(base).toContain('data-option="place"');
    expect(base).toContain('data-control="you"');
    expect(base).toContain('aria-label="Play Playful Phantom at your base"');
    expect(base).toContain('<span class="option-verb">Play</span>');
    expect(base).toContain('<strong class="option-place">Your base</strong>');
    expect(base).not.toContain("option-backdrop");
    // A battlefield is named by its card and shows that card's art.
    expect(field).toContain('data-option="place"');
    expect(field).toContain('data-control="you"');
    expect(field).toContain(
      '<strong class="option-place">Altar to Unity</strong>',
    );
    expect(field).toContain('class="option-backdrop"');
    // The card being played is in the heading; its art is not repeated.
    expect(field).not.toContain("decision-option-art");
  });

  it("keeps the receipt in the option when there is only one, without a second cost beside it", () => {
    const html = renderSelected(createTrainingPosition("deploy"), "hand:0");
    expect(options(html)).toHaveLength(1);
    expect(html).not.toContain("decision-shared-payment");
    expect(count(html, 'class="decision-payment"')).toBe(1);
    // The sentences stay as text that is read; the chips are decoration.
    expect(html).toMatch(
      /<span class="read-text">Pay \d+ Energy · \d+ Power<\/span><span class="payment-chips is-cost" aria-hidden="true">/,
    );
    expect(html).toMatch(/<span class="read-text">After payment: \d+ ready/);
    // The printed cost equals what is paid: it is read, not drawn twice.
    expect(html).toContain("Printed cost");
    expect(count(html, 'class="payment-chips is-cost"')).toBe(1);
  });

  it("names a target option by its target, under the verb of its label", () => {
    const [option] = options(
      renderSelected(createTrainingPosition("reaction"), "hand:0"),
    );
    expect(option).toContain('class="context-action has-target"');
    expect(option).toContain('data-option="target"');
    expect(option).toContain('data-owner="foe"');
    expect(option).toContain('aria-label="Play Wind Wall → Hextech Ray');
    expect(option).toContain('<span class="option-verb">Play</span>');
    expect(option).toContain("<strong>Hextech Ray</strong>");
    expect(option).not.toContain("decision-action-label");
    // The target's art, not the selected card's.
    expect(option).toContain('class="decision-option-art"');
  });

  it("counts what can be done instead of repeating one instruction", () => {
    const moves = (html: string) =>
      [
        ...html.matchAll(/<li data-move="(\w+)">[\s\S]*?<b>(\d+)<\/b><\/li>/g),
      ].map(([, kind, n]) => `${kind}:${n}`);
    const deploy = renderSelected(createTrainingPosition("deploy"), null);
    expect(moves(deploy)).toEqual(["cards:1"]);
    // The instruction is still there for a reader.
    expect(deploy).toContain(
      '<p class="read-text">Click a glowing card to play it',
    );
    expect(
      moves(renderSelected(createTrainingPosition("movement"), null)),
    ).toEqual(["units:2"]);
    const nothing = createTrainingPosition("deploy");
    nothing.players[0].hand = [];
    const html = renderSelected(nothing, null);
    expect(moves(html)).toEqual([]);
    expect(html).toContain("Nothing to play. End your turn.");
  });
});
