import {
  applyAction,
  createGame,
  getLegalActions,
} from "../../src/game/engine";
import { championMoment } from "../../src/game/table-presentation";
import type {
  GameAction,
  GameState,
  LocationId,
  PlayerId,
} from "../../src/game/types";
import { parseSession, type SavedSession } from "../../src/persistence";
import { combatUnit, createCombatFixture } from "./combat";
import { championArrivalReview, eventOpening } from "./event-highlights";

export const mobileDuelModes = [
  "mulligan",
  "main",
  "move",
  "combat",
  "reaction",
  "hidden",
  "crowded",
  "champion",
] as const;
export type MobileDuelMode = (typeof mobileDuelModes)[number];

const hand = [
  "ogn-175-298",
  "ogn-009-298",
  "ogn-058-298",
  "ogn-049-298",
  "ogn-083-298",
  "ogn-088-298",
  "ogn-219-298",
  "ogn-064-298",
  "ogn-097-298",
  "ogn-175-298",
  "ogn-009-298",
  "ogn-058-298",
];

function readyGame(player: PlayerId = 0): GameState {
  const game = eventOpening(player);
  game.turn = 5;
  game.turnStep = "main";
  game.fields[0].controller = 0;
  game.fields[1].controller = 1;
  game.units = [
    {
      ...combatUnit("mobile-own-base-0", 0, 5),
      location: "base:0",
      ready: true,
    },
    { ...combatUnit("mobile-own-field-0", 0, 5, "ogn-049-298"), ready: true },
    {
      ...combatUnit("mobile-enemy-field-0", 1, 8, "ogn-219-298"),
      location: "field:1",
    },
    {
      ...combatUnit("mobile-enemy-base-0", 1, 8, "ogn-175-298"),
      location: "base:1",
    },
  ];
  for (const owner of game.players) {
    owner.energy = 12;
    owner.runes = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].flatMap(
      (domain) =>
        Array.from({ length: 2 }, (_, i) => ({
          id: `mobile-rune-${owner.id}-${domain}-${i}`,
          domain,
          ready: true,
        })),
    );
    owner.points = owner.id === 0 ? 3 : 4;
    owner.discard =
      owner.id === 0 ? ["ogn-009-298", "ogn-049-298"] : ["ogn-219-298"];
  }
  game.players[0].hand = [...hand];
  game.players[1].hand = ["ogn-088-298", "ogn-114-298", "ogn-198-298"];
  return game;
}

function requireAction(
  game: GameState,
  predicate: (action: GameAction) => boolean,
) {
  const action = getLegalActions(game, game.priorityPlayer).find(predicate);
  if (!action)
    throw new Error("Mobile QA fixture has no required legal action");
  return action;
}

/** Synthetic, deterministic sessions for isolated loopback browser QA. */
export function createMobileDuelSession(
  mode: MobileDuelMode = "main",
): SavedSession {
  let match: GameState;
  let session: SavedSession;
  if (mode === "champion") {
    const review = championArrivalReview();
    review.index = review.frames.findIndex((_, index) =>
      championMoment({ ...review, index }),
    );
    if (review.index < 0)
      throw new Error("Mobile QA champion has no public arrival frame");
    session = { match: review.final, review, paused: true };
  } else {
    if (mode === "mulligan") {
      match = createGame({
        seed: 20261007,
        firstPlayer: 0,
        playerDeckId: "annie",
        botDeckId: "lux",
      });
    } else if (mode === "combat") {
      match = createCombatFixture();
      match.turnStep = "main";
      match.players[0].hand = [...hand];
    } else {
      match = readyGame(mode === "reaction" ? 1 : 0);
      if (mode === "move") {
        match.units = Array.from({ length: 8 }, (_, i) => ({
          ...combatUnit(`mobile-move-${i}`, 0, 5),
          location: "base:0" as const,
          ready: true,
        }));
        match = applyAction(
          match,
          requireAction(
            match,
            (action) =>
              action.id.startsWith("move-start:") &&
              action.sourceId === "mobile-move-0" &&
              action.locationId === "field:1",
          ),
        );
      } else if (mode === "reaction") {
        match.players[1].hand = ["ogn-009-298"];
        match.players[0].hand = ["ogn-064-298", "ogn-083-298", "ogn-058-298"];
        match = applyAction(
          match,
          requireAction(
            match,
            (action) =>
              action.category === "play" &&
              action.sourceId === "hand:0" &&
              action.targetId === "mobile-own-field-0",
          ),
        );
        match = applyAction(match, "pass");
      } else if (mode === "hidden") {
        match.hidden = [
          {
            id: "mobile-own-ready",
            owner: 0,
            cardId: "ogn-097-298",
            location: "field:0",
            hiddenTurn: match.turn - 1,
          },
          {
            id: "mobile-own-fresh",
            owner: 0,
            cardId: "ogn-083-298",
            location: "field:1",
            hiddenTurn: match.turn,
          },
          {
            id: "mobile-enemy-private",
            owner: 1,
            cardId: "ogn-199-298",
            location: "field:1",
            hiddenTurn: match.turn - 1,
          },
        ];
      } else if (mode === "crowded") {
        const positions: {
          location: LocationId;
          owner: PlayerId;
          prefix: string;
        }[] = [
          { location: "base:0", owner: 0, prefix: "mobile-own-base" },
          { location: "field:0", owner: 0, prefix: "mobile-own-field" },
          { location: "field:1", owner: 1, prefix: "mobile-enemy-field" },
          { location: "base:1", owner: 1, prefix: "mobile-enemy-base" },
        ];
        match.units = positions.flatMap(({ location, owner, prefix }) =>
          Array.from({ length: 8 }, (_, i) => ({
            ...combatUnit(
              `${prefix}-${i}`,
              owner,
              8,
              ["ogn-175-298", "ogn-049-298", "ogn-219-298"][i % 3],
            ),
            location,
            ready: i % 3 !== 0,
            buff: i === 1 ? 1 : 0,
            damage: i === 2 ? 2 : 0,
            stunned: i === 3,
          })),
        );
      }
    }
    session = { match, review: null, paused: false };
  }
  if (!parseSession(JSON.stringify(session)).match)
    throw new Error(`Invalid mobile QA session: ${mode}`);
  return session;
}
