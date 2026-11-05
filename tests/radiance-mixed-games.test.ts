import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import { starterDecks, type StarterDeck } from "../src/data/decks";
import {
  createGame,
  getGameView,
  getMight,
  serializeGame,
} from "../src/game/engine";
import { decideBot } from "../src/game/bot";
import {
  applyDecision,
  getDecisionRequest,
  validateDecision,
} from "../src/game/ai/decisions";
import { radianceWave5Scripts } from "../src/game/radiance-wave5";
import { radianceWave6Scripts } from "../src/game/radiance-wave6";
import { radianceWave7Scripts } from "../src/game/radiance-wave7";
import { parseSession } from "../src/persistence";
import type { GameState, PlayerId } from "../src/game/types";

const rad = (n: number) => `rad-${String(n).padStart(3, "0")}-167`;
/** Every main-deck face scripted in Radiance waves 5–7. */
const pool = [
  ...new Set(
    [radianceWave5Scripts, radianceWave6Scripts, radianceWave7Scripts]
      .flatMap((scripts) => Object.keys(scripts))
      .filter((id) => ["Unit", "Spell", "Gear"].includes(getCard(id).type)),
  ),
];
const legends = [149, 147, 139, 143, 145, 151].map(rad);
const battlefields = [158, 160, 161, 162, 163, 164].map(rad);
const PICKS = 18;

/** Six decks cover the whole pool: 18 faces each, two copies, plus 4 cheap units. */
function radianceDeck(k: number): StarterDeck {
  const picks = Array.from(
    { length: PICKS },
    (_, i) => pool[(k * PICKS + i) % pool.length],
  );
  const cheap = pool.filter(
    (id) =>
      getCard(id).type === "Unit" &&
      (getCard(id).energy ?? 0) <= 3 &&
      !picks.includes(id),
  );
  const main = [
    ...picks.flatMap((id) => [id, id]),
    ...Array.from({ length: 4 }, (_, i) => cheap[(k * 5 + i) % cheap.length]),
  ];
  return {
    ...starterDecks[0],
    id: `radiance-mixed-${k}`,
    legendId: legends[k % legends.length],
    battlefieldId: battlefields[k % battlefields.length],
    battlefieldIds: undefined,
    main: [...new Set(main)].map((cardId) => ({
      cardId,
      count: main.filter((id) => id === cardId).length,
    })),
    runes: ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map((domain) => ({
      cardId: cards.find(
        (card) =>
          card.type === "Rune" &&
          card.set === "OGN" &&
          card.domains[0] === domain,
      )!.id,
      count: 2,
    })),
  };
}

function assertPosition(
  state: GameState,
  inventories: string[][],
  context: string,
) {
  for (const gear of state.gears) {
    const hybrid = state.units.find((piece) => piece.id === gear.id);
    if (hybrid)
      expect(gear, `${context}: one physical hybrid object`).toBe(hybrid);
  }
  for (const player of state.players) {
    const physicalBoard = new Map(
      [...state.units, ...state.gears]
        .filter(
          (piece) =>
            !piece.token && (piece.originalOwner ?? piece.owner) === player.id,
        )
        .map((piece) => [piece.id, piece.originalCardId ?? piece.cardId]),
    );
    const actual = [
      ...player.deck,
      ...player.hand,
      ...player.discard,
      ...player.banished,
      ...(player.championAvailable ? [player.championId] : []),
      ...physicalBoard.values(),
      ...state.stack
        .filter(
          (item) =>
            item.kind === "spell" &&
            (item.originalOwner ?? item.player) === player.id,
        )
        .map((item) => item.cardId),
      ...(state.resolving ?? [])
        .filter((item) => (item.originalOwner ?? item.player) === player.id)
        .map((item) => item.cardId),
      ...(state.pendingPlays ?? [])
        .filter((item) => (item.spec.zoneOwner ?? item.player) === player.id)
        .map((item) => item.cardId),
      ...(state.hidden ?? [])
        .filter((item) => item.owner === player.id)
        .map((item) => item.cardId),
    ].sort();
    expect(actual, `${context}: physical cards for ${player.id}`).toEqual(
      inventories[player.id],
    );
    expect(
      player.runes.length + player.runeDeck.length,
      `${context}: rune conservation`,
    ).toBe(12);
    for (const resource of [
      player.energy,
      player.power ?? 0,
      player.permanentPower ?? 0,
      player.points,
    ])
      expect(
        Number.isFinite(resource) && resource >= 0,
        `${context}: finite nonnegative resources`,
      ).toBe(true);
  }
  for (const piece of state.units)
    expect(
      Number.isFinite(getMight(state, piece)),
      `${context}: finite Might ${piece.id}`,
    ).toBe(true);
  const viewer = state.priorityPlayer;
  expect(
    getGameView(state, viewer).players[1 - viewer].hand,
    `${context}: opposing hand privacy`,
  ).toEqual([]);
}

describe("Radiance waves five through seven in complete bot games", () => {
  it("six decks cover every main-deck face of the three waves", () => {
    const covered = new Set(
      Array.from({ length: 6 }, (_, k) =>
        radianceDeck(k).main.map((e) => e.cardId),
      ).flat(),
    );
    expect(pool.filter((id) => !covered.has(id))).toEqual([]);
    for (let k = 0; k < 6; k++)
      expect(
        radianceDeck(k).main.reduce((n, e) => n + e.count, 0),
        `deck ${k}`,
      ).toBe(40);
  });

  it.each([0, 1, 2, 3, 4, 5])(
    "deck %i plays legal, resumable games to a winner",
    async (k) => {
      const seed = 101 + k;
      let state = createGame({
        playerDeck: radianceDeck(k),
        botDeck: radianceDeck((k + 3) % 6),
        seed,
        firstPlayer: (k % 2) as PlayerId,
        botDifficulty: "beginner",
      });
      const inventories = state.players.map((player) =>
        [...player.deck, ...player.hand, player.championId].sort(),
      );
      let steps = 0;
      let savedChoices = 0;
      while (state.winner === null && steps < 3000) {
        if (steps % 25 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const context = `decks ${k}/${(k + 3) % 6}, action ${steps}, turn ${state.turn}, ${state.phase}`;
        assertPosition(state, inventories, context);
        const before = serializeGame(state);
        const request = getDecisionRequest(state)!;
        const result = decideBot(state, state.priorityPlayer, {
          deterministic: true,
          maxNodes: 80,
        });
        expect(result, `${context}: mandatory bot decision`).not.toBeNull();
        expect(
          validateDecision(state, request, result!.decision).valid,
          `${context}: legal atomic decision`,
        ).toBe(true);
        expect(serializeGame(state), `${context}: read-only planning`).toBe(
          before,
        );
        const next = applyDecision(state, request, result!.decision);
        if (state.pendingChoice || steps % 40 === 0) {
          const restored = parseSession(
            JSON.stringify({ match: state, review: null }),
          ).match;
          expect(
            restored,
            `${context}: restore exact decision position`,
          ).toEqual(state);
          if (state.pendingChoice) savedChoices++;
        }
        state = next;
        steps++;
      }
      expect(
        state.winner,
        `decks ${k}/${(k + 3) % 6} stalled after ${steps} decisions`,
      ).not.toBeNull();
      expect(savedChoices).toBeGreaterThan(0);
      assertPosition(state, inventories, `decks ${k}/${(k + 3) % 6} final`);
    },
    300_000,
  );
});
