import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  getLegalActions,
  getMight,
  getKeywords,
  getGameView,
  type GameState,
  type GameAction,
  type Unit,
  type PlayerId,
  type LocationId,
} from "../src/game/engine";
import { getCard } from "../src/data/cards";
import { officialPreconDecks } from "../src/data/decks";
import { getBotAction } from "../src/game/bot";
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const ogs = (n: number) => `ogs-${String(n).padStart(3, "0")}-024`;
function position(): GameState {
  const s = createGame({ seed: 23 });
  s.phase = "main";
  s.turn = 5;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.focusPlayer = 0;
  s.stack = [];
  s.units = [];
  s.gears = [];
  s.hidden = [];
  s.pendingChoice = null;
  s.combat = null;
  for (const p of s.players) {
    p.hand = [];
    p.discard = [];
    p.energy = 30;
    p.points = 0;
    p.championAvailable = false;
    p.legendId = ogs(19);
    p.hasBegun = true;
    p.runes = [
      "Fury",
      "Calm",
      "Body",
      "Mind",
      "Order",
      "Chaos",
      "Fury",
      "Body",
      "Mind",
      "Order",
      "Calm",
      "Chaos",
    ].map((domain, i) => ({ id: `r${p.id}-${i}`, domain, ready: true }));
    p.deck = Array(30).fill(ogn(142));
    p.runeDeck = [];
  }
  s.fields.forEach((f) => {
    f.cardId = ogn(294);
    f.controller = null;
  });
  return s;
}
function unit(
  s: GameState,
  id: string,
  cardId: string,
  owner: PlayerId = 0,
  location: LocationId = "base:0",
  ready = true,
) {
  const u: Unit = {
    id,
    cardId,
    owner,
    location,
    ready,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
  s.units.push(u);
  return u;
}
function take(s: GameState, f: string | ((a: GameAction) => boolean)) {
  const a = getLegalActions(s, s.priorityPlayer).find(
    typeof f === "string" ? (a) => a.id === f : f,
  );
  expect(a, `Missing ${String(f)} in ${s.phase}`).toBeDefined();
  return applyAction(s, a!);
}
function play(
  s: GameState,
  cardId: string,
  targetId?: string,
  locationId?: LocationId,
) {
  return take(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (targetId === undefined || a.targetId === targetId) &&
      (locationId === undefined || a.locationId === locationId) &&
      !a.id.includes("accelerate"),
  );
}
function chain(s: GameState) {
  for (let i = 0; i < 100 && (s.stack.length || s.pendingChoice); i++)
    s = take(s, s.pendingChoice ? () => true : "pass");
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function resolveOne(s: GameState) {
  s = take(s, "pass");
  return take(s, "pass");
}
function move(s: GameState, id: string, to: LocationId) {
  s = take(
    s,
    (a) =>
      a.id.startsWith("move-start:") &&
      a.sourceId === id &&
      a.locationId === to,
  );
  return take(s, "move-confirm");
}

describe("Origins discard, trash, and explicit choices", () => {
  it("Get Excited uses the chosen discarded card Energy, then deals that damage", () => {
    let s = position();
    unit(s, "enemy", ogn(142), 1, "field:0");
    s.players[0].hand = [ogn(8), ogn(52), ogn(142)];
    s = resolveOne(play(s, ogn(8), "enemy"));
    expect(s.pendingChoice?.kind).toBe("discard");
    expect(s.units[0].damage).toBe(0);
    s = take(
      s,
      (a) => a.cardId === ogn(142) && a.id.startsWith("choose-card:"),
    );
    expect(s.units[0].damage).toBe(9);
    expect(s.players[0].discard).toContain(ogn(142));
    expect(s.players[0].discardedThisTurn).toBe(1);
  });
  it("Cemetery Attendant offers only units in trash and returns the chosen one", () => {
    let s = position();
    s.players[0].hand = [ogn(165)];
    s.players[0].discard = [ogn(8), ogn(142), ogn(52)];
    s = chain(play(s, ogn(165), undefined, "base:0"));
    expect(s.players[0].hand).toContain(ogn(142));
    expect(s.players[0].discard).toContain(ogn(8));
  });
  it("Annie Stubborn returns only a spell from trash", () => {
    let s = position();
    s.players[0].hand = [ogs(10)];
    s.players[0].discard = [ogn(142), ogn(8)];
    s = chain(play(s, ogs(10)));
    expect(s.players[0].hand).toEqual([ogn(8)]);
    expect(s.players[0].discard).toEqual([ogn(142)]);
  });
  it("Scrapheap draws when discarded and remains a real gear when played", () => {
    let s = position();
    s.players[0].hand = [ogn(3), ogn(182)];
    s = chain(play(s, ogn(3)));
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].discard).toContain(ogn(182));
    s = position();
    s.players[0].hand = [ogn(182)];
    s = chain(play(s, ogn(182)));
    expect(s.gears[0].cardId).toBe(ogn(182));
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("discarding Flame Chompers lets its owner pay Fury and choose a legal play location", () => {
    let s = position();
    s.players[0].hand = [ogn(3), ogn(6)];
    s = chain(play(s, ogn(3)));
    expect(s.units.map((u) => u.cardId)).toContain(ogn(6));
    expect(s.units.find((u) => u.cardId === ogn(6))?.token).toBe(false);
    expect(s.players[0].discard).not.toContain(ogn(6));
    expect(s.players[0].cardsPlayedThisTurn).toBe(2);
  });
  it("Vi recycle cost chooses a trash card, pays it before resolution and grants +1", () => {
    let s = position();
    unit(s, "vi", ogn(36));
    s.players[0].discard = [ogn(142), ogn(52)];
    s = take(s, (a) => a.sourceId === "vi" && a.amount === 1);
    expect(s.players[0].discard).toEqual([ogn(142)]);
    expect(s.players[0].deck.at(-1)).toBe(ogn(52));
    s = chain(s);
    expect(getMight(s, s.units[0])).toBe((getCard(ogn(36)).might ?? 0) + 1);
  });
  it("Buccaneer can pay a discounted cost when its full cost is unaffordable", () => {
    let s = position();
    s.players[0].energy = 4;
    s.players[0].runes = [];
    s.players[0].hand = [ogn(2), ogn(142)];
    s = take(s, (a) => a.cardId === ogn(2) && a.id.includes("|discard:"));
    expect(s.players[0].energy).toBe(0);
    expect(s.players[0].discard).toContain(ogn(142));
    expect(s.units[0].cardId).toBe(ogn(2));
  });
  it("Cruel Patron sacrifices an existing friendly unit as an additional cost", () => {
    let s = position();
    unit(s, "victim", ogn(52));
    s.players[0].hand = [ogn(208)];
    s = play(s, ogn(208), "victim");
    expect(s.units.map((u) => u.id)).not.toContain("victim");
    expect(s.units.map((u) => u.cardId)).toContain(ogn(208));
    expect(s.pendingChoice).toBeNull();
  });
  it("Cull the Weak gives each player their own unit choice", () => {
    let s = position();
    unit(s, "a", ogn(52));
    unit(s, "b", ogn(142));
    unit(s, "c", ogn(52), 1, "base:1");
    unit(s, "d", ogn(142), 1, "base:1");
    s.players[0].hand = [ogn(209)];
    s = resolveOne(play(s, ogn(209)));
    expect(s.priorityPlayer).toBe(0);
    s = take(s, "choose-unit:a");
    expect(s.priorityPlayer).toBe(1);
    s = take(s, "choose-unit:c");
    expect(s.units.map((u) => u.id)).toEqual(["b", "d"]);
  });
});

describe("Origins battlefield, hidden, temporary, and turn mechanics", () => {
  it("a hidden card cannot be played the turn it was hidden and becomes a free reaction next turn", () => {
    let s = position();
    unit(s, "guard", ogn(142), 0, "field:0");
    s.fields[0].controller = 0;
    s.players[0].hand = [ogn(83)];
    s = take(s, (a) => a.id.startsWith("hide:"));
    expect(s.hidden).toHaveLength(1);
    expect(
      getLegalActions(s, 0).some((a) => a.sourceId?.startsWith("hidden:")),
    ).toBe(false);
    s.turn++;
    s.currentPlayer = 1;
    s.priorityPlayer = 0;
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: false,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s.players[0].runes = [];
    s.players[0].energy = 0;
    const a = getLegalActions(s, 0).find((a) =>
      a.sourceId?.startsWith("hidden:"),
    )!;
    expect(a).toBeDefined();
    s = chain(applyAction(s, a));
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.hidden).toHaveLength(0);
  });
  it("public views mask the opponent hidden card identity", () => {
    let s = position();
    s.hidden = [
      {
        id: "h",
        cardId: ogn(83),
        owner: 1,
        location: "field:1",
        hiddenTurn: 1,
      },
    ];
    expect(getGameView(s, 0).hidden?.[0].cardId).toBe("hidden");
    expect(getGameView(s, 1).hidden?.[0].cardId).toBe(ogn(83));
  });
  it("Sprite tokens enter ready and die before scoring at their controller next beginning", () => {
    let s = position();
    s.players[0].hand = [ogn(94)];
    s = chain(play(s, ogn(94)));
    const sprite = s.units[0];
    expect(sprite.ready).toBe(true);
    expect(sprite.temporary).toBe(true);
    expect(getMight(s, sprite)).toBe(3);
    sprite.location = "field:0";
    s.fields[0].controller = 0;
    s = chain(take(s, "end-turn"));
    s = chain(take(s, "end-turn"));
    expect(s.units).toHaveLength(0);
    expect(s.players[0].points).toBe(0);
  });
  it("Fading Memories applies Temporary to gear which dies next beginning", () => {
    let s = position();
    s.gears.push({ id: "g", cardId: ogn(182), owner: 1, ready: true });
    s.players[0].hand = [ogn(180)];
    s = chain(play(s, ogn(180), "g"));
    expect(s.gears[0].temporary).toBe(true);
    s = chain(take(s, "end-turn"));
    expect(s.gears).toHaveLength(0);
    expect(s.players[1].discard).toContain(ogn(182));
    expect(s.players[1].hand).toHaveLength(2);
  });
  it("Gust bounces a small unit and disallows targets above 3 current Might", () => {
    let s = position();
    unit(s, "small", ogn(52), 1, "field:0");
    unit(s, "large", ogn(142), 1, "field:0");
    s.players[0].hand = [ogn(169)];
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.cardId === ogn(169))
        .map((a) => a.targetId),
    ).toEqual(["small"]);
    s = chain(play(s, ogn(169), "small"));
    expect(s.players[1].hand).toContain(ogn(52));
    expect(s.units.map((u) => u.id)).not.toContain("small");
  });
  it("Charm selects the destination and opens a showdown on a newly contested field", () => {
    let s = position();
    unit(s, "enemy", ogn(52), 1, "base:1");
    s.players[0].hand = [ogn(43)];
    s = resolveOne(play(s, ogn(43), "enemy"));
    expect(s.pendingChoice?.kind).toBe("move");
    s = take(s, "choose-destination:field:0");
    expect(s.units[0].location).toBe("field:0");
    expect(s.phase).toBe("showdown");
    expect(s.combat?.attacker).toBe(1);
  });
  it("Traveling Merchant moves trigger discard then draw", () => {
    let s = position();
    unit(s, "merchant", ogn(185));
    s.players[0].hand = [ogn(52)];
    s = chain(move(s, "merchant", "field:0"));
    expect(s.players[0].discard).toContain(ogn(52));
    expect(s.players[0].hand).toEqual([ogn(142)]);
  });
  it("Noxian Drummer creates a Recruit at its destination battlefield", () => {
    let s = position();
    unit(s, "drummer", ogn(222));
    s = chain(move(s, "drummer", "field:0"));
    expect(s.units.filter((u) => u.location === "field:0")).toHaveLength(2);
    expect(s.units.find((u) => u.token)?.cardId).toBe(ogn(271));
  });
  it("conquering Zaun Warrens queues discard then draw and retains the choice", () => {
    let s = position();
    s.fields[0].cardId = ogn(298);
    unit(s, "attacker", ogn(142));
    s.players[0].hand = [ogn(52)];
    s = move(s, "attacker", "field:0");
    s = take(take(s, "pass"), "pass");
    expect(s.stack).toHaveLength(1);
    s = chain(s);
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].discard).toContain(ogn(52));
    expect(s.players[0].hand).toEqual([ogn(142)]);
  });
  it("Jinx legend beginning draws before the normal turn draw when hand has at most one", () => {
    let s = position();
    s.players[1].legendId = ogn(251);
    s = chain(take(s, "end-turn"));
    expect(s.players[1].hand).toHaveLength(2);
  });
  it("Grand Plaza wins on hold with seven units at its battlefield", () => {
    let s = position();
    s.fields[1].cardId = ogn(293);
    s.fields[1].controller = 1;
    for (let i = 0; i < 7; i++) unit(s, `u${i}`, ogn(52), 1, "field:1");
    s = chain(take(s, "end-turn"));
    expect(s.winner).toBe(1);
  });
});

