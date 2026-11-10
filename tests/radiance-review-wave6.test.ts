import { describe, expect, it } from "vitest";
import { applyAction, getMight } from "../src/game/engine";
import type { GameState, Unit } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  deployGear,
  play,
  rad,
  resolveEffects,
  settle,
  until,
} from "./fixtures/radiance";

const as = (u: Unit, n: number): Unit => ({ ...u, cardId: rad(n) });
const move = (s: GameState, id: string, to: string) =>
  act(act(s, `move-start:${id}:${to}`), "move-confirm");
const bombs = (s: GameState) =>
  s.gears.filter((g) => g.cardId === "token-bomb");
/** Answer choices with the first option and pass priority otherwise. */
const step = (s: GameState) => {
  const options = actions(s);
  return applyAction(
    s,
    s.pendingChoice
      ? options[0]
      : (options.find((a) => a.id === "pass") ?? options[0]),
  );
};

describe("Radiance wave 6 review fixes", () => {
  it("Hexplosive Minefield cast on the opponent's turn replays its Bombs at the end of that turn", () => {
    let s = fixture();
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.focusPlayer = 1;
    s.fields[0].controller = 0;
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    s.units = [unit("mine", 0, "field:0", 9), unit("opp", 1, "base:1", 9)];
    s.players[0].hand = [rad(142)];
    s = move(s, "opp", "field:0");
    for (
      let i = 0;
      i < 6 &&
      !(
        s.priorityPlayer === 0 &&
        actions(s).some((a) => a.category === "play" && a.cardId === rad(142))
      );
      i++
    )
      s = act(s, "pass");
    expect(s.currentPlayer).toBe(1);
    s = play(s, rad(142));
    s = until(s, "Kill the Bomb");
    s = settle(until(s, "Done: 1 Bomb"));
    expect(bombs(s)).toHaveLength(0);
    const turn = s.turn;
    s = act(s, "end-turn");
    for (let i = 0; i < 20 && s.turn === turn; i++) s = step(s);
    expect(s.turn).toBe(turn + 1);
    expect(bombs(s)).toHaveLength(1);
    expect(bombs(s)[0].owner).toBe(0);
    expect(s.radiance?.delayedBombs ?? []).toHaveLength(0);
  });

  it("Blossoming Dreamroot does not draw for a showdown without a combat", () => {
    let s = fixture();
    deployGear(s, rad(24), "field:0", 0, "dr");
    s.units = [unit("a", 0, "base:0", 8)];
    const hand = s.players[0].hand.length;
    s = settle(move(s, "a", "field:0"));
    expect(s.fields[0].controller).toBe(0);
    expect(s.players[0].hand.length).toBe(hand);
  });

  it("Blade of the Exile can be equipped by exhausting a unit without any Power", () => {
    let s = fixture();
    const blade = deployGear(s, rad(150), "base:0", 0, "blade");
    delete blade.deployedAt;
    s.units = [unit("a", 0, "base:0", 2), unit("b", 0, "base:0", 2)];
    s.players[0].energy = 0;
    s.players[0].power = 0;
    s.players[0].runes = [];
    const ids = actions(s).map((a) => a.id);
    expect(ids).toContain("equip:blade:a:exhaust:b");
    // The paid Equip still needs its Power.
    expect(ids).not.toContain("equip:blade:a");
    s = settle(act(s, "equip:blade:a:exhaust:b"));
    expect(byId(s, "b").ready).toBe(false);
    expect(getMight(s, byId(s, "a"))).toBe(5);
  });

  it("Riven, Deserter: a unit exhausted and readied by her ability still became exhausted", () => {
    let s = fixture();
    s.units = [
      as(unit("rd", 0, "base:0", 5), 114),
      as(unit("bb", 0, "base:0", 4), 43),
    ];
    const before = getMight(s, byId(s, "rd"));
    s = act(
      s,
      (a) =>
        a.sourceId === "rd" && a.category === "ability" && a.targetId === "bb",
    );
    s = settle(until(s, "Exhaust Riven, Broken Blade, then ready"));
    expect(byId(s, "bb").ready).toBe(true);
    // Riven, Deserter grows and Riven, Broken Blade chooses a mode (Buff).
    expect(getMight(s, byId(s, "rd"))).toBe(before + 1);
    expect(byId(s, "bb").buff).toBe(1);
  });

  it("Runeblade Anvil banishes the top card when it is banished", () => {
    let s = fixture();
    const anvil = deployGear(s, rad(12), "base:0", 0, "anvil");
    delete anvil.deployedAt;
    s.players[0].deck = ["ogn-010-298", ...s.players[0].deck];
    s.players[1].hand = [rad(124)];
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s = settle(play(s, rad(124), { targetId: "anvil" }));
    expect(s.gears.some((g) => g.id === "anvil")).toBe(false);
    expect(s.players[0].banished).toEqual(["rad-012-167", "ogn-010-298"]);
    expect(s.radiance?.anvil).toEqual([
      {
        player: 0,
        cardId: "ogn-010-298",
        entryId: s.players[0].banishedCards![1].id,
        until: s.turn + 1,
      },
    ]);
  });

  it("Orianna, Mechanical Marvel keeps her discount when a gear is played for free", () => {
    let s = fixture();
    s.units = [as(unit("ori", 0, "field:0", 5), 68)];
    s.players[0].hand = [rad(22), rad(22)];
    s = settle(
      resolveEffects(s, rad(59), [
        {
          type: "playCard",
          play: { zone: "hand", cardTypes: ["Gear"], ignoreCost: true },
        },
      ]),
    );
    expect(s.gears.map((g) => g.cardId)).toEqual([rad(22)]);
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = settle(play(s, rad(22)));
    expect(energy - s.players[0].energy).toBe(3);
    expect(power - (s.players[0].power ?? 0)).toBe(0);
    // That play used the discount: the next gear costs its full price.
    s.players[0].hand = [rad(22)];
    s = settle(play(s, rad(22)));
    expect(energy - s.players[0].energy).toBe(7);
    expect(power - (s.players[0].power ?? 0)).toBe(1);
  });

  it("Ahri, Confident reacts to Realm of Death reducing Might at her battlefield", () => {
    let s = fixture();
    s.units = [
      as(unit("ahri", 0, "field:0", 4), 38),
      unit("a", 0, "field:0", 9),
      unit("e", 1, "field:0", 9),
    ];
    s.fields[0].controller = 0;
    const before = getMight(s, byId(s, "ahri"));
    s.players[0].hand = [rad(144)];
    s = settle(play(s, rad(144), { targetId: "a~e" }));
    expect(getMight(s, byId(s, "ahri"))).toBe(before + 1);
  });

  it("Whirling Twirligig's unit tokens use the normal location choice", () => {
    let s = fixture();
    const twirl = deployGear(s, rad(22), "base:0", 0, "tw");
    delete twirl.deployedAt;
    s.fields[0].controller = 0;
    s.units = [unit("hold", 0, "field:0", 2), unit("a", 0, "base:0", 2)];
    s = act(
      s,
      (a) =>
        a.category === "ability" &&
        a.sourceId === "tw" &&
        a.label.includes("Mech"),
    );
    for (let i = 0; i < 6 && !s.pendingChoice; i++) s = act(s, "pass");
    // Kill the unit in base: the other one keeps holding the battlefield.
    s = act(s, "choose-custom:twirl:a");
    expect(actions(s).map((a) => a.id)).toEqual([
      "choose-token:base:0",
      "choose-token:field:0",
    ]);
    s = settle(act(s, "choose-token:field:0"));
    expect(s.units.find((u) => u.cardId === "token-mech")?.location).toBe(
      "field:0",
    );
  });

  it("Battlefield Armorer returns only the gear that died", () => {
    let s = fixture();
    s.units = [
      as(unit("arm1", 0, "base:0", 3), 130),
      as(unit("arm2", 0, "base:0", 3), 130),
    ];
    // An older copy is already in the trash.
    s.players[0].discard = [rad(24)];
    deployGear(s, rad(24), "field:0", 0, "dr");
    s = settle(
      resolveEffects(s, rad(59), [{ type: "kill", target: "anyGear" }], {
        targetId: "dr",
      }),
    );
    expect(s.players[0].hand).toEqual([rad(24)]);
    expect(s.players[0].discard).toEqual([rad(24)]);
  });
});
