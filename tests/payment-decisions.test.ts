import { describe, expect, it } from "vitest";
import { catalog } from "../src/catalog";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getGroupMoveAction,
  getLegalActions,
  inspectActionPayment,
  serializeGame,
} from "../src/game/engine";
import {
  damageAssignmentSummary,
  decisionReason,
} from "../src/game/decision-reasons";
import {
  getPaymentPreview,
  shouldOfferPayment,
  withPaymentRuneOrder,
} from "../src/game/payment-presentation";
import { decisionMessages } from "../src/i18n/decisions";
import type { GameAction, GameState } from "../src/game/types";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

const face = (set: string, number: number) =>
  catalog.find(
    (card) =>
      card.set.toUpperCase() === set &&
      card.collectorNumber === number &&
      !card.variant,
  )!.id;

function position(): GameState {
  const game = createGame({
    seed: 123,
    firstPlayer: 0,
    playerDeckId: "annie",
    botDeckId: "lux",
  });
  game.turn = 7;
  game.turnStep = "main";
  game.phase = "main";
  game.priorityPlayer = game.currentPlayer = game.focusPlayer = 0;
  game.units = [];
  game.stack = [];
  game.gears = [];
  game.pendingChoice = null;
  game.combat = null;
  for (const player of game.players) {
    player.hand = [];
    player.championAvailable = false;
    player.runes = [];
    player.energy = 0;
    player.power = 0;
    player.typedPower = {};
    player.points = 0;
    player.mulliganDone = player.hasBegun = true;
    player.legendUsedTurn = game.turn;
  }
  return game;
}
function action(game: GameState, filter: (action: GameAction) => boolean) {
  const selected = getLegalActions(game, 0).find(filter);
  expect(selected).toBeDefined();
  return selected!;
}
function gauntletsPosition() {
  const game = position();
  game.players[0].hand = ["ogn-093-298"];
  game.players[0].energy = 2;
  game.players[0].runes = [
    { id: "mind", domain: "Mind", ready: false },
    { id: "order", domain: "Order", ready: false },
  ];
  game.units = [
    { ...combatUnit("own", 0, 4), location: "base:0" },
    combatUnit("enemy", 1, 3),
  ];
  game.gears = [
    { id: "gauntlets", cardId: "unl-188-219", owner: 0, ready: true },
  ];
  return game;
}

