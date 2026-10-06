import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import { gearStatuses, unitStatuses } from "../src/game/status-presentation";
import type { GameState, Gear, Unit } from "../src/game/types";

const unit = (overrides: Partial<Unit> = {}): Unit => ({
  id: "unit",
  cardId: "ogn-049-298",
  owner: 0,
  location: "base:0",
  ready: true,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
  ...overrides,
});
function fixture(): GameState {
  const game = createGame({ seed: 816 });
  game.phase = "main";
  game.turn = 6;
  game.currentPlayer = game.priorityPlayer = game.focusPlayer = 0;
  game.stack = [];
  game.pendingChoice = null;
  game.pendingTriggers = [];
  game.combat = null;
  game.units = [];
  game.gears = [];
  for (const player of game.players) {
    player.legendId = "ogn-251-298";
    player.hand = [];
    player.discard = [];
    player.deck = Array(20).fill("ogn-049-298");
    player.runes = [];
    player.runeDeck = Array(12).fill("Body");
    player.energy = player.power = 30;
    player.hasBegun = true;
    player.championAvailable = false;
    player.points = 0;
  }
  for (const field of game.fields) {
    field.cardId = "ogn-275-298";
    field.controller = null;
  }
  return game;
}
const ids = (game: GameState, target: Unit) =>
  unitStatuses(game, target).map((status) => status.id);

