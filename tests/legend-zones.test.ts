import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { decks, expandDeck, getDeck } from "../src/data/decks";
import { exportDeckText, parseDeckText } from "../src/game/deck-import";
import {
  applyAction,
  createGame,
  getGameView,
  getLegalActions,
  type GameAction,
  type GameState,
} from "../src/game/engine";
import { getRulesCardId } from "../src/game/scripts";

// Official Core Rules 103.1, 103.2, 107.4, 108.3, 110–118:
// https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf
// Legend and chosen champion are separate public setup objects. Only the
// chosen champion counts toward the 40-card main deck and must be paid for.
function take(
  state: GameState,
  predicate: string | ((a: GameAction) => boolean),
) {
  const action = getLegalActions(state, state.priorityPlayer).find(
    typeof predicate === "string" ? (a) => a.id === predicate : predicate,
  );
  expect(
    action,
    `Missing action in ${state.phase}: ${String(predicate)}`,
  ).toBeDefined();
  return applyAction(state, action!);
}

function settle(state: GameState): GameState {
  for (let i = 0; i < 40 && (state.stack.length || state.pendingChoice); i++)
    state = take(state, state.pendingChoice ? () => true : "pass");
  expect(state.stack).toHaveLength(0);
  expect(state.pendingChoice).toBeNull();
  return state;
}

function begin(deckId: string) {
  return take(
    take(createGame({ playerDeckId: deckId, seed: 1204 }), "mulligan:"),
    "mulligan:",
  );
}

describe("Legend and chosen champion setup zones", () => {
  for (const mode of ["bundled", "imported"] as const)
    describe(mode, () => {
      it.each(decks)(
        "$id starts both players with the correct public pair",
        (deck) => {
          const selected =
            mode === "imported"
              ? parseDeckText(exportDeckText(deck)).deck!
              : deck;
          expect(selected).toBeDefined();
          const state = createGame({
            playerDeck: selected,
            botDeck: selected,
            seed: 118,
          });
          const legendId = getRulesCardId(deck.legendId);
          const championId = getRulesCardId(deck.championId);
          const main = expandDeck(deck.main).map(getRulesCardId).sort();

          for (const player of state.players) {
            expect(player.legendId).toBe(legendId);
            expect(getCard(player.legendId).type).toBe("Legend");
            expect(player.championId).toBe(championId);
            expect(getCard(player.championId).supertype).toBe("Champion");
            expect(player.championId).not.toBe(player.legendId);
            expect(player.championAvailable).toBe(true);
            expect(player.legendUsedTurn).toBe(-1);
            expect(player.hand).toHaveLength(4);
            expect(player.deck).toHaveLength(35);
            // Other copies of the chosen champion may legitimately be shuffled
            // into the main deck, so compare its complete card multiset.
            expect([...player.hand, ...player.deck].sort()).toEqual(main);
            expect([...player.hand, ...player.deck]).not.toContain(legendId);
            expect(
              player.hand.length +
                player.deck.length +
                Number(player.championAvailable),
            ).toBe(40);
          }
          expect(state.units).toEqual([]);
          for (const viewer of [0, 1] as const) {
            const view = getGameView(state, viewer);
            for (const player of view.players) {
              expect(player.legendId).toBe(legendId);
              expect(player.championId).toBe(championId);
              expect(player.championAvailable).toBe(true);
            }
            expect(view.players[viewer === 0 ? 1 : 0].hand).toEqual([]);
          }
          const mulligan = getLegalActions(state, state.priorityPlayer).find(
            (a) => a.cardIndices?.length === 2,
          )!;
          expect(mulligan).toBeDefined();
          const replaced = applyAction(state, mulligan);
          for (const player of replaced.players) {
            expect(player.legendId).toBe(legendId);
            expect(player.championId).toBe(championId);
            expect(player.championAvailable).toBe(true);
            expect([...player.hand, ...player.deck].sort()).toEqual(main);
          }
        },
      );
    });

  it("rejects an imported deck without its one separate Legend", () => {
    const text = exportDeckText(getDeck("annie"));
    for (const replacement of ["", "Legend\n2 ogs-017-024\n"])
      expect(
        parseDeckText(text.replace(/Legend\n[^\n]+\n/, replacement)).issues.map(
          (issue) => issue.code,
        ),
      ).toContain("legend-count");
  });

  it("playing the chosen champion empties only its zone and preserves the Legend", () => {
    let state = begin("annie");
    const player = state.players[0];
    const hand = [...player.hand];
    player.energy = 10;
    player.runes = [{ id: "champion-power", domain: "Fury", ready: true }];
    state = take(
      state,
      (a) => a.category === "play" && a.sourceId === "champion",
    );
    expect(state.players[0].championAvailable).toBe(false);
    expect(state.players[0].legendId).toBe(player.legendId);
    expect(state.players[0].hand).toEqual(hand);
    expect(
      state.units.some(
        (unit) => unit.cardId === player.championId && unit.owner === 0,
      ),
    ).toBe(true);
    expect(
      getLegalActions(state, 0).some(
        (action) => action.sourceId === "champion",
      ),
    ).toBe(false);
    expect(getGameView(state, 1).players[0].championAvailable).toBe(false);
  });
});

describe("Legend effects do not require playing the chosen champion", () => {
  it("Viktor creates a Recruit from the Legend zone and readies on his next turn", () => {
    let state = begin("precon-viktor");
    const legendId = state.players[0].legendId;
    state.players[0].energy = 1;
    state.players[0].runes = [];
    state = take(
      state,
      (a) => a.category === "ability" && a.sourceId === "legend",
    );
    expect(state.players[0].legendUsedTurn).toBe(state.turn);
    state = settle(state);
    expect(state.units).toHaveLength(1);
    expect(state.units[0]).toMatchObject({
      cardId: "ogn-271-298",
      owner: 0,
      location: "base:0",
      token: true,
    });
    expect(state.players[0].championAvailable).toBe(true);
    expect(state.players[0].legendId).toBe(legendId);
    expect(getLegalActions(state, 0).some((a) => a.sourceId === "legend")).toBe(
      false,
    );
    const exhaustedTurn = state.players[0].legendUsedTurn;
    state = settle(take(state, "end-turn"));
    expect(state.players[0].legendUsedTurn).toBe(exhaustedTurn);
    state = settle(take(state, "end-turn"));
    expect(state.players[0].legendUsedTurn).toBe(-1);
    expect(getLegalActions(state, 0).some((a) => a.sourceId === "legend")).toBe(
      true,
    );
  });

  it("Annie's automatic Legend effect readies two runes at the end of her turn", () => {
    let state = begin("annie");
    state.players[0].runes.forEach((rune) => {
      rune.ready = false;
    });
    expect(state.players[0].runes.filter((rune) => rune.ready)).toHaveLength(0);
    state = settle(take(state, "end-turn"));
    expect(state.players[0].runes.filter((rune) => rune.ready)).toHaveLength(2);
    expect(state.players[0].championAvailable).toBe(true);
    expect(state.units.filter((unit) => unit.owner === 0)).toEqual([]);
    expect(state.players[0].legendId).toBe(getDeck("annie").legendId);
  });
});
