import { ArrowRight, BookOpen, Check, X } from "lucide-react";
import type { GuideLesson, GuideTopic } from "../game/duel-guide";
import { guideTopics } from "../game/duel-guide";
import { useI18n } from "../i18n";
import { AppDialog } from "./AppDialog";
import "./DuelGuide.css";

const names = [
  "Opening hand",
  "Rune payment",
  "Movement",
  "Reactions",
  "Combat damage",
  "Scoring",
];

export function DuelGuide({
  lesson,
  seen,
  close,
  disable,
  select,
}: {
  lesson: GuideLesson;
  seen: GuideTopic[];
  close: () => void;
  disable: () => void;
  select: (source: string) => void;
}) {
  const { t } = useI18n();
  return (
    <AppDialog className="duel-guide" label={t("Duel guide")} close={close}>
      <button className="close-button" aria-label={t("Close")} onClick={close}>
        <X size={22} />
      </button>
      <span className="guide-eyebrow">
        <BookOpen size={17} /> {t("Your guided duel")}
      </span>
      <h2>{t(lesson.title)}</h2>
      <p className="guide-rule">{t(lesson.body, lesson.values)}</p>
      <div className="guide-goal">
        <ArrowRight size={18} />
        <p>{t(lesson.goal)}</p>
      </div>
      <ul className="guide-topics" aria-label={t("Guide topics")}>
        {guideTopics.map((topic, index) => (
          <li
            key={topic}
            data-current={topic === lesson.id}
            data-seen={seen.includes(topic)}
            aria-current={topic === lesson.id ? "step" : undefined}
          >
            <span aria-hidden="true">
              {seen.includes(topic) ? <Check size={13} /> : index + 1}
            </span>
            {t(names[index])}
            {seen.includes(topic) && (
              <span className="sr-only">{t("Explored")}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="guide-reassurance">
        {t(
          "The duel waits while this guide is open. Your moves always stay your choice.",
        )}
      </p>
      <div className="guide-actions">
        <button
          className="gold-button"
          onClick={() => {
            if (lesson.source) select(lesson.source);
            close();
          }}
        >
          {lesson.source && lesson.card
            ? t("Select {card}", { card: lesson.card })
            : t("Got it · keep playing")}
          <ArrowRight size={16} />
        </button>
        <button className="text-button" onClick={disable}>
          {t("Turn off guide")}
        </button>
      </div>
    </AppDialog>
  );
}
