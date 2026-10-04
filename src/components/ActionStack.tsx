import { useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Layers3, Sparkles } from "lucide-react";
import type { CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { getActionStackView } from "../game/stack-presentation";
import type { PresentedStackCard } from "../game/stack-presentation";
import type { GameState } from "../game/types";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";
import "./ActionStack.css";

const statusLabel = {
  waiting: "Waiting",
  next: "Resolves first",
  resolving: "Resolving now",
  playing: "Playing card",
  choosing: "Choose an effect",
};

function StackCard({
  entry,
  index,
  inspect,
}: {
  entry: PresentedStackCard;
  index: number;
  inspect?: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const kind =
    entry.status === "choosing"
      ? "Ability choice"
      : entry.kind === "trigger"
        ? "Triggered ability"
        : entry.kind === "ability"
          ? "Activated ability"
          : entry.response
            ? "Response"
            : entry.card.type;
  return (
    <li
      className={`action-stack-entry player-${entry.player} is-${entry.status} ${entry.entering ? "is-entering" : ""}`}
      data-stack-status={entry.status}
      data-stack-player={entry.player}
      data-stack-card={entry.card.id}
      data-stack-id={entry.id}
    >
      <span className="action-stack-owner">
        {t(entry.player === 0 ? "Ti" : "AI")} · {t(kind)}
      </span>
      <button
        type="button"
        className="action-stack-card"
        data-card-preview={entry.card.id}
        data-card-footer={statusLabel[entry.status]}
        aria-label={t("Inspect {card}", { card: entry.card.name })}
        onClick={() => inspect?.(entry.card)}
      >
        {!failed && entry.card.image ? (
          <img
            src={cardArtUrl(entry.card)}
            alt={entry.card.name}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="action-stack-fallback">
            <Sparkles size={22} />
            <strong>{entry.card.name}</strong>
          </span>
        )}
        <span className="action-stack-order" aria-hidden="true">
          {entry.status === "playing" ? <Sparkles size={12} /> : index + 1}
        </span>
      </button>
      <strong className="action-stack-name">{entry.card.name}</strong>
      <span className="action-stack-status">
        {t(statusLabel[entry.status])}
      </span>
    </li>
  );
}

/** Mount inside .battlefields so action/reaction cards stay in the play area. */
export function ActionStack({
  game,
  review,
  paused = false,
  inspect,
}: {
  game: GameState;
  review: Review | null;
  paused?: boolean;
  inspect?: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLElement>(null);
  const [flights, setFlights] = useState<
    {
      id: string;
      card: CatalogCard;
      player: 0 | 1;
      left: number;
      top: number;
      width: number;
      height: number;
    }[]
  >([]);
  const view = getActionStackView(game, review);
  const enteringKey =
    view?.cards
      .filter((entry) => entry.entering)
      .map((entry) => entry.id)
      .join(",") ?? "";
  useLayoutEffect(() => {
    const layer = root.current;
    if (!layer || !enteringKey || paused) {
      setFlights([]);
      return;
    }
    const measure = () => {
      const bounds = layer.getBoundingClientRect();
      const entries = [
        ...layer.querySelectorAll<HTMLElement>(
          ".action-stack-entry.is-entering",
        ),
      ];
      setFlights(
        entries.flatMap((entry) => {
          const card = view!.cards.find(
            (card) => card.id === entry.dataset.stackId,
          );
          const button = entry.querySelector<HTMLElement>(".action-stack-card");
          if (!card || !button) return [];
          const rect = button.getBoundingClientRect();
          return [
            {
              id: card.id,
              card: card.card,
              player: card.player,
              left: rect.left - bounds.left,
              top: rect.top - bounds.top,
              width: rect.width,
              height: rect.height,
            },
          ];
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layer);
    return () => observer.disconnect();
  }, [enteringKey, paused]);
  if (!view) return null;
  const hasChain = view.cards.some((entry) => entry.status !== "playing");
  const resolving = view.cards.some((entry) => entry.status === "resolving");
  const choosing = view.cards.some((entry) => entry.status === "choosing");
  return (
    <section
      ref={root}
      className={`action-stack ${paused ? "is-paused" : ""} ${resolving ? "is-resolving" : ""}`}
      aria-label={t(hasChain ? "Action chain" : "Playing card")}
      data-stack-count={view.cards.length}
    >
      <header className="action-stack-heading">
        <Layers3 size={13} />
        <strong>
          {t(
            choosing
              ? "Choose an effect"
              : hasChain
                ? "Action chain"
                : "Playing card",
          )}
        </strong>
        <span>
          {t(
            paused
              ? "Game paused"
              : choosing
                ? "Waiting for a choice"
                : resolving
                  ? "Resolving now"
                  : hasChain
                    ? "Last played resolves first"
                    : view.cards[0].player === 0
                      ? "Ti"
                      : "AI",
          )}
        </span>
      </header>
      <ol className="action-stack-cards">
        {view.cards.map((entry, index) => (
          <StackCard
            key={entry.id}
            entry={entry}
            index={index}
            inspect={inspect}
          />
        ))}
      </ol>
      {flights.map((flight) => (
        <div
          key={flight.id}
          className={`action-stack-flight player-${flight.player}`}
          style={{
            left: flight.left,
            top: flight.top,
            width: flight.width,
            height: flight.height,
          }}
          aria-hidden="true"
        >
          <img src={cardArtUrl(flight.card)} alt="" />
        </div>
      ))}
      {view.feedback?.changes.length ? (
        <div className="action-stack-outcomes" role="status">
          {view.feedback.changes.slice(0, 2).map((change, index) => (
            <span key={index} className={`outcome-${change.tone}`}>
              {change.player !== undefined &&
                `${t(change.player === 0 ? "Ti" : "AI")} · `}
              {t(change.key, change.values)}
            </span>
          ))}
        </div>
      ) : hasChain && !review ? (
        <span className="action-stack-priority" role="status">
          <ArrowDown size={11} />{" "}
          {t(choosing ? "Choose an effect" : "Reaction window")} ·{" "}
          {t(view.priorityPlayer === 0 ? "Ti" : "AI")}
        </span>
      ) : null}
    </section>
  );
}
