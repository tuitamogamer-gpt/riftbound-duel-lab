import { useEffect, useRef } from "react";
import type { Review } from "../components/StepFlow";
import { AudioFrameTracker, audioFrameKey } from "../audio/events";
import { getGameAudioPlayer } from "../audio/player";
import type { AudioPreferences } from "../audio/player";

type GameAudioOptions = AudioPreferences & {
  review: Review | null;
  sessionKey: string | undefined;
  active: boolean;
};

/** Audio follows only the currently displayed transition, never the future match. */
export function useGameAudio({
  review,
  sessionKey,
  active,
  enabled,
  volume,
  announcerEnabled,
}: GameAudioOptions) {
  const tracker = useRef<AudioFrameTracker | null>(null);
  tracker.current ??= new AudioFrameTracker();
  const player = getGameAudioPlayer();
  const frame = audioFrameKey(review);

  useEffect(() => {
    player.configure({ enabled, volume, announcerEnabled });
  }, [player, enabled, volume, announcerEnabled]);

  useEffect(() => {
    const unlock = (event: Event) => {
      if (event.isTrusted && document.visibilityState !== "hidden")
        void player.unlock();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") player.stop();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      player.stop();
    };
  }, [player]);

  useEffect(() => {
    player.setFrame(sessionKey === undefined ? null : `${sessionKey}:${frame}`);
    if (!active) player.stopGame();
    const cue = tracker.current!.take(
      review,
      sessionKey,
      active && enabled && volume > 0 && document.visibilityState !== "hidden",
    );
    if (cue) void player.play(cue);
    // The complete displayed review participates so edits to a loaded session
    // cannot preserve an old cue merely because its frame key happens to match.
  }, [
    player,
    review,
    sessionKey,
    frame,
    active,
    enabled,
    volume,
    announcerEnabled,
  ]);
}
