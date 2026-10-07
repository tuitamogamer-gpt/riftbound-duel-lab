import type { GameState, Gear, PlayerId, Unit } from "./types";

/** `owner` is the historical engine field for controller. Zone changes use
 * physicalOwner instead, so control and copy effects never transfer ownership. */
export const physicalOwner = (o: {
  owner: PlayerId;
  originalOwner?: PlayerId;
}) => o.originalOwner ?? o.owner;
export const physicalCard = (o: { cardId: string; originalCardId?: string }) =>
  o.originalCardId ?? o.cardId;

export function control(s: GameState, o: Unit | Gear, player: PlayerId) {
  o.originalOwner ??= o.owner;
  o.owner = player;
  if ("location" in o && o.location.startsWith("base:"))
    o.location = `base:${player}`;
  if ("location" in o && o.location.startsWith("field:")) {
    const f = s.fields.find((f) => f.id === o.location);
    if (f && f.controller !== player && !s.stagedFields?.includes(f.id))
      (s.stagedFields ??= []).push(f.id);
  }
}

export function detach(s: GameState, gear: Gear) {
  const unit = s.units.find((u) => u.id === gear.attachedTo);
  if (unit) {
    unit.gear = unit.gear.filter((id) => id !== gear.id);
    unit.usedAbilities = unit.usedAbilities?.filter(
      (key) =>
        !key.startsWith(`${gear.id}:`) &&
        !key.startsWith(`aphelios:${gear.id}:`),
    );
    unit.grantedTags = unit.grantedTags?.filter((t) => t.sourceId !== gear.id);
    if (unit.copyEffects?.some((c) => c.sourceId === gear.id)) {
      unit.copyEffects = unit.copyEffects.filter((c) => c.sourceId !== gear.id);
      unit.cardId = unit.copyEffects.at(-1)?.cardId ?? unit.originalCardId!;
      unit.usedAbilities = [];
    }
  }
  delete gear.attachedTo;
  delete gear.copiedText;
  delete gear.copiedTokenTurn;
}

export function copyUnit(unit: Unit, cardId: string, sourceId: string) {
  unit.originalCardId ??= unit.cardId;
  (unit.copyEffects ??= []).push({ sourceId, cardId });
  unit.cardId = cardId;
  unit.usedAbilities = [];
}
