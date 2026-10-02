import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { findCard } from "../catalog";
import { readableText } from "../data/cards";
import { selectedCardId, sourceActions } from "../game/flow";
import type { GameAction, GameState } from "../game/types";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";

export function MatchControls({
  game,
  legal,
  selected,
  target,
  clear,
  act,
  review,
  busy,
  paused,
  resume,
  mulligan,
}: {
  game: GameState;
  legal: GameAction[];
  selected: string | null;
  target: string | null;
  clear: () => void;
  act: (action: GameAction) => void;
  review: Review | null;
  busy: boolean;
  paused: boolean;
  resume: () => void;
  mulligan: number[];
}) {
  const { t } = useI18n();
  const card = findCard(selectedCardId(game, selected));
  const effectCard = findCard(game.stack.at(-1)?.cardId);
  const actions = sourceActions(game, legal, selected).filter(
    (action) =>
      !target ||
      action.targetId === target ||
      (!action.targetId && action.locationId === target),
  );
  const ending = legal.find((action) =>
    ["pass", "end"].includes(action.category),
  );
  const [pageState, setPage] = useState({ key: "", page: 0 });
  const pageKey = `${selected}:${target}:${actions.map((action) => action.id).join(";")}`;
  const page = pageState.key === pageKey ? pageState.page : 0;
  const pageCount = Math.ceil(actions.length / 3);
  const opening = game.phase === "mulligan" && !game.players[0].mulliganDone;
  const keep = legal.find(
    (action) =>
      action.category === "mulligan" &&
      [...(action.cardIndices ?? [])].sort().join() ===
        [...mulligan].sort().join(),
  );
  const ownUnit = game.units.find(
    (unit) => unit.id === selected && unit.owner === 0,
  );
  const title = paused
    ? "Game paused"
    : review
      ? review.action.player === 0
        ? "Your play"
        : "Opponent's play"
      : busy
        ? "Opponent is playing"
        : opening
          ? "Choose your opening hand"
          : game.winner !== null
            ? "Match complete"
            : (card?.name ??
              (game.phase === "damage"
                ? "Choose a damage target"
                : game.phase === "move"
                  ? "Move your units"
                  : game.phase === "choice"
                    ? "Choose an effect"
                    : ending?.category === "pass"
                      ? "Your reaction"
                      : "Your turn"));
  const hint = paused
    ? "Resume when you are ready."
    : review
      ? (review.frames[review.index]?.label ?? "Resolving effects")
      : busy
        ? "Watch the highlighted cards. Your turn follows automatically."
        : opening
          ? "Click up to two cards in your hand to replace them, or keep your hand."
          : card
            ? actions.length
              ? actions.some((action) => action.targetId)
                ? "Choose a highlighted target or a move below."
                : readableText(card.text) || "Choose a move below."
              : ownUnit && !ownUnit.ready
                ? "This unit is exhausted. It readies at the start of your turn."
                : "No legal play now. Check the cost, timing and available targets."
            : game.phase === "damage"
              ? "Click a highlighted enemy to assign your damage."
              : game.phase === "move"
                ? "Click your units to add or remove them, then confirm the move."
                : game.phase === "choice"
                  ? "Choose one of the available effects below."
                  : ending?.category === "pass"
                    ? "Play a highlighted card to respond, or let the effect resolve."
                    : "Click a glowing card to play it, or a ready unit to move. End your turn when finished.";
  return (
    <section
      className={`match-controls ${review || busy ? "is-busy" : ""}`}
      aria-label={t("Game controls")}
    >
      <div className="decision-copy" role="status" aria-live="polite">
        <span className="decision-kicker">
          {t(
            opening
              ? "Opening hand"
              : busy || review
                ? "Resolving effects"
                : "Your next move",
          )}
        </span>
        <strong>
          {card && !busy && !review && !paused ? card.name : t(title)}
          {!card &&
            !review &&
            ending?.category === "pass" &&
            effectCard &&
            ` · ${effectCard.name}`}
          {card && !busy && !review && !paused && (
            <span className="card-cost-note">
              {t(card.type)} · {card.energy ?? 0} {t("ENERGY")} ·{" "}
              {card.power ?? 0} {t("power")}
            </span>
          )}
        </strong>
        <p>
          {game.combat &&
            !review &&
            game.phase === "damage" &&
            `${t("Damage remaining: {count}", { count: game.combat.remaining[0] })} · `}
          {t(hint)}
        </p>
      </div>
      {selected && !busy && !review && !opening && (
        <button
          className="cancel-selection"
          onClick={clear}
          aria-label={t("Poništi odabir")}
        >
          <X size={18} />
        </button>
      )}
      <div className="decision-actions">
        {paused ? (
          <button className="gold-button" onClick={resume}>
            {t("Resume game")} <ArrowRight size={17} />
          </button>
        ) : review || busy ? (
          <span className="playing-indicator">
            <i />
            <i />
            <i />
          </span>
        ) : opening ? (
          <button
            className="gold-button"
            disabled={!keep}
            onClick={() => keep && act(keep)}
          >
            {mulligan.length === 1
              ? t("Replace 1 card")
              : mulligan.length
                ? t("Replace {count} cards", { count: mulligan.length })
                : t("Zadrži ruku")}{" "}
            <ArrowRight size={17} />
          </button>
        ) : (
          <>
            <div className="context-actions">
              {actions.slice(page * 3, page * 3 + 3).map((action) => (
                <button
                  key={action.id}
                  className="context-action"
                  onClick={() => act(action)}
                  title={t(action.detail)}
                >
                  <strong>{t(action.label)}</strong>
                  {action.detail && <small>{t(action.detail)}</small>}
                </button>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="action-pages">
                <button
                  disabled={page === 0}
                  aria-label={t("Previous options")}
                  onClick={() => setPage({ key: pageKey, page: page - 1 })}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {page + 1}/{pageCount}
                </span>
                <button
                  disabled={page + 1 >= pageCount}
                  aria-label={t("More options")}
                  onClick={() => setPage({ key: pageKey, page: page + 1 })}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            {ending && (
              <button
                className="gold-button end-turn"
                onClick={() => act(ending)}
              >
                {t(
                  ending.category === "end"
                    ? "End turn"
                    : "Continue without reacting",
                )}{" "}
                <ArrowRight size={17} />
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
