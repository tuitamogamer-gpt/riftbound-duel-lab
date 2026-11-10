import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { applyAction, getMight } from "../src/game/engine";
import { rd4 } from "../src/game/radiance-wave4";
import type { Effect, GameState, LocationId } from "../src/game/types";
import { act, chain, fixture, unit } from "./fixtures/cards";
import { actions, byId, hide, play, rad, settle } from "./fixtures/radiance";

const names = (ids: string[]) => ids.map((id) => getCard(id).name);
/** Pass priority until a choice is pending or the chain is empty. */
function toChoice(s: GameState) {
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
/** Resolve a free-standing ability up to its first choice. */
function ability(
  s: GameState,
  cardId: string,
  effects: Effect[],
  at: { sourceId?: string; locationId?: LocationId } = {},
) {
  s.stack.push({
    id: `test-${s.nextId++}`,
    kind: "ability",
    cardId,
    player: 0,
    effects,
    ...at,
  });
  s.priorityPlayer = 0;
  return toChoice(s);
}
const mechHere: Effect[] = [
  { type: "token", cardName: "Mech", location: "here" },
];
const karma = () => ({
  ...unit("karma", 0, "base:0", 6),
  cardId: "ogn-235-298",
});

describe("Radiance waves 3 and 4: review fixes", () => {
  it("The Empyrean predicts first, then draws 2", () => {
    const showOff = (shown: string) => {
      const s = fixture();
      s.players[0].deck = [
        rad(1),
        rad(3),
        rad(5),
        rad(8),
        ...Array(20).fill("ogn-049-298"),
      ];
      s.players[0].hand = [rad(60), shown];
      return toChoice(
        act(
          s,
          (a) =>
            a.cardId === rad(60) &&
            a.id.includes("|showoff:hand:1") &&
            a.locationId === "base:0",
        ),
      );
    };
    // Power cost 2 (Coalesced Energy): Predict 2 is decided before any draw.
    let s = showOff(rad(16));
    expect(s.pendingChoice).not.toBeNull();
    expect(names(s.players[0].hand)).toEqual(["Coalesced Energy"]);
    s = act(s, "choose-custom:predict:recycle:0");
    s = settle(act(s, "choose-custom:predict:keep:1"));
    expect(names(s.players[0].hand)).toEqual([
      "Coalesced Energy",
      "Bilgewater Tracker",
      "Lingering Animus",
    ]);
    expect(s.players[0].deck.at(-1)).toBe(rad(1));

    // Power cost 1 (Banner of Conquest): the built-in Predict comes first too.
    let t = showOff(rad(2));
    expect(t.pendingChoice?.kind).toBe("predict");
    expect(names(t.players[0].hand)).toEqual(["Banner of Conquest"]);
    t = settle(act(t, "choose-predict:recycle"));
    expect(names(t.players[0].hand)).toEqual([
      "Banner of Conquest",
      "Bilgewater Tracker",
      "Lingering Animus",
    ]);

    // Power cost 0: nothing to predict, so the draw is immediate.
    const u = showOff("ogn-049-298");
    expect(u.pendingChoice).toBeNull();
    expect(u.players[0].hand).toHaveLength(1 + 2);
  });

  it("Steadfast Outrider gets its bonus only at a battlefield", () => {
    const s = fixture();
    s.units = [
      { ...unit("rider", 0, "base:0", 3), cardId: rad(128) },
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
    ];
    delete s.units[0].baseMightOverride;
    expect(getMight(s, s.units[0])).toBe(3);
    for (const u of s.units) u.location = "field:0";
    expect(getMight(s, s.units[0])).toBe(5);
  });

  it("Fanfare draws for the unit tokens you play", () => {
    let s = fixture();
    s.players[0].hand = [rad(47), rad(127)];
    s = chain(play(s, rad(47)));
    // Rousing Display plays two Recruits: two of the three draws.
    s = settle(play(s, rad(127)));
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.radiance?.fanfare?.[0].remaining).toBe(1);

    // A Mech that replaces a token (Heimerdinger) is the same play.
    let t = fixture();
    t.units = [{ ...unit("heimer", 0, "field:0", 5), cardId: rad(132) }];
    t.players[0].hand = [rad(47), rad(127)];
    t = chain(play(t, rad(47)));
    t = settle(play(t, rad(127)));
    expect(t.units.filter((u) => u.cardId === "token-mech")).toHaveLength(2);
    expect(t.players[0].hand).toHaveLength(2);
  });

  it("Last Caress is spent on the next unit token and buffs it", () => {
    let s = fixture();
    s.players[0].hand = [rad(154), rad(127)];
    s = chain(play(s, rad(154)));
    s = settle(play(s, rad(127)));
    expect(
      s.units
        .filter((u) => u.token)
        .map((u) => u.buff)
        .sort(),
    ).toEqual([0, 1]);
    expect(s.radiance?.lastCaress ?? []).toHaveLength(0);
  });

  it("Hold 'Em and Rakelstake count a unit token played to a battlefield", () => {
    const cost = (state: GameState) =>
      actions(state).find((a) => a.cardId === rad(70))?.detail;
    let s = fixture();
    s.fields[0].cardId = rad(165);
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    s.players[0].hand = [rad(70)];
    expect(cost(s)).toBe("3 energy · 0 power");
    s = ability(s, rad(49), mechHere, {
      sourceId: "ally",
      locationId: "field:0",
    });
    // Rakelstake: the first unit played here this turn predicts.
    expect(s.pendingChoice?.kind).toBe("predict");
    s = settle(s);
    expect(cost(s)).toBe("1 energy · 0 power");

    // Without a Hold 'Em in the game nothing is recorded for a token.
    let t = fixture();
    t.fields[0].controller = 0;
    t.units = [unit("ally", 0, "field:0", 3)];
    t = settle(
      ability(t, rad(49), mechHere, {
        sourceId: "ally",
        locationId: "field:0",
      }),
    );
    expect(t.units.some((u) => u.cardId === "token-mech")).toBe(true);
    expect(t).not.toHaveProperty("radianceFieldPlays");
  });

  it("Gutter Guardian shows off only cards that have Hidden", () => {
    const shown = (s: GameState) =>
      actions(s)
        .filter((a) => a.cardId === rad(103) && a.showOff)
        .map((a) => a.showOff!.cardId);
    const s = fixture();
    // Ember Monk, Guerilla Warfare, Noxus Saboteur and Pack of Wonders only
    // mention [Hidden] in their rules text.
    s.players[0].hand = [rad(103), "ogn-167-298", "ogn-264-298"];
    s.units = [{ ...unit("saboteur", 0, "base:0", 3), cardId: "ogn-018-298" }];
    s.gears.push({ id: "pack", cardId: "ogn-181-298", owner: 0, ready: true });
    expect(shown(s)).toEqual([]);
    // Tideturner has [Hidden].
    s.players[0].hand.push("ogn-199-298");
    expect(shown(s)).toEqual(["ogn-199-298"]);
  });

  it("Predict 2, Encore and Elnuk Herd recycle through the recycle event", () => {
    // Karma - Channeler: "When you recycle one or more cards, buff a
    // friendly unit."
    const buffed = (state: GameState) =>
      state.units.filter((u) => u.buff).length;

    // Predict 2 (The Empyrean showing off a card with Power cost 2).
    let s = fixture();
    s.units = [karma()];
    s.players[0].deck = [rad(1), rad(3), ...Array(20).fill("ogn-049-298")];
    s.players[0].hand = [rad(60), rad(16)];
    s = toChoice(
      act(
        s,
        (a) =>
          a.cardId === rad(60) &&
          a.id.includes("|showoff:hand:1") &&
          a.locationId === "base:0",
      ),
    );
    s = act(s, "choose-custom:predict:recycle:0");
    s = settle(act(s, "choose-custom:predict:recycle:1"));
    expect(s.players[0].deck.slice(-2)).toEqual([rad(1), rad(3)]);
    expect(buffed(s)).toBe(1);

    // Encore: "draw 1 and recycle the other".
    let t = fixture();
    t.units = [karma()];
    t = settle(
      ability(t, rad(152), [rd4("encore-look")], { sourceId: "karma" }),
    );
    expect(t.players[0].hand).toHaveLength(1);
    expect(buffed(t)).toBe(1);

    // Elnuk Herd: "recycle me if I was played from face down".
    let u = fixture();
    u.fields[0].controller = 0;
    u.units = [unit("ally", 0, "field:0", 3), karma()];
    hide(u, rad(81), "field:0", 0, "h");
    u = settle(act(u, (a) => a.sourceId === "hidden:h"));
    expect(u.players[0].deck.at(-1)).toBe(rad(81));
    expect(buffed(u)).toBe(1);
  });

  it("Piltovan Guidebot ignores tokens: they are not cards", () => {
    const triggers = (state: GameState) =>
      state.log.filter((l) =>
        l.text.startsWith("Piltovan Guidebot: triggered ability"),
      ).length;
    let s = fixture();
    s.units = [{ ...unit("bot", 0, "base:0", 3), cardId: rad(57) }];
    delete s.units[0].baseMightOverride;
    s = ability(
      s,
      rad(105),
      [{ type: "token", cardName: "Gold", location: "base" }],
      { sourceId: "bot" },
    );
    expect(s.pendingChoice).toBeNull();
    expect(triggers(s)).toBe(0);
    // The Waters' Wage (Energy 1) is a card; the Gold it makes is not.
    s.players[0].hand = [rad(100)];
    s = toChoice(play(s, rad(100)));
    expect(actions(s).map((a) => a.label)).toContain(
      "Guidebot's base Might becomes 1 this turn",
    );
    s = settle(s);
    expect(triggers(s)).toBe(1);
    expect(getMight(s, byId(s, "bot"))).toBe(1);
  });

  it("A token cannot be shown off as a card, only as a Mech, unit or gear", () => {
    const shown = (s: GameState, cardId: string) =>
      actions(s)
        .filter((a) => a.cardId === cardId && a.showOff)
        .map((a) => a.showOff!.ref);
    const s = fixture();
    s.units = [
      { ...unit("mech", 0, "base:0", 3), cardId: "token-mech", token: true },
    ];
    s.gears.push({
      id: "gold",
      cardId: "sfd-t03",
      owner: 0,
      ready: false,
      token: true,
    });
    // The Empyrean: "[Show Off] a card".
    s.players[0].hand = [rad(60)];
    expect(shown(s, rad(60))).toEqual([]);
    // Incorrigible Construct: "[Show Off] a Mech" may still pick a Mech token.
    s.players[0].hand = [rad(11)];
    expect(shown(s, rad(11))).toEqual(["mech"]);
  });
});
