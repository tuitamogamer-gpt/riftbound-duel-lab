import { useLayoutEffect, useRef } from "react";
import { Flag, ShieldX, Swords } from "lucide-react";
import {
  createTacticalBurstTimeline,
  TACTICAL_BURST_HERO_TIME,
} from "./hyperframes-timeline";
import type { TacticalBurstKind } from "./hyperframes-timeline";
import type { MomentMotionProps } from "./MomentMotion";
import { useReducedMotion } from "./useReducedMotion";

export default function TacticalMoment({
  kind,
  paused,
  speed,
}: MomentMotionProps) {
  const root = useRef<HTMLSpanElement>(null);
  const timeline = useRef<ReturnType<
    typeof createTacticalBurstTimeline
  > | null>(null);
  const pausedNow = useRef(paused);
  pausedNow.current = paused;
  const reduced = useReducedMotion();
  const Icon = kind === "counter" ? ShieldX : kind === "combat" ? Swords : Flag;
  useLayoutEffect(() => {
    if (!root.current) return;
    const current = createTacticalBurstTimeline(root.current, {
      kind: kind as TacticalBurstKind,
      reducedMotion: reduced,
    });
    timeline.current = current;
    if (reduced || pausedNow.current) current.pause(TACTICAL_BURST_HERO_TIME);
    else current.play();
    return () => {
      current.revert();
      timeline.current = null;
    };
  }, [kind, reduced]);
  useLayoutEffect(() => {
    const current = timeline.current;
    if (!current) return;
    current.timeScale(speed);
    if (paused || reduced) current.pause();
    else current.play();
  }, [paused, reduced, speed]);
  return (
    <span className="tactical-motion" ref={root}>
      <span className="tactical-rest-icon">
        <Icon />
      </span>
      <span data-motion-aura />
      <span data-motion-ring />
      <span data-motion-rays>
        <svg
          viewBox="0 0 80 80"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <path d="M40 4v9M40 67v9M4 40h9M67 40h9M14 14l6 6M60 60l6 6M14 66l6-6M60 20l6-6" />
        </svg>
      </span>
      <span data-motion-seal>
        <Icon />
      </span>
    </span>
  );
}
