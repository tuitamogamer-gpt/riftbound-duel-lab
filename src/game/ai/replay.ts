import { applyAction } from "../engine";
import type { GameAction, GameState } from "../types";
import type { BotTrace } from "./planner";
import { BOT_VERSION } from "./config";
export const BOT_AUDIT_KEY = "riftbound-bot-audit-v1";
export const BOT_REPLAY_VERSIONS = [
  "battlefield-planner-1",
  BOT_VERSION,
] as const;
export interface BotReplay {
  version: (typeof BOT_REPLAY_VERSIONS)[number];
  initial: GameState;
  decisions: { action: GameAction; trace?: BotTrace }[];
  finalRevision: number;
}
export function isSupportedReplayVersion(
  value: unknown,
): value is BotReplay["version"] {
  return BOT_REPLAY_VERSIONS.some((version) => version === value);
}
export function createReplay(initial: GameState): BotReplay {
  return {
    version: BOT_VERSION,
    initial: structuredClone(initial),
    decisions: [],
    finalRevision: initial.revision ?? 0,
  };
}
/** Includes private match data. Only offer export after the engine has ended the game. */
export function replayMatch(replay: BotReplay): GameState {
  // Recorded legal actions need no planner search. A profile/heuristic change
  // does not invalidate the previous planner's recordings under this engine.
  if (!isSupportedReplayVersion(replay.version))
    throw new Error("Unsupported bot replay version");
  return replay.decisions.reduce(
    (s, entry) => applyAction(s, entry.action),
    structuredClone(replay.initial),
  );
}
