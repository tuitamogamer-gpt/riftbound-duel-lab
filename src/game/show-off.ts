import { getCard, isCardType, type Card } from "../data/cards";
import { getScript } from "./scripts";
import type {
  CardScript,
  Effect,
  GameState,
  PlayerId,
  ShownInfo,
  Unit,
} from "./types";

type ShowOff = NonNullable<CardScript["showOff"]>;

function matches(card: Card, kind: ShowOff["kind"]) {
  switch (kind) {
    case "mech":
      return card.tags.includes("Mech");
    case "gear":
      return isCardType(card, "Gear");
    case "unit":
      return isCardType(card, "Unit");
    case "hidden":
      return (
        Boolean(getScript(card.id)?.hidden) || /\[Hidden\]/.test(card.text)
      );
    case "cost7":
      return (card.energy ?? 0) >= 7;
    case "card":
      return true;
  }
}

/**
 * Core Rules 832 (Show Off): reveal a matching card from hand, or pick a
 * friendly matching object on the board. Facedown cards have no front-side
 * characteristics and cannot be shown off. One option is offered for each
 * distinct value the effect can use.
 */
export function showOffCandidates(
  s: GameState,
  p: PlayerId,
  playedSource: string | undefined,
  req: ShowOff,
  might: (u: Unit) => number,
): (ShownInfo & { ref: string })[] {
  const out: (ShownInfo & { ref: string })[] = [];
  s.players[p].hand.forEach((cardId, i) => {
    if (playedSource === `hand:${i}`) return;
    const card = getCard(cardId);
    if (matches(card, req.kind))
      out.push({
        ref: `hand:${i}`,
        cardId,
        energy: card.energy ?? 0,
        power: card.power ?? 0,
        might: card.might ?? 0,
      });
  });
  for (const u of s.units.filter((u) => u.owner === p)) {
    const card = getCard(u.cardId);
    if (matches(card, req.kind))
      out.push({
        ref: u.id,
        cardId: u.cardId,
        energy: card.energy ?? 0,
        power: card.power ?? 0,
        might: might(u),
      });
  }
  for (const g of s.gears.filter(
    (g) => g.owner === p && !s.units.some((u) => u.id === g.id),
  )) {
    const card = getCard(g.cardId);
    if (matches(card, req.kind))
      out.push({
        ref: g.id,
        cardId: g.cardId,
        energy: card.energy ?? 0,
        power: card.power ?? 0,
        might: 0,
      });
  }
  const seen = new Set<number | string>();
  return out.filter((info) => {
    const key = req.value ? info[req.value] : "any";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Attach locked-in Show Off information to every effect of the play. */
export function withShown(effects: Effect[], shown?: ShownInfo): Effect[] {
  if (!shown) return effects;
  const info: ShownInfo = {
    cardId: shown.cardId,
    energy: shown.energy,
    power: shown.power,
    might: shown.might,
  };
  return effects.map((e) => ({
    ...e,
    shown: info,
    ...(e.effects ? { effects: withShown(e.effects, info) } : {}),
    ...(e.modes
      ? {
          modes: e.modes.map((m) => ({
            ...m,
            effects: withShown(m.effects, info),
          })),
        }
      : {}),
  }));
}
