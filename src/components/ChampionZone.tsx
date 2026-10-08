import { findCard, type CatalogCard } from "../catalog";
import { Info, Sparkles } from "lucide-react";
import { readableText } from "../data/cards";
import type { GameAction, GameState, PlayerId } from "../game/types";
import { useI18n } from "../i18n";
import { Card } from "./Card";
import { useHighlights } from "./StepFlow";
import "./ChampionZone.css";

/** Public setup zones, separate from the hand and the unit base. */
export function ChampionZone({
  game,
  player,
  legal,
  selected,
  select,
  inspect,
}: {
  game: GameState;
  player: PlayerId;
  legal: GameAction[];
  selected: string | null;
  select: (source: string) => void;
  inspect: (card: CatalogCard, sourceId?: string) => void;
}) {
  const { t } = useI18n();
  const highlights = useHighlights();
  const p = game.players[player];
  const legend = findCard(p.legendId);
  const champion = findCard(p.championId);
  const own = player === 0;
  const hasAction = (source: string) =>
    own && legal.some((a) => a.player === player && a.sourceId === source);
  const legendReady = p.legendUsedTurn < 0;

  return (
    <section
      className={`champion-zone player-zone-${player}`}
      aria-label={t(
        own ? "Your Legend and Champion" : "Opponent Legend and Champion",
      )}
    >
      {legend && (
        <article
          className={`setup-card legend-zone ${own && selected === "legend" ? "is-selected" : ""} ${highlights.legends.has(player) ? "legend-changed" : ""}`}
        >
          <Card
            card={legend}
            small
            ready={legendReady}
            playable={hasAction("legend")}
            selected={own && selected === "legend"}
            onClick={() =>
              own ? select("legend") : inspect(legend, `legend:${player}`)
            }
          />
          <button
            className="setup-mobile-inspect"
            aria-label={t("Inspect {card}", { card: legend.name })}
            data-card-preview={legend.id}
            data-card-ready={legendReady}
            onClick={() => inspect(legend, `legend:${player}`)}
          >
            <Info size={20} aria-hidden="true" />
          </button>
          {p.legendEmpowered && (
            <span
              className="setup-mobile-empowered"
              aria-label={t("Empowered")}
              title={t("Empowered")}
            >
              <Sparkles size={14} aria-hidden="true" />
            </span>
          )}
          <div className="setup-card-copy">
            <div className="setup-card-heading">
              <span>{t("Legend zone")}</span>
              <span className={`setup-status ${legendReady ? "is-ready" : ""}`}>
                {t(legendReady ? "Ready" : "Exhausted")}
              </span>
            </div>
            <button
              className="setup-card-name"
              data-card-preview={legend.id}
              data-card-ready={legendReady}
              onClick={() => inspect(legend, `legend:${player}`)}
            >
              {legend.name}
            </button>
            <p className="setup-card-description">
              {readableText(legend.text)}
            </p>
            {p.legendEmpowered && (
              <span className="setup-status is-ready">{t("Empowered")}</span>
            )}
            {hasAction("legend") && (
              <button className="setup-action" onClick={() => select("legend")}>
                {t("Choose Legend ability")} →
              </button>
            )}
          </div>
        </article>
      )}
      {champion && (
        <article
          className={`setup-card chosen-champion-zone ${!p.championAvailable ? "zone-empty" : ""} ${own && selected === "champion" ? "is-selected" : ""}`}
        >
          {p.championAvailable ? (
            <Card
              card={champion}
              small
              selected={own && selected === "champion"}
              playable={hasAction("champion")}
              onClick={() => (own ? select("champion") : inspect(champion))}
            />
          ) : (
            <button
              className="setup-empty-art"
              data-card-preview={champion.id}
              aria-label={champion.name}
              title={t("The chosen champion has left this zone.")}
              onClick={() => inspect(champion)}
            >
              <span aria-hidden="true">◇</span>
            </button>
          )}
          <button
            className="setup-mobile-inspect"
            aria-label={t("Inspect {card}", { card: champion.name })}
            data-card-preview={champion.id}
            onClick={() => inspect(champion)}
          >
            <Info size={20} aria-hidden="true" />
          </button>
          <div className="setup-card-copy">
            <div className="setup-card-heading">
              <span>{t("Champion zone")}</span>
              <span className="setup-status">
                {t(p.championAvailable ? "Available" : "Empty")}
              </span>
            </div>
            <button
              className="setup-card-name"
              data-card-preview={champion.id}
              onClick={() => inspect(champion)}
            >
              {champion.name}
            </button>
            <p className="setup-card-description">
              {t(
                p.championAvailable
                  ? "Play from here by paying its cost. Separate from your hand."
                  : "The chosen champion has left this zone.",
              )}
            </p>
            {hasAction("champion") && p.championAvailable && (
              <button
                className="setup-action"
                onClick={() => select("champion")}
              >
                {t("Choose Champion play")} →
              </button>
            )}
          </div>
        </article>
      )}
    </section>
  );
}
