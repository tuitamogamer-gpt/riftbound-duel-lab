import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import type { CardScript, Effect, GameState, PlayerId } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
export const cardWave23Scripts: Record<string, CardScript> = {
  "sfd-141-221": plain,
  "sfd-149-221": {
    ...plain,
    onPlay: [{ type: "discard" }, { type: "draw", amount: 2 }],
  },
  "sfd-078-221": {
    ...plain,
    abilities: [
      {
        label: "Give the next spell Repeat",
        power: 1,
        exhaust: true,
        effects: [{ type: "special", custom: "wave23:repeat" }],
      },
    ],
  },
  "unl-146-219": plain,
  "unl-216-219": {
    ...plain,
    onHold: [{ type: "special", custom: "wave23:repeat" }],
  },
};
for (const c of cards.filter(
  (c) => c.set === "VEN" && c.collectorNumber === 163,
))
  cardWave23Scripts[c.id] = plain;
export type RepeatPrice = NonNullable<CardScript["repeat"]>;
export function repeatPrices(
  s: GameState,
  p: PlayerId,
  cardId: string,
  script?: CardScript,
): RepeatPrice[] {
  const c = getCard(cardId);
  if (c.type !== "Spell") return [];
  const out: RepeatPrice[] = [
    ...(script?.repeat ? [script.repeat] : []),
    ...(script?.repeatCosts ?? []),
  ];
  for (const grant of s.players[p].repeatGrants ?? [])
    if (grant.turn === s.turn)
      out.push({
        energy: c.energy ?? 0,
        power: c.power ?? 0,
        domain: c.domains[0],
      });
  for (const u of textUnits(s))
    if (
      u.owner === p &&
      isFace(u.cardId, "UNL", 146) &&
      s.combat?.fieldId === u.location
    )
      out.push({ energy: 2, power: 1, domain: "Chaos" });
  const reduction = s.fields.filter(
    (f) => f.controller === p && isFace(f.cardId, "SFD", 211),
  ).length;
  return out.map((x) => ({
    ...x,
    energy: Math.max(0, (x.energy ?? 0) - reduction),
  }));
}
export const optionalDiscounts = (s: GameState, p: PlayerId) =>
  textUnits(s).filter((u) => u.owner === p && isFace(u.cardId, "SFD", 149))
    .length;
export const ireliaDiscounts = (s: GameState, p: PlayerId, target?: string) =>
  textUnits(s).filter(
    (u) =>
      u.owner === p &&
      isFace(u.cardId, "SFD", 141) &&
      (target ?? "").split("~").includes(u.id),
  ).length;
export const cardWave23Module: ExpansionModule = {
  effect(s, p, e) {
    if (e.custom !== "wave23:repeat") return false;
    (s.players[p].repeatGrants ??= []).push({ turn: s.turn });
    return true;
  },
  event(s, name, p, cardId) {
    if (name === "cardFinalized" && getCard(cardId).type === "Spell")
      s.players[p].repeatGrants = [];
  },
};
