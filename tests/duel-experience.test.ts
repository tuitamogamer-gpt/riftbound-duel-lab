import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import { createTrainingPosition } from "../src/game/training";
import {
  duelGuideLesson,
  DUEL_GUIDE_KEY,
  guideTopics,
  readDuelGuide,
  saveDuelGuide,
} from "../src/game/duel-guide";
import { tableFocus } from "../src/game/table-focus";
import { sourceActions } from "../src/game/flow";
import { matchDebrief } from "../src/game/match-debrief";
import { getObservation } from "../src/game/ai/observation";
import { createReplay } from "../src/game/ai/replay";
import {
  buildMatchTimeline,
  parseCompletedMatch,
  type HistoryFrame,
} from "../src/game/match-history";
import type { GameState } from "../src/game/types";
import { messages } from "../src/i18n/core";
import { filterHiddenPlayMode } from "../src/game/hidden-presentation";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

const viewFrame = (
  game: GameState,
  decisionIndex: number,
  actor?: 0 | 1,
): HistoryFrame => ({
  views: [getObservation(game, 0).state, getObservation(game, 1).state],
  labels: ["Public move", "Public move"],
  might: {},
  moments: [],
  decisionIndex,
  actor,
});

describe("guidance inside a real duel", () => {
  it("explains the real opening without choosing or spending a card", () => {
    const game = createGame({ seed: 123, firstPlayer: 0 });
    const before = structuredClone(game);
    expect(duelGuideLesson(game, getLegalActions(game, 0))?.id).toBe("opening");
    expect(
      duelGuideLesson(game, getLegalActions(game, 0), ["opening"]),
    ).toBeNull();
    expect(game).toEqual(before);
  });
  it("suggests only a legal human source and ignores hidden opponent cards", () => {
    const game = createTrainingPosition("deploy");
    const legal = getLegalActions(game, 0);
    const lesson = duelGuideLesson(game, legal)!;
    expect(lesson.id).toBe("deploy");
    expect(
      legal.some(
        (action) => action.player === 0 && action.sourceId === lesson.source,
      ),
    ).toBe(true);
    game.players[1].hand = ["private-opponent-secret"];
    game.players[1].deck = ["future-draw-secret"];
    expect(duelGuideLesson(game, legal)).toEqual(lesson);
    expect(JSON.stringify(lesson)).not.toMatch(/secret/);
    game.priorityPlayer = 1;
    expect(duelGuideLesson(game, legal)).toBeNull();
  });
  it.each(["movement", "reaction", "damage", "hold"] as const)(
    "uses the %s position and localizes every lesson",
    (id) => {
      const game = createTrainingPosition(id);
      const lesson = duelGuideLesson(game, getLegalActions(game, 0))!;
      expect(lesson.id).toBe(id === "hold" ? "scoring" : id);
      for (const text of [lesson.title, lesson.body, lesson.goal])
        expect(messages[text], text).toHaveLength(3);
    },
  );
  it("bounds stored topics and survives unavailable storage", () => {
    const value = {
      version: 1,
      seed: 42,
      enabled: true,
      seen: ["opening", "opening", "unknown"],
    };
    expect(
      readDuelGuide({ getItem: () => JSON.stringify(value) })?.seen,
    ).toEqual(["opening"]);
    for (const raw of [
      "broken",
      "null",
      JSON.stringify({ ...value, seed: "42" }),
    ])
      expect(readDuelGuide({ getItem: () => raw })).toBeNull();
    expect(
      readDuelGuide({
        getItem: () => {
          throw Error("blocked");
        },
      }),
    ).toBeNull();
    const state = {
      version: 1 as const,
      seed: 42,
      enabled: false,
      seen: [...guideTopics],
    };
    const memory = new Map<string, string>();
    expect(
      saveDuelGuide(state, {
        setItem: (key, value) => {
          memory.set(key, value);
        },
      }),
    ).toBe(true);
    expect(memory.has(DUEL_GUIDE_KEY)).toBe(true);
    expect(
      readDuelGuide({ getItem: (key) => memory.get(key) ?? null }),
    ).toEqual(state);
    expect(
      saveDuelGuide(state, {
        setItem: () => {
          throw Error("full");
        },
      }),
    ).toBe(false);
  });
});

