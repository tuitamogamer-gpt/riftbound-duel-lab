import type { HistoryFrame } from "./match-history";
import { replayMoves } from "./replay-navigation";
import type { PlayerId } from "./types";

export interface DebriefMoment {
  kind: "score" | "board" | "resources" | "response" | "finish";
  frame: number;
  turn: number;
  actor: PlayerId;
  title: string;
  detail: string;
  values: Record<string, number>;
  lesson: string;
  label: string;
  importance: number;
}

/** Summarize observed consequences. Never infer a better move from a later hand. */
export function matchDebrief(frames: HistoryFrame[], viewer: PlayerId) {
  const scoring = { hold: 0, conquer: 0, effect: 0 };
  for (const frame of frames)
    for (const moment of frame.moments) {
      if (moment.player !== viewer) continue;
      const amount = Number(moment.values?.amount ?? 0);
      if (moment.kind === "hold") scoring.hold += amount;
      if (moment.kind === "conquer") scoring.conquer += amount;
      if (moment.kind === "score") scoring.effect += amount;
    }
  const candidates: DebriefMoment[] = [];
  const opponent = (1 - viewer) as PlayerId;
  for (const move of replayMoves(frames)) {
    const before = frames[Math.max(0, move.firstFrame - 1)].views[viewer];
    const after = frames[move.lastFrame].views[viewer];
    const own = before.players[viewer],
      next = after.players[viewer];
    const enemy = before.players[opponent],
      nextEnemy = after.players[opponent];
    const base = {
      frame: move.lastFrame,
      turn: move.turn,
      actor: move.actor,
      label: frames[move.firstFrame].labels[viewer],
    };
    const scoreChanged =
      own.points !== next.points || enemy.points !== nextEnemy.points;
    if (scoreChanged || (after.winner !== null && before.winner === null)) {
      const winning = after.winner !== null;
      candidates.push({
        ...base,
        kind: winning ? "finish" : "score",
        importance: winning
          ? 100
          : 80 +
            Math.abs(next.points - own.points) +
            Math.abs(nextEnemy.points - enemy.points),
        title: winning ? "The deciding moment" : "The score changed",
        detail: "Score: {youBefore}–{themBefore} → {youAfter}–{themAfter}",
        values: {
          youBefore: own.points,
          themBefore: enemy.points,
          youAfter: next.points,
          themAfter: nextEnemy.points,
        },
        lesson:
          "Review how control and scoring effects changed the race to victory.",
      });
      continue;
    }
    const ownBefore = before.units.filter(
      (unit) => unit.owner === viewer,
    ).length;
    const ownAfter = after.units.filter((unit) => unit.owner === viewer).length;
    const enemyBefore = before.units.filter(
      (unit) => unit.owner === opponent,
    ).length;
    const enemyAfter = after.units.filter(
      (unit) => unit.owner === opponent,
    ).length;
    if (ownAfter < ownBefore || enemyAfter < enemyBefore) {
      candidates.push({
        ...base,
        kind: "board",
        importance: 70 + ownBefore - ownAfter + enemyBefore - enemyAfter,
        title: "The board changed",
        detail:
          "Units in play: you {youBefore} → {youAfter} · opponent {themBefore} → {themAfter}",
        values: {
          youBefore: ownBefore,
          youAfter: ownAfter,
          themBefore: enemyBefore,
          themAfter: enemyAfter,
        },
        lesson:
          "Follow the effects to see which units left play and what remained to hold the battlefields.",
      });
      continue;
    }
    const answered =
      before.stack.length > 0 &&
      move.actor === viewer &&
      frames
        .slice(move.firstFrame, move.lastFrame + 1)
        .some((frame) =>
          frame.views[viewer].stack.some(
            (effect) =>
              effect.player === viewer &&
              !before.stack.some((old) => old.id === effect.id),
          ),
        );
    if (answered) {
      candidates.push({
        ...base,
        kind: "response",
        importance: 65,
        title: "You answered the chain",
        detail: "Pending effects: {before} → {after}",
        values: { before: before.stack.length, after: after.stack.length },
        lesson:
          "Revisit the response window and the order in which the effects resolved.",
      });
      continue;
    }
    const readyBefore = own.runes.filter((rune) => rune.ready).length;
    const readyAfter = next.runes.filter((rune) => rune.ready).length;
    if (
      move.actor === viewer &&
      (next.runes.length < own.runes.length ||
        (readyBefore > 0 && readyAfter === 0))
    ) {
      candidates.push({
        ...base,
        kind: "resources",
        importance: 50,
        title: "Your resource checkpoint",
        detail:
          "Ready runes: {before} → {after} · runes in play: {totalBefore} → {totalAfter}",
        values: {
          before: readyBefore,
          after: readyAfter,
          totalBefore: own.runes.length,
          totalAfter: next.runes.length,
        },
        lesson:
          "When committing runes, check the payment preview and the responses still available to you.",
      });
    }
  }
  const ranked = candidates.sort(
    (a, b) => b.importance - a.importance || a.frame - b.frame,
  );
  const moments: DebriefMoment[] = [];
  // Include different types of decisions instead of filling the recap with scoring alone.
  for (const candidate of ranked)
    if (!moments.some((moment) => moment.kind === candidate.kind))
      moments.push(candidate);
  for (const candidate of ranked)
    if (moments.length < 5 && !moments.includes(candidate))
      moments.push(candidate);
  return {
    scoring,
    moments: moments.slice(0, 5).sort((a, b) => a.frame - b.frame),
  };
}
