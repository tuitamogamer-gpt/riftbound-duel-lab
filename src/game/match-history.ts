import catalogMeta from "../data/catalog-meta.json";
import { findCard } from "../catalog";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getGroupMoveAction,
  getLegalActions,
  getMight,
} from "./engine";
import { getObservation } from "./ai/observation";
import type { ObservedState } from "./ai/observation";
import { isSupportedReplayVersion, replayMatch } from "./ai/replay";
import type { BotReplay } from "./ai/replay";
import { hash } from "./ai/config";
import { optionKey } from "./ai/decisions";
import { publicDecisionPresentation } from "./ai/presentation";
import type { BotTrace } from "./ai/planner";
import type { Evaluation } from "./ai/evaluate";
import { validState } from "../persistence";
import type { GameAction, GameState, PlayerId } from "./types";

export const MATCH_HISTORY_KEY = "riftbound-duel-history-v1";
export const MAX_REPLAY_BYTES = 8 * 1024 * 1024;
export const MAX_HISTORY_MATCHES = 20;
const MAX_HISTORY_BYTES = 3 * 1024 * 1024;
const MAX_REPLAY_ACTIONS = 6000;
const currentRules = createGame({ seed: 1 }).matchConfig!.rulesVersion;
type HistoryStorage = Pick<Storage, "getItem" | "setItem">;
export interface CompletedMatch {
  schema: 1;
  id: string;
  endedAt: string;
  playerDeckName: string;
  opponentDeckName: string;
  playerDeckId: string;
  opponentDeckId: string;
  difficulty: string;
  engineVersion: 1;
  rulesVersion: string;
  cardDataVersion: string;
  botVersion: string;
  winner: PlayerId;
  points: [number, number];
  turns: number;
  decisionCount: number;
  replay: BotReplay;
}
export interface HistoryResult {
  saved: boolean;
  error?: string;
  entry?: CompletedMatch;
  entries?: CompletedMatch[];
}
export interface HistoryLoad {
  entries: CompletedMatch[];
  error?: string;
}
export interface MatchMetadata {
  playerDeckName?: string;
  opponentDeckName?: string;
  endedAt?: string;
  /** Only pass a final state already produced by this running duel's engine. */ final?: GameState;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const shortText = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.length <= max;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const bytes = (value: string) => new TextEncoder().encode(value).length;

function evaluation(value: unknown): value is Evaluation {
  return (
    object(value) &&
    [-1, 0, 1].includes(value.terminal as number) &&
    [
      "utility",
      "score",
      "nextScore",
      "material",
      "options",
      "resources",
      "danger",
    ].every((key) => finite(value[key]))
  );
}

/** Optional diagnostics are reduced to a bounded, typed projection before storing. */
function traceProjection(value: unknown): BotTrace | undefined {
  if (
    !object(value) ||
    ![
      "requestId",
      "observationVersion",
      "configVersion",
      "selected",
      "reason",
      "difficulty",
      "profile",
    ].every((key) => shortText(value[key], key === "reason" ? 1500 : 1000)) ||
    ![
      "seed",
      "nodes",
      "generated",
      "durationMs",
      "completedDepth",
      "sampleCount",
    ].every((key) => finite(value[key])) ||
    !["usedFallback", "incomplete", "confirmedWin"].every(
      (key) => typeof value[key] === "boolean",
    ) ||
    !Array.isArray(value.alternatives)
  )
    return;
  const alternatives = value.alternatives
    .slice(0, 4)
    .filter(
      (entry) =>
        object(entry) &&
        shortText(entry.option, 4000) &&
        evaluation(entry.evaluation),
    );
  return {
    requestId: value.requestId,
    observationVersion: value.observationVersion,
    configVersion: value.configVersion,
    selected: value.selected,
    reason: value.reason,
    difficulty: value.difficulty,
    profile: value.profile,
    seed: value.seed,
    nodes: value.nodes,
    generated: value.generated,
    durationMs: value.durationMs,
    completedDepth: value.completedDepth,
    sampleCount: value.sampleCount,
    usedFallback: value.usedFallback,
    incomplete: value.incomplete,
    confirmedWin: value.confirmedWin,
    alternatives,
    ...(evaluation(value.selectedEvaluation)
      ? { selectedEvaluation: value.selectedEvaluation }
      : {}),
  } as BotTrace;
}

function canonicalAction(state: GameState, value: unknown): GameAction {
  if (
    !object(value) ||
    !shortText(value.id, 4000) ||
    value.player !== state.priorityPlayer
  )
    throw new Error("Replay contains an invalid or out-of-turn action.");
  let action = getLegalActions(state, state.priorityPlayer).find(
    (action) => action.id === value.id,
  );
  if (!action && value.id.startsWith("move-group:")) {
    const [, kind, number, members] = value.id.split(":");
    const group = getGroupMoveAction(
      state,
      state.priorityPlayer,
      (members ?? "").split(","),
      `${kind}:${number}` as GameAction["locationId"] & string,
    );
    if (group?.id === value.id) action = group;
  }
  if (!action) throw new Error("Replay contains an illegal action.");
  if (value.paymentRuneOrder !== undefined) {
    if (
      !Array.isArray(value.paymentRuneOrder) ||
      !value.paymentRuneOrder.every((id) => shortText(id, 300))
    )
      throw new Error("Replay contains an invalid rune payment.");
    action = {
      ...action,
      paymentRuneOrder: [...value.paymentRuneOrder] as string[],
    };
  }
  return action;
}

/** Imported labels/effects are discarded; the current engine reconstructs legal declarations. */
export function validateCompletedReplay(input: unknown): {
  replay: BotReplay;
  final: GameState;
} {
  if (
    !object(input) ||
    !isSupportedReplayVersion(input.version) ||
    !validState(input.initial) ||
    input.initial.winner !== null ||
    !Array.isArray(input.decisions) ||
    input.decisions.length < 1 ||
    input.decisions.length > MAX_REPLAY_ACTIONS ||
    !Number.isSafeInteger(input.finalRevision)
  )
    throw new Error("This is not a supported completed duel replay.");
  const initial = structuredClone(input.initial);
  let state = initial;
  const decisions: BotReplay["decisions"] = [];
  for (const entry of input.decisions) {
    if (!object(entry) || state.winner !== null)
      throw new Error("Replay continues after the match ended.");
    const action = canonicalAction(state, entry.action);
    state = applyAction(state, action);
    if (!validState(state))
      throw new Error("Replay produced an invalid game state.");
    const trace = traceProjection(entry.trace);
    decisions.push({ action, ...(trace ? { trace } : {}) });
  }
  if (state.winner === null || state.phase !== "ended")
    throw new Error("Only completed duels can enter match history.");
  if (
    state.revision !== input.finalRevision ||
    input.finalRevision !== (initial.revision ?? 0) + decisions.length
  )
    throw new Error("Replay revision does not match its recorded decisions.");
  const replay: BotReplay = {
    version: input.version as BotReplay["version"],
    initial,
    decisions,
    finalRevision: input.finalRevision as number,
  };
  // The existing replay contract is the second check on the canonical action stream.
  const replayed = replayMatch(replay);
  if (JSON.stringify(replayed) !== JSON.stringify(state))
    throw new Error("Replay could not reproduce its result.");
  return { replay, final: state };
}

function matchEntry(
  replay: BotReplay,
  final: GameState,
  metadata: MatchMetadata = {},
): CompletedMatch {
  const date =
    metadata.endedAt && !Number.isNaN(Date.parse(metadata.endedAt))
      ? new Date(metadata.endedAt).toISOString()
      : new Date().toISOString();
  const deckName = (owner: PlayerId) =>
    findCard(final.players[owner].legendId)?.name ??
    final.players[owner].deckId;
  return {
    schema: 1,
    id: `match-${hash(JSON.stringify(replay.initial)).toString(16)}-${hash(JSON.stringify(replay.decisions.map(({ action }) => action))).toString(16)}-${replay.finalRevision}`,
    endedAt: date,
    playerDeckName: shortText(metadata.playerDeckName)
      ? metadata.playerDeckName
      : deckName(0),
    opponentDeckName: shortText(metadata.opponentDeckName)
      ? metadata.opponentDeckName
      : deckName(1),
    playerDeckId: replay.initial.players[0].deckId,
    opponentDeckId: replay.initial.players[1].deckId,
    difficulty: replay.initial.botSettings?.difficulty ?? "normal",
    engineVersion: 1,
    rulesVersion: replay.initial.matchConfig?.rulesVersion ?? "unknown",
    cardDataVersion: replay.initial.matchConfig?.cardDataVersion ?? "unknown",
    botVersion: replay.version,
    winner: final.winner!,
    points: [final.players[0].points, final.players[1].points],
    turns: final.turn,
    decisionCount: replay.decisions.length,
    replay,
  };
}

export function parseCompletedMatch(raw: string): CompletedMatch {
  if (bytes(raw) > MAX_REPLAY_BYTES)
    throw new Error("Replay file is too large (maximum 8 MB).");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Replay file is not valid JSON.");
  }
  const envelope =
    object(value) && value.schema === 1 && object(value.replay)
      ? value
      : undefined;
  const checked = validateCompletedReplay(envelope?.replay ?? value);
  return matchEntry(
    checked.replay,
    checked.final,
    envelope
      ? {
          playerDeckName: shortText(envelope.playerDeckName)
            ? envelope.playerDeckName
            : undefined,
          opponentDeckName: shortText(envelope.opponentDeckName)
            ? envelope.opponentDeckName
            : undefined,
          endedAt: shortText(envelope.endedAt) ? envelope.endedAt : undefined,
        }
      : {},
  );
}

