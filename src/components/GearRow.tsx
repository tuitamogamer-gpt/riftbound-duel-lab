import { Link2, Search, Shield } from "lucide-react";
import { findCard, type CatalogCard } from "../catalog";
import type { GameAction, GameState, PlayerId } from "../game/types";
import { useI18n } from "../i18n";
import { Card } from "./Card";

/** Public permanents keep a physical card slot even while attached to a unit. */
export function GearRow({
  game,
  player,
  legal,
  actions,
  selected,
  select,
  inspect,
}: {
  game: GameState;
  player: PlayerId;
  legal: GameAction[];
  actions: GameAction[];
  selected: string | null;
  select: (id: string) => void;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const gears = game.gears.filter((gear) => gear.owner === player);
  if (!gears.length) return null;
  return (
    <section
      className="gear-zone"
      aria-label={t(
        player === 0
          ? "Your gear and equipment"
          : "Opponent gear and equipment",
      )}
    >
      <div className="gear-zone-heading">
        <Shield size={11} />
        <span>{t("Gear & equipment")}</span>
        <b>{gears.length}</b>
      </div>
      <div
        className="gear-slots"
        style={{ "--gear-count": gears.length } as React.CSSProperties}
      >
        {gears.map((gear) => {
          const card = findCard(gear.cardId);
          if (!card) return null;
          const attached = game.units.find(
            (unit) => unit.id === gear.attachedTo,
          );
          const attachedCard = findCard(attached?.cardId);
          const target = actions.some((action) =>
            action.targetId?.split("~").includes(gear.id),
          );
          return (
            <div
              className={`gear-slot${attached ? " is-attached" : ""}`}
              key={gear.id}
              data-gear-id={gear.id}
              data-attached-to={attached?.id}
            >
              <Card
                card={card}
                small
                ready={gear.ready}
                selected={selected === gear.id || target}
                playable={
                  target || legal.some((action) => action.sourceId === gear.id)
                }
                onClick={() => select(gear.id)}
              />
              <button
                className="gear-inspect"
                aria-label={t("Detalji {card}", { card: card.name })}
                onClick={() => inspect(card)}
              >
                <Search size={11} />
              </button>
              {attached && attachedCard && (
                <button
                  className="gear-attachment"
                  title={t("Attached to {card}", { card: attachedCard.name })}
                  aria-label={t("Attached to {card}", {
                    card: attachedCard.name,
                  })}
                  onClick={() => select(attached.id)}
                >
                  <Link2 size={10} />
                  <span>{attachedCard.name.split(" - ")[0]}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
