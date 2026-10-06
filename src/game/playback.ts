import type { Review } from "../components/StepFlow";

export const PLAYBACK_SPEED_KEY = "riftbound-duel-playback-speed";
export const playbackSpeeds = [0.5, 1, 2] as const;
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

export function isPlaybackSpeed(value: number): value is PlaybackSpeed {
  return playbackSpeeds.includes(value as PlaybackSpeed);
}

export function readPlaybackSpeed(
  storage?: Pick<Storage, "getItem">,
): PlaybackSpeed {
  try {
    const value = Number(
      (storage ?? globalThis.localStorage)?.getItem(PLAYBACK_SPEED_KEY),
    );
    return isPlaybackSpeed(value) ? value : 1;
  } catch {
    return 1;
  }
}

/** Browse recorded frames only; never execute a decision or rewind the match. */
export function stepReview(
  review: Review | null,
  direction: -1 | 1 = 1,
): Review | null {
  if (!review) return null;
  const index = review.index + direction;
  if (index < 0) return review;
  if (index >= review.frames.length) return null;
  return { ...review, index };
}
