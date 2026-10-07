import { getScript } from "./scripts";
import type { Effect, GameState, Unit } from "./types";
/** A text instance is an ability source on the same physical unit, never another unit. */
export function textSources(s: GameState, u: Unit | undefined): Unit[] {
  if (!u) return [];
  if (!u.gear.length) return [u];
  const copies = s.gears.filter(
    (g) => g.attachedTo === u.id && u.gear.includes(g.id) && g.copiedText,
  );
  return [
    u,
    ...copies.map(
      (g) =>
        new Proxy(u, {
          get(target, key) {
            if (key === "cardId") return g.copiedText;
            if (key === "abilityInstance") return g.id;
            if (key === "tokenCopiesTurn") return g.copiedTokenTurn;
            return Reflect.get(target, key);
          },
          set(target, key, value) {
            if (key === "tokenCopiesTurn") {
              g.copiedTokenTurn = value;
              return true;
            }
            return Reflect.set(target, key, value);
          },
        }),
    ),
  ];
}
export const textUnits = (s: GameState) =>
  s.gears.some((g) => g.attachedTo && g.copiedText)
    ? s.units.flatMap((u) => textSources(s, u))
    : s.units;
export const textEffects = (
  u: { id: string; abilityInstance?: string },
  effects: Effect[],
): Effect[] =>
  u.abilityInstance
    ? effects.map((e) => ({
        ...e,
        abilityInstance: u.abilityInstance,
        modes: e.modes?.map((m) => ({
          ...m,
          effects: textEffects(u, m.effects),
        })),
      }))
    : effects;
export function abilityUnit(
  s: GameState,
  id: string | undefined,
  instance?: string,
) {
  const u = s.units.find((u) => u.id === id);
  return instance
    ? (textSources(s, u).find((u) => u.abilityInstance === instance) ?? u)
    : u;
}
export const copiedScripts = (s: GameState, u: Unit | undefined) =>
  textSources(s, u)
    .slice(1)
    .flatMap((t) => {
      const script = getScript(t.cardId);
      return script ? [{ unit: t, script }] : [];
    });
