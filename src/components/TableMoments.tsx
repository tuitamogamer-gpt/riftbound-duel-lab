import type { CSSProperties } from "react";
import { Crown, Flag, Sparkles, Sun, Trophy, Wind } from "lucide-react";
import { findCard } from "../catalog";
import type { CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { getVictoryScore } from "../game/board-rules";
import {
  momentKey,
  phaseMoment,
  scoreMoment,
  championMoment,
} from "../game/table-presentation";
import { reviewDelay } from "../game/presentation";
import type { PlaybackSpeed } from "../game/playback";
import type { GameState } from "../game/types";
import { useI18n } from "../i18n";
import { CardSleeve } from "./CardSleeve";
import type { Review } from "./StepFlow";
import "./TableMoments.css";

const phases = {
  awaken: {
    letter: "A",
    name: "Awaken",
    hint: "Ready units, gear and runes",
    icon: Sun,
  },
  beginning: {
    letter: "B",
    name: "Beginning",
    hint: "Start effects and holding points",
    icon: Flag,
  },
  channel: {
    letter: "C",
    name: "Channel",
    hint: "Channel your runes",
    icon: Wind,
  },
  draw: { letter: "D", name: "Draw", hint: "Draw a card", icon: Sparkles },
};

export function TableMoment({
  game,
  review,
  inspect,
  playbackSpeed = 1,
}: {
  game: GameState;
  review: Review | null;
  inspect: (card: CatalogCard) => void;
  playbackSpeed?: PlaybackSpeed;
}) {
  const { t } = useI18n();
  const frame = review?.frames[review.index];
  const score = scoreMoment(review);
  const draw = frame?.draw;
  const phase = phaseMoment(review);
  const champion = championMoment(review);
  if (review && champion)
    return <ChampionEntrance review={review} playbackSpeed={playbackSpeed} />;
  if (!review || (!score && !draw && !phase)) return null;
  const player = score?.player ?? draw?.player ?? game.currentPlayer;
  const phaseInfo = phase && phases[phase];
  const Icon = score ? Trophy : phaseInfo ? phaseInfo.icon : Sparkles;
  const source = findCard(
    score?.fieldId
      ? game.fields.find((f) => f.id === score.fieldId)?.cardId
      : frame?.effect?.cardId,
  );
  const title = score
    ? score.kind === "hold"
      ? "Hold"
      : score.kind === "conquer"
        ? "Conquer"
        : "Point gained"
    : phaseInfo
      ? phaseInfo.name
      : "Card drawn";
  // Even a malformed/old review must never reveal an opponent's drawn identities.
  const cards =
    draw?.player === 0
      ? (draw.cardIds ?? []).map(findCard).filter((c): c is CatalogCard => !!c)
      : [];
  return (
    <div
      className={`table-moment moment-${score ? "score" : draw ? "draw" : "phase"} moment-player-${player}`}
      key={momentKey(review)}
      style={
        {
          "--moment-duration": `${reviewDelay(review, playbackSpeed)}ms`,
        } as CSSProperties
      }
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="moment-halo" />
      <div className="moment-content">
        <span className="moment-owner">
          {t(
            phase
              ? player === 0
                ? "Your turn"
                : "Opponent turn"
              : player === 0
                ? "Ti"
                : "AI",
          )}{" "}
          · {t("POTEZ")} {game.turn}
        </span>
        <div className="moment-title">
          {phaseInfo && !score ? (
            <span className="moment-letter">{phaseInfo.letter}</span>
          ) : (
            <Icon size={26} />
          )}
          <strong>{t(title)}</strong>
        </div>
        {score ? (
          <>
            <span className="moment-point">
              +{score.to - score.from}
              <small>{t("point")}</small>
            </span>
            <span className="moment-source">
              {source?.name ?? t("Point gained")}
            </span>
            <span className="moment-score-path">
              {t(player === 0 ? "Ti" : "AI")} <b>{score.from}</b>
              <span>→</span>
              <b>{score.to}</b>
              <small>/ {getVictoryScore(game)}</small>
            </span>
          </>
        ) : draw ? (
          <>
            <span className="moment-source">
              {source?.name ??
                t(player === 0 ? "From your deck" : "From opponent deck")}
            </span>
            {frame?.effect?.scoring === "conquer" && (
              <span className="moment-draw-replacement">
                {t("Draw instead of the final point")}
              </span>
            )}
            <div className="moment-cards">
              {draw.player === 0 ? (
                cards.slice(0, 3).map((card, i) => (
                  <button
                    className="moment-drawn-card"
                    key={`${card.id}-${i}`}
                    style={{ "--draw-index": i } as CSSProperties}
                    data-card-preview={card.id}
                    aria-label={t("Drawn card: {card}", { card: card.name })}
                    onClick={() => inspect(card)}
                  >
                    <img src={cardArtUrl(card)} alt={card.name} />
                    <span>{card.name}</span>
                  </button>
                ))
              ) : (
                <div
                  className="moment-drawn-card moment-card-back"
                  aria-label={t("Opponent draws {count} card(s)", {
                    count: draw.count,
                  })}
                >
                  <CardSleeve player={game.players[1]} />
                </div>
              )}
            </div>
            <span className="moment-hint">
              {t(
                draw.player === 0
                  ? "Added to your hand · hover to read"
                  : "Opponent draws {count} card(s)",
                { count: draw.count },
              )}
              {draw.count > 3 && draw.player === 0
                ? ` · +${draw.count - 3}`
                : ""}
            </span>
          </>
        ) : (
          <p className="moment-hint">{phaseInfo && t(phaseInfo.hint)}</p>
        )}
        <span className="moment-timer" aria-hidden="true">
          <i />
        </span>
      </div>
    </div>
  );
}

/** A public portrait celebrates arrival while every table control stays usable. */
export function ChampionEntrance({
  review,
  playbackSpeed = 1,
}: {
  review: Review;
  playbackSpeed?: PlaybackSpeed;
}) {
  const { t } = useI18n();
  const unit = championMoment(review);
  const card = findCard(unit?.cardId);
  if (!unit || !card) return null;
  return (
    <div
      className={`champion-entrance champion-player-${unit.owner}`}
      key={momentKey(review)}
      style={
        {
          "--champion-duration": `${reviewDelay(review, playbackSpeed)}ms`,
        } as CSSProperties
      }
      data-champion-arrival={unit.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="champion-entrance-halo" aria-hidden="true" />
      <div className="champion-entrance-portrait" aria-hidden="true">
        <img src={cardArtUrl(card)} alt="" />
        <Crown className="champion-entrance-crown" size={21} />
      </div>
      <div className="champion-entrance-copy">
        <span>
          {t(
            unit.owner === 0
              ? "Your signature champion"
              : "Opponent signature champion",
          )}
        </span>
        <strong>{card.name}</strong>
        <small>{t("Enters play")}</small>
      </div>
      <span className="champion-entrance-timer" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}

export function ScoreTrack({
  game,
  review,
}: {
  game: GameState;
  review: Review | null;
}) {
  const { t } = useI18n();
  const target = getVictoryScore(game);
  const score = scoreMoment(review);
  const position = (points: number) =>
    `${100 - (Math.min(target, Math.max(0, points)) / target) * 100}%`;
  return (
    <aside
      className="victory-track"
      aria-label={t("Victory track · first to {count}", { count: target })}
    >
      <div className="victory-heading">
        <Trophy size={20} />
        <strong>{target}</strong>
        <span>{t("TO WIN")}</span>
      </div>
      <div className="victory-rail">
        <ol className="victory-spaces" aria-hidden="true">
          {Array.from({ length: target + 1 }, (_, point) => (
            <li
              key={point}
              className={point === target ? "victory-finish" : ""}
            >
              <span>{point}</span>
            </li>
          ))}
        </ol>
        {game.players.map((player) => {
          const active = score?.player === player.id ? score : undefined;
          return (
            <div
              className={`victory-token token-player-${player.id} ${active ? "token-scoring" : ""}`}
              key={`${player.id}:${active ? momentKey(review) : "rest"}`}
              style={
                {
                  top: position(player.points),
                  "--token-from": position(active?.from ?? player.points),
                  "--token-to": position(player.points),
                } as CSSProperties
              }
              aria-label={t("{player}: {points} / {total} points", {
                player: t(player.id === 0 ? "Ti" : "AI"),
                points: player.points,
                total: target,
              })}
              data-score-token={player.id}
            >
              <span className="victory-token-gem" />
              {active && (
                <span className="victory-gain">+{active.to - active.from}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="victory-legend">
        <span>{t("Ti")}</span>
        <span>AI</span>
      </div>
    </aside>
  );
}

export function FieldScoring({
  review,
  fieldId,
}: {
  review: Review | null;
  fieldId: string;
}) {
  const { t } = useI18n();
  const score = scoreMoment(review);
  if (!score || score.fieldId !== fieldId) return null;
  return (
    <div
      className={`field-scoring scoring-player-${score.player}`}
      key={momentKey(review)}
      aria-hidden="true"
    >
      <span>
        {t(score.kind === "hold" ? "Hold" : "Conquer")}{" "}
        <b>+{score.to - score.from}</b>
      </span>
    </div>
  );
}
