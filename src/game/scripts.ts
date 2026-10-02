import { originsWave4Scripts } from "./origins-wave4";
import { vendettaWave4Scripts } from "./vendetta-wave4";
import { unleashedWave4Scripts } from "./unleashed-wave4";
import { vendettaWave3Scripts } from "./vendetta-wave3";
import { unleashedWave3Scripts } from "./unleashed-wave3";
import { originsWave3Scripts } from "./origins-wave3";
import { preconScripts } from "./precon-scripts";
import { unleashedScripts } from "./unleashed";
import { spiritforgedScripts } from "./spiritforged";
import { vendettaScripts } from "./vendetta";
import { originsExtraScripts } from "./origins-extra";
import { spiritforgedExtraScripts } from "./spiritforged-extra";
import { originsMoreScripts } from "./origins-more";
import { vendettaExtraScripts } from "./vendetta-extra";
import { unleashedExtraScripts } from "./unleashed-extra";
import { cards } from "../data/cards";
import { buildCardRegistry } from "./card-registry";
import { compileCardScript } from "./card-script-compiler";
import type { CardScript } from "./types";
const plain: CardScript = { implemented: true };
const action = (spell: CardScript["spell"]): CardScript => ({
  implemented: true,
  action: true,
  spell,
});
const reaction = (spell: CardScript["spell"]): CardScript => ({
  implemented: true,
  reaction: true,
  spell,
});
const map: Record<string, CardScript> = {
  "ogn-045-298": reaction([
    { type: "counter", target: "spell", maxEnergy: 4, maxPower: 1 },
  ]),
  "ogn-064-298": reaction([{ type: "counter", target: "spell" }]),
  "ogn-001-298": { ...plain, accelerating: true },
  "ogn-004-298": action([{ type: "assault", amount: 3, target: "anyUnit" }]),
  "ogn-005-298": action([
    {
      type: "damage",
      amount: 3,
      target: "unitAtBattlefield",
      condition: "drawOnKill",
    },
  ]),
  "ogn-009-298": action([
    { type: "damage", amount: 3, target: "unitAtBattlefield" },
  ]),
  "ogn-010-298": { ...plain, accelerating: true },
  "ogn-012-298": {
    ...plain,
    notes: "Legion cost discount is checked at payment.",
  },
  "ogn-013-298": { ...plain, deflect: 1, keywords: ["Deflect"] },
  "ogn-046-298": reaction([
    {
      type: "might",
      amount: 1,
      target: "friendlyUnit",
      condition: "aloneBonus",
    },
  ]),
  "ogn-049-298": plain,
  "ogn-050-298": action([{ type: "stun", target: "anyUnit" }]),
  "ogn-051-298": { ...plain, onPlay: [{ type: "stun", target: "anyUnit" }] },
  "ogn-052-298": { ...plain, shield: 1, keywords: ["Shield"] },
  "ogn-054-298": { ...plain, shield: 1, keywords: ["Shield", "Tank"] },
  "ogn-055-298": {
    ...plain,
    notes: "Solo attacker/defender bonus calculated dynamically.",
  },
  "ogn-058-298": reaction([
    { type: "might", amount: 2, target: "anyUnit" },
    { type: "draw", amount: 1 },
  ]),
  "ogn-085-298": action([
    { type: "damage", amount: 6, target: "unitAtBattlefield" },
  ]),
  "ogn-087-298": {
    ...plain,
    keywords: ["Tank"],
    onPlay: [{ type: "draw", amount: 1 }],
  },
  "ogn-088-298": plain,
  "ogn-096-298": { ...plain, onDeath: [{ type: "draw", amount: 1 }] },
  "ogn-103-298": {
    ...plain,
    notes: "Spell-play event gives temporary +1 Might.",
  },
  "ogn-114-298": { ...plain, spell: [{ type: "draw", amount: 4 }] },
  "ogn-125-298": {
    ...plain,
    notes: "Ganking while buffed, calculated dynamically.",
  },
  "ogn-128-298": action([{ type: "duel", target: "duel" }]),
  "ogn-130-298": {
    ...plain,
    onAttack: [{ type: "damage", amount: 1, target: "enemyUnitHere" }],
  },
  "ogn-132-298": { ...plain, onPlay: [{ type: "ready", target: "anyUnit" }] },
  "ogn-134-298": {
    ...plain,
    spell: [{ type: "channel", amount: 1, condition: "drawIfEmpty" }],
  },
  "ogn-136-298": {
    ...plain,
    onPlay: [{ type: "buff", target: "friendlyUnit" }],
  },
  "ogn-137-298": {
    ...plain,
    keywords: ["Tank"],
    onPlay: [{ type: "channel", amount: 1 }],
  },
  "ogn-139-298": {
    ...plain,
    notes: "Another friendly unit-play event gives buff.",
  },
  "ogn-142-298": plain,
  "ogn-154-298": action([{ type: "might", amount: 7, target: "anyUnit" }]),
  "ogn-175-298": plain,
  "ogn-176-298": {
    ...plain,
    notes: "Can play to an open battlefield, starting showdown.",
  },
  "ogn-191-298": {
    ...plain,
    keywords: ["Tank"],
    onPlay: [{ type: "moveTarget", target: "unitAtBattlefield" }],
  },
  "ogn-210-298": { ...plain, assault: 1, keywords: ["Assault"] },
  "ogn-211-298": {
    ...plain,
    onPlay: [{ type: "token", amount: 1, location: "here" }],
  },
  "ogn-215-298": { ...plain, assault: 1, keywords: ["Assault"] },
  "ogn-219-298": plain,
  "ogs-001-024": {
    ...plain,
    notes:
      "Annie bonus damage is applied to every friendly spell/ability instance.",
  },
  "ogs-002-024": {
    ...plain,
    spell: [
      { type: "damageAll", amount: 3, who: "opponent", target: "battlefield" },
    ],
  },
  "ogs-003-024": action([
    { type: "damage", amount: 2, target: "unitAtBattlefield" },
  ]),
  "ogs-005-024": { ...plain, shield: 1, keywords: ["Shield"] },
  "ogs-006-024": {
    ...plain,
    notes: "Spell-play cost >=5 event gives temporary +3 Might.",
  },
  "ogs-007-024": {
    ...plain,
    assault: 2,
    shield: 2,
    keywords: ["Assault 2", "Shield 2"],
  },
  "ogs-009-024": { ...plain, keywords: ["Ganking", "Enters ready"] },
  "ogs-012-024": action([{ type: "kill", target: "unitAtBattlefield" }]),
  "ogs-015-024": action([{ type: "token", amount: 4 }]),
  "ogs-016-024": { ...plain, keywords: ["Enters ready"] },
  "ogs-017-024": { ...plain, notes: "End-turn: ready two runes." },
  "ogs-018-024": {
    ...plain,
    onPlay: [
      {
        type: "damageAll",
        amount: 3,
        who: "all",
        location: "here",
        condition: "allBattlefields",
      },
    ],
  },
  "ogs-019-024": {
    ...plain,
    notes: "Solo defending friendly unit gets +2 Might dynamically.",
  },
  "ogs-021-024": { ...plain, notes: "Playing a spell costing >=5 draws 1." },
  "ogs-022-024": action([{ type: "damage", amount: 8, target: "anyUnit" }]),
  "ogs-023-024": { ...plain, notes: "Conquering with four units draws 2." },
  "ogs-024-024": action([{ type: "mightAll", amount: 2, who: "self" }]),
  "ogn-271-298": plain,
  "ogn-275-298": { ...plain, notes: "Holding creates a Recruit in base." },
  "ogn-280-298": { ...plain, notes: "Holding draws 1." },
};
Object.assign(
  map,
  preconScripts,
  spiritforgedScripts,
  unleashedScripts,
  vendettaScripts,
  originsExtraScripts,
  spiritforgedExtraScripts,
  originsMoreScripts,
  vendettaExtraScripts,
  originsWave3Scripts,
  unleashedWave3Scripts,
  vendettaWave3Scripts,
  originsWave4Scripts,
  vendettaWave4Scripts,
  unleashedWave4Scripts,
  unleashedExtraScripts,
);
map["token-tentacle"] = plain;
map["token-mech"] = plain;
map["token-sand-soldier"] = plain;
map["token-bird"] = { ...plain, deflect: 1, keywords: ["Deflect"] };
export const cardRegistry = buildCardRegistry(cards, map, compileCardScript);
Object.assign(
  map,
  Object.fromEntries(
    Object.values(cardRegistry)
      .filter((entry) => entry.script)
      .map((entry) => [entry.cardId, entry.script]),
  ),
);
export const scripts = map;
export const supportedCardIds = new Set(Object.keys(map));
export function getScript(cardId: string): CardScript | undefined {
  return Object.hasOwn(map, cardId) ? map[cardId] : undefined;
}
export function getRulesCardId(cardId: string): string {
  return cardRegistry[cardId]?.rulesCardId ?? cardId;
}
export function isImplemented(cardId: string): boolean {
  return supportedCardIds.has(cardId);
}
export const SCRIPTED_CARD_COUNT = supportedCardIds.size;