describe("public card status presentation", () => {
  it("ignores readiness and historical flags without mutating game state", () => {
    const game = fixture();
    const target = unit({
      ready: false,
      token: true,
      playedFromHidden: true,
      additionalCostPaid: true,
      empowerCount: 4,
      movesTurn: 6,
      movesThisTurn: 1,
      usedAbilities: ["used"],
    });
    game.units = [target];
    const before = structuredClone(game);
    expect(unitStatuses(game, target)).toEqual([]);
    expect(game).toEqual(before);
  });

  it("shows simultaneous stun, damage, buffs and signed Might with separate meanings", () => {
    const game = fixture();
    game.players[0].buffBonus = 3;
    const statuses = unitStatuses(
      game,
      unit({
        stunned: true,
        damage: 2,
        buff: 1,
        temporaryMight: -3,
        temporaryAssault: 2,
        combatShield: 2,
        empowered: true,
      }),
    );
    expect(statuses.map((status) => status.id)).toEqual([
      "stunned",
      "damage",
      "buff",
      "might",
      "assault",
      "shield",
      "empowered",
    ]);
    expect(statuses.find((status) => status.id === "buff")?.values).toEqual({
      count: 1,
    });
    expect(statuses.find((status) => status.id === "might")).toMatchObject({
      label: "Might {amount}",
      mark: "−3",
      tone: "negative",
      values: { amount: "−3" },
    });
  });

  it("only shows turn-scoped protection, vulnerability, movement and death effects during their exact turn", () => {
    const game = fixture();
    const target = unit({
      preventNextDamageTurn: 6,
      doubleDamageTurn: 6,
      damageDoublings: 2,
      moveLockedTurn: 6,
      deathReplacementTurn: 6,
    });
    const active = unitStatuses(game, target);
    expect(active.map((status) => status.id)).toEqual([
      "prevent-next-damage",
      "vulnerable",
      "move-locked",
      "death-ward",
    ]);
    expect(active.find((status) => status.id === "vulnerable")).toMatchObject({
      mark: "×4",
      values: { count: 4 },
      detail: "Incoming damage is multiplied this turn.",
    });
    for (const turn of [5, 7]) {
      game.turn = turn;
      expect(unitStatuses(game, target)).toEqual([]);
    }
  });

  it("keeps base Might zero visible and distinguishes consumable from effect-wide protection", () => {
    const game = fixture();
    game.preventEffectDamageTurn = game.turn;
    const target = unit({
      preventDamage: 7,
      baseMightOverride: 0,
      untargetableByEnemy: true,
    });
    expect(ids(game, target)).toEqual([
      "prevent-damage",
      "untargetable",
      "base-might",
      "effect-shield",
    ]);
    expect(
      unitStatuses(game, target).find((status) => status.id === "base-might")
        ?.values,
    ).toEqual({ count: 0 });
    game.turn++;
    expect(ids(game, target)).not.toContain("effect-shield");
  });

  it("deduplicates printed and granted keywords and translates internal block markers", () => {
    const game = fixture();
    const target = unit({
      cardId: "ogn-013-298",
      temporaryKeywords: [
        "Deflect",
        "Ganking",
        "Ganking",
        "Tank",
        "OGN Block Shield 3",
        "OGN Block Shield 3",
        "Unknown engine sentinel",
      ],
    });
    const statuses = unitStatuses(game, target);
    expect(statuses.map((status) => status.id)).toEqual([
      "block-shield",
      "keyword:ganking",
      "keyword:tank",
    ]);
    expect(statuses[0].values).toEqual({ amount: "+6" });
    expect(JSON.stringify(statuses)).not.toMatch(
      /OGN Block|Unknown engine|Deflect/,
    );
  });

  it("reflects battlefield-granted keywords only while the unit remains there", () => {
    const game = fixture();
    game.fields[0].cardId = "ogn-297-298";
    const target = unit({ location: "field:0" });
    expect(ids(game, target)).toContain("keyword:ganking");
    target.location = "base:0";
    expect(ids(game, target)).not.toContain("keyword:ganking");
  });

  it("shows conditional and damage-prevention rules while leaving inherent normal keywords on the card", () => {
    const game = fixture();
    const conditional = unit({ cardId: "sfd-143-221" });
    expect(ids(game, conditional)).not.toContain("keyword:ganking");
    game.players[0].powerSpentThisTurn = 2;
    expect(ids(game, conditional)).toContain("keyword:ganking");
    expect(ids(game, unit({ cardId: "sfd-082-221" }))).toContain(
      "keyword:no-combat-damage",
    );
    const invulnerable = unit({
      cardId: "ogn-189-298",
      movesTurn: game.turn,
      movesThisTurn: 2,
    });
    expect(ids(game, invulnerable)).toContain("keyword:prevent-all-damage");
    game.turn++;
    expect(ids(game, invulnerable)).not.toContain("keyword:prevent-all-damage");
  });

  it("removes expiring markers through the real end-turn flow while retaining a buff and empowerment", () => {
    let game = fixture();
    game.units = [
      unit({
        stunned: true,
        damage: 1,
        buff: 1,
        empowered: true,
        temporaryMight: 2,
        temporaryAssault: 1,
        preventDamage: 3,
        untargetableByEnemy: true,
        baseMightOverride: 4,
        temporaryKeywords: ["Ganking"],
        preventNextDamageTurn: game.turn,
        doubleDamageTurn: game.turn,
        moveLockedTurn: game.turn,
        deathReplacementTurn: game.turn,
      }),
    ];
    expect(ids(game, game.units[0]).length).toBeGreaterThan(10);
    game = applyAction(game, "end-turn");
    expect(game.turn).toBe(7);
    expect(ids(game, game.units[0])).toEqual(["buff", "empowered"]);
  });

  it("adds the stun marker only in the stepped frame where the spell has resolved", () => {
    let game = fixture();
    game.units = [unit({ id: "enemy", owner: 1, location: "base:1" })];
    game.players[0].hand = ["ogn-050-298"];
    const play = getLegalActions(game, 0).find(
      (action) =>
        action.cardId === "ogn-050-298" && action.targetId === "enemy",
    );
    expect(play).toBeDefined();
    const announced = applyActionStepped(game, play!);
    expect(
      announced.frames.every(
        (frame) => !ids(frame.state, frame.state.units[0]).includes("stunned"),
      ),
    ).toBe(true);
    game = announced.state;
    const frames = [...announced.frames];
    for (let count = 0; count < 10 && game.stack.length; count++) {
      const pass = getLegalActions(game, game.priorityPlayer).find(
        (action) => action.category === "pass",
      );
      expect(pass).toBeDefined();
      const result = applyActionStepped(game, pass!);
      frames.push(...result.frames);
      game = result.state;
    }
    expect(game.units[0].stunned).toBe(true);
    expect(
      frames.some((frame) =>
        ids(frame.state, frame.state.units[0]).includes("stunned"),
      ),
    ).toBe(true);
    for (const frame of frames)
      expect(ids(frame.state, frame.state.units[0]).includes("stunned")).toBe(
        frame.state.units[0].stunned,
      );
  });

  it("distinguishes Temporary lifetime from end-of-turn modifiers on units and gear", () => {
    let game = fixture();
    game.units = [unit({ temporary: true })];
    const gear: Gear = {
      id: "gear",
      cardId: "ogn-021-298",
      owner: 0,
      ready: false,
      empowered: true,
      temporary: true,
    };
    game.gears = [gear];
    expect(gearStatuses(game, gear).map((status) => status.id)).toEqual([
      "empowered",
      "temporary",
    ]);
    expect(unitStatuses(game, game.units[0])[0].detail).toBe(
      "Dies at the beginning of its controller's next turn.",
    );
    game = applyAction(game, "end-turn");
    expect(game.units).toHaveLength(1);
    expect(game.gears).toHaveLength(1);
    for (let count = 0; count < 10 && game.stack.length; count++) {
      const pass = getLegalActions(game, game.priorityPlayer).find(
        (action) => action.category === "pass",
      );
      expect(pass).toBeDefined();
      game = applyAction(game, pass!);
    }
    game = applyAction(game, "end-turn");
    expect(game.units).toHaveLength(0);
    expect(game.gears).toHaveLength(0);
  });
});
