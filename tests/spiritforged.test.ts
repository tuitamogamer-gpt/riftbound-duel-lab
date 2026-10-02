import { describe, expect, it, vi } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import {
  spiritforgedModule as module,
  spiritforgedScripts,
} from "../src/game/spiritforged";
import type { PreconContext } from "../src/game/later-precon-engine";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";

const unit = (id: string, cardId: string, owner: 0 | 1 = 0): Unit => ({
  id,
  cardId,
  owner,
  location: "field:0",
  ready: false,
  damage: 0,
  buff: 0,
  temporaryMight: 0,
  temporaryAssault: 0,
  stunned: false,
  gear: [],
  summonedTurn: 1,
});
function fixture() {
  const s = createGame({ seed: 421 });
  s.phase = "main";
  s.turn = 3;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.units = [];
  s.gears = [];
  s.stack = [];
  s.players[0].energy = 20;
  s.players[0].legendId = "sfd-205-221";
  const ctx: PreconContext = {
    runEffects: vi.fn(
      (
        state: GameState,
        _p: PlayerId,
        effects: Effect[],
        targetId?: string,
      ) => {
        for (const e of effects) {
          const u = state.units.find((u) => u.id === targetId);
          if (e.type === "buff" && u) u.buff = Math.max(u.buff, 1);
          if (e.type === "damage" && u) u.damage += e.amount ?? 1;
        }
      },
    ),
    pay: vi.fn(),
    canPay: vi.fn(() => true),
    draw: vi.fn(),
    trigger: vi.fn(),
    pushStack: vi.fn(),
    spawnToken: vi.fn(),
    killUnits: vi.fn(),
    channel: vi.fn(),
    moveUnit: vi.fn(),
    openChoice: vi.fn(),
    playUnit: vi.fn(),
    discardCards: vi.fn(),
    spellPlayed: vi.fn(),
    dealDamage: vi.fn(),
    cardEvent: vi.fn(),
    killGear: vi.fn(),
    costFor: vi.fn(() => ({ energy: 0, power: 0, extraPower: 0 })),
    getMight: (state, u) =>
      module.might!(
        state,
        u,
        (getCard(u.cardId).might ?? 0) +
          u.buff +
          u.temporaryMight +
          u.gear.reduce(
            (n, id) =>
              n +
              (spiritforgedScripts[
                state.gears.find((g) => g.id === id)?.cardId ?? ""
              ]?.gearMight ?? 0),
            0,
          ),
      ),
  };
  return { s, ctx };
}
const special = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `sfd:${custom}`,
  ...extra,
});

