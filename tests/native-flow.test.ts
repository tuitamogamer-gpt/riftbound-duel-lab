import { describe, expect, it } from "vitest";
import { createGame, applyAction, getLegalActions } from "../src/game/engine";
import { getAutomaticAction, sourceActions } from "../src/game/flow";
import { createCombatFixture } from "./fixtures/combat";
import { getBotAction } from "../src/game/bot";

const start = () =>
  applyAction(
    applyAction(createGame({ seed: 44, firstPlayer: 0 }), "mulligan:"),
    "mulligan:",
  );

describe("native match flow", () => {
  it("waits for the human opening hand, then automatically chooses the opponent hand", () => {
    const game = createGame({ seed: 44, firstPlayer: 0 });
    expect(getAutomaticAction(game)).toBeUndefined();
    const next = applyAction(game, "mulligan:");
    const action = getAutomaticAction(next);
    expect(action?.player).toBe(1);
    expect(action?.category).toBe("mulligan");
    const begun = applyAction(next, action!);
    expect(begun.phase).toBe("main");
    expect(getAutomaticAction(begun)).toBeUndefined();
  });
  it("never ends the human turn, even when it is the only available action", () => {
    const game = start();
    game.players[0].hand = [];
    game.players[0].championAvailable = false;
    game.players[0].runes = [];
    game.players[0].energy = 0;
    expect(getLegalActions(game, 0).map((a) => a.category)).toEqual(["end"]);
    expect(getAutomaticAction(game)).toBeUndefined();
  });
  it("waits for human damage choices and movement confirmation", () => {
    const game = createCombatFixture();
    expect(getLegalActions(game, 0).length).toBeGreaterThan(1);
    expect(getAutomaticAction(game)).toBeUndefined();
    game.phase = "main";
    game.combat = null;
    game.units[0].ready = true;
    const action = getLegalActions(game, 0).find((a) =>
      a.id.startsWith("move-start:"),
    )!;
    expect(action).toBeDefined();
    const moved = applyAction(game, action);
    expect(moved.phase).toBe("move");
    expect(getAutomaticAction(moved)).toBeUndefined();
    expect(
      sourceActions(moved, getLegalActions(moved, 0), null).some(
        (a) => a.id === "move-confirm",
      ),
    ).toBe(true);
  });
  it("keeps card actions attached to their source, not unrelated targets", () => {
    const game = start();
    const legal = getLegalActions(game, 0);
    for (const source of ["hand:0", "hand:1", "champion", "legend"])
      expect(
        sourceActions(game, legal, source).every((a) => a.sourceId === source),
      ).toBe(true);
    expect(
      sourceActions(game, legal, null).some((a) =>
        a.sourceId?.startsWith("hand:"),
      ),
    ).toBe(false);
  });
  it("automates only forced human passes and preserves every actual reaction through full games", async () => {
    let forced = 0,
      reactions = 0,
      opponent = 0;
    for (const seed of [23, 44, 81]) {
      let game = createGame({ seed, playerDeckId: "annie", botDeckId: "lux" });
      for (let step = 0; step < 220 && game.winner === null; step++) {
        const own = getLegalActions(game, 0);
        const auto = getAutomaticAction(game);
        if (auto?.player === 0) {
          expect(own).toHaveLength(1);
          expect(auto.category).toBe("pass");
          forced++;
        }
        if (auto?.player === 1) opponent++;
        if (own.some((a) => a.category === "pass") && own.length > 1) {
          expect(auto).toBeUndefined();
          reactions++;
        }
        const decision = auto ?? getBotAction(game);
        expect(decision).toBeTruthy();
        game = applyAction(game, decision!);
        if (step % 25 === 24)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    expect(forced).toBeGreaterThan(0);
    expect(opponent).toBeGreaterThan(0);
    expect(reactions).toBeGreaterThan(0);
    // Three complete simulations over the imported catalog need more time on shared runners.
  }, 240_000);
});
