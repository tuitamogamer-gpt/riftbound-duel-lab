import type { Review } from "../components/StepFlow";
import type { GameState } from "../game/types";
import { momentKey } from "../game/table-presentation";
import { significantMoment } from "../motion/significant-events";

export type AudioCueKind =
  "champion" | "battle" | "impact" | "score" | "counter" | "victory" | "defeat";
export type AudioVoice = "champion" | "battle" | "victory" | "defeat";
export interface GameAudioCue {
  kind: AudioCueKind;
  key: string;
  voice?: AudioVoice;
}

/** Identify only the displayed frame, including repeated actions in one turn. */
export function audioFrameKey(review: Review | null): string | null {
  if (
    !review ||
    !Number.isInteger(review.index) ||
    review.index < 0 ||
    !review.frames[review.index]
  )
    return null;
  return `${review.before.revision ?? 0}:${momentKey(review)}`;
}

function contested(state: GameState) {
  const combat = state.combat;
  return (
    !!combat &&
    [combat.attacker, combat.defender].every((player) =>
      state.units.some(
        (unit) => unit.owner === player && unit.location === combat.fieldId,
      ),
    )
  );
}

/** One cue for an actual public moment; ordinary plays and priority stay quiet. */
export function audioCueForReview(review: Review | null): GameAudioCue | null {
  const key = audioFrameKey(review);
  if (!review || !key) return null;
  const now = review.frames[review.index].state;
  const before = review.index
    ? review.frames[review.index - 1].state
    : review.before;
  const moment = significantMoment(review);
  if (moment) {
    if (moment.kind === "victory") {
      const kind = moment.player === 0 ? "victory" : "defeat";
      return { kind, key, voice: kind };
    }
    if (moment.kind === "champion")
      return { kind: "champion", key, voice: "champion" };
    if (moment.kind === "conquer")
      return moment.player !== undefined &&
        now.players[moment.player].points > before.players[moment.player].points
        ? { kind: "score", key }
        : null;
    if (moment.kind === "counter") return { kind: "counter", key };
    if (moment.kind === "combat") return { kind: "impact", key };
  }
  if (
    contested(now) &&
    (!contested(before) || now.combat?.fieldId !== before.combat?.fieldId)
  )
    return { kind: "battle", key, voice: "battle" };
  return null;
}

/** Consume silent frames too: unmuting or resuming never queues old moments. */
export class AudioFrameTracker {
  private sessionKey: string | undefined;
  private seen = new Set<string>();

  take(
    review: Review | null,
    sessionKey: string | undefined,
    audible: boolean,
  ): GameAudioCue | null {
    if (sessionKey !== this.sessionKey) {
      this.sessionKey = sessionKey;
      this.seen.clear();
    }
    if (sessionKey === undefined) return null;
    const key = audioFrameKey(review);
    if (!key || this.seen.has(key)) return null;
    this.seen.add(key);
    if (this.seen.size > 512)
      this.seen.delete(this.seen.values().next().value!);
    return audible ? audioCueForReview(review) : null;
  }
}
