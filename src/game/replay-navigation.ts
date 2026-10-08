import type { HistoryFrame } from "./match-history";
import type { PlayerId } from "./types";

export interface ReplayTurn {
  turn: number;
  player: PlayerId;
  firstFrame: number;
  lastFrame: number;
}

export interface ReplayMove {
  decisionIndex: number;
  actor: PlayerId;
  firstFrame: number;
  lastFrame: number;
  turn: number;
  labels: [string, string];
  moments: HistoryFrame["moments"];
}

/** Navigation reads the same observed frames as the replay; it never sees engine state. */
export function replayTurns(frames: HistoryFrame[]): ReplayTurn[] {
  const turns: ReplayTurn[] = [];
  frames.forEach((frame, index) => {
    const view = frame.views[0];
    const previous = turns.at(-1);
    if (previous?.turn === view.turn && previous.player === view.currentPlayer)
      previous.lastFrame = index;
    else
      turns.push({
        turn: view.turn,
        player: view.currentPlayer,
        firstFrame: index,
        lastFrame: index,
      });
  });
  return turns;
}

/** One row per actual decision, including every public effect in its frame range. */
export function replayMoves(frames: HistoryFrame[]): ReplayMove[] {
  const moves: ReplayMove[] = [];
  frames.forEach((frame, index) => {
    if (frame.decisionIndex < 0 || frame.actor === undefined) return;
    const previous = moves.at(-1);
    if (previous?.decisionIndex === frame.decisionIndex) {
      previous.lastFrame = index;
      previous.moments.push(...frame.moments);
    } else
      moves.push({
        decisionIndex: frame.decisionIndex,
        actor: frame.actor,
        firstFrame: index,
        lastFrame: index,
        turn: frame.views[0].turn,
        labels: [...frame.labels],
        moments: [...frame.moments],
      });
  });
  return moves;
}

export function adjacentMoment(
  frames: HistoryFrame[],
  index: number,
  direction: -1 | 1,
): number | undefined {
  if (direction === 1) {
    const next = frames.findIndex(
      (frame, position) => position > index && frame.moments.length,
    );
    return next === -1 ? undefined : next;
  }
  for (
    let position = Math.min(index - 1, frames.length - 1);
    position >= 0;
    position--
  )
    if (frames[position].moments.length) return position;
  return undefined;
}
