import { describe, it, expect } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  createGame,
  getLegalActions,
  applyAction,
  getMight,
} from "../src/game/engine";
import type {
  GameState,
  PlayerId,
  Unit,
  LocationId,
  GameAction,
} from "../src/game/types";
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
const unit = (
  id: string,
  cardId: string,
  owner: PlayerId = 0,
  location: LocationId = "base:0",
): Unit => ({
  id,
  cardId,
  owner,
  location,
  ready: true,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
});
function position() {
  const s = createGame({
    playerDeckId: "precon-shen",
    botDeckId: "precon-zed",
    seed: 101,
  });
  s.phase = "main";
  s.turn = 4;
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
  s.stack = [];
  s.log = [];
  s.units = [];
  for (const p of s.players) {
    p.hand = [];
    p.discard = [];
    p.championAvailable = false;
    p.hasBegun = true;
    p.mulliganDone = true;
    p.energy = 30;
    p.runes = Array.from({ length: 6 }, (_, i) => ({
      id: `r${p.id}-${i}`,
      ready: true,
      domain: p.id === 0 ? "Order" : "Chaos",
    }));
    p.runeDeck = Array(6).fill("Order");
  }
  return s;
}
function act(s: GameState, search: string | ((a: GameAction) => boolean)) {
  const a = getLegalActions(s, s.priorityPlayer).find(
    typeof search === "string" ? (a) => a.id === search : search,
  );
  expect(
    a,
    `Missing ${String(search)} at ${s.phase}: ${getLegalActions(s, s.priorityPlayer).map((a) => a.id)}`,
  ).toBeDefined();
  return applyAction(s, a!);
}
function resolve(s: GameState) {
  let n = 0;
  while (s.stack.length && !s.pendingChoice && n++ < 30) s = act(s, "pass");
  return s;
}
describe("Vendetta printed effects through real legal actions", () => {
  it("Empower pays the printed cost once and keeps the resulting bonus after turn cleanup", () => {
    let s = position();
    s.units = [unit("paws", ven(43))];
    const before = s.players[0].energy;
    s = act(s, (a) => a.id.startsWith("ven-empower:paws"));
    s = resolve(s);
    expect(s.players[0].energy).toBe(before - 7);
    expect(getMight(s, s.units[0])).toBe(getCard(ven(43)).might! + 7);
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ven-empower:paws")),
    ).toBe(false);
    s = act(s, "end-turn");
    s = resolve(s);
    expect(s.units[0].empowered).toBe(true);
  });
  it("Ki Barrier prevents seven damage without changing Might", () => {
    let s = position();
    s.units = [unit("target", "ogn-142-298", 0, "field:0")];
    s.players[0].hand = [ven(126), "ogn-085-298"];
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.cardId === ven(126) &&
        a.targetId === "target",
    );
    s = resolve(s);
    expect(s.units[0].preventDamage).toBe(7);
    expect(getMight(s, s.units[0])).toBe(10);
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.cardId === "ogn-085-298" &&
        a.targetId === "target",
    );
    s = resolve(s);
    expect(s.units[0].damage).toBe(0);
    expect(s.units[0].preventDamage).toBe(1);
  });
  it("Twilight Shroud prevents enemy targeting and expires at turn end", () => {
    let s = position();
    s.units = [unit("ally", "ogn-049-298", 0, "field:0")];
    s.players[0].hand = [ven(31)];
    s.players[1].hand = ["ogn-009-298"];
    s = act(s, (a) => a.category === "play" && a.cardId === ven(31));
    s = resolve(s);
    expect(s.units[0].untargetableByEnemy).toBe(true);
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    expect(
      getLegalActions(s, 1).some(
        (a) => a.cardId === "ogn-009-298" && a.targetId === "ally",
      ),
    ).toBe(false);
    s = act(s, "end-turn");
    expect(s.units[0].untargetableByEnemy).toBe(false);
  });
  it("Flow pays its own cost and banishes the spell after resolution, empowering Zed", () => {
    let s = position();
    s.players[0].legendId = ven(143);
    s.players[0].discard = [ven(116)];
    s.units = [unit("ally", "ogn-049-298")];
    const before = s.players[0].energy;
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.sourceId === "trash:0" &&
        a.targetId === "ally",
    );
    expect(s.players[0].energy).toBe(before - 3);
    s = resolve(s);
    expect(s.players[0].banished).toContain(ven(116));
    expect(s.players[0].discard).not.toContain(ven(116));
    expect(
      (s.players[0] as (typeof s.players)[0] & { legendEmpowered?: boolean })
        .legendEmpowered,
    ).toBe(true);
    expect(getMight(s, s.units[0])).toBe(5);
  });
  it("Shadow Clone chooses a unit to banish for Assault 4", () => {
    let s = position();
    s.players[0].legendId = ven(143);
    s.players[0].discard = ["ogn-049-298", "ogn-050-298"];
    s.units = [
      unit("clone", "token-shadow-clone"),
      unit("enemy", "ogn-142-298", 1, "field:0"),
    ];
    s = act(
      s,
      (a) =>
        a.category === "move" &&
        a.sourceId === "clone" &&
        a.locationId === "field:0",
    );
    s = act(s, "move-confirm");
    s = resolve(s);
    expect(s.pendingChoice?.kind).toBe("custom");
    s = act(
      s,
      (a) =>
        a.id.startsWith("choose-custom:") &&
        a.label.includes(getCard("ogn-049-298").name),
    );
    expect(s.players[0].banished).toContain("ogn-049-298");
    expect(s.players[0].discard).toEqual(["ogn-050-298"]);
    expect(s.units.find((u) => u.id === "clone")?.temporaryAssault).toBe(4);
  });
  it("Lacerate disempowers before checking lethal Might", () => {
    let s = position();
    const paws = unit("paws", ven(43), 1, "field:0");
    paws.empowered = true;
    s.units = [paws];
    s.players[0].hand = [ven(127)];
    s = act(
      s,
      (a) =>
        a.category === "play" && a.cardId === ven(127) && a.targetId === "paws",
    );
    s = resolve(s);
    expect(s.units).toHaveLength(0);
    expect(s.players[1].discard).toContain(ven(43));
  });
});
