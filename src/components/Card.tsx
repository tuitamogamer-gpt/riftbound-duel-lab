import { useState } from "react";
import { Zap, Shield, Search } from "lucide-react";
import type { CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { readableText } from "../data/cards";
import { domainColors } from "../catalog";
export function Card({
  card,
  onClick,
  small = false,
  selected = false,
  disabled = false,
  ready,
  damage,
  footer,
}: {
  card: CatalogCard;
  onClick?: () => void;
  small?: boolean;
  selected?: boolean;
  disabled?: boolean;
  ready?: boolean;
  damage?: number;
  footer?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      className={`game-card ${small ? "small" : ""} ${selected ? "selected" : ""} ${disabled ? "muted" : ""} ${ready === false ? "exhausted" : ""}`}
      onClick={onClick}
      aria-label={card.name + (footer ? `: ${footer}` : "")}
      title={card.name}
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
            {card.energy} ENERGY · {card.might} MIGHT
          </span>
        </div>
      )}
      <span className="card-shine" />
      {ready === false && <span className="card-status">ISCRPLJENA</span>}
      {damage ? <span className="damage-badge">−{damage}</span> : null}
      {footer && <span className="card-footer">{footer}</span>}
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal card-detail"
        role="dialog"
        aria-modal="true"
        aria-label={card.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-button" onClick={onClose} aria-label="Zatvori">
          ×
        </button>
        <Card card={card} />
        <div>
          <div className="eyebrow">
            {card.setName} / {card.id}
          </div>
          <h2>{card.name}</h2>
          <div className="detail-tags">
            <span>
              {card.supertype} {card.type}
            </span>
            {card.domains.map((d) => (
              <span key={d} style={{ color: domainColors[d] }}>
                {d}
              </span>
            ))}
          </div>
          <p className="rules-text">
            {readableText(card.text) || "Ova karta nema dodatni tekst efekta."}
          </p>
          <div className="stat-row">
            {card.energy !== null && (
              <span>
                <Zap size={16} />
                {card.energy} energije
              </span>
            )}
            {card.power !== null && <span>◈ {card.power} power</span>}
            {card.might !== null && (
              <span>
                <Shield size={16} />
                {card.might} might
              </span>
            )}
          </div>
          <p className={`support-status ${scripted ? "supported" : ""}`}>
            {scripted
              ? "● Skriptovana u Duel Labu"
              : "○ Katalog — još nije podržana u meču"}
          </p>
          <small>
            Tekst i podaci: Riftcodex. Originalni engleski tekst karte.
          </small>
        </div>
      </section>
    </div>
  );
}
