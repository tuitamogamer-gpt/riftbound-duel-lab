import { useEffect, useState } from "react";
import { Zap, Shield, Search } from "lucide-react";
import type { CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { readableText } from "../data/cards";
import { domainColors } from "../catalog";
import { useI18n } from "../i18n";
import { ExhaustedToken } from "./ExhaustedToken";
export function Card({
  card,
  onClick,
  small = false,
  selected = false,
  disabled = false,
  ready,
  damage,
  footer,
  might,
  preview = true,
}: {
  card: CatalogCard;
  onClick?: () => void;
  small?: boolean;
  selected?: boolean;
  disabled?: boolean;
  ready?: boolean;
  damage?: number;
  footer?: string;
  might?: number;
  preview?: boolean;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [card.id]);
  return (
    <button
      className={`game-card ${small ? "small" : ""} ${selected ? "selected" : ""} ${disabled ? "muted" : ""} ${ready === false ? "exhausted" : ""}`}
      onClick={onClick}
      aria-label={
        card.name +
        (footer ? `: ${t(footer)}` : "") +
        (ready === false ? ` · ${t("Exhausted")}` : "")
      }
      data-card-preview={preview ? card.id : undefined}
      data-card-ready={ready}
      data-card-damage={damage}
      data-card-might={might}
      data-card-footer={footer}
      style={
        {
          "--card-accent": domainColors[card.domains[0]] || "#bd9b64",
        } as React.CSSProperties
      }
    >
      {!failed && card.image ? (
        <img
          src={cardArtUrl(card)}
          alt={card.name}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="card-fallback">
          <Zap />
          <strong>{card.name}</strong>
          <p>{readableText(card.text)}</p>
          <span>
            {card.energy} {t("ENERGY")} · {card.might} {t("MIGHT")}
          </span>
        </div>
      )}
      <span className="card-shine" />
      <ExhaustedToken ready={ready} />
      {damage ? <span className="damage-badge">−{damage}</span> : null}
      {footer && <span className="card-footer">{t(footer)}</span>}
      <span className="card-zoom">
        <Search size={13} />
      </span>
    </button>
  );
}
export function CardDetail({
  card,
  scripted,
  onClose,
}: {
  card: CatalogCard;
  scripted: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal card-detail"
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-button"
          onClick={onClose}
          aria-label={t("Zatvori")}
        >
          ×
        </button>
        <Card card={card} preview={false} />
        <div>
          <div className="eyebrow">
            {card.setName} / {card.id}
          </div>
          <h2>{card.name}</h2>
          <div className="detail-tags">
            <span>
              {card.supertype ? t(card.supertype) : ""} {t(card.type)}
            </span>
            {card.domains.map((d) => (
              <span key={d} style={{ color: domainColors[d] }}>
                {t(d)}
              </span>
            ))}
          </div>
          <p className="rules-text">
            {readableText(card.text) ||
              t("Ova karta nema dodatni tekst efekta.")}
          </p>
          <div className="stat-row">
            {card.energy !== null && (
              <span>
                <Zap size={16} />
                {card.energy} {t("energije")}
              </span>
            )}
            {card.power !== null && (
              <span>
                ◈ {card.power} {t("power")}
              </span>
            )}
            {card.might !== null && (
              <span>
                <Shield size={16} />
                {card.might} {t("might")}
              </span>
            )}
          </div>
          <p className={`support-status ${scripted ? "supported" : ""}`}>
            {scripted
              ? t("● Podržana za igranje u Duel Labu")
              : t("○ Katalog — još nije podržana u meču")}
          </p>
          <small>
            {t("Tekst i podaci: Riftcodex. Originalni engleski tekst karte.")}
          </small>
        </div>
      </section>
    </div>
  );
}
