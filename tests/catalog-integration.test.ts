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
import { originsExtraScripts } from "../src/game/origins-extra";
import { spiritforgedExtraScripts } from "../src/game/spiritforged-extra";
import { originsMoreScripts } from "../src/game/origins-more";
import { unleashedExtraScripts } from "../src/game/unleashed-extra";
import { vendettaExtraScripts } from "../src/game/vendetta-extra";
import { originsWave3Scripts } from "../src/game/origins-wave3";
import { unleashedWave3Scripts } from "../src/game/unleashed-wave3";
import { vendettaWave3Scripts } from "../src/game/vendetta-wave3";
import { originsWave4Scripts } from "../src/game/origins-wave4";
import { vendettaWave4Scripts } from "../src/game/vendetta-wave4";
import { unleashedWave4Scripts } from "../src/game/unleashed-wave4";
import { cardWave7Scripts } from "../src/game/card-wave7";
import { parseSession } from "../src/persistence";
import type { GameState } from "../src/game/types";

const added = {
  ...cardWave7Scripts,
  ...originsExtraScripts,
  ...spiritforgedExtraScripts,
  ...originsMoreScripts,
  ...unleashedExtraScripts,
  ...vendettaExtraScripts,
  ...originsWave3Scripts,
  ...unleashedWave3Scripts,
  ...vendettaWave3Scripts,
  ...originsWave4Scripts,
  ...vendettaWave4Scripts,
  ...unleashedWave4Scripts,
};
function deck(set: string, seed: number): StarterDeck {
  const pool = [
    ...new Set(
      Object.keys(added)
        .filter((id) => getCard(id).set === set)
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
      (s.resolving ?? []).filter((i) => i.player === p.id).length +
      (s.hidden ?? []).filter((h) => h.owner === p.id).length;
    expect(count, `card count ${p.deckId} turn ${s.turn}`).toBe(40);
    expect(p.runes.length + p.runeDeck.length).toBe(12);
    expect(Number.isFinite(p.energy) && p.energy >= 0).toBe(true);
  }
}
describe("additional catalog cards in mixed expansion games", () => {
  for (const seed of [17, 41, 61, 97])
    for (const [a, b] of [
      ["OGN", "UNL"],
      ["SFD", "VEN"],
      ["VEN", "OGN"],
      ["UNL", "SFD"],
    ]) {
      it(`${a} versus ${b}, seed ${seed}: legal progress, read-only queries and resumable choices`, async () => {
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
          // Long deterministic games must also let the worker receive runner IPC.
          if (step % 25 === 24)
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        expect(
          s.winner,
          `${a}/${b} stopped at turn ${s.turn}/${s.phase}`,
        ).not.toBeNull();
        conservation(s);
        // Preserve the complete game and every invariant when deterministic bot
        // planning shares the runner with the full precon matrix.
      }, 240_000);
    }
});
