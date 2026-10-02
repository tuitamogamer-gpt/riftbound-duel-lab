import { findCard, type CatalogCard } from "../catalog";
import type { GameState } from "../game/types";
import { useI18n } from "../i18n";

export function HiddenCard({
  game,
  hidden,
  select,
  inspect,
}: {
  game: GameState;
  hidden: NonNullable<GameState["hidden"]>[number];
  select: (id: string) => void;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const own = hidden.owner === 0;
  const canLook = own || game.players[0].canLookAtEnemyHiddenTurn === game.turn;
  const card = canLook ? findCard(hidden.cardId) : undefined;
  return (
    <button
      className="hidden-card"
      data-card-preview={card?.id}
      disabled={!canLook}
      onClick={() => {
        if (own) select(`hidden:${hidden.id}`);
        else if (card) inspect(card);
      }}
    >
      {card
        ? t(own ? "Tvoja Hidden: {card}" : "Protivnička Hidden: {card}", {
            card: card.name,
          })
        : t("AI · Hidden karta")}
    </button>
  );
}
