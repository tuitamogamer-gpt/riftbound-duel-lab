import { useEffect, useState } from "react";
import { Castle, Swords } from "lucide-react";
import { findCard } from "../catalog";
import type { GameAction, GameState, LocationId } from "../game/types";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";

/** Follow new combat/effect locations, while allowing inspection of another zone. */
export function useMobileBoardZone(
  game: GameState | null,
  review: Review | null,
) {
  const [zone, setZone] = useState<LocationId>(
    game?.combat?.fieldId ??
      game?.units.find((unit) => unit.location.startsWith("field:"))
        ?.location ??
      "base:0",
  );
  const frame = review?.frames[review.index];
  const focus =
    frame?.combat?.preview.fieldId ??
    frame?.effect?.locationId ??
    frame?.score?.fieldId ??
    game?.combat?.fieldId ??
    review?.action.locationId ??
    (review?.action.id === "move-confirm"
      ? review.before.pendingMove?.to
      : undefined);
  useEffect(() => {
    setZone("base:0");
  }, [game?.seed]);
  useEffect(() => {
    if (focus) setZone(focus);
  }, [focus, game?.seed]);
  return [zone, setZone] as const;
}

export function MobileBoardNav({
  game,
  zone,
  select,
  actions,
}: {
  game: GameState;
  zone: LocationId;
  select: (zone: LocationId) => void;
  actions: GameAction[];
}) {
  const { t } = useI18n();
  const locations: LocationId[] = [
    "base:0",
    ...game.fields.map((field) => field.id),
    "base:1",
  ];
  return (
    <nav className="mobile-board-nav" aria-label={t("Table zones")}>
      {locations.map((location) => {
        const field = game.fields.find((item) => item.id === location);
        const name = field
          ? (findCard(field.cardId)?.name ?? t("Battlefield"))
          : t(location === "base:0" ? "Your base" : "AI base");
        const units = game.units.filter((unit) => unit.location === location);
        const own = units.filter((unit) => unit.owner === 0).length;
        const enemy = units.length - own;
        const target = actions.some(
          (action) =>
            action.locationId === location ||
            units.some((unit) => unit.id === action.targetId),
        );
        const combat = game.combat?.fieldId === location;
        return (
          <button
            key={location}
            className={`${target ? "has-target" : ""} ${combat ? "has-combat" : ""}`}
            aria-pressed={zone === location}
            aria-label={`${name} · ${t("{own} friendly · {enemy} enemy units", { own, enemy })}${target ? ` · ${t("Available target")}` : ""}`}
            onClick={() => select(location)}
            data-mobile-location={location}
          >
            <span className="mobile-zone-name">{name}</span>
            <span className="mobile-zone-counts" aria-hidden="true">
              {field ? <Swords size={12} /> : <Castle size={12} />}
              <b className="friendly-count">{own}</b>
              <span>·</span>
              <b className="enemy-count">{enemy}</b>
              {target && <span className="mobile-target-dot" />}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
