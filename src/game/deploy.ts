import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { getScript } from "./scripts";
import { textUnits } from "./text-sources";
import type { GameState, Gear, LocationId, PlayerId } from "./types";

/** CR 830: [Deploy] is a characteristic of the card. */
export const hasDeploy = (cardId: string) =>
  Boolean(getScript(cardId)?.keywords?.includes("Deploy"));

/** Non-unit gear with [Deploy] at a battlefield (CR 830.1.b). */
export function deployedGear(
  s: GameState,
  location: LocationId,
  owner?: PlayerId,
): Gear[] {
  return s.gears.filter(
    (g) =>
      g.deployedAt === location &&
      !g.attachedTo &&
      (owner === undefined || g.owner === owner) &&
      !s.units.some((u) => u.id === g.id),
  );
}

/** Jarvan IV, Martial Paragon: "Your gear with [Deploy] have [Action]." */
export function deployGearHasAction(
  s: GameState,
  p: PlayerId,
  cardId: string,
): boolean {
  return (
    isCardType(getCard(cardId), "Gear") &&
    hasDeploy(cardId) &&
    textUnits(s).some((u) => u.owner === p && isFace(u.cardId, "RAD", 91))
  );
}

/** Bushwhack Trap: the controlling player may hide one more card here. */
export function extraHiddenSlots(
  s: GameState,
  location: LocationId,
  p: PlayerId,
): number {
  return deployedGear(s, location, p).filter((g) =>
    isFace(g.cardId, "RAD", 108),
  ).length;
}
