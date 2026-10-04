import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { cardWave5Scripts } from "../src/game/card-wave5";
import type { GameAction, GameState, PlayerId, Unit } from "../src/game/types";
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const unit = (cardId: string, owner: PlayerId = 0, suffix = ""): Unit => ({
  id: `u:${cardId}:${owner}:${suffix}`,
  cardId,
  owner,
  location: `base:${owner}`,
  ready: true,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
});
function fixture() {
  const s = createGame({ seed: 3103 });
  s.phase = "main";
  s.turn = 6;
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  s.combat = null;
  s.units = [];
  s.gears = [];
  for (const p of s.players) {
    p.legendId = ogn(251);
    p.hand = [];
    p.discard = [];
    p.deck = Array(30).fill(ogn(49));
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.cardsPlayedThisTurn = 0;
    p.legendUsedTurn = -1;
    p.hasBegun = true;
    p.championAvailable = false;
    p.points = 0;
  }
  for (const f of s.fields) {
    f.cardId = ogn(275);
    f.controller = null;
  }
  return s;
}
type Chooser = (a: GameAction[], s: GameState) => GameAction | undefined;
function settle(s: GameState, choose?: Chooser) {
  for (
    let i = 0;
    i < 150 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(a, s) ?? a[0])
      : a.find((a) => a.category === "pass");
    if (!action) throw new Error(`No settle action ${s.phase}`);
    s = applyAction(s, action);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
function startPlay(s: GameState, cardId: string, targetId?: string) {
  s.players[s.priorityPlayer].hand.push(cardId);
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      a.targetId === targetId &&
      !a.additionalCostPaid &&
      !a.repeated &&
      !a.locationId?.startsWith("field:"),
  );
  expect(a, `play ${cardId}`).toBeDefined();
  return applyAction(s, a!);
}
const play = (s: GameState, id: string, target?: string, choose?: Chooser) =>
  settle(startPlay(s, id, target), choose);
