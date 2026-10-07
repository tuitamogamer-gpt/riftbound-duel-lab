import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  applyActionStepped,
  getLegalActions,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { cardRegistry, getScript } from "../src/game/scripts";
import { cardWave12Scripts } from "../src/game/card-wave12";
import { validState } from "../src/persistence";
import { translate } from "../src/i18n";
import { combatUnit, createCombatFixture } from "./fixtures/combat";
import type { GameAction, GameState, PlayerId, Unit } from "../src/game/types";
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
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function options(s: GameState, cardId: string) {
  return getLegalActions(s, s.priorityPlayer).filter(
    (a) => a.category === "play" && a.cardId === cardId,
  );
}
function cast(
  s: GameState,
  cardId: string,
  costSourceId?: string,
  targetId?: string,
) {
  if (!s.players[s.priorityPlayer].hand.includes(cardId))
    s.players[s.priorityPlayer].hand.push(cardId);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      a.costSourceId === costSourceId &&
      (targetId === undefined || a.targetId === targetId),
  );
}
function putGear(
  s: GameState,
  id = "cost",
  cardId = sfd(33),
  owner: PlayerId = 0,
) {
  s.gears.push({ id, cardId, owner, ready: false });
}
function sacrificeState() {
  const s = fixture();
  s.units = [unit("victim", 0, "base:0", 5)];
  s.players[0].hand = [unl(173)];
  return s;
}