describe("rune payment decisions", () => {
  it("ignores speculative payments for other legal hand cards", () => {
    const game = position();
    game.players[0].hand = ["unl-173-219", "ogn-001-298"];
    game.players[0].energy = game.players[0].power = 20;
    game.units = [
      { ...combatUnit("sacrifice-cost", 0, 5), location: "base:0" },
    ];
    const play = action(game, (entry) => entry.sourceId === "hand:1");
    const before = serializeGame(game);
    const receipts = inspectActionPayment(game, play);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].energy).toBe(getCard(play.cardId!).energy);
    expect(getPaymentPreview(game, play)?.energy).toBe(
      getCard(play.cardId!).energy,
    );
    expect(serializeGame(game)).toBe(before);
  });

  it("previews the exact default and manual Power payment without changing the state or RNG", () => {
    const game = gauntletsPosition();
    const equip = action(game, (entry) => entry.id === "equip:gauntlets:own");
    const before = serializeGame(game);
    const automatic = getPaymentPreview(game, equip)!;
    const preferred = withPaymentRuneOrder(game, equip, ["order", "mind"]);
    const manual = getPaymentPreview(game, preferred)!;
    expect(
      automatic.runes.find((entry) => entry.rune.id === "mind")?.status,
    ).toBe("recycled");
    expect(manual.runes.find((entry) => entry.rune.id === "mind")?.status).toBe(
      "retained",
    );
    expect(manual.power).toBe(1);
    expect(manual.energy).toBe(0);
    expect(manual.retained.map((rune) => rune.id)).toEqual(["mind"]);
    expect(serializeGame(game)).toBe(before);
    expect(shouldOfferPayment(game, equip)).toBe(true);
  });

  it("commits the chosen ordering and leaves a legal Mind reaction", () => {
    const game = gauntletsPosition();
    const equip = action(game, (entry) => entry.id === "equip:gauntlets:own");
    let manual = applyAction(
      game,
      withPaymentRuneOrder(game, equip, ["order", "mind"]),
    );
    manual = applyAction(applyAction(manual, "pass"), "pass");
    const automatic = applyAction(
      applyAction(applyAction(game, equip), "pass"),
      "pass",
    );
    expect(
      getLegalActions(manual, 0).some(
        (entry) => entry.cardId === "ogn-093-298",
      ),
    ).toBe(true);
    expect(
      getLegalActions(automatic, 0).some(
        (entry) => entry.cardId === "ogn-093-298",
      ),
    ).toBe(false);
  });

  it("still pays a required domain even when another rune is preferred first", () => {
    const game = gauntletsPosition();
    const spell = action(game, (entry) => entry.sourceId === "hand:0");
    const preferred = withPaymentRuneOrder(game, spell, ["order", "mind"]);
    const preview = getPaymentPreview(game, preferred)!;
    expect(
      preview.runes.find((entry) => entry.rune.id === "mind")?.status,
    ).toBe("recycled");
    expect(preview.retained.map((rune) => rune.id)).toEqual(["order"]);
    expect(
      applyAction(game, preferred).players[0].runes.map((rune) => rune.id),
    ).toEqual(["order"]);
  });

  it("shows Energy exhaustion separately from recycled Power runes", () => {
    const game = position();
    game.players[0].hand = ["ogn-001-298"];
    game.players[0].energy = 4;
    game.players[0].runes = [
      { id: "fury", domain: "Fury", ready: true },
      { id: "calm", domain: "Calm", ready: true },
    ];
    const play = action(
      game,
      (entry) => entry.category === "play" && !entry.id.includes("accelerate"),
    );
    const preview = getPaymentPreview(
      game,
      withPaymentRuneOrder(game, play, ["calm", "fury"]),
    )!;
    expect(
      preview.runes.find((entry) => entry.rune.id === "calm")?.status,
    ).toBe("exhausted");
    expect(
      preview.runes.find((entry) => entry.rune.id === "fury")?.readyAfter,
    ).toBe(true);
    expect(preview.energy).toBe(getCard("ogn-001-298").energy);
    expect(preview.power).toBe(0);
  });

  it("includes restricted unit and spell pools in the same cost receipt", () => {
    const unit = position();
    unit.players[0].hand = ["ogn-052-298"];
    unit.players[0].unitEnergy = 3;
    const unitPlay = action(unit, (entry) => entry.category === "play");
    const unitReceipt = getPaymentPreview(unit, unitPlay)!;
    expect(unitReceipt.energy).toBe(getCard("ogn-052-298").energy);
    expect(unitReceipt.pools).toContainEqual({
      key: "unitEnergy",
      before: 3,
      after: 3 - (getCard("ogn-052-298").energy ?? 0),
    });

    const spell = position();
    spell.players[0].hand = ["ogn-050-298"];
    spell.players[0].spellEnergy = 3;
    spell.players[0].spellPower = 1;
    spell.units = [combatUnit("target", 1)];
    const spellPlay = action(spell, (entry) => entry.category === "play");
    const spellReceipt = getPaymentPreview(spell, spellPlay)!;
    expect(spellReceipt.power).toBe(1);
    expect(spellReceipt.pools).toContainEqual({
      key: "spellPower",
      before: 1,
      after: 0,
    });
    expect(
      spellReceipt.pools.some((entry) => entry.key === "spellEnergy"),
    ).toBe(true);
  });

  it("captures paid costs before a mana ability grants its restricted Energy", () => {
    const game = position();
    game.players[0].legendId = face("VEN", 141);
    game.players[0].legendUsedTurn = -1;
    game.players[0].power = 2;
    game.units = [combatUnit("support", 0, 4, face("VEN", 134))];
    const ability = action(game, (entry) => entry.sourceId === "legend");
    const preview = getPaymentPreview(game, ability)!;
    expect(preview.power).toBe(2);
    expect(preview.pools).toEqual([{ key: "power", before: 2, after: 0 }]);
    const receipt = inspectActionPayment(game, ability)[0];
    expect(receipt.after.unitEnergy).toBe(0);
    expect(applyAction(game, ability).players[0].unitEnergy).toBe(2);
  });

  it("previews movement tax only when the group is committed", () => {
    const game = position();
    game.players[0].runes = [
      { id: "mind", domain: "Mind", ready: false },
      { id: "order", domain: "Order", ready: false },
    ];
    game.units = [
      { ...combatUnit("one", 0), location: "base:0", ready: true },
      { ...combatUnit("two", 0), location: "base:0", ready: true },
      combatUnit("tax", 1, 4, "unl-163-219"),
    ];
    const start = action(game, (entry) =>
      entry.id.startsWith("move-start:one:field:0"),
    );
    expect(shouldOfferPayment(game, start)).toBe(false);
    const group = getGroupMoveAction(game, 0, ["one", "two"], "field:0")!;
    expect(getPaymentPreview(game, group)?.power).toBe(1);
    expect(shouldOfferPayment(game, group)).toBe(true);
    let drafting = applyAction(game, start);
    drafting = applyAction(
      drafting,
      action(drafting, (entry) => entry.id === "move-toggle:two"),
    );
    const confirm = action(drafting, (entry) => entry.id === "move-confirm");
    expect(getPaymentPreview(drafting, confirm)?.power).toBe(1);
    const chosen = withPaymentRuneOrder(drafting, confirm, ["order", "mind"]);
    expect(
      applyAction(drafting, chosen).players[0].runes.map((rune) => rune.id),
    ).toEqual(["mind"]);
  });

  it("rejects partial, duplicate and unknown preferences and recovers the recorder after an error", () => {
    const game = gauntletsPosition();
    const equip = action(game, (entry) => entry.id === "equip:gauntlets:own");
    const before = serializeGame(game);
    for (const order of [["mind"], ["mind", "mind"], ["mind", "unknown"]]) {
      expect(() => withPaymentRuneOrder(game, equip, order)).toThrow(
        "Invalid payment preference",
      );
      expect(() =>
        inspectActionPayment(game, { ...equip, paymentRuneOrder: order }),
      ).toThrow();
    }
    expect(inspectActionPayment(game, equip)).toHaveLength(1);
    expect(serializeGame(game)).toBe(before);
    expect(
      withPaymentRuneOrder(
        game,
        { ...equip, paymentRuneOrder: ["order", "mind"] },
        null,
      ),
    ).toEqual(equip);
  });

  it("does not expose future draws, private card faces or opponent payment choices", () => {
    const game = position();
    game.players[0].hand = ["ogn-114-298"];
    game.players[0].energy = 20;
    game.players[0].power = 2;
    game.players[0].deck = ["ogn-199-298", "ogn-198-298"];
    game.players[1].hand = ["ogn-297-298"];
    game.hidden = [
      {
        id: "enemy-secret",
        owner: 1,
        cardId: "ogn-298-298",
        location: "field:1",
        hiddenTurn: 1,
      },
    ];
    const play = action(game, (entry) => entry.category === "play");
    const serialized = JSON.stringify({
      preview: getPaymentPreview(game, play),
      receipts: inspectActionPayment(game, play),
    });
    for (const privateValue of [
      "ogn-199-298",
      "ogn-198-298",
      "ogn-297-298",
      "ogn-298-298",
      "enemy-secret",
      "deck",
      "hand",
    ])
      expect(serialized).not.toContain(privateValue);
    expect(getPaymentPreview(game, { ...play, player: 1 })).toBeNull();
    expect(shouldOfferPayment(game, { ...play, player: 1 })).toBe(false);
    expect(getPaymentPreview(game, { ...play, id: "illegal" })).toBeNull();
  });
});

