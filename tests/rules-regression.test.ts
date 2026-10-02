import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions, getMight, type GameAction, type GameState, type LocationId, type PlayerId, type Unit } from '../src/game/engine';

// External rules expectations: official Core Rules 2026-07-16, cited in
// docs/RULES-RESEARCH.md. Fixtures isolate the rule under test from deck draws.
const card = (n: number) => `ogn-${String(n).padStart(3, '0')}-298`;
const starter = (n: number) => `ogs-${String(n).padStart(3, '0')}-024`;

function take(s: GameState, predicate: string | ((a: GameAction) => boolean)): GameState {
  const action = getLegalActions(s, s.priorityPlayer).find(typeof predicate === 'string' ? (a) => a.id === predicate : predicate);
  expect(action, `Missing legal action in ${s.phase}: ${String(predicate)}`).toBeDefined();
  return applyAction(s, action!);
}

function start(firstPlayer: PlayerId = 0): GameState {
  let s = createGame({ seed: 20261002, playerDeckId: 'annie', botDeckId: 'lux', firstPlayer });
  s = take(s, 'mulligan:');
  s = take(s, 'mulligan:');
  return s;
}

function position(): GameState {
  const s = start();
  s.turn = 5;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.focusPlayer = 0;
  s.phase = 'main';
  s.units = [];
  s.stack = [];
  s.combat = null;
  s.pendingMove = null;
  s.chainStarter = null;
  s.consecutivePasses = 0;
  for (const p of s.players) {
    p.hand = [];
    p.runes = [];
    p.energy = 0;
    p.championAvailable = false;
    p.points = 0;
    p.hasBegun = true;
    p.scoredFieldsThisTurn = [];
    p.cardsPlayedThisTurn = 0;
  }
  return s;
}

function unit(id: string, owner: PlayerId, location: LocationId, cardId = card(175), ready = true): Unit {
  return { id, owner, location, cardId, ready, damage: 0, buff: 0, temporaryMight: 0, temporaryAssault: 0, stunned: false, gear: [], summonedTurn: 1 };
}

function resources(s: GameState, player: PlayerId, domains: string[]) {
  s.players[player].runes = domains.map((domain, i) => ({ id: `${player}-r${i}`, domain, ready: true }));
}

function resolveChain(s: GameState): GameState {
  for (let i = 0; i < 30 && (s.stack.length || s.phase === 'choice'); i++) {
    if (s.phase === 'choice') s = take(s, () => true);
    else s = take(s, 'pass');
  }
  expect(s.stack).toHaveLength(0);
  return s;
}

function moveTo(s: GameState, id: string, locationId: LocationId): GameState {
  s = take(s, a => a.category === 'move' && a.sourceId === id && a.locationId === locationId && a.id.startsWith('move-start:'));
  return take(s, 'move-confirm');
}

function passShowdown(s: GameState): GameState {
  s = take(s, 'pass');
  return take(s, 'pass');
}

describe('official Duel setup and turns (103, 117, 315, 485)', () => {
  it('starts with four cards, a separate chosen champion, and twelve unchanneled runes', () => {
    const s = createGame({ seed: 4 });
    for (const p of s.players) {
      expect(p.hand).toHaveLength(4);
      expect(p.deck).toHaveLength(35);
      expect(p.championAvailable).toBe(true);
      expect(p.runeDeck).toHaveLength(12);
      expect(p.runes).toHaveLength(0);
    }
  });

  it('draws on both first turns and gives only the second player the extra rune', () => {
    let s = start();
    expect(s.currentPlayer).toBe(0);
    expect(s.players[0].runes).toHaveLength(2);
    expect(s.players[0].hand).toHaveLength(5);
    s = resolveChain(take(s, 'end-turn'));
    expect(s.currentPlayer).toBe(1);
    expect(s.players[1].runes).toHaveLength(3);
    expect(s.players[1].hand).toHaveLength(5);
  });

  it('applies the extra-rune rule to the second turn rather than a fixed player', () => {
    let s = start(1);
    expect(s.currentPlayer).toBe(1);
    expect(s.players[1].runes).toHaveLength(2);
    s = take(s, 'end-turn');
    expect(s.currentPlayer).toBe(0);
    expect(s.players[0].runes).toHaveLength(3);
  });

  it('draws mulligan replacements before recycling the selected cards', () => {
    const s = createGame({ seed: 3 });
    s.players[0].hand = [card(1), card(4), card(5), card(9)];
    s.players[0].deck = [card(10), card(12), card(13), card(49), card(52), card(54), card(55)];
    const next = take(s, 'mulligan:0,1');
    expect(next.players[0].hand).toEqual([card(5), card(9), card(10), card(12)]);
    expect(next.players[0].deck.slice(0, 5)).toEqual([card(13), card(49), card(52), card(54), card(55)]);
    expect(next.players[0].deck.slice(5).sort()).toEqual([card(1), card(4)].sort());
    expect(s.players[0].hand).toHaveLength(4); // Reducer must retain prior snapshots.
  });
});