function readEntries(storage: Pick<Storage, "getItem">): CompletedMatch[] {
  const raw = storage.getItem(MATCH_HISTORY_KEY);
  if (!raw) return [];
  if (bytes(raw) > MAX_REPLAY_BYTES)
    throw new Error(
      "Stored match history could not be read. Export or clear it before saving another match.",
    );
  const value: unknown = JSON.parse(raw);
  if (
    !object(value) ||
    value.version !== 1 ||
    !Array.isArray(value.entries) ||
    value.entries.length > MAX_HISTORY_MATCHES
  )
    throw new Error(
      "Stored match history could not be read. Export or clear it before saving another match.",
    );
  return value.entries.map((entry) => {
    if (
      !object(entry) ||
      entry.schema !== 1 ||
      !shortText(entry.id) ||
      !shortText(entry.endedAt) ||
      Number.isNaN(Date.parse(entry.endedAt)) ||
      !shortText(entry.playerDeckName) ||
      !shortText(entry.opponentDeckName) ||
      !shortText(entry.rulesVersion) ||
      !shortText(entry.cardDataVersion) ||
      !shortText(entry.botVersion) ||
      !shortText(entry.difficulty) ||
      entry.engineVersion !== 1 ||
      ![0, 1].includes(entry.winner as number) ||
      !Array.isArray(entry.points) ||
      entry.points.length !== 2 ||
      !entry.points.every((point) => Number.isInteger(point) && point >= 0) ||
      !Number.isSafeInteger(entry.turns) ||
      !Number.isSafeInteger(entry.decisionCount) ||
      !object(entry.replay) ||
      !isSupportedReplayVersion(entry.replay.version) ||
      !validState(entry.replay.initial, false) ||
      !Array.isArray(entry.replay.decisions) ||
      entry.replay.decisions.length !== entry.decisionCount ||
      entry.replay.decisions.length > MAX_REPLAY_ACTIONS ||
      !Number.isSafeInteger(entry.replay.finalRevision)
    )
      throw new Error(
        "Stored match history could not be read. Export or clear it before saving another match.",
      );
    return {
      ...entry,
      playerDeckId: entry.replay.initial.players[0].deckId,
      opponentDeckId: entry.replay.initial.players[1].deckId,
    } as unknown as CompletedMatch;
  });
}

