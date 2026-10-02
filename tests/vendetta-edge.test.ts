import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  type GameState,
  type GameAction,
  type Unit,
  type PlayerId,
  type LocationId,
} from "../src/game/engine";
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
function position() {
  const s = createGame({
    playerDeckId: "precon-shen",
    botDeckId: "precon-zed",
    seed: 510,
  });
  s.turn = 5;
  s.phase = "main";
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
  s.units = [];
  s.gears = [];
  s.hidden = [];
  s.stack = [];
  s.pendingChoice = null;
  s.combat = null;
  s.log = [];
  for (const p of s.players) {
    p.hand = [];
    p.discard = [];
    p.banished = [];
    p.deck = Array(20).fill("ogn-142-298");
    p.energy = 20;
    p.championAvailable = false;
    p.hasBegun = true;
    p.runes = [
      "Fury",
      "Calm",
      "Mind",
      "Body",
      "Order",
      "Chaos",
      "Fury",
      "Calm",
      "Mind",
      "Body",
      "Order",
      "Chaos",
    ].map((domain, i) => ({ id: `${p.id}r${i}`, domain, ready: true }));
    p.runeDeck = [];
  }
  s.fields.forEach((f) => {
    f.cardId = "ogn-280-298";
    f.controller = null;
  });
  return s;
}
function add(
  s: GameState,
  id: string,
  cardId: string,
  owner: PlayerId = 0,
  location: LocationId = "base:0",
) {
  const u: Unit = {
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
  };
  s.units.push(u);
  return u;
}
function act(s: GameState, find: string | ((a: GameAction) => boolean)) {
  const a = getLegalActions(s, s.priorityPlayer).find(
    typeof find === "string" ? (a) => a.id === find : find,
  );
  expect(a, `Missing ${String(find)} in ${s.phase}`).toBeDefined();
  return applyAction(s, a!);
}
function settle(s: GameState) {
  for (let i = 0; i < 80 && (s.stack.length || s.pendingChoice); i++)
    s = act(s, s.pendingChoice ? () => true : "pass");
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}

describe("Vendetta ownership and joining edges", () => {
  it("Mel can empower in base and banishes only a small enemy at a battlefield", () => {
    let s = position();
    add(s, "mel", ven(110));
    add(s, "field-enemy", "ogn-052-298", 1, "field:0");
    add(s, "base-enemy", "ogn-052-298", 1, "base:1");
    s.players[0].hand = ["ogn-058-298"];
    s = settle(act(s, (a) => a.id.startsWith("ven-empower:mel")));
    expect(s.units.find((u) => u.id === "mel")?.empowered).toBe(true);
    expect(s.units.some((u) => u.id === "field-enemy")).toBe(false);
    expect(s.units.some((u) => u.id === "base-enemy")).toBe(true);
    expect(s.players[1].banished).toContain("ogn-052-298");
  });
  it("an opponent banishing your card does not empower your Zed legend", () => {
    let s = position();
    s.players[1].legendId = ven(143);
    add(s, "enemy", "ogn-052-298", 1, "field:0");
    s.players[0].hand = [ven(106)];
    s = settle(
      act(
        s,
        (a) =>
          a.category === "play" &&
          a.cardId === ven(106) &&
          a.targetId === "enemy",
      ),
    );
    expect(s.players[1].banished).toContain("ogn-052-298");
    expect(s.players[1].legendEmpowered ?? false).toBe(false);
  });
  it("Gust Monk banishing a card from the opponent trash does not empower the opponent legend", () => {
    let s = position();
    s.players[1].legendId = ven(143);
    s.players[1].discard = ["ogn-052-298"];
    add(s, "friendly", "ogn-142-298");
    s.players[0].hand = [ven(101)];
    s = settle(
      act(
        s,
        (a) =>
          a.category === "play" &&
          a.cardId === ven(101) &&
          a.additionalCostPaid === true,
      ),
    );
    expect(s.players[1].banished).toContain("ogn-052-298");
    expect(s.players[1].legendEmpowered ?? false).toBe(false);
  });
  it("Hidden Resonating Strike can target a unit elsewhere because its text requires another location", () => {
    let s = position();
    s.fields[0].controller = 0;
    add(s, "guard", "ogn-142-298", 0, "field:0");
    add(s, "arrival", "ogn-052-298");
    s.hidden = [
      {
        id: "strike",
        cardId: ven(34),
        owner: 0,
        location: "field:0",
        hiddenTurn: 3,
      },
    ];
    const action = getLegalActions(s, 0).find(
      (a) =>
        a.category === "play" &&
        a.sourceId === "hidden:strike" &&
        a.targetId === "arrival",
    );
    expect(action).toBeDefined();
    s = settle(applyAction(s, action!));
    expect(s.units.find((u) => u.id === "arrival")?.location).toBe("field:0");
    expect(s.units.find((u) => u.id === "arrival")?.temporaryMight).toBe(2);
  });
  it("Mournful Witness joining a battle is empowered after surviving that combat", () => {
    let s = position();
    s.fields[0].controller = 0;
    add(s, "guard", "ogn-142-298", 0, "field:0");
    add(s, "witness", ven(28));
    add(s, "attacker", "ogn-052-298", 1, "field:0");
    s.players[0].hand = [ven(34)];
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
      designatedUnits: ["guard", "attacker"],
    };
    s = settle(
      act(
        s,
        (a) =>
          a.category === "play" &&
          a.cardId === ven(34) &&
          a.targetId === "witness",
      ),
    );
    expect(s.units.find((u) => u.id === "witness")?.location).toBe("field:0");
    for (
      let i = 0;
      i < 80 && (s.combat || s.stack.length || s.pendingChoice);
      i++
    )
      s = act(s, s.pendingChoice || s.phase === "damage" ? () => true : "pass");
    expect(s.combat).toBeNull();
    expect(s.units.find((u) => u.id === "witness")?.empowered).toBe(true);
  });
});

it("Kennen played from Hidden restricts its nested stun choice to that battlefield", () => {
  let s = position();
  s.fields[0].controller = 0;
  add(s, "guard", "ogn-142-298", 0, "field:0");
  add(s, "elsewhere", "ogn-052-298", 1, "base:1");
  s.hidden = [
    {
      id: "kennen",
      cardId: ven(135),
      owner: 0,
      location: "field:0",
      hiddenTurn: 3,
    },
  ];
  s = act(s, (a) => a.category === "play" && a.sourceId === "hidden:kennen");
  for (let i = 0; i < 20 && s.stack.length && !s.pendingChoice; i++)
    s = act(s, "pass");
  expect(s.pendingChoice?.kind).toBe("custom");
  const options = getLegalActions(s, s.priorityPlayer);
  expect(options.some((a) => a.targetId === "guard")).toBe(true);
  expect(options.some((a) => a.targetId === "elsewhere")).toBe(false);
});
