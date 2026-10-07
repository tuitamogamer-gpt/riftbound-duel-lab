import { isCardType } from "../data/cards";
import { getCard } from "../data/cards";
import { isFace } from "./board-rules";
import { banishCard } from "./banishment";
import { emitGameEvent } from "./engine";
import type { Effect, GameState, PlayerId } from "./types";

export interface TrashCard {
  id: string;
  cardId: string;
}

/** Public-zone targets identify a physical visit, never an array position/name. */
export function trashCards(s: GameState, p: PlayerId): TrashCard[] {
  const player = s.players[p];
  return player.discard.map((cardId, i) => {
    const saved = player.trashCards?.[i];
    return saved?.cardId === cardId
      ? saved
      : { id: `trash:${p}:legacy:${i}:${cardId}`, cardId };
  });
}

export function addToTrash(s: GameState, p: PlayerId, ...cards: string[]) {
  if (s.gears.some((g) => g.owner === p && isFace(g.cardId, "VEN", 22))) {
    for (const id of cards) {
      banishCard(s, p, id);
      emitGameEvent(s, "banish", p, id);
    }
    return;
  }
  burnToTrash(s, p, ...cards);
}
/** Main-deck cards bypass Endless Riches' replacement. */
export function burnToTrash(s: GameState, p: PlayerId, ...cards: string[]) {
  const player = s.players[p];
  player.trashCards = trashCards(s, p);
  for (const cardId of cards) {
    player.discard.push(cardId);
    player.trashCards.push({ id: `trash:${p}:${s.nextId++}`, cardId });
  }
}

export function takeTrashAt(s: GameState, p: PlayerId, index: number) {
  if (index < 0 || index >= s.players[p].discard.length) return undefined;
  const player = s.players[p];
  player.trashCards = trashCards(s, p);
  player.trashCards.splice(index, 1);
  return player.discard.splice(index, 1)[0];
}

export function takeTrash(s: GameState, p: PlayerId, id: string) {
  return takeTrashAt(
    s,
    p,
    trashCards(s, p).findIndex((card) => card.id === id),
  );
}

export function emptyTrash(s: GameState, p: PlayerId) {
  const cards = s.players[p].discard;
  s.players[p].discard = [];
  s.players[p].trashCards = [];
  return cards;
}

export function trashTargets(s: GameState, p: PlayerId, e: Effect) {
  return s.players.flatMap((player) =>
    (e.who === "all" ||
    (e.who === "opponent" ? player.id !== p : player.id === p)
      ? trashCards(s, player.id)
      : []
    )
      .filter(({ cardId }) => {
        const card = getCard(cardId);
        return (
          (!e.cardTypes ||
            e.cardTypes.some((type) => isCardType(card, type))) &&
          (!e.cardTags || e.cardTags.some((tag) => card.tags.includes(tag))) &&
          (e.maxEnergy === undefined || (card.energy ?? 0) <= e.maxEnergy) &&
          (e.maxPower === undefined || (card.power ?? 0) <= e.maxPower) &&
          (e.condition !== "hidden" || /\[Hidden\]/.test(card.text))
        );
      })
      .map((card) => ({ ...card, owner: player.id })),
  );
}
