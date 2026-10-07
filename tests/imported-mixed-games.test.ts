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
import { getRulesCardId } from "../src/game/scripts";
import { cardWave13Scripts } from "../src/game/card-wave13";
import { cardWave14Scripts } from "../src/game/card-wave14";
import { cardWave15Scripts } from "../src/game/card-wave15";
import { cardWave16Scripts } from "../src/game/card-wave16";
import { cardWave17Scripts } from "../src/game/card-wave17";
import { cardWave18Scripts } from "../src/game/card-wave18";
import { cardWave19Scripts } from "../src/game/card-wave19";
import { cardWave20Scripts } from "../src/game/card-wave20";
import { cardWave21Scripts } from "../src/game/card-wave21";
import { cardWave22Scripts } from "../src/game/card-wave22";
import { cardWave23Scripts } from "../src/game/card-wave23";
import { cardWave24Scripts } from "../src/game/card-wave24";
import { cardWave25Scripts } from "../src/game/card-wave25";
import { cardWave26Scripts } from "../src/game/card-wave26";
import { parseSession } from "../src/persistence";
import type { GameState, PlayerId } from "../src/game/types";

const waves = [
  cardWave13Scripts,
  cardWave14Scripts,
  cardWave15Scripts,
  cardWave16Scripts,
  cardWave17Scripts,
  cardWave18Scripts,
  cardWave19Scripts,
  cardWave20Scripts,
  cardWave21Scripts,
  cardWave22Scripts,
  cardWave23Scripts,
  cardWave24Scripts,
  cardWave25Scripts,
  cardWave26Scripts,
];
const pool = (scripts: (typeof waves)[number]) => [
  ...new Set(
    Object.keys(scripts)
      .filter(
        (id) =>
          !getCard(id).variant &&
          ["Unit", "Spell", "Gear"].includes(getCard(id).type),
      )
      .map(getRulesCardId),
  ),
];

function mixedDeck(seed: number): StarterDeck {
  const types = ["Unit", "Unit", "Spell", "Gear"];
  const represented = waves.map((scripts, index) => {
    const all = pool(scripts);
    const preferred = all.filter(
      (id) => getCard(id).type === types[index % types.length],
    );
    const candidates = preferred.length ? preferred : all;
    expect(
      candidates.length,
      `wave ${13 + index} needs a playable main card`,
    ).toBeGreaterThan(0);
    return candidates[(seed + index) % candidates.length];
  });
  const units = [...new Set(waves.flatMap(pool))].filter(
    (id) => getCard(id).type === "Unit" && (getCard(id).energy ?? 0) <= 5,
  );
  // Mixed domains deliberately exercise the engine, rather than a legal event format.
  // Every imported wave is present; eleven additional cheap units keep games active.
  const main = [
    ...represented.flatMap((cardId) => [cardId, cardId]),
    ...Array.from(
      { length: 11 },
      (_, index) => units[(seed * 7 + index * 3) % units.length],
    ),
  ];
  return {
    ...starterDecks[0],
    id: `all-imports-${seed}`,
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
  expect(
    new Set(state.units.map((piece) => piece.id)).size,
    `${context}: unique unit identities`,
  ).toBe(state.units.length);
  expect(
    new Set(state.gears.map((piece) => piece.id)).size,
    `${context}: unique gear identities`,
  ).toBe(state.gears.length);
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
        .filter((item) => item.player === player.id)
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
      player.spellEnergy ?? 0,
      player.points,
      player.xp ?? 0,
    ])
      expect(
        Number.isFinite(resource) && resource >= 0,
        `${context}: finite nonnegative resources`,
      ).toBe(true);
  }
  for (const piece of state.units) {
    expect(
      Number.isFinite(getMight(state, piece)),
      `${context}: finite Might ${piece.id}`,
    ).toBe(true);
    for (const gearId of piece.gear)
      expect(
        state.gears.find((gear) => gear.id === gearId)?.attachedTo,
        `${context}: attached gear ${gearId}`,
      ).toBe(piece.id);
  }
  const viewer = state.priorityPlayer;
  const view = getGameView(state, viewer);
  expect(
    view.players[1 - viewer].hand,
    `${context}: opposing hand privacy`,
  ).toEqual([]);
  expect(
    view.players.every(
      (player) => player.deck.length === 0 && player.runeDeck.length === 0,
    ),
    `${context}: private draw order`,
  ).toBe(true);
}

describe("waves thirteen through twenty-six in complete mixed-deck games", () => {
  it.each([31, 72])(
    "seed %i conserves physical cards and resumes atomic decisions to a winner",
    async (seed) => {
      let state = createGame({
        playerDeck: mixedDeck(seed),
        botDeck: mixedDeck(seed + 1),
        seed,
        firstPlayer: (seed % 2) as PlayerId,
        botDifficulty: "beginner",
      });
      const inventories = state.players.map((player) =>
        [...player.deck, ...player.hand, player.championId].sort(),
      );
      const seen = new Set<string>();
      let steps = 0;
      let savedChoices = 0;
      while (state.winner === null && steps < 3000) {
        if (steps % 25 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const context = `seed ${seed}, action ${steps}, turn ${state.turn}, ${state.phase}`;
        assertPosition(state, inventories, context);
        const key = JSON.stringify({
          ...state,
          log: [],
          nextId: 0,
          revision: 0,
        });
        expect(seen.has(key), `${context}: rules progress`).toBe(false);
        seen.add(key);
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
        expect(next.revision, `${context}: one atomic revision`).toBe(
          (state.revision ?? 0) + 1,
        );
        if (state.pendingChoice || steps % 40 === 0) {
          const restored = parseSession(
            JSON.stringify({ match: state, review: null }),
          ).match;
          expect(
            restored,
            `${context}: restore exact decision position`,
          ).toEqual(state);
          const replay = decideBot(restored!, restored!.priorityPlayer, {
            deterministic: true,
            maxNodes: 80,
          });
          expect(
            replay!.decision,
            `${context}: restored deterministic plan`,
          ).toEqual(result!.decision);
          expect(
            applyDecision(restored!, request, replay!.decision),
            `${context}: resumed resolution once`,
          ).toEqual(next);
          if (state.pendingChoice) savedChoices++;
        }
        expect(
          serializeGame(state),
          `${context}: immutable application input`,
        ).toBe(before);
        state = next;
        steps++;
      }
      expect(
        state.winner,
        `seed ${seed} stalled after ${steps} decisions`,
      ).not.toBeNull();
      expect(state.phase).toBe("ended");
      expect(
        savedChoices,
        `seed ${seed}: real imported choices exercised`,
      ).toBeGreaterThan(0);
      assertPosition(state, inventories, `seed ${seed} final`);
    },
    180_000,
  );
});
