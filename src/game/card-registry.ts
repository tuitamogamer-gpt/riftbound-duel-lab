import type { Card } from "../data/cards";
import { canonicalCardName, gameplayFingerprint } from "../data/card-identity";
import type { CardScript } from "./types";

export interface CardRegistration {
  cardId: string;
  rulesCardId: string;
  status: "scripted" | "compiled" | "alias" | "unsupported";
  script?: CardScript;
  reason?: string;
}

function unsupportedRulesReason(card: Card): string | undefined {
  // The Vendetta FAQ makes this both Unit and Gear, despite the provider's
  // single-type record. A keyword-only script cannot implement that rules face.
  // https://playriftbound.com/en-us/news/rules-and-releases/vendetta-rules-faq-and-clarifications/
  if (canonicalCardName(card.name) === "patched porobot")
    return "Patched Porobot is both Unit and Gear; its hybrid card type requires full engine support.";
  return undefined;
}

/** Every imported printing receives a record; only complete scripts are executable. */
export function buildCardRegistry(
  catalog: Card[],
  explicit: Record<string, CardScript>,
  compile: (card: Card) => CardScript | undefined,
  reviewedAliases: Record<string, string> = {},
): Record<string, CardRegistration> {
  const groups = new Map<string, Card[]>();
  const compiled = new Map<string, CardScript>();
  for (const card of catalog) {
    const key = gameplayFingerprint(card);
    groups.set(key, [...(groups.get(key) ?? []), card]);
    if (!unsupportedRulesReason(card) && !explicit[card.id]) {
      const script = compile(card);
      if (script) compiled.set(card.id, script);
    }
  }
  const registry: Record<string, CardRegistration> = {};
  for (const group of groups.values()) {
    const source = [...group].sort(
      (a, b) =>
        Number(Boolean(explicit[b.id])) - Number(Boolean(explicit[a.id])) ||
        Number(compiled.has(b.id)) - Number(compiled.has(a.id)) ||
        Number(a.variant) - Number(b.variant) ||
        a.id.localeCompare(b.id),
    )[0];
    for (const card of group) {
      // Explicit scripts can contain exact-ID engine hooks. Preserve their identity.
      const rulesCard = explicit[card.id] ? card : source;
      const blockedReason =
        unsupportedRulesReason(card) ?? unsupportedRulesReason(rulesCard);
      const script = blockedReason
        ? undefined
        : (explicit[rulesCard.id] ?? compiled.get(rulesCard.id));
      registry[card.id] = {
        cardId: card.id,
        rulesCardId: rulesCard.id,
        status: !script
          ? "unsupported"
          : rulesCard.id !== card.id
            ? "alias"
            : explicit[card.id]
              ? "scripted"
              : "compiled",
        ...(script
          ? { script }
          : {
              reason:
                blockedReason ??
                (card.type === "Gear" && /\[Equip\]/.test(card.text)
                  ? "Equipment needs its full printed effect and an explicit rules script."
                  : "Rules text requires an explicit effect implementation and behavior tests."),
            }),
      };
    }
  }
  for (const [cardId, rulesCardId] of Object.entries(reviewedAliases)) {
    const source = registry[rulesCardId];
    const entry = registry[cardId];
    const card = catalog.find((card) => card.id === cardId);
    if (
      !entry?.script &&
      source?.script &&
      card &&
      !unsupportedRulesReason(card)
    )
      registry[cardId] = {
        cardId,
        rulesCardId: source.rulesCardId,
        status: "alias",
        script: source.script,
      };
  }
  return registry;
}
