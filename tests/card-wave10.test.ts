import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  getLegalActions,
  getMight,
  getKeywords,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { cardRegistry, getScript, getRulesCardId } from "../src/game/scripts";
import { cardWave10Scripts } from "../src/game/card-wave10";
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
    f.cardId = ogn(279);
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
function equip(s: GameState, n: number, target = "ally") {
  addGear(s, n);
  return chain(act(s, `equip:g${n}:${target}`));
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

describe("tenth wave: complete Equipment panels", () => {
  it("Doran's Shield enforces Tank combat assignment before other defenders", () => {
    let s = createCombatFixture();
    addGear(s, 33, "shield", "defender-guard", 1);
    const targets = getLegalActions(s, 0).filter((a) =>
      a.id.startsWith("damage:"),
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every((a) => a.targetId === "defender-guard")).toBe(true);
  });
  it("Recurve Bow does not trigger for an uncontested conquest", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s = equip(s, 16);
    s = conquer(s);
    expect(s.players[0].points).toBe(1);
    expect(s.stack).toHaveLength(0);
    expect(s.pendingChoice).toBeNull();
  });
  it("Recurve Bow revalidates here against the equipped unit's live location", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("enemy", 1, "field:0", 20)];
    s.fields[0].controller = 1;
    addGear(s, 16, "bow", "ally");
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    if (s.pendingChoice) s = act(s, (a) => a.targetId === "enemy");
    s.units.find((u) => u.id === "ally")!.location = "field:1";
    s = chain(s);
    expect(s.units.find((u) => u.id === "enemy")!.damage).toBe(0);
  });
  it("two Cloth Armors add their Shield only while defending an engaged combat", () => {
    const s = fixture();
    s.units = [unit("ally", 0, "field:0")];
    addGear(s, 64, "a", "ally");
    addGear(s, 64, "b", "ally");
    s.combat = { ...createCombatFixture().combat!, attacker: 1, defender: 0 };
    expect(getMight(s, s.units[0])).toBe(12);
    s.combat.engaged = false;
    expect(getMight(s, s.units[0])).toBe(8);
  });

  it.each(Object.keys(cardWave10Scripts))(
    "registers %s with its full attachment panel",
    (id) => {
      expect(getScript(id)?.equipment?.text).toBeTruthy();
      expect(cardRegistry[id].status).toBe("scripted");
    },
  );
  it("includes the remaining panels and resolves full-fingerprint alternate printings", () => {
    for (const n of [59, 90])
      expect(getScript(sfd(n))?.equipment?.text).toBeTruthy();
    const aliases = cards.filter(
      (c) => c.id !== sfd(33) && getRulesCardId(c.id) === sfd(33),
    );
    expect(aliases.length).toBeGreaterThan(0);
    for (const c of aliases)
      expect(getScript(c.id)).toEqual(getScript(sfd(33)));
  });
  it("Doran's Shield grants Tank only while attached and transfers it on re-equip", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s = equip(s, 33);
    expect(getMight(s, s.units[0])).toBe(9);
    expect(getKeywords(s, s.units[0])).toContain("Tank");
    s = chain(act(s, "equip:g33:other"));
    expect(getKeywords(s, s.units[0])).not.toContain("Tank");
    expect(getMight(s, s.units[0])).toBe(8);
    expect(getKeywords(s, s.units[1])).toContain("Tank");
    s = effect(s, [{ type: "kill", target: "anyGear" }], "g33");
    expect(getKeywords(s, s.units[1])).not.toContain("Tank");
  });
  it("Brutalizer remembers attachments across saves, expires, and renews on Weaponmaster", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s = equip(s, 42);
    expect(getMight(s, s.units[0])).toBe(11);
    expect(s.gears[0].attachedTurn).toBe(s.turn);
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    expect(getMight(s, s.units[0])).toBe(11);
    s = nextOwnTurn(s);
    expect(getMight(s, s.units[0])).toBe((getCard(ogn(49)).might ?? 0) + 1);
    s.players[0].energy = s.players[0].power = 30;
    s = chain(play(s, sfd(99)));
    const wielder = s.units.find((u) => u.cardId === sfd(99))!;
    expect(s.gears[0].attachedTo).toBe(wielder.id);
    expect(getMight(s, wielder)).toBe((getCard(sfd(99)).might ?? 0) + 3);
    expect(getMight(s, s.units[0])).toBe(getCard(ogn(49)).might);
    const broken = structuredClone(s);
    broken.gears[0].attachedTurn = -1;
    expect(validState(broken)).toBe(false);
  });
  it("Brutalizer loses all bonuses while detached and does not stack repeated attachments", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s = equip(s, 42);
    s = chain(act(s, "equip:g42:other"));
    s = chain(act(s, "equip:g42:ally"));
    expect(getMight(s, s.units[0])).toBe(11);
    s = effect(s, [{ type: "bounce", target: "friendlyUnit" }], "ally");
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(getMight(s, s.units[0])).toBe(8);
  });
  it("Cloth Armor uses Reaction timing, declares attachment before responses, and gives defensive Shield", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0"), unit("enemy", 1, "field:0")];
    s.currentPlayer = 1;
    s.priorityPlayer = 0;
    s.stack.push({
      id: "enemy-effect",
      kind: "ability",
      cardId: ogn(4),
      player: 1,
      effects: [],
    });
    s = play(s, sfd(64));
    if (s.pendingChoice) s = act(s, (a) => a.targetId === "ally");
    expect(s.stack.at(-1)?.targetId).toBe("ally");
    expect(s.gears[0].attachedTo).toBeUndefined();
    s = chain(s);
    expect(s.gears[0].attachedTo).toBe("ally");
    expect(getKeywords(s, s.units[0])).toContain("Shield 2");
    s.combat = { ...createCombatFixture().combat!, attacker: 1, defender: 0 };
    expect(getMight(s, s.units[0])).toBe(10);
    s.combat.attacker = 0;
    s.combat.defender = 1;
    expect(getMight(s, s.units[0])).toBe(8);
  });
  it("Quick-Draw does not choose a replacement if its declared unit leaves", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s = play(s, sfd(64));
    if (s.pendingChoice) s = act(s, (a) => a.targetId === "ally");
    s.units = s.units.filter((u) => u.id !== "ally");
    s = chain(s);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it.each([
    [sfd(85), 3],
    [ogn(13), 2],
  ] as const)("Hexdrinker adds to inherent Deflect on %s", (cardId, tax) => {
    let s = fixture();
    s.units = [{ ...unit("enemy", 1, "field:0"), cardId }];
    addGear(s, 102, "hexdrinker", "enemy", 1);
    s.players[0].hand = [ogn(5)];
    s.players[0].power = tax - 1;
    expect(getLegalActions(s, 0).some((a) => a.cardId === ogn(5))).toBe(false);
    s.players[0].power = tax;
    s = act(s, (a) => a.cardId === ogn(5) && a.category === "play");
    expect(s.players[0].power).toBe(0);
  });
  it("Hexdrinkers stack Deflect taxes on enemy effects and disappear on detachment", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0")];
    addGear(s, 102, "a", "enemy", 1);
    addGear(s, 102, "b", "enemy", 1);
    s.players[0].hand = [ogn(5)];
    s.players[0].power = 1;
    expect(getLegalActions(s, 0).some((a) => a.cardId === ogn(5))).toBe(false);
    s.players[0].power = 2;
    s = act(s, (a) => a.cardId === ogn(5) && a.category === "play");
    expect(s.players[0].power).toBe(0);
    s = chain(s);
    expect(s.units[0].damage).toBe(3);
  });
  it("Boots grant battlefield-to-battlefield movement and stop granting it when destroyed", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0")];
    s.fields[0].controller = 0;
    expect(
      getLegalActions(s, 0).some((a) => a.id === "move-start:ally:field:1"),
    ).toBe(false);
    s = equip(s, 133);
    expect(
      getLegalActions(s, 0).some((a) => a.id === "move-start:ally:field:1"),
    ).toBe(true);
    s = effect(s, [{ type: "kill", target: "anyGear" }], "g133");
    expect(
      getLegalActions(s, 0).some((a) => a.id === "move-start:ally:field:1"),
    ).toBe(false);
  });
  it.each([0, 1] as const)(
    "Recurve Bow triggers once on %s's attack/defense and persists after gear removal",
    (defender) => {
      let s = fixture();
      s.units = [unit("ally"), unit("enemy", 1, "field:0", 20)];
      s.fields[0].controller = 1;
      addGear(s, 16, "bow", defender ? "enemy" : "ally", defender);
      s = act(act(s, "move-start:ally:field:0"), "move-confirm");
      expect(s.stack.length + (s.pendingChoice ? 1 : 0)).toBeGreaterThan(0);
      const target = defender ? "ally" : "enemy";
      if (s.pendingChoice) s = act(s, (a) => a.targetId === target);
      expect(
        s.stack.some((item) => item.sourceId === (defender ? "enemy" : "ally")),
      ).toBe(true);
      s.gears = [];
      s.units.forEach((u) => {
        u.gear = [];
      });
      s = chain(s);
      expect(s.units.find((u) => u.id === target)?.damage).toBe(2);
      expect(s.pendingTriggers).toHaveLength(0);
    },
  );
  it("two Bows create independent abilities and pay Deflect before each response window", () => {
    let s = fixture();
    s.units = [
      unit("ally"),
      { ...unit("enemy", 1, "field:0", 20), temporaryKeywords: ["Deflect"] },
    ];
    s.fields[0].controller = 1;
    addGear(s, 16, "bow1", "ally");
    addGear(s, 16, "bow2", "ally");
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = chain(s);
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(4);
    expect(s.players[0].power).toBe(28);
  });
  it("Boneshiver pays Energy and domain Power before attachment, then channels on conquest", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "body", domain: "Body", ready: false }];
    addGear(s, 118);
    s = act(s, "equip:g118:ally");
    expect(s.players[0].energy).toBe(29);
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.gears[0].attachedTo).toBeUndefined();
    s = chain(s);
    s = conquer(s);
    expect(s.players[0].runes).toHaveLength(1);
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("Boneshiver cannot use a rune in the wrong domain", () => {
    let s = fixture();
    s.units = [unit("ally")];
    addGear(s, 118);
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "mind", domain: "Mind", ready: true }];
    expect(getLegalActions(s, 0).some((a) => a.id.startsWith("equip:"))).toBe(
      false,
    );
  });
  it("Cull creates exhausted Gold for the equipped conqueror only", () => {
    let s = fixture();
    s.units = [unit("ally"), unit("other")];
    s = equip(s, 134, "other");
    s = conquer(s);
    expect(s.gears.filter((g) => g.token)).toHaveLength(0);
    s = fixture();
    s.units = [unit("ally")];
    s = equip(s, 134);
    s = conquer(s);
    expect(s.gears.filter((g) => g.token)).toHaveLength(1);
    expect(s.gears.find((g) => g.token)?.ready).toBe(false);
  });
  it("Doran's Ring preserves its discard choice through save/load before drawing", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s = equip(s, 124);
    s.players[0].hand = [ogn(49), ogn(52)];
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = act(act(s, "pass"), "pass");
    if (!s.pendingChoice) s = act(act(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("discard");
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    s = chain(s);
    expect(s.players[0].discard).toHaveLength(1);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("Doran's Ring still draws when the hand is empty", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s = equip(s, 124);
    s = conquer(s);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("World Atlas and Trinity Force inherit hold effects without repeating ordinary scoring", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0")];
    s.fields[0].controller = 0;
    s = equip(s, 86);
    s = equip(s, 115);
    s = nextOwnTurn(s);
    expect(s.players[0].points).toBe(2);
    expect(s.gears.filter((g) => g.token)).toHaveLength(2);
    expect(s.gears.filter((g) => g.token).every((g) => !g.ready)).toBe(true);
  });
  it("Blue Sentinel repeats each inherited hold ability as its own trigger", () => {
    let s = fixture();
    s.units = [
      unit("ally", 0, "field:0"),
      { ...unit("sentinel", 0, "field:0"), cardId: "unl-087-219" },
    ];
    s.fields[0].controller = 0;
    s = equip(s, 86);
    s = equip(s, 115);
    s = nextOwnTurn(s);
    expect(s.players[0].points).toBe(3);
    expect(s.gears.filter((g) => g.token)).toHaveLength(4);
  });
  it("Rockfall Path hold conversion includes equipped conquer abilities", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0")];
    s.fields[0].controller = 0;
    s.fields[0].cardId = ogn(286);
    s = equip(s, 134);
    s = nextOwnTurn(s);
    expect(s.gears.filter((g) => g.token)).toHaveLength(1);
  });
  it.each([false, true])(
    "Eye of the Herald rechecks its moving source on resolution; removed=%s",
    (removed) => {
      let s = fixture();
      s.units = [unit("ally")];
      s = equip(s, 153);
      s = act(act(s, "move-start:ally:field:0"), "move-confirm");
      expect(s.stack.some((item) => item.sourceId === "ally")).toBe(true);
      if (removed) s.units = [];
      else s.units[0].location = "field:1";
      s = chain(s);
      const tokens = s.units.filter((u) => u.token);
      expect(tokens).toHaveLength(removed ? 0 : 1);
      if (!removed) expect(tokens[0].location).toBe("field:1");
    },
  );
  it("Eye of the Herald creates Recruit at the mover's location and works on enemy-forced moves", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s = equip(s, 153);
    s = conquer(s);
    expect(
      s.units.filter((u) => u.token && u.location === "field:0"),
    ).toHaveLength(1);
    s = effect(
      s,
      [
        {
          type: "moveTarget",
          target: "anyUnit",
          location: "base",
        },
      ],
      "ally",
      1,
    );
    expect(
      s.units.filter((u) => u.token && u.location === "base:0"),
    ).toHaveLength(1);
  });
  it("Spinning Axe survives attached beginnings, then dies unattached before scoring", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0")];
    s.fields[0].controller = 0;
    s = chain(play(s, sfd(186)));
    expect(s.gears[0].attachedTo).toBe("ally");
    expect(getMight(s, s.units[0])).toBe(11);
    s = nextOwnTurn(s);
    expect(s.gears).toHaveLength(1);
    s = effect(s, [{ type: "bounce", target: "friendlyUnit" }], "ally");
    s = nextOwnTurn(s);
    expect(s.gears).toHaveLength(0);
    expect(s.players[0].discard).toContain(sfd(186));
  });
  it("Spinning Axe can equip using Power of any domain", () => {
    let s = fixture();
    s.units = [unit("ally")];
    addGear(s, 186);
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "mind", domain: "Mind", ready: false }];
    s = act(s, "equip:g186:ally");
    expect(s.players[0].runes).toHaveLength(0);
    s = chain(s);
    expect(s.gears[0].attachedTo).toBe("ally");
  });
});
