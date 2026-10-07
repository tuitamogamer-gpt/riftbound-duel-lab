import type { GameState, PlayerId } from "./types";

export function banishedCards(s: GameState, p: PlayerId) {
  return s.players[p].banished.map((cardId, i) => {
    const saved = s.players[p].banishedCards?.[i];
    return saved?.cardId === cardId
      ? saved
      : { id: `banished:${p}:legacy:${i}:${cardId}`, cardId };
  });
}
export function banishCard(s: GameState, p: PlayerId, cardId: string) {
  s.players[p].banishedCards = banishedCards(s, p);
  const entry = { id: `banished:${p}:${s.nextId++}`, cardId };
  s.players[p].banished.push(cardId);
  s.players[p].banishedCards!.push(entry);
  return entry.id;
}
export function takeBanished(s: GameState, p: PlayerId, id: string) {
  s.players[p].banishedCards = banishedCards(s, p);
  const index = s.players[p].banishedCards!.findIndex((c) => c.id === id);
  if (index < 0) return undefined;
  s.players[p].banishedCards!.splice(index, 1);
  return s.players[p].banished.splice(index, 1)[0];
}
