import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import { starterDecks, type StarterDeck } from "../src/data/decks";
import {
  applyAction,
  createGame,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import { getRulesCardId } from "../src/game/scripts";
import { cardWave13Scripts } from "../src/game/card-wave13";
import { cardWave14Scripts } from "../src/game/card-wave14";
import { cardWave15Scripts } from "../src/game/card-wave15";
import { parseSession } from "../src/persistence";
import type { GameState } from "../src/game/types";

const added = {
  ...cardWave13Scripts,
  ...cardWave14Scripts,
  ...cardWave15Scripts,
};
function deck(set: string, seed: number): StarterDeck {
  const pool = [
    ...new Set(
      Object.keys(added)
        .filter((id) => !getCard(id).variant)
        .map(getRulesCardId),
    ),
  ];
  const pick = (type: string, count: number) => {
    const matching = pool.filter((id) => getCard(id).type === type);
    expect(matching.length).toBeGreaterThan(0);
    return Array.from(
      { length: count },
      (_, n) => matching[(seed * 11 + n * 3) % matching.length],
    );
  };
  // Deliberately mixed-domain engine fixtures exercise interactions, not deck-format validation.
  return {
    ...starterDecks[0],
    id: `catalog-${set}-${seed}`,
    main: [...pick("Unit", 8), ...pick("Spell", 3), ...pick("Gear", 2)].map(
      (cardId) => ({ cardId, count: 3 }),
    ),
    runes: ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map((domain) => ({
      cardId: cards.find(
        (card) =>
          card.type === "Rune" &&
          card.domains[0] === domain &&
          card.set === "OGN",
      )!.id,
      count: 2,
    })),
  };
}
function conservation(s: GameState) {
  for (const p of s.players) {
    const count =
      p.deck.length +
      p.hand.length +
      p.discard.length +
      p.banished.length +
      Number(p.championAvailable) +
      s.units.filter((u) => u.owner === p.id && !u.token).length +
      s.gears.filter((g) => g.owner === p.id && !g.token).length +
      s.stack.filter((i) => i.player === p.id && i.kind === "spell").length +
      (s.pendingPlays ?? []).filter((i) => i.player === p.id).length +
      (s.resolving ?? []).filter((i) => i.player === p.id).length +
      (s.hidden ?? []).filter((h) => h.owner === p.id).length;
    expect(count, `card count ${p.deckId} turn ${s.turn}`).toBe(40);
    expect(p.runes.length + p.runeDeck.length).toBe(12);
    expect(Number.isFinite(p.energy) && p.energy >= 0).toBe(true);
  }
}
describe("next 100 card effects in complete mixed-deck games", () => {
  for (const seed of [31, 71])
    for (const [a, b] of [["import-A", "import-B"]]) {
      it(`${a} versus ${b}, seed ${seed}: legal progress, read-only queries and resumable choices`, () => {
        let s = createGame({
          playerDeck: deck(a, seed),
          botDeck: deck(b, seed + 1),
          seed,
        });
        for (let step = 0; step < 3000 && s.winner === null; step++) {
          conservation(s);
          const before = JSON.stringify(s);
          const legal = getLegalActions(s, s.priorityPlayer);
          for (const unit of s.units)
            expect(Number.isFinite(getMight(s, unit))).toBe(true);
          const action = getBotAction(s);
          expect(
            JSON.stringify(s),
            "queries must not mutate saved match state",
          ).toBe(before);
          expect(
            action,
            `${a}/${b} turn ${s.turn} phase ${s.phase}`,
          ).not.toBeNull();
          expect(legal.some((a) => a.id === action!.id)).toBe(true);
          s = applyAction(s, action!);
          if (s.pendingChoice || step % 50 === 0) {
            const restored = parseSession(
              JSON.stringify({ match: s, review: null }),
            ).match;
            expect(restored, `${a}/${b} save turn ${s.turn}`).toEqual(s);
            s = restored!;
          }
        }
        expect(
          s.winner,
          `${a}/${b} stopped at turn ${s.turn}/${s.phase}`,
        ).not.toBeNull();
        conservation(s);
      }, 60_000);
    }
});
