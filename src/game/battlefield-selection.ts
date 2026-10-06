import { catalog, findCard } from "../catalog";
import type { StarterDeck } from "../data/decks";
import { getRulesCardId, isImplemented } from "./scripts";

const seen = new Set<string>();
export const battlefieldChoices = catalog
  .filter((card) => {
    if (card.type !== "Battlefield" || card.variant || !isImplemented(card.id))
      return false;
    const identity = card.name;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function defaultBattlefield(deck?: StarterDeck) {
  const id = getRulesCardId(
    deck?.battlefieldIds?.[0] ??
      deck?.battlefieldId ??
      battlefieldChoices[0].id,
  );
  return (
    battlefieldChoices.find(
      (card) => card.id === id || card.name === findCard(id)?.name,
    )?.id ?? id
  );
}