function finishCombat(s: GameState, choose?: Chooser) {
  for (
    let i = 0;
    i < 200 && (s.combat || s.stack.length || s.pendingChoice);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    let action: GameAction | undefined;
    if (s.pendingChoice) action = choose?.(a, s) ?? a[0];
    else if (s.phase === "damage")
      action =
        a
          .filter((a) => a.id.startsWith("damage:"))
          .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0] ??
        a.find((a) => a.id === "damage-done");
    else action = a.find((a) => a.category === "pass");
    if (!action)
      throw new Error(`No combat action ${s.phase}: ${a.map((a) => a.id)}`);
    s = applyAction(s, action);
  }
  expect(s.combat).toBeNull();
  return s;
}
describe("fifth-wave executable behavior", () => {
  it.each(Object.keys(cardWave5Scripts))(
    "registers %s with the exact rules face",
    (id) => {
      expect(getCard(id)).toBeDefined();
      expect(getScript(id)).toBeDefined();
    },
  );
  it("Falling Star declares both targets and charges Deflect on each repeated choice", () => {
    let s = fixture();
    const u = unit(ogn(161), 1);
    u.baseMightOverride = 12;
    s.units = [u];
    s = startPlay(s, ogn(29), `${u.id}~${u.id}`);
    expect(s.players[0].power).toBe(30 - (getCard(ogn(29)).power ?? 0) - 2);
    expect(s.stack[0].targetId).toBe(`${u.id}~${u.id}`);
    s = settle(s);
    expect(s.units[0].damage).toBe(6);
  });
  it("Falling Star resolves the surviving target when its partner leaves", () => {
    let s = fixture();
    const a = unit(ogn(49), 1),
      b = unit(ogn(49), 1, "b");
    a.baseMightOverride = b.baseMightOverride = 12;
    s.units = [a, b];
    s = startPlay(s, ogn(29), `${a.id}~${b.id}`);
    s.units = s.units.filter((u) => u.id !== a.id);
    s = settle(s);
    expect(s.units[0].damage).toBe(3);
  });
  it("Falling Star revalidates enemy immunity and restores a pending two-target spell", () => {
    let s = fixture();
    const u = unit(ogn(49), 1);
    u.baseMightOverride = 12;
    s.units = [u];
    s = startPlay(s, ogn(29), `${u.id}~${u.id}`);
    expect(deserializeGame(serializeGame(s))).not.toBeNull();
    s.units[0].untargetableByEnemy = true;
    s = settle(s);
    expect(s.units[0].damage).toBe(0);
  });
  it("Counter Strike prevents one damage instance then expires", () => {
    let s = fixture();
    const u = unit(ogn(49), 1);
    u.baseMightOverride = 12;
    s.units = [u];
    s = play(s, sfd(194), u.id);
    expect(s.players[0].hand).toHaveLength(1);
    s = play(s, ogn(29), `${u.id}~${u.id}`);
    expect(s.units[0].damage).toBe(3);
    expect(s.units[0].preventNextDamageTurn).toBeUndefined();
  });
  it("Lotus Trap doubles each damage instance and multiple traps multiply", () => {
    let s = fixture();
    const u = unit(ogn(49), 1);
    u.baseMightOverride = 30;
    s.units = [u];
    s = play(s, "unl-013-219", u.id);
    s = play(s, "unl-013-219", u.id);
    s = play(s, ogn(29), `${u.id}~${u.id}`);
    expect(s.units[0].damage).toBe(24);
  });
  it("Unyielding Spirit blocks spell damage but preserves unit-sourced Challenge damage", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.baseMightOverride = 10;
    b.baseMightOverride = 12;
    s.units = [a, b];
    s = play(s, ogn(145));
    s = play(s, ogn(29), `${b.id}~${b.id}`);
    expect(s.units[1].damage).toBe(0);
    // Challenge explicitly makes the units deal damage, not the spell.
    const challenge = cards.find((c) => c.name === "Challenge" && !c.variant)!;
    s = play(s, challenge.id, `${a.id}~${b.id}`);
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(10);
  });
  it("Last Breath readies first and deals unit damage without spell bonus damage", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.ready = false;
    a.baseMightOverride = 4;
    b.baseMightOverride = 15;
    b.location = "field:0";
    s.units = [a, b, unit("ogs-001-024", 0, "annie")];
    s = play(s, ogn(145));
    s = play(s, ogn(260), `${a.id}~${b.id}`);
    expect(s.units.find((u) => u.id === a.id)?.ready).toBe(true);
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(4);
  });
  it("Facebreaker requires opponents at one battlefield and triggers Leona only for the enemy stun", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    s.units = [a, b];
    s.players[0].legendId = ogn(261);
    s.players[0].hand = [ogn(220)];
    expect(
      getLegalActions(s, 0).filter((a) => a.category === "play"),
    ).toHaveLength(0);
    a.location = b.location = "field:0";
    s = play(s, ogn(220), `${a.id}~${b.id}`);
    expect(s.units.map((u) => u.stunned)).toEqual([true, true]);
    expect(s.units[0].buff).toBe(1);
  });
  it("Switcheroo swaps raw Might at the same battlefield and keeps buffs separate", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.baseMightOverride = b.baseMightOverride = 4;
    a.temporaryMight = -7;
    b.buff = 1;
    a.location = b.location = "field:0";
    s.units = [a, b];
    s = play(s, sfd(145), `${a.id}~${b.id}`);
    expect(s.units.map((u) => getMight(s, u, false))).toEqual([5, -3]);
    expect(s.units[1].buff).toBe(1);
  });
  it("Switcheroo does nothing when the pair no longer shares a battlefield", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.location = b.location = "field:0";
    a.buff = 1;
    s.units = [a, b];
    s = startPlay(s, sfd(145), `${a.id}~${b.id}`);
    s.units[1].location = "base:1";
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(0);
  });
  it("Smoke and Mirrors from Hidden fixes the first target here and allows the second elsewhere", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 0, "b");
    a.location = "field:0";
    a.temporary = true;
    s.units = [a, b];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "h",
        cardId: "unl-083-219",
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    const actions = getLegalActions(s, 0).filter(
      (a) => a.sourceId === "hidden:h",
    );
    expect(actions.map((x) => x.targetId)).toEqual([`${a.id}~${b.id}`]);
    s = settle(applyAction(s, actions[0]));
    expect(s.units.find((u) => u.id === a.id)?.location).toBe("base:0");
    expect(s.units.find((u) => u.id === b.id)?.location).toBe("field:0");
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Smoke and Mirrors still draws if neither target has Temporary", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      b = unit(ogn(49), 0, "b");
    a.location = "field:0";
    s.units = [a, b];
    s = play(s, "unl-083-219", `${a.id}~${b.id}`);
    expect(s.units[0].location).toBe("field:0");
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Janna heals without an enemy target, following official errata", () => {
    let s = fixture();
    const a = unit(ogn(49));
    a.damage = 1;
    s.units = [a];
    s = play(s, sfd(53));
    expect(s.units[0].damage).toBe(0);
  });
  it.each([2, 8, 92, 127, 85, 119])(
    "Weaponmaster on SFD-%s reattaches owned gear with the discount",
    (n) => {
      let s = fixture();
      const a = unit(ogn(49));
      a.gear = ["g"];
      s.units = [a];
      s.gears = [
        { id: "g", cardId: sfd(95), owner: 0, ready: true, attachedTo: a.id },
      ];
      const power = s.players[0].power! - (getCard(sfd(n)).power ?? 0);
      s = play(
        s,
        sfd(n),
        undefined,
        (actions) =>
          actions.find((a) => a.targetId === "g") ??
          actions.find((a) => a.id === "choose-trigger:skip"),
      );
      const owner = s.units.find((u) => u.cardId === sfd(n))!;
      expect(owner.gear).toEqual(["g"]);
      expect(s.gears[0].attachedTo).toBe(owner.id);
      expect(s.units[0].gear).toEqual([]);
      expect(s.players[0].power).toBe(power);
      if (n === 85)
        expect(getMight(s, owner)).toBe((getCard(sfd(n)).might ?? 0) + 3);
    },
  );
  it("Jax's attach trigger pays Energy before responses, with a legal decline", () => {
    let s = fixture();
    s.gears = [{ id: "g", cardId: sfd(95), owner: 0, ready: true }];
    s = play(s, sfd(119));
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].energy).toBe(30 - (getCard(sfd(119)).energy ?? 0) - 1);
  });
  it("Weaponmaster declares its equipment before responses and cannot replace a removed target", () => {
    let s = fixture();
    s.gears = [{ id: "g", cardId: sfd(95), owner: 0, ready: true }];
    s = startPlay(s, sfd(8));
    while (!s.pendingChoice)
      s = applyAction(
        s,
        getLegalActions(s, s.priorityPlayer).find(
          (a) => a.category === "pass",
        )!,
      );
    expect(s.pendingChoice.kind).toBe("trigger");
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.targetId === "g")!,
    );
    expect(s.stack.at(-1)?.targetId).toBe("g");
    s = deserializeGame(serializeGame(s))!;
    s.gears = [{ id: "new-gear", cardId: sfd(95), owner: 0, ready: true }];
    s = settle(s);
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.units.find((u) => u.cardId === sfd(8))?.gear).toEqual([]);
  });
  it("Sigil recycles a selected rune after an actual conquest and survives the choice reload", () => {
    let s = fixture();
    s.fields[0].cardId = ogn(287);
    const a = unit(ogn(49));
    s.units = [a];
    s.players[0].runes = [
      { id: "r1", domain: "Body", ready: true },
      { id: "r2", domain: "Fury", ready: false },
    ];
    const before = s.players[0].runeDeck.length;
    s = play(s, ogn(173), a.id, (actions) =>
      actions.find((a) => a.locationId === "field:0"),
    );
    s = finishCombat(s, (actions, state) => {
      if (actions.some((a) => a.label === "Recycle Fury rune"))
        expect(deserializeGame(serializeGame(state))).not.toBeNull();
      return actions.find((a) => a.label === "Recycle Fury rune");
    });
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].runes.map((r) => r.id)).toEqual(["r1"]);
    expect(s.players[0].runeDeck).toHaveLength(before + 1);
    expect(s.players[0].runeDeck.at(-1)).toBe("Fury");
  });
  it("Reckoner's Arena activates unit conquer effects when the new turn holds it", () => {
    let s = fixture();
    const a = unit(sfd(69), 1);
    a.location = "field:0";
    s.units = [a];
    s.fields[0].cardId = ogn(286);
    s.fields[0].controller = 1;
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.id === "end-turn")!,
    );
    s = settle(s);
    expect(s.players[1].points).toBe(1);
    expect(
      s.gears.some(
        (g) => g.owner === 1 && getCard(g.cardId).name.startsWith("Gold"),
      ),
    ).toBe(true);
  });
  it("Rengar can react into its attacking battlefield, but not an unrelated enemy battlefield", () => {
    const s = fixture();
    s.players[0].hand = [sfd(25)];
    s.fields.forEach((f) => (f.controller = 1));
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    const locations = getLegalActions(s, 0)
      .filter((a) => a.cardId === sfd(25))
      .map((a) => a.locationId);
    expect(locations).toContain("field:0");
    expect(locations).not.toContain("field:1");
    const end = settle(
      applyAction(
        s,
        getLegalActions(s, 0).find(
          (a) => a.cardId === sfd(25) && a.locationId === "field:0",
        )!,
      ),
    );
    const rengar = end.units.find((u) => u.cardId === sfd(25))!;
    expect(getMight(end, rengar)).toBe((getCard(sfd(25)).might ?? 0) + 2);
  });
  it("Faefolk declares the enemy target before reactions and pulls it to the movement destination", () => {
    let s = fixture();
    const a = unit("unl-112-219"),
      b = unit(ogn(49), 1);
    s.units = [a, b];
    s = play(
      s,
      ogn(173),
      a.id,
      (actions) =>
        actions.find((a) => a.locationId === "field:0") ??
        actions.find((a) => a.targetId === b.id),
    );
    expect(s.units.find((u) => u.id === b.id)?.location).toBe("field:0");
  });
  it("Bandle Tree grants exactly one additional Hidden slot", () => {
    let s = fixture();
    const a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s.fields[0].cardId = ogn(278);
    s.fields[0].controller = 0;
    s.players[0].hand = [ogn(220), sfd(145), "unl-013-219"];
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.id.startsWith("hide:"))!,
    );
    expect(getLegalActions(s, 0).some((a) => a.id.startsWith("hide:"))).toBe(
      true,
    );
    s = applyAction(
      s,
      getLegalActions(s, 0).find((a) => a.id.startsWith("hide:"))!,
    );
    expect(s.hidden).toHaveLength(2);
    expect(getLegalActions(s, 0).some((a) => a.id.startsWith("hide:"))).toBe(
      false,
    );
    expect(deserializeGame(serializeGame(s))).not.toBeNull();
  });
  it("Noxus Saboteur blocks enemy Hidden plays at its own location only", () => {
    const s = fixture();
    const sab = unit(ogn(18), 1);
    sab.location = "field:0";
    s.units = [sab];
    s.hidden = [
      {
        id: "h",
        cardId: "unl-013-219",
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "hidden:h")).toBe(
      false,
    );
    s.units = [];
    const target = unit(ogn(49));
    target.location = "field:0";
    s.units = [target];
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "hidden:h")).toBe(
      true,
    );
  });
  it("Deadbloom and Miss Fortune unlock the printed battlefield entry locations", () => {
    const s = fixture();
    const enemy = unit(ogn(49), 1);
    enemy.location = "field:0";
    s.units = [enemy];
    s.fields[0].controller = 1;
    s.players[0].hand = [ogn(161), ogn(49)];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === ogn(161) && a.locationId === "field:0",
      ),
    ).toBe(true);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === ogn(49) && a.locationId === "field:1",
      ),
    ).toBe(false);
    s.units.push(unit(ogn(193)));
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === ogn(49) && a.locationId === "field:1",
      ),
    ).toBe(true);
  });
  it("Kayn counts real moves, preserves its immunity in saves, and expires next turn", () => {
    let s = fixture();
    const k = unit(ogn(189));
    s.units = [k];
    s = play(s, ogn(173), k.id, (a) =>
      a.find((x) => x.locationId === "field:0"),
    );
    s = play(s, ogn(173), k.id, (a) =>
      a.find((x) => x.locationId === "base:0"),
    );
    expect(getKeywords(s, s.units[0])).toContain("Prevent all damage");
    s = finishCombat(deserializeGame(serializeGame(s))!);
    s = play(s, ogn(29), `${k.id}~${k.id}`);
    expect(s.units[0].damage).toBe(0);
    s.turn++;
    expect(getKeywords(s, s.units[0])).not.toContain("Prevent all damage");
  });
  it("Counter Strike on a Tank absorbs all assigned combat damage without blocking assignment", () => {
    let s = fixture();
    const a = unit(ogn(49)),
      tank = unit(ogn(54), 1),
      b = unit(ogn(49), 1, "b");
    a.baseMightOverride = 15;
    tank.baseMightOverride = 3;
    tank.temporaryKeywords = ["Tank"];
    a.location = tank.location = b.location = "field:0";
    s.units = [a, tank, b];
    s = play(s, sfd(194), tank.id);
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "assign",
      engaged: true,
      total: [15, 5],
      remaining: [15, 5],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    s.phase = "damage";
    s.priorityPlayer = 0;
    const hit = getLegalActions(s, 0).find((a) => a.category === "combat")!;
    expect(hit.targetId).toBe(tank.id);
    expect(hit.amount).toBe(15);
    s = applyAction(s, hit);
    s = finishCombat(s);
    expect(s.units.find((u) => u.id === tank.id)).toBeDefined();
    expect(s.units.find((u) => u.id === b.id)).toBeDefined();
  });
});
