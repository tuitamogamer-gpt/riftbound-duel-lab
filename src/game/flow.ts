import { getBotAction } from "./bot";
import { getLegalActions } from "./engine";
import type { GameAction, GameState } from "./types";

/** These only edit the proposed group; movement, payment and combat wait for confirmation. */
export function isMovementSelection(action: GameAction): boolean {
  return (
    action.player === 0 &&
    action.category === "move" &&
    (action.id.startsWith("move-start:") ||
      action.id.startsWith("move-toggle:") ||
      action.id === "move-cancel")
  );
}

/** Keep committing/cancelling a decision independent of paginated target options. */
export function decisionActions(game: GameState, actions: GameAction[]) {
  return {
    options:
      game.phase === "move"
        ? []
        : actions.filter((action) => action.id !== "damage-done"),
    confirm: actions.find(
      (action) => action.id === "move-confirm" || action.id === "damage-done",
    ),
    cancel: actions.find((action) => action.id === "move-cancel"),
  };
}

/** Only the opponent and a forced priority pass may advance without a decision. */
export function getAutomaticAction(
  game: GameState,
  training = false,
): GameAction | undefined {
  if (game.winner !== null) return;
  const opponent = getLegalActions(game, 1);
  if (opponent.length) {
    const picked =
      training && game.phase === "main" && !game.stack.length
        ? opponent.find((action) => action.category === "play") ||
          getBotAction(game)
        : getBotAction(game);
    return typeof picked === "string"
      ? opponent.find((action) => action.id === picked)
      : (picked ?? undefined);
  }
  const own = getLegalActions(game, 0);
  if (own.length === 1 && own[0].category === "pass") return own[0];
}

export function sourceActions(
  game: GameState,
  legal: GameAction[],
  selected: string | null,
) {
  const choices = legal.filter(
    (action) => !["pass", "end"].includes(action.category),
  );
  if (["choice", "damage", "move"].includes(game.phase)) return choices;
  if (selected) return choices.filter((action) => action.sourceId === selected);
  // Hand, board, Legend and Champion actions are reached by selecting their source.
  // Triggered, graveyard and battlefield actions still need an entry point.
  return choices.filter(
    (action) =>
      !action.sourceId ||
      action.sourceId.startsWith("trash:") ||
      action.sourceId.startsWith("field:"),
  );
}

export function selectedCardId(game: GameState, selected: string | null) {
  if (selected?.startsWith("hand:"))
    return game.players[0].hand[Number(selected.slice(5))];
  if (selected === "champion") return game.players[0].championId;
  if (selected === "legend") return game.players[0].legendId;
  if (selected?.startsWith("hidden:"))
    return game.hidden?.find(
      (card) => card.id === selected.slice(7) && card.owner === 0,
    )?.cardId;
  return (
    game.units.find((unit) => unit.id === selected)?.cardId ??
    game.gears.find((gear) => gear.id === selected)?.cardId
  );
}
