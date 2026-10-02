import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { cardArtUrl } from "../data/art";
import { getEffectView } from "../game/effect-presentation";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";
import "./EffectFeedback.css";

export function EffectAnnouncement({
  review,
  paused = false,
}: {
  review: Review | null;
  paused?: boolean;
}) {
  const { t } = useI18n();
  const view = getEffectView(review);
  if (!view) return null;
  return (
    <div
      className={`effect-announcement effect-${view.tone}`}
      role="status"
      key={`${review?.action.id}-${review?.index}`}
    >
      {view.source && (
        <img src={cardArtUrl(view.source)} alt={view.source.name} />
      )}
      <div className="effect-message">
        <span className="effect-kicker">
          <Sparkles size={12} />
          {t(
            view.runeOnly
              ? "Rune effect"
              : view.fieldId
                ? "Battlefield effect"
                : "Card effect",
          )}{" "}
          · {t(view.player === 0 ? "Ti" : "AI")}
          <b>
            {t(
              paused
                ? "Game paused"
                : view.effect?.stage === "announced"
                  ? "On the chain"
                  : "Resolving now",
            )}
          </b>
        </span>
        <strong>
          {view.source?.name ?? t(view.runeOnly ? "Runes" : "Effect")}
        </strong>
        <p>{t(view.label)}</p>
        {!!view.changes.length && (
          <div className="effect-outcomes">
            {view.changes.slice(0, 3).map((change, i) => (
              <span key={i} className={`outcome-${change.tone}`}>
                {change.player !== undefined
                  ? `${t(change.player === 0 ? "Ti" : "AI")} · `
                  : ""}
                {t(change.key, change.values)}
              </span>
            ))}
            {view.changes.length > 3 && (
              <span>
                +{view.changes.length - 3} {t("changes")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function FieldEffect({
  review,
  fieldId,
}: {
  review: Review | null;
  fieldId: string;
}) {
  const { t } = useI18n();
  const view = getEffectView(review);
  if (!view || view.fieldId !== fieldId) return null;
  const result = view.changes.find((c) => c.player !== undefined);
  return (
    <div
      className={`field-effect effect-${view.tone}`}
      key={`${review?.index}-${review?.action.id}`}
    >
      <span className="field-effect-wave" />
      <span className="field-effect-label">
        <Sparkles size={13} />
        {t(
          view.effect?.stage === "announced"
            ? "Battlefield activates"
            : "Battlefield effect",
        )}
        {result && (
          <>
            <ArrowRight size={12} />
            <b>{t(result.key, result.values)}</b>
          </>
        )}
      </span>
    </div>
  );
}

/** A short directional trace from the public source to the affected cards. */
export function EffectTrails({ review }: { review: Review | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const view = getEffectView(review);
  useLayoutEffect(() => {
    const layer = root.current;
    if (!layer || !view || !review) {
      setPaths([]);
      return;
    }
    const parent = layer.parentElement!;
    const measure = () => {
      const bounds = layer.getBoundingClientRect();
      const locate = (attribute: string, id: string | undefined) =>
        id
          ? [...parent.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(
              (element) => element.getAttribute(attribute) === id,
            )
          : undefined;
      const source =
        locate("data-unit-id", view.effect?.sourceId) ??
        locate("data-field-source", view.fieldId) ??
        locate("data-effect-player", String(view.player));
      const sourceRect = source?.getBoundingClientRect();
      const x = sourceRect
        ? sourceRect.x + sourceRect.width / 2 - bounds.x
        : bounds.width / 2;
      const y = sourceRect
        ? sourceRect.y + sourceRect.height / 2 - bounds.y
        : view.player === 0
          ? bounds.height - 20
          : 20;
      const ends = view.targets
        .map((id) => locate("data-unit-id", id))
        .filter((element) => element && element !== source);
      if (!ends.length && view.fieldId)
        ends.push(locate("data-effect-player", String(view.player)));
      setPaths(
        ends.filter(Boolean).map((element) => {
          const r = element!.getBoundingClientRect();
          const tx = r.x + r.width / 2 - bounds.x,
            ty = r.y + r.height / 2 - bounds.y;
          return `M ${x} ${y} Q ${(x + tx) / 2 + 25} ${(y + ty) / 2 - 25} ${tx} ${ty}`;
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [review]);
  return (
    <div
      ref={root}
      className={`effect-trails effect-${view?.tone ?? "effect"}`}
      aria-hidden="true"
    >
      <svg>
        {paths.map((d, i) => (
          <path key={`${review?.index}-${i}`} d={d} pathLength="1" />
        ))}
      </svg>
    </div>
  );
}
