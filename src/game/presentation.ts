import type { Review } from "../components/StepFlow";
import type { GameState, TurnStep } from "./types";
import { getRuneChanges } from "./rune-presentation";

export function visibleTurnStep(game: GameState): TurnStep {
  if (game.pendingAwaken !== undefined) return "awaken";
  if (
    game.pendingBeginning !== undefined ||
    game.pendingTurnStart !== undefined
  )
    return "beginning";
  return game.turnStep ?? "main";
}

export function priorityWindow(game: GameState) {
  if (game.winner !== null) return "ended";
  if (game.phase === "mulligan") return "opening";
  if (game.phase === "choice") return "choice";
  if (game.phase === "damage") return "damage";
  if (game.stack.length) return "reaction";
  if (visibleTurnStep(game) !== "main") return "starting";
  if (game.phase === "move") return "move";
  return "action";
}

/** Pace follows the displayed turn, including a bot pass that begins YOUR turn. */
export function reviewDelay(review: Review): number {
  const frame = review.frames[review.index];
  if (!frame) return 500;
  const humanTurn = frame.state.currentPlayer === 0;
  if (frame.combat?.stage === "start" || frame.combat?.stage === "impact")
    return humanTurn ? 1900 : 1200;
  if (frame.combat) return humanTurn ? 1350 : 750;
  if (frame.effect) return humanTurn ? 1800 : 1400;
  // Public cards cross the table before settling; leave enough time to read them.
  if (
    review.action.category === "play" &&
    !review.action.id.startsWith("hide:")
  )
    return humanTurn ? 1650 : 1400;
  if (getRuneChanges(review).length) return humanTurn ? 1700 : 700;
  if (visibleTurnStep(frame.state) !== "main") return humanTurn ? 1500 : 450;
  if (frame.state.stack.length || frame.state.phase === "showdown")
    return humanTurn ? 1150 : 650;
  return humanTurn ? 950 : 400;
}

export function automaticDelay(game: GameState, player: 0 | 1) {
  // Even a forced human pass leaves time to read the window before it closes.
  return player === 0 ? 1700 : game.phase === "move" ? 240 : 450;
}
