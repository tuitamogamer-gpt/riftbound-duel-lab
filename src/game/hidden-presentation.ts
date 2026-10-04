import { getRulesCardId } from "./scripts";
import type { GameAction, GameState } from "./types";

export function hiddenCardStatus(
  game: GameState,
  hidden: NonNullable<GameState["hidden"]>[number],
  legal: GameAction[],
) {
  if (legal.some((a) => a.sourceId === `hidden:${hidden.id}`))
    return {
      ready: true,
      label: "Reveal now",
      hint: "Play this Hidden card as a Reaction. Its base cost is ignored; additional costs still apply.",
    };
  if (hidden.hiddenTurn >= game.turn)
    return {
      ready: false,
      label: "Next turn",
      hint: "This card was hidden this turn. It can be played starting next turn, including your opponent's turn.",
    };
  if (
    game.units.some(
      (u) =>
        u.owner !== hidden.owner &&
        u.location === hidden.location &&
        getRulesCardId(u.cardId) === "ogn-018-298",
    )
  )
    return {
      ready: false,
      label: "Blocked",
      hint: "Noxus Saboteur prevents revealing Hidden cards at this battlefield.",
    };
  if (
    game.priorityPlayer !== hidden.owner ||
    !["main", "showdown"].includes(game.phase)
  )
    return {
      ready: false,
      label: "Waiting",
      hint: "Waiting for your Action or Reaction window.",
    };
  return {
    ready: false,
    label: "Unavailable",
    hint: "No legal Hidden play now. Check targets at this battlefield and any additional costs or play restrictions.",
  };
}
