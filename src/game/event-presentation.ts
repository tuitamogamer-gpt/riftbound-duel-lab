import { findCard } from "../catalog";
import type { Review } from "../components/StepFlow";
import { getMight } from "./engine";
import { championMoment, phaseMoment, scoreMoment } from "./table-presentation";
import { getRuneChanges } from "./rune-presentation";
import { visibleTurnStep } from "./presentation";
import type { PlayerId } from "./types";

export type PublicEventKind =
  | "champion"
  | "victory"
  | "score"
  | "combat"
  | "counter"
  | "damage"
  | "destroy"
  | "buff"
  | "move"
  | "gear"
  | "equip"
  | "play"
  | "reaction"
  | "ability"
  | "effect"
  | "phase"
  | "rune"
  | "draw";
export interface PublicTableEvent {
  kind: PublicEventKind;
  label: string;
  values?: Record<string, string | number>;
  player?: PlayerId;
}

/** Public events belong to this displayed transition; private faces are never read. */
export function publicTableEvents(review: Review | null): PublicTableEvent[] {
  if (!review || !Number.isInteger(review.index) || review.index < 0) return [];
  const frame = review.frames[review.index];
  const before = review.index
    ? review.frames[review.index - 1]?.state
    : review.before;
  if (!frame || !before) return [];
  const now = frame.state;
  const events: PublicTableEvent[] = [];
  const add = (
    kind: PublicEventKind,
    label: string,
    player?: PlayerId,
    values?: PublicTableEvent["values"],
  ) => {
    if (!events.some((event) => event.kind === kind))
      events.push({ kind, label, player, values });
  };
  if (now.winner !== null && before.winner !== now.winner)
    add("victory", "Victory", now.winner);
  const champion = championMoment(review);
  if (champion) add("champion", "Signature champion enters", champion.owner);
  const score = scoreMoment(review);
  if (score)
    add("score", "+{amount} point(s)", score.player, {
      amount: score.to - score.from,
    });

  // A counter only succeeds when the public target leaves the chain in this frame.
  if (
    frame.effect?.type === "counter" &&
    before.stack.some(
      (item) =>
        item.id === frame.effect?.targetId &&
        !now.stack.some((next) => next.id === item.id),
    )
  )
    add("counter", "Counter resolved", frame.effect.player);
  if (frame.combat)
    add(
      "combat",
      frame.combat.stage === "impact"
        ? "Combat impact"
        : frame.combat.stage === "result"
          ? "Combat resolved"
          : "Combat",
      frame.combat.preview.attacker,
    );
  else if (
    (!before.combat && now.combat) ||
    before.combat?.stage !== now.combat?.stage
  )
    add(
      "combat",
      now.combat ? "Combat" : "Combat resolved",
      now.combat?.attacker ?? before.combat?.attacker,
    );

  for (const unit of now.units) {
    const old = before.units.find((entry) => entry.id === unit.id);
    if (!old) {
      if (unit.id !== champion?.id) add("play", "Unit enters play", unit.owner);
      continue;
    }
    if (unit.damage > old.damage) add("damage", "Unit damaged", unit.owner);
    if (unit.damage < old.damage) add("buff", "Unit healed", unit.owner);
    if (unit.location !== old.location) add("move", "Unit moved", unit.owner);
    if (
      getMight(now, unit) !== getMight(before, old) ||
      unit.buff !== old.buff ||
      unit.empowered !== old.empowered ||
      (unit.preventDamage ?? 0) !== (old.preventDamage ?? 0)
    )
      add("buff", "Might or protection changed", unit.owner);
    if (unit.ready !== old.ready || unit.stunned !== old.stunned)
      add(
        "effect",
        unit.stunned && !old.stunned
          ? "Unit stunned"
          : unit.ready
            ? "Unit readied"
            : "Unit exhausted",
        unit.owner,
      );
    if (unit.owner !== old.owner) add("effect", "Control changed", unit.owner);
  }
  for (const unit of before.units)
    if (!now.units.some((entry) => entry.id === unit.id))
      add("destroy", "Unit leaves play", unit.owner);
  for (const gear of now.gears) {
    const old = before.gears.find((entry) => entry.id === gear.id);
    if (!old) add("gear", "Gear enters play", gear.owner);
    if (gear.attachedTo !== old?.attachedTo)
      add(
        "equip",
        gear.attachedTo ? "Gear equipped" : "Gear detached",
        gear.owner,
      );
    if (old && gear.ready !== old.ready)
      add("gear", gear.ready ? "Gear readied" : "Gear exhausted", gear.owner);
  }
  for (const gear of before.gears)
    if (!now.gears.some((entry) => entry.id === gear.id))
      add("gear", "Gear leaves play", gear.owner);

  for (const item of now.stack) {
    if (before.stack.some((old) => old.id === item.id)) continue;
    add(
      item.kind === "spell"
        ? before.stack.length
          ? "reaction"
          : "play"
        : "ability",
      item.kind === "spell"
        ? before.stack.length
          ? "Reaction played"
          : "Card played"
        : item.kind === "trigger"
          ? "Triggered ability"
          : "Ability activated",
      item.player,
    );
  }
  for (const player of [0, 1] as const) {
    const previous = before.players[player],
      current = now.players[player];
    // Counts are public. Neither hand identities nor deck order enter this view.
    if (current.hand.length > previous.hand.length)
      add("draw", "Card drawn", player);
    if (
      current.cardsPlayedThisTurn > previous.cardsPlayedThisTurn &&
      !review.action.id.startsWith("hide:")
    )
      add("play", "Card played", player);
    if (
      current.legendUsedTurn !== previous.legendUsedTurn ||
      current.legendEmpowered !== previous.legendEmpowered
    )
      add("ability", "Legend ability", player);
    if (
      current.energy !== previous.energy ||
      (current.power ?? 0) !== (previous.power ?? 0) ||
      (current.xp ?? 0) !== (previous.xp ?? 0)
    )
      add("rune", "Resources changed", player);
  }
  if (
    now.fields.some(
      (field) =>
        before.fields.find((old) => old.id === field.id)?.controller !==
        field.controller,
    )
  )
    add("effect", "Battlefield control changed");
  const phase = phaseMoment(review);
  if (phase)
    add(
      "phase",
      phase.charAt(0).toUpperCase() + phase.slice(1),
      now.currentPlayer,
    );
  else if (
    visibleTurnStep(now) === "main" &&
    visibleTurnStep(before) !== "main"
  )
    add("phase", "Main phase", now.currentPlayer);
  else if (now.phase !== before.phase && now.winner === null) {
    const phaseLabels: Partial<Record<typeof now.phase, string>> = {
      showdown: "Showdown begins",
      damage: "Assign combat damage",
      choice: "Choose an effect",
      move: "Movement declared",
    };
    const label = phaseLabels[now.phase];
    if (label) add("phase", label, now.priorityPlayer);
  }
  const runes = getRuneChanges(review);
  if (runes.length) add("rune", "Runes changed", runes[0].player);

  // An effect can change something outside units/resources. The metadata has no
  // private label or card name, and identical successive metadata does not repeat.
  const effect = frame.effect;
  const prior = review.index
    ? review.frames[review.index - 1]?.effect
    : undefined;
  if (
    effect?.stage &&
    effect.stage !== "announced" &&
    JSON.stringify(effect) !== JSON.stringify(prior)
  ) {
    const source = findCard(effect.cardId);
    const publicSource =
      source &&
      [now, before].some(
        (state) =>
          state.units.some((unit) => unit.cardId === source.id) ||
          state.gears.some((gear) => gear.cardId === source.id) ||
          state.fields.some((field) => field.cardId === source.id) ||
          state.stack.some((item) => item.cardId === source.id) ||
          (state.resolving ?? []).some((item) => item.cardId === source.id) ||
          (state.resolvingAbilities ?? []).some(
            (item) => item.cardId === source.id,
          ) ||
          state.players.some(
            (player) =>
              player.legendId === source.id ||
              player.championId === source.id ||
              player.discard.includes(source.id) ||
              player.banished.includes(source.id),
          ),
      );
    if (publicSource || events.length)
      add(
        "effect",
        effect.stage === "applied" ? "Effect resolved" : "Effect resolving",
        effect.player,
      );
  }
  return events;
}