export function readMatchHistory(
  storage?: Pick<Storage, "getItem">,
): HistoryLoad {
  try {
    return { entries: readEntries(storage ?? globalThis.localStorage) };
  } catch {
    return {
      entries: [],
      error:
        "Stored match history could not be read. Export or clear it before saving another match.",
    };
  }
}

function persistEntries(
  entries: CompletedMatch[],
  storage: HistoryStorage,
): CompletedMatch[] {
  const retained = [...entries].slice(0, MAX_HISTORY_MATCHES);
  let serialized = JSON.stringify({ version: 1, entries: retained });
  while (bytes(serialized) > MAX_HISTORY_BYTES && retained.length > 1) {
    retained.pop();
    serialized = JSON.stringify({ version: 1, entries: retained });
  }
  if (bytes(serialized) > MAX_HISTORY_BYTES)
    throw new Error(
      "This replay is too large for browser history. Export it as a file instead.",
    );
  // A single atomic storage write: quota failures preserve the previous archive.
  try {
    storage.setItem(MATCH_HISTORY_KEY, serialized);
  } catch {
    throw new Error(
      "Match history could not be saved. Previous entries were kept.",
    );
  }
  return retained;
}

export function writeCompletedMatch(
  replay: BotReplay,
  metadata: MatchMetadata = {},
  storage?: HistoryStorage,
): HistoryResult {
  try {
    let checked: { replay: BotReplay; final: GameState };
    if (metadata.final) {
      const final = metadata.final;
      if (
        !isSupportedReplayVersion(replay.version) ||
        !validState(replay.initial, false) ||
        replay.initial.winner !== null ||
        !validState(final) ||
        final.winner === null ||
        final.seed !== replay.initial.seed ||
        final.turn < replay.initial.turn ||
        final.revision !== replay.finalRevision ||
        replay.finalRevision !==
          (replay.initial.revision ?? 0) + replay.decisions.length ||
        !replay.decisions.length ||
        replay.decisions.length > MAX_REPLAY_ACTIONS
      )
        throw new Error(
          "Completed match does not match its live replay record.",
        );
      checked = { replay: structuredClone(replay), final };
    } else checked = validateCompletedReplay(replay);
    const entry = matchEntry(checked.replay, checked.final, metadata);
    const target = storage ?? globalThis.localStorage;
    const entries = readEntries(target);
    if (entries.some((existing) => existing.id === entry.id))
      return { saved: true, entry, entries };
    const retained = persistEntries(
      [entry, ...entries].sort(
        (a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt),
      ),
      target,
    );
    return { saved: true, entry, entries: retained };
  } catch (cause) {
    return {
      saved: false,
      error:
        cause instanceof Error
          ? cause.message
          : "Match history could not be saved. Previous entries were kept.",
    };
  }
}

