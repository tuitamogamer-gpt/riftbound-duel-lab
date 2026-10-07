import { isCardType } from "../data/cards";
import { catalog, findCard } from "../catalog";
import { canonicalCardName } from "../data/card-identity";
import type { StarterDeck } from "../data/decks";
import { getRulesCardId, isImplemented } from "./scripts";

const seen = new Set<string>();
export const battlefieldChoices = catalog
  .filter((card) => {
    if (
      !isCardType(card, "Battlefield") ||
      card.variant ||
      card.set === "TOKEN" ||
      !isImplemented(card.id)
    )
      return false;
    const identity = canonicalCardName(card.name);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

/** Map alternate printings to the one selectable rules face. */
export function resolveBattlefieldChoice(cardId: string) {
  const rulesId = getRulesCardId(cardId);
  const card = findCard(rulesId) ?? findCard(cardId);
  if (!card || !isCardType(card, "Battlefield") || card.set === "TOKEN")
    return undefined;
  const name = canonicalCardName(card.name);
  return battlefieldChoices.find(
    (choice) =>
      choice.id === rulesId ||
      getRulesCardId(choice.id) === rulesId ||
      canonicalCardName(choice.name) === name,
  );
}

/** Preserve the supplied pool order, without duplicate printings or invalid cards. */
export function deckBattlefieldChoices(deck?: StarterDeck) {
  const ids = deck?.battlefieldIds?.length
    ? deck.battlefieldIds
    : deck?.battlefieldId
      ? [deck.battlefieldId]
      : [];
  const selected = new Set<string>();
  return ids.flatMap((id) => {
    const card = resolveBattlefieldChoice(id);
    if (!card || selected.has(card.id)) return [];
    selected.add(card.id);
    return [card];
  });
}

export function defaultBattlefield(deck?: StarterDeck) {
  return deckBattlefieldChoices(deck)[0]?.id ?? battlefieldChoices[0].id;
}
