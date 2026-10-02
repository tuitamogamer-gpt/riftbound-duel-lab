import { useState } from "react";
import type { CSSProperties } from "react";
import { catalog, domainColors } from "../catalog";
import type { CatalogCard } from "../catalog";
import { cardArtUrl, hasLocalCardArt } from "../data/art";
import type { Rune } from "../game/types";
import { useI18n } from "../i18n";
import { ExhaustedToken } from "./ExhaustedToken";

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
}: {
  rune: Rune;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const card = runeCards.get(rune.domain);
  const src = card ? cardArtUrl(card) : undefined;
  const [failedSrc, setFailedSrc] = useState<string>();
  const state = t(rune.ready ? "Spremna" : "Iscrpljena");
  const name = card?.name ?? `${t(rune.domain)} ${t("Rune")}`;

  return (
    <button
      type="button"
      className={`rune-card ${rune.ready ? "ready" : "spent"}`}
      aria-label={`${name} · ${state}`}
      title={`${name} · ${state}`}
      data-card-preview={card?.id}
      data-card-ready={rune.ready}
      onClick={() => card && inspect(card)}
      style={
        {
          "--rune-color": domainColors[rune.domain] ?? "#a384dd",
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
        <ExhaustedToken ready={rune.ready} compact />
      </span>
      <span className="rune-card-state">{state}</span>
    </button>
  );
}
