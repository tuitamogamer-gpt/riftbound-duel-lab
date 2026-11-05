import { Flag } from "lucide-react";
import { findCard } from "../catalog";
import type { GameAction, GameState, LocationId } from "../game/types";
import { useI18n } from "../i18n";
import "./DeployedGear.css";

/** Gear with [Deploy] stays at its battlefield; show it where it applies. */
export function DeployedGear({
  game,
  fieldId,
  legal,
  selected,
  select,
}: {
  game: GameState;
  fieldId: LocationId;
  legal: GameAction[];
  selected: string | null;
  select: (id: string) => void;
}) {
  const { t } = useI18n();
  const gears = game.gears.filter(
    (gear) =>
      gear.deployedAt === fieldId &&
      !gear.attachedTo &&
      !game.units.some((unit) => unit.id === gear.id),
  );
  if (!gears.length) return null;
  // Identical tokens (such as several Bombs) share one chip with a count.
  const groups: { gear: (typeof gears)[number]; count: number }[] = [];
  for (const gear of gears) {
    const same = gear.token
      ? groups.find(
          (group) =>
            group.gear.token &&
            group.gear.cardId === gear.cardId &&
            group.gear.owner === gear.owner &&
            group.gear.ready === gear.ready,
        )
      : undefined;
    if (same) same.count++;
    else groups.push({ gear, count: 1 });
  }
  return (
    <div className="deployed-zone" aria-label={t("Deployed gear")}>
      {groups.map(({ gear, count }) => {
        const card = findCard(gear.cardId);
        if (!card) return null;
        const ids = gears
          .filter(
            (other) =>
              other.id === gear.id ||
              (count > 1 &&
                other.token &&
                other.cardId === gear.cardId &&
                other.owner === gear.owner &&
                other.ready === gear.ready),
          )
          .map((other) => other.id);
        const targeted = legal.some((action) =>
          action.targetId?.split("~").some((id) => ids.includes(id)),
        );
        const name = count > 1 ? `${card.name} ×${count}` : card.name;
        return (
          <button
            key={gear.id}
            className={`deployed-chip ${gear.owner === 0 ? "is-mine" : "is-theirs"}${selected && ids.includes(selected) ? " is-selected" : ""}${targeted ? " is-target" : ""}${gear.ready ? "" : " is-exhausted"}`}
            data-card-preview={card.id}
            data-gear-id={gear.id}
            title={t(
              gear.owner === 0
                ? "Your deployed {card}"
                : "Enemy deployed {card}",
              { card: name },
            )}
            onClick={() => select(gear.id)}
          >
            <Flag size={10} aria-hidden="true" />
            <span>{name}</span>
          </button>
        );
      })}
    </div>
  );
}
