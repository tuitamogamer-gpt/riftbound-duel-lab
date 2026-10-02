import { describe, expect, it } from "vitest";
import { createGame } from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import type { GameState, Unit } from "../src/game/types";
function state(): GameState {
  const s = createGame({ seed: 27, playerDeckId: "annie", botDeckId: "garen" });
  s.phase = "main";
  s.priorityPlayer = 0;
  s.currentPlayer = 0;
  s.turn = 4;
  s.units = [];
  s.stack = [];
  s.gears = [];
  s.players[0].hand = [];
  s.players[0].energy = 0;
  s.players[0].runes = [];
  s.players[0].championAvailable = false;
  return s;
}
function addUnit(
  s: GameState,
  id: string,
  cardId: string,
  extra: Partial<Unit> = {},
) {
  const u: Unit = {
    id,
    cardId,
    owner: 0,
    location: "field:0",
    ready: false,
    damage: 0,
    buff: 0,
    stunned: false,
    temporaryMight: 0,
    temporaryAssault: 0,
    gear: [],
    summonedTurn: 1,
    ...extra,
  };
  s.units.push(u);
  return u;
}
function choice(
  s: GameState,
  kind: NonNullable<GameState["pendingChoice"]>["kind"],
  extra: Partial<NonNullable<GameState["pendingChoice"]>> = {},
) {
  s.phase = "choice";
  s.pendingChoice = {
    player: 0,
    kind,
    remaining: 1,
    returnPhase: "main",
    returnPriority: 0,
    ...extra,
  };
}
describe("bot decisions for imported precon mechanics", () => {
  it("discards an unaffordable spell before the only affordable unit", () => {
    const s = state();
    s.players[0].hand = ["ogn-001-298", "ogs-022-024"];
    choice(s, "discard");
    expect(getBotAction(s)?.cardId).toBe("ogs-022-024");
  });
  it("retrieves the more valuable available unit and sacrifices a token first", () => {
    const s = state();
    s.players[0].discard = ["ogn-001-298", "ogs-018-024"];
    s.players[0].energy = 12;
    choice(s, "retrieve", { effect: { type: "retrieve", condition: "unit" } });
    expect(getBotAction(s)?.cardId).toBe("ogs-018-024");
    addUnit(s, "strong", "ogs-018-024");
    addUnit(s, "token", "ogn-271-298", { token: true });
    choice(s, "sacrifice");
    expect(getBotAction(s)?.targetId).toBe("token");
  });
  it("declines an optional ready effect when every offered unit is already ready", () => {
    const s = state();
    addUnit(s, "ready", "ogn-001-298", { ready: true });
    choice(s, "custom", {
      options: [
        {
          id: "choose-custom:test:ready",
          label: "Ready the unit",
          player: 0,
          category: "ability",
          targetId: "ready",
          effects: [{ type: "ready", target: "friendlyUnit" }],
        },
        {
          id: "choose-custom:test:skip",
          label: "Skip",
          player: 0,
          category: "ability",
          effects: [],
        },
      ],
    });
    expect(getBotAction(s)?.id).toBe("choose-custom:test:skip");
    s.units[0].ready = false;
    expect(getBotAction(s)?.id).toBe("choose-custom:test:ready");
  });
  it("chooses an enemy for custom stun effects instead of a friendly unit", () => {
    const s = state();
    addUnit(s, "friend", "ogn-001-298");
    addUnit(s, "enemy", "ogs-018-024", { owner: 1 });
    choice(s, "custom", {
      options: ["friend", "enemy"].map((targetId) => ({
        id: `choose-custom:stun:${targetId}`,
        label: "Stun",
        player: 0,
        category: "ability",
        targetId,
        effects: [{ type: "stun", target: "anyUnit" }],
      })),
    });
    expect(getBotAction(s)?.targetId).toBe("enemy");
  });
  it("sends a displaced enemy to its base instead of giving it another battlefield", () => {
    const s = state();
    addUnit(s, "enemy", "ogn-001-298", { owner: 1 });
    choice(s, "move", { targetId: "enemy", effect: { type: "moveTarget" } });
    expect(getBotAction(s)?.locationId).toBe("base:1");
  });
  it("uses only the card revealed by Predict, and ignores hidden cards in ordinary decisions", () => {
    const s = state();
    choice(s, "predict");
    s.players[0].deck = ["ogs-022-024", "ogn-001-298"];
    expect(getBotAction(s)?.id).toBe("choose-predict:recycle");
    s.players[0].deck = ["ogn-001-298", "ogs-022-024"];
    expect(getBotAction(s)?.id).toBe("choose-predict:keep");
    s.phase = "main";
    s.pendingChoice = null;
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].energy = 5;
    const original = getBotAction(s)?.id;
    s.players[1].hand = ["ogs-022-024", "ogn-114-298"];
    s.players[1].deck.reverse();
    s.players[0].deck.reverse();
    expect(getBotAction(s)?.id).toBe(original);
  });
  it("does not repeatedly spend Megatusk XP when every friendly unit already has Ganking", () => {
    const s = state();
    addUnit(s, "megatusk", "unl-126-219", { temporaryKeywords: ["Ganking"] });
    s.players[0].xp = 9;
    expect(getBotAction(s)?.abilityKey).not.toBe("megatusk");
  });
  it("does not transfer paid equipment back and forth between equally valuable units", () => {
    const s = state();
    s.players[0].runes = [{ id: "calm", domain: "Calm", ready: true }];
    addUnit(s, "a", "ogn-001-298", { gear: ["sword"] });
    addUnit(s, "b", "ogn-001-298");
    s.gears = [
      {
        id: "sword",
        cardId: "unl-039-219",
        owner: 0,
        ready: true,
        attachedTo: "a",
      },
    ];
    expect(getBotAction(s)?.id).not.toBe("equip:sword:b");
  });
});

describe("bot movement taxes", () => {
  it("removes a unit from an unaffordable group instead of canceling into a repeat loop", () => {
    const s = state();
    const first = addUnit(s, "a", "ogn-001-298", {
      ready: true,
      location: "base:0",
    });
    const second = addUnit(s, "b", "ogs-018-024", {
      ready: true,
      location: "base:0",
    });
    addUnit(s, "investigator", "unl-163-219", { owner: 1 });
    s.phase = "move";
    s.pendingMove = {
      player: 0,
      from: "base:0",
      to: "field:0",
      unitIds: [first.id, second.id],
    };
    expect(getBotAction(s)?.id).toBe("move-toggle:a");
  });
});