describe("Spiritforged preconstructed rules", () => {
  it("uses printed equipment bonuses missing from the provider text", () => {
    expect(spiritforgedScripts["sfd-095-221"].gearMight).toBe(2);
    expect(spiritforgedScripts["sfd-161-221"].gearMight).toBe(3);
    expect(spiritforgedScripts["sfd-108-221"].gearMight).toBe(1);
    expect(spiritforgedScripts["sfd-172-221"].gearMight).toBe(1);
    expect(spiritforgedScripts["sfd-022-221"].gearMight).toBe(2);
  });
  it("Mech auras affect only Mechs and follow attacker/defender designation", () => {
    const { s } = fixture();
    s.players[0].legendId = "sfd-181-221";
    const m = unit("m", "sfd-062-221"),
      r = unit("r", "sfd-089-221"),
      hot = unit("h", "sfd-026-221"),
      poro = unit("p", "sfd-099-221");
    s.units = [m, r, hot, poro];
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      engaged: true,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(module.might!(s, m, 3)).toBe(5);
    expect(module.might!(s, poro, 3)).toBe(3);
    s.combat.attacker = 1;
    s.combat.defender = 0;
    expect(module.might!(s, m, 3)).toBe(5);
    s.combat = null;
    expect(module.might!(s, m, 3)).toBe(4);
  });
  it("Mighty triggers only on entering or crossing the five-Might threshold", () => {
    const { s, ctx } = fixture();
    const u = unit("u", "ogn-052-298");
    u.temporaryMight = 0;
    s.units = [u];
    module.event!(s, "unitPlayed", 0, u.cardId, u.id, u.location, ctx);
    expect(ctx.trigger).not.toHaveBeenCalled();
    u.temporaryMight = 3;
    module.event!(s, "buff", 0, u.cardId, u.id, u.location, ctx);
    expect(ctx.trigger).toHaveBeenCalledTimes(1);
    module.event!(s, "attach", 0, u.cardId, u.id, u.location, ctx);
    expect(ctx.trigger).toHaveBeenCalledTimes(1);
    u.temporaryMight = 0;
    module.event!(s, "buff", 0, u.cardId, u.id, u.location, ctx);
    u.temporaryMight = 3;
    module.event!(s, "buff", 0, u.cardId, u.id, u.location, ctx);
    expect(ctx.trigger).toHaveBeenCalledTimes(2);
  });
  it("Fiora optional channeling exhausts the legend and enters the rune exhausted", () => {
    const { s, ctx } = fixture();
    module.effect!(s, 0, special("fiora-channel"), ctx);
    expect(ctx.openChoice).toHaveBeenCalledOnce();
    expect(ctx.channel).not.toHaveBeenCalled();
    module.effect!(s, 0, special("pay-fiora"), ctx);
    expect(ctx.channel).toHaveBeenCalledWith(s, 0, 1, false);
    module.effect!(s, 0, special("pay-fiora"), ctx);
    expect(ctx.channel).toHaveBeenCalledTimes(1);
    s.turn++;
    module.effect!(s, 0, special("pay-fiora"), ctx);
    expect(ctx.channel).toHaveBeenCalledTimes(1);
  });
  it("Fiora Peerless doubles current Might only for the one-on-one combat", () => {
    const { s, ctx } = fixture();
    s.players[0].legendId = "ogs-023-024";
    const f = unit("f", "sfd-110-221"),
      foe = unit("e", "ogn-052-298", 1);
    s.units = [f, foe];
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      engaged: true,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    const start = ctx.getMight(s, f);
    module.event!(s, "combatStart", 0, f.cardId, undefined, "field:0", ctx);
    expect(ctx.getMight(s, f)).toBe(start);
    ctx.sourceId = f.id;
    module.effect!(s, 0, special("peerless"), ctx);
    expect(ctx.getMight(s, f)).toBe(start * 2);
    f.temporaryMight++;
    module.event!(s, "combatEnd", 0, f.cardId, undefined, "field:0", ctx);
    expect(ctx.getMight(s, f)).toBe(start + 1);
  });
  it("Warmog buffs its equipped conqueror and Sacred Shears draws on its death", () => {
    const { s, ctx } = fixture();
    const u = unit("u", "ogn-052-298");
    u.gear = ["a", "b"];
    s.units = [u];
    s.gears = [
      {
        id: "a",
        cardId: "sfd-108-221",
        owner: 0,
        ready: true,
        attachedTo: u.id,
      },
      {
        id: "b",
        cardId: "sfd-172-221",
        owner: 0,
        ready: true,
        attachedTo: u.id,
      },
    ];
    module.event!(s, "conquer", 0, u.cardId, u.id, u.location, ctx);
    expect(ctx.trigger).toHaveBeenCalledWith(
      s,
      0,
      "sfd-108-221",
      "u",
      [special("warmog", { cardName: "u" })],
      "field:0",
    );
    module.effect!(s, 0, special("warmog", { cardName: "u" }), ctx);
    expect(u.buff).toBe(1);
    module.event!(s, "death", 0, u.cardId, u.id, u.location, ctx);
    expect(ctx.trigger).toHaveBeenCalledWith(
      s,
      0,
      "sfd-172-221",
      "u",
      [{ type: "draw", amount: 1 }],
      "field:0",
    );
  });
  it("Weaponmaster offers a choice and can move previously attached Equipment for the discounted power cost", () => {
    const { s, ctx } = fixture();
    const old = unit("old", "ogn-052-298"),
      fresh = unit("new", "sfd-099-221");
    old.gear = ["g"];
    s.units = [old, fresh];
    s.gears = [
      {
        id: "g",
        cardId: "sfd-161-221",
        owner: 0,
        ready: true,
        attachedTo: old.id,
      },
    ];
    ctx.sourceId = fresh.id;
    module.effect!(s, 0, special("weaponmaster"), ctx);
    expect(ctx.openChoice).toHaveBeenCalledOnce();
    expect(s.gears[0].attachedTo).toBe("old");
    module.effect!(s, 0, special("attach|g|new"), ctx);
    expect(old.gear).toEqual([]);
    expect(fresh.gear).toEqual(["g"]);
    expect(ctx.pay).not.toHaveBeenCalled();
  });
  it("Assembly Rig recycles its selected unit as an activation cost before the Mech resolves", () => {
    const { s, ctx } = fixture();
    s.gears = [{ id: "rig", cardId: "sfd-019-221", owner: 0, ready: true }];
    s.players[0].discard = ["sfd-062-221"];
    const a = module.actions!(s, 0, ctx)[0];
    expect(a).toBeDefined();
    module.apply!(s, a, ctx);
    expect(s.players[0].discard).toEqual([]);
    expect(s.players[0].deck.at(-1)).toBe("sfd-062-221");
    expect(s.gears[0].ready).toBe(false);
    expect(ctx.spawnToken).not.toHaveBeenCalled();
    module.effect!(s, 0, special("assembly"), ctx);
    expect(ctx.spawnToken).toHaveBeenCalledWith(s, 0, "Mech", "base:0");
  });
  it("Ornns Forge discounts only the first nontoken gear each turn", () => {
    const { s, ctx } = fixture();
    s.fields[0] = { id: "field:0", cardId: "sfd-213-221", controller: 0 };
    const c = getCard("sfd-095-221");
    expect(module.cost!(s, 0, c)).toEqual({ energy: -1 });
    module.event!(s, "play", 0, c.id, "g", undefined, ctx);
    expect(module.cost!(s, 0, c)).toEqual({ energy: 0 });
    s.turn++;
    expect(module.cost!(s, 0, c)).toEqual({ energy: -1 });
  });
  it("Show of Strength counts only its controllers Mighty units", () => {
    const { s, ctx } = fixture();
    s.units = [
      unit("mine", "ogn-142-298"),
      unit("theirs", "ogn-142-298", 1),
      unit("small", "ogn-052-298"),
    ];
    module.effect!(s, 0, special("show-strength"), ctx);
    expect(ctx.draw).toHaveBeenCalledWith(s, 0, 1);
  });
  it("Yone uses the uncontrolled battlefield erratum even if an opposing unit started there", () => {
    const { s, ctx } = fixture();
    s.players[0].legendId = "sfd-181-221";
    s.fields[0].controller = null;
    const yone = unit("yone", "sfd-116-221"),
      foe = unit("foe", "ogn-052-298", 1);
    s.units = [yone, foe];
    module.event!(s, "showdownStart", 1, foe.cardId, foe.id, "field:0", ctx);
    s.fields[0].controller = 0;
    module.event!(
      s,
      "conquer",
      0,
      s.fields[0].cardId,
      "field:0",
      "field:0",
      ctx,
    );
    expect(ctx.trigger).toHaveBeenCalledWith(
      s,
      0,
      yone.cardId,
      yone.id,
      [special("yone-damage", { amount: 5, target: "enemyUnitInBase" })],
      "field:0",
    );
  });
});

