import type { CSSProperties } from "react";
import {
  ArrowRight,
  Crown,
  Layers,
  ShieldX,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import type { Review } from "./StepFlow";
import type { PlaybackSpeed } from "../game/playback";
import { publicTableEvents } from "../game/event-presentation";
import {
  championMoment,
  momentKey,
  phaseMoment,
  scoreMoment,
} from "../game/table-presentation";
import { reviewDelay } from "../game/presentation";
import { useI18n } from "../i18n";
import "./ScreenHighlight.css";
import { MomentMotion } from "../motion/MomentMotion";
import { significantMoment } from "../motion/significant-events";

export function ScreenHighlight({
  review,
  playbackSpeed = 1,
  motionPaused = false,
}: {
  review: Review | null;
  playbackSpeed?: PlaybackSpeed;
  motionPaused?: boolean;
}) {
  const { t } = useI18n();
  const events = publicTableEvents(review);
  if (!review || !events.length) return null;
  const primary = events[0];
  const significant = significantMoment(review);
  // The richer table moment already announces this same public transition.
  const covered =
    (primary.kind === "champion" && !!championMoment(review)) ||
    (primary.kind === "score" && !!scoreMoment(review)) ||
    (primary.kind === "draw" && !!review.frames[review.index]?.draw) ||
    (primary.kind === "phase" && !!phaseMoment(review));
  const Icon =
    primary.kind === "victory" || primary.kind === "score"
      ? Trophy
      : primary.kind === "champion"
        ? Crown
        : primary.kind === "combat"
          ? Swords
          : primary.kind === "counter"
            ? ShieldX
            : primary.kind === "damage" || primary.kind === "destroy"
              ? Zap
              : primary.kind === "move"
                ? ArrowRight
                : primary.kind === "draw"
                  ? Layers
                  : Sparkles;
  const tone = ["damage", "destroy", "counter"].includes(primary.kind)
    ? "danger"
    : ["champion", "victory", "score"].includes(primary.kind)
      ? "gold"
      : primary.player === 1
        ? "opponent"
        : "friendly";
  return (
    <div
      className={`screen-highlight highlight-${tone}`}
      key={momentKey(review)}
      style={
        {
          "--highlight-duration": `${reviewDelay(review, playbackSpeed)}ms`,
        } as CSSProperties
      }
      data-highlight-kind={primary.kind}
      data-highlight-tone={tone}
      data-highlight-covered={covered || undefined}
      data-highlight-significant={!!significant}
    >
      <span className="screen-highlight-edge" aria-hidden="true" />
      <div
        className="screen-highlight-label"
        role={covered ? undefined : "status"}
        aria-live={covered ? undefined : "polite"}
        aria-atomic={covered ? undefined : true}
        aria-hidden={covered || undefined}
      >
        {significant && !covered ? (
          <MomentMotion
            key={significant.key}
            kind={significant.kind}
            opponent={significant.player === 1}
            paused={motionPaused}
            speed={playbackSpeed}
          />
        ) : (
          <Icon size={16} aria-hidden="true" />
        )}
        <span>
          {primary.player !== undefined && (
            <small>{t(primary.player === 0 ? "Ti" : "AI")} · </small>
          )}
          <strong>{t(primary.label, primary.values)}</strong>
          {events.length > 1 && (
            <span className="screen-highlight-detail">
              {t(events[1].label, events[1].values)}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
