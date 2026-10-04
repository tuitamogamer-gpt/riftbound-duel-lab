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
import { cardWave6Scripts } from "../src/game/card-wave6";
import {
  canPlayCard,
  getVictoryScore,
  playerTurnNumber,
} from "../src/game/board-rules";
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

const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function endTurn(s: GameState) {
  return settle(
    applyAction(
      s,
      getLegalActions(s, s.priorityPlayer).find((a) => a.id === "end-turn")!,
    ),
  );
}
function effect(
  s: GameState,
  effects: GameState["stack"][number]["effects"],
  p: PlayerId = 0,
) {
  s.stack.push({
    id: "fixture",
    player: p,
    cardId: ogn(29),
    kind: "trigger",
    effects,
  });
  return settle(s);
}
function playAt(
  s: GameState,
  cardId: string,
  locationId: GameAction["locationId"],
  choose?: Chooser,
) {
  s.players[0].hand.push(cardId);
  return settle(
    applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) =>
          a.cardId === cardId &&
          a.locationId === locationId &&
          !a.id.includes("accelerate"),
      )!,
    ),
    choose,
  );
}
describe("sixth wave: declarations, restrictions and shared costs", () => {
  it("registers every new explicit printing without substituting blank effects", () => {
    for (const [id, sc] of Object.entries(cardWave6Scripts))
      expect(getScript(id)).toEqual(sc);
  });
  it("Brynhir prohibits opponent card plays, allows tokens and abilities, and expires next turn", () => {
    let s = play(fixture(), ogn(26));
    s.priorityPlayer = s.currentPlayer = s.focusPlayer = 1;
    s.players[1].hand = [ogn(49), ogn(29)];
    s.players[1].legendId = ogn(259);
    s.units.push(unit(ogn(49), 1));
    expect(getLegalActions(s, 1).filter((a) => a.category === "play")).toEqual(
      [],
    );
    expect(getLegalActions(s, 1).some((a) => a.category === "ability")).toBe(
      true,
    );
    s = deserializeGame(serializeGame(s))!;
    s = effect(
      s,
      [{ type: "token", cardName: "Recruit", location: "base" }],
      1,
    );
    expect(s.units.some((u) => u.owner === 1 && u.token)).toBe(true);
    s.turn++;
    expect(getLegalActions(s, 1).some((a) => a.category === "play")).toBe(true);
  });
  it("Rockfall rejects unit cards and token placements but permits moves", () => {
    let s = fixture();
    s.fields[0].cardId = sfd(216);
    s.fields[0].controller = 0;
    s.players[0].hand = [ogn(49)];
    s.units = [unit(ogn(49))];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "play" && a.locationId === "field:0",
      ),
    ).toBe(false);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.category === "move" && a.locationId === "field:0",
      ),
    ).toBe(true);
    s = effect(s, [{ type: "token", cardName: "Recruit", location: "here" }]);
    // No explicit location means base, which stays legal.
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
    s.stack.push({
      id: "rock",
      player: 0,
      cardId: ogn(29),
      locationId: "field:0",
      kind: "trigger",
      effects: [{ type: "token", cardName: "Recruit", location: "here" }],
    });
    s = settle(s);
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
    expect(canPlayCard(s, 0, getCard(ogn(49)), "field:0")).toBe(false);
  });
  it.each([0, 1] as const)(
    "Ol' Poro counts each player's own turns (%s)",
    (p) => {
      const s = fixture();
      s.currentPlayer = s.priorityPlayer = s.focusPlayer = p;
      s.players[p].hand = [ven(29)];
      for (const turn of [1, 2, 3, 4, 5, 6]) {
        s.turn = turn;
        expect(playerTurnNumber(s, p)).toBe(Math.floor((turn + 1) / 2));
        expect(getLegalActions(s, p).some((a) => a.cardId === ven(29))).toBe(
          false,
        );
      }
      s.turn = 7;
      expect(getLegalActions(s, p).some((a) => a.cardId === ven(29))).toBe(
        true,
      );
    },
  );
  it("Blitzcrank's optional pull works only when played to a battlefield", () => {
    let s = fixture();
    const enemy = unit(ogn(49), 1);
    s.units = [enemy];
    s.fields[0].controller = 0;
    s = playAt(s, ogn(67), "field:0", (a) =>
      a.find((a) => a.targetId === enemy.id),
    );
    expect(s.units.find((u) => u.id === enemy.id)?.location).toBe("field:0");
    const base = play(fixture(), ogn(67));
    expect(base.pendingChoice).toBeNull();
  });
  it("Blitzcrank returns itself on hold", () => {
    let s = fixture();
    const u = unit(ogn(67), 1);
    u.location = "field:0";
    s.units = [u];
    s.fields[0].controller = 1;
    s = endTurn(s);
    expect(s.players[1].hand).toContain(ogn(67));
    expect(s.units.some((v) => v.id === u.id)).toBe(false);
  });
  it("Karthus duplicates Deathknell even when it dies in the same damage event", () => {
    let s = fixture();
    s.units = [unit(ogn(236)), unit(ogn(96))];
    s.units.forEach((u) => (u.location = "field:0"));
    s = effect(s, [
      {
        type: "damageAll",
        amount: 30,
        who: "all",
        condition: "allBattlefields",
      },
    ]);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("two Karthus add two triggers, rather than multiplying each other's effects", () => {
    let s = fixture();
    const v = unit(ogn(96));
    s.units = [unit(ogn(236)), unit(ogn(236), 0, "two"), v];
    s = play(s, ogn(229), v.id);
    expect(s.players[0].hand).toHaveLength(3);
  });
  it("Aspirant's Climb updates victory and last-point replacement", () => {
    let s = fixture();
    s.fields[0].cardId = ogn(276);
    s.players[0].points = 7;
    expect(getVictoryScore(s)).toBe(9);
    s = effect(s, [{ type: "score" }]);
    expect(s.winner).toBeNull();
    expect(s.players[0].points).toBe(8);
    s = effect(s, [{ type: "score" }]);
    expect(s.winner).toBe(0);
  });
  it("Forgotten Monument withholds early points while preserving hold effects", () => {
    let s = fixture();
    s.turn = 1;
    s.fields[0].cardId = sfd(209);
    s.fields[0].controller = 1;
    const u = unit(sfd(89), 1);
    u.location = "field:0";
    s.units = [u];
    s = endTurn(s);
    expect(s.players[1].points).toBe(0);
    expect(s.units.some((u) => u.token)).toBe(true);
    s.turn = 5;
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
    s = endTurn(s);
    expect(s.players[1].points).toBe(1);
  });
  it("Sandstone Chimera limits the Channel Phase to one rune, not channel effects", () => {
    let s = fixture();
    const u = unit(ven(36));
    u.location = "field:0";
    s.units = [u];
    s = endTurn(s);
    expect(s.players[1].runes).toHaveLength(1);
    s = effect(s, [{ type: "channel", amount: 2 }], 1);
    expect(s.players[1].runes).toHaveLength(3);
  });
  it("Marai Spire discounts the Repeat payment and preserves colored Power", () => {
    let s = fixture();
    s.fields[0].cardId = sfd(211);
    s.fields[0].controller = 0;
    const u = unit(ogn(49), 1);
    u.baseMightOverride = 15;
    s.units = [u];
    s.players[0].hand = [sfd(66)];
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === sfd(66) &&
        a.repeated &&
        a.targetId === u.id &&
        a.repeatedTargetId === u.id,
    )!;
    expect(a).toBeDefined();
    const cost = getCard(sfd(66)).energy! + 1;
    s = applyAction(s, a);
    expect(s.players[0].energy).toBe(30 - cost);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(-4);
  });
  it("Helm taxes Hidden spells after their base cost is ignored", () => {
    const s = fixture();
    s.gears = [
      { id: "helm", cardId: ven(45), owner: 1, ready: true, empowered: true },
    ];
    const u = unit(ogn(49));
    u.location = "field:0";
    s.units = [u];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "h",
        cardId: unl(13),
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    const a = getLegalActions(s, 0).find((a) => a.sourceId === "hidden:h")!;
    expect(a.detail).toBe("1 energy · 1 power");
    const end = applyAction(s, a);
    expect(end.players[0].energy).toBe(29);
    expect(end.players[0].power).toBe(29);
  });
  it("Applied Researchers reduces spell costs with a one-Energy floor and can be empowered only once", () => {
    let s = fixture();
    s.units = [unit(ven(55))];
    s.players[0].hand = [ogn(29)];
    const empower = getLegalActions(s, 0).find((a) => a.cardId === ven(55))!;
    s = settle(applyAction(s, empower));
    expect(s.units[0].empowered).toBe(true);
    expect(getLegalActions(s, 0).some((a) => a.cardId === ven(55))).toBe(false);
    s.units.push({ ...unit(ven(55), 0, "second"), empowered: true });
    s.players[0].hand = [ogn(58)];
    const a = getLegalActions(s, 0).find((a) => a.cardId === ogn(58))!;
    expect(a.detail).toBe("1 energy · 0 power");
  });
  it("Heisho suppresses Deflect only at its own battlefield", () => {
    const s = fixture();
    const u = unit(ogn(161), 1);
    u.location = "field:0";
    s.units = [u];
    s.fields[0].cardId = ven(158);
    s.players[0].hand = [ogn(29)];
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === ogn(29) && a.targetId === `${u.id}~${u.id}`,
    )!;
    expect(a.detail).toContain(`${getCard(ogn(29)).power ?? 0} power`);
    u.location = "field:1";
    expect(
      getLegalActions(s, 0).find((x) => x.targetId === a.targetId)?.detail,
    ).toContain(`${(getCard(ogn(29)).power ?? 0) + 2} power`);
  });
  it("Mystic Vortex charges a universal Power for Hidden reactions in its showdown", () => {
    const s = fixture(),
      a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s.fields[0].cardId = ven(160);
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "h",
        cardId: unl(13),
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: false,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(
      getLegalActions(s, 0).find((a) => a.sourceId === "hidden:h")?.detail,
    ).toBe("0 energy · 1 power");
  });
  it("Sandswept Tomb discounts once even when a friendly target there is chosen twice", () => {
    const s = fixture(),
      a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s.fields[0].cardId = ven(164);
    s.players[0].hand = [ogn(29)];
    expect(
      getLegalActions(s, 0).find((x) => x.targetId === `${a.id}~${a.id}`)
        ?.detail,
    ).toContain(`${Math.max(0, (getCard(ogn(29)).power ?? 0) - 1)} power`);
  });
  it("Stargazer discounts spell Flow, leaves colored costs intact, and respects the floor", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.baseMightOverride = 9;
    s.units = [
      a,
      b,
      unit(ven(98)),
      unit(ven(98), 0, "second"),
      unit(ven(98), 0, "third"),
    ];
    s.players[0].discard = [ven(154)];
    const action = getLegalActions(s, 0).find(
      (x) => x.sourceId === "trash:0" && x.targetId === `${a.id}~${b.id}`,
    )!;
    expect(action.detail).toBe("1 energy · 2 power");
    s = settle(applyAction(s, action));
    expect(s.players[0].banished).toContain(ven(154));
    expect(s.units.some((u) => u.id === b.id)).toBe(false);
  });
  it("Stormbringer declares its battlefield, hits enemies without targeting them, and moves the friendly source", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.baseMightOverride = 2;
    b.location = "field:0";
    b.baseMightOverride = 12;
    b.untargetableByEnemy = true;
    s.units = [a, b];
    s = startPlay(s, ogn(250), `${a.id}~field:0`);
    expect(s.stack.at(-1)?.targetId).toBe(`${a.id}~field:0`);
    s = settle(deserializeGame(serializeGame(s))!);
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(2);
    expect(s.units.find((u) => u.id === a.id)?.location).toBe("field:0");
  });
  it("Showstopper buffs its base unit then moves it to the declared battlefield", () => {
    let s = fixture(),
      a = unit(ogn(49));
    s.units = [a];
    s = play(s, ogn(270), `${a.id}~field:1`);
    expect(s.units[0].buff).toBe(1);
    expect(s.units[0].location).toBe("field:1");
  });
  it("Showstopper cannot follow a target that leaves base before resolution", () => {
    let s = fixture(),
      a = unit(ogn(49));
    s.units = [a];
    s = startPlay(s, ogn(270), `${a.id}~field:1`);
    s.units[0].location = "field:0";
    s = settle(s);
    expect(s.units[0].buff).toBe(0);
    expect(s.units[0].location).toBe("field:0");
  });
  it("Yasuo declares the destination before reactions and only moves to or from base", () => {
    let s = fixture(),
      a = unit(ogn(49));
    s.players[0].legendId = ogn(259);
    s.units = [a];
    let action = getLegalActions(s, 0).find(
      (x) => x.sourceId === "legend" && x.targetId === `${a.id}~field:0`,
    )!;
    s = settle(applyAction(s, action));
    expect(s.units[0].location).toBe("field:0");
    s.players[0].legendUsedTurn = -1;
    expect(
      getLegalActions(s, 0)
        .filter((x) => x.sourceId === "legend")
        .every((x) => x.targetId?.endsWith("~base:0")),
    ).toBe(true);
  });
  it("Beast Below chooses both units before reactions, excludes itself, and resolves surviving targets", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    s.units = [a, b, unit(ogn(49), 0, "other")];
    s = startPlay(s, sfd(132));
    while (!s.pendingChoice)
      s = applyAction(
        s,
        getLegalActions(s, s.priorityPlayer).find(
          (a) => a.category === "pass",
        )!,
      );
    const beast = s.units.find((u) => u.cardId === sfd(132))!;
    const actions = getLegalActions(s, 0);
    expect(actions.some((a) => a.targetId?.includes(beast.id))).toBe(false);
    s = applyAction(
      s,
      actions.find((x) => x.targetId === `${a.id}~${b.id}`)!,
    );
    s.units = s.units.filter((u) => u.id !== a.id);
    s = settle(s);
    expect(s.players[1].hand).toContain(b.cardId);
  });
  it("Piercing Light has an optional distinct second target and independently revalidates both", () => {
    let s = fixture(),
      a = unit(ogn(49), 1),
      b = unit(ogn(49), 1, "b");
    a.location = "field:0";
    a.baseMightOverride = b.baseMightOverride = 12;
    s.units = [a, b];
    s = startPlay(s, sfd(23), `${a.id}~${b.id}`);
    s.units[0].location = "base:1";
    s = settle(s);
    expect(s.units.map((u) => u.damage)).toEqual([0, 2]);
  });
  it("Temptation rechecks whether the destination still has a unit with the same controller", () => {
    let s = fixture(),
      a = unit(ogn(49), 1),
      b = unit(ogn(49), 1, "b");
    b.location = "field:0";
    s.units = [a, b];
    s = startPlay(s, sfd(129), `${a.id}~field:0`);
    s.units = s.units.filter((u) => u.id !== b.id);
    s = settle(s);
    expect(s.units[0].location).toBe("base:1");
  });
  it("Stare Down moves weaker enemies without choosing them and always gains XP", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1),
      c = unit(ogn(49), 1, "c");
    a.baseMightOverride = 5;
    b.baseMightOverride = 2;
    c.baseMightOverride = 6;
    b.location = c.location = "field:0";
    b.untargetableByEnemy = true;
    s.units = [a, b, c];
    s = play(s, unl(107), `${a.id}~field:0`);
    expect(s.units.find((u) => u.id === b.id)?.location).toBe("base:1");
    expect(s.units.find((u) => u.id === c.id)?.location).toBe("field:0");
    expect(s.players[0].xp).toBe(1);
  });
  it("Moonfall allows no enemy target, but requires a battlefield with a friendly unit", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.location = b.location = "field:0";
    b.baseMightOverride = 9;
    s.units = [a, b];
    s = play(s, unl(198), "field:0");
    expect(s.units.find((u) => u.id === b.id)?.temporaryMight).toBe(-2);
  });
  it("Bellows Breath chooses up to three units at one location and charges all Deflect taxes before responses", () => {
    let s = fixture();
    const units = [unit(ogn(161), 1), unit(ogn(161), 1, "b"), unit(ogn(49), 0)];
    units.forEach((u) => {
      u.location = "field:0";
      u.baseMightOverride = 12;
    });
    s.units = units;
    s = startPlay(s, sfd(80), units.map((u) => u.id).join("~"));
    expect(s.players[0].power).toBe(30 - (getCard(sfd(80)).power ?? 0) - 2);
    s = settle(s);
    expect(s.units.map((u) => u.damage)).toEqual([1, 1, 1]);
  });
  it("Fae Dragon buffs up to four friends, never an enemy, and reacts to spent buffs", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    s.units = [a, b];
    s = play(s, sfd(101), undefined, (actions) =>
      actions.find((x) => x.targetId === a.id),
    );
    expect(s.units.find((u) => u.id === a.id)?.buff).toBe(1);
    expect(s.units.find((u) => u.id === b.id)?.buff).toBe(0);
    const spender = unit(ogn(157));
    spender.buff = 1;
    spender.ready = false;
    s.units.push(spender);
    const spend = getLegalActions(s, 0).find(
      (x) =>
        x.sourceId === spender.id && x.label.includes("Spend buff: ready Udyr"),
    );
    expect(spend).toBeDefined();
    s = settle(applyAction(s, spend!));
    expect(s.units.find((u) => u.id === spender.id)?.buff).toBe(0);
    expect(s.gears.some((g) => g.cardId === "sfd-t03" && !g.ready)).toBe(true);
  });
  it("Public Execution refuses targets that stop being weaker", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.baseMightOverride = 5;
    b.baseMightOverride = 2;
    s.units = [a, b];
    s = startPlay(s, ven(154), `${a.id}~${b.id}`);
    s.units[1].baseMightOverride = 8;
    s = settle(s);
    expect(s.units).toHaveLength(2);
  });
  it("Bellows selects a legal subset of the original targets after they separate, and restores that choice", () => {
    let s = fixture(),
      a = unit(ogn(49), 1),
      b = unit(ogn(49), 1, "b"),
      c = unit(ogn(49), 1, "c");
    [a, b, c].forEach((u) => {
      u.location = "field:0";
      u.baseMightOverride = 10;
    });
    s.units = [a, b, c];
    s = startPlay(s, sfd(80), `${a.id}~${b.id}~${c.id}`);
    s.units[2].location = "field:1";
    while (!s.pendingChoice) s = applyAction(s, "pass");
    expect(s.pendingChoice?.kind).toBe("custom");
    s = deserializeGame(serializeGame(s))!;
    expect(s).not.toBeNull();
    const choices = getLegalActions(s, 0);
    expect(choices.some((x) => x.targetId === `${a.id}~${c.id}`)).toBe(false);
    s = settle(
      applyAction(
        s,
        choices.find((x) => x.targetId === `${a.id}~${b.id}`)!,
      ),
    );
    expect(s.units.map((u) => u.damage)).toEqual([1, 1, 0]);
  });
  it("Bellows ignores a newly untargetable unit without losing its other legal targets", () => {
    let s = fixture(),
      a = unit(ogn(49), 1),
      b = unit(ogn(49), 1, "b");
    s.units = [a, b];
    s = startPlay(s, sfd(80), `${a.id}~${b.id}`);
    s.units[1].untargetableByEnemy = true;
    s = settle(s);
    expect(s.units.map((u) => u.damage)).toEqual([1, 0]);
  });
  it("Researchers and Eager Apprentice apply their shared Energy floor before unrestricted reductions", () => {
    let s = fixture(),
      researcher = unit(ven(55)),
      apprentice = unit(ogn(84));
    researcher.empowered = true;
    apprentice.location = "field:0";
    s.units = [researcher, apprentice];
    s.players[0].hand = [ogn(58)];
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === ogn(58) && a.targetId === researcher.id,
    )!;
    expect(a.detail).toBe("1 energy · 0 power");
    s = applyAction(s, a);
    expect(s.players[0].energy).toBe(29);
  });
  it("Researchers discount Repeat Energy and colored Power after the extra cost is added", () => {
    let s = fixture(),
      researcher = unit(ven(55));
    researcher.empowered = true;
    s.units = [researcher];
    s.players[0].hand = [sfd(80)];
    s.players[0].power = 0;
    s.players[0].typedPower = { Mind: 1 };
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === sfd(80) &&
        a.repeated &&
        !a.targetId &&
        !a.repeatedTargetId,
    )!;
    expect(a.detail).toBe("1 energy · 1 power");
    s = settle(applyAction(s, a));
    expect(s.players[0].typedPower?.Mind).toBe(0);
    expect(s.players[0].energy).toBe(29);
  });
  it("Researchers can discount a Deflect surcharge on a zero-Power spell", () => {
    let s = fixture(),
      researcher = unit(ven(55)),
      enemy = unit(ogn(161), 1);
    researcher.empowered = true;
    s.units = [researcher, enemy];
    s.players[0].hand = [ogn(58)];
    s.players[0].power = 0;
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === ogn(58) && a.targetId === enemy.id,
    )!;
    expect(a.detail).toBe("1 energy · 0 power");
    expect(() => applyAction(s, a)).not.toThrow();
  });
  it("Sandswept considers the Repeat target even when only repeating makes the spell affordable", () => {
    let s = fixture(),
      a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s.fields[0].cardId = ven(164);
    s.players[0].hand = [sfd(80)];
    s.players[0].power = 1;
    // Base Bellows chooses nothing; the repeat alone chooses a friend at the Tomb.
    const action = getLegalActions(s, 0).find(
      (x) =>
        x.cardId === sfd(80) &&
        x.repeated &&
        !x.targetId &&
        x.repeatedTargetId === a.id,
    )!;
    expect(action.detail).toBe("2 energy · 1 power");
    s = settle(applyAction(s, action));
    expect(s.players[0].power).toBe(0);
    expect(s.units[0].damage).toBe(1);
  });
  it("Mystic Vortex also taxes Ambush units at a battlefield", () => {
    let s = fixture(),
      a = unit(ogn(49));
    a.location = "field:0";
    s.units = [a];
    s.fields[0].cardId = ven(160);
    s.fields[0].controller = 0;
    s.players[0].hand = [unl(2)];
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: false,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    const action = getLegalActions(s, 0).find(
      (x) => x.cardId === unl(2) && x.locationId === "field:0",
    )!;
    expect(action.detail).toBe("2 energy · 1 power");
    s = applyAction(s, action);
    expect(s.players[0].power).toBe(29);
  });
  it("Imposing Challenger moves a weaker enemy to its declared other battlefield", () => {
    let s = fixture(),
      a = unit(unl(105)),
      b = unit(ogn(49), 1);
    a.baseMightOverride = 10;
    b.location = "field:0";
    s.units = [a, b];
    s = play(s, ogn(270), `${a.id}~field:0`, (choices) =>
      choices.find((x) => x.targetId === `${b.id}~field:1`),
    );
    expect(s.units.find((u) => u.id === b.id)?.location).toBe("field:1");
  });
  it("Riven counts Equipment still attached when her attack trigger resolves", () => {
    let s = fixture(),
      a = unit(ven(41)),
      b = unit(ogn(49), 1);
    b.location = "field:0";
    b.baseMightOverride = 20;
    a.gear = ["gear-a", "gear-b"];
    s.units = [a, b];
    s.gears = a.gear.map((id) => ({
      id,
      cardId: sfd(1),
      owner: 0 as const,
      ready: true,
      attachedTo: a.id,
    }));
    s = play(s, ogn(270), `${a.id}~field:0`);
    expect(s.units.find((u) => u.id === b.id)?.damage).toBe(4);
  });
  it("Decree of Focus checks enemy Fury spell choices and rechecks when the threat disappears", () => {
    let s = fixture(),
      a = unit(ogn(49));
    s.units = [a];
    s.stack = [
      {
        id: "fury",
        kind: "spell",
        cardId: ogn(29),
        player: 1,
        targetId: `${a.id}~${a.id}`,
        effects: [],
      },
    ];
    s.players[0].hand = [ven(40)];
    const action = getLegalActions(s, 0).find(
      (x) => x.cardId === ven(40) && x.targetId === a.id,
    )!;
    expect(action).toBeDefined();
    let applied = settle(applyAction(s, action));
    expect(applied.units[0].temporaryMight).toBe(4);
    s = applyAction(s, action);
    s.stack = s.stack.filter((item) => item.id !== "fury");
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(0);
  });
  it("Decree of Focus accepts combat with a Fury enemy, but not a nonparticipant", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(1), 1);
    a.location = b.location = "field:0";
    s.units = [a, b];
    s.players[0].hand = [ven(40)];
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: true,
      designatedUnits: [a.id, b.id],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getLegalActions(s, 0).some((x) => x.cardId === ven(40))).toBe(true);
    s.combat.designatedUnits = [a.id];
    expect(getLegalActions(s, 0).some((x) => x.cardId === ven(40))).toBe(false);
  });
  it("move declarations exclude destinations where the chosen unit already is", () => {
    const s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(49), 1);
    a.location = b.location = "field:0";
    s.units = [a, b];
    s.players[0].hand = [sfd(129), unl(198)];
    expect(
      getLegalActions(s, 0).some(
        (x) => x.cardId === sfd(129) && x.targetId === `${b.id}~field:0`,
      ),
    ).toBe(false);
    expect(
      getLegalActions(s, 0).some(
        (x) => x.cardId === unl(198) && x.targetId === `field:0~${b.id}`,
      ),
    ).toBe(false);
  });
  it("Stormbringer damages a Karthus army simultaneously before Deathknell checks", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      k = unit(ogn(236), 1),
      d = unit(ogn(96), 1);
    a.baseMightOverride = 20;
    k.location = d.location = "field:0";
    s.units = [a, k, d];
    s = play(s, ogn(250), `${a.id}~field:0`);
    expect(s.players[1].hand).toHaveLength(2);
  });
  it("Bellows deals its damage simultaneously so a dying Karthus still duplicates Deathknell", () => {
    let s = fixture(),
      k = unit(ogn(236), 1),
      d = unit(ogn(96), 1);
    k.baseMightOverride = d.baseMightOverride = 1;
    s.units = [k, d];
    s = play(s, sfd(80), `${k.id}~${d.id}`);
    expect(s.players[1].hand).toHaveLength(2);
  });
  it("the ninth point at Aspirant's Climb is replaced for a first conquest, then won by holding", () => {
    let s = fixture(),
      a = unit(ogn(49));
    s.fields[0].cardId = ogn(276);
    s.units = [a];
    s.players[0].points = 8;
    s = play(s, ogn(270), `${a.id}~field:0`);
    s = finishCombat(s);
    expect(s.players[0].points).toBe(8);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.winner).toBeNull();
    s = endTurn(s);
    s = endTurn(s);
    expect(s.winner).toBe(0);
    expect(s.players[0].points).toBe(9);
  });
  it("a Repeat target discount can make a play legal when the unrepeated target's tax is unaffordable", () => {
    let s = fixture(),
      a = unit(ogn(49)),
      b = unit(ogn(161), 1);
    a.location = "field:0";
    b.location = "field:1";
    a.baseMightOverride = b.baseMightOverride = 10;
    s.units = [a, b];
    s.fields[0].cardId = ven(164);
    s.fields[1].cardId = sfd(211);
    s.fields[1].controller = 0;
    s.players[0].hand = [sfd(66)];
    s.players[0].power = 0;
    const actions = getLegalActions(s, 0);
    expect(
      actions.some(
        (x) => x.cardId === sfd(66) && x.targetId === b.id && !x.repeated,
      ),
    ).toBe(false);
    const repeated = actions.find(
      (x) =>
        x.cardId === sfd(66) &&
        x.targetId === b.id &&
        x.repeatedTargetId === a.id,
    )!;
    expect(repeated).toBeDefined();
    s = settle(applyAction(s, repeated));
    expect(s.units.map((u) => u.temporaryMight)).toEqual([-2, -2]);
  });
});
