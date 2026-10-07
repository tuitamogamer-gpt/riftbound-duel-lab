import { validAction, validState } from "../../persistence";
import type { GameState } from "../types";
import { isSupportedReplayVersion, type BotReplay } from "./replay";
import type { BotTrace } from "./planner";

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function usableTrace(value: unknown): value is BotTrace {
  if (!object(value)) return false;
  const numbers = [
    "seed",
    "nodes",
    "generated",
    "durationMs",
    "completedDepth",
    "sampleCount",
  ];
  const strings = [
    "requestId",
    "observationVersion",
    "configVersion",
    "difficulty",
    "profile",
    "selected",
    "reason",
  ];
  const booleans = ["usedFallback", "incomplete", "confirmedWin"];
  const evaluation = (entry: unknown) =>
    object(entry) &&
    [
      "terminal",
      "utility",
      "score",
      "nextScore",
      "material",
      "options",
      "resources",
      "danger",
    ].every(
      (key) => typeof entry[key] === "number" && Number.isFinite(entry[key]),
    );
  return (
    numbers.every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
    ) &&
    strings.every(
      (key) => typeof value[key] === "string" && value[key].length <= 4000,
    ) &&
    booleans.every((key) => typeof value[key] === "boolean") &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.selectedEvaluation === undefined ||
      evaluation(value.selectedEvaluation)) &&
    Array.isArray(value.alternatives) &&
    value.alternatives.length <= 100 &&
    value.alternatives.every(
      (entry) =>
        object(entry) &&
        typeof entry.option === "string" &&
        evaluation(entry.evaluation),
    )
  );
}

/** Telemetry is optional. Its corruption must never invalidate a playable save. */
export function recoverStoredAudit(
  raw: string | null,
  match: GameState | null,
): BotReplay | null {
  if (!raw || !match || raw.length > 8 * 1024 * 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !object(value) ||
      !isSupportedReplayVersion(value.version) ||
      !validState(value.initial, false) ||
      value.initial.seed !== match.seed ||
      value.initial.winner !== null ||
      !Array.isArray(value.decisions) ||
      value.decisions.length > 6000 ||
      value.finalRevision !== match.revision ||
      value.finalRevision !==
        (value.initial.revision ?? 0) + value.decisions.length ||
      !value.decisions.every(
        (entry) => object(entry) && validAction(entry.action),
      )
    )
      return null;
    return {
      version: value.version,
      initial: value.initial,
      finalRevision: Number(value.finalRevision),
      decisions: value.decisions.map((entry) => ({
        action: entry.action,
        ...(usableTrace(entry.trace) ? { trace: entry.trace } : {}),
      })),
    };
  } catch {
    return null;
  }
}
