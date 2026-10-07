import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { starterDecks, validateDeck } from "../src/data/decks";
import {
  applyAction,
  getLegalActions,
  getMight,
  getKeywords,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { cardRegistry, getScript } from "../src/game/scripts";
import { cardWave11Scripts } from "../src/game/card-wave11";
import { validState } from "../src/persistence";
import { combatUnit, createCombatFixture } from "./fixtures/combat";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";
const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
function fixture() {
  const s = createCombatFixture();
  s.phase = "main";
  s.combat = null;
  s.units = [];
  s.gears = [];
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  for (const p of s.players) {
    p.legendId = ogn(259);
    p.hand = [];
    p.deck = Array(30).fill(ogn(49));
    p.discard = [];
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.legendUsedTurn = -1;
  }
  s.fields.forEach((f) => {
    f.cardId = ogn(278);
    f.controller = null;
  });
  return s;
}
function unit(
  id: string,
  owner: PlayerId = 0,
  location: Unit["location"] = "base:0",
  might = 8,
) {
  return { ...combatUnit(id, owner, might, ogn(49)), location, ready: true };
}
function act(s: GameState, find: string | ((a: GameAction) => boolean)) {
  const actions = getLegalActions(s, s.priorityPlayer);
  const a = actions.find(
    typeof find === "string" ? (a) => a.id === find : find,
  );
  expect(a, actions.map((a) => a.id).join("\n")).toBeDefined();
  return applyAction(s, a!);
}
function chain(s: GameState) {
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const a = s.pendingChoice
      ? actions[0]
      : actions.find((a) => a.id === "pass");
    expect(a).toBeDefined();
    s = applyAction(s, a!);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
function play(s: GameState, cardId: string) {
  s.players[s.priorityPlayer].hand.push(cardId);
  return act(s, (a) => a.category === "play" && a.cardId === cardId);
}
function addGear(
  s: GameState,
  n: number,
  id = `g${n}`,
  attachedTo?: string,
  owner: PlayerId = 0,
) {
  s.gears.push({ id, cardId: sfd(n), owner, ready: true, attachedTo });
  if (attachedTo) s.units.find((u) => u.id === attachedTo)!.gear.push(id);
}
function effect(
  s: GameState,
  effects: Effect[],
  targetId?: string,
  p: PlayerId = 0,
) {
  s.stack.push({
    id: `test-${s.nextId++}`,
    kind: "ability",
    cardId: ogn(4),
    player: p,
    effects,
    targetId,
  });
  return chain(s);
}
function conquer(s: GameState) {
  s = chain(act(act(s, "move-start:ally:field:0"), "move-confirm"));
  if (s.combat) s = chain(act(act(s, "pass"), "pass"));
  return s;
}
function nextOwnTurn(s: GameState) {
  s = chain(act(s, "end-turn"));
  return chain(act(s, "end-turn"));
}

const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function heirloom(s: GameState) {
  s.gears.push({ id: "heirloom", cardId: unl(158), owner: 0, ready: true });
}
function hiddenEdge(s: GameState) {
  s.hidden = [
    {
      id: "edge",
      cardId: sfd(139),
      owner: 0,
      location: "field:0",
      hiddenTurn: s.turn - 1,
    },
  ];
  return act(s, (a) => a.category === "play" && a.sourceId === "hidden:edge");
}
function attack(s: GameState) {
  return act(act(s, "move-start:ally:field:0"), "move-confirm");
}

describe("eleventh wave: Equipment, local auras and XP costs", () => {
  it.each(Object.keys(cardWave11Scripts))(
    "registers complete face %s",
    (id) => {
      expect(cardRegistry[id].status).not.toBe("unsupported");
      expect(getScript(id)?.equipment?.text).toBeTruthy();
    },
  );
  it("registers the completed remaining Equipment panels", () => {
    for (const n of [51, 59, 73, 150, 178, 191])
      expect(getScript(sfd(n))?.equipment?.text).toBeTruthy();
  });
  it.each([190, 192])("enforces the Unique deck limit on Equipment %i", (n) => {
    const deck = structuredClone(starterDecks[0]);
    deck.main = [{ cardId: sfd(n), count: 2 }];
    expect(validateDeck(deck)).toContain(
      `More than 1 copies: ${getCard(sfd(n)).name}`,
    );
  });
  it("Sterak's Gage plays as a Reaction, declares its unit, and grants exactly 3 Might", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s.currentPlayer = 1;
    s.stack = [
      {
        id: "opponent",
        cardId: ogn(4),
        kind: "ability",
        player: 1,
        effects: [],
      },
    ];
    s = play(s, sfd(56));
    s = act(s, (a) => a.targetId === "other");
    expect(s.stack.at(-1)?.targetId).toBe("other");
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.players[0].energy).toBe(27);
    expect(s.players[0].power).toBe(28);
    s = chain(s);
    expect(getMight(s, s.units[0])).toBe(8);
    expect(getMight(s, s.units[1])).toBe(11);
  });
  it("Sterak's declared attachment fizzles if the selected unit leaves", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s = play(s, sfd(56));
    s = act(s, (a) => a.targetId === "ally");
    s.units = s.units.filter((u) => u.id !== "ally");
    s = chain(s);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it("Edge of Night played from hand remains unattached until its Chaos Equip cost is paid", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s = chain(play(s, sfd(139)));
    expect(s.gears[0].attachedTo).toBeUndefined();
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "wrong", domain: "Body", ready: false }];
    expect(getLegalActions(s, 0).some((a) => a.id.startsWith("equip:"))).toBe(
      false,
    );
    s.players[0].runes[0].domain = "Chaos";
    s = chain(act(s, `equip:${s.gears[0].id}:ally`));
    expect(s.players[0].runes).toHaveLength(0);
    expect(getMight(s, s.units[0])).toBe(10);
  });
  it("Hidden Edge chooses only the original battlefield and resumes the choice after save/load", () => {
    let s = fixture();
    s.units = [
      unit("ally", 0, "field:0"),
      unit("other", 0, "field:0"),
      unit("away", 0, "field:1"),
      unit("enemy", 1, "field:0"),
    ];
    s.fields[0].controller = 0;
    s = hiddenEdge(s);
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    expect(
      getLegalActions(s, 0)
        .map((a) => a.targetId)
        .sort(),
    ).toEqual(["ally", "other"]);
    s = act(s, (a) => a.targetId === "ally");
    expect(s.players[0].energy).toBe(30);
    expect(s.players[0].power).toBe(30);
    expect(s.gears[0].attachedTo).toBeUndefined();
    s = chain(s);
    expect(s.hidden).toHaveLength(0);
    expect(s.gears[0].attachedTo).toBe("ally");
  });
  it("Hidden Edge never retargets a unit that leaves the chosen battlefield", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0"), unit("other", 0, "field:0")];
    s.fields[0].controller = 0;
    s = hiddenEdge(s);
    s = act(s, (a) => a.targetId === "ally");
    s.units[0].location = "base:0";
    s = chain(s);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it.each([0, 1] as const)(
    "Forgefire Cape triggers on %s's attack/defense without choosing or taxing Deflect",
    (owner) => {
      let s = fixture();
      s.units = [
        unit("ally"),
        unit("friend", 0, "field:0"),
        unit("enemy", 1, "field:0"),
        unit("enemy2", 1, "field:0"),
        unit("away", 1, "field:1"),
      ];
      s.units.forEach((u) => {
        u.temporaryKeywords = ["Deflect 4"];
      });
      s.fields[0].controller = 1;
      s.players[owner].power = 0;
      addGear(s, 190, "cape", owner ? "enemy" : "ally", owner);
      s = attack(s);
      expect(s.pendingChoice).toBeNull();
      expect(
        s.stack.some((x) => x.sourceId === (owner ? "enemy" : "ally")),
      ).toBe(true);
      s = chain(s);
      for (const u of s.units)
        expect(u.damage, u.id).toBe(
          u.owner !== owner && u.location === "field:0" ? 2 : 0,
        );
      expect(s.players[owner].power).toBe(0);
    },
  );
  it("multiple Capes trigger independently and survive removal of their gear", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("enemy", 1, "field:0", 20)];
    s.fields[0].controller = 1;
    addGear(s, 190, "cape1", "ally");
    addGear(s, 190, "cape2", "ally");
    s = attack(s);
    expect(s.stack.filter((x) => x.sourceId === "ally")).toHaveLength(2);
    s.gears = [];
    s.units[0].gear = [];
    s = chain(s);
    expect(s.units[1].damage).toBe(4);
  });
  it.each([false, true])(
    "Cape uses the source's live location; source removed=%s",
    (removed) => {
      let s = fixture();
      s.units = [
        unit("ally"),
        unit("enemy", 1, "field:0"),
        unit("elsewhere", 1, "field:1"),
      ];
      s.fields[0].controller = 1;
      addGear(s, 190, "cape", "ally");
      s = attack(s);
      if (removed) s.units = s.units.filter((u) => u.id !== "ally");
      else s.units[0].location = "field:1";
      s = chain(s);
      expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(0);
      expect(s.units.find((u) => u.id === "elsewhere")?.damage).toBe(
        removed ? 0 : 2,
      );
    },
  );
  it("Cape includes ability Bonus Damage and does not trigger on uncontested conquest", () => {
    let s = fixture();
    s.units = [
      unit("ally"),
      { ...unit("annie"), cardId: "ogs-001-024" },
      unit("enemy", 1, "field:0"),
    ];
    s.fields[0].controller = 1;
    addGear(s, 190, "cape", "ally");
    s = chain(attack(s));
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(3);
    s = fixture();
    s.units = [unit("ally")];
    addGear(s, 190, "cape", "ally");
    s = conquer(s);
    expect(s.stack).toHaveLength(0);
    expect(s.units[0].damage).toBe(0);
  });
  it.each([190, 192])(
    "Ornn's Equipment %i accepts Power outside its printed domains",
    (n) => {
      let s = fixture();
      s.units = [unit("ally")];
      addGear(s, n);
      s.players[0].power = 0;
      s.players[0].runes = [{ id: "chaos", domain: "Chaos", ready: false }];
      s = act(s, `equip:g${n}:ally`);
      expect(s.players[0].runes).toHaveLength(0);
      s = chain(s);
      expect(s.gears[0].attachedTo).toBe("ally");
    },
  );
  it("Shurelya readies friendly units everywhere on play but respects ready restrictions", () => {
    let s = fixture();
    s.units = [
      unit("ally"),
      unit("field", 0, "field:0"),
      unit("locked"),
      unit("enemy", 1, "base:1"),
    ];
    s.units.forEach((u) => {
      u.ready = false;
    });
    s.units[2].temporaryKeywords = ["Cannot ready"];
    s = play(s, sfd(192));
    expect(s.units.every((u) => !u.ready)).toBe(true);
    s = chain(s);
    expect(s.units.map((u) => u.ready)).toEqual([true, true, false, false]);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it("Shurelya's ready effect obeys enemy Stupefy restrictions", () => {
    let s = fixture();
    s.units = [
      unit("ally"),
      { ...unit("suppressor", 1, "field:0"), cardId: ogn(70) },
    ];
    s.units[0].ready = false;
    s = chain(play(s, sfd(192)));
    expect(s.units[0].ready).toBe(false);
  });
  it("Shurelya grants Ganking only at its wielder's location and transfers the aura on attachment", () => {
    let s = fixture();
    s.units = [
      unit("ally", 0, "field:0"),
      unit("friend", 0, "field:0"),
      unit("away", 0, "field:1"),
      unit("enemy", 1, "field:0"),
    ];
    addGear(s, 192, "crown");
    expect(s.units.every((u) => !getKeywords(s, u).includes("Ganking"))).toBe(
      true,
    );
    s = chain(act(s, "equip:crown:ally"));
    expect(s.units.map((u) => getKeywords(s, u).includes("Ganking"))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(
      getLegalActions(s, 0).some((a) => a.id === "move-start:friend:field:1"),
    ).toBe(true);
    s = chain(act(s, "equip:crown:away"));
    expect(s.units.map((u) => getKeywords(s, u).includes("Ganking"))).toEqual([
      false,
      false,
      true,
      false,
    ]);
    s = effect(s, [{ type: "kill", target: "anyGear" }], "crown");
    expect(getKeywords(s, s.units[2])).not.toContain("Ganking");
  });
  it("Shurelya's aura follows real movement and does not ready units when re-equipped", () => {
    let s = fixture();
    s.units = [
      unit("ally", 0, "field:0"),
      unit("friend", 0, "field:0"),
      unit("away", 0, "field:1"),
    ];
    s.fields[0].controller = s.fields[1].controller = 0;
    addGear(s, 192, "crown", "ally");
    s = chain(act(act(s, "move-start:ally:field:1"), "move-confirm"));
    expect(s.units.map((u) => getKeywords(s, u).includes("Ganking"))).toEqual([
      true,
      false,
      true,
    ]);
    s.units[1].ready = false;
    s = chain(act(s, "equip:crown:friend"));
    expect(s.units[1].ready).toBe(false);
  });
  it("Hunter's Machete grants separate Hunt triggers that stack and earn XP on conquer and hold", () => {
    let s = fixture();
    s.units = [unit("ally")];
    for (const id of ["one", "two"]) {
      s.gears.push({
        id,
        cardId: unl(96),
        owner: 0,
        ready: true,
        attachedTo: "ally",
      });
      s.units[0].gear.push(id);
    }
    expect(getKeywords(s, s.units[0]).filter((k) => k === "Hunt")).toHaveLength(
      2,
    );
    expect(getMight(s, s.units[0])).toBe(12);
    s = conquer(s);
    expect(s.players[0].xp).toBe(2);
    s = nextOwnTurn(s);
    expect(s.players[0].xp).toBe(4);
    expect(s.players[0].points).toBe(2);
  });
  it("Hunt benefits only the equipped conqueror, includes native Hunt, and repeats with Blue Sentinel", () => {
    let s = fixture();
    s.units = [
      unit("ally"),
      { ...unit("hunter", 0, "field:1"), cardId: unl(34) },
    ];
    s.gears = [
      {
        id: "machete",
        cardId: unl(96),
        owner: 0,
        ready: true,
        attachedTo: "hunter",
      },
    ];
    s.units[1].gear = ["machete"];
    s.fields[1].controller = 0;
    s = conquer(s);
    expect(s.players[0].xp ?? 0).toBe(0);
    s.units.push({ ...unit("sentinel", 0, "field:1"), cardId: unl(87) });
    s = nextOwnTurn(s);
    expect(s.players[0].xp).toBe(4);
  });
  it("Shepherd's Heirloom gains XP on play, requires XP to Equip, and pays it before responses", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s = chain(play(s, unl(158)));
    expect(s.players[0].xp).toBe(1);
    s.players[0].energy = s.players[0].power = 0;
    s = act(s, `equip:${s.gears[0].id}:ally`);
    expect(s.players[0].xp).toBe(0);
    expect(s.gears[0].attachedTo).toBeUndefined();
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    s = chain(s);
    expect(getMight(s, s.units[0])).toBe(10);
    expect(getLegalActions(s, 0).some((a) => a.id.startsWith("equip:"))).toBe(
      false,
    );
    s.players[0].xp = 1;
    s = chain(act(s, `equip:${s.gears[0].id}:other`));
    expect(s.players[0].xp).toBe(0);
    expect(getMight(s, s.units[0])).toBe(8);
  });
  it("spent Equip XP is not refunded when the declared target leaves", () => {
    let s = fixture();
    s.units = [unit("ally")];
    heirloom(s);
    s.players[0].xp = 1;
    s = act(s, "equip:heirloom:ally");
    s.units = [];
    s = chain(s);
    expect(s.players[0].xp).toBe(0);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it.each([0, 1])(
    "Weaponmaster preserves Heirloom's non-Power Equip cost with %i XP",
    (xp) => {
      let s = fixture();
      heirloom(s);
      s.players[0].xp = xp;
      s = chain(play(s, sfd(99)));
      expect(s.players[0].xp).toBe(0);
      expect(s.gears[0].attachedTo).toBe(xp ? s.units[0].id : undefined);
    },
  );
});
