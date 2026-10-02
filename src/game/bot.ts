import { getCard } from "../data/cards";
import {
  applyAction,
  getLegalActions,
  getMight,
  getKeywords,
  otherPlayer,
} from "./engine";
import { getScript } from "./scripts";
import type { GameAction, GameState, PlayerId, Unit } from "./types";
/** Board-and-own-hand heuristic. Never inspects either draw-pile order or the opponent's hand. */
export function getBotAction(
  s: GameState,
  player: PlayerId = s.priorityPlayer,
): GameAction | null {
  const actions = getLegalActions(s, player);
  if (!actions.length) return null;
  const opponent = otherPlayer(player);
  const own = s.units.filter((u) => u.owner === player);
  const enemies = s.units.filter((u) => u.owner === opponent);
  const value = (u: Unit) =>
    getMight(s, u) +
    (getCard(u.cardId).energy ?? 0) * 0.25 +
    (u.cardId.startsWith("ogs-00") ? 1 : 0);
  const rate = (a: GameAction): number => {
    if (a.category === "mulligan") {
      const indices = a.cardIndices ?? [];
      return (
        indices.reduce(
          (score, i) =>
            score +
            ((getCard(s.players[player].hand[i]).energy ?? 0) >= 5 ? 5 : -3),
          0,
        ) -
        indices.length * 0.01
      );
    }
    if (s.phase === "damage") {
      const target = enemies.find((u) => u.id === a.targetId);
      if (!target) return 0;
      return 40 + value(target) - (a.amount ?? 0) * 0.01;
    }
    if (a.id.startsWith("choose-token:")) {
      const f = s.fields.find((f) => f.id === a.locationId);
      if (!f) return 10;
      return 20 - own.filter((u) => u.location === f.id).length * 2;
    }
    if (a.id.startsWith("choose-trigger:")) {
      const e = s.pendingChoice?.effects?.find((e) => e.target);
      const u = s.units.find((u) => u.id === a.targetId);
      if (!u) return 0;
      if (e?.type === "ready")
        return u.owner === player && !u.ready ? 20 + value(u) : -30;
      if (e?.type === "buff")
        return u.owner === player ? 20 + (u.buff ? 0 : 5) + value(u) : -50;
      if (e?.type === "stun")
        return u.owner === opponent
          ? 20 + value(u) + (u.stunned ? -30 : 0)
          : -50;
      if (e?.type === "damage")
        return u.owner === opponent
          ? 20 +
              value(u) +
              (u.damage + (e.amount ?? 1) >= getMight(s, u) ? 10 : 0)
          : -50;
      if (e?.type === "moveTarget")
        return u.owner === opponent ? 20 + value(u) : -20;
      return 1;
    }
    if (s.phase === "move") {
      const move = s.pendingMove!;
      const selected = own.filter((u) => move.unitIds.includes(u.id));
      const defense = enemies
        .filter((u) => u.location === move.to)
        .reduce(
          (n, u) => n + getMight(s, u) + (getScript(u.cardId)?.shield ?? 0),
          0,
        );
      const attack = selected.reduce(
        (n, u) => n + getMight(s, u) + (getScript(u.cardId)?.assault ?? 0),
        0,
      );
      if (a.id === "move-confirm") return attack > defense ? 50 : 5;
      if (a.id === "move-cancel") return -20;
      const u = own.find((u) => u.id === a.sourceId);
      if (!u || move.unitIds.includes(u.id)) return -30;
      if (attack > defense) return -10;
      return 20 + value(u) - (u.location.startsWith("field:") ? 15 : 0);
    }
    if (a.id === "end-turn") return 0;
    if (a.id === "pass") return 0;
    if (a.category === "move") {
      const u = own.find((u) => u.id === a.sourceId)!;
      if (a.locationId?.startsWith("base:")) return -20;
      const f = s.fields.find((f) => f.id === a.locationId)!;
      if (f.controller === player) return -10;
      const defenders = enemies.filter((e) => e.location === a.locationId);
      const defense = defenders.reduce(
        (n, e) => n + getMight(s, e) + (getScript(e.cardId)?.shield ?? 0),
        0,
      );
      const possible = own
        .filter(
          (x) =>
            x.ready &&
            x.location !== a.locationId &&
            (x.location === `base:${player}` ||
              getKeywords(s, x).includes("Ganking")),
        )
        .reduce(
          (n, x) => n + getMight(s, x) + (getScript(x.cardId)?.assault ?? 0),
          0,
        );
      if (possible <= defense) return -10;
      return (
        65 +
        (f.controller === null ? 10 : 0) +
        (getMight(s, u) > defense ? 5 : 0) -
        value(u) * 0.1
      );
    }
    if (a.category === "play") {
      const c = getCard(a.cardId!);
      if (c.type === "Unit") {
        const here = own.filter((u) => u.location === a.locationId).length;
        const f = s.fields.find((f) => f.id === a.locationId);
        return (
          25 +
          (c.might ?? 0) * 1.5 +
          (getScript(c.id)?.onPlay ? 2 : 0) +
          (f ? 8 - here * 2 : 0) +
          (a.id.endsWith("accelerate") ? 6 : 0)
        );
      }
      const effects = getScript(c.id)?.spell ?? [];
      const effect = effects[0];
      const target = s.units.find((u) => u.id === a.targetId);
      const during = s.phase === "showdown" || s.stack.length > 0;
      if (effect?.type === "damage" || effect?.type === "kill") {
        if (!target || target.owner !== opponent) return -50;
        const lethal =
          effect.type === "kill" ||
          target.damage + (effect.amount ?? 0) >= getMight(s, target);
        return 20 + value(target) + (lethal ? 15 : 0) + (during ? 15 : 0);
      }
      if (effect?.type === "duel") {
        const [first, second] = (a.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        if (!first || !second) return -30;
        return getMight(s, first) > getMight(s, second)
          ? 40 + value(second)
          : -10;
      }
      if (effect?.type === "damageAll") {
        const victims = enemies.filter((u) => u.location === a.targetId);
        return victims.length
          ? 20 + victims.reduce((n, u) => n + value(u), 0)
          : -30;
      }
      if (effect?.type === "stun") {
        return target?.owner === opponent && during && !target.stunned
          ? 30 + value(target)
          : -10;
      }
      if (["might", "assault"].includes(effect?.type ?? "")) {
        if (target?.owner !== player) return -50;
        return during && target.location === s.combat?.fieldId
          ? 25 + (effect.amount ?? 1)
          : target.ready && enemies.some((e) => e.location.startsWith("field:"))
            ? 5
            : -5;
      }
      if (effect?.type === "mightAll")
        return own.length >= 2 && (during || own.some((u) => u.ready))
          ? 30
          : -10;
      if (effect?.type === "draw") return 23;
      if (effect?.type === "channel") return 30;
      if (effect?.type === "token") return 29;
      return 2;
    }
    return 1;
  };
  return actions
    .map((a, i) => ({ a, score: rate(a), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)[0].a;
}
export function runBotUntilHuman(state: GameState, maxSteps = 256): GameState {
  let s = state;
  for (
    let i = 0;
    i < maxSteps && s.priorityPlayer === 1 && s.winner === null;
    i++
  ) {
    const action = getBotAction(s, 1);
    if (!action) break;
    s = applyAction(s, action);
  }
  return s;
}
