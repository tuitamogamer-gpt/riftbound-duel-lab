import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { applyAction, getMight } from "../src/game/engine";
import type { GameState } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import { actions, byId, play, rad, settle } from "./fixtures/radiance";

/**
 * Regressions from the 10 November 2026 review of the Radiance scripts against
 * their printed text.
 */
const recruits = (s: GameState, owner = 0) =>
  s.units.filter(
    (u) => u.owner === owner && getCard(u.cardId).name.startsWith("Recruit"),
  );
/** Resolve everything, preferring options whose label contains one of the texts. */
function drive(s: GameState, prefer: string[] = []) {
  for (
    let i = 0;
    i < 80 &&
    (s.stack.length ||
      s.pendingChoice ||
      s.pendingTriggers?.length ||
      s.combat);
    i++
  ) {
    const options = actions(s);
    s = applyAction(
      s,
      options.find((a) => prefer.some((text) => a.label.includes(text))) ??
        (s.pendingChoice
          ? options[0]
          : (options.find((a) => a.id === "pass") ?? options[0])),
    );
  }
  return s;
}
/** Put an ability on the chain and pass until it asks for a choice or ends. */
function resolve(
  s: GameState,
  cardId: string,
  effects: GameState["stack"][number]["effects"],
  rest: Partial<GameState["stack"][number]> = {},
) {
  s.stack.push({
    id: `review-${s.nextId++}`,
    kind: "ability",
    cardId,
    player: 0,
    effects,
    ...rest,
  });
  s.priorityPlayer = 0;
  for (
    let i = 0;
    i < 20 && !s.pendingChoice && (s.stack.length || s.pendingTriggers?.length);
    i++
  )
    s = act(s, "pass");
  return s;
}
const REARGUARD = "ogn-010-298";