describe("Original starter abilities, buffs and simultaneous spell targets", () => {
  it("Wildclaw Shaman spends a chosen buff, buffs itself and enters ready", () => {
    let s = position();
    unit(s, "donor", ogn(52)).buff = 1;
    s.players[0].hand = [ogn(147)];
    s = chain(play(s, ogn(147)));
    expect(s.units.find((u) => u.id === "donor")?.buff).toBe(0);
    expect(s.units.find((u) => u.cardId === ogn(147))?.buff).toBe(1);
    expect(s.units.find((u) => u.cardId === ogn(147))?.ready).toBe(true);
  });
  it("Stand United doubles friendly buff contribution for the turn and Lee Sin aura adds two", () => {
    let s = position();
    unit(s, "poro", ogn(52), 0, "field:0");
    unit(s, "lee", ogn(151), 0, "field:0");
    s.players[0].hand = [ogn(53)];
    s = chain(play(s, ogn(53), "poro"));
    expect(getMight(s, s.units[0])).toBe(7);
  });
  it("Udyr can use each mode only once per turn, spending its buff each time", () => {
    let s = position();
    unit(s, "udyr", ogn(157)).buff = 1;
    s = take(s, (a) => a.sourceId === "udyr" && a.id.includes("|2|"));
    s = chain(s);
    s.units[0].buff = 1;
    expect(
      getLegalActions(s, 0).some(
        (a) => a.sourceId === "udyr" && a.id.includes("|2|"),
      ),
    ).toBe(false);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.sourceId === "udyr" && a.id.includes("|3|"),
      ),
    ).toBe(true);
  });
  it("Heimerdinger inherits friendly exhaust abilities and exhausts itself to pay", () => {
    let s = position();
    s.players[0].legendId = ogn(257);
    unit(s, "heimer", ogn(111));
    unit(s, "poro", ogn(52));
    s = take(s, (a) => a.sourceId === "heimer" && a.targetId === "poro");
    expect(s.units[0].ready).toBe(false);
    expect(s.players[0].legendUsedTurn).not.toBe(s.turn);
    s = chain(s);
    expect(s.units[1].buff).toBe(1);
  });
  it("Orb of Regret activates from a real ready gear and preserves minimum one Might", () => {
    let s = position();
    s.gears = [{ id: "orb", cardId: ogn(90), owner: 0, ready: true }];
    unit(s, "recruit", ogn(271));
    s = chain(take(s, (a) => a.sourceId === "orb" && a.targetId === "recruit"));
    expect(s.gears[0].ready).toBe(false);
    expect(getMight(s, s.units[0])).toBe(1);
  });
  it("Back to Back targets two distinct friendly units and grants each +2", () => {
    let s = position();
    unit(s, "a", ogn(52));
    unit(s, "b", ogn(52));
    s.players[0].hand = [ogn(206)];
    s = chain(play(s, ogn(206), "a~b"));
    expect(s.units.map((u) => getMight(s, u))).toEqual([4, 4]);
  });
  it("Hidden Blade kills the chosen unit and its controller draws two", () => {
    let s = position();
    unit(s, "enemy", ogn(142), 1, "field:0");
    s.players[0].hand = [ogn(213)];
    s = chain(play(s, ogn(213), "enemy"));
    expect(s.units).toHaveLength(0);
    expect(s.players[1].hand).toHaveLength(2);
  });
  it("Singularity can choose two units and deals six to each", () => {
    let s = position();
    unit(s, "a", ogn(142), 1, "field:0");
    unit(s, "b", ogn(142), 1, "field:1");
    s.players[0].hand = [ogn(105)];
    s = chain(play(s, ogn(105), "a~b"));
    expect(s.units.map((u) => u.damage)).toEqual([6, 6]);
  });
  it("Meditation optionally exhausts a unit while paying to draw two", () => {
    let s = position();
    unit(s, "poro", ogn(52));
    s.players[0].hand = [ogn(48)];
    s = take(s, (a) => a.cardId === ogn(48) && a.id.includes("|exhaust:"));
    expect(s.units[0].ready).toBe(false);
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("Lux Crownguard adds spell-only energy immediately without a response chain", () => {
    let s = position();
    unit(s, "lux", ogs(14));
    s.players[0].energy = 0;
    s.players[0].runes = [];
    s.players[0].hand = [ogn(95), ogn(52)];
    s = take(s, (a) => a.sourceId === "lux" && a.category === "ability");
    expect(s.stack).toHaveLength(0);
    expect(s.players[0].spellEnergy).toBe(2);
    expect(getLegalActions(s, 0).some((a) => a.cardId === ogn(52))).toBe(false);
    expect(getLegalActions(s, 0).some((a) => a.cardId === ogn(95))).toBe(true);
  });
  it("Confront causes subsequently played units to enter ready", () => {
    let s = position();
    s.players[0].hand = [ogn(129), ogn(52)];
    s = chain(play(s, ogn(129)));
    s = play(s, ogn(52));
    expect(s.units[0].ready).toBe(true);
  });
  it("Highlander replaces death with exhausted recall without move triggers", () => {
    let s = position();
    unit(s, "merchant", ogn(185), 0, "field:0");
    s.fields[0].controller = 0;
    s.players[0].hand = [ogs(20), ogn(213), ogn(52)];
    s = chain(play(s, ogs(20), "merchant"));
    s = chain(play(s, ogn(213), "merchant"));
    expect(s.units[0].id).toBe("merchant");
    expect(s.units[0].location).toBe("base:0");
    expect(s.units[0].ready).toBe(false);
    expect(s.players[0].discard).not.toContain(ogn(185));
    expect(s.players[0].discard).not.toContain(ogn(52));
  });
});

