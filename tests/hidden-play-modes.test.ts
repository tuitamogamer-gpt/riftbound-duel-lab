import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MatchControls } from "../src/components/MatchControls";
import { cards } from "../src/data/cards";
import { applyAction, getLegalActions } from "../src/game/engine";
import { sourceActions } from "../src/game/flow";
import {
  filterHiddenPlayMode,
  hiddenHandStatus,
} from "../src/game/hidden-presentation";
import { getScript } from "../src/game/scripts";
import { getPaymentPreview } from "../src/game/payment-presentation";
import { combatUnit, createCombatFixture } from "./fixtures/combat";

function position() {
  const game = createCombatFixture();
  game.phase = "main";
  game.combat = null;
  game.units = [combatUnit("guard", 0)];
  game.fields[0].controller = 0;
  game.fields[1].controller = null;
  game.hidden = [];
  game.players[0].hand = ["ogn-083-298"];
  game.players[0].energy = 0;
  game.players[0].power = 0;
  game.players[0].typedPower = {};
  game.players[0].runes = [{ id: "hide-rune", domain: "Fury", ready: false }];
  return game;
}

function controls(game: ReturnType<typeof position>, mode?: "hide" | "play") {
  return renderToStaticMarkup(
    createElement(MatchControls, {
      game,
      legal: getLegalActions(game, 0),
      selected: "hand:0",
      target: null,
      hiddenPlayMode: mode,
      setHiddenPlayMode: vi.fn(),
      clear: vi.fn(),
      act: vi.fn(),
      inspect: vi.fn(),
      resume: vi.fn(),
      review: null,
      paused: false,
      busy: false,
      mulligan: [],
    }),
  );
}

