import { textUnits } from "./text-sources";
import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { option, choices } from "./card-wave16";
import { queueCardPlay } from "./card-play";
import type { Effect, GameState, PlayerId } from "./types";
import type { PreconContext } from "./later-precon-engine";
const lookEffects: Record<string, number> = {
  "ven:pakaa": 1,
  "unl-wave3:diana-reveal": 1,
  "wave14:herald": 3,
  "wave8:teemo": 5,
  "sfd-extra:smith": 1,
  "sfd-extra:ornn-select": 4,
  "unl-extra:select-top": 3,
  "unl-extra:predict-two": 2,
  "unl:predict-two": 2,
  "origins-more:stacked-deck": 3,
  "origins-more:candlelit": 2,
  "wave3:called-shot": 2,
  "ven-wave3:predict": 1,
  "ven-extra:lightning": 3,
  "sfd:conservatory": 1,
};
const reveals = new Set([
  "ven:pakaa",
  "unl-wave3:diana-reveal",
  "wave8:teemo",
  "sfd-extra:smith",
  "sfd:conservatory",
]);
/** Pause the existing instruction for replacement choices; resume the same inspected batch. */
export function inspectDeck(
  s: GameState,
  p: PlayerId,
  e: Effect,
  ctx: PreconContext,
): false | "pause" | "skip" {
  if (e.inspectionComplete) return false;
  if (inspectSelected(s, p, e, ctx)) return "pause";
  const play =
    e.type === "playCard" && e.play?.zone === "top" ? e.play : undefined;
  if (e.type !== "predict" && !play && !(e.custom && e.custom in lookEffects))
    return false;
  const owner =
      play?.zoneOwner ?? (e.who === "opponent" ? ((1 - p) as PlayerId) : p),
    deck = s.players[owner].deck;
  const revealed = !!play?.revealed || reveals.has(e.custom ?? "");
  if (revealed) {
    const hatchling = textUnits(s).find(
      (u) =>
        u.owner === p &&
        isFace(u.cardId, "SFD", 18) &&
        !e.inspectionReplacements?.includes(u.abilityInstance ?? u.id),
    );
    if (hatchling) {
      ctx.runEffects(
        s,
        p,
        [
          { type: "predict", who: owner === p ? "self" : "opponent" },
          {
            ...e,
            inspectionReplacements: [
              ...(e.inspectionReplacements ?? []),
              hatchling.abilityInstance ?? hatchling.id,
            ],
          },
        ],
        ctx.targetId,
        ctx.sourceId,
        ctx.locationId,
      );
      return "pause";
    }
  }
  const until = play?.untilUnit
    ? deck.findIndex((id) => isCardType(getCard(id), "Unit"))
    : undefined;
  const count =
    e.lookCount ??
    Math.min(
      deck.length,
      until !== undefined
        ? until < 0
          ? deck.length
          : until + 1
        : (play?.count ??
            (e.type === "predict"
              ? 1
              : e.custom === "unl-extra:select-top" ||
                  e.custom === "ven-wave3:predict"
                ? (e.amount ?? lookEffects[e.custom])
                : lookEffects[e.custom!])),
    );
  if (count === 0) return "skip";
  const index = deck
    .slice(0, count)
    .findIndex(
      (id, i) =>
        i >= (e.lookCursor ?? 0) && owner === p && isFace(id, "OGN", 194),
    );
  if (index < 0) {
    e.lookCount = count;
    e.inspectionComplete = true;
    if (play) {
      e.play = { ...play, count, untilUnit: false };
    }
    return false;
  }
  const next = { ...e, lookCount: count, lookCursor: index + 1 };
  choices(s, owner, ctx, [
    option(
      owner,
      `nocturne:${index}:play`,
      "Banish Nocturne and optionally play it for 1 Power",
      [
        { type: "special", custom: "inspection:nocturne", amount: index },
        { ...next, lookCount: count - 1, lookCursor: index },
      ],
    ),
    option(
      owner,
      `nocturne:${index}:keep`,
      "Leave Nocturne with the inspected cards",
      [next],
    ),
  ]);
  return "pause";
}
export function banishInspectedNocturne(
  s: GameState,
  p: PlayerId,
  index: number,
  ctx: PreconContext,
) {
  const id = s.players[p].deck.splice(index, 1)[0];
  if (!id) return;
  shiftInspectedPositions(s, p, index, false);
  ctx.cardEvent(s, "banish", p, id);
  queueCardPlay(
    s,
    p,
    id,
    { zone: "banished", optional: true, ignoreEnergy: true, powerOverride: 1 },
    "banished",
    s.players[p].banished.length,
  );
}

