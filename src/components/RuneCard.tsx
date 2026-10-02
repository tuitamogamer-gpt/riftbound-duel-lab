import { useState } from "react";
import type { CSSProperties } from "react";
import { catalog, domainColors } from "../catalog";
import type { CatalogCard } from "../catalog";
import { cardArtUrl, hasLocalCardArt } from "../data/art";
import type { Rune } from "../game/types";
import { useI18n } from "../i18n";
import { ExhaustedToken } from "./ExhaustedToken";
import { runeEventLabels, type RuneEvent } from "../game/rune-presentation";
import "./RuneFeedback.css";

// Matches store a rune's domain, not its printing. Prefer cached standard art.
const runeCards = new Map(
  Object.keys(domainColors).map((domain) => {
    const matches = catalog.filter(
      (card) =>
        card.type === "Rune" && !card.variant && card.domains.includes(domain),
    );
    return [
      domain,
      matches.find((card) => hasLocalCardArt(card.id)) ?? matches[0],
    ];
  }),
);

export function RuneCard({
  rune,
  inspect,
  highlighted = false,
  event,
  eventKey,
  eventIndex = 0,
}: {
  rune: Rune;
  inspect: (card: CatalogCard) => void;
  highlighted?: boolean;
  event?: RuneEvent;
  eventKey?: string;
  eventIndex?: number;
}) {
  const { t } = useI18n();
  const card = runeCards.get(rune.domain);
  const src = card ? cardArtUrl(card) : undefined;
  const [failedSrc, setFailedSrc] = useState<string>();
  const state = t(rune.ready ? "Spremna" : "Iscrpljena");
  const name = card?.name ?? `${t(rune.domain)} ${t("Rune")}`;
  const eventLabel = event ? t(runeEventLabels[event]) : undefined;
  const recycled = event === "recycle";

  return (
    <button
      type="button"
      key={event ? eventKey : "idle"}
      className={`rune-card ${rune.ready ? "ready" : "spent"} ${highlighted ? "rune-changed" : ""}`}
      aria-label={`${name} · ${eventLabel ?? state}${recycled ? ` · ${t("Returns to rune deck")}` : ""}`}
      title={`${name} · ${eventLabel ?? state}`}
      disabled={recycled}
      data-rune-id={rune.id}
      data-rune-event={event}
      data-card-preview={recycled ? undefined : card?.id}
      data-card-ready={rune.ready}
      onClick={() => card && inspect(card)}
      style={
        {
          "--rune-color": domainColors[rune.domain] ?? "#a384dd",
          "--rune-event-delay": `${Math.min(eventIndex, 3) * 40}ms`,
        } as CSSProperties
      }
    >
      <span className="rune-card-art">
        {src && failedSrc !== src ? (
          <img src={src} alt={name} onError={() => setFailedSrc(src)} />
        ) : (
          <span className="rune-card-fallback" aria-hidden="true">
            ◈
          </span>
        )}
        {!recycled && <ExhaustedToken ready={rune.ready} compact />}
      </span>
      <span className="rune-card-state">{state}</span>
      {event && (
        <>
          <span className="rune-event-flare" aria-hidden="true" />
          <span className="rune-event-label" aria-hidden="true">
            <span className="rune-event-symbol">{recycled ? "↗" : event === "channel" ? "+" : event === "ready" ? "↻" : "↓"}</span>
            <span className="rune-event-word"> {eventLabel}</span>
          </span>
        </>
      )}
    </button>
  );
}
