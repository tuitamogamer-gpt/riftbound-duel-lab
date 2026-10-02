import { describe, expect, it } from 'vitest';
import { cardsById } from '../src/data/cards';
import { starterDecks, validateDeck } from '../src/data/decks';
import { applyAction, createGame, getLegalActions, getGameView, getMight, serializeGame, deserializeGame } from '../src/game/engine';
import { getBotAction } from '../src/game/bot';
import { getScript } from '../src/game/scripts';
import type { GameAction, GameState, LocationId, PlayerId, Unit } from '../src/game/types';

const MAX_ACTIONS = 2500;
const seeds = [11, 73, 20261002];

function assertState(state: GameState, context: string) {
  expect(Number.isFinite(state.rng), `${context}: rng`).toBe(true);
  expect([0, 1], `${context}: priority`).toContain(state.priorityPlayer);
  expect([0, 1], `${context}: current player`).toContain(state.currentPlayer);
  const ids = [...state.units.map(u => u.id), ...state.gears.map(g => g.id), ...state.players.flatMap(p => p.runes.map(r => r.id))];
  expect(new Set(ids).size, `${context}: unique board IDs`).toBe(ids.length);
  for (const player of state.players) {
    expect(player.energy, `${context}: nonnegative energy`).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(player.energy), `${context}: finite energy`).toBe(true);
    expect(player.points, `${context}: nonnegative score`).toBeGreaterThanOrEqual(0);
    expect(player.runes.length + player.runeDeck.length, `${context}: rune conservation`).toBe(12);
    const cardIds = [
      ...player.deck, ...player.hand, ...player.discard, ...player.banished,
      ...state.units.filter(u => u.owner === player.id && !u.token).map(u => u.cardId),
      ...state.gears.filter(g => g.owner === player.id).map(g => g.cardId),
      ...state.stack.filter(item => item.player === player.id && item.kind === 'spell').map(item => item.cardId),
      ...(player.championAvailable ? [player.championId] : []),
    ];
    expect(cardIds.length, `${context}: ${player.deckId} card conservation`).toBe(40);
    for (const cardId of cardIds) expect(cardsById[cardId], `${context}: known card ${cardId}`).toBeDefined();
  }
  if (state.winner !== null) {
    expect(state.phase, `${context}: terminal phase`).toBe('ended');
    expect(getLegalActions(state, 0)).toEqual([]);
    expect(getLegalActions(state, 1)).toEqual([]);
  }
}

function simulate(playerDeckId: string, botDeckId: string, seed: number) {
  let state = createGame({ playerDeckId, botDeckId, seed, firstPlayer: seed % 2 as PlayerId });
  let actions = 0;
  const seen = new Set<string>();
  while (state.winner === null && actions < MAX_ACTIONS) {
    const context = `${playerDeckId}/${botDeckId} seed ${seed} action ${actions} turn ${state.turn} phase ${state.phase}`;
    assertState(state, context);
    const stateKey = JSON.stringify({ ...state, log: [], nextId: 0 });
    expect(seen.has(stateKey), `${context}: repeated state / stalled bot`).toBe(false);
    seen.add(stateKey);
    const legal = getLegalActions(state, state.priorityPlayer);
    expect(legal.length, `${context}: no legal actions`).toBeGreaterThan(0);
    const action = getBotAction(state);
    expect(action, `${context}: bot returned no action`).not.toBeNull();
    expect(legal.some(candidate => candidate.id === action!.id), `${context}: bot action ${action?.id} is legal`).toBe(true);
    state = applyAction(state, action!);
    actions += 1;
  }
  expect(state.winner, `${playerDeckId}/${botDeckId} seed ${seed} stalled at action ${actions}, turn ${state.turn}, phase ${state.phase}`).not.toBeNull();
  assertState(state, `${playerDeckId}/${botDeckId} final`);
  return { state, actions };
}

describe('all supported deck matchups complete through legal bot actions', () => {
  for (const player of starterDecks) for (const opponent of starterDecks) {
    it(`${player.name} vs ${opponent.name}: three seeded complete games`, () => {
      for (const seed of seeds) simulate(player.id, opponent.id, seed);
    }, 60_000);
  }
});

