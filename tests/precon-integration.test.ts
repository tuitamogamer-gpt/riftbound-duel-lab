import { describe, it, expect } from "vitest";
import { officialPreconDecks, validateDeck } from "../src/data/decks";
import { cardsById, getCard } from "../src/data/cards";
import {
  getDeckScriptCoverage,
  exportDeckText,
  parseDeckText,
} from "../src/game/deck-import";
import {
  createGame,
  applyAction,
  getLegalActions,
  applyActionStepped,
} from "../src/game/engine";
import { getBotAction } from "../src/game/bot";
import { parseSession, validState } from "../src/persistence";
import type { GameState } from "../src/game/types";

function conserved(s: GameState) {
  for (const p of s.players) {
    const ids = [
      ...p.deck,
      ...p.hand,
      ...p.discard,
      ...p.banished,
      ...s.units
        .filter((u) => u.owner === p.id && !u.token)
        .map((u) => u.cardId),
      ...s.gears
        .filter(
          (g) =>
            g.owner === p.id && !(g as typeof g & { token?: boolean }).token,
        )
        .map((g) => g.cardId),
      ...s.stack
        .filter((x) => x.player === p.id && x.kind === "spell")
        .map((x) => x.cardId),
      ...(s.resolving ?? [])
        .filter((x) => x.player === p.id)
        .map((x) => x.cardId),
      ...(p.championAvailable ? [p.championId] : []),
      ...(s.hidden ?? []).filter((h) => h.owner === p.id).map((h) => h.cardId),
    ];
    expect(ids.length, `${p.deckId}: card conservation turn${s.turn}`).toBe(40);
    expect(p.runes.length + p.runeDeck.length).toBe(12);
    for (const id of ids) expect(cardsById[id]).toBeDefined();
    expect(Number.isFinite(p.energy) && p.energy >= 0).toBe(true);
  }
}
describe("official preconstructed library", () => {
  it("imports every published product with exact card totals and full script coverage", () => {
    expect(officialPreconDecks).toHaveLength(13);
    for (const deck of officialPreconDecks) {
      expect(validateDeck(deck), deck.id).toEqual([]);
      expect(getDeckScriptCoverage(deck).missing, deck.id).toEqual([]);
      const imported = parseDeckText(exportDeckText(deck), {
        format: "historical-precon",
      });
      expect(
        imported.issues.filter((i) => i.severity === "error"),
        deck.id,
      ).toEqual([]);
      expect(imported.deck?.main, deck.id).toEqual(deck.main);
      expect(imported.playable, deck.id).toBe(true);
    }
  });
  it("uses each selected precon battlefield pool deterministically", () => {
    const a = officialPreconDecks.find((d) => d.id === "precon-shen")!,
      b = officialPreconDecks.find((d) => d.id === "precon-zed")!;
    for (const seed of [1, 12, 413]) {
      const s = createGame({ playerDeck: a, botDeck: b, seed });
      expect(a.battlefieldIds).toContain(s.fields[0].cardId);
      expect(b.battlefieldIds).toContain(s.fields[1].cardId);
      expect(createGame({ playerDeck: a, botDeck: b, seed })).toEqual(s);
    }
  });
});
describe("complete precon games and saves", () => {
  for (const [index, deck] of officialPreconDecks.entries())
    it(
      `${deck.name} plays a full legal game with preserved cards and resumable choices`,
      async () => {
        const other =
          officialPreconDecks[(index + 1) % officialPreconDecks.length];
        let s = createGame({
          playerDeck: deck,
          botDeck: other,
          seed: 103 + index,
        });
        let count = 0;
        const seen = new Set<string>();
        while (s.winner === null && count < 3500) {
          conserved(s);
          const legal = getLegalActions(s, s.priorityPlayer);
          const a = getBotAction(s);
          expect(a, `${deck.id} ${s.turn} ${s.phase}`).not.toBeNull();
          expect(legal.some((x) => x.id === a!.id)).toBe(true);
          const signature = JSON.stringify({ ...s, log: [], nextId: 0 });
          expect(seen.has(signature), `Stall ${deck.id} ${a!.id}`).toBe(false);
          seen.add(signature);
          const result = applyActionStepped(s, a!);
          expect(result.state).toEqual(applyAction(s, a!));
          s = result.state;
          if (s.pendingChoice || count % 40 === 0) {
            expect(
              validState(s),
              `${deck.id} saved ${s.phase} ${s.pendingChoice?.kind}`,
            ).toBe(true);
            expect(
              parseSession(JSON.stringify({ match: s, review: null })).match,
            ).toEqual(s);
          }
          count++;
          // Keep Vitest's result IPC responsive during CPU-heavy deterministic games.
          if (count % 25 === 0)
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        expect(
          s.winner,
          `${deck.id} stopped at ${s.turn}/${s.phase} after ${count} actions`,
        ).not.toBeNull();
        conserved(s);
        // This unchanged Viktor game measured 68.7s on the shared runner.
      },
      deck.id === "precon-viktor" ? 120_000 : 60_000,
    );
});
