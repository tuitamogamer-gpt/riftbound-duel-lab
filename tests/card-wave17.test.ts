import { describe, expect, it } from "vitest";
import {
  getLegalActions,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { validState } from "../src/persistence";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
import type { Effect, GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
function run(s: GameState, effects: Effect[], targetId?: string) {
  s.stack.push({
    id: "test",
    player: 0,
    cardId: ogn(49),
    kind: "ability",
    effects,
    targetId,
  });
  return resolve(s);
}
function kill(s: GameState, id: string) {
  return run(s, [{ type: "kill", target: "anyUnit" }], id);
}
describe("wave17 ordered death replacements", () => {
  it.each([true, false])(
    "Sett can save a buffed unit or decline: %s",
    (save) => {
      let s = fixture();
      s.players[0].legendId = ogn(269);
      s.units = [{ ...unit("friend", 0, "field:0"), buff: 1 }];
      s = kill(s, "friend");
      expect(s.pendingChoice?.player).toBe(0);
      s = act(
        s,
        save
          ? "choose-custom:death:sett:friend"
          : "choose-custom:death:decline",
      );
      if (save) {
        expect(s.units[0]).toMatchObject({
          buff: 0,
          ready: false,
          damage: 0,
          location: "base:0",
        });
        expect(s.players[0].power).toBe(29);
        expect(s.players[0].legendUsedTurn).toBe(s.turn);
        expect(s.players[0].discard).toEqual([]);
      } else expect(s.units).toHaveLength(0);
    },
  );
  it("Sett cannot save without a buff, a ready legend, or power", () => {
    for (const variant of ["buff", "legend", "power"]) {
      let s = fixture();
      s.players[0].legendId = ogn(269);
      s.units = [{ ...unit("friend"), buff: 1 }];
      if (variant === "buff") s.units[0].buff = 0;
      if (variant === "legend") s.players[0].legendUsedTurn = s.turn;
      if (variant === "power") s.players[0].power = 0;
      s = kill(s, "friend");
      expect(s.units).toHaveLength(0);
      expect(s.pendingChoice).toBeNull();
    }
  });
  it("Zhonya automatically substitutes its own death and the saved unit never triggers Deathknell", () => {
    let s = fixture();
    s.units = [{ ...unit("friend", 0, "field:0"), cardId: ogn(38) }];
    s.gears = [{ id: "hourglass", cardId: ogn(77), owner: 0, ready: true }];
    s = kill(s, "friend");
    expect(s.units).toHaveLength(1);
    expect(s.units[0].location).toBe("base:0");
    expect(s.players[0].discard).toEqual([ogn(77)]);
    expect(s.stack).toHaveLength(0);
  });
  it("the affected controller chooses which simultaneous death uses Zhonya", () => {
    let s = fixture();
    s.units = [unit("a", 0, "field:0", 2), unit("b", 0, "field:0", 2)];
    s.gears = [{ id: "glass", cardId: ogn(77), owner: 0, ready: true }];
    s = run(s, [
      { type: "damageAll", condition: "allLocations", amount: 9, who: "all" },
    ]);
    expect(s.pendingChoice?.player).toBe(0);
    s = act(s, "choose-custom:death:zhonya:glass:b");
    expect(s.units.map((u) => u.id)).toEqual(["b"]);
    expect(s.units[0].damage).toBe(0);
  });
  it.each(["soraka", "guardian"])(
    "orders Soraka and Guardian Angel before simultaneous deaths: %s",
    (first) => {
      let s = fixture();
      s.units = [
        { ...unit("soraka", 0, "field:0", 4), cardId: sfd(173) },
        unit("field", 0, "field:0", 1),
        unit("base", 0, "base:0", 1),
      ];
      addGear(s, 51, "angel", "soraka");
      s = run(s, [
        {
          type: "damageAll",
          condition: "allLocations",
          amount: 10,
          who: "all",
        },
      ]);
      s = act(
        s,
        `choose-custom:death:${first === "soraka" ? "soraka:soraka" : "guardian:angel"}`,
      );
      s = chain(s);
      expect(s.units.map((u) => u.id).sort()).toEqual(
        ["soraka", first === "soraka" ? "field" : "base"].sort(),
      );
    },
  );
  it("Guardian Angel keeps the unit and its other equipment, pays itself", () => {
    let s = fixture();
    s.units = [unit("friend", 0, "field:0")];
    addGear(s, 51, "angel", "friend");
    addGear(s, 33, "blade", "friend");
    s = kill(s, "friend");
    expect(s.units[0]).toMatchObject({
      location: "base:0",
      ready: false,
      gear: ["blade"],
    });
    expect(s.players[0].discard).toEqual([sfd(51)]);
  });
  it("Unlicensed Armory pays discard and exhaust before responses", () => {
    let s = fixture();
    s.units = [unit("friend", 0, "field:0")];
    s.gears = [{ id: "armory", cardId: ogn(23), owner: 0, ready: true }];
    s.players[0].hand = [ogn(52)];
    s = act(s, (a) => a.sourceId === "armory");
    expect(s.players[0].hand).toEqual([]);
    expect(s.players[0].discard).toEqual([ogn(52)]);
    expect(s.gears[0].ready).toBe(false);
    s = chain(s);
    s = kill(s, "friend");
    s = act(s, "choose-custom:death:armory:friend");
    expect(s.units[0].location).toBe("base:0");
  });
  it("Smite replaces lethal damage's death with banishment", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 2)];
    s.players[0].hand = [unl(7)];
    s = chain(act(s, (a) => a.cardId === unl(7)));
    expect(s.units).toEqual([]);
    expect(s.players[1].banished).toEqual([ogn(49)]);
    expect(s.players[1].discard).toEqual([]);
  });
  it("Smite and Guardian Angel allow the affected controller to select the replacement", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 2)];
    addGear(s, 51, "angel", "enemy", 1);
    s.players[0].hand = [unl(7)];
    s = resolve(act(s, (a) => a.cardId === unl(7)));
    expect(s.priorityPlayer).toBe(1);
    s = act(s, "choose-custom:death:guardian:angel");
    expect(s.units).toHaveLength(1);
    expect(s.players[1].banished).toEqual([]);
  });
  it("pending replacement selections survive serialization", () => {
    let s = fixture();
    s.players[0].legendId = ogn(269);
    s.units = [{ ...unit("friend"), buff: 1 }];
    s = kill(s, "friend");
    expect(validState(s)).toBe(true);
    const restored = deserializeGame(serializeGame(s));
    expect(restored).not.toBeNull();
    expect(getLegalActions(restored!, 0)).toEqual(getLegalActions(s, 0));
  });
});
