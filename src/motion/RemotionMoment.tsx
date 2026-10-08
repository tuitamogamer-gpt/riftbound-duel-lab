import { useEffect, useRef } from "react";
import { Player } from "@remotion/player";
import type { PlayerRef } from "@remotion/player";
import { RiftSealComposition } from "./RiftSealComposition";
import { useReducedMotion } from "./useReducedMotion";
import type { MomentMotionProps } from "./MomentMotion";

export default function RemotionMoment({
  kind,
  opponent = false,
  paused,
  speed,
}: MomentMotionProps) {
  const player = useRef<PlayerRef>(null);
  const reduced = useReducedMotion();
  const initial = useRef(true);
  useEffect(() => {
    const ref = player.current;
    if (!ref) return;
    if (reduced || (initial.current && paused)) ref.seekTo(21);
    if (paused || reduced) ref.pause();
    else ref.play();
    initial.current = false;
  }, [paused, reduced]);
  useEffect(() => () => player.current?.pause(), []);
  return (
    <Player
      ref={player}
      component={RiftSealComposition}
      inputProps={{
        kind: kind === "victory" ? "victory" : "champion",
        opponent,
      }}
      durationInFrames={72}
      fps={30}
      compositionWidth={160}
      compositionHeight={160}
      initialFrame={paused || reduced ? 21 : 0}
      playbackRate={speed}
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      allowFullscreen={false}
      initiallyMuted
      initialVolume={0}
      numberOfSharedAudioTags={0}
      moveToBeginningWhenEnded={false}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
