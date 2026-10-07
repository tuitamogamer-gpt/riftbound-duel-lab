import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { decks, validateDeck } from "../src/data/decks";
import {
  applyAction,
  applyActionStepped,
  createGame,
  deserializeGame,
  getGameView,
  getLegalActions,
  serializeGame,
} from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import { isImplemented } from "../src/game/scripts";

describe("explicit script coverage and persistence", () => {
  it("uses legal 40-card decks with every played card explicitly scripted", () => {
    for (const deck of decks) {
      expect(validateDeck(deck), deck.id).toEqual([]);
      for (const id of [
        deck.legendId,
        deck.championId,
        deck.battlefieldId,
        ...deck.main.map((e) => e.cardId),
      ])
        expect(isImplemented(id), getCard(id).name).toBe(true);
    }
  });
  it("round-trips a midgame without losing priority, actions, or deterministic decisions", () => {
    let state = createGame({
      seed: 812,
      playerDeckId: "garen",
      botDeckId: "master-yi",
    });
    for (let i = 0; i < 50; i++) {
      const action = getBotAction(state);
      if (!action) break;
      state = applyAction(state, action);
    }
    const restored = deserializeGame(serializeGame(state));
    expect(restored).toEqual(state);
    expect(getLegalActions(restored, restored.priorityPlayer)).toEqual(
      getLegalActions(state, state.priorityPlayer),
    );
    expect(getBotAction(restored)).toEqual(getBotAction(state));
  });
  it("does not expose opponent hands or either deck order in the public view", () => {
    const state = createGame({ seed: 42 });
    const view = getGameView(state, 0);
    expect(view.players[0].hand).toEqual(state.players[0].hand);
    expect(view.players[1].hand).toEqual([]);
    expect(view.players[1].handCount).toBe(4);
    expect(view.players[0].deck).toEqual([]);
    expect(view.players[1].runeDeck).toEqual([]);
  });
});

describe("manual Proceed event frames", () => {
  it("separates ready, rune channel, and draw events before the first decision", () => {
    const first = applyAction(createGame({ seed: 44 }), "mulligan:");
    const result = applyActionStepped(first, "mulligan:");
    const labels = result.frames.map((frame) => frame.label);
    const ready = labels.findIndex((label) => label.includes("ready units"));
    const channel = labels.findIndex((label) => label.includes("channels 2"));
    const draw = labels.findIndex((label) => label.includes("draws 1"));
    expect(ready).toBeGreaterThanOrEqual(0);
    expect(channel).toBeGreaterThan(ready);
    expect(draw).toBeGreaterThan(channel);
    expect(result.frames[ready].state.players[0].runes).toHaveLength(0);
    expect(result.frames[channel].state.players[0].runes).toHaveLength(2);
    expect(result.frames[channel].state.players[0].hand).toHaveLength(4);
    expect(result.frames[draw].state.players[0].hand).toHaveLength(5);
    expect(result.frames.at(-1)?.state).toEqual(result.state);
  });
  it("is equivalent to normal rules execution and does not mutate input or adjacent frames", () => {
    let state = createGame({ seed: 72 });
    for (let i = 0; i < 160 && state.winner === null; i++) {
      const action = getBotAction(state)!;
      const before = structuredClone(state);
      const result = applyActionStepped(state, action);
      expect(state).toEqual(before);
      expect(result.state).toEqual(applyAction(state, action));
      expect(result.frames.length).toBeGreaterThan(0);
      expect(result.frames.at(-1)?.state).toEqual(result.state);
      result.frames[0].state.seed = 0;
      expect(result.state.seed).toBe(72);
      state = result.state;
    }
  }, 20_000);
  it("rejects illegal actions and safely resets frame collection after an error", () => {
    const state = createGame({ seed: 51 });
    expect(() => applyActionStepped(state, "end-turn")).toThrow(
      "Illegal action",
    );
    const valid = applyActionStepped(state, "mulligan:");
    expect(valid.state.players[0].mulliganDone).toBe(true);
    expect(valid.frames.at(-1)?.state).toEqual(valid.state);
  });
});
