import { getCard } from "../data/cards";
import {
  getCombatPower,
  getKeywords,
  getMight,
  getResources,
  otherPlayer,
} from "./engine";
import { getScript } from "./scripts";
import type {
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";

export const unitValue = (s: GameState, unit: Unit) =>
  Math.max(1, getMight(s, unit)) +
  (getCard(unit.cardId).energy ?? 0) * 0.4 +
  unit.gear.length * 1.5 +
  (getScript(unit.cardId)?.abilities?.length ? 2 : 0);

/** Project only public pieces into combat. No draw, hidden-card or RNG simulation. */
export function battleBalance(
  s: GameState,
  player: PlayerId,
  field: LocationId,
  movers: Unit[] = [],
) {
  const ids = new Set(movers.map((u) => u.id));
  const projected: GameState = {
    ...s,
    units: s.units.map((u) => (ids.has(u.id) ? { ...u, location: field } : u)),
    combat:
      s.combat?.fieldId === field
        ? s.combat
        : {
            fieldId: field,
            attacker: player,
            defender: otherPlayer(player),
            engaged: true,
            stage: "priority",
            total: [0, 0],
            remaining: [0, 0],
            assignments: [{}, {}],
            assigningPlayer: player,
          },
  };
  const own = projected.units.filter(
    (u) => u.owner === player && u.location === field,
  );
  const enemy = projected.units.filter(
    (u) => u.owner !== player && u.location === field,
  );
  const power = (units: Unit[]) =>
    units.reduce((n, u) => n + getCombatPower(projected, u), 0);
  const health = (units: Unit[]) =>
    units.reduce(
      (n, u) =>
        n +
        Math.max(1, getMight(projected, u) - u.damage + (u.preventDamage ?? 0)),
      0,
    );
  const attack = power(own),
    defense = power(enemy),
    ownHealth = health(own),
    enemyHealth = health(enemy);
  return {
    attack,
    defense,
    ownHealth,
    enemyHealth,
    wins: own.length > 0 && attack >= enemyHealth && ownHealth > defense,
  };
}

/** Pick a sufficient force, preserving other ready units and occupied fields. */
export function planAttack(
  s: GameState,
  player: PlayerId,
  field: LocationId,
  candidates: Unit[],
) {
  const opponent = otherPlayer(player);
  const defenders = s.units.filter(
    (u) => u.owner === opponent && u.location === field,
  );
  const taxes = defenders.filter((u) => u.cardId === "unl-163-219").length;
  const capacity = taxes
    ? 1 + Math.floor(getResources(s, player).power / taxes)
    : candidates.length;
  const commitment = (group: Unit[]) => {
    const ids = new Set(group.map((u) => u.id));
    const abandoned = s.fields.filter(
      (f) =>
        f.id !== field &&
        f.controller === player &&
        s.units.some((u) => u.owner === player && u.location === f.id) &&
        !s.units.some(
          (u) => u.owner === player && u.location === f.id && !ids.has(u.id),
        ),
    ).length;
    return (
      group.reduce(
        (sum, u) =>
          sum +
          unitValue(s, u) * 0.35 +
          (u.location.startsWith("field:") ? 9 : 0),
        0,
      ) +
      abandoned * 35 +
      Math.max(0, group.length - 1) * taxes * 5
    );
  };
  let best: { ids: string[]; score: number; cost: number } | null = null;
  const assess = (group: Unit[]) => {
    if (!group.length || group.length > capacity) return;
    const balance = battleBalance(s, player, field, group);
    if (!balance.wins) return;
    const cost = commitment(group);
    if (best && best.cost <= cost) return;
    const denial =
      s.fields.find((f) => f.id === field)?.controller === opponent
        ? 12 + s.players[opponent].points * 2
        : 0;
    best = {
      ids: group.map((u) => u.id),
      cost,
      score: 74 + denial + (s.players[player].points >= 7 ? 35 : 0) - cost,
    };
  };
  // Singletons and two deterministic greedy orders keep large token boards bounded.
  for (const candidate of candidates) assess([candidate]);
  const sorted = [...candidates].sort(
    (a, b) => unitValue(s, a) - unitValue(s, b) || a.id.localeCompare(b.id),
  );
  for (const order of [sorted, [...sorted].reverse()]) {
    const group: Unit[] = [];
    for (const unit of order.slice(0, capacity)) {
      group.push(unit);
      assess(group);
    }
  }
  return best as { ids: string[]; score: number; cost: number } | null;
}

/** Lethal damage packages outrank harmless damage on a large protected target. */
export function damageScores(
  s: GameState,
  player: PlayerId,
  actions: GameAction[],
) {
  const combat = s.combat!;
  const enemies = s.units.filter(
    (u) => u.owner !== player && u.location === combat.fieldId,
  );
  const remaining = enemies.filter(
    (u) =>
      (combat.assignments[player][u.id] ?? 0) <
      Math.max(1, getMight(s, u) - u.damage + (u.preventDamage ?? 0)),
  );
  const required = (u: Unit) =>
    Math.max(
      1,
      getMight(s, u) -
        u.damage +
        (u.preventDamage ?? 0) -
        (combat.assignments[player][u.id] ?? 0),
    );
  const memo = new Map<string, number>();
  const best = (units: Unit[], budget: number, depth = 0): number => {
    if (budget <= 0 || !units.length || depth >= 8 || memo.size >= 512)
      return 0;
    const key = `${budget}:${units.map((u) => u.id).join(",")}`;
    if (memo.has(key)) return memo.get(key)!;
    const tanks = units.filter((u) => getKeywords(s, u).includes("Tank"));
    const frontline = units.filter(
      (u) => !getKeywords(s, u).includes("Backline"),
    );
    const choices = tanks.length ? tanks : frontline.length ? frontline : units;
    let score = 0;
    for (const u of choices)
      if (required(u) <= budget)
        score = Math.max(
          score,
          unitValue(s, u) +
            best(
              units.filter((v) => v.id !== u.id),
              budget - required(u),
              depth + 1,
            ),
        );
    memo.set(key, score);
    return score;
  };
  return new Map(
    actions.map((action) => {
      const target = remaining.find((u) => u.id === action.targetId);
      if (!target) return [action.id, 0];
      const amount = action.amount ?? 0;
      const lethal = amount >= required(target);
      return [
        action.id,
        lethal
          ? 100 +
            10 *
              (unitValue(s, target) +
                best(
                  remaining.filter((u) => u.id !== target.id),
                  combat.remaining[player] - amount,
                )) -
            amount * 0.01
          : unitValue(s, target) * 0.1,
      ];
    }),
  );
}
