import { recycleCards, recycleRunes } from "./zone-events";
import { isCardType } from "../data/cards";
import { getCard } from "../data/cards";
import { getScript } from "./scripts";
import { canPlayCard } from "./board-rules";
import { takeTrash, trashCards } from "./trash";
import { physicalCard, physicalOwner, detach } from "./objects";
import type { PreconContext } from "./later-precon-engine";
import type {
  CardPlaySpec,
  Effect,
  GameAction,
  GameState,
  PlayerId,
} from "./types";

const selected = (play: CardPlaySpec): Effect => ({
  type: "special",
  custom: "card-play:select",
  play,
});
function candidates(s: GameState, p: PlayerId, spec: CardPlaySpec) {
  const owner = spec.zoneOwner ?? p;
  const player = s.players[owner];
  const ids =
    spec.zone === "top"
      ? player.deck.slice(0, spec.count ?? 1)
      : spec.zone === "hand"
        ? player.hand
        : spec.zone === "banished"
          ? player.banished
          : [];
  const entries =
    spec.zone === "trash"
      ? trashCards(s, owner).map((c) => ({ ...c, ref: c.id }))
      : ids.map((cardId, i) => ({ cardId, ref: `${spec.zone}:${i}` }));
  return entries.filter(({ cardId, ref }) => {
    const c = getCard(cardId);
    return (
      (!spec.sourceRef || spec.sourceRef === ref) &&
      getScript(cardId) &&
      (!spec.hiddenOnly || getScript(cardId)?.hidden) &&
      canPlayCard(s, p, c) &&
      (!spec.cardTypes || spec.cardTypes.some((type) => isCardType(c, type))) &&
      (!spec.cardTags || spec.cardTags.some((t) => c.tags.includes(t))) &&
      (spec.maxEnergy === undefined || (c.energy ?? 0) <= spec.maxEnergy) &&
      (spec.maxPower === undefined || (c.power ?? 0) <= spec.maxPower) &&
      (spec.maxMight === undefined || (c.might ?? 0) <= spec.maxMight)
    );
  });
}

/** Step 354 only: finalization waits until the resolving parent finishes. */
export function queueCardPlay(
  s: GameState,
  p: PlayerId,
  cardId: string,
  spec: CardPlaySpec,
  zone: "hand" | "trash" | "banished",
  index: number,
) {
  (s.pendingPlays ??= []).push({
    id: `pending:${s.nextId++}`,
    cardId,
    player: spec.controller ?? p,
    returnZone: zone,
    returnIndex: index,
    spec,
  });
}

export function runCardPlay(
  s: GameState,
  p: PlayerId,
  effect: Effect,
  ctx: PreconContext,
) {
  if (effect.type !== "playCard" && effect.custom !== "card-play:select")
    return false;
  const spec: CardPlaySpec = {
    ...effect.play!,
    sourceId: effect.play?.sourceId ?? ctx.sourceId,
    locationId: effect.play?.locationId ?? ctx.locationId,
  };
  if (
    spec.zone !== "blink" &&
    (spec.destination === "here" || spec.alternativeHere)
  )
    spec.locationId =
      effect.play?.locationId ??
      (spec.sourceId?.startsWith("field:")
        ? spec.locationId
        : s.units.find((u) => u.id === spec.sourceId)?.location);
  const owner = spec.zoneOwner ?? p;
  const player = s.players[owner];
  if (effect.condition === "noReplacement") spec.sourceRef = "no-card";
  if (effect.condition === "costBelowPoints")
    spec.maxEnergy = player.points - 1;
  if (effect.type === "playCard" && effect.target === "trashCards") {
    spec.sourceRef = ctx.targetId;
    if (
      !ctx.targetId ||
      !candidates(s, p, spec).some((c) => c.ref === ctx.targetId)
    )
      return true;
    effect = { ...effect, type: "special", custom: "card-play:select" };
  }
  if (effect.type === "playCard") {
    if (spec.zone === "blink") {
      const unit = s.units.find((u) => u.id === ctx.targetId);
      if (!unit) return true;
      const owner = physicalOwner(unit);
      s.units = s.units.filter((u) => u.id !== unit.id);
      for (const g of s.gears) if (g.attachedTo === unit.id) detach(s, g);
      ctx.cardEvent(s, "banish", owner, unit.cardId, unit.id, unit.location);
      if (!unit.token) {
        queueCardPlay(
          s,
          owner,
          physicalCard(unit),
          {
            ...spec,
            locationId:
              spec.destination === "here" ? unit.location : spec.locationId,
          },
          "banished",
          s.players[owner].banished.length,
        );
      }
      return true;
    }
    if (spec.zone === "top") {
      if (spec.untilUnit) {
        const first = player.deck.findIndex((id) =>
          isCardType(getCard(id), "Unit"),
        );
        spec.count = first < 0 ? player.deck.length : first + 1;
      }
      if (spec.revealed) {
        const revealed = player.deck.slice(0, spec.count ?? 1);
        ctx.log?.(
          s,
          `Revealed: ${revealed.map((id) => getCard(id).name).join(", ")}.`,
          "info",
          p,
        );
        for (const id of revealed) ctx.cardEvent(s, "reveal", p, id);
      }
    }
    const options: GameAction[] = candidates(s, p, spec).map(
      ({ cardId, ref }) => ({
        id: `choose-custom:play-card:${ref}`,
        player: p,
        category: "ability",
        cardId,
        label: `Play ${getCard(cardId).name}`,
        effects: [selected({ ...spec, sourceRef: ref })],
      }),
    );
    // Private-zone type choices can always be declined (Core 128.6).
    if (spec.optional || spec.zone === "hand" || !options.length)
      options.push({
        id: "choose-custom:play-card:skip",
        player: p,
        category: "ability",
        label: "Do not play a card",
        effects: [selected({ ...spec, sourceRef: "skip" })],
      });
    if (!options.length) return true;
    ctx.openChoice(s, p, {
      options,
      sourceId: ctx.sourceId,
      targetId: ctx.targetId,
      locationId: ctx.locationId,
    });
    return true;
  }
  const ref = spec.sourceRef;
  let cardId: string | undefined;
  let origin: "hand" | "trash" | "banished" = "banished";
  let index = Number(ref?.split(":").at(-1));
  if (spec.zone === "top") {
    const seen = player.deck.splice(0, spec.count ?? 1);
    cardId = ref === "skip" ? undefined : seen[index];
    const rest = seen.filter((_, i) => ref === "skip" || i !== index);
    if (spec.unplayedToHand) {
      player.deck.unshift(...rest);
      ctx.draw(s, p, rest.length);
    } else recycleCards(s, owner, [...(ctx.shuffle?.(s, rest) ?? rest)], p);
    index = player.banished.length;
    if (cardId) ctx.cardEvent(s, "banish", p, cardId);
  } else if (ref !== "skip") {
    if (spec.zone === "trash") {
      const entry = trashCards(s, owner).find((c) => c.id === ref);
      index = trashCards(s, owner).findIndex((c) => c.id === ref);
      cardId = entry && takeTrash(s, owner, ref!);
      origin = "trash";
    } else if (spec.zone === "hand") {
      cardId = player.hand.splice(index, 1)[0];
      origin = "hand";
    } else cardId = player.banished.splice(index, 1)[0];
  }
  if (cardId) queueCardPlay(s, p, cardId, spec, origin, index);
  return true;
}
