import { Component, lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Crown, Flag, ShieldX, Swords, Trophy } from "lucide-react";
import type { PlaybackSpeed } from "../game/playback";
import type { SignificantMomentKind } from "./significant-events";
import "./MomentMotion.css";

const RemotionMoment = lazy(() => import("./RemotionMoment"));
const TacticalMoment = lazy(() => import("./TacticalMoment"));

export type MomentMotionProps = {
  kind: SignificantMomentKind;
  opponent?: boolean;
  paused: boolean;
  speed: PlaybackSpeed;
};

class MotionBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Decorative lazy players cannot own focus, delay a decision or announce twice. */
export function MomentMotion(props: MomentMotionProps) {
  const cinematic = props.kind === "champion" || props.kind === "victory";
  const Icon =
    props.kind === "champion"
      ? Crown
      : props.kind === "victory"
        ? Trophy
        : props.kind === "counter"
          ? ShieldX
          : props.kind === "combat"
            ? Swords
            : Flag;
  const fallback = <Icon className="moment-motion-fallback" />;
  return (
    <span
      className={`moment-motion motion-${props.kind}${props.opponent ? " motion-opponent" : ""}`}
      aria-hidden="true"
      inert
      data-motion-kind={props.kind}
      data-motion-engine={cinematic ? "remotion" : "hyperframes"}
      data-motion-paused={props.paused}
    >
      <MotionBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          {cinematic ? (
            <RemotionMoment {...props} />
          ) : (
            <TacticalMoment {...props} />
          )}
        </Suspense>
      </MotionBoundary>
    </span>
  );
}
