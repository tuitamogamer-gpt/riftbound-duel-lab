import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  createGame,
  applyAction,
  getLegalActions,
  getKeywords,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { cardWave9Scripts } from "../src/game/card-wave9";
import { getScript } from "../src/game/scripts";
import { validState } from "../src/persistence";
import { unitStatuses } from "../src/game/status-presentation";
import { starterDecks } from "../src/data/decks";
import { getReferenceAction } from "../src/game/bot-reference";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
function fixture() {
  const s = createGame({ seed: 9121 });
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
    p.legendId = ogn(259);
    p.hand = [];
    p.deck = Array(30).fill(ogn(49));
    p.discard = [];
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.cardsPlayedThisTurn = 0;
    p.legendUsedTurn = -1;
    p.hasBegun = p.mulliganDone = true;
    p.championAvailable = false;
    p.points = 0;
  }
  for (const f of s.fields) {
    f.cardId = ogn(279);
    f.controller = null;
  }
  return s;
}
function unit(
  id: string,
  cardId = ogn(52),
  owner: PlayerId = 0,
  location: Unit["location"] = "base:0",
  might = 5,
): Unit {
  return {
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
    baseMightOverride: might,
  };
}
function act(s: GameState, predicate: string | ((a: GameAction) => boolean)) {
  const a = getLegalActions(s, s.priorityPlayer).find(
    typeof predicate === "string" ? (a) => a.id === predicate : predicate,
  );
  expect(
    a,
    getLegalActions(s, s.priorityPlayer)
      .map((a) => a.id)
      .join("\n"),
  ).toBeDefined();
  return applyAction(s, a!);
}
function settle(s: GameState) {
  for (
    let i = 0;
    i < 200 &&
    (s.stack.length ||
      s.pendingChoice ||
      s.pendingTriggers?.length ||
      s.combat);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const a = s.pendingChoice
      ? (actions.find((a) => a.id.endsWith(":done")) ?? actions[0])
      : (actions.find((a) => a.category === "pass") ??
        actions.find((a) => a.id.startsWith("damage:")) ??
        actions.find((a) => a.id === "damage-done"));
    expect(a).toBeDefined();
    s = applyAction(s, a!);
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function play(s: GameState, cardId: string, targetId?: string) {
  s.players[0].hand.push(cardId);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (targetId === undefined || a.targetId === targetId) &&
      !a.id.includes("accelerate") &&
      !a.repeated,
  );
}
function queue(
  s: GameState,
  effects: Effect[],
  targetId?: string,
  p: PlayerId = 0,
) {
  s.stack.push({
    id: `test-${s.nextId++}`,
    player: p,
    cardId: ogn(4),
    kind: "ability",
    effects,
    targetId,
  });
  return s;
}
function one(s: GameState) {
  return act(act(s, "pass"), "pass");
}
function gear(s: GameState, id: string, cardId: string) {
  s.gears.push({ id, cardId, owner: 0, ready: true });
}
function conquer(s: GameState, id: string, field = "field:0") {
  return settle(act(act(s, `move-start:${id}:${field}`), "move-confirm"));
}

describe("ninth card wave", () => {
  it.each(Object.keys(cardWave9Scripts))(
    "registers the complete face %s",
    (id) => expect(getScript(id)?.implemented).toBe(true),
  );
  it("Tome stacks its bonus on the next spell and applies to every damage instance", () => {
    let s = fixture();
    gear(s, "tome-a", ogn(32));
    gear(s, "tome-b", ogn(32));
    s.units = [unit("enemy", ogn(52), 1, "field:0", 20)];
    s = settle(act(s, (a) => a.sourceId === "tome-a"));
    s = settle(act(s, (a) => a.sourceId === "tome-b"));
    s.players[0].hand = [sfd(80)];
    s = act(
      s,
      (a) =>
        a.cardId === sfd(80) &&
        Boolean(a.repeated) &&
        a.targetId === "enemy" &&
        a.repeatedTargetId === "enemy",
    );
    expect(s.stack.at(-1)?.spellBonusDamage).toBe(2);
    expect(s.players[0].nextSpellBonus).toBe(0);
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    s = settle(s);
    expect(s.units[0].damage).toBe(6);
    s = settle(play(s, ogn(5), "enemy"));
    expect(s.units[0].damage).toBe(9);
  });
  it("Tome is consumed by a nondamaging spell and unused bonuses expire", () => {
    let s = fixture();
    gear(s, "tome", ogn(32));
    s = settle(act(s, (a) => a.sourceId === "tome"));
    s.units = [unit("ally")];
    s = settle(play(s, ogn(4), "ally"));
    expect(s.players[0].nextSpellBonus).toBe(0);
    s.gears[0].ready = true;
    s = settle(act(s, (a) => a.sourceId === "tome"));
    s = settle(act(s, "end-turn"));
    expect(s.players[0].nextSpellBonus).toBe(0);
  });
  it("Imperial Decree makes separate delayed triggers after actual damage", () => {
    let s = fixture();
    s.units = [
      unit("a", ogn(52), 0, "field:0", 10),
      unit("b", ogn(49), 1, "field:0", 10),
    ];
    s = settle(play(s, ogn(221)));
    s = one(
      queue(
        s,
        [{ type: "damageAll", amount: 1, target: "battlefield", who: "all" }],
        "field:0",
      ),
    );
    expect(s.units).toHaveLength(2);
    expect(s.stack).toHaveLength(2);
    s = settle(s);
    expect(s.units).toHaveLength(0);
  });
  it("prevented and zero damage never start delayed kill triggers", () => {
    let s = fixture();
    s.units = [{ ...unit("target"), preventDamage: 2 }];
    s = settle(play(s, ogn(221)));
    s = one(
      queue(s, [{ type: "damage", amount: 2, target: "anyUnit" }], "target"),
    );
    expect(s.stack).toHaveLength(0);
    s = one(
      queue(s, [{ type: "damage", amount: 0, target: "anyUnit" }], "target"),
    );
    expect(s.stack).toHaveLength(0);
    expect(s.units).toHaveLength(1);
  });
  it("Guillotine pays Deflect once and its first-damage watcher does not retarget", () => {
    let s = fixture();
    s.units = [
      {
        ...unit("target", ogn(236), 1, "field:0", 10),
        temporaryKeywords: ["Deflect 2"],
      },
    ];
    s = settle(play(s, ogn(254), "target"));
    expect(s.players[0].power).toBe(27);
    s.players[0].power = 0;
    s = one(
      queue(s, [{ type: "damage", amount: 1, target: "anyUnit" }], "target"),
    );
    expect(s.stack).toHaveLength(1);
    expect(s.damageTriggers).toHaveLength(0);
    s.units[0].untargetableByEnemy = true;
    s = settle(s);
    expect(s.units).toHaveLength(0);
  });
  it("a delayed kill cannot kill a replacement copy and expires at end of turn", () => {
    let s = fixture();
    s.units = [unit("old", ogn(52), 1, "field:0")];
    s = settle(play(s, ogn(254), "old"));
    s = one(
      queue(s, [{ type: "damage", amount: 1, target: "anyUnit" }], "old"),
    );
    s.units = [unit("new", ogn(52), 1, "field:0")];
    s = settle(s);
    expect(s.units[0].id).toBe("new");
    s = settle(play(s, ogn(221)));
    s = settle(act(s, "end-turn"));
    expect(s.damageTriggers).toHaveLength(0);
  });
  it("Legion makes Guillotine kill immediately without installing a watcher", () => {
    let s = fixture();
    s.units = [unit("target", ogn(52), 1, "field:0")];
    s.players[0].cardsPlayedThisTurn = 1;
    s = settle(play(s, ogn(254), "target"));
    expect(s.units).toHaveLength(0);
    expect(s.damageTriggers ?? []).toHaveLength(0);
  });
  it("Ornn generates gear-only Power immediately in a reaction window", () => {
    let s = fixture();
    s.players[0].legendId = sfd(189);
    s.players[0].power = 0;
    s = queue(s, [{ type: "draw", amount: 1 }], undefined, 1);
    s = act(s, (a) => a.sourceId === "legend");
    expect(s.stack).toHaveLength(1);
    expect(s.players[0].gearPower).toBe(1);
    expect(s.players[0].power).toBe(0);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
  });
  it("Ornn Power pays colored gear costs but cannot pay unit or spell costs", () => {
    let s = fixture();
    s.players[0].legendId = sfd(189);
    s.players[0].power = 0;
    s = act(s, (a) => a.sourceId === "legend");
    const equipment = cards.find(
      (c) =>
        c.type === "Gear" && c.power === 1 && getScript(c.id) && !c.variant,
    )!;
    s.players[0].hand = [equipment.id, ogn(110), ogn(254)];
    s.units = [unit("enemy", ogn(52), 1, "field:0")];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.cardId === ogn(110),
      ),
    ).toBe(false);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.cardId === ogn(254),
      ),
    ).toBe(false);
    s = act(s, (a) => a.category === "play" && a.cardId === equipment.id);
    expect(s.players[0].gearPower).toBe(0);
  });
  it("gear Power and Forge discount support extension abilities without mutating queries", () => {
    let s = fixture();
    s.players[0].energy = s.players[0].power = 0;
    s.players[0].gearPower = 1;
    s.fields[0].cardId = ven(161);
    s.fields[0].controller = 0;
    gear(s, "snax", sfd(46));
    const before = serializeGame(s);
    expect(getLegalActions(s, 0).some((a) => a.id === "wave3:snax:snax")).toBe(
      true,
    );
    expect(serializeGame(s)).toBe(before);
    s = settle(act(s, "wave3:snax:snax"));
    expect(s.players[0].gearPower).toBe(0);
    expect(s.players[0].energy).toBe(0);
    expect(s.players[0].firstGearAbilityTurn).toBe(s.turn);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Forge discounts Equip once, with gear-only Power covering its cost", () => {
    let s = fixture();
    s.fields[0].cardId = ven(161);
    s.fields[0].controller = 0;
    s.players[0].energy = s.players[0].power = 0;
    s.players[0].gearPower = 1;
    s.units = [unit("ally", ogn(52), 0, "base:0", 2)];
    gear(s, "weapon", unl(188));
    s = settle(act(s, "equip:weapon:ally"));
    expect(s.gears[0].attachedTo).toBe("ally");
    expect(s.players[0].gearPower).toBe(0);
    s.units.push(unit("other", ogn(52), 0, "base:0", 2));
    s.players[0].gearPower = 1;
    expect(
      getLegalActions(s, 0).some((a) => a.id === "equip:weapon:other"),
    ).toBe(false);
  });
  it("a zero-Energy gear activation uses the first-ability slot before Forge is acquired", () => {
    let s = fixture();
    gear(s, "tome", ogn(32));
    gear(s, "snax", sfd(46));
    s = settle(act(s, (a) => a.sourceId === "tome"));
    s.fields[0].cardId = ven(161);
    s.fields[0].controller = 0;
    s.players[0].energy = 0;
    expect(getLegalActions(s, 0).some((a) => a.id === "wave3:snax:snax")).toBe(
      false,
    );
  });
  it("Azir only activates after Equipment and gives the new Sand Soldier Weaponmaster", () => {
    let s = fixture();
    s.players[0].legendId = sfd(197);
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "legend")).toBe(
      false,
    );
    const equipment = cards.find(
      (c) =>
        c.type === "Gear" &&
        c.tags.includes("Equipment") &&
        getScript(c.id)?.equipCost === 1 &&
        !c.variant,
    )!;
    s = settle(play(s, equipment.id));
    s = one(act(s, (a) => a.sourceId === "legend"));
    const sand = s.units.find(
      (u) => getCard(u.cardId).name === "Sand Soldier",
    )!;
    expect(sand.location).toBe("base:0");
    expect(getKeywords(s, sand)).toContain("Weaponmaster");
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = act(
      s,
      (a) =>
        a.id.startsWith("choose-trigger:") && a.id !== "choose-trigger:skip",
    );
    s = settle(s);
    expect(s.gears[0].attachedTo).toBe(sand.id);
  });
  it("ordinary gear does not unlock Azir and equipment permission expires", () => {
    let s = fixture();
    s.players[0].legendId = sfd(197);
    s = settle(play(s, ogn(32)));
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "legend")).toBe(
      false,
    );
    s.players[0].equipmentPlayedTurn = s.turn - 1;
    expect(getLegalActions(s, 0).some((a) => a.sourceId === "legend")).toBe(
      false,
    );
  });
  it("Brambleback duplicates each conquer trigger, not the conquer point", () => {
    let s = fixture();
    s.units = [unit("red", unl(29)), unit("friend", ogn(49), 0, "field:0")];
    s = conquer(s, "red");
    expect(s.players[0].points).toBe(1);
    expect(
      s.log.filter((x) =>
        x.text.includes("Red Brambleback: triggered ability"),
      ),
    ).toHaveLength(2);
  });
  it("two Bramblebacks add two trigger occurrences instead of multiplying recursively", () => {
    let s = fixture();
    s.units = [unit("red-a", unl(29)), unit("red-b", unl(29), 0, "field:0")];
    s = conquer(s, "red-a");
    expect(s.players[0].points).toBe(1);
    expect(
      s.log.filter((x) =>
        x.text.includes("Red Brambleback: triggered ability"),
      ),
    ).toHaveLength(6);
  });
  it("Sentinel repeats battlefield holding and preserves delayed Power through the Main reset", () => {
    let s = fixture();
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.units = [unit("blue", unl(87), 0, "field:0")];
    s.fields[0].controller = 0;
    s.fields[0].cardId = ogn(280);
    s = settle(act(s, "end-turn"));
    expect(s.currentPlayer).toBe(0);
    expect(s.turnStep).toBe("main");
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.players[0].power).toBe(2);
    expect(s.players[0].nextMainPower).toBe(0);
  });
  it("two Sentinels produce six Power and do not multiply base points", () => {
    let s = fixture();
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.units = [
      unit("a", unl(87), 0, "field:0"),
      unit("b", unl(87), 0, "field:0"),
    ];
    s.fields[0].controller = 0;
    s = settle(act(s, "end-turn"));
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].power).toBe(6);
  });
  it("Otterpus replaces early conquest with a draw while conquer triggers still happen", () => {
    let s = fixture();
    s.turn = 1;
    s.units = [unit("otter", ven(53), 1, "base:1"), unit("red", unl(29))];
    s = conquer(s, "red");
    expect(s.players[0].points).toBe(0);
    expect(s.players[0].hand).toHaveLength(1);
    expect(
      s.log.filter((x) =>
        x.text.includes("Red Brambleback: triggered ability"),
      ),
    ).toHaveLength(2);
  });
  it("Otterpus stops replacing on the player's third turn and never replaces effect points", () => {
    let s = fixture();
    s.turn = 5;
    s.units = [unit("otter", ven(53), 1, "base:1"), unit("ally")];
    s = conquer(s, "ally");
    expect(s.players[0].points).toBe(1);
    s.turn = 1;
    s = settle(queue(s, [{ type: "score" }]));
    expect(s.players[0].points).toBe(2);
  });
  it("Astral Heron only discounts the next card after its first-play trigger resolves", () => {
    let s = fixture();
    s.units = [unit("heron", ven(44), 0, "field:0")];
    s = play(s, ogn(4), "heron");
    expect(s.players[0].nextCardEnergyDiscount ?? 0).toBe(0);
    s = one(s);
    expect(s.players[0].nextCardEnergyDiscount ?? 0).toBe(0);
    s = settle(s);
    expect(s.players[0].nextCardEnergyDiscount).toBe(2);
    expect(s.players[0].nextCardPowerDiscount).toBe(2);
    const energy = s.players[0].energy,
      power = s.players[0].power;
    s = play(s, ogn(254), "heron");
    expect(s.players[0].energy).toBe(energy - 2);
    expect(s.players[0].power).toBe(power);
    expect(s.players[0].nextCardEnergyDiscount).toBe(0);
  });
  it("Heron at base cannot trigger and a discount does not carry over to a later turn", () => {
    let s = fixture();
    s.units = [unit("heron", ven(44))];
    s = settle(play(s, ogn(4), "heron"));
    expect(s.players[0].nextCardEnergyDiscount ?? 0).toBe(0);
    s.players[0].nextCardEnergyDiscount = 2;
    s.players[0].nextCardPowerDiscount = 2;
    s = settle(act(s, "end-turn"));
    expect(s.players[0].nextCardEnergyDiscount).toBe(0);
  });
  it("Feline names a spell through a resumable choice and only bars the opponent at a battlefield", () => {
    let s = fixture();
    s = play(s, ven(132));
    s = one(s);
    expect(s.pendingChoice?.kind).toBe("custom");
    expect(validState(s)).toBe(true);
    s = deserializeGame(serializeGame(s));
    s = act(s, `choose-custom:wave9-name:${ogn(4)}`);
    const feline = s.units.find((u) => u.cardId === ven(132))!;
    expect(feline.namedSpell).toBe("cleave");
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.players[1].hand = [ogn(4)];
    s.units.push(unit("opponent", ogn(52), 1, "base:1"));
    expect(getLegalActions(s, 1).some((a) => a.category === "play")).toBe(true);
    feline.location = "field:0";
    expect(getLegalActions(s, 1).some((a) => a.category === "play")).toBe(
      false,
    );
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
    s.players[0].hand = [ogn(4)];
    expect(getLegalActions(s, 0).some((a) => a.category === "play")).toBe(true);
  });
  it("Feline cannot stop an already finalized spell and losing Feline restores permission", () => {
    let s = fixture();
    s.units = [unit("cat", ven(132), 1, "field:0"), unit("ally")];
    s = play(s, ogn(4), "ally");
    s.units[0].namedSpell = "cleave";
    s = settle(s);
    expect(s.units[1].temporaryAssault).toBe(3);
    s.units.shift();
    s.players[0].hand = [ogn(4)];
    expect(getLegalActions(s, 0).some((a) => a.category === "play")).toBe(true);
  });
  it("Feline names are unique across alternate printings and legal-action queries are read-only", () => {
    let s = one(play(fixture(), ven(132)));
    const before = serializeGame(s);
    const a = getLegalActions(s, 0);
    expect(new Set(a.map((x) => x.label.toLowerCase())).size).toBe(a.length);
    expect(a.length).toBeGreaterThan(100);
    expect(serializeGame(s)).toBe(before);
  });
  it("Affectionate Poro draws after an undamaged combat, including prevented damage", () => {
    let s = fixture();
    s.units = [
      { ...unit("poro", ven(24), 0, "base:0", 8), preventDamage: 1 },
      unit("enemy", ogn(49), 1, "field:0", 1),
    ];
    s.fields[0].controller = 1;
    s = conquer(s, "poro");
    expect(s.units.find((u) => u.id === "poro")).toBeDefined();
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("damage earlier in the turn disqualifies Poro even after healing", () => {
    let s = fixture();
    s.units = [unit("poro", ven(24), 0, "base:0", 8)];
    s = settle(
      queue(
        s,
        [
          { type: "damage", amount: 1, target: "anyUnit" },
          { type: "heal", amount: 1, target: "anyUnit" },
        ],
        "poro",
      ),
    );
    expect(s.units[0].damage).toBe(0);
    s.units[0].preventDamage = 1;
    s.units.push(unit("enemy", ogn(49), 1, "field:0", 1));
    s.fields[0].controller = 1;
    s = conquer(s, "poro");
    expect(s.players[0].hand).toHaveLength(0);
  });
  it("an uncontested showdown is not a combat for Affectionate Poro", () => {
    let s = fixture();
    s.units = [unit("poro", ven(24))];
    s = conquer(s, "poro");
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].hand).toHaveLength(0);
  });
  it("a Brambleback at another battlefield cannot repeat conquer effects", () => {
    let s = fixture();
    s.units = [unit("red", unl(29), 0, "field:1"), unit("conqueror", ogn(10))];
    s = conquer(s, "conqueror");
    expect(s.players[0].points).toBe(1);
    expect(
      s.log.filter((x) =>
        x.text.includes("Red Brambleback: triggered ability"),
      ),
    ).toHaveLength(0);
  });
  it("Sentinel repeats a Legend hold trigger but cannot pay its exhaustion twice", () => {
    let s = fixture();
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.players[0].legendId = sfd(201);
    s.fields[0].controller = 0;
    s.units = [unit("blue", unl(87), 0, "field:0")];
    s = settle(act(s, "end-turn"));
    expect(s.gears.filter((g) => g.cardId === "sfd-t03")).toHaveLength(1);
    expect(s.players[0].power).toBe(2);
  });
  it("Tome is consumed by Last Breath without changing the unit's damage", () => {
    let s = fixture();
    gear(s, "tome", ogn(32));
    s.units = [
      unit("a", ogn(52), 0, "field:0", 3),
      unit("b", ogn(49), 1, "field:0", 10),
    ];
    s = settle(act(s, (a) => a.sourceId === "tome"));
    const spell = cards.find((c) => c.name === "Last Breath" && !c.variant)!;
    s = settle(play(s, spell.id, "a~b"));
    expect(s.players[0].nextSpellBonus).toBe(0);
    expect(s.units.find((u) => u.id === "b")?.damage).toBe(3);
  });
  it("Feline exposes the chosen spell as public card status", () => {
    const s = fixture(),
      feline = { ...unit("cat", ven(132)), namedSpell: "cleave" };
    expect(
      unitStatuses(s, feline).find((x) => x.id === "named-spell")?.values,
    ).toEqual({ card: "Cleave" });
  });
  it("rejects malformed persisted delayed damage and restricted-resource data", () => {
    const s = fixture();
    s.damageTriggers = [{ player: 0, cardId: ogn(221), turn: s.turn }];
    s.players[0].gearPower = 1;
    expect(validState(deserializeGame(serializeGame(s)))).toBe(true);
    s.players[0].gearPower = -1;
    expect(validState(s)).toBe(false);
    s.players[0].gearPower = 1;
    s.damageTriggers[0].turn = -1;
    expect(validState(s)).toBe(false);
  });
  it.each([921, 937])(
    "finishes a mixed wave-nine game with conservation, seed %s",
    (seed) => {
      const template = starterDecks[0];
      const deck = {
        ...template,
        id: `wave9-${seed}`,
        legendId: sfd(189),
        championId: unl(29),
        main: [
          { cardId: ogn(32), count: 3 },
          { cardId: ogn(221), count: 3 },
          { cardId: ogn(254), count: 3 },
          { cardId: unl(29), count: 3 },
          { cardId: unl(87), count: 3 },
          { cardId: ven(24), count: 3 },
          { cardId: ven(44), count: 3 },
          { cardId: ven(53), count: 3 },
          { cardId: ven(132), count: 3 },
          { cardId: ogn(52), count: 3 },
          { cardId: ogn(49), count: 3 },
          { cardId: ogn(1), count: 3 },
          { cardId: ogn(4), count: 3 },
        ],
      };
      let s = createGame({ seed, playerDeck: deck, botDeck: deck });
      for (let i = 0; i < 2000 && s.winner === null; i++) {
        const before = serializeGame(s);
        const a = getReferenceAction(s, s.priorityPlayer);
        expect(a).toBeDefined();
        expect(serializeGame(s)).toBe(before);
        s = applyAction(s, a!);
        if (s.pendingChoice) {
          expect(validState(s)).toBe(true);
          s = deserializeGame(serializeGame(s));
        }
        for (const p of s.players) {
          const count =
            p.hand.length +
            p.deck.length +
            p.discard.length +
            p.banished.length +
            Number(p.championAvailable) +
            s.units.filter((u) => u.owner === p.id && !u.token).length +
            s.gears.filter((g) => g.owner === p.id && !g.token).length +
            s.stack.filter((x) => x.player === p.id && x.kind === "spell")
              .length +
            (s.resolving ?? []).filter((x) => x.player === p.id).length +
            (s.hidden ?? []).filter((x) => x.owner === p.id).length;
          expect(count).toBe(40);
          expect(p.runes.length + p.runeDeck.length).toBe(12);
          expect(p.energy).toBeGreaterThanOrEqual(0);
          expect(p.gearPower ?? 0).toBeGreaterThanOrEqual(0);
        }
      }
      expect(s.winner).not.toBeNull();
    },
  );
});
