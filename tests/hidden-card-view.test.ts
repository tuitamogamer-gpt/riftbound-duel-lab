import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HiddenCard } from "../src/components/HiddenCard";
import { getCard } from "../src/data/cards";
import { createGame } from "../src/game/engine";
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
