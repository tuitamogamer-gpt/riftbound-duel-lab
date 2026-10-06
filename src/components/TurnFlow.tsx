import { Swords, Zap } from "lucide-react";
import { getCombatPreview } from "../game/engine";
import { priorityWindow, visibleTurnStep } from "../game/presentation";
import type { GameState } from "../game/types";
import { useI18n } from "../i18n";
import type { Review } from "./StepFlow";

const steps = [
  ["awaken", "A", "Awaken", "Ready units, gear and runes"],
  ["beginning", "B", "Beginning", "Start effects and holding points"],
  ["channel", "C", "Channel", "Channel your runes"],
  ["draw", "D", "Draw", "Draw a card"],
  ["main", "→", "Main", "Play cards and move units"],
] as const;
const windowNames = {
  opening: "Opening hand",
  starting: "Turn opening",
  action: "Action window",
  reaction: "Reaction window",
  damage: "Combat damage",
  choice: "Choose an effect",
  move: "Move your units",
  ended: "Match complete",
};
export function TurnFlow({
  game,
  review,
  paused,
}: {
  game: GameState;
  review: Review | null;
  paused: boolean;
}) {
  const { t } = useI18n();
  const current = steps.findIndex(([id]) => id === visibleTurnStep(game));
  const window = priorityWindow(game);
  const starting = window === "starting";
  return (
    <section
      className={`turn-flow window-${window}`}
      aria-label={t("Turn sequence")}
    >
      <span
        className={`turn-owner ${game.currentPlayer === 1 ? "is-opponent" : ""}`}
      >
        {t(game.currentPlayer === 0 ? "Your turn" : "Opponent turn")}
      </span>
      <ol className="turn-steps">
        {steps.map(([id, letter, name, hint], i) => (
          <li
            key={id}
            className={
              game.phase === "mulligan"
                ? ""
                : i === current
                  ? "is-current"
                  : i < current
                    ? "is-complete"
                    : ""
            }
            aria-current={
              game.phase !== "mulligan" && i === current ? "step" : undefined
            }
            title={`${t(name)} · ${t(hint)}`}
          >
            <b>{letter}</b>
            <span>{t(name)}</span>
          </li>
        ))}
      </ol>
      <div className="priority-window" role="status" aria-live="polite">
        {game.combat ? <Swords size={16} /> : <Zap size={15} />}
        <div>
          <strong>{t(paused ? "Game paused" : windowNames[window])}</strong>
          <small>
            {t(
              starting
                ? steps[current][3]
                : review
                  ? "Resolving effects"
                  : game.winner !== null
                    ? "Match complete"
                    : game.priorityPlayer === 0
                      ? "You have priority"
                      : "AI has priority",
            )}
          </small>
        </div>
      </div>
    </section>
  );
}

export function ShowdownCue({
  game,
  review,
  fieldId,
}: {
  game: GameState;
  review: Review | null;
  fieldId: string;
}) {
  const { t } = useI18n();
  const event = review?.frames[review.index]?.combat;
  if (
    event?.preview.fieldId !== fieldId ||
    !["start", "impact", "result"].includes(event.stage)
  )
    return null;
  const label =
    event.stage === "start"
      ? "SHOWDOWN"
      : event.stage === "impact"
        ? "CLASH"
        : "Combat resolved";
  return (
    <div
      key={`${game.turn}-${review?.index}-${event.stage}`}
      className={`showdown-cue cue-${event.stage}`}
      aria-live="polite"
    >
      <Swords size={28} />
      <strong>{t(label)}</strong>
      <small>
        {event.stage === "impact"
          ? t("Simultaneous damage")
          : t(event.preview.attacker === 0 ? "You attack" : "AI attacks")}
      </small>
    </div>
  );
}

export function CombatReadout({ game }: { game: GameState }) {
  const { t } = useI18n();
  const preview = getCombatPreview(game);
  if (!preview) return <Swords size={18} />;
  return (
    <span className="combat-readout">
      <b>
        {t("Ti")} {preview.total[0]}
      </b>
      <Swords size={16} />
      <b>AI {preview.total[1]}</b>
      <small>{t(game.phase === "damage" ? "Combat damage" : "SHOWDOWN")}</small>
    </span>
  );
}
