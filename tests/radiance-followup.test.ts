import { describe, expect, it } from "vitest";
import { banishedCards } from "../src/game/banishment";
import { getReferenceAction } from "../src/game/bot-reference";
import { applyAction, emitGameEvent } from "../src/game/engine";
import type { Effect, GameState, PlayerId } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import { actions, byId, play, rad, settle, until } from "./fixtures/radiance";

/**
 * Follow-up corrections for the items the 10 November 2026 Radiance review
 * left open.
 */
const PLAYFUL = "ogn-049-298";
const SACRIFICE = "unl-173-219";
const SUPERNOVA = rad(59);
const special = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom,
  ...extra,
});
/** Karma - Channeler: "When you recycle one or more cards, buff a friendly unit." */
const karma = (owner: PlayerId = 0) => ({
  ...unit(`karma-${owner}`, owner, `base:${owner}` as const, 6),
  cardId: "ogn-235-298",
});
const buffed = (s: GameState, owner: PlayerId = 0) =>
  s.units.filter((u) => u.owner === owner && u.buff).length;
/** Put an ability on the chain and pass until it asks for a choice or ends. */
function ability(
  s: GameState,
  cardId: string,
  effects: Effect[],
  sourceId?: string,
  player: PlayerId = 0,
) {
  s.stack.push({
    id: `followup-${s.nextId++}`,
    kind: "ability",
    cardId,
    player,
    effects,
    sourceId,
  });
  s.priorityPlayer = player;
  for (
    let i = 0;
    i < 20 && !s.pendingChoice && (s.stack.length || s.pendingTriggers?.length);
    i++
  ) {
    const options = actions(s);
    s = applyAction(s, options.find((a) => a.id === "pass") ?? options[0]);
  }
  return s;
}
/** The bottom `n` cards of a player's deck. */
const bottom = (s: GameState, n: number, owner: PlayerId = 0) =>
  s.players[owner].deck.slice(-n);