describe('catalogue integration and hidden-information boundaries', () => {
  it('has explicit executable scripts for every selected non-rune card', () => {
    for (const deck of starterDecks) {
      expect(validateDeck(deck), deck.id).toEqual([]);
      for (const id of [deck.legendId, deck.championId, deck.battlefieldId, ...deck.main.map(e => e.cardId)]) {
        expect(getScript(id)?.implemented, `${deck.id}: ${cardsById[id].name}`).toBe(true);
      }
    }
  });

  it('replays the same seed and decisions deterministically', () => {
    const first = simulate('annie', 'master-yi', 456);
    const second = simulate('annie', 'master-yi', 456);
    expect(first.actions).toBe(second.actions);
    expect(serializeGame(first.state)).toBe(serializeGame(second.state));
    expect(deserializeGame(serializeGame(first.state))).toEqual(first.state);
  }, 30_000);

  it('bot decisions do not change when hidden deck orders and the opposing hand change', () => {
    let state = createGame({ seed: 309, playerDeckId: 'garen', botDeckId: 'lux' });
    for (let i = 0; i < 120 && state.winner === null; i++) {
      const player = state.priorityPlayer;
      const action = getBotAction(state, player);
      expect(action).not.toBeNull();
      const hiddenChanged = structuredClone(state);
      for (const p of hiddenChanged.players) {
        p.deck.reverse();
        p.runeDeck.reverse();
        if (p.id !== player) p.hand = p.hand.map(() => 'ogn-142-298');
      }
      expect(getBotAction(hiddenChanged, player)?.id, `hidden data influenced decision ${i}`).toBe(action!.id);
      const view = getGameView(state, player);
      expect(view.players[1 - player].hand).toEqual([]);
      expect(view.players[0].deck).toEqual([]);
      expect(view.players[1].deck).toEqual([]);
      expect(view.players[0].runeDeck).toEqual([]);
      expect(view.players[1].runeDeck).toEqual([]);
      state = applyAction(state, action!);
    }
  });

  it('rejects illegal actions without modifying the state', () => {
    const state = createGame({ seed: 123 });
    const before = serializeGame(state);
    expect(() => applyAction(state, 'play|forged-card')).toThrow('Illegal action');
    expect(serializeGame(state)).toBe(before);
  });
});

const ogn = (n: number) => `ogn-${String(n).padStart(3, '0')}-298`;
const ogs = (n: number) => `ogs-${String(n).padStart(3, '0')}-024`;

function effectPosition(): GameState {
  const state = createGame({ seed: 19, playerDeckId: 'annie', botDeckId: 'lux' });
  state.phase = 'main';
  state.turn = 9;
  state.currentPlayer = 0;
  state.priorityPlayer = 0;
  state.units = [];
  for (const player of state.players) {
    player.mulliganDone = true;
    player.hasBegun = true;
    player.championAvailable = false;
    player.hand = [];
    player.energy = 0;
    player.runes = [];
  }
  return state;
}

function piece(id: string, owner: PlayerId, location: LocationId, cardId = ogn(49)): Unit {
  return { id, cardId, owner, location, ready: false, damage: 0, buff: 0, temporaryMight: 0, temporaryAssault: 0, stunned: false, gear: [], summonedTurn: 1 };
}

function action(state: GameState, predicate: string | ((action: GameAction) => boolean)): GameState {
  const selected = getLegalActions(state, state.priorityPlayer).find(typeof predicate === 'string' ? a => a.id === predicate : predicate);
  expect(selected, `Missing action ${String(predicate)} in ${state.phase}`).toBeDefined();
  return applyAction(state, selected!);
}

function resolveAll(state: GameState): GameState {
  let result = state;
  for (let i = 0; i < 40 && result.stack.length; i++) result = action(result, 'pass');
  expect(result.stack).toHaveLength(0);
  return result;
}

