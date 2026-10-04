import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HiddenCard } from "../src/components/HiddenCard";
import { getCard } from "../src/data/cards";
import { createGame, getLegalActions } from "../src/game/engine";
import { hiddenCardStatus } from "../src/game/hidden-presentation";
import { combatUnit, createCombatFixture } from "./fixtures/combat";
import type { GameState, PlayerId } from "../src/game/types";

function render(owner: PlayerId, permissionTurn?: number) {
  const game = createGame({ seed: 317 });
  game.turn = 7;
  game.players[0].canLookAtEnemyHiddenTurn = permissionTurn;
  const hidden: NonNullable<GameState["hidden"]>[number] = {
    id: "hidden-1",
    owner,
    cardId: "ogn-199-298",
    location: "field:0",
    hiddenTurn: 6,
  };
  return renderToStaticMarkup(
    createElement(HiddenCard, {
      game,
      hidden,
      select: vi.fn(),
      inspect: vi.fn(),
    }),
  );
}

describe("permission to inspect an opponent's Hidden cards", () => {
  it("never renders an opponent's card identity without current permission", () => {
    for (const turn of [undefined, 6, 8]) {
      const html = render(1, turn);
      expect(html).toContain('disabled=""');
      expect(html).not.toContain("data-card-preview");
      expect(html).not.toContain("data-hidden-source");
      expect(html).not.toContain("Reveal now");
      expect(html).not.toContain("Next turn");
      expect(html).not.toContain("ogn-199-298");
      expect(html).not.toContain(getCard("ogn-199-298").name);
      expect(html).toContain("AI · Hidden card");
    }
  });

  it("exposes the name and preview only in the permitted turn", () => {
    const html = render(1, 7);
    expect(html).toContain('data-card-preview="ogn-199-298"');
    expect(html).toContain(`Opponent Hidden: ${getCard("ogn-199-298").name}`);
    expect(html).not.toContain('disabled=""');
  });

  it("keeps one's own Hidden card selectable without an effect granting permission", () => {
    const html = render(0);
    expect(html).toContain('data-card-preview="ogn-199-298"');
    expect(html).not.toContain('disabled=""');
  });
});

describe("Hidden readiness", () => {
  function readyCard() {
    const game = createCombatFixture();
    game.phase = "main";
    game.combat = null;
    game.fields[0].controller = 0;
    game.units = [combatUnit("guard", 0)];
    const hidden = {
      id: "h",
      owner: 0 as const,
      cardId: "ogn-083-298",
      location: "field:0" as const,
      hiddenTurn: game.turn - 1,
    };
    game.hidden = [hidden];
    return { game, hidden };
  }
  it("highlights a free playable reaction and marks its selection", () => {
    const { game, hidden } = readyCard();
    const html = renderToStaticMarkup(
      createElement(HiddenCard, {
        game,
        hidden,
        legal: getLegalActions(game, 0),
        selected: true,
        select: vi.fn(),
        inspect: vi.fn(),
      }),
    );
    expect(html).toContain("is-playable is-selected");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Reveal now");
  });
  it("explains the same-turn restriction and enemy Saboteur separately", () => {
    const { game, hidden } = readyCard();
    hidden.hiddenTurn = game.turn;
    expect(hiddenCardStatus(game, hidden, getLegalActions(game, 0)).label).toBe(
      "Next turn",
    );
    hidden.hiddenTurn--;
    game.units.push(combatUnit("saboteur", 1, 3, "ogn-018-298"));
    expect(hiddenCardStatus(game, hidden, getLegalActions(game, 0)).label).toBe(
      "Blocked",
    );
  });
  it("distinguishes waiting for priority from a missing legal target", () => {
    const { game, hidden } = readyCard();
    game.priorityPlayer = 1;
    expect(hiddenCardStatus(game, hidden, getLegalActions(game, 0)).label).toBe(
      "Waiting",
    );
    game.priorityPlayer = 0;
    hidden.cardId = "unl-083-219";
    expect(hiddenCardStatus(game, hidden, getLegalActions(game, 0)).label).toBe(
      "Unavailable",
    );
  });
});
