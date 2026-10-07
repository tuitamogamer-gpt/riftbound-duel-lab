import { useEffect, useState } from "react";
import { Zap, Shield, Search } from "lucide-react";
import type { CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { readableText } from "../data/cards";
import { domainColors } from "../catalog";
import { useI18n } from "../i18n";
import type { CardStatus } from "../game/status-presentation";
import { CardStatusTokens } from "./CardStatusTokens";
import { ExhaustedToken } from "./ExhaustedToken";
import { RulesErrata } from "./RulesErrata";
import { EquipmentRules } from "./EquipmentRules";
import { useDialogFocus } from "../hooks/useDialogFocus";
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
  playable = false,
  statuses,
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
  playable?: boolean;
  statuses?: CardStatus[];
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [card.id]);
  return (
    <button
      className={`game-card ${small ? "small" : ""} ${selected ? "selected" : ""} ${disabled ? "muted" : ""} ${playable ? "playable" : ""} ${ready === false ? "exhausted" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={
        card.name +
        (footer ? `: ${t(footer)}` : "") +
        (ready === false ? ` · ${t("Exhausted")}` : "") +
        (statuses?.length
          ? ` · ${statuses.map((status) => t(status.label, status.values)).join(" · ")}`
          : "")
      }
      data-card-preview={preview ? card.id : undefined}
      data-card-ready={ready}
      data-card-damage={damage}
      data-card-might={might}
      data-card-footer={footer}
      data-card-statuses={
        statuses?.length ? JSON.stringify(statuses) : undefined
      }
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
      {statuses && <CardStatusTokens statuses={statuses} />}
      {damage && !statuses?.some((status) => status.id === "damage") ? (
        <span className="damage-badge">−{damage}</span>
      ) : null}
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
  ready,
  damage,
  might,
  statuses,
}: {
  card: CatalogCard;
  scripted: boolean;
  onClose: () => void;
  ready?: boolean;
  damage?: number;
  might?: number;
  statuses?: CardStatus[];
}) {
  const { t } = useI18n();
  const dialog = useDialogFocus(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal card-detail"
        ref={dialog}
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
        <Card
          card={card}
          preview={false}
          ready={ready}
          damage={damage}
          might={might}
          statuses={statuses}
        />
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
          <RulesErrata name={card.name} />
          <EquipmentRules cardId={card.id} />
          {statuses && statuses.length > 0 && (
            <section aria-label={t("Active effects")}>
              <CardStatusTokens statuses={statuses} expanded />
            </section>
          )}
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
            {(might !== undefined || card.might !== null) && (
              <span>
                <Shield size={16} />
                {might ?? card.might} {t("might")}
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