export function importCompletedMatch(
  raw: string,
  storage?: HistoryStorage,
): HistoryResult {
  try {
    if (bytes(raw) > MAX_REPLAY_BYTES)
      throw new Error("Replay file is too large (maximum 8 MB).");
    const value: unknown = JSON.parse(raw);
    if (object(value) && value.version === 1 && Array.isArray(value.entries)) {
      if (value.entries.length > MAX_HISTORY_MATCHES)
        throw new Error("History backup contains too many matches.");
      const imported = value.entries.map((entry) =>
        parseCompletedMatch(JSON.stringify(entry)),
      );
      const target = storage ?? globalThis.localStorage;
      const existing = readEntries(target);
      const entries = [...existing];
      for (const entry of imported)
        if (!entries.some((old) => old.id === entry.id)) entries.push(entry);
      entries.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
      return {
        saved: true,
        entries: persistEntries(entries, target),
        entry: imported[0],
      };
    }
    const entry = parseCompletedMatch(raw);
    return writeCompletedMatch(entry.replay, entry, storage);
  } catch (cause) {
    return {
      saved: false,
      error:
        cause instanceof SyntaxError
          ? "Replay file is not valid JSON."
          : cause instanceof Error
            ? cause.message
            : "Replay import failed.",
    };
  }
}

export function deleteCompletedMatch(
  id: string,
  storage?: HistoryStorage,
): HistoryResult {
  try {
    const target = storage ?? globalThis.localStorage;
    return {
      saved: true,
      entries: persistEntries(
        readEntries(target).filter((entry) => entry.id !== id),
        target,
      ),
    };
  } catch {
    return {
      saved: false,
      error: "Match history could not be saved. Previous entries were kept.",
    };
  }
}

export function clearMatchHistory(
  storage?: Pick<Storage, "setItem">,
): HistoryResult {
  try {
    (storage ?? globalThis.localStorage).setItem(
      MATCH_HISTORY_KEY,
      JSON.stringify({ version: 1, entries: [] }),
    );
    return { saved: true, entries: [] };
  } catch {
    return {
      saved: false,
      error: "Match history could not be saved. Previous entries were kept.",
    };
  }
}

export function historyCompatibility(entry: CompletedMatch): string[] {
  return [
    entry.rulesVersion !== currentRules
      ? "This match used another rules version. The replay is validated with the current engine."
      : "",
    entry.cardDataVersion !== catalogMeta.cardDataSha256
      ? "This match used another catalog version. The replay is validated with the current card data."
      : "",
  ].filter(Boolean);
}

export function historyDeckStats(entries: CompletedMatch[]) {
  const stats = new Map<
    string,
    { id: string; deck: string; matches: number; wins: number; turns: number }
  >();
  for (const entry of entries) {
    const row = stats.get(entry.playerDeckId) ?? {
      id: entry.playerDeckId,
      deck: entry.playerDeckName,
      matches: 0,
      wins: 0,
      turns: 0,
    };
    row.matches++;
    row.wins += entry.winner === 0 ? 1 : 0;
    row.turns += entry.turns;
    stats.set(row.id, row);
  }
  return [...stats.values()].sort((a, b) => b.matches - a.matches);
}

