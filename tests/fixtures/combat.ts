import { createGame, getCombatPower } from "../../src/game/engine";
import type { GameState, PlayerId, Unit } from "../../src/game/types";

export const combatUnit = (
  id: string,
  owner: PlayerId,
  might = 3,
  cardId = "ogn-175-298",
): Unit => ({
  id,
  owner,
  cardId,
  location: "field:0",
  ready: false,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
  baseMightOverride: might,
});

/** A valid 2v2 state with two target choices, prevention, casualties and recall. */
export function createCombatFixture(): GameState {
  const s = createGame({
    seed: 20261002,
    playerDeckId: "annie",
    botDeckId: "lux",
    firstPlayer: 0,
  });
  s.turn = 5;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.focusPlayer = 0;
  s.phase = "damage";
  s.fields[0] = { id: "field:0", cardId: "ogn-275-298", controller: 1 };
  s.units = [
    { ...combatUnit("attacker-front", 0, 4, "ogn-049-298"), damage: 2 },
    { ...combatUnit("attacker-guard", 0, 3), preventDamage: 3 },
    { ...combatUnit("defender-guard", 1, 4, "ogn-088-298"), preventDamage: 2 },
    combatUnit("defender-front", 1, 3, "ogn-219-298"),
  ];
  s.stack = [];
  s.combat = {
    fieldId: "field:0",
    attacker: 0,
    defender: 1,
    stage: "assign",
    engaged: true,
    designatedUnits: s.units.map((u) => u.id),
    total: [7, 7],
    remaining: [7, 7],
    assignments: [{}, {}],
    assigningPlayer: 0,
  };
  for (const p of s.players) {
    p.hand = [];
    p.runes = [];
    p.energy = 0;
    p.championAvailable = false;
    p.points = 0;
    p.hasBegun = true;
    p.mulliganDone = true;
    p.scoredFieldsThisTurn = [];
    p.cardsPlayedThisTurn = 0;
    s.combat.total[p.id] = s.units
      .filter((u) => u.owner === p.id)
      .reduce((sum, u) => sum + getCombatPower(s, u), 0);
    s.combat.remaining[p.id] = s.combat.total[p.id];
  }
  return s;
}
