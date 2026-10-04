import { findCard } from "../catalog";
import type { CatalogCard } from "../catalog";
import type { Review } from "../components/StepFlow";
import { getEffectView } from "./effect-presentation";
import type { GameState, PlayerId, StackItem } from "./types";

export interface PresentedStackCard {
  id: string;
  card: CatalogCard;
  player: PlayerId;
  kind: StackItem["kind"] | "play";
  status: "waiting" | "next" | "resolving" | "playing" | "choosing";
  response: boolean;
  entering: boolean;
}

/** A choice can outlive the stack item that caused it, especially for abilities. */
export function pendingChoiceCardId(game: GameState) {
  const choice = game.pendingChoice;
  if (!choice) return;
  return (
    choice.cardId ??
    choice.sourceSnapshot?.cardId ??
    game.units.find((unit) => unit.id === choice.sourceId)?.cardId ??
    game.gears.find((gear) => gear.id === choice.sourceId)?.cardId ??
    game.fields.find((field) => field.id === choice.sourceId)?.cardId ??
    (choice.sourceId === "legend"
      ? game.players[choice.actor ?? choice.player].legendId
      : undefined) ??
    game.resolving?.at(-1)?.cardId
  );
}

/** The visible frame is the only authority during playback, never review.final. */
export function getActionStackView(game: GameState, review: Review | null) {
  const frame = review?.frames[review.index];
  if (review && !frame) return null;
  const visible = frame?.state ?? game;
  const previous = review
    ? review.index > 0
      ? review.frames[review.index - 1].state
      : review.before
    : undefined;
  const feedback = getEffectView(review);
  const publicEffect =
    frame?.effect ??
    review?.frames
      .slice(0, review.index)
      .reverse()
      .find((past) => past.effect && past.effect.stage !== "announced")?.effect;
  const effectSource = findCard(publicEffect?.cardId);
  const cards: PresentedStackCard[] = [];
  const publicPlay =
    review?.action.category === "play" && !review.action.id.startsWith("hide:");
  const playedCard = publicPlay ? findCard(review?.action.cardId) : undefined;

  const add = (
    item: StackItem,
    status: PresentedStackCard["status"],
    response = false,
  ) => {
    const card = findCard(item.cardId);
    if (!card || cards.some((entry) => entry.id === item.id)) return;
    cards.push({
      id: item.id,
      card,
      player: item.player,
      kind: item.kind,
      status,
      response,
      entering:
        !!review &&
        !previous?.stack.some((old) => old.id === item.id) &&
        status !== "resolving",
    });
  };

  // A spell remains public while its choices are being made. This is also a
  // useful snapshot after it is popped from the chain in a resolution frame.
  for (const item of [...(visible.resolving ?? [])].reverse())
    add(item, "resolving");

  // Abilities do not enter game.resolving. Find a just-popped source only in
  // already displayed frames, so its card stays on the table while it resolves.
  if (effectSource && publicEffect && publicEffect.stage !== "announced") {
    const pastStates = review
      ? [
          review.before,
          ...review.frames.slice(0, review.index).map((f) => f.state),
        ]
      : [];
    const popped = pastStates
      .reverse()
      .flatMap((state) => [...state.stack].reverse())
      .find(
        (item) =>
          item.cardId === effectSource.id &&
          item.player === publicEffect.player &&
          item.sourceId === publicEffect.sourceId &&
          !visible.stack.some((next) => next.id === item.id),
      );
    if (popped) {
      add(popped, "resolving");
      const activeIndex = cards.findIndex((entry) => entry.id === popped.id);
      if (activeIndex > 0) cards.unshift(...cards.splice(activeIndex, 1));
    } else if (
      !cards.some(
        (entry) =>
          entry.card.id === effectSource.id &&
          entry.player === publicEffect.player,
      ) &&
      !visible.stack.some(
        (item) =>
          item.cardId === effectSource.id &&
          item.player === publicEffect.player &&
          item.sourceId === publicEffect.sourceId,
      ) &&
      (playedCard?.id !== effectSource.id ||
        review?.action.player !== publicEffect.player)
    )
      cards.push({
        id: `effect:${review!.action.id}:${effectSource.id}:${publicEffect.sourceId ?? ""}`,
        card: effectSource,
        player: publicEffect.player,
        kind: "trigger",
        status: "resolving",
        response: false,
        entering: false,
      });
  }

  const choiceCard = findCard(pendingChoiceCardId(visible));
  if (choiceCard && !cards.some((entry) => entry.card.id === choiceCard.id))
    cards.push({
      id: `choice:${choiceCard.id}:${visible.pendingChoice!.sourceId ?? ""}`,
      card: choiceCard,
      player: visible.pendingChoice!.actor ?? visible.pendingChoice!.player,
      kind: visible.pendingChoice!.kind === "trigger" ? "trigger" : "ability",
      status: "resolving",
      response: false,
      entering: false,
    });

  // Array order in the engine is oldest first; present the next resolution
  // first, followed by every remaining public action and reaction.
  for (let i = visible.stack.length - 1; i >= 0; i--)
    add(
      visible.stack[i],
      i === visible.stack.length - 1 && !cards.length ? "next" : "waiting",
      i > 0 && visible.stack[i].kind !== "trigger",
    );

  // Unit and Gear plays are immediate rules actions, but still need a physical
  // card presentation. A spell's first public frame may precede pushStack too.
  if (
    playedCard &&
    !cards.some(
      (entry) =>
        entry.card.id === playedCard.id &&
        entry.player === review!.action.player &&
        !review!.before.stack.some((old) => old.id === entry.id),
    )
  )
    cards.push({
      id: `play:${review!.action.id}`,
      card: playedCard,
      player: review!.action.player,
      kind: "play",
      status: "playing",
      response: playedCard.type === "Spell" && !!visible.stack.length,
      entering: review!.index === 0,
    });

  if (!cards.length) return null;
  if (choiceCard) {
    const source = cards.find((entry) => entry.card.id === choiceCard.id);
    if (source) source.status = "choosing";
  }
  return {
    cards,
    feedback,
    label: frame?.label,
    priorityPlayer: visible.priorityPlayer,
  };
}
