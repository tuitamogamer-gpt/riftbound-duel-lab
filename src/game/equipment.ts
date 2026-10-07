import { textSources, textEffects } from "./text-sources";
import { isFace } from "./board-rules";
import { getScript } from "./scripts";
import { getCard } from "../data/cards";
import type { GameState, Unit } from "./types";

export function attachedEquipment(s: GameState, u: Unit) {
  return s.gears.filter((g) => g.attachedTo === u.id && u.gear.includes(g.id));
}

export function nearbyEquipmentKeywords(s: GameState, u: Unit) {
  return s.gears.flatMap((gear) => {
    const keywords = getScript(gear.cardId)?.equipment?.nearbyKeywords;
    if (!keywords?.length || !gear.attachedTo) return [];
    const wielder = s.units.find((ally) => ally.id === gear.attachedTo);
    return wielder?.owner === u.owner &&
      wielder.location === u.location &&
      wielder.gear.includes(gear.id)
      ? keywords
      : [];
  });
}

export function equipDomains(cardId: string) {
  return getScript(cardId)?.equipAnyPower || cardId === "unl-188-219"
    ? []
    : getCard(cardId).domains;
}

export function unitTriggerEffects(
  s: GameState,
  u: Unit,
  name: "onAttack" | "onDefend" | "onConquer" | "onHold" | "onMove",
) {
  // Each inherited ability is an independent trigger, with the unit as source.
  return [
    ...textSources(s, u).flatMap((t) => {
      const e = getScript(t.cardId)?.[name];
      return e ? [textEffects(t, e)] : [];
    }),
    ...((name === "onHold" || name === "onConquer") &&
    attachedEquipment(s, u).some((g) => isFace(g.cardId, "SFD", 30))
      ? [
          ...textSources(s, u).flatMap((t) => {
            const e = getScript(t.cardId)?.[
              name === "onHold" ? "onConquer" : "onHold"
            ];
            return e ? [textEffects(t, e)] : [];
          }),
          ...attachedEquipment(s, u).map(
            (g) =>
              getScript(g.cardId)?.equipment?.[
                name === "onHold" ? "onConquer" : "onHold"
              ],
          ),
        ]
      : []),
    ...attachedEquipment(s, u).map(
      (g) => getScript(g.cardId)?.equipment?.[name],
    ),
  ].filter((effects) => effects !== undefined);
}
