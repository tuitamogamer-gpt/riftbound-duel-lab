import { getCard } from "../../data/cards";
import { applyAction, iterateLegalActions } from "../engine";
import { getReferenceAction } from "../bot-reference";
import type { GameAction, GameState, PlayerId } from "../types";
import {
  BOT_VERSION,
  DIFFICULTIES,
  SearchBudget,
  botRandom,
  hash,
  inferProfile,
  type Difficulty,
  type Profile,
} from "./config";
import {
  candidates,
  diverse,
  paymentCandidates,
  rankCandidates,
} from "./candidates";
import {
  decisionFor,
  fallbackAction,
  optionKey,
  type BotDecision,
  type DecisionRequest,
} from "./decisions";
import { compare, evaluate, type Evaluation } from "./evaluate";
import {
  getObservation,
  observationRulesView,
  sampleState,
  type Observation,
} from "./observation";

export interface PlannerOptions {
  difficulty?: Difficulty;
  seed?: number;
  deterministic?: boolean;
  maxNodes?: number;
  milliseconds?: number;
}
export interface BotTrace {
  requestId: string;
  observationVersion: string;
  configVersion: string;
  seed: number;
  difficulty: Difficulty;
  profile: Profile;
  selected: string;
  alternatives: { option: string; evaluation: Evaluation }[];
  selectedEvaluation?: Evaluation;
  nodes: number;
  generated: number;
  durationMs: number;
  completedDepth: number;
  usedFallback: boolean;
  incomplete: boolean;
  confirmedWin: boolean;
  sampleCount: number;
  reason: string;
  error?: string;
}
export interface BotResult {
  decision: BotDecision;
  action: GameAction;
  trace: BotTrace;
}
type Line = {
  first: GameAction;
  state: GameState;
  evaluation: Evaluation;
  depth: number;
  confirmed: boolean;
  visited?: string[];
};
function positionKey(s: GameState) {
  return hash(
    JSON.stringify({
      ...s,
      revision: 0,
      nextId: 0,
      log: [],
      rng: 0,
      seed: 0,
      matchConfig: undefined,
      botSettings: undefined,
      players: s.players.map((p) => ({
        ...p,
        deck: [...p.deck].sort(),
        runeDeck: [...p.runeDeck].sort(),
        runes: [...p.runes].sort((a, b) => a.id.localeCompare(b.id)),
      })),
    }),
  ).toString(16);
}
const stable = (s: GameState) =>
  s.winner !== null ||
  (s.phase === "main" &&
    !s.stack.length &&
    !s.pendingChoice &&
    !s.combat &&
    s.pendingTurnStart === undefined &&
    s.pendingEndTurn === undefined &&
    s.pendingBeginning === undefined);