describe("Precon timing and public rules edge cases", () => {
  it("Magma Wurm makes other units enter ready", () => {
    let s = position();
    unit(s, "wurm", ogn(11));
    s.players[0].hand = [ogn(52)];
    s = play(s, ogn(52));
    expect(s.units.find((u) => u.cardId === ogn(52))?.ready).toBe(true);
  });
  it("Raging Soul gains Ganking and Assault after its controller discards", () => {
    let s = position();
    unit(s, "soul", ogn(19));
    s.players[0].hand = [ogn(3), ogn(52)];
    s = chain(play(s, ogn(3)));
    expect(getKeywords(s, s.units[0])).toContain("Ganking");
    expect(getKeywords(s, s.units[0])).toContain("Assault");
  });
  it("Rhasa discounts one Energy for every card in trash", () => {
    let s = position();
    s.players[0].energy = 5;
    s.players[0].runes = [{ id: "chaos", domain: "Chaos", ready: false }];
    s.players[0].discard = Array(5).fill(ogn(52));
    s.players[0].hand = [ogn(195)];
    s = play(s, ogn(195));
    expect(s.players[0].energy).toBe(0);
    expect(s.units[0].cardId).toBe(ogn(195));
  });
  it("Garen Commander boosts every other friendly unit at its location only", () => {
    const s = position();
    unit(s, "garen", ogs(13));
    unit(s, "ally", ogn(52));
    unit(s, "away", ogn(52), 0, "field:0");
    expect(getMight(s, s.units[0])).toBe(getCard(ogs(13)).might);
    expect(getMight(s, s.units[1])).toBe(3);
    expect(getMight(s, s.units[2])).toBe(3);
  });
  it("Meditative Master Yi gains four Might with at least eight runes", () => {
    const s = position();
    unit(s, "yi", ogs(4));
    const printed = getCard(ogs(4)).might ?? 0;
    expect(getMight(s, s.units[0])).toBe(printed + 4);
    s.players[0].runes = s.players[0].runes.slice(0, 7);
    expect(getMight(s, s.units[0])).toBe(printed);
  });
  it("Eager Apprentice discount applies only while it is at a battlefield", () => {
    let s = position();
    unit(s, "apprentice", ogn(84), 0, "field:0");
    s.players[0].runes = [];
    s.players[0].energy = 1;
    s.players[0].hand = [ogn(58)];
    expect(getLegalActions(s, 0).some((a) => a.cardId === ogn(58))).toBe(true);
    s.units[0].location = "base:0";
    expect(getLegalActions(s, 0).some((a) => a.cardId === ogn(58))).toBe(false);
  });
  it("Viktor Innovator triggers only when its controller plays a card on an opponent turn", () => {
    let s = position();
    unit(s, "viktor", ogn(117));
    s.currentPlayer = 1;
    s.priorityPlayer = 0;
    s.phase = "showdown";
    s.players[0].hand = [ogn(58)];
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: false,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s = chain(play(s, ogn(58), "viktor"));
    expect(
      s.units.filter(
        (u) => u.token && u.owner === 0 && u.location === "base:0",
      ),
    ).toHaveLength(1);
  });
  it("Wraith of Echoes draws only on the first friendly death of a turn", () => {
    let s = position();
    unit(s, "wraith", ogn(118));
    unit(s, "first", ogn(52), 0, "field:0");
    unit(s, "second", ogn(52), 0, "field:0");
    s.players[0].hand = [ogs(12), ogs(12)];
    s = chain(play(s, ogs(12), "first"));
    expect(s.players[0].hand).toHaveLength(2);
    s = chain(play(s, ogs(12), "second"));
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Mistfall can pay Body power and exhaust after a buff to ready that unit", () => {
    let s = position();
    unit(s, "poro", ogn(52), 0, "base:0", false);
    s.gears = [{ id: "mist", cardId: ogn(152), owner: 0, ready: true }];
    s.players[0].legendId = ogn(257);
    const before = s.players[0].runes.length;
    s = chain(take(s, (a) => a.sourceId === "legend" && a.targetId === "poro"));
    expect(s.units[0].ready).toBe(true);
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].runes).toHaveLength(before - 1);
  });
  it("Vision choice inspects and optionally recycles top card without drawing", () => {
    let s = position();
    s.players[0].hand = [ogn(86)];
    s.players[0].deck = [ogn(52), ogn(142)];
    s = resolveOne(play(s, ogn(86)));
    expect(s.pendingChoice?.kind).toBe("predict");
    s = take(s, "choose-predict:recycle");
    expect(s.players[0].deck).toEqual([ogn(142), ogn(52)]);
    expect(s.players[0].hand).toHaveLength(0);
  });
  it("Targon Peak conquest schedules readying two runes for ending, not conquest", () => {
    let s = position();
    s.fields[0].cardId = ogn(289);
    s.players[0].runes.forEach((r) => (r.ready = false));
    unit(s, "army", ogn(142));
    s = chain(take(take(move(s, "army", "field:0"), "pass"), "pass"));
    expect(s.players[0].runes.filter((r) => r.ready)).toHaveLength(0);
    s = chain(take(s, "end-turn"));
    expect(s.players[0].runes.filter((r) => r.ready)).toHaveLength(2);
  });
  it("Monastery conquest can spend an existing buff to draw one", () => {
    let s = position();
    s.fields[0].cardId = ogn(282);
    unit(s, "army", ogn(142)).buff = 1;
    s = chain(take(take(move(s, "army", "field:0"), "pass"), "pass"));
    expect(s.units[0].buff).toBe(0);
    expect(s.players[0].hand).toHaveLength(1);
  });
  it("Mask of Foresight grants an alone attacker a turn-long Might bonus", () => {
    let s = position();
    s.gears = [{ id: "mask", cardId: ogn(60), owner: 0, ready: true }];
    unit(s, "army", ogn(142));
    unit(s, "enemy", ogn(142), 1, "field:0");
    s = chain(move(s, "army", "field:0"));
    expect(s.units.find((u) => u.id === "army")?.temporaryMight).toBe(1);
  });
  it("Fortified Position grants chosen unit Shield 2 for that combat", () => {
    let s = position();
    s.fields[0].cardId = ogn(279);
    unit(s, "army", ogn(142));
    unit(s, "enemy", ogn(52), 1, "field:0");
    s = move(s, "army", "field:0");
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = take(s, (a) => a.targetId === "enemy");
    s = chain(s);
    expect(s.units.find((u) => u.id === "enemy")?.combatShield).toBe(2);
    expect(
      getMight(
        s,
        s.units.find((u) => u.id === "enemy")!,
      ),
    ).toBe(7);
  });
  it("Reaver Row defender may decline its optional retreat", () => {
    let s = position();
    s.fields[0].cardId = ogn(285);
    unit(s, "army", ogn(142));
    unit(s, "enemy", ogn(52), 1, "field:0");
    s = move(s, "army", "field:0");
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = take(s, "choose-trigger:skip");
    expect(s.units.find((u) => u.id === "enemy")?.location).toBe("field:0");
    expect(s.stack).toHaveLength(0);
  });
  it("Singularity rechecks enemy targeting protection before each target damage", () => {
    let s = position();
    unit(s, "a", ogn(142), 1, "field:0");
    unit(s, "b", ogn(142), 1, "field:1");
    s.players[0].hand = [ogn(105)];
    s = play(s, ogn(105), "a~b");
    s.units[0].untargetableByEnemy = true;
    s = chain(s);
    expect(s.units[0].damage).toBe(0);
    expect(s.units[1].damage).toBe(6);
  });
  it("Sprite Call played from Hidden restricts token placement to that battlefield", () => {
    let s = position();
    unit(s, "guard", ogn(142), 0, "field:0");
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "hidden-sprite",
        cardId: ogn(94),
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    s = play(s, ogn(94));
    s = resolveOne(s);
    expect(s.pendingChoice?.kind).toBe("token");
    expect(getLegalActions(s, 0).map((a) => a.locationId)).toEqual(["field:0"]);
  });
});