describe("Radiance review follow-up", () => {
  it("Runeblade Anvil plays its own banished copy, not an identical card held by Dockside Lock-Up", () => {
    let s = fixture();
    s.units = [unit("e", 1, "field:0", 3)];
    s.players[0].hand = [rad(136)];
    s = settle(
      until(play(s, rad(136), { locationId: "field:0" }), "Banish Playful"),
    );
    const lockUp = s.gears.find((g) => g.cardId === rad(136))!;
    // Lock-Up records `${owner}|${banished entry id}`.
    const held = s.radiance!.lockUp![lockUp.id].split("|")[1];
    expect(banishedCards(s, 1).map((c) => c.id)).toEqual([held]);

    // Player 1's Anvil banishes an identical card from the top of their deck.
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.focusPlayer = 1;
    s.players[1].hand = [rad(12)];
    s = settle(play(s, rad(12)));
    expect(s.players[1].banished).toEqual([PLAYFUL, PLAYFUL]);
    const offered = actions(s).filter(
      (a) => a.category === "play" && a.sourceId?.startsWith("banished:"),
    );
    expect(new Set(offered.map((a) => a.sourceId))).toEqual(
      new Set(["banished:1"]),
    );

    s = settle(act(s, offered[0].id));
    expect(banishedCards(s, 1).map((c) => c.id)).toEqual([held]);
    expect(s.radiance?.anvil ?? []).toHaveLength(0);

    // Lock-Up still releases the card it banished.
    s.currentPlayer = 0;
    s.priorityPlayer = 0;
    s.focusPlayer = 0;
    s.units = s.units.filter((u) => u.location !== "field:0");
    s.fields[0].controller = 0;
    emitGameEvent(s, "hold", 0, s.fields[0].cardId, "field:0", "field:0");
    s = settle(s);
    expect(s.players[1].banished).toHaveLength(0);
    expect(
      s.units.filter((u) => u.cardId === PLAYFUL && u.owner === 0),
    ).toHaveLength(1);
  });

  it("Starry-Eyed Songstress combines with Parallel Convergence's return cost", () => {
    let s = fixture();
    s.players[0].legendId = rad(151);
    s.units = [
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
      unit("c", 0, "field:1", 2),
      unit("enemy", 1, "field:0", 4),
    ];
    s.fields[1].controller = 0;
    // Parallel Convergence costs 2 Energy and 1 Power: with no Energy, only
    // the Songstress options are affordable.
    s.players[0].energy = 0;
    s.players[0].hand = [rad(51)];
    const plays = actions(s).filter((a) => a.cardId === rad(51));
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((a) => a.songstressUnits && a.costSourceId)).toBe(true);
    expect(plays.every((a) => a.additionalCostPaid)).toBe(true);
    // Rule 357.2: a unit exhausted for Songstress may then be returned.
    const pick = plays.find(
      (a) =>
        a.costSourceId === "a" &&
        a.songstressUnits === "a,b,c" &&
        a.targetId === "enemy",
    );
    expect(pick?.label).toContain("return to hand Playful Phantom");
    s = settle(act(s, pick!.id));
    expect(s.units.some((u) => u.id === "a")).toBe(false);
    expect(s.players[0].hand).toEqual([PLAYFUL]);
    expect(s.units.filter((u) => u.owner === 0).every((u) => !u.ready)).toBe(
      true,
    );
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.players[0].energy).toBe(0);
    expect(s.units.some((u) => u.id === "enemy")).toBe(false);
  });

  it("Starry-Eyed Songstress adds one option for each unit Parallel Convergence can return", () => {
    const s = fixture();
    s.players[0].legendId = rad(151);
    s.units = [
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
      unit("c", 0, "base:0", 2),
      unit("enemy", 1, "field:0", 4),
    ];
    s.players[0].hand = [rad(51)];
    const plays = actions(s).filter((a) => a.cardId === rad(51));
    // Without Songstress: one option per returned unit.
    expect(plays.filter((a) => !a.songstressUnits)).toHaveLength(3);
    // With her: one exhausted trio, and any of the three units returned.
    expect(plays.filter((a) => a.songstressUnits)).toHaveLength(3);
  });

  it("Starry-Eyed Songstress can't exhaust the unit Ki Burst exhausts for its own cost", () => {
    let s = fixture();
    s.players[0].legendId = rad(151);
    s.units = [
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
      unit("c", 0, "base:0", 2),
      unit("d", 0, "base:0", 2),
      unit("enemy", 1, "field:0", 4),
    ];
    s.players[0].hand = [rad(28)];
    const plays = actions(s).filter(
      (a) => a.cardId === rad(28) && a.songstressUnits,
    );
    expect(plays.length).toBeGreaterThan(0);
    for (const a of plays)
      expect(a.songstressUnits!.split(",")).not.toContain(a.costSourceId);
    const pick = plays.find(
      (a) => a.costSourceId === "d" && a.targetId === "enemy",
    )!;
    s = settle(act(s, pick.id));
    expect(["a", "b", "c", "d"].every((id) => !byId(s, id).ready)).toBe(true);
    expect(byId(s, "enemy").stunned).toBeTruthy();
  });

  it("Starry-Eyed Songstress pays first, so the units she exhausts can make Sacrifice's unit Mighty", () => {
    let s = fixture();
    s.players[0].legendId = rad(151);
    s.units = [
      { ...unit("ser", 0, "base:0", 1), cardId: rad(138) },
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
      unit("c", 0, "base:0", 2),
      { ...unit("d", 0, "base:0", 2), ready: false },
    ];
    s.players[0].energy = 0;
    s.players[0].hand = [SACRIFICE];
    const plays = actions(s).filter((a) => a.cardId === SACRIFICE);
    // Seraphine, Not Alone has 1 + 1 Might; with a, b and c exhausted she has
    // 5 and is Mighty. No other trio makes her Mighty.
    expect(plays.map((a) => [a.costSourceId, a.songstressUnits])).toEqual([
      ["ser", "a,b,c"],
    ]);
    const hand = s.players[0].hand.length;
    s = settle(act(s, plays[0].id));
    expect(s.units.some((u) => u.id === "ser")).toBe(false);
    expect(s.players[0].discard).toContain(rad(138));
    // Sacrifice left the hand; it drew 2.
    expect(s.players[0].hand.length).toBe(hand - 1 + 2);
    expect(["a", "b", "c"].every((id) => !byId(s, id).ready)).toBe(true);
  });

  it("Predict 3 puts the cards it recycles on the bottom in a random order", () => {
    const top = [rad(1), rad(3), rad(5)];
    const predict = (rng: number) => {
      let s = fixture();
      s.rng = rng;
      s.players[0].deck = [...top, ...Array(20).fill(PLAYFUL)];
      // Clocktower Guardian: [Predict 3].
      s = ability(s, rad(67), [special("radiance5:predict", { amount: 3 })]);
      for (const i of [0, 1, 2])
        s = act(s, `choose-custom:predict:recycle:${i}`);
      s = settle(s);
      expect([...bottom(s, 3)].sort()).toEqual([...top].sort());
      return bottom(s, 3).join(",");
    };
    const orders = new Set(
      [11, 23, 37, 41, 53, 67, 79, 97, 101, 113].map(predict),
    );
    expect(orders.size).toBeGreaterThan(1);
    // The order comes from the game's seeded generator: a replay repeats it.
    expect(predict(4242)).toBe(predict(4242));
  });

  it("Predict 2 that recycles one card leaves the random generator alone", () => {
    let s = fixture();
    s.players[0].deck = [rad(1), rad(3), ...Array(20).fill(PLAYFUL)];
    s = ability(s, rad(67), [special("radiance5:predict", { amount: 2 })]);
    const rng = s.rng;
    s = act(s, "choose-custom:predict:recycle:0");
    s = settle(act(s, "choose-custom:predict:keep:1"));
    expect(s.players[0].deck[0]).toBe(rad(3));
    expect(s.players[0].deck.at(-1)).toBe(rad(1));
    expect(s.rng).toBe(rng);
  });

  it("Trifarian Captain recycles the rest as one recycle event, in a random order", () => {
    const top = [SUPERNOVA, rad(60), rad(16), rad(6)];
    const orders = new Set<string>();
    for (const rng of [5, 17, 29, 31, 43, 59, 61, 71]) {
      let s = fixture();
      s.rng = rng;
      s.units = [karma(), unit("ally", 0, "base:0", 2)];
      s.players[0].deck = [...top, ...Array(20).fill(PLAYFUL)];
      s = ability(s, rad(129), [special("radiance5:captain")], "karma");
      s = settle(act(s, "choose-custom:captain:none"));
      expect([...bottom(s, 4)].sort()).toEqual([...top].sort());
      expect(buffed(s)).toBe(1);
      orders.add(bottom(s, 4).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("Command: Attack recycles the rest as one recycle event, in a random order", () => {
    const top = [SUPERNOVA, rad(60), rad(16), rad(6), rad(1)];
    const orders = new Set<string>();
    for (const rng of [5, 17, 29, 31, 43, 59, 61, 71]) {
      let s = fixture();
      s.rng = rng;
      s.units = [karma(), unit("ally", 0, "base:0", 2)];
      s.players[0].deck = [...top, ...Array(20).fill(PLAYFUL)];
      s = ability(s, rad(33), [special("radiance6:command-look")], "karma");
      s = settle(act(s, "choose-custom:look:none"));
      expect([...bottom(s, 5)].sort()).toEqual([...top].sort());
      expect(buffed(s)).toBe(1);
      orders.add(bottom(s, 5).join(","));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it("Raving Witness and Scrutinizing Scope recycle through the recycle event", () => {
    // Raving Witness: a revealed card that isn't Mighty is recycled.
    let s = fixture();
    s.units = [karma(), unit("ally", 0, "base:0", 2)];
    s.players[0].deck = [SUPERNOVA, ...Array(20).fill(PLAYFUL)];
    s = settle(ability(s, rad(74), [special("radiance5:witness")], "karma"));
    expect(s.players[0].deck.at(-1)).toBe(SUPERNOVA);
    expect(buffed(s)).toBe(1);

    // Scrutinizing Scope: the opponent guesses the type; a match is recycled.
    let t = fixture();
    t.units = [karma(), unit("ally", 0, "base:0", 2)];
    t.players[0].deck = [SUPERNOVA, ...Array(20).fill(PLAYFUL)];
    t = ability(t, rad(64), [special("radiance6:scope")], "karma");
    t = settle(act(t, (a) => a.label === "Guess Spell"));
    expect(t.players[0].deck.at(-1)).toBe(SUPERNOVA);
    expect(t.players[0].hand).toHaveLength(0);
    expect(buffed(t)).toBe(1);
  });

  it("Mechanical Bandit recycles both revealed cards to their owners as one event", () => {
    let s = fixture();
    s.units = [karma(), unit("ally", 0, "base:0", 2)];
    // Supernova costs 9 and Playful Phantom 5: player 0 draws nothing.
    s.players[0].deck = [SUPERNOVA, ...Array(20).fill(PLAYFUL)];
    s.players[1].deck = [PLAYFUL, ...Array(20).fill(SUPERNOVA)];
    s = settle(ability(s, rad(111), [special("radiance6:bandit")], "karma"));
    expect(s.players[0].deck.at(-1)).toBe(SUPERNOVA);
    expect(s.players[1].deck.at(-1)).toBe(PLAYFUL);
    expect(s.players[0].hand).toHaveLength(0);
    // One "recycle the rest" instruction: Karma buffs one unit.
    expect(buffed(s)).toBe(1);
  });

  it("Last Caress lets a unit token whose effect leaves the location open go to any battlefield", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:1", 4)];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(154)];
    s = settle(play(s, rad(154)));
    // Encore: "Play two 1 Might Recruit unit tokens."
    s = ability(s, rad(152), [
      { type: "token", cardName: "Recruit", amount: 2 },
    ]);
    expect(actions(s).map((a) => a.id)).toEqual([
      "choose-token:base:0",
      "choose-token:field:0",
      "choose-token:field:1",
    ]);
    s = act(s, "choose-token:field:0");
    // The permission covers only the next unit.
    expect(actions(s).map((a) => a.id)).toEqual(["choose-token:base:0"]);
    s = settle(act(s, "choose-token:base:0"));
    const recruits = s.units.filter((u) => u.owner === 0 && u.token);
    expect(recruits.map((u) => [u.location, u.buff])).toEqual([
      ["field:0", 1],
      ["base:0", 0],
    ]);
    expect(s.radiance?.lastCaress ?? []).toHaveLength(0);
  });

  it("the reference bot keeps a Last Caress token out of occupied enemy battlefields", () => {
    let s = fixture();
    s.units = [unit("e0", 1, "field:0", 4), unit("e1", 1, "field:1", 4)];
    s.fields[0].controller = 1;
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(154)];
    s = settle(play(s, rad(154)));
    s = ability(s, rad(152), [{ type: "token", cardName: "Recruit" }]);
    expect(actions(s).map((a) => a.id)).toEqual([
      "choose-token:base:0",
      "choose-token:field:0",
      "choose-token:field:1",
    ]);
    expect(getReferenceAction(s, 0)?.id).toBe("choose-token:base:0");
  });

  it("Last Caress leaves a token that an effect plays to your base there", () => {
    let s = fixture();
    s.players[0].hand = [rad(154), rad(127)];
    s = settle(play(s, rad(154)));
    // Rousing Display: "Play two 1 Might Recruit unit tokens to your base."
    s = settle(play(s, rad(127)));
    expect(
      s.units.filter((u) => u.token).every((u) => u.location === "base:0"),
    ).toBe(true);
  });

  it("Ruined Monastery channels a rune when you conquer it with no card to discard", () => {
    let s = fixture();
    s.fields[0].cardId = rad(166);
    s.units = [unit("ally", 0, "base:0", 3)];
    const runes = s.players[0].runes.length;
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = until(s, "Channel 1 rune exhausted (no card to discard)");
    s = settle(s);
    expect(s.players[0].runes.length).toBe(runes + 1);
    expect(s.players[0].runes.at(-1)?.ready).toBe(false);
  });

  it("Ruined Monastery may still be declined", () => {
    let s = fixture();
    s.fields[0].cardId = rad(166);
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [PLAYFUL];
    const runes = s.players[0].runes.length;
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = settle(until(s, "Decline"));
    expect(s.players[0].hand).toEqual([PLAYFUL]);
    expect(s.players[0].runes.length).toBe(runes);
  });

  it("a Runeblade Anvil permission saved without an entry id still plays an identical card", () => {
    const s = fixture();
    s.players[0].banished = [PLAYFUL];
    s.radiance = { anvil: [{ player: 0, cardId: PLAYFUL, until: s.turn }] };
    const offered = actions(s).filter(
      (a) => a.category === "play" && a.sourceId === "banished:0",
    );
    expect(offered.length).toBeGreaterThan(0);
    const t = settle(act(s, offered[0].id));
    expect(t.players[0].banished).toHaveLength(0);
    expect(t.radiance?.anvil ?? []).toHaveLength(0);
  });
});
