import { describe, expect, it } from "vitest";
import type { Review } from "../src/components/StepFlow";
import { createGame } from "../src/game/engine";
import {
  defaultMobileZone,
  mobileBoardLocations,
  mobileReviewFocus,
  mobileTargetZones,
  mobileZoneSummary,
  soleMobileTargetZone,
} from "../src/game/mobile-presentation";
import type { GameAction, GameState, LocationId } from "../src/game/types";
import { combatUnit } from "./fixtures/combat";

function table(): GameState {
  const game = createGame({
    playerDeckId: "annie",
    botDeckId: "lux",
    seed: 754,
  });
  game.combat = null;
  game.units = [
    { ...combatUnit("own-base", 0, 3), location: "base:0" },
    combatUnit("own-field", 0, 4),
    combatUnit("enemy-field", 1, 5),
    { ...combatUnit("other-field", 1, 2), location: "field:1" },
  ];
  game.gears = [
    {
      id: "attached",
      cardId: "ogn-183-298",
      owner: 0,
      ready: true,
      attachedTo: "own-field",
    },
    { id: "loose", cardId: "ogn-183-298", owner: 1, ready: true },
  ];
  return game;
}

function action(overrides: Partial<GameAction> = {}): GameAction {
  return {
    id: "test",
    label: "Public choice",
    category: "play",
    player: 0,
    ...overrides,
  };
}

function review(game = table()): Review {
  return {
    before: structuredClone(game),
    final: structuredClone(game),
    frames: [{ state: structuredClone(game), label: "Shown" }],
    index: 0,
    action: action(),
  };
}

describe("mobile board minimap", () => {
  it("keeps both bases and every supplied battlefield reachable", () => {
    const game = table();
    expect(mobileBoardLocations(game)).toEqual([
      "base:0",
      "field:0",
      "field:1",
      "base:1",
    ]);
    game.fields.push({
      id: "field:2",
      cardId: game.fields[0].cardId,
      controller: null,
    });
    expect(mobileBoardLocations(game)).toEqual([
      "base:0",
      "field:0",
      "field:1",
      "field:2",
      "base:1",
    ]);
  });

  it("shows Might, ownership and hidden counts without reading hidden faces", () => {
    const game = table();
    game.fields[0].controller = 1;
    game.hidden = [
      {
        id: "own-secret",
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
        get cardId(): string {
          throw new Error("Private face read");
        },
      },
      {
        id: "enemy-secret",
        owner: 1,
        location: "field:0",
        hiddenTurn: 1,
        get cardId(): string {
          throw new Error("Private face read");
        },
      },
      {
        id: "elsewhere",
        owner: 1,
        location: "field:1",
        hiddenTurn: 1,
        cardId: "unknown",
      },
    ];
    expect(mobileZoneSummary(game, "field:0")).toEqual({
      location: "field:0",
      counts: [1, 1],
      might: [4, 5],
      hidden: [1, 1],
      controller: 1,
      combat: false,
    });
    expect(mobileZoneSummary(game, "base:0").hidden).toEqual([0, 0]);
  });

  it("finds unit, attached gear, loose gear and compound target locations", () => {
    const game = table();
    expect(
      mobileTargetZones(game, [action({ targetId: "enemy-field~attached" })]),
    ).toEqual(["field:0"]);
    expect(
      mobileTargetZones(game, [
        action({ targetId: "own-base,loose,other-field" }),
      ]),
    ).toEqual(["base:0", "field:1", "base:1"]);
  });

  it("does not mistake a playable source for a target or invent absent zones", () => {
    const game = table();
    expect(
      mobileTargetZones(game, [
        action({ sourceId: "own-field" }),
        action({ targetId: "hidden:enemy-secret" }),
        action({ locationId: "field:2" }),
      ]),
    ).toEqual([]);
  });

  it("marks selectable movement origins and the explicit confirmation destination", () => {
    const game = table();
    const toggle = action({
      id: "move-toggle:own-base",
      category: "move",
      sourceId: "own-base",
      locationId: "field:1",
    });
    expect(mobileTargetZones(game, [toggle])).toEqual(["base:0"]);
    expect(
      mobileTargetZones(game, [
        toggle,
        action({ id: "move-confirm", category: "move", locationId: "field:1" }),
      ]),
    ).toEqual(["base:0", "field:1"]);
  });

  it("reveals one target zone only and keeps multiple choices under player control", () => {
    const game = table();
    expect(
      soleMobileTargetZone(game, [
        action({ targetId: "own-field" }),
        action({ targetId: "enemy-field" }),
      ]),
    ).toBe("field:0");
    expect(
      soleMobileTargetZone(game, [
        action({ targetId: "own-field" }),
        action({ targetId: "other-field" }),
      ]),
    ).toBeUndefined();
    expect(soleMobileTargetZone(game, [])).toBeUndefined();
  });
});