function position(): GameState {
  let s = createGame({
    playerDeckId: "precon-fiora",
    botDeckId: "precon-rumble",
    seed: 557,
  });
  for (let i = 0; i < 2; i++) s = take(s, (a) => a.id === "mulligan:");
  s.turn = 7;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.phase = "main";
  s.stack = [];
  s.units = [];
  s.gears = [];
  s.combat = null;
  s.pendingChoice = null;
  s.chainStarter = null;
  s.consecutivePasses = 0;
  s.fields[0] = { id: "field:0", cardId: "ogn-280-298", controller: null };
  s.fields[1] = { id: "field:1", cardId: "ogn-275-298", controller: null };
  for (const p of s.players) {
    p.hand = [];
    p.championAvailable = false;
    p.energy = 30;
    p.runes = [
      "Body",
      "Body",
      "Body",
      "Body",
      "Order",
      "Order",
      "Order",
      "Order",
      "Mind",
      "Mind",
      "Fury",
      "Fury",
    ].map((domain, i) => ({ id: `r${p.id}-${i}`, domain, ready: true }));
    p.scoredFieldsThisTurn = [];
    p.conqueredThisTurn = [];
    p.cardsPlayedThisTurn = 0;
  }
  return s;
}
function take(s: GameState, find: (a: GameAction) => boolean): GameState {
  const actions = getLegalActions(s, s.priorityPlayer);
  const a = actions.find(find);
  expect(
    a,
    `No expected action in ${s.phase}: ${actions.map((x) => x.id).join(",")}`,
  ).toBeDefined();
  return applyAction(s, a!);
}
function settle(s: GameState, chooseFirst = true): GameState {
  for (let i = 0; i < 80 && (s.stack.length || s.phase === "choice"); i++) {
    if (s.phase === "choice")
      s = take(s, (a) => chooseFirst || a.id.includes("decline"));
    else s = take(s, (a) => a.id === "pass");
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
function cast(
  s: GameState,
  id: string,
  target?: string,
  location?: "base:0" | "field:0",
): GameState {
  s.players[s.priorityPlayer].hand.push(id);
  return take(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === id &&
      (!target || a.targetId === target) &&
      (!location || a.locationId === location),
  );
}
function conquer(s: GameState, id: string): GameState {
  s = take(
    s,
    (a) =>
      a.id.startsWith("move-start:") &&
      a.sourceId === id &&
      a.locationId === "field:0",
  );
  s = take(s, (a) => a.id === "move-confirm");
  for (let i = 0; i < 80 && (s.phase !== "main" || s.stack.length); i++)
    s = take(s, (a) => (s.phase === "choice" ? true : a.id === "pass"));
  expect(s.phase).toBe("main");
  expect(s.stack).toHaveLength(0);
  return s;
}

describe("Spiritforged through the actual game engine", () => {
  it("B.F. Sword equips with Order power, changes Might, and offers optional Fiora channeling", () => {
    let s = position();
    const u = unit("fighter", "sfd-099-221");
    s.units = [u];
    s = cast(s, "sfd-161-221");
    const gear = s.gears[0];
    const before = s.players[0].runes.filter(
      (r) => r.domain === "Order",
    ).length;
    s = take(
      s,
      (a) =>
        a.id.startsWith("equip:") &&
        a.sourceId === gear.id &&
        a.targetId === "fighter",
    );
    s = settle(s);
    expect(s.units[0].gear).toEqual([gear.id]);
    expect(getMight(s, s.units[0])).toBe((getCard(u.cardId).might ?? 0) + 3);
    expect(s.players[0].runes.filter((r) => r.domain === "Order")).toHaveLength(
      before - 1,
    );
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.players[0].runes.at(-1)?.ready).toBe(false);
  });
  it("Production Surge discounts with a Mech, plays the correct token, and draws one", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("mech", "sfd-062-221")];
    const n = s.players[0].hand.length;
    const energy = s.players[0].energy;
    s = cast(s, "sfd-076-221");
    s = settle(s);
    expect(
      s.units.filter((u) => getCard(u.cardId).name === "Mech"),
    ).toHaveLength(1);
    expect(s.players[0].hand).toHaveLength(n + 1);
    expect(s.players[0].energy).toBe(
      energy - Math.max(0, (getCard("sfd-076-221").energy ?? 0) - 2),
    );
  });
  it("Bubble Bot readies another Mech through a visible target choice", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const m = unit("old", "sfd-007-221");
    m.ready = false;
    s.units = [m];
    s = cast(s, "sfd-062-221", undefined, "base:0");
    s = settle(s);
    expect(s.units.find((u) => u.id === "old")?.ready).toBe(true);
    expect(s.units.find((u) => u.cardId === "sfd-062-221")?.ready).toBe(false);
  });
  it("Ferrous Forerunner creates two Mechs on death and does not replace the defeated card with a token", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("forerunner", "sfd-021-221")];
    s = cast(s, "ogn-229-298", "forerunner");
    s = settle(s);
    expect(s.players[0].discard).toContain("sfd-021-221");
    expect(
      s.units.filter((u) => getCard(u.cardId).name === "Mech"),
    ).toHaveLength(2);
  });
  it("Wages of Pain deals damage and creates an exhausted Gold gear token", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("enemy", "ogn-142-298", 1)];
    s = cast(s, "sfd-070-221", "enemy");
    s = settle(s);
    expect(s.units[0].damage).toBe(3);
    const gold = s.gears.find((g) => getCard(g.cardId).name.startsWith("Gold"));
    expect(gold).toBeDefined();
    expect(gold?.ready).toBe(false);
  });
  it("Riposte fixes both targets before response, counters the chosen spell, and uses its printed Energy cost", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("mine", "sfd-099-221")];
    const before = getMight(s, s.units[0]);
    s.stack = [
      {
        id: "incoming",
        cardId: "ogn-005-298",
        player: 1,
        kind: "spell",
        effects: [{ type: "damage", amount: 3, target: "unitAtBattlefield" }],
        targetId: "mine",
      },
    ];
    s = cast(s, "sfd-206-221", "mine~incoming");
    s = settle(s);
    expect(s.players[1].discard).toContain("ogn-005-298");
    expect(s.units[0].damage).toBe(0);
    expect(getMight(s, s.units[0])).toBe(before + 4);
  });
  it("Rumble Hotheaded optionally recycles another unit and plays a discounted Mech from trash", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const rumble = unit("rumble", "sfd-026-221"),
      sac = unit("sac", "sfd-065-221");
    rumble.location = "base:0";
    rumble.ready = true;
    sac.location = "base:0";
    s.units = [rumble, sac];
    s.players[0].discard = ["sfd-021-221"];
    const energy = s.players[0].energy;
    s = conquer(s, "rumble");
    expect(s.players[0].deck).toContain("sfd-065-221");
    expect(s.units.some((u) => u.id === "sac")).toBe(false);
    expect(s.units.some((u) => u.cardId === "sfd-021-221")).toBe(true);
    expect(s.players[0].energy).toBe(energy - 4);
  });
  it("an equipped Warmog conquer trigger buffs its own unit and Lucian readies only on his first conquer", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const lucian = unit("lucian", "sfd-113-221");
    lucian.location = "base:0";
    lucian.ready = true;
    lucian.gear = ["armor"];
    s.units = [lucian];
    s.gears = [
      {
        id: "armor",
        cardId: "sfd-108-221",
        owner: 0,
        ready: true,
        attachedTo: "lucian",
      },
    ];
    s = conquer(s, "lucian");
    expect(s.units[0].ready).toBe(true);
    expect(s.units[0].buff).toBe(1);
  });
  it("Sacred Shears and a Mighty Unsung Hero both trigger on the equipped units death", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const hero = unit("hero", "sfd-167-221");
    hero.gear = ["shears", "blade"];
    s.units = [hero];
    s.gears = [
      {
        id: "shears",
        cardId: "sfd-172-221",
        owner: 0,
        ready: true,
        attachedTo: "hero",
      },
      {
        id: "blade",
        cardId: "sfd-095-221",
        owner: 0,
        ready: true,
        attachedTo: "hero",
      },
    ];
    const n = s.players[0].deck.length;
    s = cast(s, "ogn-229-298", "hero");
    s = settle(s);
    expect(s.players[0].deck).toHaveLength(n - 3);
    expect(s.gears.every((g) => g.attachedTo === undefined)).toBe(true);
  });
  it("Yone damages a unit in the enemy base after conquering an open battlefield", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const yone = unit("yone", "sfd-116-221"),
      enemy = unit("enemy", "ogn-142-298", 1);
    yone.ready = true;
    yone.location = "base:0";
    enemy.location = "base:1";
    s.units = [yone, enemy];
    s = conquer(s, "yone");
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(5);
  });
  it("Dauntless Vanguard may be played straight to an enemy occupied battlefield", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("enemy", "ogn-142-298", 1)];
    s.fields[0].controller = 1;
    s = cast(s, "sfd-093-221", undefined, "field:0");
    expect(
      s.units.some(
        (u) => u.cardId === "sfd-093-221" && u.location === "field:0",
      ),
    ).toBe(true);
    expect(s.phase).toBe("showdown");
  });
  it("a live Breakneck Mech grants Deflect and Ganking, then both auras disappear when it dies", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("giver", "sfd-071-221"), unit("friend", "sfd-062-221")];
    s.players[1].hand = ["ogn-005-298"];
    s.priorityPlayer = 1;
    s.currentPlayer = 1;
    const before = getLegalActions(s, 1).find(
      (a) => a.cardId === "ogn-005-298" && a.targetId === "friend",
    )!;
    expect(before.detail).toContain("1 power");
    s.priorityPlayer = 0;
    s.currentPlayer = 0;
    s = cast(s, "ogn-229-298", "giver");
    s = settle(s);
    s.priorityPlayer = 1;
    s.currentPlayer = 1;
    const after = getLegalActions(s, 1).find(
      (a) => a.cardId === "ogn-005-298" && a.targetId === "friend",
    )!;
    expect(after.detail).toContain("0 power");
  });
  it("Punch First crossing Mighty opens both Fiora choices, while Jaull-Fish uses the live Might discount", () => {
    let s = position();
    const small = unit("small", "sfd-099-221"),
      worthy = unit("worthy", "sfd-180-221");
    worthy.location = "base:0";
    s.units = [small, worthy];
    s = cast(s, "sfd-097-221", "small");
    s = settle(s);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.units.find((u) => u.id === "small")?.ready).toBe(true);
    s.players[0].hand.push("sfd-103-221");
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === "sfd-103-221" && a.category === "play",
    )!;
    const count = s.units.filter((u) => getMight(s, u) >= 5).length;
    expect(a.detail).toContain(`${Math.max(0, 7 - 2 * count)} energy`);
  });
  it("Forecaster grants Vision to itself and allows keeping or recycling the revealed top card", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const top = s.players[0].deck[0];
    s = cast(s, "sfd-065-221", undefined, "base:0");
    for (let i = 0; i < 8 && s.phase !== "choice"; i++)
      s = take(s, (a) => a.id === "pass");
    const options = getLegalActions(s, 0);
    expect(options.some((a) => a.label.toLowerCase().includes("recycle"))).toBe(
      true,
    );
    s = take(s, (a) => a.label.toLowerCase().includes("recycle"));
    s = settle(s);
    expect(s.players[0].deck.at(-1)).toBe(top);
  });
  it("Treasure Hoard and Sunken Temple take their optional costs only after an explicit choice", () => {
    for (const id of ["sfd-220-221", "sfd-218-221"]) {
      let s = position();
      s.players[0].legendId = "sfd-181-221";
      s.fields[0].cardId = id;
      const u = unit("winner", "sfd-021-221");
      u.ready = true;
      u.location = "base:0";
      s.units = [u];
      const energy = s.players[0].energy;
      const hand = s.players[0].hand.length;
      s = conquer(s, "winner");
      expect(s.players[0].energy).toBe(energy - 1);
      if (id === "sfd-220-221")
        expect(
          s.gears.some(
            (g) => getCard(g.cardId).name.startsWith("Gold") && !g.ready,
          ),
        ).toBe(true);
      else expect(s.players[0].hand).toHaveLength(hand + 1);
    }
  });
  it("Veiled Temple can ready and optionally detach attached equipment after conquest", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.fields[0].cardId = "sfd-221-221";
    const u = unit("winner", "sfd-099-221");
    u.ready = true;
    u.location = "base:0";
    u.gear = ["sword"];
    s.units = [u];
    s.gears = [
      {
        id: "sword",
        cardId: "sfd-095-221",
        owner: 0,
        ready: false,
        attachedTo: "winner",
      },
    ];
    s = conquer(s, "winner");
    expect(s.gears[0].ready).toBe(true);
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.units[0].gear).toEqual([]);
  });
  it("Repeat pays its extra energy and resolves Frigid Touch twice within one spell chain item", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("enemy", "ogn-142-298", 1)];
    s.players[0].hand = ["sfd-066-221"];
    const energy = s.players[0].energy;
    const before = getMight(s, s.units[0]);
    s = take(
      s,
      (a) =>
        a.cardId === "sfd-066-221" &&
        a.targetId === "enemy" &&
        a.id.includes("|repeat:"),
    );
    expect(s.stack).toHaveLength(1);
    s = settle(s);
    expect(getMight(s, s.units[0])).toBe(before - 4);
    expect(s.players[0].energy).toBe(
      energy - (getCard("sfd-066-221").energy ?? 0) - 2,
    );
  });
  it("repeating Danger Zone charges one extra rainbow power and grants two total Might to each Mech", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("mech", "sfd-062-221"), unit("poro", "sfd-099-221")];
    s.players[0].hand = ["sfd-182-221"];
    const runes = s.players[0].runes.length;
    const before = getMight(s, s.units[0]);
    s = take(s, (a) => a.cardId === "sfd-182-221" && a.id.includes("|repeat:"));
    s = settle(s);
    expect(getMight(s, s.units[0])).toBe(before + 2);
    expect(s.units[1].temporaryMight).toBe(0);
    expect(s.players[0].runes).toHaveLength(
      runes - (getCard("sfd-182-221").power ?? 0) - 1,
    );
  });
  it("multiple Forecasters grant separately resolvable Vision instances", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("one", "sfd-065-221"), unit("two", "sfd-065-221")];
    s = cast(s, "sfd-007-221", undefined, "base:0");
    expect(
      s.stack.filter((x) => x.effects.some((e) => e.type === "predict")),
    ).toHaveLength(2);
  });
  it("Fiora Peerless is a respondable trigger and snapshots Might when it resolves", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const f = unit("fiora", "sfd-110-221"),
      enemy = unit("enemy", "ogn-142-298", 1);
    f.location = "base:0";
    f.ready = true;
    s.units = [f, enemy];
    s.fields[0].controller = 1;
    s = take(
      s,
      (a) =>
        a.id.startsWith("move-start:") &&
        a.sourceId === f.id &&
        a.locationId === "field:0",
    );
    s = take(s, (a) => a.id === "move-confirm");
    expect(
      s.stack.some((x) => x.effects.some((e) => e.custom === "sfd:peerless")),
    ).toBe(true);
    expect(getMight(s, s.units[0])).toBe(3);
    s = cast(s, "sfd-066-221", "fiora");
    s = settle(s);
    expect(
      getMight(
        s,
        s.units.find((u) => u.id === "fiora")!,
      ),
    ).toBe(2);
  });
  it("Weaponmaster moves attached equipment by choice and Long Sword attaches at Reaction speed", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const old = unit("old", "sfd-099-221");
    old.gear = ["blade"];
    s.units = [old];
    s.gears = [
      {
        id: "blade",
        cardId: "sfd-095-221",
        owner: 0,
        ready: true,
        attachedTo: old.id,
      },
    ];
    const runes = s.players[0].runes.length;
    s = cast(s, "sfd-099-221", undefined, "base:0");
    s = settle(s);
    const fresh = s.units.find((u) => u.id !== old.id)!;
    expect(s.gears[0].attachedTo).toBe(fresh.id);
    expect(s.units.find((u) => u.id === old.id)?.gear).toEqual([]);
    expect(s.players[0].runes).toHaveLength(runes);
    s.stack = [
      {
        id: "incoming",
        cardId: "ogn-005-298",
        player: 1,
        kind: "spell",
        effects: [{ type: "damage", amount: 1, target: "anyUnit" }],
        targetId: old.id,
      },
    ];
    s = cast(s, "sfd-022-221");
    s = settle(s);
    expect(
      s.gears.some(
        (g) => g.cardId === "sfd-022-221" && g.attachedTo === old.id,
      ),
    ).toBe(true);
  });
  it("Royal Guard plays its Sand Soldier in the same location", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.fields[0].controller = 0;
    s.units = [unit("keeper", "sfd-099-221")];
    s = cast(s, "sfd-157-221", undefined, "field:0");
    s = settle(s);
    expect(
      s.units.some(
        (u) =>
          getCard(u.cardId).name === "Sand Soldier" && u.location === "field:0",
      ),
    ).toBe(true);
  });
  it("Strike Down fixes its duel targets and detaches the chosen equipment after dealing Might damage", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const friendly = unit("friend", "sfd-099-221"),
      enemy = unit("enemy", "ogn-142-298", 1);
    friendly.gear = ["blade"];
    s.units = [friendly, enemy];
    s.gears = [
      {
        id: "blade",
        cardId: "sfd-095-221",
        owner: 0,
        ready: true,
        attachedTo: "friend",
      },
    ];
    s = cast(s, "sfd-107-221", "friend~enemy");
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(4);
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.units.find((u) => u.id === "friend")?.gear).toEqual([]);
  });
  it("Show of Strength draws for friendly Mighty units through spell resolution", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [
      unit("a", "ogn-142-298"),
      unit("b", "sfd-021-221"),
      unit("enemy", "ogn-142-298", 1),
    ];
    const cards = s.players[0].deck.length;
    s = cast(s, "sfd-106-221");
    s = settle(s);
    expect(s.players[0].deck).toHaveLength(cards - 2);
  });
  it("Assembly Rig pays and recycles before its token creation can resolve", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.gears = [{ id: "rig", cardId: "sfd-019-221", owner: 0, ready: true }];
    s.players[0].discard = ["sfd-062-221"];
    const energy = s.players[0].energy;
    s = take(s, (a) => a.id.startsWith("sfd-assembly|"));
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].discard).toEqual([]);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].energy).toBe(energy - 1);
    s = settle(s);
    expect(s.units.some((u) => getCard(u.cardId).name === "Mech")).toBe(true);
  });
  it("Plundering Poro creates exhausted Gold on conquest and Rumble Scrapper creates a Mech on hold", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const poro = unit("poro", "sfd-069-221");
    poro.location = "base:0";
    poro.ready = true;
    s.units = [poro];
    s = conquer(s, poro.id);
    expect(
      s.gears.some(
        (g) => getCard(g.cardId).name.startsWith("Gold") && !g.ready,
      ),
    ).toBe(true);
    s.units = [unit("scrapper", "sfd-089-221")];
    s.fields[0].controller = 0;
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.players[0].scoredFieldsThisTurn = [];
    s = take(s, (a) => a.id === "end-turn");
    s = settle(s);
    expect(
      s.units.some(
        (u) => getCard(u.cardId).name === "Mech" && u.location === "base:0",
      ),
    ).toBe(true);
  });
  it("Ornns Forge gives one discount across consecutive gear plays", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.units = [unit("keeper", "sfd-099-221")];
    s.fields[0] = { id: "field:0", cardId: "sfd-213-221", controller: 0 };
    const energy = s.players[0].energy;
    s = cast(s, "sfd-095-221");
    s = cast(s, "sfd-161-221");
    expect(s.players[0].energy).toBe(
      energy -
        (getCard("sfd-095-221").energy ?? 0) -
        (getCard("sfd-161-221").energy ?? 0) +
        1,
    );
  });
  it("Ravenbloom Conservatory reveals the defenders top card and takes spells or recycles units", () => {
    for (const top of ["ogn-005-298", "sfd-099-221"]) {
      let s = position();
      s.players[0].legendId = "sfd-181-221";
      s.fields[0] = { id: "field:0", cardId: "sfd-215-221", controller: 1 };
      const attacker = unit("attacker", "sfd-099-221");
      attacker.location = "base:0";
      attacker.ready = true;
      s.units = [attacker, unit("defender", "sfd-099-221", 1)];
      s.players[1].deck = [top, ...s.players[1].deck];
      s = take(
        s,
        (a) =>
          a.id.startsWith("move-start:") &&
          a.sourceId === attacker.id &&
          a.locationId === "field:0",
      );
      s = take(s, (a) => a.id === "move-confirm");
      s = settle(s);
      if (getCard(top).type === "Spell")
        expect(s.players[1].hand).toContain(top);
      else expect(s.players[1].deck.at(-1)).toBe(top);
    }
  });
  it("Repeat chooses distinct targets before response and pays Deflect once for each target selection", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    const a = unit("a", "ogn-142-298", 1),
      b = unit("b", "ogn-142-298", 1);
    a.temporaryKeywords = ["Deflect"];
    b.temporaryKeywords = ["Deflect"];
    s.units = [a, b];
    s.players[0].hand = ["sfd-066-221"];
    const runes = s.players[0].runes.length;
    s = take(
      s,
      (x) =>
        x.cardId === "sfd-066-221" &&
        x.targetId === "a" &&
        x.repeatedTargetId === "b",
    );
    expect(s.stack).toHaveLength(1);
    expect(s.players[0].runes).toHaveLength(runes - 2);
    s = settle(s);
    expect(s.units.map((u) => u.temporaryMight)).toEqual([-2, -2]);
    s = position();
    s.players[0].legendId = "sfd-181-221";
    const c = unit("c", "ogn-142-298", 1);
    c.temporaryKeywords = ["Deflect"];
    s.units = [c];
    s.players[0].hand = ["sfd-066-221"];
    const before = s.players[0].runes.length;
    s = take(
      s,
      (x) =>
        x.cardId === "sfd-066-221" &&
        x.targetId === "c" &&
        x.repeatedTargetId === "c",
    );
    expect(s.players[0].runes).toHaveLength(before - 2);
  });
  it("Minefield burns without drawing and completes remaining cards after Burn Out", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.fields[0].cardId = "sfd-212-221";
    const u = unit("winner", "sfd-099-221");
    u.ready = true;
    u.location = "base:0";
    s.units = [u];
    s.players[0].deck = ["sfd-099-221"];
    s.players[0].discard = ["sfd-095-221", "sfd-161-221"];
    const hand = [...s.players[0].hand],
      points = s.players[1].points;
    s = conquer(s, u.id);
    expect(s.players[0].hand).toEqual(hand);
    expect(s.players[0].deck).toHaveLength(2);
    expect(s.players[0].discard).toHaveLength(1);
    expect(s.players[1].points).toBe(points + 1);
  });
  it("Weaponmaster reduces the Power cost but still pays Hextech Gauntlets remaining equip Energy", () => {
    let s = position();
    s.players[0].legendId = "sfd-181-221";
    s.gears = [{ id: "gloves", cardId: "unl-188-219", owner: 0, ready: true }];
    const energy = s.players[0].energy,
      runes = s.players[0].runes.length;
    s = cast(s, "sfd-099-221", undefined, "base:0");
    s = settle(s);
    expect(s.gears[0].attachedTo).toBe(s.units[0].id);
    expect(s.players[0].energy).toBe(
      energy - (getCard("sfd-099-221").energy ?? 0) - 1,
    );
    expect(s.players[0].runes).toHaveLength(runes);
  });
});
