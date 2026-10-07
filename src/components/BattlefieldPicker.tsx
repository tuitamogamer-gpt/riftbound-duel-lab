import { Check, Flag, Search } from "lucide-react";
import { findCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import {
  battlefieldChoices,
  deckBattlefieldChoices,
  resolveBattlefieldChoice,
} from "../game/battlefield-selection";
import { useI18n } from "../i18n";
import type { CatalogCard } from "../catalog";
import type { StarterDeck } from "../data/decks";
import "./BattlefieldPicker.css";

export function BattlefieldPicker({
  value,
  deck,
  opponent = false,
  onChange,
  inspect,
}: {
  value: string;
  deck?: StarterDeck;
  opponent?: boolean;
  onChange: (id: string) => void;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const card = resolveBattlefieldChoice(value) ?? findCard(value);
  const selectedId = card?.id ?? value;
  const supplied = deckBattlefieldChoices(deck);
  const suppliedIds = new Set(supplied.map((field) => field.id));
  const alternatives = battlefieldChoices.filter(
    (field) => !suppliedIds.has(field.id),
  );
  const precon = deck?.source === "Official preconstructed deck";
  const poolLabel = t(precon ? "Precon battlefields" : "Deck battlefields");
  const sourceLabel = t(precon ? "Supplied with precon" : "Supplied with deck");
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
      {supplied.length > 0 && (
        <div className="battlefield-supplied-pool">
          <div className="battlefield-supplied-heading">
            <strong>{poolLabel}</strong>
            {deck?.product && <small>{t(deck.product)}</small>}
          </div>
          <p>{t("Choose one of the battlefields supplied with this deck.")}</p>
          <div
            className={`battlefield-supplied-grid ${supplied.length === 1 ? "battlefield-supplied-single" : ""}`}
            role="group"
            aria-label={poolLabel}
          >
            {supplied.map((field) => (
              <div
                key={field.id}
                className={`battlefield-supplied-card ${selectedId === field.id ? "is-selected" : ""}`}
              >
                <button
                  className="battlefield-supplied-choice"
                  onClick={() => onChange(field.id)}
                  aria-label={t("Select battlefield: {name}", {
                    name: field.name,
                  })}
                  aria-pressed={selectedId === field.id}
                >
                  <img src={cardArtUrl(field)} alt="" loading="lazy" />
                  {selectedId === field.id && (
                    <span className="battlefield-selected-badge">
                      <Check size={12} aria-hidden="true" />
                      {t("Selected battlefield")}
                    </span>
                  )}
                  <span className="battlefield-supplied-copy">
                    <strong>{field.name}</strong>
                    <small>{sourceLabel}</small>
                  </span>
                </button>
                <button
                  className="battlefield-supplied-inspect"
                  data-card-preview={field.id}
                  onClick={() => inspect(field)}
                  aria-label={t("View battlefield: {name}", {
                    name: field.name,
                  })}
                >
                  <Search size={12} aria-hidden="true" />
                  {t("Read card")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <label>
        <span>
          {t(
            supplied.length
              ? "Or choose another battlefield"
              : "Bring this battlefield into the duel",
          )}
        </span>
        <select
          aria-label={t(opponent ? "Opponent battlefield" : "Your battlefield")}
          value={selectedId}
          onChange={(e) => onChange(e.target.value)}
        >
          {supplied.length > 0 && (
            <optgroup label={poolLabel}>
              {supplied.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={t("Other supported battlefields")}>
            {alternatives.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {card && !suppliedIds.has(selectedId) && (
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
