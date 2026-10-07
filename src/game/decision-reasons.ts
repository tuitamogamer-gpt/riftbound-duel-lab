import { getCombatPreview, iterateLegalActions } from "./engine";
import { selectedCardId } from "./flow";
import { getScript } from "./scripts";
import type { GameAction, GameState, PlayerId } from "./types";

/** Assignment arithmetic is public. Lethal assignment is not a promise about
 * defeat: replacement abilities and later effects still resolve in the engine.
 */
export function damageAssignmentSummary(game: GameState, player: PlayerId = 0) {
  const preview = getCombatPreview(game);
  if (!preview || preview.stage !== "assign") return null;
  return {
    remaining: preview.remaining[player],
    assigned: preview.total[player] - preview.remaining[player],
    lethal: preview.units.filter(
      (entry) =>
        entry.unit.owner !== player &&
        entry.incoming > 0 &&
        entry.incoming >= entry.lethalAt,
    ).length,
  };
}

function matchesSource(action: GameAction, selected: string) {
  return (
    action.sourceId === selected ||
    (selected.startsWith("hand:") &&
      action.sourceId?.startsWith(`${selected}:jayce:`))
  );
}

/** Diagnose a player's selected source through the same legal-action oracle as play.
 * Resource probes change only the player's pools and never apply an action or read
 * an opponent's private card names. Printed prices are not reliable with discounts.
 */
export function decisionReason(
  game: GameState,
  legal: GameAction[],
  selected: string | null,
  target: string | null = null,
): string | null {
  if (!selected || game.winner !== null) return null;
  if (game.priorityPlayer !== 0) return "Wait until you have priority.";
  const ownActions = legal.filter((action) => matchesSource(action, selected));
  if (ownActions.length) {
    if (
      target &&
      !ownActions.some(
        (action) =>
          action.targetId === target ||
          (!action.targetId && action.locationId === target),
      )
    )
      return "Choose a highlighted target or destination for this card.";
    return null;
  }
  if (game.pendingChoice)
    return "Finish the current choice before playing another card.";
  if (game.phase === "move")
    return "Confirm or cancel movement before playing another card.";
  if (game.phase === "damage")
    return "Finish damage assignment before playing another card.";

  // A bounded universal pool tests payment without duplicating any expansion's
  // cost, target-tax, discount, or restricted-resource rules.
  const payableWith = (energy: boolean, power: boolean) => {
    const probe: GameState = {
      ...game,
      players: game.players.map((player) =>
        player.id === 0
          ? {
              ...player,
              energy: player.energy + (energy ? 64 : 0),
              power: (player.power ?? 0) + (power ? 64 : 0),
            }
          : player,
      ) as GameState["players"],
    };
    for (const action of iterateLegalActions(probe, 0))
      if (matchesSource(action, selected)) return true;
    return false;
  };
  if (payableWith(true, false))
    return "More Energy is required for an available play.";
  if (payableWith(false, true))
    return "More Power or a matching domain is required for an available play.";
  if (payableWith(true, true))
    return "More Energy and Power are required for an available play.";

  const unit = game.units.find(
    (entry) => entry.owner === 0 && entry.id === selected,
  );
  if (unit && !unit.ready)
    return "This unit is exhausted. It readies at the start of your turn.";
  if (selected.startsWith("hand:") || selected === "champion") {
    const script = getScript(selectedCardId(game, selected) ?? "");
    if (game.stack.length && !script?.reaction)
      return "Only Reactions can be played while an effect is on the chain.";
    if (game.phase === "showdown" && !script?.action && !script?.reaction)
      return "This card must wait for your main phase.";
  }
  return "This card has no legal target, destination or available effect in this position.";
}
