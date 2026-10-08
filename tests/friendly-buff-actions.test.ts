import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import {
  filterFriendlyBuffActions,
  isFriendlyBuffAction,
} from "../src/game/friendly-buff-actions";
import { sourceActions } from "../src/game/flow";
import type { Effect, GameAction } from "../src/game/types";
import { fixture, ogn, sfd, unit } from "./fixtures/cards";

function position() {
  const game = fixture();
  game.units = [unit("ally"), unit("enemy", 1, "base:1")];
  return game;
}

describe("friendly buff action presentation", () => {
  it.each([ogn(58), ogn(154), ogn(4), sfd(97)])(
    "offers only friendly targets for %s without changing engine legality",
    (cardId) => {
      const game = position();
      game.players[0].hand = [cardId];
      const legal = getLegalActions(game, 0);
      const enemyPlay = legal.find(
        (action) => action.sourceId === "hand:0" && action.targetId === "enemy",
      )!;
      expect(enemyPlay).toBeDefined();
      expect(isFriendlyBuffAction(game, enemyPlay)).toBe(true);
      expect(
        sourceActions(game, legal, "hand:0").map((action) => action.targetId),
      ).toEqual(["ally"]);
      expect(applyAction(game, enemyPlay).stack.at(-1)?.targetId).toBe("enemy");
    },
  );

  it("does not offer a positive spell when only enemy targets exist", () => {
    const game = position();
    game.units = game.units.filter((candidate) => candidate.owner === 1);
    game.players[0].hand = [ogn(154)];
    const actions = filterFriendlyBuffActions(game, getLegalActions(game, 0));
    expect(actions.some((action) => action.sourceId === "hand:0")).toBe(false);
    expect(actions.some((action) => action.category === "end")).toBe(true);
  });

  it("uses current control, including a stolen unit, for friendly targets", () => {
    const game = position();
    game.units[0].originalOwner = 1;
    game.players[0].hand = [ogn(154)];
    expect(
      sourceActions(game, getLegalActions(game, 0), "hand:0").map(
        (action) => action.targetId,
      ),
    ).toEqual(["ally"]);
  });

  it("filters granted keyword abilities and their copied versions", () => {
    const game = position();
    game.gears.push({
      id: "ganking-gear",
      cardId: ogn(267),
      owner: 0,
      ready: true,
    });
    game.units.push({ ...unit("heimer"), cardId: ogn(111) });
    const legal = getLegalActions(game, 0);
    for (const source of ["ganking-gear", "heimer"]) {
      const abilities = legal.filter(
        (action) => action.sourceId === source && action.category === "ability",
      );
      expect(abilities.some((action) => action.targetId === "enemy")).toBe(
        true,
      );
      expect(
        filterFriendlyBuffActions(game, abilities).some(
          (action) => action.targetId === "enemy",
        ),
      ).toBe(false);
      expect(
        filterFriendlyBuffActions(game, abilities).some(
          (action) => action.targetId === "ally",
        ),
      ).toBe(true);
    }
  });

  it("keeps negative Might, damage, and mixed effects available against enemies", () => {
    const game = position();
    game.players[0].hand = [sfd(66), ogn(252)];
    const legal = getLegalActions(game, 0);
    for (const source of ["hand:0", "hand:1"])
      expect(
        sourceActions(game, legal, source).some(
          (action) => action.targetId === "enemy",
        ),
      ).toBe(true);

    const mixed: GameAction = {
      id: "choose-custom:mixed",
      label: "Might and damage",
      category: "ability",
      player: 0,
      targetId: "enemy",
      effects: [
        { type: "might", amount: 3, target: "anyUnit" },
        { type: "damage", amount: 4, target: "anyUnit" },
      ],
    };
    expect(filterFriendlyBuffActions(game, [mixed])).toEqual([mixed]);
    expect(isFriendlyBuffAction(game, mixed)).toBe(false);
  });

  it("classifies each modal action's selected effects, including protection", () => {
    const game = position();
    const mode = (id: string, effect: Effect): GameAction => ({
      id,
      label: id,
      category: "play",
      player: 0,
      targetId: "enemy",
      effects: [effect],
    });
    const empower = mode("empower", {
      type: "special",
      custom: "ven-wave4:sanction",
      target: "anyUnit",
      amount: 1,
    });
    const weaken = mode("disempower", {
      type: "special",
      custom: "ven-wave4:sanction",
      target: "anyUnit",
      amount: 0,
    });
    const barrier = mode("barrier", {
      type: "special",
      custom: "ven:barrier",
      target: "anyUnit",
    });
    const unknown = mode("unknown", {
      type: "special",
      custom: "unreviewed",
      target: "anyUnit",
    });
    expect(
      filterFriendlyBuffActions(game, [empower, weaken, barrier, unknown]),
    ).toEqual([weaken, unknown]);
  });

  it("filters positive triggered choices and leaves an optional skip available", () => {
    const game = position();
    game.phase = "choice";
    game.pendingChoice = {
      kind: "trigger",
      player: 0,
      remaining: 1,
      returnPhase: "main",
      returnPriority: 0,
      sourceId: "source",
      cardId: ogn(132),
      effects: [{ type: "ready", target: "anyUnit", optional: true }],
    };
    const choices = sourceActions(game, getLegalActions(game, 0), null);
    expect(choices.some((action) => action.targetId === "enemy")).toBe(false);
    expect(choices.some((action) => action.targetId === "ally")).toBe(true);
    expect(choices.some((action) => action.id === "choose-trigger:skip")).toBe(
      true,
    );
  });

  it("keeps a unit summon available and filters its actual on-play buff choices", () => {
    const game = position();
    game.players[0].hand = [ogn(132)];
    const summon = sourceActions(game, getLegalActions(game, 0), "hand:0")[0];
    expect(summon).toBeDefined();
    expect(summon.targetId).toBeUndefined();
    expect(isFriendlyBuffAction(game, summon)).toBe(false);

    const played = applyAction(game, summon);
    expect(played.pendingChoice?.kind).toBe("trigger");
    const legal = getLegalActions(played, 0);
    expect(legal.some((action) => action.targetId === "enemy")).toBe(true);
    const offered = sourceActions(played, legal, "hand:0");
    expect(offered.map((action) => action.targetId)).toEqual(["ally"]);
    expect(offered[0].effects).toMatchObject([
      { type: "ready", target: "anyUnit" },
    ]);
    expect(isFriendlyBuffAction(played, offered[0])).toBe(true);
    expect(applyAction(played, offered[0]).stack.at(-1)?.targetId).toBe("ally");
  });

  it("keeps a forced trigger completable if its only legal target is an enemy", () => {
    const game = position();
    game.units = game.units.filter((candidate) => candidate.owner === 1);
    game.phase = "choice";
    game.pendingChoice = {
      kind: "trigger",
      player: 0,
      remaining: 1,
      returnPhase: "main",
      returnPriority: 0,
      sourceId: "source",
      cardId: ogn(132),
      effects: [{ type: "ready", target: "anyUnit" }],
    };
    const legal = getLegalActions(game, 0);
    expect(legal).toHaveLength(1);
    expect(filterFriendlyBuffActions(game, legal)).toEqual(legal);
  });

  it("uses the current draft step and preserves cancellation", () => {
    const game = position();
    game.phase = "choice";
    game.pendingChoice = {
      kind: "effectDraft",
      player: 0,
      remaining: 1,
      returnPhase: "main",
      returnPriority: 0,
      effectDraft: {
        action: {
          id: "draft-spell",
          label: "Buff",
          category: "play",
          player: 0,
        },
        steps: [{ effects: [{ type: "might", amount: 3, target: "anyUnit" }] }],
        chosen: [],
        targets: [],
        modes: [],
        selected: [],
      },
    };
    const choices = filterFriendlyBuffActions(game, getLegalActions(game, 0));
    expect(choices.some((action) => action.targetId === "enemy")).toBe(false);
    expect(choices.some((action) => action.targetId === "ally")).toBe(true);
    expect(choices.some((action) => action.id === "draft:cancel")).toBe(true);
  });
});
