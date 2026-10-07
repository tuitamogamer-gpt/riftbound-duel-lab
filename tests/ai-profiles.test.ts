import { describe, expect, it } from "vitest";
import { officialPreconDecks } from "../src/data/decks";
import { validateImportedDeck } from "../src/game/deck-import";
import { createGame, getMight } from "../src/game/engine";
import { cardStrategy, inferProfile } from "../src/game/ai/config";
import { evaluate } from "../src/game/ai/evaluate";
import {
  getObservation,
  observationRulesView,
} from "../src/game/ai/observation";
import {
  benchmarkDeckPairs,
  benchmarkList,
  mixedBenchmarkDecks,
} from "../scripts/bot-benchmark-decks";
import { combatUnit } from "./fixtures/combat";

const copies = (ids: string[]) => ids.flatMap((id) => [id, id, id]);
function position() {
  const game = createGame({ seed: 44 });
  game.turn = 5;
  game.phase = "main";
  game.priorityPlayer = game.currentPlayer = 0;
  game.units = [];
  for (const player of game.players) {
    player.hand = [];
    player.discard = [];
    player.runes = [];
    player.energy = 0;
    player.championAvailable = false;
    player.legendUsedTurn = game.turn;
  }
  return game;
}

describe("known-list themes and public synergy estimates", () => {
  it.each([
    ["equipment", ["sfd-190-221", "sfd-192-221"]],
    ["xp", ["unl-034-219", "unl-047-219"]],
    ["tokens", ["ogs-015-024", "sfd-076-221"]],
    ["recursion", ["ogn-170-298", "ogn-165-298"]],
  ] as const)(
    "recognizes %s from known card rules without the deck name",
    (profile, ids) => {
      const list = copies([...ids]);
      expect(inferProfile(list)).toBe(profile);
      expect(inferProfile([...list].reverse())).toBe(profile);
    },
  );
  it("scales theme density for larger decks and handles masked cards", () => {
    const splash = [
      ...copies(["sfd-190-221", "sfd-192-221"]),
      ...Array<string>(60).fill("ogn-001-298"),
    ];
    expect(inferProfile(splash)).toBe("big-units");
    expect(inferProfile(["unknown", "unknown"])).toBe("aggressive");
    expect(cardStrategy("ogn-170-298").recursion).toBe(true);
    expect(cardStrategy("sfd-190-221").equipment).toBe(true);
  });
  it("values reusable public gear even without a bearer, then values an attachment without counting its Might twice", () => {
    const game = position();
    game.gears = [
      { id: "blade", cardId: "sfd-056-221", owner: 0, ready: true },
    ];
    expect(evaluate(game, 0, "equipment").material).toBeGreaterThan(0);
    game.units = [
      { ...combatUnit("bearer", 0, 3, "ogn-175-298"), location: "base:0" },
    ];
    const plain = structuredClone(game);
    plain.gears = [];
    const baseMight = getMight(plain, plain.units[0]);
    game.gears[0].attachedTo = "bearer";
    game.units[0].gear = ["blade"];
    const mightGain = getMight(game, game.units[0]) - baseMight;
    const gain =
      evaluate(game, 0, "equipment").material -
      evaluate(plain, 0, "equipment").material;
    expect(mightGain).toBe(3);
    expect(gain).toBeGreaterThan(mightGain);
    expect(gain).toBeLessThan(mightGain * 2);
    const temporary = structuredClone(game);
    temporary.gears[0].temporary = true;
    expect(evaluate(temporary, 0, "equipment").material).toBeLessThan(
      evaluate(game, 0, "equipment").material,
    );
  });
  it("recognizes the publicly stored Level 3 and Level 6 XP thresholds and discounts excess reserves", () => {
    const game = position();
    const value = (xp: number) => {
      game.players[0].xp = xp;
      return evaluate(game, 0, "xp").resources;
    };
    expect(value(3) - value(2)).toBeGreaterThan(value(2) - value(1));
    expect(value(6) - value(5)).toBeGreaterThan(value(5) - value(4));
    expect(value(7) - value(6)).toBeLessThan(value(5) - value(4));
  });
  it("values a unit-retrieval card only when public trash has a matching unit", () => {
    const game = position();
    game.players[0].hand = ["ogn-170-298"];
    game.players[0].energy = 6;
    game.players[0].discard = ["ogn-004-298"];
    const spellOnly = evaluate(game, 0, "recursion").options;
    game.players[0].discard = ["ogn-175-298"];
    expect(evaluate(game, 0, "recursion").options).toBeGreaterThan(spellOnly);
  });
  it("does not inspect opposing hand, deck order, or facedown identities for synergy estimates", () => {
    const game = position();
    game.players[1].hand = ["sfd-190-221", "unl-047-219"];
    game.hidden = [
      {
        id: "secret",
        cardId: "ogn-005-298",
        owner: 1,
        location: "field:1",
        hiddenTurn: 3,
      },
    ];
    const before = getObservation(game, 0);
    const altered = structuredClone(game);
    altered.players[1].hand = ["ogn-170-298", "sfd-076-221"];
    altered.players[1].deck.reverse();
    altered.hidden![0].cardId = "sfd-190-221";
    const after = getObservation(altered, 0);
    expect(after).toEqual(before);
    expect(evaluate(observationRulesView(after), 0, "equipment")).toEqual(
      evaluate(observationRulesView(before), 0, "equipment"),
    );
  });
});

describe("fresh catalog benchmark coverage", () => {
  it("covers all 13 precons and three playable mixed imports in eight paired matchups", () => {
    const mixed = mixedBenchmarkDecks();
    expect(mixed).toHaveLength(3);
    for (const deck of mixed) {
      expect(
        validateImportedDeck(deck).filter(
          (issue) => issue.severity === "error",
        ),
      ).toEqual([]);
      expect(benchmarkList(deck)).toHaveLength(39);
      expect(deck.id).toMatch(/^import-/);
    }
    const pairs = benchmarkDeckPairs(true);
    expect(pairs).toHaveLength(8);
    const ids = new Set(pairs.flat().map((deck) => deck.id));
    expect(ids.size).toBe(16);
    for (const deck of officialPreconDecks) expect(ids.has(deck.id)).toBe(true);
    expect(mixed.map((deck) => inferProfile(benchmarkList(deck)))).toEqual([
      "equipment",
      "xp",
      "tokens",
    ]);
  });
});
