import { useEffect, useState, type CSSProperties } from "react";
import { Castle, Crosshair, EyeOff, Swords, UsersRound } from "lucide-react";
import { findCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import {
  defaultMobileZone,
  mobileBoardLocations,
  mobileReviewFocus,
  mobileTargetZones,
  mobileZoneSummary,
} from "../game/mobile-presentation";
import type { GameAction, GameState, LocationId } from "../game/types";
import { useI18n } from "../i18n";
import { getHighlights, type Review } from "./StepFlow";
import "./MobileBoardNav.css";

/** Follow new public frames while preserving manual inspection in the same frame. */
export function useMobileBoardZone(
  game: GameState | null,
  review: Review | null,
) {
  const [zone, setZone] = useState<LocationId>(() => defaultMobileZone(game));
  const focus = mobileReviewFocus(game, review);
  const locationsKey = game?.fields.map((field) => field.id).join(",");
  useEffect(() => {
    setZone(focus ?? defaultMobileZone(game));
  }, [game?.seed]);
  useEffect(() => {
    if (focus) setZone(focus);
  }, [focus, review?.before, review?.index]);
  useEffect(() => {
    if (game)
      setZone((current) =>
        mobileBoardLocations(game).includes(current) ? current : "base:0",
      );
  }, [locationsKey]);
  return [zone, setZone] as const;
}

export function MobileBoardNav({
  game,
  zone,
  select,
  actions,
  review = null,
}: {
  game: GameState;
  zone: LocationId;
  select: (zone: LocationId) => void;
  actions: GameAction[];
  review?: Review | null;
}) {
  const { t } = useI18n();
  const locations = mobileBoardLocations(game);
  const targets = new Set(mobileTargetZones(game, actions));
  const highlights = getHighlights(review).fields;
  return (
    <nav
      className="mobile-board-nav"
      aria-label={t("Table zones")}
      style={{ "--mobile-zone-count": locations.length } as CSSProperties}
    >
      {locations.map((location) => {
        const field = game.fields.find((item) => item.id === location);
        const card = field && findCard(field.cardId);
        const basePlayer = location === "base:0" ? 0 : 1;
        const art =
          card ?? (!field && findCard(game.players[basePlayer].legendId));
        const name = field
          ? (card?.name ?? t("Battlefield"))
          : t(location === "base:0" ? "Your base" : "AI base");
        const summary = mobileZoneSummary(game, location);
        const target = targets.has(location);
        const control = field ? summary.controller : basePlayer;
        const label = [
          name,
          t("{own} friendly · {enemy} enemy units", {
            own: summary.counts[0],
            enemy: summary.counts[1],
          }),
          ...(field
            ? [
                t("{player}: {total} total Might", {
                  player: t("Ti"),
                  total: summary.might[0],
                }),
                t("{player}: {total} total Might", {
                  player: t("AI"),
                  total: summary.might[1],
                }),
                t(
                  control === 0
                    ? "Controlled by you"
                    : control === 1
                      ? "Controlled by AI"
                      : "Uncontrolled",
                ),
              ]
            : []),
          ...(summary.hidden.some(Boolean)
            ? [
                t("Hidden cards: you {own} · opponent {enemy}", {
                  own: summary.hidden[0],
                  enemy: summary.hidden[1],
                }),
              ]
            : []),
          ...(summary.combat ? [t("Combat")] : []),
          ...(target ? [t("Available target")] : []),
        ].join(" · ");
        return (
          <button
            key={location}
            className={`mobile-zone-tile ${field ? "is-battlefield" : "is-base"} ${target ? "has-target" : ""} ${summary.combat ? "has-combat" : ""} ${highlights.has(location) ? "has-event" : ""}`}
            data-mobile-control={control === null ? "none" : control}
            aria-pressed={zone === location}
            aria-label={label}
            onClick={() => select(location)}
            data-mobile-location={location}
          >
            {art && (
              <img
                className="mobile-zone-art"
                src={cardArtUrl(art)}
                alt=""
                loading="lazy"
              />
            )}
            <span className="mobile-zone-name">{name}</span>
            <span className="mobile-zone-counts" aria-hidden="true">
              {([1, 0] as const).map((player) => (
                <span
                  key={player}
                  className={player === 0 ? "friendly-count" : "enemy-count"}
                >
                  <UsersRound size={10} />
                  <b>{summary.counts[player]}</b>
                  {field && (
                    <>
                      <Swords size={10} />
                      <strong>{summary.might[player]}</strong>
                    </>
                  )}
                  {!!summary.hidden[player] && (
                    <>
                      <EyeOff size={10} />
                      <small>{summary.hidden[player]}</small>
                    </>
                  )}
                </span>
              ))}
            </span>
            <span className="mobile-zone-badges" aria-hidden="true">
              {!field && <Castle size={11} />}
              {summary.combat && (
                <Swords className="mobile-combat-badge" size={12} />
              )}
              {target && <Crosshair className="mobile-target-dot" size={12} />}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