function smallOptions(s: GameState, budget: SearchBudget, limit = 20) {
  const result: GameAction[] = [];
  for (const a of iterateLegalActions(s, s.priorityPlayer)) {
    if (!budget.take(true)) return null;
    const baseline = (
      s as GameState & { botSimulation?: { noUnknownResponsesFor: PlayerId } }
    ).botSimulation;
    if (
      baseline?.noUnknownResponsesFor === s.priorityPlayer &&
      (a.sourceId?.startsWith("hand:") ||
        a.sourceId?.startsWith("hidden:hypothesis-"))
    )
      continue;
    result.push(a);
    if (result.length >= limit) break;
  }
  const fallback = fallbackAction(s, s.priorityPlayer);
  if (fallback && !result.some((a) => a.id === fallback.id))
    result.push(fallback);
  return result;
}
/** All combat, deaths, cleanup, scoring and mandatory choices use the real resolver. */
export function settleSimulation(
  initial: GameState,
  root: PlayerId,
  budget: SearchBudget,
  replies = false,
  replyAlternative = 0,
): GameState | null {
  let s = initial;
  const seen = new Set<string>();
  for (let step = 0; step < 64; step++) {
    if (stable(s)) return s;
    const key = `${s.phase}:${s.priorityPlayer}:${s.consecutivePasses}:${s.stack.map((i) => i.id).join()}:${s.pendingChoice?.remaining}:${JSON.stringify(s.combat?.assignments)}:${s.pendingMove?.unitIds.join()}`;
    // Repeated passes with different stack/state are normal; exact rule states are not.
    const full = `${key}:${hash(JSON.stringify({ ...s, log: [], revision: 0 }))}`;
    if (seen.has(full)) return null;
    seen.add(full);
    const actions = smallOptions(s, budget);
    if (!actions?.length) return null;
    const fallback = fallbackAction(s, s.priorityPlayer)!;
    const forced = ["choice", "damage", "move", "mulligan"].includes(s.phase);
    const safe = observationRulesView(getObservation(s, s.priorityPlayer));
    let action =
      forced || (replies && s.priorityPlayer !== root)
        ? (getReferenceAction(safe, s.priorityPlayer, actions) ?? fallback)
        : fallback;
    if (
      !forced &&
      replies &&
      s.priorityPlayer !== root &&
      replyAlternative > 0
    ) {
      let remaining = actions;
      for (let i = 0; i < replyAlternative && remaining.length > 1; i++) {
        remaining = remaining.filter((a) => a.id !== action.id);
        action =
          getReferenceAction(safe, s.priorityPlayer, remaining) ?? fallback;
      }
    }
    if (!budget.take()) return null;
    s = applyAction(s, action);
  }
  return null;
}
function mulligan(s: GameState, actions: GameAction[], profile: Profile) {
  const p = s.players[s.priorityPlayer];
  const earlyLimit = s.currentPlayer === p.id ? 2 : 3;
  const score = (a: GameAction) => {
    const kept = p.hand
      .filter((_, i) => !a.cardIndices?.includes(i))
      .map(getCard);
    const early = kept.filter(
      (c) => c.type === "Unit" && (c.energy ?? 0) <= earlyLimit,
    ).length;
    const middle = kept.filter(
      (c) => c.type === "Unit" && (c.energy ?? 0) <= 5,
    ).length;
    const expensive = kept.filter((c) => (c.energy ?? 0) >= 6).length;
    const champEarly =
      p.championAvailable && (getCard(p.championId).energy ?? 0) <= earlyLimit;
    return (
      Math.min(early + Number(champEarly), 2) *
        (profile === "aggressive" ? 10 : 8) +
      Math.min(middle, 2) * 2 -
      Math.max(0, expensive - Number(early > 0)) * 5 +
      kept.filter((c) => c.type === "Spell" && (c.energy ?? 0) <= 2).length *
        (early ? 2 : 0.1) -
      (a.cardIndices?.length ?? 0) * 0.3
    );
  };
  return [...actions].sort((a, b) => score(b) - score(a))[0];
}
function reasonFor(
  before: GameState,
  line: Line | undefined,
  action: GameAction,
) {
  if (line?.confirmed)
    return "This decision reaches a winning result in the rules resolver.";
  if (["choice", "damage"].includes(before.phase))
    return "I complete the required choice while preserving useful units and resources.";
  if (before.phase === "mulligan")
    return "I keep an opening hand that supports early development and a follow-up.";
  if (
    line &&
    line.evaluation.danger < evaluate(before, action.player, "tempo").danger
  )
    return "I disrupt a battlefield that threatens the next winning score.";
  if (action.id.startsWith("move-group:"))
    return "I commit a group to improve the next battlefield scoring opportunity.";
  if (action.category === "pass")
    return "I preserve resources after checking the outcome of passing this window.";
  if (action.category === "end")
    return "I keep the current position and resources for the next scoring cycle.";
  if (action.id.startsWith("hide:"))
    return "I prepare a future response at a controlled battlefield.";
  return "I improve my position while preserving useful follow-up options.";
}

