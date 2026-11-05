import type { CardScript, Effect } from "./types";

/**
 * First reviewed Radiance rules wave. Each face below uses only behavior the
 * engine already implements; its complete printed text was checked against the
 * Hextech record and the official Riot gallery on 5 November 2026.
 *
 * Radiance printings stay reference-only unless their exact ID is listed in
 * `reviewedRadiancePrintings`. Equivalent printings are not promoted
 * automatically, so a new alternate art needs its own review.
 */
const plain: CardScript = { implemented: true };
/** [Disarm N]: When I attack, give an enemy unit here -N Might this turn. */
const disarm = (amount = 1): Effect => ({
  type: "might",
  amount: -amount,
  target: "enemyUnitHere",
});
const kSanteCourageous: CardScript = {
  ...plain,
  accelerating: true,
  shield: 2,
  keywords: ["Shield 2"],
  // "Channel 1 rune" without "exhausted" channels it ready.
  onHold: [{ type: "channel", amount: 1, ready: true }],
};

export const radianceWave1Scripts: Record<string, CardScript> = {
  // Basic runes. Hextech omits the Basic supertype; the faces have no text.
  "rad-r01": plain,
  "rad-r02": plain,
  "rad-r03": plain,
  "rad-r04": plain,
  "rad-r05": plain,
  "rad-r06": plain,
  // Bilgewater Tracker: When you play me, deal 1 to each of up to 2 units.
  "rad-003-167": {
    ...plain,
    onPlay: [{ type: "damage", amount: 1, target: "upToTwoUnits" }],
  },
  // War Scout: [Accelerate]. When you play me, give a unit +2 Might this turn.
  "rad-008-167": {
    ...plain,
    accelerating: true,
    onPlay: [{ type: "might", amount: 2, target: "anyUnit" }],
  },
  // Antagonistic Apparatus: I enter ready. Play a ready 3 Might Mech here.
  "rad-009-167": {
    ...plain,
    keywords: ["Enters ready"],
    onPlay: [
      {
        type: "token",
        amount: 1,
        cardName: "Mech",
        ready: true,
        location: "here",
      },
    ],
  },
  // Lost to the Sands: [Action] Choose one — 4 to a unit at a battlefield / kill a gear.
  "rad-013-167": {
    ...plain,
    action: true,
    spellModes: [
      {
        label: "Deal 4 to a unit at a battlefield",
        effects: [{ type: "damage", amount: 4, target: "unitAtBattlefield" }],
      },
      { label: "Kill a gear", effects: [{ type: "kill", target: "anyGear" }] },
    ],
  },
  // Consult the Heavens: [Reaction] Give a unit [Shield 2] this turn. [Predict].
  "rad-025-167": {
    ...plain,
    reaction: true,
    spell: [
      { type: "keyword", keyword: "Shield 2", target: "anyUnit" },
      { type: "predict" },
    ],
  },
  // Industrious Mechsmith: When you play me, play a 3 Might Mech here.
  "rad-049-167": {
    ...plain,
    onPlay: [{ type: "token", amount: 1, cardName: "Mech", location: "here" }],
  },
  // Trinket Peddler: [Disarm].
  "rad-054-167": { ...plain, keywords: ["Disarm"], onAttack: [disarm()] },
  // Riptide Mage: [Accelerate]. When you play me, give an enemy unit -3 Might.
  "rad-058-167": {
    ...plain,
    accelerating: true,
    onPlay: [{ type: "might", amount: -3, target: "enemyUnit" }],
  },
  // Supernova: Deal 10 to a unit. Draw 2.
  "rad-059-167": {
    ...plain,
    spell: [
      { type: "damage", amount: 10, target: "anyUnit" },
      { type: "draw", amount: 2 },
    ],
  },
  // Sneaky Zeebles: When I conquer, [Add] one Power of any domain.
  "rad-076-167": { ...plain, onConquer: [{ type: "power", amount: 1 }] },
  // Wrath of the Freljord: I enter ready. [Shield 3].
  "rad-077-167": {
    ...plain,
    shield: 3,
    keywords: ["Enters ready", "Shield 3"],
  },
  // Avalanche: Deal 3 to all units in bases.
  "rad-079-167": {
    ...plain,
    spell: [
      { type: "damageAll", amount: 3, who: "all", condition: "allBases" },
    ],
  },
  // K'Sante, Courageous and both showcase printings.
  "rad-086-167": kSanteCourageous,
  "rad-086a-167": kSanteCourageous,
  "rad-178-167": kSanteCourageous,
  // Staunch Survivor: [Assault 2], [Shield 2].
  "rad-088-167": {
    ...plain,
    assault: 2,
    shield: 2,
    keywords: ["Assault 2", "Shield 2"],
  },
  // Siren of the Shallows: [Disarm], [Ganking].
  "rad-097-167": {
    ...plain,
    keywords: ["Disarm", "Ganking"],
    onAttack: [disarm()],
  },
  // Suave Negotiator: You and the chosen opponent each draw 1.
  "rad-099-167": {
    ...plain,
    onPlay: [
      { type: "draw", amount: 1 },
      { type: "draw", amount: 1, who: "opponent" },
    ],
  },
  // Pitiless Stalker: Exhaust: [Stun] an enemy unit.
  "rad-104-167": {
    ...plain,
    abilities: [
      {
        label: "[Stun] an enemy unit.",
        exhaust: true,
        effects: [{ type: "stun", target: "enemyUnit" }],
      },
    ],
  },
  // Hunting Dog: [Deathknell] Play a 1 Might Bird token with [Deflect] to your base.
  "rad-119-167": {
    ...plain,
    keywords: ["Deathknell"],
    onDeath: [{ type: "token", amount: 1, cardName: "Bird", location: "base" }],
  },
  // Raucous Anthem: Ready your units and give them +3 Might this turn.
  "rad-134-167": {
    ...plain,
    spell: [
      { type: "special", custom: "sfd-extra:ready-all" },
      { type: "mightAll", amount: 3, who: "self" },
    ],
  },
};

/** Runes whose alternate printing shares the reviewed blank face. */
const reviewedRuneVariants = [
  "rad-r01a",
  "rad-r02a",
  "rad-r03a",
  "rad-r04a",
  "rad-r05a",
  "rad-r06a",
];

/** Exact printing IDs reviewed for play. Everything else stays reference-only. */
export const reviewedRadiancePrintings: readonly string[] = [
  ...Object.keys(radianceWave1Scripts),
  ...reviewedRuneVariants,
].sort();
