import { canonicalCardName } from "../data/card-identity";
import type { GameState, PlayerId } from "./types";

/**
 * Legends in a player's Legend Zone. Every player has a starting legend;
 * Neeko, Blending In can add one more while she is on the board. Each legend
 * has its own exhausted and Empowered state.
 *
 * Source ids: the starting legend is "legend" (older code also uses
 * `legend:${player}`); a legend Neeko added is `neeko-legend:${neekoUnitId}`.
 */
export interface LegendRef {
  key: string;
  cardId: string;
}

const NEEKO = "neeko-legend:";

/**
 * A legend's printed name, for "different means none match names": printing
 * labels and the champion prefix some catalog records add ("Mel - Soul's
 * Reflection" and "Soul's Reflection" are one legend) do not count.
 */
export const legendNameKey = (name: string) =>
  canonicalCardName(name.split(" - ").at(-1)!);

/** Neeko's added legends that are still in play (Neeko is on the board). */
function addedLegends(s: GameState, p: PlayerId) {
  return (s.radiance?.neeko ?? []).filter(
    (n) => n.player === p && s.units.some((u) => u.id === n.unitId),
  );
}

export const isLegendSource = (id: string | undefined | null): boolean =>
  id === "legend" ||
  Boolean(id?.startsWith("legend:")) ||
  Boolean(id?.startsWith(NEEKO));

/** Every legend in the player's Legend Zone, the starting legend first. */
export function legendRefs(s: GameState, p: PlayerId): LegendRef[] {
  return [
    { key: "legend", cardId: s.players[p].legendId },
    ...addedLegends(s, p).map((n) => ({
      key: `${NEEKO}${n.unitId}`,
      cardId: n.legendId,
    })),
  ];
}

/** The first legend in the player's Legend Zone that passes the test. */
export function findLegend(
  s: GameState,
  p: PlayerId,
  test: (cardId: string) => boolean,
): LegendRef | undefined {
  return legendRefs(s, p).find((ref) => test(ref.cardId));
}
export const hasLegend = (
  s: GameState,
  p: PlayerId,
  test: (cardId: string) => boolean,
) => Boolean(findLegend(s, p, test));
export const hasLegendId = (s: GameState, p: PlayerId, cardId: string) =>
  hasLegend(s, p, (id) => id === cardId);

/** The live entry behind a Neeko key: her legend while she is on the board. */
function added(s: GameState, p: PlayerId, key: string) {
  if (!key.startsWith(NEEKO)) return undefined;
  const unitId = key.slice(NEEKO.length);
  return s.radiance?.neeko?.find(
    (n) =>
      n.player === p &&
      n.unitId === unitId &&
      s.units.some((u) => u.id === unitId),
  );
}

/** The legend card behind a source id, if it is a legend in play. */
export function legendCardOf(
  s: GameState,
  p: PlayerId,
  key: string | undefined,
): string | undefined {
  if (!isLegendSource(key)) return undefined;
  if (key!.startsWith(NEEKO)) return added(s, p, key!)?.legendId;
  return s.players[p].legendId;
}

export function legendReady(s: GameState, p: PlayerId, key = "legend") {
  const extra = added(s, p, key);
  if (extra) return (extra.usedTurn ?? -1) < 0;
  // A legend whose Neeko left the board is never the starting legend.
  if (key.startsWith(NEEKO)) return false;
  return s.players[p].legendUsedTurn < 0;
}
/** Exhaust (turn) or ready (-1) one legend. */
export function setLegendUsed(
  s: GameState,
  p: PlayerId,
  key: string,
  turn: number,
) {
  const extra = added(s, p, key);
  if (extra) extra.usedTurn = turn;
  else if (!key.startsWith(NEEKO)) s.players[p].legendUsedTurn = turn;
}
export const exhaustLegend = (s: GameState, p: PlayerId, key = "legend") =>
  setLegendUsed(s, p, key, s.turn);
export const readyLegend = (s: GameState, p: PlayerId, key = "legend") =>
  setLegendUsed(s, p, key, -1);
/** The turn a legend was exhausted, or -1 while it is ready. */
export function legendUsedTurn(s: GameState, p: PlayerId, key = "legend") {
  const extra = added(s, p, key);
  if (extra) return extra.usedTurn ?? -1;
  // Gone with Neeko: it cannot be used, so it reads as exhausted this turn.
  return key.startsWith(NEEKO) ? s.turn : s.players[p].legendUsedTurn;
}
/** Ready every legend the player has (Awaken). */
export function readyAllLegends(s: GameState, p: PlayerId) {
  s.players[p].legendUsedTurn = -1;
  for (const n of s.radiance?.neeko ?? []) if (n.player === p) n.usedTurn = -1;
}

export function legendEmpowered(s: GameState, p: PlayerId, key = "legend") {
  const extra = added(s, p, key);
  if (extra) return Boolean(extra.empowered);
  if (key.startsWith(NEEKO)) return false;
  return Boolean(s.players[p].legendEmpowered);
}
export function setLegendEmpowered(
  s: GameState,
  p: PlayerId,
  key: string,
  value: boolean,
) {
  const extra = added(s, p, key);
  if (extra) extra.empowered = value;
  else if (!key.startsWith(NEEKO)) s.players[p].legendEmpowered = value;
}

/**
 * The legend a rule refers to: the source when it is a legend, otherwise the
 * first legend that passes the test, otherwise the starting legend.
 */
export function legendKeyFor(
  s: GameState,
  p: PlayerId,
  sourceId: string | undefined,
  test?: (cardId: string) => boolean,
) {
  if (isLegendSource(sourceId))
    return sourceId!.startsWith("legend:") ? "legend" : sourceId!;
  return (test && findLegend(s, p, test)?.key) ?? "legend";
}
/** A ready legend to exhaust for "exhaust your legend": the starting one first. */
export const readyLegendRef = (s: GameState, p: PlayerId) =>
  legendRefs(s, p).find((ref) => legendReady(s, p, ref.key));
/** The player whose Legend Zone holds this Neeko-added legend. */
export function addedLegendOwner(
  s: GameState,
  key: string,
): PlayerId | undefined {
  if (!key.startsWith(NEEKO)) return undefined;
  const unitId = key.slice(NEEKO.length);
  return s.radiance?.neeko?.find((n) => n.unitId === unitId)?.player;
}
/** Neeko-added legends in play for a player (or both players). */
export const addedLegendRefs = (s: GameState, p?: PlayerId) =>
  ([0, 1] as PlayerId[])
    .filter((q) => p === undefined || q === p)
    .flatMap((q) =>
      legendRefs(s, q)
        .slice(1)
        .map((ref) => ({ ...ref, owner: q })),
    );