describe("all published starter precon matchups", () => {
  it("completes all 169 ordered deck pairings with no illegal actions or stuck choices", () => {
    const failures: string[] = [];
    for (const [i, a] of officialPreconDecks.entries())
      for (const [j, b] of officialPreconDecks.entries()) {
        let s = createGame({
          playerDeck: a,
          botDeck: b,
          seed: 7200 + i * 31 + j,
        });
        let steps = 0;
        try {
          for (; s.winner === null && steps < 3000; steps++) {
            const action = getBotAction(s);
            if (!action) throw new Error(`no legal action ${s.phase}`);
            s = applyAction(s, action);
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
                (s.hidden ?? []).filter((h) => h.owner === p.id).length;
              if (count !== 40)
                throw new Error(
                  `${p.deckId} conservation ${count} after ${action.id}; resolving=${(s.resolving ?? []).map((x) => x.cardId)} gears=${s.gears.map((g) => g.cardId + ":" + g.token)}`,
                );
              if (p.energy < 0 || p.runes.length + p.runeDeck.length !== 12)
                throw new Error("resource invariant");
            }
          }
          if (s.winner === null)
            throw new Error(`no winner after ${steps} actions (${s.phase})`);
        } catch (error) {
          failures.push(`${a.id} vs ${b.id} turn${s.turn}: ${String(error)}`);
        }
      }
    expect(failures).toEqual([]);
  }, 120000);
});

