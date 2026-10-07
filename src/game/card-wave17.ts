import type { CardScript } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
import { isFace } from "./board-rules";
const plain: CardScript = { implemented: true };
export const cardWave17Scripts: Record<string, CardScript> = {
  "ogn-023-298": {
    ...plain,
    abilities: [
      {
        label: "Protect a friendly unit",
        discard: 1,
        exhaust: true,
        effects: [
          { type: "special", custom: "wave17:armory", target: "friendlyUnit" },
        ],
      },
    ],
  },
  "ogn-077-298": { ...plain, hidden: true },
  "ogn-269-298": plain,
  "sfd-051-221": {
    ...plain,
    equipCost: 1,
    gearMight: 1,
    equipment: {
      text: "If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me.",
    },
  },
  "sfd-173-221": { ...plain, keywords: ["Backline"] },
  "unl-007-219": {
    ...plain,
    action: true,
    spell: [
      { type: "special", custom: "wave17:smite", target: "unitAtBattlefield" },
      { type: "damage", amount: 3, target: "unitAtBattlefield" },
    ],
  },
  "unl-206-219": plain,
};
export const cardWave17Module: ExpansionModule = {
  event(s, name, p) {
    if (name === "conquer" && isFace(s.players[p].legendId, "OGN", 269))
      s.players[p].legendUsedTurn = -1;
  },
  effect(s, _p, e, ctx) {
    if (!e.custom?.startsWith("wave17:")) return false;
    const u = s.units.find((u) => u.id === ctx.targetId);
    if (u) {
      if (e.custom === "wave17:smite") u.banishOnDeathTurn = s.turn;
      else u.armoryTurn = s.turn;
    }
    return true;
  },
};
