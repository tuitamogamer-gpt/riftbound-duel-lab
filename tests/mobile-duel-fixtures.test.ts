import { describe, expect, it } from "vitest";
import { applyAction, getLegalActions } from "../src/game/engine";
import { getAutomaticAction } from "../src/game/flow";
import { hiddenCardStatus } from "../src/game/hidden-presentation";
import { priorityWindow } from "../src/game/presentation";
import { championMoment } from "../src/game/table-presentation";
import { parseSession } from "../src/persistence";
import {
  createMobileDuelSession,
  mobileDuelModes,
} from "./fixtures/mobile-duel";

describe("mobile browser QA sessions", () => {
  it.each(mobileDuelModes)(
    "restores the deterministic %s decision or review",
    (mode) => {
      const session = createMobileDuelSession(mode);
      expect(createMobileDuelSession(mode)).toEqual(session);
      const restored = parseSession(JSON.stringify(session));
      expect(restored.match).toEqual(JSON.parse(JSON.stringify(session.match)));
      expect(restored.review).toEqual(
        JSON.parse(JSON.stringify(session.review)),
      );
      expect(restored.paused ?? false).toBe(session.paused ?? false);
      expect(restored.match).not.toBeNull();
      expect(getLegalActions(restored.match!, 0)).toEqual(
        getLegalActions(session.match!, 0),
      );
      if (!session.review)
        expect(getAutomaticAction(session.match!)).toBeUndefined();
    },
  );

  it("provides every opening-hand choice and legal hand, champion and targeted plays", () => {
    const opening = createMobileDuelSession("mulligan").match!;
    expect(opening.players[0].hand).toHaveLength(4);
    expect(
      getLegalActions(opening, 0).filter(
        (action) => action.category === "mulligan",
      ),
    ).toHaveLength(11);
    const main = createMobileDuelSession("main").match!;
    expect(main.players[0].hand).toHaveLength(12);
    const legal = getLegalActions(main, 0);
    expect(
      legal.some(
        (action) => action.category === "play" && action.sourceId === "hand:0",
      ),
    ).toBe(true);
    expect(
      legal.some(
        (action) =>
          action.category === "play" &&
          action.sourceId === "hand:1" &&
          action.targetId?.startsWith("mobile-enemy"),
      ),
    ).toBe(true);
    expect(
      legal.some(
        (action) =>
          action.category === "play" && action.sourceId === "champion",
      ),
    ).toBe(true);
  });

  it("leaves movement uncommitted with all eight unit toggles and both final controls", () => {
    const match = createMobileDuelSession("move").match!;
    const legal = getLegalActions(match, 0);
    expect(match.phase).toBe("move");
    expect(match.pendingMove?.unitIds).toEqual(["mobile-move-0"]);
    expect(
      match.units.every((unit) => unit.location === "base:0" && unit.ready),
    ).toBe(true);
    expect(
      legal.filter((action) => action.id.startsWith("move-toggle:")),
    ).toHaveLength(8);
    expect(legal.map((action) => action.id)).toEqual(
      expect.arrayContaining(["move-confirm", "move-cancel"]),
    );
    const confirmed = applyAction(match, "move-confirm");
    expect(
      confirmed.units.find((unit) => unit.id === "mobile-move-0")?.location,
    ).toBe("field:1");
  });

  it("requires actual combat choices and allows responding to the opponent's real spell", () => {
    const combat = createMobileDuelSession("combat").match!;
    expect(combat.phase).toBe("damage");
    expect(
      getLegalActions(combat, 0).some(
        (action) => action.category === "combat" && action.targetId,
      ),
    ).toBe(true);
    const reaction = createMobileDuelSession("reaction").match!;
    expect(priorityWindow(reaction)).toBe("reaction");
    expect(reaction.priorityPlayer).toBe(0);
    expect(reaction.stack[0]).toMatchObject({
      player: 1,
      cardId: "ogn-009-298",
      targetId: "mobile-own-field-0",
    });
    expect(
      getLegalActions(reaction, 0).some(
        (action) =>
          action.category === "play" && action.cardId === "ogn-064-298",
      ),
    ).toBe(true);
    expect(
      getLegalActions(reaction, 0).some((action) => action.id === "pass"),
    ).toBe(true);
  });

  it("distinguishes ready and fresh own Hidden cards and keeps the enemy identity private", () => {
    const match = createMobileDuelSession("hidden").match!;
    const legal = getLegalActions(match, 0);
    const ready = match.hidden!.find(
      (hidden) => hidden.id === "mobile-own-ready",
    )!;
    const fresh = match.hidden!.find(
      (hidden) => hidden.id === "mobile-own-fresh",
    )!;
    const enemy = match.hidden!.find((hidden) => hidden.owner === 1)!;
    expect(hiddenCardStatus(match, ready, legal).ready).toBe(true);
    expect(hiddenCardStatus(match, fresh, legal).label).toBe("Next turn");
    expect(
      legal.some((action) => action.sourceId === "hidden:mobile-own-ready"),
    ).toBe(true);
    expect(match.players[0].canLookAtEnemyHiddenTurn).not.toBe(match.turn);
    const publicIds = [
      ...match.units.map((unit) => unit.cardId),
      ...match.fields.map((field) => field.cardId),
      ...match.players[0].hand,
      ...match.players.flatMap((player) => [
        player.legendId,
        player.championId,
        ...player.discard,
      ]),
    ];
    expect(publicIds).not.toContain(enemy.cardId);
  });

  it("populates every crowded zone and a 12-card hand, and pauses at a public champion arrival", () => {
    const crowded = createMobileDuelSession("crowded").match!;
    for (const location of ["base:0", "base:1", "field:0", "field:1"])
      expect(
        crowded.units.filter((unit) => unit.location === location),
      ).toHaveLength(8);
    expect(crowded.players[0].hand).toHaveLength(12);
    const champion = createMobileDuelSession("champion");
    expect(champion.paused).toBe(true);
    expect(championMoment(champion.review)).not.toBeNull();
  });
});
