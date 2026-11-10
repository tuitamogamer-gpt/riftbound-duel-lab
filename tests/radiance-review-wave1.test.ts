import { describe, expect, it } from "vitest";
import type { GameState } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import { byId, deployGear, rad, settle } from "./fixtures/radiance";

/** Regression tests from the review of Radiance wave 1 and the Deploy wave. */

/** Lost to the Sands: "Kill a gear." */
const killGear = (s: GameState, id: string) =>
  settle(act(s, (a) => a.cardId === rad(13) && a.targetId === id));

describe("Bomb Deathknell when no enemy unit can be chosen", () => {
  it("kills your other Bomb there when no enemy unit is there", () => {
    let s = fixture();
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    deployGear(s, "token-bomb", "field:0", 0, "b2");
    s.players[0].hand = [rad(13)];
    s = killGear(s, "b1");
    expect(s.gears).toEqual([]);
  });

  it("kills both of your other Bombs there, and only yours there", () => {
    let s = fixture();
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    deployGear(s, "token-bomb", "field:0", 0, "b2");
    deployGear(s, "token-bomb", "field:0", 0, "b3");
    deployGear(s, "token-bomb", "field:1", 0, "elsewhere");
    deployGear(s, "token-bomb", "field:0", 1, "theirs");
    s.players[0].hand = [rad(13)];
    s = killGear(s, "b1");
    expect(s.gears.map((g) => g.id).sort()).toEqual(["elsewhere", "theirs"]);
  });

  it("kills your other Bomb there when the only enemy has Deflect you cannot pay", () => {
    let s = fixture();
    s.units = [{ ...unit("bird", 1, "field:0", 6), cardId: "token-bird" }];
    deployGear(s, "token-bomb", "field:0", 0, "b1");
    deployGear(s, "token-bomb", "field:0", 0, "b2");
    s.players[0].hand = [rad(13)];
    // Exactly the cost of Lost to the Sands: nothing is left for Deflect.
    s.players[0].energy = 3;
    s.players[0].power = 1;
    s = killGear(s, "b1");
    expect(s.gears).toEqual([]);
    expect(byId(s, "bird").damage).toBe(0);
  });
});

describe("Effects that deal damage to all units", () => {
  it("Avalanche deals 3 once to a unit carrying copied-text Equipment", () => {
    let s = fixture();
    s.units = [unit("copied", 0, "base:0", 8), unit("plain", 1, "base:1", 8)];
    // Svellsongur copies the text of the unit it is attached to.
    s.gears.push({
      id: "svellsongur",
      cardId: "sfd-059-221",
      owner: 0,
      ready: true,
      attachedTo: "copied",
      copiedText: s.units[0].cardId,
    });
    s.units[0].gear.push("svellsongur");
    s.players[0].hand = [rad(79)];
    s = act(s, (a) => a.cardId === rad(79));
    s = act(act(s, "pass"), "pass");
    expect(byId(s, "plain").damage).toBe(3);
    expect(byId(s, "copied").damage).toBe(3);
  });
});