/** Entry point accepts only observation and an inert request, never a live GameState. */
export function chooseDecision(
  request: DecisionRequest,
  observation: Observation,
  options: PlannerOptions = {},
): BotResult {
  const difficulty = options.difficulty ?? "normal",
    settings = DIFFICULTIES[difficulty];
  const budget = new SearchBudget(
    options.maxNodes ?? settings.nodes,
    options.milliseconds ?? settings.milliseconds,
    options.deterministic ?? false,
  );
  const seed = options.seed ?? 20261006;
  const s = observationRulesView(observation),
    p = observation.viewer;
  if (
    observation.version !== request.observationVersion ||
    request.actorId !== p
  )
    throw new Error("Mismatched observation and request");
  const fallback = request.legalOptions.find(
    (a) => a.id === request.fallbackDecision.optionId,
  );
  if (!fallback) throw new Error("Invalid decision request: missing fallback");
  const profile = inferProfile(s.players[p].deckList ?? s.players[p].hand);
  let picked = fallback,
    best: Line | undefined,
    depth = 0,
    confirmed = false,
    usedFallback = true;
  let alternatives: Line[] = [],
    samplesUsed = 0,
    generationComplete = false;
  const knownSeed = hash(`${seed}:${observation.version}`);
  if (budget.available()) {
    const generated = candidates(
      s,
      p,
      budget,
      Math.min(100, Math.max(16, Math.floor(budget.maxNodes / 4))),
    );
    generationComplete = generated.complete;
    const actions = generated.actions;
    if (s.phase === "mulligan") {
      picked = mulligan(s, actions, profile) ?? fallback;
      usedFallback = false;
    } else if (["choice", "damage", "move"].includes(s.phase)) {
      // Specialized mandatory evaluator resolves exactly the current question, never future reveals.
      picked = getReferenceAction(s, p, actions) ?? fallback;
      usedFallback = false;
      for (const action of actions) {
        if (!budget.take()) break;
        const sim = sampleState(observation, knownSeed);
        const next = applyAction(sim, action);
        if (next.winner === p) {
          picked = action;
          confirmed =
            next.rng === sim.rng &&
            !next.players.some(
              (x, i) =>
                x.hand.length > sim.players[i].hand.length ||
                JSON.stringify(x.deck) !==
                  JSON.stringify(sim.players[i].deck) ||
                JSON.stringify(x.runeDeck) !==
                  JSON.stringify(sim.players[i].runeDeck),
            );
          break;
        }
      }
    } else {
      const ranked = rankCandidates(s, actions, profile);
      const rootActions = diverse(
        ranked,
        Math.min(actions.length, settings.width + 4),
      );
      // Every difficulty shares the immediate terminal scan before beam pruning.
      const direct = new Map<string, GameState>();
      if (budget.take()) {
        const initial = sampleState(observation, knownSeed);
        samplesUsed = 1;
        for (const action of actions) {
          if (!budget.take()) break;
          const next = applyAction(initial, action);
          direct.set(optionKey(action), next);
          if (
            next.winner === p &&
            !next.players.some(
              (x, i) =>
                x.hand.length > initial.players[i].hand.length ||
                JSON.stringify(x.deck) !==
                  JSON.stringify(initial.players[i].deck) ||
                JSON.stringify(x.runeDeck) !==
                  JSON.stringify(initial.players[i].runeDeck),
            ) &&
            next.rng === initial.rng
          ) {
            best = {
              first: action,
              state: next,
              evaluation: evaluate(next, p, profile),
              depth: 1,
              confirmed: true,
            };
            confirmed = true;
            break;
          }
        }
        if (!confirmed) {
          const baselineEnd = direct.get("end-turn");
          const urgent =
            baselineEnd?.winner === 1 - p || s.players[1 - p].points >= 6;
          const width = urgent ? Math.max(settings.width, 12) : settings.width;
          const primary = diverse(ranked, Math.min(rootActions.length, width));
          // Every family gets its baseline before secondary rune allocations.
          const scan = [
            ...primary,
            ...primary.flatMap((a) =>
              [...paymentCandidates(initial, a)].slice(1),
            ),
          ];
          for (const action of scan) {
            if (!budget.take()) break;
            const after =
              direct.get(optionKey(action)) ?? applyAction(initial, action);
            const settled = settleSimulation(after, p, budget);
            if (!settled) continue;
            let outcome = evaluate(settled, p, profile);
            // Visible replies and hidden hypotheses share the original action and bot seed.
            // No alternate root action is selected separately for a secret sample.
            if (difficulty !== "beginner" && budget.available()) {
              const reply = settleSimulation(after, p, budget, true);
              if (reply && compare(evaluate(reply, p, profile), outcome) < 0)
                outcome = evaluate(reply, p, profile);
            }
            const abandoned = initial.fields.filter(
              (f) =>
                f.controller === p &&
                f.id !== action.locationId &&
                initial.units.some(
                  (u) => u.owner === p && u.location === f.id,
                ) &&
                !settled.units.some(
                  (u) => u.owner === p && u.location === f.id,
                ),
            ).length;
            outcome = { ...outcome, utility: outcome.utility - abandoned * 12 };
            const line = {
              first: action,
              state: settled,
              evaluation: outcome,
              depth: 1,
              confirmed: false,
              visited: [positionKey(initial), positionKey(settled)],
            };
            alternatives.push(line);
          }
          alternatives.sort((a, b) => compare(b.evaluation, a.evaluation));
          for (let variant = 1; variant < settings.replies - 1; variant++) {
            for (const line of alternatives.slice(0, settings.width)) {
              if (budget.nodes >= budget.maxNodes * 0.7 || !budget.take())
                break;
              const after =
                direct.get(optionKey(line.first)) ??
                applyAction(initial, line.first);
              const reply = settleSimulation(after, p, budget, true, variant);
              if (reply) {
                const ev = evaluate(reply, p, profile);
                if (compare(ev, line.evaluation) < 0) line.evaluation = ev;
              }
            }
          }
          alternatives.sort((a, b) => compare(b.evaluation, a.evaluation));
          best = alternatives[0];
          depth = best ? 1 : 0;
          // Iterative beam expansion counts completed strategic actions, not payment clicks.
          let beam = alternatives.slice(0, settings.width);
          const depthLimit =
            settings.samples > 1
              ? Math.floor(budget.maxNodes * 0.8)
              : budget.maxNodes;
          for (
            let horizon = 2;
            horizon <= settings.depth &&
            budget.available() &&
            budget.nodes < depthLimit;
            horizon++
          ) {
            const expanded: Line[] = [];
            for (const parent of beam) {
              if (budget.nodes >= depthLimit) break;
              if (
                parent.state.winner !== null ||
                parent.state.priorityPlayer !== p ||
                parent.state.currentPlayer !== p
              )
                continue;
              const nextCandidates = candidates(parent.state, p, budget, 30);
              const ordered = diverse(
                rankCandidates(parent.state, nextCandidates.actions, profile),
                Math.max(3, Math.floor(settings.width / 2)),
              );
              for (const action of ordered) {
                for (const variant of paymentCandidates(parent.state, action)) {
                  if (budget.nodes >= depthLimit || !budget.take()) break;
                  const settled = settleSimulation(
                    applyAction(parent.state, variant),
                    p,
                    budget,
                    difficulty !== "beginner",
                  );
                  if (!settled) continue;
                  const key = positionKey(settled);
                  if (parent.visited?.includes(key)) continue;
                  const ev = evaluate(settled, p, profile);
                  const commitment =
                    parent.evaluation.utility -
                    evaluate(parent.state, p, profile).utility;
                  const line: Line = {
                    first: parent.first,
                    state: settled,
                    evaluation: {
                      ...ev,
                      utility: ev.utility + Math.min(0, commitment),
                    },
                    depth: horizon,
                    confirmed: false,
                    visited: [...(parent.visited ?? []), key],
                  };
                  expanded.push(line);
                }
              }
            }
            if (!expanded.length) break;
            expanded.sort((a, b) => compare(b.evaluation, a.evaluation));
            if (!best || compare(expanded[0].evaluation, best.evaluation) > 0)
              best = expanded[0];
            depth = horizon;
            beam = expanded.slice(0, settings.width);
          }
          // Re-evaluate leading immediate choices with shared stress samples, conservatively.
          if (settings.samples > 1 && best && budget.available()) {
            const finalists = [
              best,
              ...alternatives.filter(
                (line) => optionKey(line.first) !== optionKey(best!.first),
              ),
            ]
              .slice(0, 3)
              .map((line) => ({ ...line, evaluation: { ...line.evaluation } }));
            const rootScores = new Map(
              alternatives.map((line) => [
                optionKey(line.first),
                line.evaluation,
              ]),
            );
            const unadjusted = finalists.map((line) => line.evaluation.utility);
            const stressTotals = finalists.map(() => 0);
            for (
              let sample = 1;
              sample < settings.samples && budget.available();
              sample++
            ) {
              if (!budget.take()) break;
              const hypothesis = sampleState(observation, knownSeed, sample);
              const updates: Evaluation[] = [];
              const penalties: number[] = [];
              const offset =
                evaluate(initial, p, profile).utility -
                evaluate(hypothesis, p, profile).utility;
              for (const line of finalists) {
                if (!budget.take()) break;
                const response = settleSimulation(
                  applyAction(hypothesis, line.first),
                  p,
                  budget,
                  true,
                );
                if (!response) break;
                const raw = evaluate(response, p, profile);
                // Compare the effect of the response, not the mere presence of
                // an assumed hand which was absent in the no-response baseline.
                const rootScore =
                  rootScores.get(optionKey(line.first)) ?? line.evaluation;
                const penalty = Math.min(
                  0,
                  raw.utility + offset - rootScore.utility,
                );
                penalties.push(penalty);
                updates.push({
                  ...line.evaluation,
                  // A losing first action invalidates any attractive later plan.
                  terminal:
                    raw.terminal === -1
                      ? -1
                      : line.depth === 1
                        ? (Math.min(raw.terminal, line.evaluation.terminal) as
                            -1 | 0 | 1)
                        : line.evaluation.terminal,
                  utility: line.evaluation.utility,
                });
              }
              // Do not compare one fully sampled candidate with an unsampled peer.
              if (updates.length !== finalists.length) break;
              samplesUsed++;
              finalists.forEach((line, index) => {
                stressTotals[index] += penalties[index];
                line.evaluation = {
                  ...updates[index],
                  // More hypotheses refine a scenario average; they do not
                  // independently multiply the cost of one possible response.
                  utility: unadjusted[index] + stressTotals[index] / sample,
                };
              });
            }
            finalists.sort((a, b) => compare(b.evaluation, a.evaluation));
            best = finalists[0] ?? best;
          }
          // A static position is not a legal alternative to ending the turn.
          // Use it only to reject moves with no strategic progress; otherwise the
          // loss of immediately playable hand options can suppress useful development.
          const standing = evaluate(initial, p, profile);
          const progress =
            best &&
            (best.evaluation.score > standing.score ||
              best.evaluation.nextScore > standing.nextScore ||
              best.evaluation.material > standing.material ||
              best.evaluation.options > standing.options ||
              best.evaluation.danger < standing.danger);
          if (
            stable(s) &&
            best &&
            !progress &&
            best.evaluation.terminal === 0 &&
            compare(best.evaluation, standing) <= 0
          ) {
            best = alternatives.find((a) => a.first.id === fallback.id) ?? {
              first: fallback,
              state: initial,
              evaluation: standing,
              depth: 0,
              confirmed: false,
            };
          }
          // Beginner variety only among near-equal, nonterminal, nonurgent lines.
          if (
            difficulty === "beginner" &&
            best &&
            !urgent &&
            best.evaluation.terminal === 0
          ) {
            const close = alternatives.filter(
              (a) =>
                a.evaluation.terminal === 0 &&
                best!.evaluation.utility - a.evaluation.utility <= 1,
            );
            if (close.length)
              best = close[Math.floor(botRandom(knownSeed)() * close.length)];
          }
        }
        if (best) {
          picked = best.first;
          usedFallback = best.depth === 0;
        }
      }
    }
  }
  // Only approved public templates are exposed during play. No card labels from hand, hidden, or future simulation.
  const reason = usedFallback
    ? "The search limit was reached; I use the legal default for this decision."
    : reasonFor(s, best, picked);
  return {
    action: picked,
    decision: decisionFor(request, picked),
    trace: {
      requestId: request.id,
      observationVersion: observation.version,
      configVersion: BOT_VERSION,
      seed,
      difficulty,
      profile,
      selected: optionKey(picked),
      alternatives: alternatives
        .slice(0, 4)
        .map((l) => ({ option: optionKey(l.first), evaluation: l.evaluation })),
      ...(best ? { selectedEvaluation: best.evaluation } : {}),
      nodes: budget.nodes,
      generated: budget.generated,
      durationMs: performance.now() - budget.started,
      completedDepth: depth,
      usedFallback,
      incomplete: budget.exhausted || !generationComplete,
      confirmedWin: confirmed,
      sampleCount: samplesUsed,
      reason,
    },
  };
}
/** This is the only trace projection suitable for an in-progress human interface. */
export function publicExplanation(result: BotResult) {
  return {
    reason: result.trace.reason,
    difficulty: result.trace.difficulty,
    thinkingMs: Math.round(result.trace.durationMs),
  };
}
