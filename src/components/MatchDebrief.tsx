import { useMemo } from "react";
import { ArrowRight, Flag, Shield, Swords, Trophy, Zap } from "lucide-react";
import { matchDebrief } from "../game/match-debrief";
import type { HistoryFrame } from "../game/match-history";
import type { PlayerId } from "../game/types";
import { useI18n } from "../i18n";
import "./MatchDebrief.css";

export function MatchDebrief({
  frames,
  viewer,
  seek,
}: {
  frames: HistoryFrame[];
  viewer: PlayerId;
  seek: (frame: number) => void;
}) {
  const { t } = useI18n();
  const recap = useMemo(() => matchDebrief(frames, viewer), [frames, viewer]);
  const icons = {
    score: Flag,
    board: Swords,
    resources: Zap,
    response: Shield,
    finish: Trophy,
  };
  return (
    <section className="match-debrief" aria-label={t("Key moments")}>
      <div className="debrief-heading">
        <span className="history-eyebrow">{t("Learn from this duel")}</span>
        <h3>{t("Your match in key moments")}</h3>
        <p>
          {t(
            "Observed outcomes, using only the information visible at that moment.",
          )}
        </p>
      </div>
      <div
        className="debrief-scoring"
        aria-label={t("Points gained in this replay")}
      >
        {(
          [
            ["hold", "Hold points"],
            ["conquer", "Conquest points"],
            ["effect", "Other scoring"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <strong>{recap.scoring[key]}</strong>
            <span>{t(label)}</span>
          </div>
        ))}
      </div>
      {recap.moments.length ? (
        <ol className="debrief-moments">
          {recap.moments.map((moment) => {
            const Icon = icons[moment.kind];
            return (
              <li key={moment.frame}>
                <button
                  onClick={() => seek(moment.frame)}
                  aria-label={t("Review turn {turn}: {moment}", {
                    turn: moment.turn,
                    moment: t(moment.title),
                  })}
                >
                  <span className="debrief-icon">
                    <Icon size={19} />
                  </span>
                  <span className="debrief-copy">
                    <small>
                      {t("Turn {turn}", { turn: moment.turn })} ·{" "}
                      {t(moment.actor === viewer ? "You" : "Opponent")}
                    </small>
                    <strong>{t(moment.title)}</strong>
                    <span className="debrief-action">{t(moment.label)}</span>
                    <span>{t(moment.detail, moment.values)}</span>
                    <span className="debrief-lesson">{t(moment.lesson)}</span>
                  </span>
                  <ArrowRight className="debrief-arrow" size={18} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>{t("Use the move list to review this duel step by step.")}</p>
      )}
    </section>
  );
}
