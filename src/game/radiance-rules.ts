import { isFace } from "./board-rules";
import type { GameState, PlayerId, Unit } from "./types";

/** Last Caress: the player's next unit this turn may go to any battlefield. */
export const lastCaressActive = (s: GameState, p: PlayerId) =>
  Boolean(
    s.radiance?.lastCaress?.some((g) => g.player === p && g.turn === s.turn),
  );

/** Record and test a once-per-turn use. Returns false if already used. */
export function useOncePerTurn(
  s: GameState,
  key: string,
  p: PlayerId,
): boolean {
  const once = ((s.radiance ??= {}).once ??= {});
  if (once[`${key}:${p}`] === s.turn) return false;
  once[`${key}:${p}`] = s.turn;
  return true;
}
export const usedThisTurn = (s: GameState, key: string, p: PlayerId) =>
  s.radiance?.once?.[`${key}:${p}`] === s.turn;

/**
 * Starry-Eyed Songstress: the ways to exhaust three ready friendly units.
 * Interchangeable units (same card, place and status) give one option, and at
 * most 20 options are offered.
 */
export function songstressOptions(s: GameState, p: PlayerId): string[] {
  const x = s.players[p];
  if (x.legendUsedTurn >= 0 || !isFace(x.legendId, "RAD", 151)) return [];
  const ready = s.units.filter(
    (u) => u.owner === p && u.ready && !s.gears.some((g) => g.id === u.id),
  );
  const sign = (u: Unit) =>
    [u.cardId, u.location, u.buff, u.damage, u.temporaryMight, u.stunned].join(
      "|",
    );
  const seen = new Set<string>();
  const out: string[] = [];
  for (let a = 0; a < ready.length; a++)
    for (let b = a + 1; b < ready.length; b++)
      for (let c = b + 1; c < ready.length; c++) {
        const group = [ready[a], ready[b], ready[c]];
        const key = group.map(sign).sort().join("&");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(group.map((u) => u.id).join(","));
        if (out.length >= 20) return out;
      }
  return out;
}
