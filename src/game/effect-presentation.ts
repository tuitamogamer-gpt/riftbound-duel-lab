import { isCardType } from "../data/cards";
import { findCard } from "../catalog";
import { getMight } from "./engine";
import type { Review } from "../components/StepFlow";
import {
  getRuneChanges,
  runeOutcomeLabels,
  type RuneEvent,
} from "./rune-presentation";

export interface EffectChange {
  key: string;
  values?: Record<string, string | number>;
  unitId?: string;
  player?: 0 | 1;
  tone: string;
}
/** Compare only frames already displayed; never reveal the final state or private hand faces. */
export function getEffectView(review: Review | null) {
  if (!review) return null;
  const frame = review.frames[review.index];
  if (!frame) return null;
  const before = review.index
    ? review.frames[review.index - 1].state
    : review.before;
  const game = frame.state;
  const effect = frame.effect;
  const publicPlay =
    review.action.category === "play" && !review.action.id.startsWith("hide:");
  const source = findCard(
    effect?.cardId ?? (publicPlay ? review.action.cardId : undefined),
  );
  const runeChanges = getRuneChanges(review);
  if (!effect && !source && !runeChanges.length) return null;
  const changes: EffectChange[] = [];
  for (const unit of game.units) {
    const old = before.units.find((u) => u.id === unit.id);
    const add = (key: string, tone: string, amount?: number) =>
      changes.push({
        key,
        tone,
        unitId: unit.id,
        values: {
          card: findCard(unit.cardId)?.name ?? unit.cardId,
          ...(amount === undefined ? {} : { amount }),
        },
      });
    if (!old) {
      add("{card} · enters play", "summon");
      continue;
    }
    if (unit.damage > old.damage)
      add("{card} · −{amount} health", "damage", unit.damage - old.damage);
    if (unit.damage < old.damage)
      add("{card} · heals {amount}", "heal", old.damage - unit.damage);
    const might = getMight(game, unit) - getMight(before, old);
    if (might > 0) add("{card} · +{amount} Might", "buff", might);
    if (might < 0) add("{card} · −{amount} Might", "damage", -might);
    if (!old.ready && unit.ready) add("{card} · readied", "ready");
    if (old.ready && !unit.ready) add("{card} · exhausted", "exhaust");
    if (!old.stunned && unit.stunned) add("{card} · stunned", "stun");
    if (old.location !== unit.location) add("{card} · moved", "move");
    if ((unit.preventDamage ?? 0) > (old.preventDamage ?? 0))
      add(
        "{card} · +{amount} protection",
        "buff",
        (unit.preventDamage ?? 0) - (old.preventDamage ?? 0),
      );
  }
  for (const unit of before.units)
    if (!game.units.some((u) => u.id === unit.id))
      changes.push({
        key: "{card} · leaves play",
        values: { card: findCard(unit.cardId)?.name ?? unit.cardId },
        unitId: unit.id,
        tone: "destroy",
      });
  for (const player of [0, 1] as const) {
    const a = before.players[player],
      b = game.players[player];
    const add = (key: string, amount: number, tone: string) =>
      changes.push({ key, values: { amount }, player, tone });
    if (b.points > a.points)
      add("+{amount} point(s)", b.points - a.points, "score");
    if (b.hand.length > a.hand.length)
      add("Hand +{amount}", b.hand.length - a.hand.length, "draw");
    for (const kind of [
      "channel",
      "recycle",
      "ready",
      "exhaust",
    ] as RuneEvent[]) {
      const amount = runeChanges.filter(
        (change) => change.player === player && change.kind === kind,
      ).length;
      if (amount)
        add(
          runeOutcomeLabels[kind],
          amount,
          kind === "ready" ? "ready" : "rune",
        );
    }
    if (b.energy > a.energy)
      add("+{amount} energy", b.energy - a.energy, "rune");
  }
  const player =
    effect?.player ??
    (source ? review.action.player : runeChanges[0]?.player) ??
    review.action.player;
  const field =
    source && isCardType(source, "Battlefield")
      ? (game.fields.find(
          (f) =>
            f.cardId === source.id &&
            (f.id === effect?.sourceId || !effect?.sourceId),
        ) ?? game.fields.find((f) => f.cardId === source.id))
      : undefined;
  const targets = [
    ...new Set([
      ...(effect?.targetId ?? review.action.targetId ?? "")
        .split(/[~,]/)
        .filter(Boolean),
      ...changes.flatMap((change) => (change.unitId ? [change.unitId] : [])),
    ]),
  ];
  return {
    source,
    runeOnly: !effect && !source,
    effect,
    label: frame.label,
    changes,
    player,
    fieldId: field?.id,
    targets,
    tone:
      changes.find((c) =>
        ["damage", "destroy", "score", "buff", "draw"].includes(c.tone),
      )?.tone ??
      effect?.type ??
      "effect",
  };
}
