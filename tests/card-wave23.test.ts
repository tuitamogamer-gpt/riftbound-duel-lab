import { describe, it, expect } from "vitest";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
import { cards } from "../src/data/cards";
import { getLegalActions } from "../src/game/engine";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
describe("wave23 alternative discounts and Repeat grants", () => {
  it("Irelia offers energy or power reductions, including a zero-Power play", () => {
    let s = fixture();
    s.units = [{ ...unit("irelia"), cardId: sfd(141) }];
    s.players[0].hand = [ogn(154)];
    const actions = getLegalActions(s, 0).filter((a) => a.category === "play");
    expect(new Set(actions.map((a) => a.flexibleEnergy))).toEqual(
      new Set([0, 1]),
    );
    s.players[0].power = 0;
    s = act(s, (a) => a.category === "play");
    expect(s.players[0].energy).toBe(26);
    expect(s.players[0].power).toBe(0);
  });
  it("Ezreal discounts only an optional additional cost, not the base cost", () => {
    let s = fixture();
    s.units = [{ ...unit("ez"), cardId: sfd(149) }];
    s.players[0].hand = [sfd(66)];
    const actions = getLegalActions(s, 0).filter(
      (a) => a.category === "play" && a.repeated,
    );
    expect(actions.length).toBeGreaterThan(0);
    s = act(s, actions[0].id);
    expect(s.players[0].energy).toBe(27);
  });
  it("Portal gives the next spell Repeat at its printed cost and is consumed at finalization", () => {
    let s = fixture();
    addGear(s, 78, "portal");
    s = chain(act(s, (a) => a.sourceId === "portal"));
    s.players[0].hand = [ogn(154)];
    s.units = [unit("a"), unit("b")];
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.repeated === true &&
        a.targetId === "a" &&
        a.repeatedTargetId === "b",
    );
    expect(s.players[0].repeatGrants).toEqual([]);
    s = chain(s);
    expect(s.units.map((u) => u.temporaryMight)).toEqual([7, 7]);
  });
  it("multiple Repeat grants are paid independently and choose effects before responses", () => {
    let s = fixture();
    s.players[0].repeatGrants = [{ turn: s.turn }, { turn: s.turn }];
    s.players[0].hand = [ogn(154)];
    s.units = [unit("a")];
    s = act(s, (a) => a.category === "play" && a.repeatMask === 3);
    expect(s.pendingChoice?.kind).toBe("effectDraft");
    s = act(s, "draft:target:a");
    s = act(s, "draft:target:a");
    s = act(s, "draft:target:a");
    s = act(s, "draft:done");
    expect(s.players[0].energy).toBe(18);
    s = chain(s);
    expect(s.units[0].temporaryMight).toBe(21);
  });
  it("Risen Altar offers either discount on the Empower activation", () => {
    let s = fixture();
    s.fields[0].cardId = ven(163);
    s.units = [{ ...unit("mel", 0, "field:0"), cardId: ven(69) }];
    s = act(s, (a) => a.sourceId === "mel" && a.flexibleEnergy === 1);
    expect(s.players[0].energy).toBe(28);
    s = chain(s);
    expect(s.units[0].empowered).toBe(true);
  });
});
