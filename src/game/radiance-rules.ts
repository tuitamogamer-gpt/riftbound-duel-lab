import type { GameState, PlayerId } from "./types";

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
