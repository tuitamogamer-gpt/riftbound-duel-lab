import { getAbilities } from "./engine";
import { draftEffects } from "./effect-drafts";
import { getScript } from "./scripts";
import type { Effect, GameAction, GameState } from "./types";

/** Deliberately conservative: unknown and mixed effects keep their legal targets. */
function benefitsUnit(effect: Effect): boolean {
  if (effect.effects?.length || effect.modes?.length) return false;
  switch (effect.type) {
    case "buff":
    case "ready":
      return true;
    case "heal":
    case "assault":
      return (effect.amount ?? 1) > 0;
    case "might":
      return (effect.amount ?? 1) > 0 && effect.minMight === undefined;
    case "keyword":
      return /^(Ganking|Tank|Backline|Assault(?: \d+)?|Shield(?: \d+)?|Deflect(?: \d+)?)$/.test(
        effect.keyword ?? "",
      );
    case "special":
      return (
        [
          "ogn-extra:block",
          "ven:barrier",
          "ven:shroud",
          "ven-wave4:dominus",
        ].includes(effect.custom ?? "") ||
        (effect.custom === "ven-wave4:sanction" && (effect.amount ?? 0) > 0)
      );
    default:
      return false;
  }
}

function pureBuff(effects: Effect[]): boolean {
  return (
    effects.some(
      (effect) =>
        (effect.target || effect.chosenTargetId) && benefitsUnit(effect),
    ) &&
    effects.every(
      (effect) =>
        benefitsUnit(effect) ||
        (!effect.target &&
          !effect.effects?.length &&
          !effect.modes?.length &&
          ["draw", "channel", "energy", "power", "readyRunes"].includes(
            effect.type,
          )),
    )
  );
}

function actionEffects(game: GameState, action: GameAction): Effect[] {
  if (action.effects) return action.effects;
  const choice = game.phase === "choice" ? game.pendingChoice : null;
  if (choice?.kind === "effectDraft" && choice.effectDraft)
    return draftEffects(choice.effectDraft);
  if (choice?.kind === "boardTargets") {
    const selection = choice.boardSelection;
    return (
      selection?.action?.effects ??
      selection?.trigger?.effects ??
      (selection?.action?.cardId
        ? getScript(selection.action.cardId)?.spell
        : undefined) ?? [
        ...(choice.effect ? [choice.effect] : []),
        ...(choice.afterEffects ?? []),
      ]
    );
  }
  if (choice?.kind === "trigger") return choice.effects ?? [];
  if (action.category === "play")
    return getScript(action.cardId ?? "")?.spell ?? [];
  if (action.id.startsWith("ability|") && action.cardId) {
    const index = Number(action.id.split("|")[2]);
    return (
      getAbilities(game, action.player, action.cardId, action.sourceId)[index]
        ?.effects ?? []
    );
  }
  // These expansion abilities declare their effects only when entering the chain.
  if (action.id.startsWith("unl-wave3:")) {
    if (action.abilityKey === "legend-buff")
      return [{ type: "buff", target: "anyUnit" }];
    if (action.abilityKey === "rose-ready")
      return [{ type: "ready", target: "anyUnit" }];
  }
  return [];
}

/** UI intent only; the engine continues to accept every official legal target. */
export function isFriendlyBuffAction(game: GameState, action: GameAction) {
  if (!["play", "ability"].includes(action.category)) return false;
  return pureBuff([
    ...actionEffects(game, action),
    ...(action.repeatedEffects ?? []),
  ]);
}

/** Use for both action buttons and board highlighting so they offer the same targets. */
export function filterFriendlyBuffActions(
  game: GameState,
  actions: GameAction[],
): GameAction[] {
  const choice = game.phase === "choice" ? game.pendingChoice : null;
  // An exact-size mandatory group may need enemy cards to remain completable.
  // Optional groups and ordinary single-target choices can safely prefer allies.
  if (
    choice?.kind === "boardTargets" &&
    !choice.effect?.upTo &&
    (choice.effect?.targetCount ?? 1) > 1
  )
    return actions;

  const filtered = actions.filter((action) => {
    const targetIds = [action.targetId, action.repeatedTargetId]
      .filter(Boolean)
      .flatMap((id) => id!.split(/[~,]/));
    if (
      !targetIds.some((id) =>
        game.units.some(
          (unit) => unit.id === id && unit.owner !== action.player,
        ),
      )
    )
      return true;
    // Restored drafts must still allow an already-selected enemy to be removed.
    if (
      action.amount === -1 ||
      (action.id.startsWith("draft:board:") &&
        choice?.effectDraft?.selected.includes(action.targetId!))
    )
      return true;
    return !isFriendlyBuffAction(game, action);
  });
  // A forced trigger can legally require an enemy when no ally exists. Do not
  // trap an in-progress match by inventing an illegal skip or hiding every option.
  return choice && actions.length && !filtered.length ? actions : filtered;
}
