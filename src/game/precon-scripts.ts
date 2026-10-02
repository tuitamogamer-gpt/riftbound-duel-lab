import type { CardScript, Effect } from "./types";
const plain: CardScript = { implemented: true };
const a = (spell: Effect[], hidden = false): CardScript => ({
  ...plain,
  action: true,
  spell,
  hidden,
});
const r = (spell: Effect[], hidden = false): CardScript => ({
  ...plain,
  reaction: true,
  spell,
  hidden,
});
/** Explicit scripts for the historical Origins champion preconstructed decks. */
export const preconScripts: Record<string, CardScript> = {
  "ogs-010-024": {
    ...plain,
    onPlay: [{ type: "retrieve", condition: "spell" }],
  },
  "ogn-296-298": plain,
  "ogn-170-298": a([{ type: "retrieve", condition: "unit" }]),
  "ogn-171-298": { ...plain, onPlay: [{ type: "predict" }] },
  "ogs-011-024": r([{ type: "moveTarget", target: "upToTwoFriendlyUnits" }]),
  "ogn-174-298": { ...plain, onPlay: [{ type: "predict" }] },
  "ogs-014-024": {
    ...plain,
    abilities: [
      {
        label: "Add 2 energy for spells",
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "energy", amount: 2, condition: "spellsOnly" }],
      },
    ],
  },
  "ogn-288-298": {
    ...plain,
    onHold: [{ type: "special", custom: "optionalChannel" }],
  },
  "ogn-105-298": {
    ...plain,
    spell: [{ type: "damage", amount: 6, target: "upToTwoUnits" }],
  },
  "ogn-129-298": a([{ type: "special", custom: "confront" }, { type: "draw" }]),
  "ogn-131-298": {
    ...plain,
    onAttack: [{ type: "special", custom: "duneDrake" }],
  },
  "ogs-013-024": plain,
  "ogs-004-024": plain,
  "ogn-279-298": {
    ...plain,
    onDefend: [{ type: "special", custom: "combatShield", target: "anyUnit" }],
  },
  "ogn-048-298": r([{ type: "draw", amount: 1 }]),
  "ogn-127-298": r([
    { type: "damageAll", amount: 2, who: "opponent", condition: "combat" },
  ]),
  "ogs-020-024": r([
    { type: "special", custom: "highlander", target: "friendlyUnit" },
  ]),
  "ogs-008-024": a([
    { type: "might", amount: 3, target: "duel" },
    { type: "duel", target: "duel" },
  ]),
  "ogn-233-298": a([{ type: "mightAll", amount: 5, who: "self" }]),
  "ogn-043-298": {
    ...plain,
    spell: [
      {
        type: "moveTarget",
        target: "enemyUnit",
        condition: "chooseDestination",
      },
    ],
  },
  "ogn-053-298": a(
    [
      { type: "buff", target: "friendlyUnit" },
      { type: "buffBonus", amount: 1 },
    ],
    true,
  ),
  "ogn-135-298": { ...plain, hidden: true },
  "ogn-147-298": {
    ...plain,
    onPlay: [
      {
        type: "spendBuff",
        optional: true,
        effects: [
          { type: "buff", condition: "self" },
          { type: "ready", condition: "self" },
        ],
      },
    ],
  },
  "ogn-060-298": plain,
  "ogn-065-298": plain,
  "ogn-152-298": plain,
  "ogn-151-298": { ...plain, accelerating: true },
  "ogn-157-298": {
    ...plain,
    abilities: [
      {
        label: "Spend buff: deal 2",
        spendBuff: true,
        oncePerTurn: true,
        effects: [{ type: "damage", amount: 2, target: "unitAtBattlefield" }],
      },
      {
        label: "Spend buff: stun",
        spendBuff: true,
        oncePerTurn: true,
        effects: [{ type: "stun", target: "unitAtBattlefield" }],
      },
      {
        label: "Spend buff: ready Udyr",
        spendBuff: true,
        oncePerTurn: true,
        effects: [{ type: "ready", condition: "self" }],
      },
      {
        label: "Spend buff: Ganking",
        spendBuff: true,
        oncePerTurn: true,
        effects: [{ type: "keyword", keyword: "Ganking", condition: "self" }],
      },
    ],
  },
  "ogn-257-298": {
    ...plain,
    abilities: [
      {
        label: "Buff a friendly unit",
        energy: 1,
        exhaust: true,
        effects: [{ type: "buff", target: "friendlyUnit" }],
      },
    ],
  },
  "ogn-006-298": {
    ...plain,
    onDiscard: [{ type: "special", custom: "flameChompers" }],
  },
  "ogn-008-298": a([
    { type: "discard", amount: 1 },
    { type: "damage", target: "unitAtBattlefield", condition: "discardEnergy" },
  ]),
  "ogn-168-298": a([{ type: "moveTarget", target: "unitAtBattlefield" }], true),
  "ogn-169-298": r([
    { type: "bounce", target: "unitAtBattlefield", maxMight: 3 },
  ]),
  "ogn-165-298": {
    ...plain,
    onPlay: [{ type: "retrieve", condition: "unit" }],
  },
  "ogn-178-298": {
    ...plain,
    onDeath: [
      { type: "discard", amount: 2 },
      { type: "draw", amount: 2 },
    ],
  },
  "ogn-003-298": {
    ...plain,
    assault: 2,
    keywords: ["Assault 2"],
    onPlay: [{ type: "discard", amount: 1 }],
  },
  "ogn-002-298": plain,
  "ogn-011-298": plain,
  "ogn-024-298": a([
    { type: "damage", amount: 4, target: "unitAtBattlefield" },
    { type: "draw", amount: 1 },
  ]),
  "ogn-180-298": {
    ...plain,
    spell: [{ type: "temporary", target: "unitOrGear" }],
  },
  "ogn-185-298": {
    ...plain,
    onMove: [
      { type: "discard", amount: 1 },
      { type: "draw", amount: 1 },
    ],
  },
  "ogn-182-298": {
    ...plain,
    onPlay: [{ type: "draw", amount: 1 }],
    onDiscard: [{ type: "draw", amount: 1 }],
    onDeath: [{ type: "draw", amount: 1 }],
  },
  "ogn-019-298": plain,
  "ogn-036-298": {
    ...plain,
    keywords: ["Ganking"],
    abilities: [
      {
        label: "Recycle a card: +1 Might",
        recycleCost: 1,
        effects: [{ type: "might", amount: 1, condition: "self" }],
      },
    ],
  },
  "ogn-195-298": plain,
  "ogn-030-298": {
    ...plain,
    accelerating: true,
    assault: 2,
    keywords: ["Assault 2"],
    onPlay: [{ type: "discard", amount: 2 }],
  },
  "ogn-251-298": {
    ...plain,
    onBegin: [{ type: "draw", amount: 1, condition: "handAtMostOne" }],
  },
  "ogn-090-298": {
    ...plain,
    abilities: [
      {
        label: "-1 Might (minimum 1)",
        exhaust: true,
        effects: [
          { type: "might", amount: -1, minMight: 1, target: "anyUnit" },
        ],
      },
    ],
  },
  "ogn-209-298": { ...plain, spell: [{ type: "sacrifice", who: "all" }] },
  "ogn-213-298": a(
    [
      {
        type: "kill",
        target: "unitAtBattlefield",
        condition: "controllerDraw2",
      },
    ],
    true,
  ),
  "ogn-083-298": r([{ type: "draw", amount: 2 }], true),
  "ogn-093-298": r([
    { type: "might", amount: -4, minMight: 1, target: "anyUnit" },
  ]),
  "ogn-206-298": r([{ type: "might", amount: 2, target: "twoFriendlyUnits" }]),
  "ogn-094-298": a([{ type: "token", cardName: "Sprite", ready: true }], true),
  "ogn-216-298": { ...plain, onDeath: [{ type: "channel", amount: 1 }] },
  "ogn-095-298": r([
    { type: "might", amount: -1, minMight: 1, target: "anyUnit" },
    { type: "draw", amount: 1 },
  ]),
  "ogn-084-298": plain,
  "ogn-208-298": plain,
  "ogn-086-298": {
    ...plain,
    shield: 1,
    keywords: ["Shield", "Vision"],
    onPlay: [{ type: "predict" }],
  },
  "ogn-101-298": {
    ...plain,
    onBegin: [{ type: "draw", amount: 1, condition: "hiddenControlled" }],
  },
  "ogn-222-298": {
    ...plain,
    onMove: [{ type: "token", location: "here", condition: "atBattlefield" }],
  },
  "ogn-118-298": plain,
  "ogn-111-298": plain,
  "ogn-117-298": plain,
  "ogn-265-298": {
    ...plain,
    abilities: [
      {
        label: "Play a Recruit",
        energy: 1,
        exhaust: true,
        effects: [{ type: "token" }],
      },
    ],
  },
  "ogn-274-298": { ...plain, keywords: ["Temporary"] },
  "ogn-282-298": {
    ...plain,
    onConquer: [
      {
        type: "spendBuff",
        optional: true,
        effects: [{ type: "draw", amount: 1 }],
      },
    ],
  },
  "ogn-289-298": {
    ...plain,
    onConquer: [{ type: "special", custom: "targonsPeak" }],
  },
  "ogn-298-298": {
    ...plain,
    onConquer: [
      { type: "discard", amount: 1 },
      { type: "draw", amount: 1 },
    ],
  },
  "ogn-285-298": {
    ...plain,
    onDefend: [
      { type: "moveTarget", target: "friendlyUnitHere", optional: true },
    ],
  },
  "ogn-294-298": plain,
  "ogn-293-298": plain,
};