describe('entry, payment, and movement (143, 144, 163, 805)', () => {
  it('normal units enter exhausted and cannot immediately standard-move', () => {
    let s = position();
    s.players[0].hand = [card(175)];
    resources(s, 0, ['Fury', 'Fury', 'Chaos']);
    s = take(s, a => a.category === 'play' && a.cardId === card(175) && a.locationId === 'base:0');
    const deployed = s.units.find(u => u.cardId === card(175))!;
    expect(deployed.ready).toBe(false);
    expect(getLegalActions(s, 0).some(a => a.category === 'move' && a.sourceId === deployed.id)).toBe(false);
  });

  it('may spend the same rune for energy and power when accelerating', () => {
    let s = position();
    s.players[0].hand = [card(10)];
    resources(s, 0, ['Fury', 'Chaos', 'Chaos']);
    const oldRuneDeck = s.players[0].runeDeck.length;
    s = take(s, a => a.cardId === card(10) && a.id.endsWith('|accelerate'));
    expect(s.units.find(u => u.cardId === card(10))?.ready).toBe(true);
    expect(s.players[0].runes).toHaveLength(2);
    expect(s.players[0].runeDeck).toHaveLength(oldRuneDeck + 1);
  });

  it('only Ganking units can standard-move between battlefields', () => {
    const s = position();
    s.units = [unit('ordinary', 0, 'field:0'), unit('ganker', 0, 'field:0', starter(9))];
    s.fields[0].controller = 0;
    const actions = getLegalActions(s, 0);
    expect(actions.some(a => a.sourceId === 'ordinary' && a.locationId === 'field:1')).toBe(false);
    expect(actions.some(a => a.sourceId === 'ganker' && a.locationId === 'field:1')).toBe(true);
    expect(actions.some(a => a.sourceId === 'ordinary' && a.locationId === 'base:0')).toBe(true);
  });

  it('permits a unit with a play trigger to enter an otherwise empty board', () => {
    const s = position();
    s.players[0].hand = [card(132), card(51)];
    resources(s, 0, Array(6).fill('Body'));
    const actions = getLegalActions(s, 0);
    expect(actions.some(a => a.cardId === card(132))).toBe(true);
    expect(actions.some(a => a.cardId === card(51))).toBe(true);
  });

  it('does not charge an enemy target Deflect as part of playing the unit itself', () => {
    const s = position();
    s.players[0].hand = [card(132)];
    s.players[0].energy = 3;
    s.units = [unit('enemy-poro', 1, 'base:1', card(13))];
    // First Mate can enter for its printed cost; an unpayable triggered ability
    // is then removed during finalization, without undoing the unit play.
    expect(getLegalActions(s, 0).some(a => a.category === 'play' && a.cardId === card(132))).toBe(true);
  });

  it('does not allow First Mate to select itself for its another-unit play trigger', () => {
    let s = position();
    s.players[0].hand = [card(132)];
    resources(s, 0, Array(3).fill('Body'));
    s.units = [unit('friend', 0, 'base:0', card(175), false), unit('enemy', 1, 'base:1', card(175), false)];
    s = take(s, a => a.category === 'play' && a.cardId === card(132));
    const mate = s.units.find(u => u.cardId === card(132))!;
    expect(s.phase).toBe('choice');
    const choices = getLegalActions(s, s.priorityPlayer);
    expect(choices.some(a => a.targetId === 'friend')).toBe(true);
    expect(choices.some(a => a.targetId === 'enemy')).toBe(true);
    expect(choices.some(a => a.targetId === mate.id)).toBe(false);
  });
});

