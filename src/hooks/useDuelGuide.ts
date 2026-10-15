import { useEffect, useRef, useState } from "react";
import {
  duelGuideLesson,
  readDuelGuide,
  saveDuelGuide,
  guideTopics,
  type GuideTopic,
  type GuideLesson,
} from "../game/duel-guide";
import type { GameAction, GameState } from "../game/types";

export function useDuelGuide(
  game: GameState | null,
  legal: GameAction[],
  active: boolean,
) {
  const [state, setState] = useState(readDuelGuide);
  const [lesson, setLesson] = useState<GuideLesson | null>(null);
  const prompted = useRef("");
  const enabled = !!game && state?.seed === game.seed && state.enabled;
  const pending =
    game &&
    enabled &&
    active &&
    !lesson &&
    prompted.current !== `${game.seed}:${game.revision}`
      ? duelGuideLesson(game, legal, state!.seen)
      : null;
  useEffect(() => {
    if (state) saveDuelGuide(state);
  }, [state]);
  useEffect(() => {
    if (!game || !enabled || !active || lesson) return;
    const key = `${game.seed}:${game.revision}`;
    if (prompted.current === key) return;
    const next = duelGuideLesson(game, legal, state!.seen);
    if (next) {
      prompted.current = key;
      setLesson(next);
    }
  }, [game, legal, active, enabled, state, lesson]);
  const close = () => {
    if (lesson && guideTopics.includes(lesson.id as GuideTopic))
      setState(
        (current) =>
          current && {
            ...current,
            seen: [...new Set([...current.seen, lesson.id as GuideTopic])],
          },
      );
    setLesson(null);
  };
  return {
    enabled,
    lesson,
    blocking: !!enabled && (!!lesson || !!pending),
    seen: state?.seen ?? [],
    start(next: GameState, guided: boolean) {
      setState({ version: 1, seed: next.seed, enabled: guided, seen: [] });
      setLesson(null);
      prompted.current = "";
    },
    close,
    disable() {
      setState((current) => current && { ...current, enabled: false });
      setLesson(null);
    },
    open() {
      if (!game) return;
      setState((current) => ({
        version: 1,
        seed: game.seed,
        enabled: true,
        seen: current?.seed === game.seed ? current.seen : [],
      }));
      prompted.current = `${game.seed}:${game.revision}`;
      setLesson(
        duelGuideLesson(game, legal) ?? {
          id: "overview",
          title: "Your next decision",
          body: "Select a card or unit to see its legal actions. Read the cost and target before confirming. You can inspect any public card without playing it.",
          goal: "Use the decision bar to confirm your move.",
        },
      );
    },
  };
}