describe("choosing Hide independently from normal card play", () => {
  it("renders Hide first with its rune price and normal play only in the explicit mode", () => {
    const game = position();
    game.players[0].energy = 7;
    const status = hiddenHandStatus(game, "hand:0", getLegalActions(game, 0))!;
    const hidden = controls(game);
    expect(hidden).toContain('data-hidden-mode="hide" aria-pressed="true"');
    expect(hidden).toContain("Hide · 1 Power");
    expect(hidden).toContain("Recycle any rune");
    expect(hidden).toContain(`data-action-id="${status.hideActions[0].id}"`);
    expect(hidden).not.toContain(
      `data-action-id="${status.playActions[0].id}"`,
    );
    expect(hidden).not.toContain("Printed cost");
    const normal = controls(game, "play");
    expect(normal).toContain('data-hidden-mode="play" aria-pressed="true"');
    expect(normal).toContain(`data-action-id="${status.playActions[0].id}"`);
    expect(normal).not.toContain(
      `data-action-id="${status.hideActions[0].id}"`,
    );
    expect(normal).toContain("4 energy · 0 power");
  });

  it("keeps the blocked Hide explanation visible instead of silently offering full-price play", () => {
    const game = position();
    game.fields[0].controller = null;
    game.players[0].energy = 7;
    const html = controls(game);
    expect(html).toContain("Control a battlefield before hiding a card there.");
    expect(html).toContain('data-hidden-mode="play"');
    expect(html).not.toContain("data-action-id=");
  });

  it.each([true, false])(
    "recycles exactly one off-domain rune (ready=%s), without paying the printed four Energy",
    (ready) => {
      const game = position();
      game.players[0].runes[0].ready = ready;
      const legal = getLegalActions(game, 0);
      const status = hiddenHandStatus(game, "hand:0", legal)!;
      expect(status.hideActions).toHaveLength(1);
      expect(status.playActions).toHaveLength(0);
      expect(status.costLabel).toBe("Hide · 1 Power");
      const preview = getPaymentPreview(game, status.hideActions[0])!;
      expect(preview.energy).toBe(0);
      expect(preview.power).toBe(1);
      expect(preview.runes.map((rune) => rune.status)).toEqual(["recycled"]);

      const hidden = applyAction(game, status.hideActions[0]);
      expect(hidden.players[0].runes).toHaveLength(0);
      expect(hidden.players[0].runeDeck).toHaveLength(
        game.players[0].runeDeck.length + 1,
      );
      expect(hidden.players[0].runeDeck.at(-1)).toBe("Fury");
      expect(hidden.players[0].energy).toBe(0);
      expect(hidden.players[0].hand).toHaveLength(0);
      expect(hidden.players[0].cardsPlayedThisTurn).toBe(0);
      expect(hidden.stack).toHaveLength(0);
      expect(hidden.hidden?.[0]).toMatchObject({
        cardId: "ogn-083-298",
        location: "field:0",
        hiddenTurn: game.turn,
      });
      expect(
        getLegalActions(hidden, 0).some((action) =>
          action.sourceId?.startsWith("hidden:"),
        ),
      ).toBe(false);

      hidden.turn++;
      hidden.currentPlayer = 1;
      hidden.priorityPlayer = 0;
      hidden.phase = "showdown";
      const reveal = getLegalActions(hidden, 0).find((action) =>
        action.sourceId?.startsWith("hidden:"),
      )!;
      expect(reveal.detail).toBe("0 energy · 0 power");
      const revealed = applyAction(hidden, reveal);
      expect(revealed.players[0].runes).toHaveLength(0);
      expect(revealed.players[0].energy).toBe(0);
      expect(revealed.players[0].power).toBe(0);
      expect(revealed.hidden).toHaveLength(0);
      expect(revealed.stack.at(-1)?.cardId).toBe("ogn-083-298");
    },
  );

  it("exposes only Hide destinations until Play now is explicitly selected", () => {
    const game = position();
    game.players[0].energy = 7;
    const legal = getLegalActions(game, 0);
    const status = hiddenHandStatus(game, "hand:0", legal)!;
    expect(status.hideActions).toHaveLength(1);
    expect(status.playActions).toHaveLength(1);
    const hiddenMode = filterHiddenPlayMode(game, legal, "hand:0", "hide");
    expect(sourceActions(game, hiddenMode, "hand:0")).toEqual(
      status.hideActions,
    );
    const playMode = filterHiddenPlayMode(game, legal, "hand:0", "play");
    expect(sourceActions(game, playMode, "hand:0")).toEqual(status.playActions);
    expect(hiddenMode.filter((action) => action.sourceId !== "hand:0")).toEqual(
      legal.filter((action) => action.sourceId !== "hand:0"),
    );
    const normalPlay = applyAction(game, status.playActions[0]);
    expect(normalPlay.players[0].energy).toBe(3);
    expect(normalPlay.players[0].runes).toEqual(game.players[0].runes);
    expect(normalPlay.hidden).toHaveLength(0);
    const hide = applyAction(game, status.hideActions[0]);
    expect(hide.players[0].energy).toBe(7);
    expect(hide.players[0].runes).toHaveLength(0);
  });

  it("names the missing battlefield even when a full-cost play is available", () => {
    const game = position();
    game.fields[0].controller = null;
    game.players[0].energy = 7;
    const legal = getLegalActions(game, 0);
    const status = hiddenHandStatus(game, "hand:0", legal)!;
    expect(status.hideActions).toHaveLength(0);
    expect(status.playActions).toHaveLength(1);
    expect(status.hint).toBe(
      "Control a battlefield before hiding a card there.",
    );
    expect(
      sourceActions(
        game,
        filterHiddenPlayMode(game, legal, "hand:0", "hide"),
        "hand:0",
      ),
    ).toHaveLength(0);
  });

  it("reports full slots and accepts Bandle Tree's second slot", () => {
    const game = position();
    game.hidden = [
      {
        id: "occupied",
        owner: 0,
        cardId: "ogn-097-298",
        location: "field:0",
        hiddenTurn: game.turn,
      },
    ];
    expect(
      hiddenHandStatus(game, "hand:0", getLegalActions(game, 0))?.hint,
    ).toBe("Your controlled battlefields have no empty Hidden slots.");
    game.fields[0].cardId = "ogn-278-298";
    expect(
      hiddenHandStatus(game, "hand:0", getLegalActions(game, 0))?.hideActions,
    ).toHaveLength(1);
  });

  it("distinguishes turn, priority, chain and missing Power restrictions", () => {
    const game = position();
    const hint = () =>
      hiddenHandStatus(game, "hand:0", getLegalActions(game, 0))!.hint;
    game.currentPlayer = 1;
    expect(hint()).toBe("You can only hide cards on your own turn.");
    game.currentPlayer = 0;
    game.priorityPlayer = 1;
    expect(hint()).toBe("Wait until you have priority to hide this card.");
    game.priorityPlayer = 0;
    game.stack = [
      {
        id: "response",
        player: 1,
        cardId: "ogn-083-298",
        kind: "spell",
        effects: [{ type: "draw", amount: 2 }],
      },
    ];
    expect(hint()).toBe(
      "Wait for the chain to finish before hiding this card.",
    );
    game.stack = [];
    game.players[0].runes = [];
    expect(hint()).toBe(
      "Hiding needs 1 Power: recycle a ready or exhausted rune.",
    );
  });

  it("shows actual free-hide and Teemo Energy alternatives", () => {
    const game = position();
    game.players[0].runes = [];
    game.players[0].freeHideTurn = game.turn;
    let status = hiddenHandStatus(game, "hand:0", getLegalActions(game, 0))!;
    expect(status.hideActions).toHaveLength(1);
    expect(status.costLabel).toBe("Hide · free");
    expect(applyAction(game, status.hideActions[0]).hidden).toHaveLength(1);
    game.players[0].freeHideTurn = undefined;
    game.players[0].legendId = "ogn-263-298";
    game.players[0].energy = 1;
    status = hiddenHandStatus(game, "hand:0", getLegalActions(game, 0))!;
    expect(status.costLabel).toBe("Hide · 1 Energy");
    expect(status.hideActions[0].id.endsWith(":energy")).toBe(true);
    expect(applyAction(game, status.hideActions[0]).players[0].energy).toBe(0);
  });

  it("includes champion-zone Hidden but preserves ordinary cards and required decisions", () => {
    const game = position();
    game.players[0].championId = "ogn-197-298";
    game.players[0].championAvailable = true;
    expect(
      hiddenHandStatus(game, "champion", getLegalActions(game, 0))?.hideActions,
    ).toHaveLength(1);
    game.players[0].hand.push("ogn-049-298");
    const legal = getLegalActions(game, 0);
    expect(hiddenHandStatus(game, "hand:1", legal)).toBeNull();
    expect(filterHiddenPlayMode(game, legal, "hand:1", "hide")).toBe(legal);
    for (const phase of ["mulligan", "choice", "move", "damage"] as const) {
      game.phase = phase;
      expect(hiddenHandStatus(game, "hand:0", legal)).toBeNull();
      expect(filterHiddenPlayMode(game, legal, "hand:0", "hide")).toBe(legal);
    }
  });

  it("keeps granted hand-play alternatives available in Play now mode", () => {
    const game = position();
    game.players[0].hand = ["sfd-139-221"];
    game.players[0].energy = 3;
    game.players[0].gearPlayPermissions = [{ id: "grant", turn: game.turn }];
    const legal = getLegalActions(game, 0);
    const granted = legal.find(
      (action) => action.sourceId === "hand:0:jayce:grant",
    );
    expect(granted).toBeDefined();
    expect(hiddenHandStatus(game, "hand:0", legal)?.playActions).toContain(
      granted,
    );
    expect(filterHiddenPlayMode(game, legal, "hand:0", "play")).toContain(
      granted,
    );
    expect(filterHiddenPlayMode(game, legal, "hand:0", "hide")).not.toContain(
      granted,
    );
  });

  it("recognizes every catalog face with the Hidden reminder", () => {
    const hiddenFaces = cards.filter((card) =>
      card.text.startsWith("[Hidden]"),
    );
    expect(hiddenFaces.length).toBeGreaterThan(0);
    expect(hiddenFaces.filter((card) => !getScript(card.id)?.hidden)).toEqual(
      [],
    );
  });
});