describe("resources and effect limits across phase boundaries", () => {
  it("clears energy generated during Beginning when Main starts", () => {
    let s = position();
    s.fields[1].cardId = ogn(280);
    s.fields[1].controller = 1;
    unit(s, "lux", ogs(14), 1, "field:1");
    s = take(s, "end-turn");
    expect(s.pendingTurnStart).toBe(1);
    s = take(s, (a) => a.sourceId === "lux" && a.category === "ability");
    expect(s.players[1].spellEnergy).toBe(2);
    s = chain(s);
    expect(s.players[1].spellEnergy).toBe(0);
  });
  it("a minimum-one reduction cannot increase a unit already at zero Might", () => {
    let s = position();
    unit(s, "zero", ogn(52)).temporaryMight = -2;
    s.players[0].hand = [ogn(95)];
    s = chain(play(s, ogn(95), "zero"));
    expect(getMight(s, s.units[0])).toBe(0);
  });
});

describe("resolving-card zones and kill replacements", () => {
  it("keeps a spell outside trash until all its explicit resolution choices finish", () => {
    let s = position();
    unit(s, "enemy", ogn(142), 1, "field:0");
    s.players[0].hand = [ogn(8), ogn(52)];
    s = resolveOne(play(s, ogn(8), "enemy"));
    expect(s.pendingChoice?.kind).toBe("discard");
    expect(s.players[0].discard).not.toContain(ogn(8));
    expect(s.resolving?.map((x) => x.cardId)).toContain(ogn(8));
    s = take(s, "choose-card:0");
    expect(s.resolving ?? []).toHaveLength(0);
    expect(s.players[0].discard).toContain(ogn(8));
  });
  it("Disintegrate does not draw when Highlander replaces the target death", () => {
    let s = position();
    unit(s, "saved", ogn(52), 0, "field:0");
    s.players[0].hand = [ogs(20), ogn(5)];
    s = chain(play(s, ogs(20), "saved"));
    s = chain(play(s, ogn(5), "saved"));
    expect(s.units).toHaveLength(1);
    expect(s.units[0].location).toBe("base:0");
    expect(s.players[0].hand).toHaveLength(0);
  });
});

