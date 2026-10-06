import { applyAction } from "../engine";
import type { GameAction, GameState } from "../types";
import type { BotTrace } from "./planner";
import { BOT_VERSION } from "./config";
export const BOT_AUDIT_KEY = "riftbound-bot-audit-v1";
export interface BotReplay {
  version: typeof BOT_VERSION;
  initial: GameState;
  decisions: { action: GameAction; trace?: BotTrace }[];
  finalRevision: number;
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
  if (replay.version !== BOT_VERSION)
    throw new Error("Unsupported bot replay version");
  return replay.decisions.reduce(
    (s, entry) => applyAction(s, entry.action),
    structuredClone(replay.initial),
  );
}
