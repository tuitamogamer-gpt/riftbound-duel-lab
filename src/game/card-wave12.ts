import type { CardScript } from "./types";

/** Additional board costs are selected and paid before the response window. */
const spendBuff: CardScript["additionalCost"] = {
  board: { kind: "spendBuff" },
  ignoreBaseCost: true,
};
export const cardWave12Scripts: Record<string, CardScript> = {
  "ogn-146-298": {
    implemented: true,
    action: true,
    additionalCost: spendBuff,
    spell: [{ type: "ready", target: "anyUnit" }],
  },
  "ogn-207-298": {
    implemented: true,
    reaction: true,
    additionalCost: spendBuff,
    spell: [{ type: "might", amount: 3, target: "anyUnit" }],
  },
  "sfd-044-221": {
    implemented: true,
    additionalCost: { required: true, board: { kind: "returnGear" } },
  },
  "sfd-160-221": {
    implemented: true,
    additionalCost: { board: { kind: "killGear" } },
    onPlay: [
      { type: "kill", target: "anyGear", condition: "paidAdditionalCost" },
    ],
  },
  "unl-173-219": {
    implemented: true,
    reaction: true,
    additionalCost: {
      required: true,
      board: { kind: "killUnit", minMight: 5 },
    },
    spell: [
      { type: "draw", amount: 2 },
      { type: "channel", amount: 1 },
    ],
  },
};
