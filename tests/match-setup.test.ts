import { describe, expect, it } from "vitest";
import { starterDecks } from "../src/data/decks";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
  type PlayerId,
} from "../src/game/engine";
import { getAutomaticAction } from "../src/game/flow";
import { parseSession } from "../src/persistence";
import { parseDeckText, exportDeckText } from "../src/game/deck-import";

const mainCards = (game: GameState, player: PlayerId) =>
  [
    ...game.players[player].deck,
    ...game.players[player].hand,
    ...game.players[player].discard,
  ].sort();
const keep = (game: GameState) =>
  applyAction(
    game,
    getLegalActions(game, game.priorityPlayer).find(
      (action) => action.id === "mulligan:",
    )!,
  );

describe("chosen first player and opening order (Core 110–118)", () => {
  it.each([0, 1] as const)(
    "gives player %i the first mulligan and first turn",
    (firstPlayer) => {
      const game = createGame({ seed: 44, firstPlayer });
      expect(game.currentPlayer).toBe(firstPlayer);
      expect(game.priorityPlayer).toBe(firstPlayer);
      expect(game.focusPlayer).toBe(firstPlayer);
      expect(getLegalActions(game, (1 - firstPlayer) as PlayerId)).toEqual([]);
      const firstDone = keep(game);
      expect(firstDone.priorityPlayer).toBe(1 - firstPlayer);
      expect(firstDone.focusPlayer).toBe(1 - firstPlayer);
      expect(firstDone.players[firstPlayer].mulliganDone).toBe(true);
      expect(
        firstDone.players[(1 - firstPlayer) as PlayerId].mulliganDone,
      ).toBe(false);
      const opened = keep(firstDone);
      expect(opened.currentPlayer).toBe(firstPlayer);
      expect(opened.priorityPlayer).toBe(firstPlayer);
      expect(opened.turn).toBe(1);
      expect(opened.phase).toBe("main");
      expect(opened.players[firstPlayer].runes).toHaveLength(2);
      expect(opened.players[firstPlayer].hand).toHaveLength(5);
      let secondTurn = applyAction(opened, "end-turn");
      // Starting legends may put an end-of-turn trigger on the chain.
      for (
        let step = 0;
        step < 20 && secondTurn.currentPlayer === firstPlayer;
        step++
      ) {
        const legal = getLegalActions(secondTurn, secondTurn.priorityPlayer);
        const action =
          secondTurn.phase === "choice"
            ? legal[0]
            : legal.find((candidate) => candidate.id === "pass");
        expect(action).toBeDefined();
        secondTurn = applyAction(secondTurn, action!);
      }
      expect(secondTurn.currentPlayer).toBe(1 - firstPlayer);
      expect(
        secondTurn.players[(1 - firstPlayer) as PlayerId].runes,
      ).toHaveLength(3);
    },
  );

  it("automatically handles a bot-first mulligan then waits for the human", () => {
    const game = createGame({ seed: 23, firstPlayer: 1 });
    const botChoice = getAutomaticAction(game)!;
    expect(botChoice.player).toBe(1);
    expect(botChoice.category).toBe("mulligan");
    const ownChoice = applyAction(game, botChoice);
    expect(ownChoice.priorityPlayer).toBe(0);
    expect(getAutomaticAction(ownChoice)).toBeUndefined();
    const restored = parseSession(
      JSON.stringify({ match: ownChoice, review: null }),
    ).match!;
    expect(restored.currentPlayer).toBe(1);
    expect(restored.priorityPlayer).toBe(0);
    expect(keep(restored).currentPlayer).toBe(1);
  });

  it("keeps the existing API default and deterministic shuffle stable", () => {
    expect(createGame({ seed: 81 })).toEqual(
      createGame({ seed: 81, firstPlayer: 0 }),
    );
    const human = createGame({ seed: 81, firstPlayer: 0 });
    const bot = createGame({ seed: 81, firstPlayer: 1 });
    for (const player of [0, 1] as const) {
      expect(bot.players[player].hand).toEqual(human.players[player].hand);
      expect(bot.players[player].deck).toEqual(human.players[player].deck);
    }
  });

  it("conserves a larger imported deck through bot-first replacements and persistence", () => {
    const draft = structuredClone(starterDecks[0]);
    draft.main.push({ cardId: draft.championId, count: 2 });
    const imported = parseDeckText(exportDeckText(draft)).deck!;
    const game = createGame({
      seed: 44,
      firstPlayer: 1,
      botDeck: imported,
      playerDeck: imported,
    });
    const initial = [mainCards(game, 0), mainCards(game, 1)];
    expect(initial[0]).toHaveLength(41);
    expect(game.players[1].deckList).toHaveLength(41);
    const selected = game.players[1].hand.slice(0, 2);
    const expectedReplacements = game.players[1].deck.slice(0, 2);
    const next = applyAction(game, "mulligan:0,1");
    expect(next.players[1].hand.slice(-2)).toEqual(expectedReplacements);
    expect(next.players[1].deck.slice(-2).sort()).toEqual(selected.sort());
    expect(mainCards(next, 1)).toEqual(initial[1]);
    const opened = keep(next);
    expect(mainCards(opened, 0)).toEqual(initial[0]);
    expect(mainCards(opened, 1)).toEqual(initial[1]);
    const restored = parseSession(
      JSON.stringify({ match: opened, review: null }),
    ).match;
    expect(restored).toEqual(opened);
  });
});