describe("public mobile frame focus", () => {
  it("prefers a displayed target to a remote source and detects removed targets", () => {
    const game = table();
    const shown = review(game);
    shown.frames[0].state.units = shown.frames[0].state.units.filter(
      (unit) => unit.id !== "other-field",
    );
    shown.frames[0].effect = {
      player: 0,
      sourceId: "own-base",
      targetId: "other-field",
      type: "damage",
      stage: "applied",
    };
    expect(mobileReviewFocus(game, shown)).toBe("field:1");
  });

  it("uses the immediately preceding frame when a target has moved or disappeared", () => {
    const game = table();
    const shown = review(game);
    shown.frames[0].state.units.find(
      (unit) => unit.id === "enemy-field",
    )!.location = "field:1";
    const next = structuredClone(shown.frames[0]);
    next.state.units = next.state.units.filter(
      (unit) => unit.id !== "enemy-field",
    );
    next.effect = { player: 0, targetId: "enemy-field", stage: "applied" };
    shown.frames.push(next);
    shown.index = 1;
    expect(mobileReviewFocus(game, shown)).toBe("field:1");
  });

  it("ignores review.final and a future target that is not publicly on the shown table", () => {
    const game = table();
    const shown = review(game);
    shown.final.units.push({
      ...combatUnit("future", 1, 8),
      location: "field:1",
    });
    shown.frames[0].effect = {
      player: 0,
      targetId: "future",
      stage: "announced",
    };
    expect(mobileReviewFocus(shown.final, shown)).toBeUndefined();
    expect(mobileReviewFocus(game, { ...shown, index: -1 })).toBeUndefined();
    expect(mobileReviewFocus(game, { ...shown, index: 99 })).toBeUndefined();
  });

  it("focuses loose and attached gear in their public locations", () => {
    const game = table();
    const shown = review(game);
    shown.frames[0].effect = {
      player: 0,
      targetId: "attached",
      stage: "applied",
    };
    expect(mobileReviewFocus(game, shown)).toBe("field:0");
    shown.frames[0].effect.targetId = "loose";
    expect(mobileReviewFocus(game, shown)).toBe("base:1");
  });

  it.each(["legend", "champion"])(
    "focuses public %s abilities in their owner's base",
    (sourceId) => {
      const game = table();
      const shown = review(game);
      shown.action = action({ player: 1, sourceId, category: "ability" });
      expect(mobileReviewFocus(game, shown)).toBe("base:1");
    },
  );

  it("uses the public location of a Hidden source without reading the private face", () => {
    const game = table();
    const shown = review(game);
    shown.frames[0].state.hidden = [
      {
        id: "secret",
        owner: 1,
        location: "field:1",
        hiddenTurn: 1,
        get cardId(): string {
          throw new Error("Private face read");
        },
      },
    ];
    shown.action = action({ player: 1, sourceId: "hidden:secret" });
    expect(mobileReviewFocus(game, shown)).toBe("field:1");
  });

  it("keeps movement selection at its origin and follows its confirmed destination", () => {
    const game = table();
    game.pendingMove = {
      player: 0,
      from: "base:0",
      to: "field:1",
      unitIds: ["own-base"],
    };
    game.phase = "move";
    expect(mobileReviewFocus(game, null)).toBe("base:0");
    expect(defaultMobileZone(game)).toBe("base:0");
    const shown = review(game);
    shown.action = action({
      id: "move-confirm",
      category: "move",
      locationId: "field:1",
    });
    expect(mobileReviewFocus(game, shown)).toBe("field:1");
  });

  it("restores an active combat zone and otherwise supplies a valid initial zone", () => {
    const game = table();
    game.combat = {
      fieldId: "field:1",
      attacker: 0,
      defender: 1,
      stage: "priority",
      total: [0, 2],
      remaining: [0, 2],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(defaultMobileZone(game)).toBe("field:1");
    expect(mobileReviewFocus(game, null)).toBe("field:1");
    expect(defaultMobileZone(null)).toBe("base:0");
  });

  it("accepts only locations in the displayed game", () => {
    const game = table();
    const shown = review(game);
    shown.frames[0].effect = { player: 0, locationId: "field:2" as LocationId };
    expect(mobileReviewFocus(game, shown)).toBeUndefined();
    shown.frames[0].score = {
      player: 0,
      from: 1,
      to: 2,
      kind: "conquer",
      fieldId: "field:1",
    };
    expect(mobileReviewFocus(game, shown)).toBe("field:1");
  });
});