describe("Radiance wave 5 corrections", () => {
  it("Remember the Fallen plays up to three cards from the trash", () => {
    let s = fixture();
    s.players[0].discard = [REARGUARD, REARGUARD, REARGUARD];
    s.players[0].hand = [rad(135)];
    s = drive(play(s, rad(135)), ["Play Legion Rearguard"]);
    expect(s.units.filter((u) => u.cardId === REARGUARD)).toHaveLength(3);
    expect(s.players[0].discard).not.toContain(REARGUARD);
  });

  it("Remember the Fallen may stop after fewer than three", () => {
    let s = fixture();
    s.players[0].discard = [REARGUARD, REARGUARD, REARGUARD];
    s.players[0].hand = [rad(135)];
    s = play(s, rad(135));
    for (let i = 0; i < 10 && !s.pendingChoice; i++) s = act(s, "pass");
    s = act(s, (a) => a.label.includes("Play Legion Rearguard"));
    s = drive(s, ["Do not play a card"]);
    expect(s.units.filter((u) => u.cardId === REARGUARD)).toHaveLength(1);
    expect(s.players[0].discard.filter((id) => id === REARGUARD)).toHaveLength(
      2,
    );
  });

  it("Protector's Shield attaches when played and gives +1 Might", () => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2)];
    s.players[0].hand = [rad(123)];
    s = settle(play(s, rad(123)));
    expect(s.gears.find((g) => g.cardId === rad(123))?.attachedTo).toBe("a");
    expect(getMight(s, byId(s, "a"))).toBe(3);
  });

  it.each([71, 123])("rad-%i equips for 1 Energy and no Power", (n) => {
    let s = fixture();
    s.units = [unit("a", 0, "base:0", 2)];
    s.gears.push({ id: "eq", cardId: rad(n), owner: 0, ready: true });
    s.players[0].energy = 1;
    s.players[0].power = 0;
    s.players[0].runes = [];
    s = settle(act(s, (a) => a.id.startsWith("equip:eq")));
    expect(s.gears.find((g) => g.id === "eq")?.attachedTo).toBe("a");
    expect(s.players[0].energy).toBe(0);
  });

  it("Firebrand Raider readies unit tokens as they enter", () => {
    let s = fixture();
    s.units = [
      { ...unit("raider", 0, "base:0", 6), cardId: rad(19) },
      unit("enemy", 1, "field:1", 5),
    ];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(7)];
    s = act(act(play(s, rad(7), { targetId: "field:1" }), "pass"), "pass");
    expect(recruits(s)).toHaveLength(3);
    expect(recruits(s).every((u) => u.ready)).toBe(true);
  });

  it("The Exile readies tokens played to a battlefield you control", () => {
    let s = fixture();
    s.players[0].legendId = rad(149);
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    s = settle(
      resolve(
        s,
        rad(9),
        [{ type: "token", cardName: "Mech", location: "here" }],
        { sourceId: "ally", locationId: "field:0" },
      ),
    );
    const mech = s.units.find((u) => u.token)!;
    expect(mech.location).toBe("field:0");
    expect(mech.ready).toBe(true);
  });

  it("Demacian Illuminators trigger once for one batch of deaths", () => {
    let s = fixture();
    s.units = [
      { ...unit("ill", 0, "base:0", 3), cardId: rad(131) },
      unit("c", 0, "base:0", 3),
      unit("a", 0, "field:0", 1),
      unit("x", 1, "field:0", 1),
      unit("b", 0, "field:0", 1),
    ];
    s.stack.push({
      id: "boom",
      kind: "ability",
      cardId: rad(4),
      player: 0,
      effects: [
        {
          type: "damageAll",
          amount: 5,
          who: "all",
          condition: "allBattlefields",
        },
      ],
    });
    s.priorityPlayer = 0;
    const want = ["ill", "c"];
    for (let i = 0; i < 40 && (s.stack.length || s.pendingChoice); i++) {
      const options = actions(s);
      const target = s.pendingChoice ? want.shift() : undefined;
      s = applyAction(
        s,
        s.pendingChoice
          ? (options.find((a) => a.targetId === target) ?? options[0])
          : options.find((a) => a.id === "pass")!,
      );
    }
    expect(s.units.filter((u) => u.buff).map((u) => u.id)).toEqual(["ill"]);
  });

  it("Black Market accepts Power paid by recycling exhausted runes", () => {
    const s = fixture();
    s.fields[1].cardId = rad(158);
    s.players[0].power = 0;
    s.players[0].runes = [
      { id: "r1", domain: "Body", ready: false },
      { id: "r2", domain: "Body", ready: false },
    ];
    expect(
      actions(s).some((a) => a.id.startsWith("radiance:black-market")),
    ).toBe(true);
    s.players[0].runes = [{ id: "r1", domain: "Body", ready: false }];
    expect(
      actions(s).some((a) => a.id.startsWith("radiance:black-market")),
    ).toBe(false);
  });

  it("Lingering Animus enters ready after you spend a Gold token", () => {
    let s = fixture();
    s.gears.push({
      id: "gold",
      cardId: "sfd-t03",
      owner: 0,
      ready: true,
      token: true,
    });
    s.players[0].hand = [rad(5)];
    s = act(s, (a) => a.id.startsWith("gold:"));
    s = settle(play(s, rad(5), { locationId: "base:0" }));
    expect(s.units.find((u) => u.cardId === rad(5))?.ready).toBe(true);
  });

  it("Ephemeral Ward dies when you play a unit token", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:1", 5)];
    s.fields[1].controller = 1;
    s.gears.push({ id: "ward", cardId: rad(39), owner: 0, ready: true });
    s.players[0].hand = [rad(7)];
    s = settle(play(s, rad(7), { targetId: "field:1" }));
    expect(s.gears.some((g) => g.id === "ward")).toBe(false);
  });

  it("Titanic Shrine draws for a token mightier than every other unit", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 2)];
    s.gears.push({ id: "shrine", cardId: rad(89), owner: 0, ready: true });
    const hand = s.players[0].hand.length;
    s = settle(
      resolve(
        s,
        rad(9),
        [{ type: "token", cardName: "Mech", location: "here" }],
        { sourceId: "ally", locationId: "field:0" },
      ),
    );
    expect(s.gears.find((g) => g.id === "shrine")?.ready).toBe(false);
    expect(s.players[0].hand).toHaveLength(hand + 1);
  });

  it("a unit token uses up the Firelights' Hideout and Hunters' Circle grants", () => {
    let s = fixture();
    s.fields[0].cardId = rad(163);
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 2)];
    s.radiance = { accelerateNext: [{ player: 0, turn: s.turn }] };
    s = settle(
      resolve(
        s,
        rad(9),
        [{ type: "token", cardName: "Mech", location: "here" }],
        { sourceId: "ally", locationId: "field:0" },
      ),
    );
    expect(s.radiance?.accelerateNext ?? []).toHaveLength(0);
    expect(s.radiance?.once?.["hunters:field:0:0"]).toBe(s.turn);
  });

  it("Watchful Curator's Deflect taxes gear chosen by Mordekaiser, Dominating", () => {
    let s = fixture();
    s.units = [
      { ...unit("m", 0, "base:0", 8), cardId: rad(137) },
      { ...unit("cur", 1, "base:1", 4), cardId: rad(37) },
    ];
    s.gears.push({ id: "g", cardId: "sfd-033-221", owner: 1, ready: true });
    s.players[0].hand = ["ogn-001-298"];
    s.players[0].power = 0;
    s.players[0].runes = [];
    s = resolve(s, rad(137), [{ type: "special", custom: "radiance5:morde" }], {
      sourceId: "m",
      kind: "trigger",
    });
    expect(s.pendingChoice).not.toBeNull();
    expect(actions(s).some((a) => a.label.includes("Doran's Shield"))).toBe(
      false,
    );
    // With the Power available, the choice is offered and the tax is paid.
    s.players[0].power = 1;
    s = drive(s, ["Doran's Shield"]);
    expect(s.gears.some((g) => g.id === "g")).toBe(false);
    expect(s.players[0].power).toBe(0);
  });

  it("Mournful Spirit may kill Equipment attached to a unit there", () => {
    let s = fixture();
    s.units = [
      { ...unit("ms", 0, "field:0", 1), cardId: rad(126) },
      { ...unit("e", 1, "field:0", 3), gear: ["eq"] },
    ];
    s.gears.push({
      id: "eq",
      cardId: "sfd-033-221",
      owner: 1,
      ready: true,
      attachedTo: "e",
    });
    s = resolve(s, rad(59), [{ type: "kill", target: "anyUnit" }], {
      targetId: "ms",
    });
    expect(s.pendingChoice).not.toBeNull();
    s = drive(s, ["Kill Doran's Shield"]);
    expect(s.gears.some((g) => g.id === "eq")).toBe(false);
    expect(s.units.some((u) => u.id === "e")).toBe(true);
  });

  it("a unit that can't move this turn is not moved by effects either", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("a", 0, "field:0", 2)];
    s.players[0].hand = [rad(26), rad(31)];
    s = settle(play(s, rad(26), { locationId: "field:0", id: "|enter-ready" }));
    const boar = s.units.find((u) => u.cardId === rad(26))!;
    expect(boar.ready).toBe(true);
    s = play(s, rad(31), { locationId: "field:0" });
    for (let i = 0; i < 10 && !s.pendingChoice; i++) s = act(s, "pass");
    expect(
      actions(s).some((a) => a.label.includes("Move Entrenched Boar")),
    ).toBe(false);
    s = drive(s);
    expect(byId(s, boar.id).location).toBe("field:0");
  });

  it("Invigorating Bloom exhausts the Mighty unit as the ability is activated", () => {
    let s = fixture();
    s.units = [unit("big", 0, "base:0", 6), unit("small", 0, "base:0", 2)];
    s.gears.push({ id: "bloom", cardId: rad(35), owner: 0, ready: true });
    const hand = s.players[0].hand.length;
    expect(
      actions(s).filter(
        (a) => a.sourceId === "bloom" && !a.id.includes("equip"),
      ).length,
    ).toBe(1);
    s = act(s, (a) => a.sourceId === "bloom");
    expect(s.stack).toHaveLength(1);
    expect(byId(s, "big").ready).toBe(false);
    expect(s.gears.find((g) => g.id === "bloom")?.ready).toBe(false);
    s = drive(s);
    expect(s.players[0].hand).toHaveLength(hand + 1);
    expect(byId(s, "small").ready).toBe(true);
  });

  it("Invigorating Bloom offers one activation for each ready Mighty unit", () => {
    const s = fixture();
    s.units = [unit("small", 0, "base:0", 2)];
    s.gears.push({ id: "bloom", cardId: rad(35), owner: 0, ready: true });
    expect(actions(s).some((a) => a.sourceId === "bloom")).toBe(false);
    s.units.push(
      unit("big", 0, "base:0", 6),
      unit("huge", 0, "base:0", 7),
      { ...unit("tired", 0, "base:0", 9), ready: false },
      unit("theirs", 1, "base:1", 9),
    );
    expect(
      actions(s)
        .filter((a) => a.sourceId === "bloom")
        .map((a) => a.costSourceId)
        .sort(),
    ).toEqual(["big", "huge"]);
    expect(actions(s).find((a) => a.costSourceId === "big")?.label).toBe(
      "Invigorating Bloom: Exhaust Playful Phantom: draw 1",
    );
    s.gears[0].ready = false;
    expect(actions(s).some((a) => a.sourceId === "bloom")).toBe(false);
  });

  it("spending Gold is recorded only in a game that holds a Lingering Animus", () => {
    const gold = () => {
      const s = fixture();
      s.gears.push({
        id: "gold",
        cardId: "sfd-t03",
        owner: 0,
        ready: true,
        token: true,
      });
      return s;
    };
    let s = act(gold(), (a) => a.id.startsWith("gold:"));
    expect(s.radiance?.once?.["died:0"]).toBeUndefined();
    s = gold();
    s.players[1].deck = [...s.players[1].deck, rad(5)];
    s = act(s, (a) => a.id.startsWith("gold:"));
    expect(s.radiance?.once?.["died:0"]).toBe(s.turn);
  });

  it("Watchful Curator's Deflect taxes Equipment chosen by Mournful Spirit", () => {
    let s = fixture();
    s.units = [
      { ...unit("ms", 0, "field:0", 1), cardId: rad(126) },
      { ...unit("cur", 1, "field:0", 4), cardId: rad(37), gear: ["eq"] },
    ];
    s.gears.push({
      id: "eq",
      cardId: "sfd-033-221",
      owner: 1,
      ready: true,
      attachedTo: "cur",
    });
    s.players[0].power = 0;
    s.players[0].runes = [];
    s = resolve(s, rad(59), [{ type: "kill", target: "anyUnit" }], {
      targetId: "ms",
    });
    expect(s.pendingChoice).not.toBeNull();
    expect(actions(s).some((a) => a.label === "Kill Watchful Curator")).toBe(
      true,
    );
    expect(actions(s).some((a) => a.label === "Kill Doran's Shield")).toBe(
      false,
    );
    s.players[0].power = 1;
    s = drive(s, ["Kill Doran's Shield"]);
    expect(s.gears.some((g) => g.id === "eq")).toBe(false);
    expect(s.players[0].power).toBe(0);
  });

  it("Mournful Spirit dying in a base may kill a gear in that base only", () => {
    let s = fixture();
    s.units = [{ ...unit("ms", 0, "base:0", 1), cardId: rad(126) }];
    s.gears.push(
      { id: "here", cardId: "sfd-033-221", owner: 0, ready: true },
      { id: "far", cardId: "sfd-033-221", owner: 1, ready: true },
    );
    s = resolve(s, rad(59), [{ type: "kill", target: "anyUnit" }], {
      targetId: "ms",
    });
    expect(
      actions(s).filter((a) => a.label === "Kill Doran's Shield"),
    ).toHaveLength(1);
    s = drive(s, ["Kill Doran's Shield"]);
    expect(s.gears.map((g) => g.id)).toEqual(["far"]);
  });

  it("Hunker Down's lock also stops Cataclysm from moving the unit", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 0, "base:0", 2), ready: false },
      unit("e", 1, "field:1", 3),
    ];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(34), rad(84)];
    s = drive(play(s, rad(34), { targetId: "a" }));
    expect(byId(s, "a").ready).toBe(true);
    s = drive(play(s, rad(84), { targetId: "a" }));
    expect(byId(s, "a").location).toBe("base:0");
    expect(s.players[1].cannotPlaySpellsTurn).toBe(s.turn);
  });

  it("Jarvan IV does not offer a unit that can't move this turn", () => {
    let s = fixture();
    s.units = [
      { ...unit("j", 0, "field:0", 7), cardId: rad(133) },
      { ...unit("boar", 0, "base:0", 2), cardId: rad(26) },
      unit("free", 0, "base:0", 2),
    ];
    byId(s, "boar").moveLockedTurn = s.turn;
    s = resolve(
      s,
      rad(133),
      [{ type: "special", custom: "radiance5:jarvan-call" }],
      {
        sourceId: "j",
        kind: "trigger",
      },
    );
    const labels = actions(s).map((a) => a.label);
    expect(labels).toContain("Move Playful Phantom to Jarvan's battlefield");
    expect(labels.some((l) => l.includes("Entrenched Boar"))).toBe(false);
  });

  it("a move lock on its controller's action only (Vex) still allows effects", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [{ ...unit("a", 0, "field:0", 2), moveLockedTurn: 5 }];
    expect(s.turn).toBe(5);
    s.players[0].hand = [rad(31)];
    expect(actions(s).some((a) => a.id.startsWith("move-start:a"))).toBe(false);
    s = drive(play(s, rad(31), { locationId: "field:0" }), [
      "Move Playful Phantom to your base",
    ]);
    expect(byId(s, "a").location).toBe("base:0");
  });
});
