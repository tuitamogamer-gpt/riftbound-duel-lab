import { findCard, type CatalogCard } from "../catalog";
import type { GameAction, GameState, PlayerId } from "./types";
import { readableText } from "../data/cards";

/** The timing reminder is already conveyed by the window; lead with the effect. */
export function cardEffectSummary(text: string) {
  return readableText(text).replace(
    /^(?:\[(?:Reaction|Action|Hidden)\]\s*(?:\([^)]*\)\s*)?)+/i,
    "",
  );
}

export type ActionTargetView = {
  id: string;
  card: CatalogCard;
  owner?: PlayerId;
  location: string;
};

function locationLabel(location: string | undefined) {
  return location === "base:0"
    ? "Tvoja baza"
    : location === "base:1"
      ? "Protivnička baza"
      : location === "field:0"
        ? "Lijevo bojište"
        : location === "field:1"
          ? "Desno bojište"
          : location === "field:2"
            ? "Treće bojište"
            : "";
}

/** Only public objects are resolved; a private card ID is never a target face. */
export function publicActionTargets(
  game: GameState,
  action: Pick<GameAction, "targetId" | "repeatedTargetId">,
): ActionTargetView[] {
  const ids = [
    ...new Set(
      [action.targetId, action.repeatedTargetId]
        .filter((id): id is string => Boolean(id))
        .flatMap((id) => id.split("~")),
    ),
  ];
  return ids.flatMap((id) => {
    const unit = game.units.find((item) => item.id === id);
    const gear = game.gears.find((item) => item.id === id);
    const stack = game.stack.find((item) => item.id === id);
    const field = game.fields.find((item) => item.id === id);
    const card = findCard(
      unit?.cardId ?? gear?.cardId ?? stack?.cardId ?? field?.cardId,
    );
    if (!card) return [];
    const owner = unit?.owner ?? gear?.owner ?? stack?.player;
    const location =
      unit?.location ??
      (gear
        ? (game.units.find((item) => item.id === gear.attachedTo)?.location ??
          `base:${gear.owner}`)
        : field?.id);
    return [{ id, card, owner, location: locationLabel(location) }];
  });
}
