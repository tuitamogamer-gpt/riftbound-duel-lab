import { getMight } from "./engine";
import { trainingComplete, trainingPublicPosition } from "./training";
import type { TrainingLessonId } from "./training";
import type { GameState } from "./types";

export interface TrainingStep {
  label: string;
  complete: boolean;
}
export interface TrainingGuidance {
  steps: TrainingStep[];
  hint: string;
  retry?: string;
  damage?: {
    cardId: string;
    might: number;
    damage: number;
    prevention: number;
    lethal: number;
    assigned: number;
  }[];
}

/** Explanations are limited to this player's public practice position. */
export function trainingGuidance(
  id: TrainingLessonId,
  game: GameState,
): TrainingGuidance {
  const view = trainingPublicPosition(game);
  const complete = trainingComplete(id, game);
  if (id === "deploy") {
    return {
      steps: [{ label: "Play the unit into your base", complete }],
      hint: "Select Playful Phantom in your hand and play it. Its paid cost and exhausted arrival are part of the normal rules.",
    };
  }
  if (id === "movement") {
    const bothMoved = ["practice-mover-a", "practice-mover-b"].every((id) =>
      view.units.some((unit) => unit.id === id && unit.location === "field:0"),
    );
    const selectedBoth = (view.pendingMove?.unitIds.length ?? 0) === 2;
    const oneMoved =
      !bothMoved &&
      view.units.some(
        (unit) => unit.owner === 0 && unit.location === "field:0",
      );
    return {
      steps: [
        {
          label: "Prepare a movement group",
          complete: !!view.pendingMove || bothMoved,
        },
        {
          label: "Include both ready units",
          complete: selectedBoth || bothMoved,
        },
        {
          label: "Confirm movement to the first battlefield",
          complete: bothMoved,
        },
        { label: "Pass the showdown and earn the conquest point", complete },
      ],
      hint: view.pendingMove
        ? selectedBoth
          ? "Both units are selected. Confirm movement; neither moves until you confirm."
          : "Your proposed group has one unit. Add the other unit before confirming."
        : bothMoved
          ? "Both units have arrived exhausted. Pass priority to settle the open showdown and earn the conquest point."
          : "Start movement with either ready unit. The first click prepares a group without moving it.",
      ...(oneMoved
        ? {
            retry:
              "Only one unit moved. Undo that move to add both allies before confirming the group.",
          }
        : {}),
    };
  }
  if (id === "reaction") {
    const counterPlayed =
      view.stack.some(
        (item) => item.player === 0 && item.cardId === "ogn-064-298",
      ) || view.players[0].discard.includes("ogn-064-298");
    const protectedUnit = view.units.find(
      (unit) => unit.id === "practice-protected",
    );
    const failed =
      !view.stack.length && (!protectedUnit || protectedUnit.damage > 0);
    return {
      steps: [
        {
          label: "Play Wind Wall targeting Hextech Ray",
          complete: counterPlayed,
        },
        {
          label: "Pass priority until the chain resolves",
          complete: counterPlayed && !view.stack.length,
        },
        { label: "Keep your unit undamaged", complete },
      ],
      hint: counterPlayed
        ? "Wind Wall is above Hextech Ray in the chain. Pass priority to let the counter resolve first."
        : "You have priority while Hextech Ray is pending. Answer with Wind Wall before passing.",
      ...(failed
        ? {
            retry:
              "Hextech Ray resolved without being countered. Undo the pass and answer it with Wind Wall.",
          }
        : {}),
    };
  }
  if (id === "hidden") {
    const revealed =
      !view.hidden?.some((card) => card.id === "practice-own-hidden") &&
      view.units.some(
        (unit) => unit.owner === 0 && unit.cardId === "ogn-097-298",
      );
    const targetChosen = view.units.some(
      (unit) =>
        unit.id === "practice-hidden-target" && unit.temporaryMight === -2,
    );
    return {
      steps: [
        { label: "Reveal your Hidden Blastcone Fae", complete: revealed },
        {
          label: "Choose the enemy at the same battlefield",
          complete: targetChosen,
        },
        { label: "Resolve the local trigger", complete },
      ],
      hint: view.pendingChoice
        ? "Choose the enemy sharing Blastcone Fae's battlefield. The distant enemy is outside this local trigger."
        : revealed
          ? "Your card is revealed. Pass any remaining priority to finish resolving its local trigger."
          : "Your Hidden card was placed on an earlier turn. Select it and reveal it at its own battlefield.",
    };
  }
  if (id === "damage") {
    const combat = view.combat;
    const damage = view.units
      .filter((unit) => unit.owner === 1 && unit.location === "field:0")
      .map((unit) => {
        const might = getMight(view, unit);
        const prevention = unit.preventDamage ?? 0;
        return {
          cardId: unit.cardId,
          might,
          damage: unit.damage,
          prevention,
          lethal: Math.max(0, might - unit.damage + prevention),
          assigned: combat?.assignments[0][unit.id] ?? 0,
        };
      });
    const assigned = combat
      ? Object.values(combat.assignments[0]).reduce(
          (sum, amount) => sum + amount,
          0,
        )
      : 0;
    return {
      steps: [
        {
          label: "Assign lethal damage to one defender",
          complete: assigned >= 2 || complete,
        },
        {
          label: "Assign the remaining damage to the other defender",
          complete: (combat?.remaining[0] ?? 0) === 0,
        },
        { label: "Resolve simultaneous combat damage", complete },
      ],
      hint: assigned
        ? "Assign your remaining damage to the other defender. Both sides deal their assigned damage together."
        : "You have 8 damage. The shielded defender needs 6; the wounded defender needs 2. Either legal order works.",
      damage,
    };
  }
  return {
    steps: [
      {
        label: "End your turn with battlefield control intact",
        complete: complete || view.turn > 5,
      },
      {
        label: "Hold the battlefield at the start of your next turn",
        complete,
      },
      { label: "Reach the winning eighth point", complete },
    ],
    hint: "You already have 7 points and control the first battlefield. End your turn; the practice opponent has no threats and ends theirs.",
  };
}
