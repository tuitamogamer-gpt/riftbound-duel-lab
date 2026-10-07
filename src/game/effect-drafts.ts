import { getCard } from "../data/cards";
import { getScript } from "./scripts";
import { getMight, getKeywords } from "./engine";
import type { Effect, GameAction, GameState, StackItem } from "./types";
type Draft = NonNullable<
  NonNullable<GameState["pendingChoice"]>["effectDraft"]
>;
const fx = (custom: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom,
  ...rest,
});
export function makeDraft(
  s: GameState,
  action: GameAction,
  trigger?: Draft["trigger"],
): Draft | undefined {
  const script = getScript(action.cardId ?? trigger?.cardId ?? "");
  const original = action.effects ?? trigger?.effects ?? script?.spell ?? [];
  const repeated = action.repeatMask !== undefined;
  if (!original.some((e) => e.custom?.startsWith("draft:")) && !repeated)
    return;
  const steps: Draft["steps"] = [];
  const expand = (effects: Effect[]) => {
    for (const e of effects) {
      if (e.custom === "draft:rain")
        for (let n = 0; n < 6; n++)
          steps.push({
            effects: [{ type: "damage", amount: 2, target: "anyUnit" }],
          });
      else if (e.custom === "draft:void")
        steps.push(
          { effects: [fx("wave24:move", { who: "self" })] },
          { effects: [fx("wave24:move", { who: "opponent" })] },
        );
      else if (e.custom === "draft:alpha")
        steps.push(
          { effects: [fx("wave24:alpha-source", { target: "friendlyUnit" })] },
          {
            effects: [
              fx("wave24:split", {
                target: "boardCards",
                cardTypes: ["Unit"],
                who: "opponent",
                upTo: true,
                group: { atBattlefield: true },
              }),
            ],
          },
        );
      else if (e.custom === "draft:volibear")
        steps.push({
          effects: [
            fx("wave24:split", {
              target: "boardCards",
              cardTypes: ["Unit"],
              who: "opponent",
              upTo: true,
              targetCount: e.amount ?? 5,
              amount: 5,
              group: { here: true },
            }),
          ],
        });
      else steps.push({ effects: [e] });
    }
  };
  if (original.some((e) => e.custom === "draft:curtain")) {
    const modes = [
      { label: "Draw 1", effects: [{ type: "draw" } as Effect] },
      {
        label: "2 damage at a battlefield",
        effects: [
          { type: "damage", amount: 2, target: "unitAtBattlefield" } as Effect,
        ],
      },
      {
        label: "3 damage in a base",
        effects: [
          { type: "damage", amount: 3, target: "unitInBase" } as Effect,
        ],
      },
      {
        label: "-4 Might at a battlefield",
        effects: [
          { type: "might", amount: -4, target: "unitAtBattlefield" } as Effect,
        ],
      },
    ];
    for (let i = 0; i < 1 + popcount(action.repeatMask ?? 0); i++)
      steps.push({ modes });
  } else {
    expand(original);
    if (repeated)
      for (let i = 0; i < popcount(action.repeatMask!); i++) {
        if (script?.spellModes) steps.push({ modes: script.spellModes });
        else expand(script?.spell ?? []);
      }
    else if (action.repeated) expand(action.repeatedEffects ?? original);
  }
  const hidden = s.hidden?.find(
    (h) => `hidden:${h.id}` === action.sourceId || h.id === action.sourceId,
  );
  const scope =
    hidden?.location ??
    original.find((e) => e.fromHidden)?.targetLocations?.[0];
  if (scope)
    for (const step of steps) {
      if (step.effects)
        step.effects = step.effects.map((e) => ({
          ...e,
          fromHidden: true,
          targetLocations: [scope],
        }));
      if (step.modes)
        step.modes = step.modes.map((m) => ({
          ...m,
          effects: m.effects.map((e) => ({
            ...e,
            fromHidden: true,
            targetLocations: [scope],
          })),
        }));
    }
  return {
    action,
    trigger,
    steps,
    chosen: [],
    targets: [],
    modes: [],
    selected: [],
  };
}
export const popcount = (n: number) => n.toString(2).replace(/0/g, "").length;
export function draftEffects(d: Draft): Effect[] {
  const step = d.steps[d.chosen.length];
  return step?.effects ?? step?.modes?.[d.activeMode ?? -1]?.effects ?? [];
}
export function draftAction(d: Draft): GameAction {
  return {
    ...d.action,
    effects: d.chosen.flat(),
    targetId: d.targets.filter(Boolean).join("~") || undefined,
    draftFinalized: true,
    targetsFinalized: true,
  };
}
export function draftChoose(s: GameState, a: GameAction) {
  const d = s.pendingChoice!.effectDraft!;
  if (a.id.startsWith("draft:mode:")) {
    d.activeMode = a.amount;
    return;
  }
  if (a.id === "draft:back") {
    if (d.selected.length) {
      d.selected.pop();
      return;
    }
    if (d.chosen.length) {
      d.chosen.pop();
      d.targets.pop();
      d.modes.pop();
      d.activeMode = undefined;
    }
    return;
  }
  const effects = draftEffects(d),
    e = effects.find((e) => e.target) || effects[0];
  if (a.id.startsWith("draft:board:")) {
    const id = a.targetId!;
    d.selected = d.selected.includes(id)
      ? d.selected.filter((x) => x !== id)
      : [...d.selected, id];
    return;
  }
  const targetId =
    e?.target === "boardCards" ? d.selected.join("~") : a.targetId;
  let chosen = effects.map((e) => ({
    ...e,
    chosenTargetId: targetId ?? null,
    ...(a.locationId ? { keyword: a.locationId } : {}),
  }));
  if (e?.custom === "wave24:alpha-source") {
    const source = s.units.find((u) => u.id === targetId);
    const next = d.steps[d.chosen.length + 1].effects![0];
    next.cardName = targetId;
    next.targetCount = source ? getMight(s, source) : 0;
  }
  if (e?.group?.distinctLocations)
    chosen = chosen.map((e) => ({
      ...e,
      chosenLocations: Object.fromEntries(
        d.selected.flatMap((id) => {
          const u = s.units.find((u) => u.id === id);
          return u ? [[id, u.location]] : [];
        }),
      ),
    }));
  d.chosen.push(chosen);
  d.targets.push(targetId ?? "");
  d.modes.push(d.activeMode ?? -1);
  d.activeMode = undefined;
  d.selected = [];
}
export function draftChoices(
  s: GameState,
  targetChoices: (
    effects: Effect[],
    location?: any,
    sourceId?: string,
  ) => (string | undefined)[],
  board: (
    e: Effect,
    sourceId?: string,
    location?: any,
  ) => { id: string; cardId: string; location: string }[],
): GameAction[] {
  const choice = s.pendingChoice!,
    d = choice.effectDraft!,
    p = choice.player,
    step = d.steps[d.chosen.length];
  const action = (
    id: string,
    label: string,
    rest: Partial<GameAction> = {},
  ): GameAction => ({ id, player: p, category: "ability", label, ...rest });
  const out: GameAction[] = [];
  if (!step)
    out.push(
      action(
        "draft:done",
        d.retargetId ? "Confirm new choices" : "Confirm choices and pay",
      ),
    );
  else if (step.modes && d.activeMode === undefined) {
    for (const [i, m] of step.modes.entries())
      if (
        !(d.action.cardId === "unl-182-219" && d.modes.includes(i)) &&
        targetChoices(m.effects, choice.locationId, choice.sourceId).length
      )
        out.push(action(`draft:mode:${i}`, m.label, { amount: i }));
  } else {
    const effects = draftEffects(d),
      e = effects.find((e) => e.target) || effects[0];
    if (e?.custom === "wave24:move") {
      for (const u of s.units.filter((u) =>
        e.who === "self" ? u.owner === p : u.owner !== p,
      )) {
        if (
          !targetChoices(
            [{ type: "moveTarget", target: "anyUnit" }],
            choice.locationId,
            choice.sourceId,
          ).includes(u.id)
        )
          continue;
        for (const dest of [
          `base:${u.owner}`,
          ...s.fields.map((f) => f.id),
        ] as const)
          if (
            dest !== u.location &&
            (!dest.startsWith("base:") ||
              !getKeywords(s, u).includes("Cannot move to base"))
          )
            out.push(
              action(
                `draft:move:${u.id}:${dest}`,
                `Move ${getCard(u.cardId).name} to ${dest}`,
                { targetId: u.id, locationId: dest as any },
              ),
            );
      }
    } else if (e?.target === "boardCards") {
      for (const u of board(e, choice.sourceId, choice.locationId))
        if (
          d.selected.includes(u.id) ||
          d.selected.length < (e.targetCount ?? Infinity)
        )
          out.push(
            action(
              `draft:board:${u.id}`,
              `${d.selected.includes(u.id) ? "Remove" : "Choose"} ${getCard(u.cardId).name}`,
              { targetId: u.id },
            ),
          );
      out.push(action("draft:step", "Confirm targets"));
    } else
      for (const id of targetChoices(
        effects,
        choice.locationId,
        choice.sourceId,
      ))
        out.push(
          action(
            `draft:target:${id ?? "none"}`,
            `${d.chosen.length + 1}/${d.steps.length}: ${id ? (s.units.find((u) => u.id === id) ? getCard(s.units.find((u) => u.id === id)!.cardId).name : id) : "Continue"}`,
            { targetId: id },
          ),
        );
  }
  if (d.chosen.length || d.selected.length)
    out.push(action("draft:back", "Change previous choice"));
  out.push(
    action(
      "draft:cancel",
      d.trigger ? "Do not use this ability" : "Cancel play",
    ),
  );
  return out;
}

/** A controlled spell keeps every paid repetition while declaring fresh choices. */
export function retargetDraft(item: StackItem): Draft {
  const script = getScript(item.cardId),
    clear = (effects: Effect[]) =>
      effects.map((e) => ({
        ...e,
        chosenTargetId: undefined,
        chosenLocations: undefined,
        ...(item.fromHidden
          ? {
              fromHidden: true,
              targetLocations: item.locationId
                ? [item.locationId]
                : e.targetLocations,
            }
          : {}),
      }));
  const count =
    1 +
    (item.declaration?.repeatMask !== undefined
      ? popcount(item.declaration.repeatMask)
      : Number(!!item.declaration?.repeated));
  const steps: Draft["steps"] = script?.spellModes
    ? Array.from({ length: count }, () => ({
        modes: script.spellModes!.map((m) => ({
          ...m,
          effects: clear(m.effects),
        })),
      }))
    : item.effects.map((e) => ({ effects: clear([e]) }));
  return {
    retargetId: item.id,
    action: {
      id: "retarget",
      player: item.player,
      category: "ability",
      label: "Choose new targets",
      cardId: item.cardId,
      locationId: item.locationId,
    },
    steps,
    chosen: [],
    targets: [],
    modes: [],
    selected: [],
  };
}