describe("decision-based table space", () => {
  it("keeps the selected Hidden card visible in play mode even when hiding is blocked", () => {
    const game = createCombatFixture();
    game.phase = "main";
    game.combat = null;
    game.players[0].hand = ["ogn-057-298"];
    game.players[0].energy = 4;
    game.units = [combatUnit("ally", 0)];
    for (const controller of [0, null] as const) {
      game.fields.forEach((field) => (field.controller = controller));
      const legal = getLegalActions(game, 0);
      const plays = sourceActions(
        game,
        filterHiddenPlayMode(game, legal, "hand:0", "play"),
        "hand:0",
      );
      expect(plays.some((action) => action.targetId === "ally")).toBe(true);
      expect(plays.some((action) => action.id.startsWith("hide:"))).toBe(false);
      expect(tableFocus(game, plays, "hand:0", false)).toBe("balanced");
    }
  });
  it("gives an unselected hand room, then prioritizes its legal destination", () => {
    const game = createTrainingPosition("deploy");
    const legal = getLegalActions(game, 0);
    expect(
      tableFocus(game, sourceActions(game, legal, null), null, false),
    ).toBe("hand");
    expect(
      tableFocus(game, sourceActions(game, legal, "hand:0"), "hand:0", false),
    ).toBe("board");
    expect(tableFocus(game, legal, null, true)).toBe("balanced");
  });
  it("keeps movement and combat visible without changing the game", () => {
    const game = createTrainingPosition("damage");
    const before = structuredClone(game);
    expect(tableFocus(game, getLegalActions(game, 0), null, false)).toBe(
      "board",
    );
    expect(game).toEqual(before);
    const opening = createGame({ seed: 321, firstPlayer: 0 });
    expect(tableFocus(opening, [], null, false)).toBe("opening");
  });
});

describe("observed match debrief", () => {
  it("counts the actual hold point and seeks to the winning frame", () => {
    let game = createTrainingPosition("hold");
    const replay = createReplay(game);
    for (let i = 0; i < 2; i++) {
      const action = getLegalActions(game, game.priorityPlayer).find(
        (action) => action.id === "end-turn",
      )!;
      replay.decisions.push({ action });
      game = applyAction(game, action);
      replay.finalRevision = game.revision!;
    }
    const frames = buildMatchTimeline(
      parseCompletedMatch(JSON.stringify(replay)),
    );
    const before = JSON.stringify(frames);
    const recap = matchDebrief(frames, 0);
    expect(recap.scoring).toEqual({ hold: 1, conquer: 0, effect: 0 });
    expect(recap.moments.at(-1)?.kind).toBe("finish");
    expect(frames[recap.moments.at(-1)!.frame].views[0].winner).toBe(0);
    expect(JSON.stringify(frames)).toBe(before);
    expect(matchDebrief(frames, 1).scoring.hold).toBe(0);
  });
  it("reports resource balances without inventing a missed response or private information", () => {
    const game = createTrainingPosition("deploy");
    const next = structuredClone(game);
    game.players[0].runes = [{ id: "one", domain: "Calm", ready: true }];
    next.players[0].runes = [{ id: "one", domain: "Calm", ready: false }];
    game.players[1].hand = next.players[1].hand = ["enemy-private-secret"];
    const frames = [viewFrame(game, -1), viewFrame(next, 0, 0)];
    const recap = matchDebrief(frames, 0);
    expect(recap.moments[0].kind).toBe("resources");
    expect(recap.moments[0].values).toEqual({
      before: 1,
      after: 0,
      totalBefore: 1,
      totalAfter: 1,
    });
    expect(JSON.stringify(recap)).not.toMatch(
      /enemy-private|missed|should have|would have/,
    );
  });
  it("distinguishes a response from passing and only uses the requested perspective", () => {
    const game = createTrainingPosition("reaction");
    const response = getLegalActions(game, 0).find(
      (action) => action.sourceId === "hand:0",
    )!;
    const result = applyActionStepped(game, response);
    const frames = [
      viewFrame(game, -1),
      ...result.frames.map((frame) => viewFrame(frame.state, 0, 0)),
    ];
    expect(
      matchDebrief(frames, 0).moments.some(
        (moment) => moment.kind === "response",
      ),
    ).toBe(true);
    expect(
      matchDebrief(frames, 1).moments.some(
        (moment) => moment.kind === "response",
      ),
    ).toBe(false);
    const pass = applyAction(game, "pass");
    expect(
      matchDebrief(
        [viewFrame(game, -1), viewFrame(pass, 0, 0)],
        0,
      ).moments.some((moment) => moment.kind === "response"),
    ).toBe(false);
    expect(matchDebrief([], 0)).toEqual({
      scoring: { hold: 0, conquer: 0, effect: 0 },
      moments: [],
    });
  });
});
