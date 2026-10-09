import { getRulesCardId, getScript } from "./scripts";
import type { GameAction, GameState } from "./types";

export type HiddenPlayMode = "hide" | "play";

function fromSelectedSource(action: GameAction, selected: string) {
  return (
    action.sourceId === selected ||
    (selected.startsWith("hand:") &&
      action.sourceId?.startsWith(`${selected}:`))
  );
}

/** Hiding is a separate decision from playing the same face at its normal cost. */
export function hiddenHandStatus(
  game: GameState,
  selected: string | null,
  legal: GameAction[],
) {
  if (!["main", "showdown"].includes(game.phase) || game.pendingChoice)
    return null;
  const cardId = selected?.startsWith("hand:")
    ? game.players[0].hand[Number(selected.slice(5))]
    : selected === "champion" && game.players[0].championAvailable
      ? game.players[0].championId
      : undefined;
  if (!cardId || !getScript(cardId)?.hidden || !selected) return null;

  const selectedActions = legal.filter((action) =>
    fromSelectedSource(action, selected),
  );
  const hideActions = selectedActions.filter((action) =>
    action.id.startsWith("hide:"),
  );
  const playActions = selectedActions.filter(
    (action) => !action.id.startsWith("hide:"),
  );
  const free = game.players[0].freeHideTurn === game.turn;
  const energyOnly =
    hideActions.length > 0 &&
    hideActions.every((action) => action.id.endsWith(":energy"));
  const costLabel = free
    ? "Hide · free"
    : energyOnly
      ? "Hide · 1 Energy"
      : "Hide · 1 Power";
  let hint = free
    ? "Hide for free. Reveal from next turn with no base cost."
    : energyOnly
      ? "Hide for 1 Energy with Teemo. Reveal from next turn with no base cost."
      : "Recycle any rune. From next turn, play with no base cost.";

  if (!hideActions.length) {
    const controlled = game.fields.filter((field) => field.controller === 0);
    if (game.winner !== null) hint = "The game has ended.";
    else if (game.currentPlayer !== 0)
      hint = "You can only hide cards on your own turn.";
    else if (game.priorityPlayer !== 0)
      hint = "Wait until you have priority to hide this card.";
    else if (game.stack.length)
      hint = "Wait for the chain to finish before hiding this card.";
    else if (!controlled.length)
      hint = "Control a battlefield before hiding a card there.";
    else if (
      controlled.every(
        (field) =>
          (game.hidden?.filter((entry) => entry.location === field.id).length ??
            0) >= (field.cardId === "ogn-278-298" ? 2 : 1),
      )
    )
      hint = "Your controlled battlefields have no empty Hidden slots.";
    else if (getRulesCardId(game.players[0].legendId) === "ogn-263-298")
      hint = "Hiding needs 1 Power (recycle a rune) or Teemo's 1 Energy.";
    else hint = "Hiding needs 1 Power: recycle a ready or exhausted rune.";
  }
  return { hideActions, playActions, hint, costLabel };
}

/** Only the selected Hidden source changes; reactions and other sources stay legal. */
export function filterHiddenPlayMode(
  game: GameState,
  legal: GameAction[],
  selected: string | null,
  mode: HiddenPlayMode,
) {
  if (!selected || !hiddenHandStatus(game, selected, legal)) return legal;
  return legal.filter(
    (action) =>
      !fromSelectedSource(action, selected) ||
      action.id.startsWith("hide:") === (mode === "hide"),
  );
}

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
