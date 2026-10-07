import type { CardScript, Effect } from "./types";

// Attachment panels verified against official Riot images on 7 October 2026.
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
const hunt: Effect[] = [{ type: "special", custom: "unl:xp", amount: 1 }];
const cape: Effect[] = [
  {
    type: "damageAll",
    amount: 2,
    who: "opponent",
    condition: "liveSourceLocation",
  },
];

export const cardWave11Scripts: Record<string, CardScript> = {
  "sfd-056-221": gear(
    3,
    { text: "The equipped unit has +3 Might." },
    { reaction: true, onPlay: [{ type: "equip", target: "friendlyUnit" }] },
  ),
  "sfd-139-221": gear(
    2,
    { text: "The equipped unit has +2 Might." },
    {
      hidden: true,
      // The Hidden location restricts targets; the gear itself recalls to base.
      onPlay: [
        {
          type: "equip",
          target: "friendlyUnit",
          condition: "playedFromHidden",
        },
      ],
    },
  ),
  "sfd-190-221": gear(
    3,
    {
      text: "When I attack or defend, deal 2 to all enemy units here.",
      onAttack: cape,
      onDefend: cape,
    },
    { equipAnyPower: true },
  ),
  "sfd-192-221": gear(
    2,
    {
      text: "Your units here have Ganking.",
      nearbyKeywords: ["Ganking"],
    },
    {
      equipAnyPower: true,
      onPlay: [{ type: "special", custom: "sfd-extra:ready-all" }],
    },
  ),
  "unl-096-219": gear(2, {
    text: "Hunt (When I conquer or hold, gain 1 XP.)",
    keywords: ["Hunt"],
    onConquer: hunt,
    onHold: hunt,
  }),
  "unl-158-219": gear(
    2,
    { text: "The equipped unit has +2 Might." },
    { equipCost: 0, equipXP: 1, onPlay: hunt },
  ),
};
