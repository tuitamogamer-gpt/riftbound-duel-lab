import { isCardType, type Card } from "../data/cards";
import { isFace } from "./board-rules";
import type {
  Effect,
  GameAction,
  GameState,
  Gear,
  LocationId,
  PlayerId,
  Unit,
} from "./types";

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

/** A friendly unit or gear died this turn (Lingering Animus). */
export const markDied = (s: GameState, p: PlayerId) => {
  ((s.radiance ??= {}).once ??= {})[`died:${p}`] = s.turn;
};
export const diedThisTurn = (s: GameState, p: PlayerId) =>
  s.radiance?.once?.[`died:${p}`] === s.turn;

/** Conditional "I enter ready" and "units enter ready" rules. */
export function radianceEntersReady(
  s: GameState,
  p: PlayerId,
  cardId: string,
  location: LocationId,
  legal?: GameAction,
): boolean {
  if (isFace(cardId, "RAD", 5) && diedThisTurn(s, p)) return true;
  if (isFace(cardId, "RAD", 11) && legal?.showOff) return true;
  if (isFace(cardId, "RAD", 93) && !s.units.some((u) => u.owner === p))
    return true;
  // Firebrand Raider: other units enter ready.
  if (s.units.some((u) => isFace(u.cardId, "RAD", 19))) return true;
  // The Exile: units you play to battlefields you control enter ready.
  if (
    isFace(s.players[p].legendId, "RAD", 149) &&
    s.fields.some((f) => f.id === location && f.controller === p)
  )
    return true;
  return false;
}
/** Firebrand Raider: units don't ready during the Awaken Phase. */
export const awakenReadyBlocked = (s: GameState) =>
  s.units.some((u) => isFace(u.cardId, "RAD", 19));
/** Seraphic Wyvern: each one channels one more exhausted rune. */
export const extraChannels = (s: GameState, p: PlayerId) =>
  s.units.filter((u) => u.owner === p && isFace(u.cardId, "RAD", 92)).length;
/** Watchful Curator: your gear have [Deflect]. */
export const gearDeflect = (s: GameState, g: Gear) =>
  s.units.filter((u) => u.owner === g.owner && isFace(u.cardId, "RAD", 37))
    .length;
/** Kai'Sa, Rebel: while she is in a showdown, your spells have [Reaction]. */
export const spellsHaveReaction = (s: GameState, p: PlayerId, card: Card) =>
  isCardType(card, "Spell") &&
  Boolean(s.combat) &&
  s.units.some(
    (u) =>
      u.owner === p &&
      isFace(u.cardId, "RAD", 63) &&
      u.location === s.combat!.fieldId,
  );

/** Battlefield targets with printed restrictions (e.g. "occupied enemy"). */
export function battlefieldTargetAllowed(
  s: GameState,
  p: PlayerId,
  fieldId: LocationId,
  e: Effect,
) {
  if (e.condition === "occupiedEnemy")
    return (
      s.fields.some(
        (f) => f.id === fieldId && f.controller !== null && f.controller !== p,
      ) && s.units.some((u) => u.owner !== p && u.location === fieldId)
    );
  return true;
}
/** Firelights' Hideout: the next unit you play this turn has [Accelerate]. */
export const accelerateGranted = (s: GameState, p: PlayerId) =>
  Boolean(
    s.radiance?.accelerateNext?.some(
      (g) => g.player === p && g.turn === s.turn,
    ),
  );
/** Activation conditions for Radiance abilities. */
export function radianceAbilityAllowed(
  s: GameState,
  p: PlayerId,
  condition: string,
  sourceId: string,
): boolean {
  switch (condition) {
    case "radiance:mighty-ready":
      return s.units.some(
        (u) => u.owner === p && u.ready && mightOf(s, u) >= 5,
      );
    case "radiance:friendly-gear":
      return s.gears.some(
        (g) =>
          g.owner === p &&
          g.id !== sourceId &&
          !s.units.some((u) => u.id === g.id),
      );
    case "radiance:friendly-unit":
      return s.units.some((u) => u.owner === p);
    case "radiance:ready-friendly-unit":
      return s.units.some((u) => u.owner === p && u.ready && u.id !== sourceId);
    case "radiance:discard":
      return s.players[p].hand.length > 0;
  }
  return true;
}
let mightOf: (s: GameState, u: Unit) => number = () => 0;
/** The engine registers its Might calculation (avoids an import cycle). */
export const setMightProvider = (f: (s: GameState, u: Unit) => number) => {
  mightOf = f;
};
