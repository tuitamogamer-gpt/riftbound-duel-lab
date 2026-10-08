import { getCard } from "../../data/cards";
import { getVictoryScore } from "../board-rules";
import {
  getMight,
  getKeywords,
  getResources,
  iterateLegalActions,
} from "../engine";
import { getScript } from "../scripts";
import type { Effect, GameState, PlayerId } from "../types";
import { cardStrategy, type Profile } from "./config";
export interface Evaluation {
  terminal: -1 | 0 | 1;
  utility: number;
  score: number;
  nextScore: number;
  material: number;
  options: number;
  resources: number;
  danger: number;
}
export function evaluate(
  s: GameState,
  p: PlayerId,
  profile: Profile,
): Evaluation {
  const q = (1 - p) as PlayerId,
    target = getVictoryScore(s);
  const board = (actor: PlayerId) =>
    s.units
      .filter((u) => u.owner === actor)
      .reduce((n, u) => {
        const sc = getScript(u.cardId),
          m = getMight(
            s,
            s.combat
              ? u
              : {
                  ...u,
                  temporaryMight: 0,
                  temporaryAssault: 0,
                  combatShield: 0,
                },
          );
        return (
          n +
          2 +
          m * 1.1 +
          (getCard(u.cardId).energy ?? 0) * 0.25 +
          (sc?.abilities?.length ? 1.4 : 0) +
          (sc?.onHold || sc?.onConquer ? 1.5 : 0) +
          (u.ready ? 1.2 : 0) +
          (profile === "combo" && sc?.abilities?.length ? 1 : 0) +
          (profile === "big-units" && m >= 5 ? 0.8 : 0) +
          (profile === "tokens" && cardStrategy(u.cardId).tokens ? 0.8 : 0)
        );
      }, 0);
  const gearValue = (actor: PlayerId) => {
    const hasBearer = s.units.some((unit) => unit.owner === actor);
    return s.gears
      .filter((gear) => gear.owner === actor)
      .reduce((n, gear) => {
        const script = getScript(gear.cardId),
          card = getCard(gear.cardId);
        const attached = s.units.some((unit) => unit.id === gear.attachedTo);
        const equipment = script?.equipment;
        // Attached Might is already included in getMight. Gear itself survives a
        // bearer and may provide public reusable abilities or a future attachment.
        const reusable =
          1 +
          (card.energy ?? 0) * 0.15 +
          (script?.abilities?.length ? 0.9 : 0) +
          (equipment?.onAttack ||
          equipment?.onConquer ||
          equipment?.onHold ||
          equipment?.onMove
            ? 0.6
            : 0);
        const availableAttachment =
          !attached && hasBearer
            ? Math.max(0, script?.gearMight ?? 0) * 0.3
            : 0;
        return (
          n +
          (reusable +
            availableAttachment +
            (profile === "equipment" && hasBearer ? 0.5 : 0)) *
            (gear.temporary ? 0.4 : 1)
        );
      }, 0);
  };
  const material = board(p) - board(q) + gearValue(p) - gearValue(q);
  const hold = (actor: PlayerId) => {
    if (
      s.units.some(
        (u) =>
          u.owner !== actor &&
          u.location.startsWith("field:") &&
          getKeywords(s, u).includes("No enemy scoring"),
      )
    )
      return 0;
    return s.fields.reduce((n, f) => {
      if (f.controller !== actor || s.combat?.fieldId === f.id) return n;
      const occupants = s.units.filter(
        (u) => u.owner === actor && u.location === f.id,
      );
      if (!occupants.length) return n;
      // A forecast, never a point awarded outside the resolver. No separate control bonus.
      const durable = occupants.some((u) => !u.temporary);
      if (!durable) return n + 0.05;
      const defenders = occupants.reduce((sum, u) => sum + getMight(s, u), 0);
      const pressure = s.units
        .filter(
          (u) =>
            u.owner !== actor &&
            (s.currentPlayer === actor || u.ready) &&
            (u.location === `base:${u.owner}` ||
              (u.location !== f.id && getKeywords(s, u).includes("Ganking"))),
        )
        .reduce((sum, u) => sum + getMight(s, u), 0);
      // Visible mobility can contest a thin garrison before its next Hold.
      // This is uncertainty in the forecast, never a replacement combat result.
      return (
        n +
        (pressure
          ? Math.min(0.8, (defenders + 1) / (defenders + pressure + 1))
          : 0.8)
      );
    }, 0);
  };
  const ownHold = hold(p),
    enemyHold = hold(q);
  const score = (s.players[p].points - s.players[q].points) * 45;
  const nextScore = (ownHold - enemyHold) * 34;
  const enemyControlled = s.fields.filter(
    (f) =>
      f.controller === q &&
      s.units.some((u) => u.owner === q && u.location === f.id && !u.temporary),
  ).length;
  const opponentNear = s.players[q].points + enemyControlled >= target;
  const danger = opponentNear
    ? 160 + enemyHold * 30
    : Math.max(0, s.players[q].points + enemyHold - target + 2) * 14;
  const recoveryTargets = (actor: PlayerId, effects: Effect[] = []) => {
    const recoveries = effects.filter(
      (effect) =>
        effect.type === "retrieve" ||
        (effect.type === "playCard" && effect.play?.zone === "trash"),
    );
    if (!recoveries.length) return null;
    return s.players[actor].discard.filter((id) =>
      recoveries.some((effect) => {
        const card = getCard(id);
        const types = effect.play?.cardTypes ?? effect.cardTypes;
        const required = ["unit", "spell", "gear"].includes(
          effect.condition ?? "",
        )
          ? effect.condition?.toLowerCase()
          : undefined;
        return (
          (!types?.length || types.includes(card.type)) &&
          (!required || card.type.toLowerCase() === required) &&
          (effect.maxEnergy === undefined ||
            (card.energy ?? 0) <= effect.maxEnergy)
        );
      }),
    ).length;
  };
  const playableHand = (actor: PlayerId) => {
    const resources = getResources(s, actor);
    return s.players[actor].hand.reduce((n, id) => {
      // The legality shell preserves public hand size without identities.
      if (id === "unknown") return n + 1;
      const c = getCard(id),
        sc = getScript(id);
      const recovery = recoveryTargets(actor, sc?.spell);
      const useful =
        recovery !== null
          ? recovery > 0
          : c.type === "Unit" ||
            c.type === "Gear" ||
            sc?.spell?.some((e) =>
              ["draw", "channel", "token"].includes(e.type),
            ) ||
            s.units.some((u) => u.owner !== actor);
      return (
        n +
        ((useful ? 1 : 0.35) +
          (profile === "recursion" && recovery
            ? Math.min(recovery, 3) * 0.2
            : 0)) *
          Math.max(
            0.3,
            1.5 - Math.max(0, (c.energy ?? 0) - resources.energy) * 0.15,
          )
      );
    }, 0);
  };
  let continuation = 0;
  if (
    s.priorityPlayer === p &&
    s.winner === null &&
    s.phase === "main" &&
    !s.stack.length
  ) {
    const seen = new Set<string>();
    let scanned = 0;
    for (const action of iterateLegalActions(s, p)) {
      if (++scanned > 32) break;
      if (
        action.cardId &&
        action.category === "play" &&
        !seen.has(action.cardId)
      ) {
        seen.add(action.cardId);
        continuation += getScript(action.cardId)?.reaction ? 1.5 : 0.5;
      }
    }
  }
  const options = playableHand(p) - playableHand(q) + continuation;
  const resourceValue = (actor: PlayerId) => {
    const x = s.players[actor],
      r = getResources(s, actor);
    // Future rune development matters; floating energy matters only with useful cards.
    const experience = Math.max(0, x.xp ?? 0);
    const xpValue =
      profile === "xp"
        ? Math.min(experience, 6) * 0.7 +
          Math.min(Math.max(0, experience - 6), 6) * 0.15 +
          (experience >= 3 ? 0.8 : 0) +
          (experience >= 6 ? 1.3 : 0)
        : experience * 0.5;
    return (
      x.runes.length * 1.4 +
      xpValue +
      (x.hand.length ? Math.min(r.energy, 5) * 0.35 : 0) +
      Object.values(x.typedPower ?? {}).reduce((a, b) => a + b, 0) * 0.25
    );
  };
  const resources = resourceValue(p) - resourceValue(q);
  const ownFinish = s.players[p].points + ownHold >= target - 0.2 ? 80 : 0;
  return {
    terminal: s.winner === null ? 0 : s.winner === p ? 1 : -1,
    utility:
      score + nextScore + material + options + resources - danger + ownFinish,
    score,
    nextScore,
    material,
    options,
    resources,
    danger,
  };
}
export function compare(a: Evaluation, b: Evaluation) {
  return a.terminal - b.terminal || a.utility - b.utility;
}