describe("specific decision guidance", () => {
  it("summarizes lethal assigned damage using current Might, damage and prevention", () => {
    const game = createCombatFixture();
    expect(damageAssignmentSummary(game)).toEqual({
      remaining: 7,
      assigned: 0,
      lethal: 0,
    });
    game.combat!.assignments[0]["defender-guard"] = 4;
    game.combat!.remaining[0] = 3;
    expect(damageAssignmentSummary(game)).toEqual({
      remaining: 3,
      assigned: 4,
      lethal: 0,
    });
    game.combat!.assignments[0]["defender-guard"] = 6;
    game.combat!.remaining[0] = 1;
    const before = serializeGame(game);
    expect(damageAssignmentSummary(game)).toEqual({
      remaining: 1,
      assigned: 6,
      lethal: 1,
    });
    expect(damageAssignmentSummary(game, 1)?.lethal).toBe(0);
    expect(serializeGame(game)).toBe(before);
    game.combat!.stage = "priority";
    expect(damageAssignmentSummary(game)).toBeNull();
  });
  it("distinguishes an Energy deficit from a Power/domain deficit using legal actions", () => {
    const game = position();
    game.players[0].hand = ["ogn-001-298"];
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "More Energy is required for an available play.",
    );
    game.players[0].hand = ["ogn-093-298"];
    game.players[0].energy = 20;
    game.units = [combatUnit("target", 0)];
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "More Power or a matching domain is required for an available play.",
    );
    game.players[0].runes = [{ id: "fury", domain: "Fury", ready: false }];
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "More Power or a matching domain is required for an available play.",
    );
  });

  it("reports both deficits without changing the state", () => {
    const game = position();
    game.players[0].hand = ["ogn-114-298"];
    const before = serializeGame(game);
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "More Energy and Power are required for an available play.",
    );
    expect(serializeGame(game)).toBe(before);
  });

  it("uses effective prices after discount rather than printed Energy", () => {
    const game = position();
    game.players[0].hand = ["ogn-012-298"];
    game.players[0].cardsPlayedThisTurn = 1;
    game.players[0].energy = Math.max(
      0,
      (getCard("ogn-012-298").energy ?? 0) - 2,
    );
    game.players[0].power = 10;
    expect(
      getLegalActions(game, 0).some((entry) => entry.sourceId === "hand:0"),
    ).toBe(true);
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBeNull();
  });

  it("explains wrong timing, targets and exhausted units", () => {
    const game = position();
    game.players[0].hand = ["ogn-009-298"];
    game.players[0].energy = game.players[0].power = 20;
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "This card has no legal target, destination or available effect in this position.",
    );
    game.units = [combatUnit("target", 1)];
    expect(
      decisionReason(game, getLegalActions(game, 0), "hand:0", "not-target"),
    ).toBe("Choose a highlighted target or destination for this card.");
    game.players[0].hand = ["ogn-001-298"];
    game.stack = [
      {
        id: "effect",
        player: 1,
        cardId: "ogn-009-298",
        kind: "spell",
        targetId: "target",
        effects: [{ type: "damage", amount: 3, target: "anyUnit" }],
      },
    ];
    expect(decisionReason(game, getLegalActions(game, 0), "hand:0")).toBe(
      "Only Reactions can be played while an effect is on the chain.",
    );
    game.stack = [];
    game.units = [{ ...combatUnit("exhausted", 0), location: "base:0" }];
    expect(decisionReason(game, getLegalActions(game, 0), "exhausted")).toBe(
      "This unit is exhausted. It readies at the start of your turn.",
    );
  });

  it("respects priority and forced decisions", () => {
    const game = position();
    game.players[0].hand = ["ogn-001-298"];
    game.priorityPlayer = 1;
    expect(decisionReason(game, [], "hand:0")).toBe(
      "Wait until you have priority.",
    );
    game.priorityPlayer = 0;
    game.phase = "move";
    expect(decisionReason(game, [], "hand:0")).toBe(
      "Confirm or cancel movement before playing another card.",
    );
    game.phase = "damage";
    expect(decisionReason(game, [], "hand:0")).toBe(
      "Finish damage assignment before playing another card.",
    );
    expect(decisionReason(game, [], null)).toBeNull();
  });

  it("keeps every translated reason and rune control complete with the same values", () => {
    const placeholders = (text: string) =>
      [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
    for (const [key, values] of Object.entries(decisionMessages))
      for (const translated of values) {
        expect(translated.trim(), key).not.toBe("");
        expect(placeholders(translated), key).toEqual(placeholders(key));
      }
  });
});
