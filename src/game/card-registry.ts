import type { Card } from "../data/cards";
import { gameplayFingerprint } from "../data/card-identity";
import type { CardScript } from "./types";

export interface CardRegistration {
  cardId: string;
  rulesCardId: string;
  status: "scripted" | "compiled" | "alias" | "unsupported";
  script?: CardScript;
  reason?: string;
}

/** Every imported printing receives a record; only complete scripts are executable. */
export function buildCardRegistry(
  catalog: Card[],
  explicit: Record<string, CardScript>,
  compile: (card: Card) => CardScript | undefined,
): Record<string, CardRegistration> {
  const groups = new Map<string, Card[]>();
  const compiled = new Map<string, CardScript>();
  for (const card of catalog) {
    const key = gameplayFingerprint(card);
    groups.set(key, [...(groups.get(key) ?? []), card]);
    if (!explicit[card.id]) {
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
      const script = explicit[rulesCard.id] ?? compiled.get(rulesCard.id);
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
                card.type === "Gear" && /\[Equip\]/.test(card.text)
                  ? "Equipment needs its full printed effect and an explicit rules script."
                  : "Rules text requires an explicit effect implementation and behavior tests.",
            }),
      };
    }
  }
  return registry;
}
