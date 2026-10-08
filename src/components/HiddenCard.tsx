import { findCard, type CatalogCard } from "../catalog";
import type { GameAction, GameState } from "../game/types";
import { hiddenCardStatus } from "../game/hidden-presentation";
import { useI18n } from "../i18n";
import { Search } from "lucide-react";
import { CardSleeve } from "./CardSleeve";
import "./HiddenCard.css";

export function HiddenCard({
  game,
  hidden,
  legal = [],
  selected = false,
  select,
  inspect,
}: {
  game: GameState;
  hidden: NonNullable<GameState["hidden"]>[number];
  legal?: GameAction[];
  selected?: boolean;
  select: (id: string) => void;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const own = hidden.owner === 0;
  const canLook = own || game.players[0].canLookAtEnemyHiddenTurn === game.turn;
  const card = canLook ? findCard(hidden.cardId) : undefined;
  const status = own ? hiddenCardStatus(game, hidden, legal) : undefined;
  const label = card
    ? t(own ? "Tvoja Hidden: {card}" : "Protivnička Hidden: {card}", {
        card: card.name,
      })
    : t("AI · Hidden karta");
  const hiddenButton = (
    <button
      className={`hidden-card${status?.ready ? " is-playable" : ""}${selected ? " is-selected" : ""}`}
      aria-pressed={own ? selected : undefined}
      aria-label={`${label}${status ? ` · ${t(status.label)}` : ""}`}
      data-hidden-source={own ? `hidden:${hidden.id}` : undefined}
      title={status ? t(status.hint) : undefined}
      data-card-preview={card?.id}
      disabled={!canLook}
      onClick={() => {
        if (own) select(`hidden:${hidden.id}`);
        else if (card) inspect(card);
      }}
    >
      <CardSleeve player={game.players[hidden.owner]} />
      <span>{own && card ? card.name : label}</span>
      {status && <small>{t(status.label)}</small>}
    </button>
  );
  if (!own || !card) return hiddenButton;
  return (
    <div className="hidden-card-wrap">
      {hiddenButton}
      <button
        type="button"
        className="hidden-card-inspect"
        aria-label={t("Detalji {card}", { card: card.name })}
        aria-haspopup="dialog"
        onClick={() => inspect(card)}
      >
        <Search size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