describe("cross-precon reinforcements", () => {
  it("Ambush reinforcements do not restart combat or retrigger the existing attackers", () => {
    let s = position();
    s.fields[0].controller = 1;
    unit(s, "corsair", ogn(130));
    unit(s, "defender", ogn(142), 1, "field:0");
    s.players[0].hand = ["unl-002-219"];
    s = chain(move(s, "corsair", "field:0"));
    expect(s.units.find((u) => u.id === "defender")?.damage).toBe(1);
    // Rules 323.2, 383.4.e and 464.2.c.3.a: the joiner gains its own designation,
    // while the ongoing showdown, chain and existing attack designations remain.
    s.focusPlayer = 1;
    s.priorityPlayer = 0;
    s.chainStarter = 1;
    s.stack = [
      {
        id: "defender-reaction",
        player: 1,
        cardId: ogn(58),
        targetId: "defender",
        effects: [{ type: "might", amount: 2, target: "friendlyUnit" }],
        kind: "spell",
      },
    ];
    s = play(s, "unl-002-219", undefined, "field:0");
    expect(s.focusPlayer).toBe(1);
    expect(s.combat?.fieldId).toBe("field:0");
    expect(s.combat?.attacker).toBe(0);
    expect(s.combat?.defender).toBe(1);
    expect(s.stack.some((i) => i.id === "defender-reaction")).toBe(true);
    s = chain(s);
    expect(s.units.find((u) => u.id === "defender")?.damage).toBe(1);
    expect(s.combat?.attacker).toBe(0);
  });
});