describe('showdown, scoring, and winning point (344–348, 467–472)', () => {
  it('opens a response window before scoring an empty battlefield', () => {
    let s = position();
    s.units = [unit('attacker', 0, 'base:0')];
    s = moveTo(s, 'attacker', 'field:0');
    expect(s.phase).toBe('showdown');
    expect(s.players[0].points).toBe(0);
    expect(s.fields[0].controller).toBeNull();
    s = passShowdown(s);
    expect(s.players[0].points).toBe(1);
    expect(s.fields[0].controller).toBe(0);
  });

  it('does not grant attacking Might bonuses during a non-combat showdown', () => {
    let s = position();
    s.units = [unit('wielder', 0, 'base:0', card(55))];
    s = moveTo(s, 'wielder', 'field:0');
    expect(s.phase).toBe('showdown');
    expect(getMight(s, s.units[0])).toBe(2);
  });

  it('replaces a lone eighth-point conquest with a card, then allows the other field to win', () => {
    let s = position();
    s.players[0].points = 7;
    s.units = [unit('first', 0, 'base:0'), unit('second', 0, 'base:0')];
    const originalHand = s.players[0].hand.length;
    s = passShowdown(moveTo(s, 'first', 'field:0'));
    expect(s.winner).toBeNull();
    expect(s.players[0].points).toBe(7);
    expect(s.players[0].hand).toHaveLength(originalHand + 1);
    s = passShowdown(moveTo(s, 'second', 'field:1'));
    expect(s.players[0].points).toBe(8);
    expect(s.winner).toBe(0);
  });

  it('does not score or draw twice for the same battlefield during a turn', () => {
    let s = position();
    s.players[0].points = 7;
    s.players[0].scoredFieldsThisTurn = [0];
    s.units = [unit('recapturing', 0, 'base:0')];
    const handBefore = s.players[0].hand.length;
    s = passShowdown(moveTo(s, 'recapturing', 'field:0'));
    expect(s.players[0].points).toBe(7);
    expect(s.players[0].hand).toHaveLength(handBefore);
  });

  it('can win its eighth point by holding only one field', () => {
    let s = position();
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.players[0].points = 7;
    s.units = [unit('holder', 0, 'field:0')];
    s.fields[0].controller = 0;
    s = take(s, 'end-turn');
    expect(s.winner).toBe(0);
    expect(s.players[0].points).toBe(8);
  });
});

describe('card timing and cost distinctions (310, 340, 806, 809, 813)', () => {
  it('allows the opponent no unsolicited Reaction during neutral open main phase', () => {
    const s = position();
    s.players[1].hand = [card(58)];
    resources(s, 1, ['Body', 'Body']);
    s.units = [unit('friendly', 1, 'base:1')];
    expect(getLegalActions(s, 1)).toEqual([]);
  });

  it('allows Reaction but not Action in response to a spell', () => {
    let s = position();
    s.players[0].hand = [card(58)];
    s.players[1].hand = [card(58), starter(3)];
    resources(s, 0, ['Body', 'Body']);
    resources(s, 1, ['Fury', 'Fury']);
    s.units = [unit('target', 0, 'field:0')];
    s = take(s, a => a.cardId === card(58));
    if (s.priorityPlayer === 0) s = take(s, 'pass');
    const actions = getLegalActions(s, 1);
    expect(actions.some(a => a.cardId === card(58))).toBe(true);
    expect(actions.some(a => a.cardId === starter(3))).toBe(false);
  });

  it('passes showdown Focus only after the entire response chain resolves', () => {
    let s = position();
    s.players[0].hand = [starter(3)];
    s.players[1].hand = [card(58)];
    resources(s, 0, ['Fury', 'Fury']);
    resources(s, 1, ['Body', 'Body']);
    s.units = [unit('target', 0, 'base:0')];
    s = moveTo(s, 'target', 'field:0');
    s = take(s, a => a.cardId === starter(3));
    s = take(s, 'pass');
    s = take(s, a => a.cardId === card(58));
    s = resolveChain(s);
    expect(s.phase).toBe('showdown');
    expect(s.focusPlayer).toBe(1);
    expect(s.priorityPlayer).toBe(1);
    expect(s.players[0].points).toBe(0);
    expect(s.units[0].damage).toBe(2);
    expect(getMight(s, s.units[0])).toBe(5);
    s = passShowdown(s);
    expect(s.players[0].points).toBe(1);
  });

  it('does not grant Ravenbloom its spell-play trigger before the spell resolves', () => {
    let s = position();
    s.players[0].hand = [card(58)];
    resources(s, 0, ['Mind', 'Order']);
    s.units = [unit('student', 0, 'base:0', card(103))];
    const initialMight = getMight(s, s.units[0]);
    s = take(s, a => a.cardId === card(58));
    expect(getMight(s, s.units[0])).toBe(initialMight);
    s = resolveChain(s);
    expect(getMight(s, s.units[0])).toBe(initialMight + 3);
  });

  it('permits Deflect power of a different domain from the spell', () => {
    let s = position();
    s.players[0].hand = [card(9)]; // One Fury power plus Deflect's any-domain power.
    resources(s, 0, ['Fury', 'Chaos']);
    s.units = [unit('poro', 1, 'field:0', card(13))];
    s = take(s, a => a.cardId === card(9) && a.targetId === 'poro');
    expect(s.players[0].runes).toHaveLength(0);
  });

  it('Cleave grants Might only while its target is attacking', () => {
    let s = position();
    s.players[0].hand = [card(4)];
    resources(s, 0, ['Fury']);
    s.units = [unit('target', 0, 'base:0')];
    s = resolveChain(take(s, a => a.cardId === card(4)));
    expect(getMight(s, s.units[0])).toBe(3);
    s.units[0].location = 'field:0';
    s.combat = { fieldId: 'field:0', attacker: 0, defender: 1, engaged: true, stage: 'priority', total: [0, 0], remaining: [0, 0], assignments: [{}, {}], assigningPlayer: 0 };
    expect(getMight(s, s.units[0])).toBe(6);
  });
});

