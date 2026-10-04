import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { findCard, type CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { Card } from "./Card";
import { CardPiles, type PileView } from "./CardPiles";
import { readableText } from "../data/cards";
import { decisionActions, selectedCardId, sourceActions } from "../game/flow";
import type { GameAction, GameState } from "../game/types";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";
import { priorityWindow } from "../game/presentation";
import { hiddenCardStatus } from "../game/hidden-presentation";
import {
  getActionStackView,
  pendingChoiceCardId,
} from "../game/stack-presentation";

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
  inspect,
  openPile,
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
  inspect: (card: CatalogCard) => void;
  openPile: (view: PileView) => void;
}) {
  const { t } = useI18n();
  const window = priorityWindow(game);
  const stackView = getActionStackView(game, review);
  const forcedPass =
    !review && legal.length === 1 && legal[0].category === "pass";
  const card = findCard(selectedCardId(game, selected));
  const hidden = game.hidden?.find(
    (h) => h.owner === 0 && selected === `hidden:${h.id}`,
  );
  const hiddenStatus = hidden
    ? hiddenCardStatus(game, hidden, legal)
    : undefined;
  const hiddenAvailable =
    !selected && legal.some((a) => a.sourceId?.startsWith("hidden:"));
  const effectCard = findCard(game.stack.at(-1)?.cardId);
  const choiceCard = findCard(pendingChoiceCardId(game));
  const sourceCard = review
    ? stackView?.cards[0]?.card
    : (choiceCard ?? card ?? stackView?.cards[0]?.card);
  const available = sourceActions(game, legal, selected).filter(
    (action) =>
      !target ||
      action.targetId === target ||
      (!action.targetId && action.locationId === target),
  );
  const {
    options: actions,
    confirm,
    cancel,
  } = decisionActions(game, available);
  const movement =
    game.phase === "move" && game.pendingMove?.player === 0
      ? game.pendingMove
      : null;
  const destination = movement?.to.startsWith("field:")
    ? findCard(game.fields.find((field) => field.id === movement.to)?.cardId)
        ?.name
    : t("Tvoja baza");
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
                      ? window === "reaction"
                        ? "Your reaction"
                        : "Action window"
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
            ? hiddenStatus
              ? hiddenStatus.hint
              : actions.length
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
                  : forcedPass
                    ? "No available response. Passing priority shortly."
                    : hiddenAvailable
                      ? "A Hidden card is ready. Reveal it below or select it on the battlefield."
                      : ending?.category === "pass"
                        ? window === "reaction"
                          ? "Play a highlighted card to respond, or let the effect resolve."
                          : "Play an Action or Reaction, or pass focus to continue the showdown."
                        : "Click a glowing card to play it, or a ready unit to move. End your turn when finished.";
  return (
    <section
      className={`match-controls visual-controls window-${window} ${sourceCard ? "has-source" : ""} ${review || busy ? "is-busy" : ""}`}
      aria-label={t("Game controls")}
    >
      {sourceCard && (
        <div className="decision-source" data-decision-card={sourceCard.id}>
          <Card card={sourceCard} onClick={() => inspect(sourceCard)} />
        </div>
      )}
      <div className="decision-copy" role="status" aria-live="polite">
        <span className="decision-kicker">
          {t(
            opening
              ? "Opening hand"
              : game.pendingChoice
                ? "Choose an effect"
                : busy || review
                  ? "Resolving effects"
                  : "Your next move",
          )}
        </span>
        <strong>
          {sourceCard && !paused ? sourceCard.name : t(title)}
          {!sourceCard &&
            !review &&
            ending?.category === "pass" &&
            effectCard &&
            ` · ${effectCard.name}`}
          {card && !busy && !review && !paused && (
            <span className="card-cost-note">
              {hidden ? (
                t("Hidden · base cost ignored")
              ) : (
                <>
                  {t(card.type)} · {card.energy ?? 0} {t("ENERGY")} ·{" "}
                  {card.power ?? 0} {t("power")}
                </>
              )}
            </span>
          )}
        </strong>
        <p>
          {game.combat &&
            !review &&
            game.phase === "damage" &&
            `${t("Damage remaining: {count}", { count: game.combat.remaining[0] })} · `}
          {movement && !review && !paused && !busy
            ? t("{count} selected → {destination}. {instruction}", {
                count: movement.unitIds.length,
                destination: destination ?? "",
                instruction: t(
                  !movement.unitIds.length
                    ? "Click a ready unit to add it."
                    : !confirm
                      ? "Cannot pay for this group. Remove a unit or cancel."
                      : "Click units to change the group, then confirm.",
                ),
              })
            : t(hint)}
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
              {actions.slice(page * 3, page * 3 + 3).map((action) => {
                const optionCard = findCard(
                  game.units.find((unit) => unit.id === action.targetId)
                    ?.cardId ??
                    game.gears.find((gear) => gear.id === action.targetId)
                      ?.cardId ??
                    game.stack.find((item) => item.id === action.targetId)
                      ?.cardId ??
                    (game.pendingChoice?.kind === "predict" &&
                    game.pendingChoice.player === 0
                      ? game.players[0].deck[0]
                      : undefined) ??
                    action.cardId,
                );
                return (
                  <button
                    key={action.id}
                    className="context-action"
                    onClick={() => act(action)}
                    title={t(action.detail)}
                  >
                    {optionCard?.image && (
                      <img
                        className="decision-option-art"
                        src={cardArtUrl(optionCard)}
                        alt={optionCard.name}
                        data-card-preview={optionCard.id}
                      />
                    )}
                    <span>
                      <strong>{t(action.label)}</strong>
                      {action.detail && <small>{t(action.detail)}</small>}
                    </span>
                  </button>
                );
              })}
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
            {cancel && (
              <button
                className="secondary-decision"
                onClick={() => act(cancel)}
              >
                {t("Cancel movement")}
              </button>
            )}
            {(movement || confirm) && (
              <button
                className="gold-button confirm-decision"
                disabled={!confirm}
                onClick={() => confirm && act(confirm)}
              >
                {movement
                  ? movement.unitIds.length === 1
                    ? t("Move 1 unit")
                    : t("Move {count} units", {
                        count: movement.unitIds.length,
                      })
                  : t(confirm!.label)}{" "}
                <ArrowRight size={17} />
              </button>
            )}
            {ending && (
              <button
                className={`gold-button end-turn ${selected && actions.length ? "secondary-ending" : ""}`}
                onClick={() => act(ending)}
              >
                {t(
                  ending.category === "end"
                    ? "End turn"
                    : window === "reaction"
                      ? "Continue without reacting"
                      : "Pass focus",
                )}{" "}
                <ArrowRight size={17} />
              </button>
            )}
          </>
        )}
      </div>
      <CardPiles game={game} open={openPile} />
    </section>
  );
}
