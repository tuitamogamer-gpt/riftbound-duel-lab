import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { cards, getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import type { CardScript, GameState, PlayerId, Unit } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
const empower = (energy: number, power = 0, domain?: string) => ({
  label: "Empower",
  energy,
  power,
  domain,
  condition: "sourceNotEmpowered",
  effects: [{ type: "special" as const, custom: "wave14:empower-source" }],
});
export const cardWave19Scripts: Record<string, CardScript> = {
  "ogn-227-298": plain,
  "unl-118-219": {
    ...plain,
    onPlay: [
      {
        type: "damage",
        amount: 1,
        target: "boardCards",
        who: "opponent",
        cardTypes: ["Unit"],
        upTo: true,
        targetCount: 5,
        group: { distinctLocations: true },
      },
    ],
  },
};
for (const c of cards.filter((c) => c.set === "VEN")) {
  if (c.collectorNumber === 58)
    cardWave19Scripts[c.id] = {
      ...plain,
      cardTypes: ["Unit", "Gear"],
      notes:
        "Dual Unit/Gear type, one physical object. Enters exhausted; counts as both types in every zone.",
    };
  if (c.collectorNumber === 69)
    cardWave19Scripts[c.id] = {
      ...plain,
      onPlay: [{ type: "draw" }],
      abilities: [empower(3)],
    };
  if (c.collectorNumber === 86 || c.collectorNumber === 181)
    cardWave19Scripts[c.id] = { ...plain, abilities: [empower(0, 2, "Body")] };
}
export function uncounterable(s: GameState, p: PlayerId) {
  return textUnits(s).some(
    (u) => u.owner === p && u.empowered && isFace(u.cardId, "VEN", 69),
  );
}
export function gangplank(s: GameState, u: Unit, chosen: boolean) {
  return (
    chosen &&
    u.empowered &&
    textSources(s, u).some(
      (u) => isFace(u.cardId, "VEN", 86) || isFace(u.cardId, "VEN", 181),
    )
  );
}
export function changeMight(
  s: GameState,
  p: PlayerId,
  u: Unit,
  amount: number,
  chosen: boolean,
) {
  if (amount < 0 && chosen) {
    amount -= textUnits(s).filter(
      (u) => u.owner === p && u.empowered && isFace(u.cardId, "VEN", 69),
    ).length;
    if (gangplank(s, u, chosen)) amount = 3;
  }
  u.temporaryMight += amount;
}
export function lethal(s: GameState, u: Unit, might: number) {
  return (
    u.damage > 0 &&
    (u.damage >= might ||
      textUnits(s).some(
        (dragon) =>
          dragon.owner !== u.owner &&
          isFace(dragon.cardId, "UNL", 118) &&
          (u.damageByPlayer?.[dragon.owner] ?? 0) > 0,
      ))
  );
}
/** The same object is indexed by both types. Rehydrate aliases after JSON saves. */
export function syncHybridObjects(s: GameState) {
  s.gears = s.gears.filter(
    (g) =>
      !isCardType(getCard(g.cardId), "Unit") ||
      s.units.some((u) => u.id === g.id),
  );
  for (const u of s.units.filter((u) =>
    isCardType(getCard(u.cardId), "Gear"),
  )) {
    const index = s.gears.findIndex((g) => g.id === u.id);
    if (index < 0) s.gears.push(u);
    else s.gears[index] = u;
  }
}
export const cardWave19Module: ExpansionModule = {
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    if (name === "unitPlayed" && isFace(cardId, "VEN", 58)) {
      syncHybridObjects(s);
      if (s.gears.filter((g) => g.owner === p && g.id !== sourceId).length >= 3)
        ctx.trigger(s, p, cardId, sourceId!, [{ type: "draw" }], locationId);
    }
  },
};