describe("twelfth wave: additional board costs", () => {
  it.each(Object.keys(cardWave12Scripts))(
    "registers the complete card %s",
    (id) => {
      expect(cardRegistry[id].status).not.toBe("unsupported");
      expect(getScript(id)?.additionalCost?.board).toBeDefined();
    },
  );
  it("registers the completed resurrection and attached resurrection abilities", () => {
    expect(getScript(unl(142))?.implemented).toBe(true);
    expect(getScript(sfd(150))?.equipment?.onHold).toBeDefined();
  });
  it.each([146, 207])(
    "offers ordinary paid and optional buff-cost plays for OGN %i",
    (n) => {
      let s = fixture();
      s.units = [
        { ...unit("buffed"), buff: 1 },
        { ...unit("target"), ready: false },
      ];
      s.players[0].hand = [ogn(n)];
      expect(options(s, ogn(n)).some((a) => !a.additionalCostPaid)).toBe(true);
      expect(options(s, ogn(n)).some((a) => a.costSourceId === "buffed")).toBe(
        true,
      );
      s = cast(s, ogn(n), undefined, "target");
      expect(s.players[0].energy).toBe(30 - getCard(ogn(n)).energy!);
      expect(s.units[0].buff).toBe(1);
      s = chain(s);
      expect(n === 146 ? s.units[1].ready : s.units[1].temporaryMight).toBe(
        n === 146 ? true : 3,
      );
    },
  );
  it.each([146, 207])(
    "spends exactly one buff before responses and ignores the base cost of OGN %i",
    (n) => {
      let s = fixture();
      s.units = [
        { ...unit("buffed"), buff: 2 },
        { ...unit("target"), ready: false },
      ];
      s.players[0].energy = s.players[0].power = 0;
      s = cast(s, ogn(n), "buffed", "target");
      expect(s.units[0].buff).toBe(1);
      expect(s.units[1].ready).toBe(false);
      expect(s.units[1].temporaryMight).toBe(0);
      expect(s.players[0].energy).toBe(0);
      expect(s.stack.find((x) => x.cardId === ogn(n))?.targetId).toBe("target");
      s = chain(s);
      expect(n === 146 ? s.units[1].ready : s.units[1].temporaryMight).toBe(
        n === 146 ? true : 3,
      );
    },
  );
  it("can spend the targeted unit's own buff without treating the payment as another target", () => {
    let s = fixture();
    s.units = [{ ...unit("buffed"), buff: 1, ready: false }];
    s = cast(s, ogn(146), "buffed", "buffed");
    expect(s.units[0].buff).toBe(0);
    s = chain(s);
    expect(s.units[0].ready).toBe(true);
  });
  it("does not spend enemy buffs and cannot waive costs without a friendly buff", () => {
    const s = fixture();
    s.units = [unit("ally"), { ...unit("enemy", 1, "base:1"), buff: 2 }];
    s.players[0].energy = 0;
    s.players[0].hand = [ogn(146), ogn(207)];
    expect(options(s, ogn(146))).toHaveLength(0);
    expect(options(s, ogn(207))).toHaveLength(0);
    s.players[0].energy = 3;
    expect(options(s, ogn(207)).every((a) => !a.costSourceId)).toBe(true);
  });
  it("ignoring the printed cost still pays Deflect and empowered Helm increases", () => {
    let s = fixture();
    s.units = [
      { ...unit("buffed"), buff: 1 },
      { ...unit("enemy", 1, "base:1"), cardId: ogn(13) },
    ];
    s.gears = [
      {
        id: "helm",
        cardId: "ven-045-166",
        owner: 1,
        ready: true,
        empowered: true,
      },
    ];
    s.players[0].hand = [ogn(207)];
    s.players[0].energy = 0;
    s.players[0].power = 2;
    expect(options(s, ogn(207))).toHaveLength(0);
    s.players[0].energy = 1;
    s.players[0].power = 1;
    expect(options(s, ogn(207)).some((a) => a.targetId === "enemy")).toBe(
      false,
    );
    s.players[0].power = 2;
    s = cast(s, ogn(207), "buffed", "enemy");
    expect(s.players[0].energy).toBe(0);
    expect(s.players[0].power).toBe(0);
    expect(s.units[0].buff).toBe(0);
  });
  it("does not raise an ignored base cost to a reduction floor or spend restricted pools unnecessarily", () => {
    let s = fixture();
    s.units = [
      { ...unit("buffed"), buff: 1 },
      { ...unit("researcher", 0, "field:0"), cardId: ogn(84) },
    ];
    s.players[0].energy = 0;
    s.players[0].spellEnergy = 3;
    s.players[0].spellPower = 2;
    s = cast(s, ogn(207), "buffed", "buffed");
    expect(s.players[0].spellEnergy).toBe(3);
    expect(s.players[0].spellPower).toBe(2);
    expect(s.players[0].energy).toBe(0);
  });
  it("permits Call to Glory as a Reaction but keeps Wallop out of a live chain", () => {
    let s = fixture();
    s.currentPlayer = 1;
    s.units = [{ ...unit("buffed"), buff: 1 }];
    s.players[0].energy = 0;
    s.players[0].hand = [ogn(146), ogn(207)];
    s.stack = [
      {
        id: "enemy-spell",
        cardId: ogn(50),
        kind: "spell",
        player: 1,
        targetId: "buffed",
        effects: [{ type: "stun", target: "anyUnit" }],
      },
    ];
    expect(options(s, ogn(146))).toHaveLength(0);
    s = cast(s, ogn(207), "buffed", "buffed");
    expect(s.stack.at(-1)?.cardId).toBe(ogn(207));
    s = chain(s);
    expect(s.units[0].temporaryMight).toBe(3);
    expect(s.units[0].stunned).toBe(true);
  });
  it("a counter does not refund the buff cost", () => {
    let s = fixture();
    s.units = [{ ...unit("buffed"), buff: 1 }];
    s.players[1].hand = [ogn(64)];
    s = cast(s, ogn(207), "buffed", "buffed");
    s = act(s, "pass");
    s = act(s, (a) => a.cardId === ogn(64) && a.category === "play");
    s = chain(s);
    expect(s.units[0].buff).toBe(0);
    expect(s.units[0].temporaryMight).toBe(0);
    expect(s.players[0].discard).toContain(ogn(207));
  });
  it("invalidated effect targets do not substitute another unit or refund the spent buff", () => {
    let s = fixture();
    s.units = [{ ...unit("buffed"), buff: 1 }, unit("target")];
    s = cast(s, ogn(207), "buffed", "target");
    s.units = s.units.filter((u) => u.id !== "target");
    s = chain(s);
    expect(s.units[0].buff).toBe(0);
    expect(s.units[0].temporaryMight).toBe(0);
  });
  it("queues buff-spend triggers above the finalized spell", () => {
    let s = fixture();
    s.units = [
      { ...unit("buffed"), buff: 1 },
      { ...unit("watcher"), cardId: sfd(101) },
    ];
    s = cast(s, ogn(207), "buffed", "buffed");
    expect(s.stack[0].cardId).toBe(ogn(207));
    expect(s.stack[1].cardId).toBe(sfd(101));
    expect(s.gears).toHaveLength(0);
    s = chain(s);
    expect(s.gears.filter((g) => g.cardId === "sfd-t03")).toHaveLength(1);
  });
  it("rejects a stale buff-cost action without mutating the input or substituting another buff", () => {
    const s = fixture();
    s.units = [
      { ...unit("first"), buff: 1 },
      { ...unit("second"), buff: 1 },
    ];
    s.players[0].hand = [ogn(207)];
    const action = options(s, ogn(207)).find(
      (a) => a.costSourceId === "first",
    )!;
    s.units[0].buff = 0;
    const before = serializeGame(s);
    expect(() => applyAction(s, action)).toThrow("Illegal action");
    expect(serializeGame(s)).toBe(before);
  });
  it("Quartermaster cannot be played without its mandatory friendly gear payment", () => {
    const s = fixture();
    s.players[0].hand = [sfd(44)];
    putGear(s, "enemy", sfd(33), 1);
    expect(options(s, sfd(44))).toHaveLength(0);
    putGear(s);
    expect(options(s, sfd(44)).length).toBeGreaterThan(0);
    expect(
      options(s, sfd(44)).every(
        (a) => a.costSourceId === "cost" && a.additionalCostPaid,
      ),
    ).toBe(true);
  });
  it("Quartermaster returns the exact attached gear and preserves the rest of the hand", () => {
    let s = fixture();
    s.units = [unit("ally")];
    s.players[0].hand = [ogn(49), sfd(44), ogn(52)];
    addGear(s, 33, "cost", "ally");
    addGear(s, 33, "other");
    s = cast(s, sfd(44), "cost");
    expect(s.players[0].hand).toEqual([ogn(49), ogn(52), sfd(33)]);
    expect(s.players[0].energy).toBe(27);
    expect(s.gears.map((g) => g.id)).toEqual(["other"]);
    expect(s.units[0].gear).toHaveLength(0);
    expect(s.units.find((u) => u.cardId === sfd(44))?.ready).toBe(false);
    expect(s.players[0].discard).not.toContain(sfd(33));
  });
  it("returning a Gold token pays Quartermaster's cost without putting the token in hand", () => {
    let s = fixture();
    s.gears = [
      { id: "gold", cardId: "sfd-t03", owner: 0, ready: false, token: true },
    ];
    s = cast(s, sfd(44), "gold");
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].discard).toHaveLength(0);
    expect(s.gears).toHaveLength(0);
    expect(s.units[0].cardId).toBe(sfd(44));
  });
  it("returning Might-granting gear performs lethal-damage cleanup after the play is finalized", () => {
    let s = fixture();
    s.units = [{ ...unit("ally", 0, "base:0", 4), damage: 4 }];
    addGear(s, 33, "cost", "ally");
    s = cast(s, sfd(44), "cost");
    expect(s.units.some((u) => u.id === "ally")).toBe(false);
    expect(s.units.some((u) => u.cardId === sfd(44))).toBe(true);
  });
  it("a hand index stays valid when Quartermaster is played from its Champion Zone", () => {
    let s = fixture();
    s.players[0].championId = sfd(44);
    s.players[0].championAvailable = true;
    s.players[0].hand = [ogn(49)];
    putGear(s);
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.sourceId === "champion" &&
        a.costSourceId === "cost",
    );
    expect(s.players[0].hand).toEqual([ogn(49), sfd(33)]);
    expect(s.players[0].championAvailable).toBe(false);
  });
  it("mandatory gear costs apply to Hidden plays too", () => {
    let s = fixture();
    s.hidden = [
      {
        id: "quartermaster",
        cardId: sfd(44),
        owner: 0,
        location: "field:0",
        hiddenTurn: s.turn - 1,
      },
    ];
    s.fields[0].controller = 0;
    s.players[0].energy = 0;
    expect(options(s, sfd(44))).toHaveLength(0);
    putGear(s);
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.sourceId === "hidden:quartermaster" &&
        a.costSourceId === "cost",
    );
    expect(s.players[0].energy).toBe(0);
    expect(s.units[0].location).toBe("field:0");
    expect(s.players[0].hand).toEqual([sfd(33)]);
  });
  it("Zaun Punk's additional kill is optional and its unpaid play has no kill trigger", () => {
    let s = fixture();
    putGear(s, "enemy", sfd(33), 1);
    s = cast(s, sfd(160));
    expect(s.gears).toHaveLength(1);
    expect(s.pendingChoice).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(s.units[0].additionalCostPaid).toBeUndefined();
  });
  it("Zaun Punk kills its cost gear before declaring a different effect target", () => {
    let s = fixture();
    putGear(s);
    putGear(s, "enemy-a", sfd(33), 1);
    putGear(s, "enemy-b", sfd(42), 1);
    s = cast(s, sfd(160), "cost");
    expect(s.gears.some((g) => g.id === "cost")).toBe(false);
    expect(s.players[0].discard).toContain(sfd(33));
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(
      getLegalActions(s, 0)
        .map((a) => a.targetId)
        .sort(),
    ).toEqual(["enemy-a", "enemy-b"]);
    s = act(s, (a) => a.targetId === "enemy-a");
    expect(s.gears).toHaveLength(2);
    s = chain(s);
    expect(s.gears.map((g) => g.id)).toEqual(["enemy-b"]);
  });
  it("Zaun Punk can sacrifice a token and target friendly gear, but not substitute a lost target", () => {
    let s = fixture();
    s.gears = [
      { id: "gold", cardId: "sfd-t03", owner: 0, ready: false, token: true },
    ];
    putGear(s, "friend");
    putGear(s, "other");
    s = cast(s, sfd(160), "gold");
    expect(s.players[0].discard).not.toContain("sfd-t03");
    s = act(s, (a) => a.targetId === "friend");
    s.gears = s.gears.filter((g) => g.id !== "friend");
    s = chain(s);
    expect(s.gears.map((g) => g.id)).toEqual(["other"]);
  });
  it("paid Zaun Punk with no surviving gear still enters play", () => {
    let s = fixture();
    putGear(s);
    s = cast(s, sfd(160), "cost");
    expect(s.units[0].cardId).toBe(sfd(160));
    expect(s.units[0].additionalCostPaid).toBe(true);
    expect(s.pendingChoice).toBeNull();
    expect(s.stack).toHaveLength(0);
  });
  it("Zaun Punk's paid play and unresolved target selection survive save/load", () => {
    let s = fixture();
    putGear(s);
    putGear(s, "one", sfd(33), 1);
    putGear(s, "two", sfd(42), 1);
    s = cast(s, sfd(160), "cost");
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    expect(s.players[0].energy).toBe(27);
    s = chain(act(s, (a) => a.targetId === "two"));
    expect(s.gears.map((g) => g.id)).toEqual(["one"]);
    expect(s.players[0].energy).toBe(27);
  });
  it("Sacrifice requires a currently Mighty friendly unit and checks printed costs separately", () => {
    let s = sacrificeState();
    s.units[0].baseMightOverride = 4;
    s.units.push(unit("enemy", 1, "base:1", 10));
    expect(options(s, unl(173))).toHaveLength(0);
    s.units[0].buff = 1;
    expect(options(s, unl(173)).map((a) => a.costSourceId)).toEqual(["victim"]);
    s.players[0].energy = 0;
    expect(options(s, unl(173))).toHaveLength(0);
  });
  it("Sacrifice counts Equipment Might, kills before responses, then draws twice and channels exhausted", () => {
    let s = sacrificeState();
    s.units[0].baseMightOverride = 4;
    addGear(s, 33, "shield", "victim");
    s = cast(s, unl(173), "victim");
    expect(s.units).toHaveLength(0);
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.players[0].energy).toBe(29);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(0);
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.players[0].runes).toHaveLength(1);
    expect(s.players[0].runes[0].ready).toBe(false);
    expect(s.players[0].discard).toEqual([ogn(49), unl(173)]);
  });
  it("rejects a Mighty cost that recycling a rune would invalidate without mutating the query state", () => {
    let s = sacrificeState();
    s.units[0].cardId = "ogs-004-024";
    s.units[0].baseMightOverride = 4;
    s.players[0].power = 0;
    s.players[0].runes = Array.from({ length: 8 }, (_, i) => ({
      id: `r${i}`,
      domain: "Body",
      ready: true,
    }));
    s.gears.push({
      id: "helm",
      cardId: "ven-045-166",
      owner: 1,
      ready: true,
      empowered: true,
    });
    expect(getMight(s, s.units[0])).toBe(8);
    const before = structuredClone(s);
    expect(options(s, unl(173))).toHaveLength(0);
    expect(s).toEqual(before);
    s.players[0].power = 1;
    s = cast(s, unl(173), "victim");
    expect(s.units).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(8);
    expect(s.players[0].power).toBe(0);
  });
  it("accepts a unit that becomes Mighty from the preceding Power payment", () => {
    let s = sacrificeState();
    s.units[0].cardId = sfd(143);
    s.units[0].baseMightOverride = 3;
    s.players[0].powerSpentThisTurn = 1;
    s.gears.push({
      id: "helm",
      cardId: "ven-045-166",
      owner: 1,
      ready: true,
      empowered: true,
    });
    expect(getMight(s, s.units[0])).toBe(3);
    s = cast(s, unl(173), "victim");
    expect(s.units).toHaveLength(0);
    expect(s.players[0].powerSpentThisTurn).toBe(2);
  });
  it("Sacrifice accepts Mighty tokens and does not place them in trash", () => {
    let s = sacrificeState();
    s.units[0].token = true;
    s = chain(cast(s, unl(173), "victim"));
    expect(s.players[0].discard).toEqual([unl(173)]);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("replacing the cost unit's death still pays Sacrifice under core rule 203.2", () => {
    let s = sacrificeState();
    s.units[0].deathReplacementTurn = s.turn;
    s.units[0].location = "field:0";
    s.units[0].damage = 2;
    s = cast(s, unl(173), "victim");
    expect(s.units[0].location).toBe("base:0");
    expect(s.units[0].ready).toBe(false);
    expect(s.units[0].damage).toBe(0);
    expect(s.players[0].discard).not.toContain(ogn(49));
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("cost death triggers enter above Sacrifice, including direct first-death observers", () => {
    let s = sacrificeState();
    s.units[0].cardId = ogn(96);
    s.units.push({ ...unit("wraith"), cardId: ogn(118) });
    s = cast(s, unl(173), "victim");
    expect(s.stack[0].cardId).toBe(unl(173));
    expect(
      s.stack
        .slice(1)
        .map((x) => x.cardId)
        .sort(),
    ).toEqual([ogn(96), ogn(118)].sort());
    expect(s.players[0].hand).toHaveLength(0);
    s = chain(s);
    expect(s.players[0].hand).toHaveLength(4);
  });
  it("trigger choices caused by a cost open only after Sacrifice is on the chain", () => {
    let s = sacrificeState();
    s.units[0].cardId = unl(67);
    s.units.push(unit("first", 1, "base:1"), unit("second", 1, "base:1"));
    s = cast(s, unl(173), "victim");
    expect(s.stack.some((item) => item.cardId === unl(173))).toBe(true);
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(s.pendingChoice?.cardId).toBe(unl(67));
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    s = chain(act(s, (a) => a.targetId === "second"));
    expect(s.units.find((u) => u.id === "first")?.damage).toBe(0);
    expect(s.units.find((u) => u.id === "second")?.damage).toBe(4);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("Sacrifice's payment stays paid through save/load and a counter", () => {
    let s = sacrificeState();
    s.players[1].hand = [ogn(64)];
    s = cast(s, unl(173), "victim");
    s = deserializeGame(serializeGame(s));
    expect(validState(s)).toBe(true);
    s = act(s, "pass");
    s = act(s, (a) => a.category === "play" && a.cardId === ogn(64));
    s = chain(s);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.players[0].discard).toEqual([ogn(49), unl(173)]);
  });
  it("a stale Mighty payment cannot be accepted after its source shrinks", () => {
    const s = sacrificeState();
    const action = options(s, unl(173))[0];
    s.units[0].baseMightOverride = 4;
    expect(() => applyAction(s, action)).toThrow("Illegal action");
    expect(s.players[0].hand).toEqual([unl(173)]);
  });
  it("stepped presentation finishes in the same state as direct payment", () => {
    const s = sacrificeState();
    const action = options(s, unl(173))[0];
    const direct = applyAction(s, action);
    const stepped = applyActionStepped(s, action);
    expect(stepped.state).toEqual(direct);
    expect(stepped.frames.length).toBeGreaterThan(0);
    expect(stepped.state.players[0].energy).toBe(29);
  });
  it("translates the visible payment source separately from the spell target", () => {
    const label =
      "Play Call to Glory → Stalwart Poro · spend a buff from Lee Sin";
    expect(translate(label, "sr")).toBe(
      "Odigraj Call to Glory → Stalwart Poro · potroši buff sa Lee Sin",
    );
    expect(translate(label, "it")).toBe(
      "Gioca Call to Glory → Stalwart Poro · spendi un buff da Lee Sin",
    );
    expect(
      translate("Additional cost: return to hand Doran's Shield.", "sr"),
    ).toBe("Dodatni trošak: vrati u ruku Doran's Shield.");
    expect(translate("Play Sacrifice · kill Stalwart Poro", "sr")).toBe(
      "Odigraj Sacrifice · ubij Stalwart Poro",
    );
  });
});
