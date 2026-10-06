import { Flag, Search } from "lucide-react";
import { findCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { battlefieldChoices } from "../game/battlefield-selection";
import { useI18n } from "../i18n";
import type { CatalogCard } from "../catalog";
import "./BattlefieldPicker.css";

export function BattlefieldPicker({
  value,
  opponent = false,
  onChange,
  inspect,
}: {
  value: string;
  opponent?: boolean;
  onChange: (id: string) => void;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const card = findCard(value);
  return (
    <section
      className={`battlefield-picker ${opponent ? "picker-opponent" : ""}`}
      aria-label={t(opponent ? "Opponent battlefield" : "Your battlefield")}
    >
      <div className="battlefield-picker-heading">
        <Flag size={16} />
        <strong>
          {t(opponent ? "Opponent battlefield" : "Choose your battlefield")}
        </strong>
      </div>
      <label>
        <span>{t("Bring this battlefield into the duel")}</span>
        <select
          aria-label={t(opponent ? "Opponent battlefield" : "Your battlefield")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {battlefieldChoices.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </label>
      {card && (
        <button
          className="battlefield-choice-preview"
          data-card-preview={card.id}
          onClick={() => inspect(card)}
          aria-label={t("View battlefield: {name}", { name: card.name })}
        >
          <img src={cardArtUrl(card)} alt={card.name} loading="lazy" />
          <span>
            <small>{t(opponent ? "Opponent brings" : "You bring")}</small>
            <strong>{card.name}</strong>
            <i>
              <Search size={14} />
              {t("Read card")}
            </i>
          </span>
        </button>
      )}
    </section>
  );
}
