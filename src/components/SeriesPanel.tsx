import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  RotateCcw,
  Trophy,
} from "lucide-react";
import type { StarterDeck } from "../data/decks";
import { cardsById } from "../data/cards";
import { findCard } from "../catalog";
import { isImplemented } from "../game/scripts";
import { builderCount } from "../game/deck-builder";
import {
  prepareNextSeriesGame,
  previousSeriesLoser,
  swapSeriesCards,
  updateSeriesDeck,
  validateSeriesDeck,
  type MatchSeries,
} from "../game/match-series";
import type { PlayerId } from "../game/types";
import { useI18n } from "../i18n";
import { CardDetail } from "./Card";
import "./SeriesPanel.css";

export interface SeriesPanelProps {
  series: MatchSeries;
  onChange?: (series: MatchSeries) => boolean | void;
  onStartGame: (series: MatchSeries) => void;
  onClose?: () => void;
}
const copy = (deck: StarterDeck): StarterDeck =>
  JSON.parse(JSON.stringify(deck)) as StarterDeck;

export function SeriesPanel({
  series,
  onChange,
  onStartGame,
  onClose,
}: SeriesPanelProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => copy(series.decks[0]));
  const [mainId, setMainId] = useState("");
  const [sideId, setSideId] = useState("");
  const [first, setFirst] = useState<"you" | "bot" | "random">(
    previousSeriesLoser(series) === 0 ? "you" : "bot",
  );
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => {
    setDraft(copy(series.decks[0]));
    setMainId("");
    setSideId("");
    setFirst(previousSeriesLoser(series) === 0 ? "you" : "bot");
    setError("");
  }, [series.activeGame.seed, series.phase]);
  const issues = useMemo(
    () => validateSeriesDeck(series.originalDecks[0], draft),
    [series.originalDecks, draft],
  );
  const detail = findCard(detailId ?? undefined);
  const saveLineup = (deck: StarterDeck) => {
    try {
      const next = updateSeriesDeck(series, deck);
      setDraft(copy(deck));
      setMainId("");
      setSideId("");
      const saved = onChange?.(next);
      setError(
        saved === false
          ? "The series could not be saved. This lineup remains available for this session."
          : "",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The lineup could not be changed.",
      );
    }
  };
  const exchange = () => {
    try {
      saveLineup(swapSeriesCards(draft, mainId, sideId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The lineup could not be changed.",
      );
    }
  };
  const start = () => {
    try {
      const nextFirst: PlayerId =
        first === "you" ? 0 : first === "bot" ? 1 : Math.random() < 0.5 ? 0 : 1;
      onStartGame(prepareNextSeriesGame(series, draft, nextFirst));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The next game could not be started.",
      );
    }
  };
  const cards = (entries: StarterDeck["main"], sideboard: boolean) =>
    entries.map((entry) => {
      const card = cardsById[entry.cardId];
      const selected = (sideboard ? sideId : mainId) === entry.cardId;
      return (
        <div
          className={`series-card-row ${selected ? "selected" : ""}`}
          key={entry.cardId}
        >
          <button
            className="series-card-choice"
            aria-pressed={selected}
            aria-label={t(
              sideboard ? "Bring in one {name}" : "Take out one {name}",
              { name: card?.name ?? entry.cardId },
            )}
            onClick={() =>
              sideboard
                ? setSideId(selected ? "" : entry.cardId)
                : setMainId(selected ? "" : entry.cardId)
            }
          >
            <strong>{entry.count}×</strong>
            <span>
              {card?.name ?? entry.cardId}
              <small>
                {t(card?.type ?? "")}
                {card?.energy !== null
                  ? ` · ${card?.energy} ${t("Energy")}`
                  : ""}
              </small>
            </span>
            <span className="series-selected-mark">{selected ? "✓" : "○"}</span>
          </button>
          <button
            className="series-card-read"
            aria-label={t("Read {name}", { name: card?.name ?? entry.cardId })}
            data-card-preview={entry.cardId}
            onClick={() => setDetailId(entry.cardId)}
          >
            ⓘ
          </button>
        </div>
      );
    });

  return (
    <section className="series-panel" aria-labelledby="series-panel-title">
      <header className="series-header">
        <div>
          <span className="series-eyebrow">
            {t("BEST OF THREE · PRACTICE")}
          </span>
          <h1 id="series-panel-title">
            {series.phase === "complete"
              ? t("Series complete")
              : t("Between games")}
          </h1>
          <p>
            {t(
              "First to two wins. Your registered card pool stays fixed throughout the series.",
            )}
          </p>
        </div>
        {onClose && (
          <button className="series-button secondary" onClick={onClose}>
            <ArrowLeft size={16} />
            {t("Back to decks")}
          </button>
        )}
      </header>
      <div
        className="series-score"
        aria-label={t("Series score: you {you}, AI {bot}", {
          you: series.scores[0],
          bot: series.scores[1],
        })}
      >
        <div>
          <span>{t("You")}</span>
          <strong>{series.scores[0]}</strong>
          <small>{series.decks[0].name}</small>
        </div>
        <span className="series-score-divider">—</span>
        <div>
          <span>{t("AI")}</span>
          <strong>{series.scores[1]}</strong>
          <small>{series.decks[1].name}</small>
        </div>
      </div>
      <ol className="series-results">
        {series.games.map((game) => (
          <li key={game.seed}>
            <strong>{t("Game {number}", { number: game.number })}</strong>
            <span>{t(game.winner === 0 ? "You won" : "AI won")}</span>
            <small>
              {game.points[0]}–{game.points[1]} ·{" "}
              {t("{count} turns", { count: game.turns })}
            </small>
          </li>
        ))}
      </ol>
      {series.phase === "complete" ? (
        <div className="series-finished">
          <Trophy size={40} />
          <h2>
            {t(
              series.winner === 0 ? "You won the series" : "AI won the series",
            )}
          </h2>
          <p>{t("Return to decks to start another duel or series.")}</p>
          {onClose && (
            <button className="series-button primary" onClick={onClose}>
              {t("Back to decks")}
              <ArrowRight size={17} />
            </button>
          )}
        </div>
      ) : series.phase === "playing" ? (
        <p className="series-active" role="status">
          {t("Game {number} is in progress.", {
            number: series.activeGame.number,
          })}
        </p>
      ) : (
        <>
          <div className="series-sideboard-heading">
            <div>
              <h2>{t("Prepare your next lineup")}</h2>
              <p>
                {builderCount(draft.sideboard ?? [])
                  ? t(
                      "Choose one card to take out and one card to bring in, then exchange them.",
                    )
                  : t(
                      "Your registered deck has no sideboard. Continue with this list.",
                    )}
              </p>
            </div>
            <button
              className="series-button secondary"
              onClick={() => saveLineup(copy(series.originalDecks[0]))}
            >
              <RotateCcw size={16} />
              {t("Restore registered lineup")}
            </button>
          </div>
          <div className="series-deck-lock">
            <span>
              {t("Legend")}: {cardsById[draft.legendId]?.name}
            </span>
            <span>
              {t("Chosen champion")}: {cardsById[draft.championId]?.name}
            </span>
            <small>
              {t("Legend, chosen champion, runes and battlefields stay fixed.")}
            </small>
          </div>
          <div className="series-sideboard-grid">
            <section>
              <h3>
                {t("Main deck")}{" "}
                <span>
                  {builderCount(draft.main)} + {t("champion")}
                </span>
              </h3>
              {cards(draft.main, false)}
            </section>
            <div className="series-exchange">
              <ArrowLeftRight size={30} />
              <p>
                {mainId ? cardsById[mainId]?.name : t("Choose a main card")}
              </p>
              <span>⇄</span>
              <p>
                {sideId
                  ? cardsById[sideId]?.name
                  : t("Choose a sideboard card")}
              </p>
              <button
                className="series-button primary"
                disabled={!mainId || !sideId || mainId === sideId}
                onClick={exchange}
              >
                {t("Exchange one copy")}
              </button>
            </div>
            <section>
              <h3>
                {t("Sideboard")}{" "}
                <span>{builderCount(draft.sideboard ?? [])}/10</span>
              </h3>
              {cards(draft.sideboard ?? [], true)}
              {!draft.sideboard?.length && (
                <p className="series-empty">{t("No sideboard registered.")}</p>
              )}
            </section>
          </div>
          <p className="series-bot-lineup">
            {t("AI keeps its registered list between games.")}
          </p>
          <div className="series-next-game">
            <div>
              <h2>{t("Game {number}", { number: series.games.length + 1 })}</h2>
              <p>
                {t("Previous game loser: {player}", {
                  player: t(previousSeriesLoser(series) === 0 ? "You" : "AI"),
                })}
              </p>
              <small>
                {t(
                  "The previous loser starts by default. You can change this practice choice.",
                )}
              </small>
            </div>
            <label>
              {t("Starting player")}
              <select
                value={first}
                onChange={(event) =>
                  setFirst(event.target.value as "you" | "bot" | "random")
                }
              >
                <option value="you">{t("You")}</option>
                <option value="bot">{t("AI")}</option>
                <option value="random">{t("Random")}</option>
              </select>
            </label>
            <button
              className="series-button primary"
              disabled={issues.length > 0}
              onClick={start}
            >
              {t("Start game {number}", { number: series.games.length + 1 })}
              <ArrowRight size={17} />
            </button>
          </div>
          {issues.length > 0 && (
            <ul className="series-errors" role="alert">
              {issues.map((issue) => (
                <li key={issue}>{t(issue)}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && (
        <p className="series-errors" role="alert">
          {t(error)}
        </p>
      )}
      {detail && (
        <CardDetail
          card={detail}
          scripted={isImplemented(detail.id)}
          onClose={() => setDetailId(null)}
        />
      )}
    </section>
  );
}
