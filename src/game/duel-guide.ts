import { findCard } from "../catalog";
import { getVictoryScore } from "./board-rules";
import type { GameAction, GameState } from "./types";

export const DUEL_GUIDE_KEY = "riftbound-duel-guide-v1";
export const guideTopics = [
  "opening",
  "deploy",
  "movement",
  "reaction",
  "damage",
  "scoring",
] as const;
export type GuideTopic = (typeof guideTopics)[number];
export interface DuelGuideState {
  version: 1;
  seed: number;
  enabled: boolean;
  seen: GuideTopic[];
}
export interface GuideLesson {
  id: GuideTopic | "overview";
  title: string;
  body: string;
  goal: string;
  values?: Record<string, string | number>;
  source?: string;
  card?: string;
}

export function readDuelGuide(
  storage?: Pick<Storage, "getItem">,
): DuelGuideState | null {
  try {
    const value = JSON.parse(
      (storage ?? globalThis.localStorage).getItem(DUEL_GUIDE_KEY) ?? "null",
    );
    if (
      value?.version !== 1 ||
      !Number.isSafeInteger(value.seed) ||
      typeof value.enabled !== "boolean" ||
      !Array.isArray(value.seen)
    )
      return null;
    return {
      version: 1,
      seed: value.seed,
      enabled: value.enabled,
      seen: [
        ...new Set<GuideTopic>(
          value.seen.filter((id: unknown) =>
            guideTopics.includes(id as GuideTopic),
          ),
        ),
      ],
    };
  } catch {
    return null;
  }
}

export function saveDuelGuide(
  value: DuelGuideState,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      DUEL_GUIDE_KEY,
      JSON.stringify(value),
    );
    return true;
  } catch {
    return false;
  }
}

/** Advice uses public board state and the human's legal actions, never future draws. */
export function duelGuideLesson(
  game: GameState,
  legal: GameAction[],
  seen: readonly GuideTopic[] = [],
): GuideLesson | null {
  if (game.winner !== null || game.priorityPlayer !== 0) return null;
  const unseen = (id: GuideTopic) => !seen.includes(id);
  if (
    game.phase === "mulligan" &&
    !game.players[0].mulliganDone &&
    unseen("opening")
  )
    return {
      id: "opening",
      title: "Prepare your opening hand",
      body: "You start with four cards. Select up to two to replace, or keep them all. Selecting a card does not spend it.",
      goal: "Choose your hand, then confirm in the decision bar.",
    };
  if (game.phase === "damage" && unseen("damage"))
    return {
      id: "damage",
      title: "Assign damage with a plan",
      body: "The assignment badges show damage assigned and the lethal threshold, including prevention. Damage resolves after both sides finish assigning.",
      goal: "Assign the remaining damage, then confirm when offered.",
    };
  if (game.stack.some((effect) => effect.player === 1) && unseen("reaction"))
    return {
      id: "reaction",
      title: "Respond before the chain resolves",
      body: "You have priority. Play a legal response or pass. Once both players pass, the top effect resolves first. Passing does not spend your response cards.",
      goal: "Read the incoming effect and choose whether to respond.",
    };
  if (game.phase === "move" && unseen("movement"))
    return {
      id: "movement",
      title: "Move together to a battlefield",
      body: "Your movement group is only a proposal. Add or remove ready units, check any cost, then confirm. Moving normally exhausts the units.",
      goal: "Check the selected count and destination before confirming.",
    };
  if (game.phase !== "main" || game.stack.length || game.pendingChoice)
    return null;
  const deploy = legal.find(
    (action) =>
      action.player === 0 &&
      action.category === "play" &&
      action.sourceId?.startsWith("hand:") &&
      findCard(action.cardId)?.type === "Unit",
  );
  if (deploy && unseen("deploy"))
    return {
      id: "deploy",
      title: "Put your first unit into play",
      body: "Runes provide Energy when exhausted and Power when recycled. Stored resources can also pay costs. Check the preview before confirming. Most units enter exhausted and ready on your next turn.",
      goal: "Select a unit, read its available play and confirm the cost.",
      source: deploy.sourceId!.split(":jayce:")[0],
      card: findCard(deploy.cardId)!.name,
    };
  const move = legal.find(
    (action) =>
      action.player === 0 &&
      action.id.startsWith("move-start:") &&
      action.locationId?.startsWith("field:"),
  );
  if (move && unseen("movement"))
    return {
      id: "movement",
      title: "Move together to a battlefield",
      body: "Ready units can move from your base. Select a unit and a legal destination, build your group, then confirm. An open showdown must settle before conquest is scored.",
      goal: "Select a ready unit and choose a battlefield.",
      source: move.sourceId,
      card: findCard(
        game.units.find((unit) => unit.id === move.sourceId)?.cardId,
      )?.name,
    };
  if (game.fields.some((field) => field.controller === 0) && unseen("scoring"))
    return {
      id: "scoring",
      title: "Keep control for your next point",
      body: "Holding a battlefield at the start of your turn can earn a point. Watch which units can defend it and leave resources for a response. The winning target is {points} points.",
      goal: "Plan what you want to hold before ending your turn.",
      values: { points: getVictoryScore(game) },
    };
  return null;
}
