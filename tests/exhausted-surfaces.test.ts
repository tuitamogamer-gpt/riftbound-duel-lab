import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findCard } from "../src/catalog";
import { PreviewPanel } from "../src/components/CardPreview";
import { GearChip } from "../src/components/GearChip";
import {
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import { LanguageProvider } from "../src/i18n";

const gear = findCard("ogn-090-298")!;
const tokenPath = "/art/tokens/exhausted-square.png";
const renderGear = (ready: boolean) =>
  renderToStaticMarkup(
    createElement(GearChip, {
      card: gear,
      ready,
      onClick: () => {},
    }),
  );
const renderPreview = (ready?: string) =>
  renderToStaticMarkup(
    createElement(PreviewPanel, {
      id: "preview",
      preview: {
        card: gear,
        anchor: { dataset: { cardReady: ready } } as unknown as HTMLElement,
      },
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("exhaustion on gear and live previews", () => {
  it("marks exhausted gear accessibly while keeping inspection and selection available", () => {
    const html = renderGear(false);
    expect(html).toContain(tokenPath);
    expect(html).toContain('data-card-ready="false"');
    expect(html).toContain('aria-label="Orb of Regret: Exhausted"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain(`data-card-preview="${gear.id}"`);
    expect(renderGear(true)).not.toContain(tokenPath);
    expect(renderGear(true)).toContain('data-card-ready="true"');
  });

  it("uses the visible activation frame for a gear token before the ability resolves", () => {
    const state = createGame({ seed: 78 });
    state.phase = "main";
    state.turn = 5;
    state.currentPlayer = state.priorityPlayer = state.focusPlayer = 0;
    state.players[0].energy = 10;
    state.gears = [{ id: "orb", cardId: gear.id, owner: 0, ready: true }];
    state.units = [
      {
        id: "friend",
        cardId: "ogn-052-298",
        owner: 0,
        location: "base:0",
        ready: true,
        damage: 0,
        buff: 0,
        temporaryMight: 0,
        temporaryAssault: 0,
        stunned: false,
        gear: [],
        summonedTurn: 1,
      },
    ];
    const action = getLegalActions(state, 0).find((a) => a.sourceId === "orb")!;
    expect(action).toBeDefined();
    const result = applyActionStepped(state, action);
    expect(renderGear(state.gears[0].ready)).not.toContain(tokenPath);
    const exhaustedFrame = result.frames.find(
      (frame) => frame.state.gears[0]?.ready === false,
    )!;
    expect(exhaustedFrame).toBeDefined();
    expect(exhaustedFrame.state.stack.length).toBeGreaterThan(0);
    expect(renderGear(exhaustedFrame.state.gears[0].ready)).toContain(
      tokenPath,
    );
    expect(state.gears[0].ready).toBe(true);
  });

  it("shows the same marker on an exhausted preview, then removes it when its source readies", () => {
    const exhausted = renderPreview("false");
    expect(exhausted).toContain(tokenPath);
    expect(exhausted).toContain('role="img" aria-label="Exhausted"');
    expect(renderPreview("true")).not.toContain(tokenPath);
    expect(renderPreview("true")).toContain("Ready");
    expect(renderPreview()).not.toContain(tokenPath);
  });

  it.each([
    ["sr", "Iscrpljena"],
    ["it", "Esausta"],
  ])("localizes gear status in %s", (locale, label) => {
    vi.stubGlobal("localStorage", { getItem: () => locale });
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(GearChip, {
          card: gear,
          ready: false,
          onClick: () => {},
        }),
      ),
    );
    expect(html).toContain(`aria-label="Orb of Regret: ${label}"`);
    expect(html).toContain(tokenPath);
  });
});
