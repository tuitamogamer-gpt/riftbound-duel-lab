import type { Review } from "../../src/components/StepFlow";
import {
  applyAction,
  applyActionStepped,
  getLegalActions,
} from "../../src/game/engine";
import type { GameAction, GameState } from "../../src/game/types";
import { parseSession, type SavedSession } from "../../src/persistence";
import { combatUnit, createCombatFixture } from "./combat";

export const ergonomicsModes = [
  "move",
  "move-confirm",
  "damage",
  "choice",
  "reaction",
  "forced-pass",
  "hidden",
  "end-turn",
  "paused-review",
] as const;
export type ErgonomicsMode = (typeof ergonomicsModes)[number];

function act(
  game: GameState,
  match: string | ((action: GameAction) => boolean),
) {
  const action = getLegalActions(game, game.priorityPlayer).find(
    typeof match === "string" ? (action) => action.id === match : match,
  );
  if (!action)
    throw new Error(
      `Missing legal ergonomics fixture action: ${String(match)}`,
    );
  return applyAction(game, action);
}

function opening() {
  const game = createCombatFixture();
  game.phase = "main";
  game.turnStep = "main";
  game.combat = null;
  game.chainStarter = null;
  game.consecutivePasses = 0;
  game.stack = [];
  game.units = [
    {
      ...combatUnit("mover", 0, 4, "ogn-049-298"),
      location: "base:0",
      ready: true,
    },
    { ...combatUnit("second-mover", 0, 3), location: "base:0", ready: true },
    combatUnit("ally", 0, 8, "ogn-049-298"),
    combatUnit("enemy", 1, 8, "ogn-088-298"),
  ];
  game.fields.forEach((field) => {
    field.cardId = "ogn-279-298";
    field.controller = null;
  });
  for (const player of game.players) {
    player.legendId = "ogs-009-024";
    player.energy = 10;
    player.power = 10;
    player.championAvailable = false;
    player.hand = [];
    player.runes = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map(
      (domain, index) => ({
        id: `rune-${player.id}-${index}`,
        domain,
        ready: true,
      }),
    );
  }
  return game;
}

/** Real legal actions create every proposed move, incoming spell and mandatory choice. */
export function createErgonomicsSession(mode: ErgonomicsMode): SavedSession {
  let game = opening();
  let review: Review | null = null;
  let paused = false;
  if (mode === "move-confirm") game = act(game, "move-start:mover:field:1");
  else if (mode === "damage") game = createCombatFixture();
  else if (mode === "choice") {
    game.units = [
      combatUnit("choice-ally", 0, 8, "ogn-049-298"),
      combatUnit("choice-other", 0, 8, "ogn-049-298"),
    ];
    game.fields[0].controller = 0;
    game.hidden = [
      {
        id: "edge",
        owner: 0,
        cardId: "sfd-139-221",
        location: "field:0",
        hiddenTurn: game.turn - 1,
      },
    ];
    game = act(
      game,
      (action) =>
        action.sourceId === "hidden:edge" && action.category === "play",
    );
    if (game.pendingChoice?.kind !== "trigger")
      throw new Error(
        "Real Hidden Edge resolver did not create its mandatory choice",
      );
  } else if (
    ["reaction", "forced-pass", "hidden", "paused-review"].includes(mode)
  ) {
    game.currentPlayer = 1;
    game.priorityPlayer = 1;
    game.focusPlayer = 1;
    game.players[1].hand = ["ogn-009-298"];
    if (mode === "reaction") game.players[0].hand = ["ogn-058-298"];
    if (mode === "hidden") {
      game.hidden = [
        {
          id: "own-fae",
          owner: 0,
          cardId: "ogn-097-298",
          location: "field:0",
          hiddenTurn: game.turn - 1,
        },
        {
          id: "private-enemy",
          owner: 1,
          cardId: "ogn-083-298",
          location: "field:1",
          hiddenTurn: game.turn - 1,
        },
      ];
      game.fields[0].controller = 0;
      game.fields[1].controller = 1;
    }
    game = act(
      game,
      (action) =>
        action.category === "play" &&
        action.sourceId === "hand:0" &&
        action.targetId === "ally",
    );
    if (game.priorityPlayer === 1) game = act(game, "pass");
    if (mode === "paused-review") {
      const before = game;
      const action = getLegalActions(game, 0).find(
        (action) => action.id === "pass",
      );
      if (!action) throw new Error("Missing real review pass");
      const result = applyActionStepped(game, action);
      game = result.state;
      review = { before, final: game, frames: result.frames, index: 0, action };
      paused = true;
    }
  } else if (mode === "end-turn") {
    game.units = [];
    game.players[0].energy = 0;
    game.players[0].power = 0;
    game.players[0].runes = [];
  }
  const session = { match: game, review, paused };
  if (!parseSession(JSON.stringify(session)).match)
    throw new Error(`Invalid ergonomics session: ${mode}`);
  const legal = getLegalActions(game, 0);
  if (
    mode === "forced-pass" &&
    !(legal.length === 1 && legal[0].category === "pass")
  )
    throw new Error(
      `Forced-pass fixture has another legal decision: ${legal.map((a) => a.id).join(", ")}`,
    );
  if (
    mode === "reaction" &&
    !legal.some((action) => action.category === "play")
  )
    throw new Error("Reaction fixture has no real playable reaction");
  if (
    mode === "hidden" &&
    !legal.some((action) => action.sourceId === "hidden:own-fae")
  )
    throw new Error("Hidden fixture has no real reveal reaction");
  return session;
}