const selectedRevealCounts: Record<string, number> = {
  "wave14:herald-selected": 3,
  "sfd-extra:ornn-finish": 4,
  "unl-extra:select-top-apply": 3,
};
/** The inspected cards stay the same physical cards while Hatchling recycles a top card. */
function inspectSelected(
  s: GameState,
  p: PlayerId,
  e: Effect,
  ctx: PreconContext,
): boolean {
  if (!e.custom || !(e.custom in selectedRevealCounts)) return false;
  const selection =
    e.custom === "unl-extra:select-top-apply"
      ? JSON.parse(e.cardName!)
      : undefined;
  const index = selection?.index ?? e.amount ?? -1,
    count =
      selection?.viewed?.length ??
      e.lookCount ??
      selectedRevealCounts[e.custom];
  if (index < 0 || index >= s.players[p].deck.length) return false;
  if (
    !textUnits(s).some((u) => u.owner === p && isFace(u.cardId, "SFD", 18)) &&
    !isFace(s.players[p].deck[index], "OGN", 194)
  )
    return false;
  const id = `inspection:${s.nextId++}`;
  (s.selectedInspections ??= []).push({
    id,
    owner: p,
    positions: Array.from(
      { length: Math.min(count, s.players[p].deck.length) },
      (_, i) => i,
    ),
    chosen: index,
    used: [],
    effect: e,
  });
  continueSelected(s, p, id, ctx);
  return true;
}
export function shiftInspectedPositions(
  s: GameState,
  p: PlayerId,
  index: number,
  recycled: boolean,
) {
  for (const batch of s.selectedInspections ?? [])
    if (batch.owner === p)
      batch.positions = batch.positions.map((n) =>
        n === index
          ? recycled
            ? s.players[p].deck.length - 1
            : -1
          : n > index
            ? n - 1
            : n,
      );
}
export function continueSelected(
  s: GameState,
  p: PlayerId,
  id: string,
  ctx: PreconContext,
  decision?: "keep" | "banish",
) {
  const b = s.selectedInspections?.find((b) => b.id === id);
  if (!b) return;
  const next: Effect = {
    type: "special",
    custom: "inspection:selected",
    cardName: id,
  };
  const source = textUnits(s).find(
    (u) =>
      u.owner === p &&
      isFace(u.cardId, "SFD", 18) &&
      !b.used.includes(u.abilityInstance ?? u.id),
  );
  if (source) {
    b.used.push(source.abilityInstance ?? source.id);
    ctx.runEffects(
      s,
      p,
      [{ type: "predict" }, next],
      ctx.targetId,
      ctx.sourceId,
      ctx.locationId,
    );
    return;
  }
  const index = b.positions[b.chosen],
    deck = s.players[b.owner].deck;
  if (index >= 0 && isFace(deck[index], "OGN", 194) && !decision) {
    choices(s, p, ctx, [
      option(p, `${id}:banish`, "Banish Nocturne instead of revealing it", [
        { ...next, keyword: "banish" },
      ]),
      option(p, `${id}:keep`, "Reveal the selected Nocturne", [
        { ...next, keyword: "keep" },
      ]),
    ]);
    return;
  }
  if (decision === "banish" && index >= 0)
    banishInspectedNocturne(s, p, index, ctx);
  const positions = b.positions.filter((n) => n >= 0),
    seen = positions.map((n) => deck[n]),
    picked = b.positions[b.chosen];
  // Restore this looked-at batch to its inspection order; the original effect
  // then draws its selected card and recycles precisely the remaining batch.
  s.players[b.owner].deck = [
    ...seen,
    ...deck.filter((_, i) => !positions.includes(i)),
  ];
  const selected = picked < 0 ? -1 : positions.indexOf(picked),
    effect = {
      ...b.effect,
      inspectionComplete: true,
      lookCount: seen.length,
      amount: selected,
    };
  if (effect.custom === "unl-extra:select-top-apply")
    effect.cardName = JSON.stringify({
      ...JSON.parse(effect.cardName!),
      viewed: seen,
      index: selected,
    });
  s.selectedInspections = s.selectedInspections!.filter((x) => x.id !== id);
  ctx.runEffects(s, p, [effect], ctx.targetId, ctx.sourceId, ctx.locationId);
}
