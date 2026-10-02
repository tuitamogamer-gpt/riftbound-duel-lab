import type { Review } from "../components/StepFlow";
import type { PlayerId, Rune } from "./types";

export type RuneEvent = "channel" | "recycle" | "ready" | "exhaust";
export interface RuneChange {
  rune: Rune;
  player: PlayerId;
  kind: RuneEvent;
  index: number;
}

/** Public rune changes in this frame only; removed runes remain available as visual ghosts. */
export function getRuneChanges(review: Review | null): RuneChange[] {
  if (!review || !Number.isInteger(review.index) || review.index < 0) return [];
  const now = review.frames[review.index]?.state;
  const before = review.index
    ? review.frames[review.index - 1]?.state
    : review.before;
  if (!now || !before) return [];
  const changes: RuneChange[] = [];
  for (const player of [0, 1] as const) {
    const previous = before.players[player].runes;
    const current = now.players[player].runes;
    current.forEach((rune, index) => {
      const old = previous.find((r) => r.id === rune.id);
      const kind = !old
        ? "channel"
        : old.ready === rune.ready
          ? null
          : rune.ready
            ? "ready"
            : "exhaust";
      if (kind) changes.push({ rune, player, kind, index });
    });
    previous.forEach((rune, index) => {
      if (!current.some((r) => r.id === rune.id))
        changes.push({ rune, player, kind: "recycle", index });
    });
  }
  return changes;
}

export const runeEventLabels: Record<RuneEvent, string> = {
  channel: "Channeled",
  recycle: "Recycled",
  ready: "Readied",
  exhaust: "Exhausted",
};
export const runeOutcomeLabels: Record<RuneEvent, string> = {
  channel: "Channel · +{amount} rune(s)",
  recycle: "Recycle · {amount} rune(s) → deck",
  ready: "Ready · {amount} rune(s)",
  exhaust: "Exhaust · {amount} rune(s)",
};
