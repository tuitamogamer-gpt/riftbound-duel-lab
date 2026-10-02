import { describe, expect, it } from "vitest";
import { applyAction, createGame, getLegalActions } from "../src/game/engine";
import type {
  Domain,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";

const unit = (
  id: string,
  cardId: string,
  owner: PlayerId = 0,
  location: Unit["location"] = "base:0",
): Unit => ({
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
});
function take(s: GameState, predicate: (a: GameAction) => boolean) {
  const actions = getLegalActions(s, s.priorityPlayer);
  const action = actions.find(predicate);
  expect(
    action,
    `Expected action in ${s.phase}: ${actions.map((a) => a.id).join(", ")}`,
  ).toBeDefined();
  return applyAction(s, action!);
}
function position() {
  let s = createGame({
    playerDeckId: "precon-fiora",
    botDeckId: "precon-rumble",
    seed: 7901,
  });
  s = take(s, (a) => a.id === "mulligan:");
  s = take(s, (a) => a.id === "mulligan:");
  Object.assign(s, {
    turn: 5,
    currentPlayer: 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    phase: "main",
    units: [],
    gears: [],
    stack: [],
    combat: null,
    pendingChoice: null,
    consecutivePasses: 0,
    chainStarter: null,
  });
  s.fields[0] = { id: "field:0", cardId: "ogn-280-298", controller: null };
  s.fields[1] = { id: "field:1", cardId: "ogn-275-298", controller: null };
  for (const p of s.players) {
    p.hand = [];
    p.energy = 50;
    p.championAvailable = false;
    p.cardsPlayedThisTurn = 0;
    p.legendId = "sfd-181-221";
    p.runes = (
      ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"] as Domain[]
    ).flatMap((domain) =>
      Array.from({ length: 4 }, (_, i) => ({
        id: `r:${p.id}:${domain}:${i}`,
        domain,
        ready: true,
      })),
    );
  }
  return s;
}
function cast(
  s: GameState,
  cardId: string,
  targetId?: string,
  locationId?: Unit["location"],
) {
  s.players[s.priorityPlayer].hand.push(cardId);
  return take(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (!targetId || a.targetId === targetId) &&
      (!locationId || a.locationId === locationId),
  );
}
function resolveTop(s: GameState) {
  s = take(s, (a) => a.id === "pass");
  return take(s, (a) => a.id === "pass");
}
function settle(s: GameState) {
  for (let i = 0; i < 50 && (s.stack.length || s.pendingChoice); i++)
    s = take(s, (a) => s.phase === "choice" || a.id === "pass");
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function attackingVi() {
  let s = position();
  s.units = [
    unit("vi", "unl-176-219"),
    unit("friend", "sfd-099-221", 0, "field:0"),
    unit("defender", "ogn-142-298", 1, "field:0"),
  ];
  s.fields[0].controller = 1;
  s = take(
    s,
    (a) =>
      a.id.startsWith("move-start:") &&
      a.sourceId === "vi" &&
      a.locationId === "field:0",
  );
  s = take(s, (a) => a.id === "move-confirm");
  return settle(s);
}

describe("precon card-resolution and combat designation timing", () => {
  it("spell-play triggers wait for resolution, including a spell whose target has become unavailable", () => {
    for (const targetDisappears of [false, true]) {
      let s = position();
      s.units = [
        unit("student", "ogn-103-298"),
        unit("target", "ogn-142-298", 1, "field:0"),
      ];
      s = cast(s, "ogn-005-298", "target");
      expect(s.stack).toHaveLength(1);
      expect(s.stack[0].kind).toBe("spell");
      expect(s.units[0].temporaryMight).toBe(0);
      if (targetDisappears) s.units = s.units.filter((u) => u.id !== "target");
      s = resolveTop(s);
      expect(s.stack).toHaveLength(1);
      expect(s.stack[0].sourceId).toBe("student");
      expect(s.players[0].discard).toContain("ogn-005-298");
      s = settle(s);
      expect(s.units.find((u) => u.id === "student")?.temporaryMight).toBe(1);
    }
  });

  it("both spell-play and card-play observers wait until a spell completes its discard choice", () => {
    let s = position();
    s.currentPlayer = 1;
    s.phase = "showdown";
    s.focusPlayer = 1;
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      engaged: true,
      designatedUnits: ["target"],
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s.units = [
      unit("student", "ogn-103-298"),
      unit("viktor", "ogn-117-298"),
      unit("target", "ogn-142-298", 1, "field:0"),
    ];
    s.players[0].hand = ["ogn-012-298"];
    s = cast(s, "ogn-008-298", "target");
    expect(s.stack).toHaveLength(1);
    s = resolveTop(s);
    expect(s.phase).toBe("choice");
    expect(s.stack).toHaveLength(0);
    expect(s.units.some((u) => u.token)).toBe(false);
    expect(s.players[0].discard).not.toContain("ogn-008-298");
    s = take(s, (a) => a.id.startsWith("choose-card:"));
    expect(s.players[0].discard).toContain("ogn-008-298");
    expect(s.stack.map((item) => item.sourceId)).toEqual(
      expect.arrayContaining(["student", "viktor"]),
    );
    s = settle(s);
    expect(s.units.find((u) => u.id === "student")?.temporaryMight).toBe(1);
    expect(s.units.filter((u) => u.token && u.owner === 0)).toHaveLength(1);
  });

  it("a countered spell gives no play trigger but still enables Legion through finalization", () => {
    let s = position();
    s.units = [
      unit("student", "ogn-103-298"),
      unit("guard", "sfd-099-221", 1, "base:1"),
    ];
    s = cast(s, "ogn-058-298", "student");
    const incoming = s.stack[0].id;
    s = take(s, (a) => a.id === "pass");
    s = cast(s, "sfd-206-221", `guard~${incoming}`);
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(0);
    expect(s.players[0].discard).toContain("ogn-058-298");
    expect(s.players[0].cardsPlayedThisTurn).toBe(1);
    s.priorityPlayer = 0;
    s.currentPlayer = 0;
    s.phase = "main";
    s.players[0].hand = ["ogn-012-298"];
    expect(
      getLegalActions(s, 0).find((a) => a.cardId === "ogn-012-298")?.detail,
    ).toContain("2 energy");
  });

  it("an Ambush attacker joins the existing combat with one new attack trigger and preserves focus", () => {
    let s = attackingVi();
    const focus = s.focusPlayer,
      attacker = s.combat!.attacker;
    s = cast(s, "unl-176-219", undefined, "field:0");
    const joiner = s.units.find(
      (u) => u.cardId === "unl-176-219" && u.id !== "vi",
    )!;
    expect(s.combat?.attacker).toBe(attacker);
    expect(s.combat?.fieldId).toBe("field:0");
    expect(s.focusPlayer).toBe(focus);
    expect(s.stack.filter((item) => item.sourceId === joiner.id)).toHaveLength(
      1,
    );
    expect(s.stack.some((item) => item.sourceId === "vi")).toBe(false);
    s = settle(s);
    expect(
      s.combat?.designatedUnits?.filter((id) => id === joiner.id),
    ).toHaveLength(1);
    s = cast(s, "ogn-058-298", "friend");
    s = settle(s);
    expect(s.focusPlayer).toBe(1);
    expect(s.priorityPlayer).toBe(1);
    s = cast(s, "unl-002-219", undefined, "field:0");
    expect(s.combat?.attacker).toBe(0);
    expect(s.focusPlayer).toBe(1);
    expect(s.stack).toHaveLength(0);
  });

  it("a designated unit leaving and returning to the same combat does not trigger attack again", () => {
    let s = attackingVi();
    s = cast(s, "ogn-168-298", "vi");
    s = settle(s);
    expect(s.units.find((u) => u.id === "vi")?.location).toBe("base:0");
    // A queued movement effect models a later instruction returning the same permanent.
    s.stack.push({
      id: "return-to-combat",
      player: 0,
      cardId: "ogn-043-298",
      kind: "ability",
      targetId: "vi",
      effects: [
        {
          type: "moveTarget",
          target: "anyUnit",
          condition: "chooseDestination",
        },
      ],
    });
    s.priorityPlayer = 0;
    s.consecutivePasses = 0;
    s = resolveTop(s);
    s = take(s, (a) => a.locationId === "field:0");
    expect(s.units.find((u) => u.id === "vi")?.location).toBe("field:0");
    expect(s.stack.some((item) => item.sourceId === "vi")).toBe(false);
    expect(s.combat?.designatedUnits?.filter((id) => id === "vi")).toHaveLength(
      1,
    );
  });
});
