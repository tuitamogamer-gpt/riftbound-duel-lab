import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import { getAutomaticAction, sourceActions } from "../src/game/flow";
import { parseSession } from "../src/persistence";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

function position(cardId = "ogn-097-298") {
  const s = createCombatFixture();
  s.phase = "main";
  s.combat = null;
  s.fields[0].controller = 0;
  s.units = [
    combatUnit("guard", 0, 5),
    combatUnit("enemy", 1, 5),
    { ...combatUnit("elsewhere", 1, 5), location: "base:1" as const },
  ];
  s.hidden = [
    { id: "h", owner: 0, cardId, location: "field:0", hiddenTurn: s.turn - 1 },
  ];
  return s;
}

describe("Hidden timing, triggers and controls", () => {
  it("can hide the chosen champion without consuming a card from hand or playing it", () => {
    const s = position();
    s.hidden = [];
    s.players[0].championId = "ogn-197-298";
    s.players[0].championAvailable = true;
    s.players[0].power = 1;
    s.players[0].hand = ["ogn-049-298"];
    const hide = getLegalActions(s, 0).find(
      (a) => a.id.startsWith("hide:") && a.sourceId === "champion",
    );
    expect(hide).toBeDefined();
    const next = applyAction(s, hide!);
    expect(next.players[0].hand).toEqual(s.players[0].hand);
    expect(next.players[0].championAvailable).toBe(false);
    expect(next.players[0].power).toBe(0);
    expect(next.players[0].cardsPlayedThisTurn).toBe(
      s.players[0].cardsPlayedThisTurn,
    );
    expect(next.hidden?.[0].cardId).toBe("ogn-197-298");
    expect(next.stack).toEqual([]);
    expect(
      getLegalActions(next, 0).some((a) => a.sourceId?.startsWith("hidden:")),
    ).toBe(false);
  });

  it("allows hiding in an open showdown on your turn, but not on an opponent turn or closed chain", () => {
    const s = position();
    s.hidden = [];
    s.phase = "showdown";
    s.combat = createCombatFixture().combat;
    s.players[0].power = 1;
    s.players[0].hand = ["ogn-083-298"];
    const canHide = () =>
      getLegalActions(s, 0).some((a) => a.id.startsWith("hide:"));
    expect(canHide()).toBe(true);
    s.currentPlayer = 1;
    expect(canHide()).toBe(false);
    s.currentPlayer = 0;
    s.stack = [
      {
        id: "chain",
        player: 1,
        cardId: "ogn-083-298",
        kind: "spell",
        effects: [{ type: "draw" }],
      },
    ];
    expect(canHide()).toBe(false);
  });

  it("restricts Blastcone Fae's play trigger to its Hidden battlefield", () => {
    const s = position();
    const play = getLegalActions(s, 0).find((a) => a.sourceId === "hidden:h")!;
    expect(play).toBeDefined();
    const next = applyAction(s, play);
    const choices = getLegalActions(next, 0);
    expect(next.pendingChoice?.kind).toBe("trigger");
    expect(choices.some((a) => a.targetId === "enemy")).toBe(true);
    expect(choices.some((a) => a.targetId === "elsewhere")).toBe(false);
    const restored = parseSession(
      JSON.stringify({ match: next, review: null }),
    ).match;
    expect(restored).not.toBeNull();
    expect(getLegalActions(restored!, 0).map((a) => a.id)).toEqual(
      choices.map((a) => a.id),
    );
    const chosen = applyAction(
      next,
      choices.find((a) => a.targetId === "enemy")!,
    );
    expect(chosen.stack.at(-1)?.targetId).toBe("enemy");
    const done = applyAction(applyAction(chosen, "pass"), "pass");
    expect(done.units.find((u) => u.id === "enemy")?.temporaryMight).toBe(-2);
  });

  it("keeps Blastcone Fae's normal hand-play targets unrestricted", () => {
    const s = position();
    s.hidden = [];
    s.players[0].hand = ["ogn-097-298"];
    s.players[0].energy = 10;
    s.players[0].power = 10;
    const play = getLegalActions(s, 0).find(
      (a) =>
        a.sourceId === "hand:0" &&
        a.category === "play" &&
        a.locationId === "field:0",
    )!;
    const next = applyAction(s, play);
    expect(
      getLegalActions(next, 0).some((a) => a.targetId === "elsewhere"),
    ).toBe(true);
  });

  it("skips a Hidden spell's target after it leaves that battlefield before resolution", () => {
    const s = position("ogn-213-298");
    const play = getLegalActions(s, 0).find(
      (a) => a.sourceId === "hidden:h" && a.targetId === "enemy",
    )!;
    const next = applyAction(s, play);
    next.units.find((u) => u.id === "enemy")!.location = "field:1";
    const done = applyAction(applyAction(next, "pass"), "pass");
    expect(done.units.some((u) => u.id === "enemy")).toBe(true);
  });

  it("surfaces Hidden responses in the decision dock and waits for the human", () => {
    const s = position("ogn-083-298");
    s.currentPlayer = 1;
    s.stack = [
      {
        id: "chain",
        player: 1,
        cardId: "ogn-083-298",
        kind: "spell",
        effects: [{ type: "draw" }],
      },
    ];
    const legal = getLegalActions(s, 0);
    expect(
      sourceActions(s, legal, null).some((a) => a.sourceId === "hidden:h"),
    ).toBe(true);
    expect(getAutomaticAction(s)).toBeUndefined();
  });
});
