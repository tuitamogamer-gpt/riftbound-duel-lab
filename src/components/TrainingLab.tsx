import { useState } from "react";
import {
  ArrowLeft,
  Check,
  RotateCcw,
  Undo2,
  GraduationCap,
} from "lucide-react";
import { findCard } from "../catalog";
import { readableText } from "../data/cards";
import { getMight } from "../game/engine";
import {
  applyTrainingAction,
  createTrainingPosition,
  readTrainingProgress,
  saveTrainingProgress,
  trainingActions,
  trainingComplete,
  trainingLessons,
  trainingPublicPosition,
} from "../game/training";
import type { TrainingLessonId } from "../game/training";
import type { GameState, LocationId } from "../game/types";
import { useI18n } from "../i18n";
import { Card } from "./Card";
import "./TrainingLab.css";

export function TrainingLab({
  onBack,
  onProgress,
}: {
  onBack: () => void;
  onProgress?: (completed: TrainingLessonId[]) => void;
}) {
  const { t } = useI18n();
  const [id, setId] = useState<TrainingLessonId>("deploy");
  const [game, setGame] = useState(() => createTrainingPosition("deploy"));
  const [history, setHistory] = useState<GameState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [completed, setCompleted] = useState(readTrainingProgress);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(true);
  const lesson = trainingLessons.find((lesson) => lesson.id === id)!;
  const success = trainingComplete(id, game);
  const publicGame = trainingPublicPosition(game);
  const actions = trainingActions(id, game);
  const visibleActions = actions.filter(
    (action) =>
      !selected ||
      action.sourceId === selected ||
      ["pass", "move-confirm", "move-cancel", "damage-done"].includes(
        action.id,
      ) ||
      game.phase === "choice" ||
      game.phase === "damage",
  );
  const selectedCardId = selected?.startsWith("hand:")
    ? publicGame.players[0].hand[Number(selected.slice(5))]
    : selected?.startsWith("hidden:")
      ? publicGame.hidden?.find(
          (card) => card.id === selected.slice(7) && card.owner === 0,
        )?.cardId
      : publicGame.units.find((unit) => unit.id === selected)?.cardId;
  const selectedCard = findCard(selectedCardId);

  const reset = (next = id) => {
    setId(next);
    setGame(createTrainingPosition(next));
    setHistory([]);
    setSelected(null);
    setError("");
  };
  const act = (actionId: string) => {
    try {
      const next = applyTrainingAction(id, game, actionId);
      setHistory((previous) => [...previous.slice(-99), game]);
      setGame(next);
      setSelected(null);
      setError("");
      if (trainingComplete(id, next) && !completed.includes(id)) {
        const progress = [...completed, id];
        setCompleted(progress);
        setSaved(saveTrainingProgress(progress));
        onProgress?.(progress);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Choose one of the available practice moves.",
      );
    }
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setGame(previous);
    setHistory((history) => history.slice(0, -1));
    setSelected(null);
    setError("");
  };
  const nextLesson =
    trainingLessons[
      trainingLessons.findIndex((lesson) => lesson.id === id) + 1
    ];
  const zones: { id: LocationId; label: string }[] = [
    { id: "base:0", label: "Your base" },
    { id: "field:0", label: "First battlefield" },
    { id: "field:1", label: "Second battlefield" },
  ];

  return (
    <main className="training-lab">
      <header className="training-header">
        <button className="ghost-button" onClick={onBack}>
          <ArrowLeft size={18} />
          {t("Back")}
        </button>
        <div>
          <span className="eyebrow">
            <GraduationCap size={16} />
            {t("Practice sandbox")}
          </span>
          <h1>{t("Training lab")}</h1>
        </div>
        <span className="training-progress">
          {t("{count} of 6 exercises complete", { count: completed.length })}
        </span>
      </header>
      <p className="training-intro">
        {t(
          "Learn with real legal moves. Retry and undo are available inside these exercises.",
        )}
      </p>
      <nav className="training-lessons" aria-label={t("Training exercises")}>
        {trainingLessons.map((lesson, index) => (
          <button
            key={lesson.id}
            className={id === lesson.id ? "active" : ""}
            aria-current={id === lesson.id ? "step" : undefined}
            onClick={() => reset(lesson.id)}
          >
            <span>
              {completed.includes(lesson.id) ? <Check size={18} /> : index + 1}
            </span>
            {t(lesson.title)}
          </button>
        ))}
      </nav>
      <section className="training-exercise" aria-labelledby="training-goal">
        <div className="training-instruction">
          <div>
            <span className="eyebrow">{t("Your objective")}</span>
            <h2 id="training-goal">{t(lesson.title)}</h2>
            <p>{t(lesson.goal)}</p>
          </div>
          <div className="training-reset">
            <button
              className="ghost-button"
              onClick={undo}
              disabled={!history.length}
            >
              <Undo2 size={17} />
              {t("Undo practice move")}
            </button>
            <button className="ghost-button" onClick={() => reset()}>
              <RotateCcw size={17} />
              {t("Retry exercise")}
            </button>
          </div>
        </div>
        <details className="training-help">
          <summary>{t("Rule and hint")}</summary>
          <p>{t(lesson.rule)}</p>
          <p>{t(lesson.hint)}</p>
        </details>
        <div className="training-state" aria-live="polite">
          <span>
            {t("Your points")}:{" "}
            <strong>{publicGame.players[0].points}/8</strong>
          </span>
          <span>
            {t("Opponent points")}:{" "}
            <strong>{publicGame.players[1].points}/8</strong>
          </span>
          <span>
            {t("Turn")} {publicGame.turn}
          </span>
          <span>
            {t("Energy")}: {publicGame.players[0].energy}
          </span>
          {game.combat?.stage === "assign" && (
            <span>
              {t("Damage left to assign")}: {game.combat.remaining[0]}
            </span>
          )}
        </div>
        <div className="training-play-area">
          <div className="training-board">
            {publicGame.stack.length > 0 && (
              <section
                className="training-chain"
                aria-label={t("Pending chain")}
              >
                <h3>{t("Pending chain")}</h3>
                {[...publicGame.stack].reverse().map((item) => (
                  <div key={item.id}>
                    <strong>{findCard(item.cardId)?.name}</strong>
                    <span>
                      {t(item.player === 0 ? "Your spell" : "Opponent spell")}
                    </span>
                  </div>
                ))}
              </section>
            )}
            {zones.map((zone) => (
              <section
                key={zone.id}
                className="training-zone"
                aria-label={t(zone.label)}
              >
                <h3>
                  {t(zone.label)}
                  {zone.id.startsWith("field:") && (
                    <span>
                      {t(
                        publicGame.fields.find((field) => field.id === zone.id)
                          ?.controller === 0
                          ? "Controlled by you"
                          : publicGame.fields.find(
                                (field) => field.id === zone.id,
                              )?.controller === 1
                            ? "Controlled by AI"
                            : "Uncontrolled",
                      )}
                    </span>
                  )}
                </h3>
                <div className="training-zone-cards">
                  {publicGame.units
                    .filter((unit) => unit.location === zone.id)
                    .map((unit) => {
                      const card = findCard(unit.cardId);
                      return (
                        card && (
                          <div
                            className={`training-unit ${unit.owner === 1 ? "enemy" : "own"}`}
                            key={unit.id}
                          >
                            <Card
                              card={card}
                              small
                              ready={unit.ready}
                              damage={unit.damage}
                              selected={selected === unit.id}
                              onClick={() =>
                                setSelected(
                                  selected === unit.id ? null : unit.id,
                                )
                              }
                              footer={
                                unit.owner === 0 ? "Your unit" : "Opponent unit"
                              }
                            />
                            <div className="training-unit-stats">
                              <strong>
                                {getMight(game, unit)} {t("Might")}
                              </strong>
                              {unit.preventDamage ? (
                                <span>
                                  {t("Prevent {amount} damage", {
                                    amount: unit.preventDamage,
                                  })}
                                </span>
                              ) : null}
                            </div>
                            <span className="training-unit-name">
                              {card.name}
                            </span>
                          </div>
                        )
                      );
                    })}
                </div>
                {!publicGame.units.some(
                  (unit) => unit.location === zone.id,
                ) && <p className="training-empty">{t("No units here")}</p>}
                {publicGame.hidden
                  ?.filter((hidden) => hidden.location === zone.id)
                  .map((hidden) =>
                    hidden.owner === 0 ? (
                      <button
                        key={hidden.id}
                        className={`training-hidden ${selected === `hidden:${hidden.id}` ? "selected" : ""}`}
                        onClick={() =>
                          setSelected(
                            selected === `hidden:${hidden.id}`
                              ? null
                              : `hidden:${hidden.id}`,
                          )
                        }
                      >
                        {t("Your Hidden card")}: {findCard(hidden.cardId)?.name}
                      </button>
                    ) : (
                      <div key={hidden.id} className="training-private">
                        {t("Opponent Hidden card")}
                      </div>
                    ),
                  )}
              </section>
            ))}
            {publicGame.players[0].hand.length > 0 && (
              <section className="training-hand" aria-label={t("Your hand")}>
                <h3>{t("Your hand")}</h3>
                <div className="training-zone-cards">
                  {publicGame.players[0].hand.map((cardId, index) => {
                    const card = findCard(cardId);
                    return (
                      card && (
                        <div
                          key={`${index}-${cardId}`}
                          className="training-hand-card"
                        >
                          <Card
                            card={card}
                            small
                            selected={selected === `hand:${index}`}
                            onClick={() =>
                              setSelected(
                                selected === `hand:${index}`
                                  ? null
                                  : `hand:${index}`,
                              )
                            }
                          />
                          <strong>{card.name}</strong>
                          <span>
                            {card.energy} {t("Energy")} · {card.power}{" "}
                            {t("Power")}
                          </span>
                        </div>
                      )
                    );
                  })}
                </div>
              </section>
            )}
          </div>
          <aside className="training-decision" aria-label={t("Practice moves")}>
            {success ? (
              <div className="training-success" role="status">
                <Check size={28} />
                <h3>{t("Exercise complete")}</h3>
                <p>{t(lesson.success)}</p>
                {nextLesson && (
                  <button
                    className="gold-button"
                    onClick={() => reset(nextLesson.id)}
                  >
                    {t("Next exercise")}
                  </button>
                )}
              </div>
            ) : (
              <>
                <h3>{t("Practice moves")}</h3>
                <p>{t("Select a card or choose an available move below.")}</p>
                {selectedCard && (
                  <div className="training-card-text">
                    <strong>{selectedCard.name}</strong>
                    <p>
                      {readableText(selectedCard.text) ||
                        t("Ova karta nema dodatni tekst efekta.")}
                    </p>
                    <button
                      className="ghost-button"
                      onClick={() => setSelected(null)}
                    >
                      {t("Show all moves")}
                    </button>
                  </div>
                )}
                <div className="training-actions">
                  {visibleActions.map((action) => (
                    <button
                      key={action.id}
                      className={
                        action.id === "pass" || action.id === "move-cancel"
                          ? "ghost-button"
                          : "gold-button"
                      }
                      onClick={() => act(action.id)}
                    >
                      {t(action.label)}
                    </button>
                  ))}
                </div>
                {!visibleActions.length && (
                  <p>
                    {t(
                      "This attempt has no remaining practice moves. Undo or retry to try another line.",
                    )}
                  </p>
                )}
              </>
            )}
            {game.pendingMove && (
              <p className="training-selection">
                {t("{count} units in the proposed group", {
                  count: game.pendingMove.unitIds.length,
                })}
              </p>
            )}
            {error && (
              <p role="alert" className="training-error">
                {t(error)}
              </p>
            )}
            {!saved && (
              <p role="status" className="training-error">
                {t(
                  "Progress is available for this visit; browser storage could not save it.",
                )}
              </p>
            )}
            <details className="training-log">
              <summary>{t("Exercise log")}</summary>
              <ol>
                {publicGame.log.slice(-8).map((entry) => (
                  <li key={entry.id}>{t(entry.text)}</li>
                ))}
              </ol>
            </details>
          </aside>
        </div>
      </section>
    </main>
  );
}