describe('scripted card effects from the imported printed rules', () => {
  it('charges universal Deflect power for Challenge in addition to its Body power', () => {
    const state = effectPosition();
    state.players[0].hand = [ogn(128)];
    state.players[0].energy = 1;
    state.players[0].runes = [{ id: 'body', domain: 'Body', ready: true }];
    state.units = [piece('ally', 0, 'base:0'), piece('poro', 1, 'field:0', ogn(13))];
    expect(getLegalActions(state, 0).some(a => a.cardId === ogn(128))).toBe(false);
    state.players[0].runes.push({ id: 'chaos', domain: 'Chaos', ready: false });
    expect(getLegalActions(state, 0).some(a => a.cardId === ogn(128))).toBe(true);
    const next = action(state, a => a.cardId === ogn(128));
    expect(next.players[0].runes).toHaveLength(0);
  });

  it('does not offer an enemy Deflect unit as a trigger target without power to pay', () => {
    let state = effectPosition();
    state.players[0].hand = [ogn(51)];
    state.players[0].energy = 3;
    state.units = [piece('poro', 1, 'field:0', ogn(13)), piece('ally', 0, 'base:0')];
    state = action(state, a => a.cardId === ogn(51));
    expect(state.phase).toBe('choice');
    const choices = getLegalActions(state, 0);
    expect(choices.some(a => a.targetId === 'poro')).toBe(false);
    expect(choices.some(a => a.targetId === 'ally')).toBe(true);
  });

  it('First Mate readies the chosen other unit and keeps itself exhausted', () => {
    let state = effectPosition();
    state.players[0].hand = [ogn(132)];
    state.players[0].energy = 3;
    state.units = [piece('ally', 0, 'base:0'), piece('enemy', 1, 'base:1')];
    state = action(state, a => a.cardId === ogn(132));
    const mate = state.units.find(u => u.cardId === ogn(132))!;
    state = action(state, a => a.targetId === 'ally');
    state = resolveAll(state);
    expect(state.units.find(u => u.id === 'ally')?.ready).toBe(true);
    expect(state.units.find(u => u.id === mate.id)?.ready).toBe(false);
    expect(state.units.find(u => u.id === 'enemy')?.ready).toBe(false);
  });

  it('Annie adds one damage to Incinerate and leaves survivors wounded until cleanup', () => {
    let state = effectPosition();
    state.players[0].hand = [ogs(3)];
    state.players[0].energy = 2;
    state.units = [piece('annie', 0, 'base:0', ogs(1)), piece('enemy', 1, 'field:0')];
    state = action(state, a => a.cardId === ogs(3) && a.targetId === 'enemy');
    state = resolveAll(state);
    expect(state.units.find(u => u.id === 'enemy')?.damage).toBe(3);
    expect(getMight(state, state.units.find(u => u.id === 'enemy')!)).toBe(5);
  });

  it('Tibbers damages units on both battlefields, including allies, and leaves bases unharmed', () => {
    let state = effectPosition();
    state.players[0].hand = [ogs(18)];
    state.players[0].energy = 8;
    state.players[0].runes = [{ id: 'f', domain: 'Fury', ready: false }, { id: 'c', domain: 'Chaos', ready: false }];
    state.units = [piece('ally-field', 0, 'field:0'), piece('enemy-a', 1, 'field:0'), piece('enemy-b', 1, 'field:1'), piece('base-a', 0, 'base:0'), piece('base-b', 1, 'base:1')];
    state = action(state, a => a.cardId === ogs(18) && a.locationId === 'base:0');
    state = resolveAll(state);
    for (const id of ['ally-field', 'enemy-a', 'enemy-b']) expect(state.units.find(u => u.id === id)?.damage, id).toBe(3);
    for (const id of ['base-a', 'base-b']) expect(state.units.find(u => u.id === id)?.damage, id).toBe(0);
  });

  it('Firestorm affects only enemy units at the selected battlefield', () => {
    let state = effectPosition();
    state.players[0].hand = [ogs(2)];
    state.players[0].energy = 6;
    state.players[0].runes = [{ id: 'f', domain: 'Fury', ready: false }];
    state.units = [piece('ally', 0, 'field:0'), piece('enemy-a', 1, 'field:0'), piece('enemy-b', 1, 'field:1'), piece('base', 1, 'base:1')];
    state = action(state, a => a.cardId === ogs(2) && a.targetId === 'field:0');
    state = resolveAll(state);
    expect(state.units.find(u => u.id === 'enemy-a')?.damage).toBe(3);
    for (const id of ['ally', 'enemy-b', 'base']) expect(state.units.find(u => u.id === id)?.damage, id).toBe(0);
  });

  it('Recruit the Vanguard creates exactly four separately placed exhausted tokens', () => {
    let state = effectPosition();
    state.players[0].hand = [ogs(15)];
    state.players[0].energy = 6;
    state.units = [piece('field-a', 0, 'field:0'), piece('field-b', 0, 'field:1')];
    state.fields[0].controller = 0;
    state.fields[1].controller = 0;
    state = action(state, a => a.cardId === ogs(15));
    state = resolveAll(state);
    expect(state.phase).toBe('choice');
    for (const location of ['base:0', 'field:0', 'field:1', 'base:0']) state = action(state, `choose-token:${location}`);
    const tokens = state.units.filter(u => u.token);
    expect(tokens).toHaveLength(4);
    expect(tokens.every(u => u.cardId === ogn(271) && !u.ready)).toBe(true);
    expect(tokens.filter(u => u.location === 'base:0')).toHaveLength(2);
    expect(tokens.filter(u => u.location === 'field:0')).toHaveLength(1);
    expect(tokens.filter(u => u.location === 'field:1')).toHaveLength(1);
    expect(state.phase).toBe('main');
  });
});