describe('combat assignment and burnout (431, 465)', () => {
  it('applies combat damage simultaneously so equally strong armies both die', () => {
    let s = position();
    s.units = [unit('attacker', 0, 'base:0'), unit('defender', 1, 'field:0')];
    s.fields[0].controller = 1;
    s = passShowdown(moveTo(s, 'attacker', 'field:0'));
    for (let i = 0; i < 6 && s.phase === 'damage'; i++) s = take(s, a => a.category === 'combat');
    expect(s.units).toHaveLength(0);
    expect(s.fields[0].controller).toBeNull();
    expect(s.players[0].discard).toContain(card(175));
    expect(s.players[1].discard).toContain(card(175));
    expect(s.players[0].points).toBe(0);
  });

  it('requires lethal damage on a Tank before choosing another defender', () => {
    const s = position();
    s.phase = 'damage';
    s.units = [unit('attacker', 0, 'field:0', card(142)), unit('tank', 1, 'field:0', card(54)), unit('other', 1, 'field:0')];
    s.combat = { fieldId: 'field:0', attacker: 0, defender: 1, engaged: true, stage: 'assign', total: [10, 7], remaining: [10, 7], assignments: [{}, {}], assigningPlayer: 0 };
    const actions = getLegalActions(s, 0).filter(a => a.category === 'combat');
    expect(actions.every(a => a.targetId === 'tank')).toBe(true);
    expect(actions.every(a => (a.amount ?? 0) <= getMight(s, s.units[1]))).toBe(true);
  });

  it('requires at least one damage to kill a zero-Might unit', () => {
    const s = position();
    s.phase = 'damage';
    s.units = [unit('attacker', 0, 'field:0'), { ...unit('zero', 1, 'field:0'), temporaryMight: -3 }];
    s.combat = { fieldId: 'field:0', attacker: 0, defender: 1, engaged: true, stage: 'assign', total: [3, 0], remaining: [3, 0], assignments: [{}, {}], assigningPlayer: 0 };
    expect(getLegalActions(s, 0).some(a => a.targetId === 'zero' && (a.amount ?? 0) >= 1)).toBe(true);
  });

  it('recycles trash and awards an opponent point instead of losing when the deck empties', () => {
    let s = position();
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.players[0].deck = [];
    s.players[0].discard = [card(1), card(4), card(5)];
    s = take(s, 'end-turn');
    expect(s.winner).toBeNull();
    expect(s.players[1].points).toBe(1);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].deck).toHaveLength(2);
    expect(s.players[0].discard).toHaveLength(0);
  });
});
