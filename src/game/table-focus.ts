import { publicActionTargets } from "./action-target-presentation";
import { hiddenHandStatus } from "./hidden-presentation";
import type { GameAction, GameState } from "./types";

export type TableFocus = "opening" | "hand" | "board" | "balanced";

/** Layout follows the current public decision; it never changes a game action. */
export function tableFocus(
  game: GameState,
  actions: GameAction[],
  selected: string | null,
  reviewing: boolean,
): TableFocus {
  if (game.phase === "mulligan" && !game.players[0].mulliganDone)
    return "opening";
  if (game.winner !== null || reviewing) return "balanced";
  if (hiddenHandStatus(game, selected, actions)) return "balanced";
  if (game.phase === "move" || game.phase === "damage" || game.combat)
    return "board";
  if (
    selected &&
    actions.some(
      (action) => publicActionTargets(game, action).length || action.locationId,
    )
  )
    return "board";
  if (
    game.phase === "choice" &&
    actions.some((action) => publicActionTargets(game, action).length)
  )
    return "board";
  if (
    game.priorityPlayer === 0 &&
    game.players[0].hand.length &&
    !game.stack.length &&
    !selected &&
    game.phase === "main"
  )
    return "hand";
  return "balanced";
}