export interface ReplayMoment {
  kind: "score" | "hold" | "conquer" | "death" | "champion" | "victory";
  label: string;
  player?: PlayerId;
  values?: Record<string, string | number>;
}
export interface HistoryFrame {
  views: [ObservedState, ObservedState];
  labels: [string, string];
  might: Record<string, number>;
  moments: ReplayMoment[];
  decisionIndex: number;
  actor?: PlayerId;
  trace?: {
    reason: string;
    alternatives: { label: string; utility: number }[];
    incomplete: boolean;
  };
}

function historyViews(state: GameState): [ObservedState, ObservedState] {
  return ([0, 1] as const).map((viewer) => {
    const view = getObservation(state, viewer).state;
    delete view.matchConfig;
    return view;
  }) as [ObservedState, ObservedState];
}
function frameMight(state: GameState) {
  return Object.fromEntries(
    state.units.map((unit) => [unit.id, getMight(state, unit)]),
  );
}

/** No engine state or future hand/deck references reach the frame renderer. */
export function buildMatchTimeline(entry: CompletedMatch): HistoryFrame[] {
  const checked = validateCompletedReplay(entry.replay);
  let state = structuredClone(checked.replay.initial);
  const frames: HistoryFrame[] = [
    {
      views: historyViews(state),
      labels: ["Match opening", "Match opening"],
      might: frameMight(state),
      moments: [],
      decisionIndex: -1,
    },
  ];
  checked.replay.decisions.forEach((decision, decisionIndex) => {
    const beforeAction = state;
    const result = applyActionStepped(state, decision.action);
    const captions = ([0, 1] as const).map((viewer) =>
      publicDecisionPresentation(
        beforeAction,
        decision.action,
        result.frames,
        viewer,
      ),
    );
    const trace = decision.trace
      ? {
          reason: decision.trace.reason,
          incomplete: decision.trace.incomplete,
          alternatives: decision.trace.alternatives.map(
            (alternative, index) => {
              const action = getLegalActions(
                beforeAction,
                beforeAction.priorityPlayer,
              ).find((action) => optionKey(action) === alternative.option);
              return {
                label: action?.label ?? `Search option ${index + 1}`,
                utility: alternative.evaluation.utility,
              };
            },
          ),
        }
      : undefined;
    for (const [index, step] of result.frames.entries()) {
      const moments: ReplayMoment[] = [];
      if (step.score)
        moments.push({
          kind: step.score.kind === "effect" ? "score" : step.score.kind,
          label:
            step.score.kind === "hold"
              ? "Hold point"
              : step.score.kind === "conquer"
                ? "Conquest point"
                : "Score gained",
          player: step.score.player,
          values: { amount: step.score.to - step.score.from },
        });
      else
        for (const player of [0, 1] as const)
          if (step.state.players[player].points > state.players[player].points)
            moments.push({
              kind: "score",
              label: "Score gained",
              player,
              values: {
                amount:
                  step.state.players[player].points -
                  state.players[player].points,
              },
            });
      for (const unit of state.units.filter(
        (unit) => !step.state.units.some((next) => next.id === unit.id),
      ))
        if (step.state.players[unit.owner].discard.includes(unit.cardId))
          moments.push({
            kind: "death",
            label: "Unit defeated: {card}",
            player: unit.owner,
            values: { card: findCard(unit.cardId)?.name ?? unit.cardId },
          });
      for (const unit of step.state.units.filter(
        (unit) => !state.units.some((old) => old.id === unit.id),
      ))
        if (unit.cardId === step.state.players[unit.owner].championId)
          moments.push({
            kind: "champion",
            label: "Signature champion enters",
            player: unit.owner,
          });
      if (step.state.winner !== null && state.winner === null)
        moments.push({
          kind: "victory",
          label: "Victory",
          player: step.state.winner,
        });
      frames.push({
        views: historyViews(step.state),
        labels: [
          captions[0].frames[index].label,
          captions[1].frames[index].label,
        ],
        might: frameMight(step.state),
        moments,
        decisionIndex,
        actor: decision.action.player,
        ...(trace ? { trace } : {}),
      });
      state = step.state;
    }
    state = result.state;
  });
  return frames;
}
