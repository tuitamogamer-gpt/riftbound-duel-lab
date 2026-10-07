import type { CardScript } from "./types";

// Attachment panels checked against the original Riot images, 7 October 2026.
// The provider's text omits these panels; preserve it and record the full rules here.
const gear = (
  gearMight: number,
  equipment: NonNullable<CardScript["equipment"]>,
  extra: Partial<CardScript> = {},
): CardScript => ({
  implemented: true,
  gearMight,
  equipCost: 1,
  equipment,
  ...extra,
});
const gold = (amount: number) => [
  {
    type: "token" as const,
    cardName: "Gold",
    amount,
    location: "base" as const,
  },
];
const bow = [
  { type: "damage" as const, amount: 2, target: "enemyUnitHere" as const },
];
const quickDraw: Partial<CardScript> = {
  reaction: true,
  onPlay: [{ type: "equip", target: "friendlyUnit" }],
};

export const cardWave10Scripts: Record<string, CardScript> = {
  "sfd-016-221": gear(0, {
    text: "When I attack or defend, deal 2 to an enemy unit here.",
    onAttack: bow,
    onDefend: bow,
  }),
  "sfd-033-221": gear(1, { text: "[Tank]", keywords: ["Tank"] }),
  "sfd-042-221": gear(1, {
    text: "If this was attached to me this turn, I have an additional +2 Might.",
    attachedTurnMight: 2,
  }),
  "sfd-064-221": gear(
    0,
    { text: "[Shield 2]", keywords: ["Shield 2"], shield: 2 },
    quickDraw,
  ),
  "sfd-086-221": gear(2, {
    text: "When I hold, play two Gold gear tokens exhausted.",
    onHold: gold(2),
  }),
  "sfd-102-221": gear(1, { text: "[Deflect]", keywords: ["Deflect"] }),
  "sfd-115-221": gear(2, {
    text: "When I hold, score 1 point.",
    onHold: [{ type: "score", amount: 1 }],
  }),
  "sfd-118-221": gear(
    2,
    {
      text: "When I conquer, channel 1 rune exhausted.",
      onConquer: [{ type: "channel", amount: 1 }],
    },
    { equipEnergy: 1 },
  ),
  "sfd-124-221": gear(1, {
    text: "When I conquer, discard 1, then draw 1.",
    onConquer: [
      { type: "discard", amount: 1 },
      { type: "draw", amount: 1 },
    ],
  }),
  "sfd-133-221": gear(2, { text: "[Ganking]", keywords: ["Ganking"] }),
  "sfd-134-221": gear(1, {
    text: "When I conquer, play a Gold gear token exhausted.",
    onConquer: gold(1),
  }),
  "sfd-153-221": gear(0, {
    text: "When I move, play a 1 Might Recruit unit token here.",
    onMove: [
      {
        type: "token",
        cardName: "Recruit",
        amount: 1,
        location: "here",
        condition: "liveSourceLocation",
      },
    ],
  }),
  "sfd-186-221": gear(
    3,
    { text: "The equipped unit has +3 Might." },
    {
      ...quickDraw,
      equipAnyPower: true,
      keywords: ["Temporary"],
    },
  ),
};
