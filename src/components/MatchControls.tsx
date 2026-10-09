import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { findCard, type CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { Card } from "./Card";
import { useCompactTable } from "../hooks/useCompactTable";
import {
  cardEffectSummary,
  publicActionTargets,
} from "../game/action-target-presentation";
import { isFriendlyBuffAction } from "../game/friendly-buff-actions";
import { readableText } from "../data/cards";
import { decisionActions, selectedCardId, sourceActions } from "../game/flow";
import {
  damageAssignmentSummary,
  decisionReason,
} from "../game/decision-reasons";
import type { GameAction, GameState } from "../game/types";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";
import {
  matchStatus,
  priorityWindow,
  visibleTurnStep,
} from "../game/presentation";
import {
  filterHiddenPlayMode,
  hiddenCardStatus,
  hiddenHandStatus,
  type HiddenPlayMode,
} from "../game/hidden-presentation";
import {
  getActionStackView,
  pendingChoiceCardId,
} from "../game/stack-presentation";

export function MatchControls({
  game,
  legal,
  selected,
  target,
  hiddenPlayMode = "hide",
  setHiddenPlayMode,
  clear,
  act,
  requestAction,
  review,
  busy,
  paused,
  resume,
  step,
  mulligan,
  inspect,
}: {
  game: GameState;
  legal: GameAction[];
  selected: string | null;
  target: string | null;
  hiddenPlayMode?: HiddenPlayMode;
  setHiddenPlayMode?: (mode: HiddenPlayMode) => void;
  clear: () => void;
  act: (action: GameAction) => void;
  /** Optional payment-aware dispatcher; the engine still validates confirmation. */
  requestAction?: (action: GameAction) => void;
  review: Review | null;
  busy: boolean;
  paused: boolean;
  resume: () => void;
  step?: (direction: -1 | 1) => void;
  mulligan: number[];
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const compact = useCompactTable();
  const dispatch = requestAction ?? act;
  const damageSummary =
    !review && game.phase === "damage" ? damageAssignmentSummary(game) : null;
  const window = priorityWindow(game);
  const modeLegal = filterHiddenPlayMode(game, legal, selected, hiddenPlayMode);
  const hiddenSetup =
    !review && !busy && !paused
      ? hiddenHandStatus(game, selected, legal)
      : null;
  const stackView = getActionStackView(game, review);
  const forcedPass =
    !review && legal.length === 1 && legal[0].category === "pass";
  const selectedAction = selected
    ? modeLegal.find(
        (action) => action.sourceId === selected && action.player === 0,
      )
    : undefined;
  const card = findCard(
    selectedCardId(game, selected) ?? selectedAction?.cardId,
  );
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
  const inspectedTop =
    game.pendingChoice?.kind === "predict" && game.pendingChoice.player === 0
      ? game.players[game.pendingChoice.effect?.who === "opponent" ? 1 : 0]
          .deck[0]
      : undefined;
  const available = sourceActions(game, modeLegal, selected).filter(
    (action) =>
      !target ||
      action.targetId === target ||
      (!action.targetId && action.locationId === target),
  );
  const {
    options: allActions,
    confirm,
    cancel,
  } = decisionActions(game, available);
  const namingSpell =
    game.pendingChoice?.kind === "custom" &&
    allActions.some((action) =>
      action.id.startsWith("choose-custom:wave9-name:"),
    );
  const searchKey = `${game.turn}:${game.pendingChoice?.sourceId}`;
  const [searchState, setSearch] = useState({ key: "", value: "" });
  const search = searchState.key === searchKey ? searchState.value : "";
  const actions = namingSpell
    ? allActions.filter((action) =>
        findCard(action.cardId)
          ?.name.toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : allActions;
  const shownTargets = publicActionTargets(
    game,
    review?.action ?? { targetId: target ?? undefined },
  );
  const hasTargetOptions = actions.some(
    (action) => publicActionTargets(game, action).length,
  );
  const pageSize = compact && hasTargetOptions ? 1 : 3;
  const movement =
    game.phase === "move" && game.pendingMove?.player === 0
      ? game.pendingMove
      : null;
  const trashSelection =
    game.pendingChoice?.kind === "trashTargets" ? game.pendingChoice : null;
  const boardSelection =
    game.pendingChoice?.kind === "boardTargets"
      ? game.pendingChoice.boardSelection
      : null;
  const destination = movement?.to.startsWith("field:")
    ? findCard(game.fields.find((field) => field.id === movement.to)?.cardId)
        ?.name
    : t("Tvoja baza");
  const ending = legal.find((action) =>
    ["pass", "end"].includes(action.category),
  );
  const [pageState, setPage] = useState({ key: "", page: 0 });
  const pageKey = `${selected}:${target}:${hiddenPlayMode}:${pageSize}:${actions.map((action) => action.id).join(";")}`;
  const page = pageState.key === pageKey ? pageState.page : 0;
  const pageCount = Math.ceil(actions.length / pageSize);
  const opening = game.phase === "mulligan" && !game.players[0].mulliganDone;
  const keep = legal.find(
    (action) =>
      action.category === "mulligan" &&
      [...(action.cardIndices ?? [])].sort().join() ===
        [...mulligan].sort().join(),
  );
  const blockedReason = useMemo(
    () =>
      !busy && !review && !paused && !available.length
        ? decisionReason(game, legal, selected, target)
        : null,
    [game, legal, selected, target, busy, review, paused, available.length],
  );
  const title = paused
    ? "Game paused"
    : review
      ? visibleTurnStep(game) !== "main"
        ? game.currentPlayer === 0
          ? "Your turn"
          : "Opponent turn"
        : review.action.player === 0
          ? "Your play"
          : "Opponent's play"
      : busy
        ? "Opponent is playing"
        : opening
          ? "Choose your opening hand"
          : game.winner !== null
            ? "Match complete"
            : (card?.name ?? matchStatus(game).label);
  const hint = paused
    ? (review?.frames[review.index]?.label ?? "Resume when you are ready.")
    : review
      ? (review.frames[review.index]?.label ?? "Resolving effects")
      : busy
        ? "The opponent is choosing a move. Play continues automatically."
        : opening
          ? "Click up to two cards in your hand to replace them, or keep your hand."
          : card
            ? hiddenStatus
              ? hiddenStatus.hint
              : hiddenSetup && hiddenPlayMode === "hide"
                ? hiddenSetup.hint
                : actions.length
                  ? selectedAction && isFriendlyBuffAction(game, selectedAction)
                    ? cardEffectSummary(card.text) ||
                      "Choose a highlighted target or an available move."
                    : actions.some((action) => action.targetId)
                      ? "Choose a highlighted target or an available move."
                      : readableText(card.text) || "Choose a move."
                  : (blockedReason ??
                    "This card has no legal target, destination or available effect in this position.")
            : game.phase === "damage"
              ? "Click a highlighted enemy to assign your damage."
              : game.phase === "move"
                ? "Click your units to add or remove them, then confirm the move."
                : game.phase === "choice"
                  ? "Choose one of the available effects."
                  : forcedPass
                    ? "No available response. Passing priority shortly."
                    : hiddenAvailable
                      ? "A Hidden card is ready. Reveal it here or select it on the battlefield."
                      : ending?.category === "pass"
                        ? window === "reaction"
                          ? "Play a highlighted card to respond, or let the effect resolve."
                          : "Play an Action or Reaction, or pass focus to continue the showdown."
                        : "Click a glowing card to play it, or a ready unit to move. End your turn when finished.";
  return (
    <section
      className={`match-controls visual-controls window-${window} ${sourceCard ? "has-source" : ""} ${hasTargetOptions ? "has-target-options" : ""} ${hiddenSetup ? "has-hidden-modes" : ""} ${review || busy ? "is-busy" : ""}`}
      aria-label={t("Game controls")}
    >
      <div className="decision-context">
        {sourceCard && (
          <div className="decision-source" data-decision-card={sourceCard.id}>
            <Card card={sourceCard} onClick={() => inspect(sourceCard)} />
          </div>
        )}
        <div className="decision-copy" role="status" aria-live="polite">
          <span className="decision-kicker">
            {t(
              paused
                ? "Game paused"
                : busy || review
                  ? "Resolving effects"
                  : opening
                    ? "Opening hand"
                    : game.pendingChoice
                      ? "Choose an effect"
                      : window === "reaction"
                        ? "Your reaction"
                        : "Your next move",
            )}
            {review && (
              <span className="review-progress">
                {" · "}
                {t("Effect {count} of {total}", {
                  count: review.index + 1,
                  total: review.frames.length,
                })}
              </span>
            )}
          </span>
          <strong>
            <span className="decision-title">
              {sourceCard && !paused ? sourceCard.name : t(title)}
              {!sourceCard &&
                !review &&
                ending?.category === "pass" &&
                effectCard &&
                ` · ${effectCard.name}`}
            </span>
            {card && !busy && !review && !paused && (
              <span className="card-cost-note">
                {hidden ? (
                  t("Hidden · base cost ignored")
                ) : hiddenSetup && hiddenPlayMode === "hide" ? (
                  t(hiddenSetup.costLabel)
                ) : (
                  <>
                    {t("Printed cost")} · {card.energy ?? 0} {t("ENERGY")} ·{" "}
                    {card.power ?? 0} {t("power")}
                  </>
                )}
              </span>
            )}
          </strong>
          {shownTargets.length > 0 && (
            <div className="decision-target-summary">
              <ArrowRight size={14} aria-hidden="true" />
              <span>
                {t("Target: {card}", {
                  card: shownTargets.map((item) => item.card.name).join(" + "),
                })}
              </span>
            </div>
          )}
          <p>
            {damageSummary &&
              `${t("Damage remaining: {count}", { count: damageSummary.remaining })} · ${t("{count} lethal assignments", { count: damageSummary.lethal })} · `}
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
              : boardSelection && !review && !paused && !busy
                ? t(
                    "{count} selected · Choose cards on the board, then confirm.",
                    { count: boardSelection.selected.length },
                  )
                : trashSelection && !review && !paused && !busy
                  ? t(
                      "{count} selected · Choose cards from the trash, then confirm.",
                      { count: trashSelection.trashSelection!.selected.length },
                    )
                  : t(hint)}
          </p>
          {namingSpell && !review && !paused && !busy && (
            <input
              className="spell-name-search"
              type="search"
              aria-label={t("Search spell names")}
              placeholder={t("Search spell names")}
              value={search}
              onChange={(event) =>
                setSearch({ key: searchKey, value: event.target.value })
              }
            />
          )}
        </div>
      </div>
      {hiddenSetup && (
        <div
          className="hidden-play-modes"
          role="group"
          aria-label={t("Play method")}
        >
          <button
            type="button"
            data-hidden-mode="hide"
            aria-pressed={hiddenPlayMode === "hide"}
            onClick={() => setHiddenPlayMode?.("hide")}
          >
            {t(hiddenSetup.costLabel)}
          </button>
          <button
            type="button"
            data-hidden-mode="play"
            aria-pressed={hiddenPlayMode === "play"}
            onClick={() => setHiddenPlayMode?.("play")}
          >
            {t("Play now")}
            <small>{t("Normal cost")}</small>
          </button>
          <button
            type="button"
            className="cancel-selection"
            onClick={clear}
            aria-label={t("Poništi odabir")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <div className="decision-actions">
        {selected &&
          !hiddenSetup &&
          !paused &&
          !busy &&
          !review &&
          !opening && (
            <button
              className="cancel-selection"
              onClick={clear}
              aria-label={t("Poništi odabir")}
            >
              <X size={18} />
            </button>
          )}
        {paused ? (
          <>
            {review && step && (
              <div
                className="review-navigation"
                role="group"
                aria-label={t("Review effects")}
              >
                <button
                  className="secondary-decision review-previous"
                  disabled={review.index === 0}
                  aria-label={t("Previous effect")}
                  title={t("Previous effect")}
                  onClick={() => step(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button className="secondary-decision" onClick={() => step(1)}>
                  {t(
                    review.index + 1 === review.frames.length
                      ? "Finish review"
                      : "Next effect",
                  )}
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
            <button className="gold-button" onClick={resume}>
              {t("Resume game")} <ArrowRight size={17} />
            </button>
          </>
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
            onClick={() => keep && dispatch(keep)}
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
              {namingSpell && !actions.length && (
                <span>{t("No matching spells")}</span>
              )}
              {actions
                .slice(page * pageSize, page * pageSize + pageSize)
                .map((action) => {
                  const targets = publicActionTargets(game, action);
                  const optionCard = findCard(
                    targets[0]?.card.id ?? inspectedTop ?? action.cardId,
                  );
                  return (
                    <button
                      key={action.id}
                      className={`context-action ${targets.length ? "has-target" : ""}`}
                      data-action-id={action.id}
                      data-target-id={action.targetId}
                      aria-label={
                        t(action.label) +
                        (targets.length
                          ? ` · ${targets.map((item) => [item.owner === undefined ? "" : t(item.owner === 0 ? "Ti" : "Protivnik"), item.card.name, t(item.location)].filter(Boolean).join(" · ")).join(" + ")}`
                          : "")
                      }
                      onClick={() => dispatch(action)}
                      title={
                        t(action.label) +
                        (action.detail ? ` · ${t(action.detail)}` : "")
                      }
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
                        {targets.length ? (
                          <>
                            <span className="decision-action-label">
                              {t(action.label)}
                            </span>
                            {targets.map((item) => (
                              <span className="decision-target" key={item.id}>
                                <strong>{item.card.name}</strong>
                                <small className="decision-target-location">
                                  {[
                                    item.owner === undefined
                                      ? ""
                                      : t(
                                          item.owner === 0 ? "Ti" : "Protivnik",
                                        ),
                                    t(item.location),
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </small>
                              </span>
                            ))}
                          </>
                        ) : (
                          <strong>{t(action.label)}</strong>
                        )}
                        {action.id.startsWith("hide:") && hiddenSetup ? (
                          <small className="hidden-action-cost">
                            {t(
                              action.id.endsWith(":energy")
                                ? "Hide · 1 Energy"
                                : hiddenSetup.costLabel,
                            )}
                          </small>
                        ) : (
                          action.detail && <small>{t(action.detail)}</small>
                        )}
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
                onClick={() => dispatch(cancel)}
              >
                {t("Cancel movement")}
              </button>
            )}
            {(movement || confirm) && (
              <button
                className="gold-button confirm-decision"
                disabled={!confirm}
                onClick={() => confirm && dispatch(confirm)}
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
            {ending && !(hiddenSetup && actions.length) && (
              <button
                className={`gold-button end-turn ${selected && actions.length ? "secondary-ending" : ""}`}
                onClick={() => dispatch(ending)}
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
    </section>
  );
}
