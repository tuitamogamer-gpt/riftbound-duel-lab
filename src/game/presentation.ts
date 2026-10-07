import type { Review } from "../components/StepFlow";
import type { GameState, TurnStep } from "./types";
import { getRuneChanges } from "./rune-presentation";
import { scoreMoment, phaseMoment, championMoment } from "./table-presentation";
import type { PlaybackSpeed } from "./playback";

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

/** Turn ownership and the player being asked to decide are separate. */
export function matchStatus(
  game: GameState,
  { paused = false, reviewing = false } = {},
) {
  if (paused) return { state: "paused", label: "Game paused" };
  if (reviewing) return { state: "resolving", label: "Resolving effects" };
  if (game.winner !== null) return { state: "ended", label: "Match complete" };
  if (game.priorityPlayer === 1)
    return { state: "opponent", label: "Opponent is playing" };
  if (game.phase === "mulligan")
    return { state: "you", label: "Choose your opening hand" };
  if (game.phase === "choice")
    return { state: "you", label: "Choose an effect" };
  if (game.phase === "damage")
    return { state: "you", label: "Choose a damage target" };
  if (game.phase === "move") return { state: "you", label: "Move your units" };
  if (game.stack.length) return { state: "reaction", label: "Your reaction" };
  if (game.phase === "showdown")
    return { state: "you", label: "Action window" };
  return {
    state: "you",
    label: game.currentPlayer === 0 ? "Your turn" : "You have priority",
  };
}

/** Pace follows the displayed turn, including a bot pass that begins YOUR turn. */
export function reviewDelay(review: Review, speed: PlaybackSpeed = 1): number {
  return Math.round(baseReviewDelay(review) / speed);
}

function baseReviewDelay(review: Review): number {
  const frame = review.frames[review.index];
  if (!frame) return 500;
  const humanTurn = frame.state.currentPlayer === 0;
  if (championMoment(review)) return 3000;
  if (scoreMoment(review)) return 3400;
  if (frame.draw)
    return frame.draw.player === 0
      ? 4400 + Math.min(2, frame.draw.count - 1) * 500
      : 2800;
  if (phaseMoment(review)) return 2600;
  if (frame.combat?.stage === "start" || frame.combat?.stage === "impact")
    return 2200;
  if (frame.combat) return 1700;
  if (frame.effect) return 1900;
  // Public cards cross the table before settling; leave enough time to read them.
  if (
    review.action.category === "play" &&
    !review.action.id.startsWith("hide:")
  )
    return 1900;
  if (getRuneChanges(review).length) return 1800;
  if (visibleTurnStep(frame.state) !== "main") return 1500;
  if (frame.state.stack.length || frame.state.phase === "showdown") return 1200;
  return humanTurn ? 1000 : 850;
}

export function automaticDelay(
  game: GameState,
  player: 0 | 1,
  speed: PlaybackSpeed = 1,
) {
  // Even a forced human pass leaves time to read the window before it closes.
  return player === 0
    ? 1700
    : Math.round((game.phase === "move" ? 500 : 1050) / speed);
}
