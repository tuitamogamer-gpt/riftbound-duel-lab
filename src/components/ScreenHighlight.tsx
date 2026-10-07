import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import type { Review } from "./StepFlow";
import type { PlaybackSpeed } from "../game/playback";
import { publicTableEvents } from "../game/event-presentation";
import { momentKey } from "../game/table-presentation";
import { reviewDelay } from "../game/presentation";
import { useI18n } from "../i18n";
import "./ScreenHighlight.css";

export function ScreenHighlight({
  review,
  playbackSpeed = 1,
}: {
  review: Review | null;
  playbackSpeed?: PlaybackSpeed;
}) {
  const { t } = useI18n();
  const events = publicTableEvents(review);
  if (!review || !events.length) return null;
  const primary = events[0];
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
    >
      <span className="screen-highlight-edge" aria-hidden="true" />
      <div
        className="screen-highlight-label"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Sparkles size={15} aria-hidden="true" />
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
