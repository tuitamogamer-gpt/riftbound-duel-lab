import {
  applyAction,
  getGroupMoveAction,
  iterateLegalActions,
} from "../engine";
import type { GameAction, GameState, PlayerId } from "../types";
import {
  getObservation,
  observationRulesView,
  type Observation,
} from "./observation";
import { hash } from "./config";

export type DecisionKind =
  | "MULLIGAN"
  | "ACTION"
  | "PASS_PRIORITY"
  | "PASS_FOCUS"
  | "MOVE_GROUP"
  | "DAMAGE"
  | "CHOICE";
export interface BotDecision {
  decisionId: string;
  observationVersion: string;
  optionId: string;
  parameters?: { paymentRuneOrder?: string[] };
}
export interface DecisionRequest {
  id: string;
  observationVersion: string;
  actorId: PlayerId;
  kind: DecisionKind;
  legalOptions: GameAction[];
  fallbackDecision: BotDecision;
}
export function decisionFor(
  request: DecisionRequest,
  action: GameAction,
): BotDecision {
  return {
    decisionId: request.id,
    observationVersion: request.observationVersion,
    optionId: action.id,
    ...(action.paymentRuneOrder
      ? { parameters: { paymentRuneOrder: action.paymentRuneOrder } }
      : {}),
  };
}
export function fallbackAction(s: GameState, p: PlayerId): GameAction | null {
  if (s.priorityPlayer !== p || s.winner !== null) return null;
  if (
    s.pendingChoice?.kind === "trashTargets" ||
    s.pendingChoice?.kind === "boardTargets"
  ) {
    let nextSelection: GameAction | null = null;
    for (const action of iterateLegalActions(s, p)) {
      if (
        action.id === "choose-trash:done" ||
        action.id === "choose-board:done"
      )
        return action;
      if (action.id.startsWith("choose-board:destination:") && !nextSelection)
        nextSelection = action;
      if (action.amount === 1 && !nextSelection) nextSelection = action;
    }
    return nextSelection;
  }
  if (s.phase === "move") {
    // A timeout must finish or cancel the selection, never toggle the same
    // membership back and forth on repeated watchdog recoveries.
    for (const action of iterateLegalActions(s, p))
      if (action.id === "move-confirm" || action.id === "move-cancel")
        return action;
    return null;
  }
  if (
    (s.phase === "main" || s.phase === "showdown") &&
    (s.stack.length || s.combat)
  )
    return {
      id: "pass",
      label: s.stack.length ? "Pass priority" : "Pass focus",
      player: p,
      category: "pass",
    };
  if (s.phase === "main" && !s.stack.length && s.currentPlayer === p)
    return { id: "end-turn", label: "End turn", player: p, category: "end" };
  // Generator stops after one fully formed, legal mandatory selection.
  return iterateLegalActions(s, p).next().value ?? null;
}
export function requestFromObservation(o: Observation): DecisionRequest | null {
  const s = observationRulesView(o),
    fallback = fallbackAction(s, o.viewer);
  if (!fallback) {
    if (s.winner === null && s.priorityPlayer === o.viewer)
      throw new Error(
        `Invalid decision request: ${s.phase} has no legal option`,
      );
    return null;
  }
  const kind: DecisionKind =
    s.phase === "mulligan"
      ? "MULLIGAN"
      : s.phase === "choice"
        ? "CHOICE"
        : s.phase === "damage"
          ? "DAMAGE"
          : s.phase === "move"
            ? "MOVE_GROUP"
            : s.stack.length
              ? "PASS_PRIORITY"
              : s.phase === "showdown"
                ? "PASS_FOCUS"
                : "ACTION";
  const request = {
    id: `decision-${o.viewer}-${o.version}`,
    observationVersion: o.version,
    actorId: o.viewer,
    kind,
    legalOptions: [fallback],
  } as DecisionRequest;
  request.fallbackDecision = decisionFor(request, fallback);
  return request;
}
export function getDecisionRequest(
  s: GameState,
  p: PlayerId = s.priorityPlayer,
) {
  return requestFromObservation(getObservation(s, p));
}
export function validateDecision(
  s: GameState,
  request: DecisionRequest,
  decision: BotDecision,
): { valid: boolean; reason?: string; action?: GameAction } {
  const current = getObservation(s, request.actorId);
  if (
    decision.decisionId !== request.id ||
    decision.observationVersion !== request.observationVersion ||
    current.version !== request.observationVersion ||
    s.priorityPlayer !== request.actorId
  )
    return { valid: false, reason: "Stale decision" };
  let action: GameAction | undefined;
  if (decision.optionId.startsWith("move-group:")) {
    const [, kind, index, members] = decision.optionId.split(":");
    action =
      getGroupMoveAction(
        s,
        request.actorId,
        (members ?? "").split(","),
        `${kind}:${index}` as "field:0",
      ) ?? undefined;
    if (action?.id !== decision.optionId) action = undefined;
  } else
    for (const a of iterateLegalActions(s, request.actorId)) {
      if (a.id === decision.optionId) {
        action = a;
        break;
      }
    }
  if (!action) return { valid: false, reason: "Illegal option" };
  const order = decision.parameters?.paymentRuneOrder;
  if (
    order &&
    (order.length !== s.players[request.actorId].runes.length ||
      new Set(order).size !== order.length ||
      !order.every((id) =>
        s.players[request.actorId].runes.some((r) => r.id === id),
      ))
  )
    return { valid: false, reason: "Invalid payment preference" };
  return {
    valid: true,
    action: { ...action, ...(order ? { paymentRuneOrder: order } : {}) },
  };
}
export function applyDecision(
  s: GameState,
  request: DecisionRequest,
  decision: BotDecision,
): GameState {
  const result = validateDecision(s, request, decision);
  if (!result.valid) throw new Error(result.reason);
  return applyAction(s, result.action!);
}
export const optionKey = (a: GameAction) =>
  `${a.id}${a.paymentRuneOrder ? `@${hash(a.paymentRuneOrder.join(","))}` : ""}`;
