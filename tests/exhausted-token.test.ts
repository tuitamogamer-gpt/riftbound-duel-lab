import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findCard } from "../src/catalog";
import { Card } from "../src/components/Card";
import { ChampionZone } from "../src/components/ChampionZone";
import { ExhaustedToken } from "../src/components/ExhaustedToken";
import { RuneCard } from "../src/components/RuneCard";
import { createGame } from "../src/game/engine";
import { LanguageProvider } from "../src/i18n";

afterEach(() => vi.unstubAllGlobals());

const tokenMarker = 'class="exhausted-token';
const sampleCard = findCard("ogs-007-024")!;

describe("Exhausted token follows public readiness", () => {
  it.each([undefined, true, false])(
    "shows a token only for explicit ready=false (received %s)",
    (ready) => {
      const html = renderToStaticMarkup(
        createElement(ExhaustedToken, { ready }),
      );
      expect(html.includes(tokenMarker)).toBe(ready === false);
      if (ready === false) {
        expect(html).toContain('src="/art/tokens/exhausted-square.png"');
        expect(html).toContain('role="img" aria-label="Exhausted"');
        expect(html).toContain('class="exhausted-token-label"');
      } else {
        expect(html).toBe("");
      }
    },
  );

  it("does not confuse an unaffordable hand card with an exhausted card", () => {
    const html = renderToStaticMarkup(
      createElement(Card, { card: sampleCard, disabled: true }),
    );
    expect(html).toContain("muted");
    expect(html).not.toContain(tokenMarker);
    expect(html).not.toContain("Exhausted");
  });

  it("updates the card marker and accessible status from the current readiness value", () => {
    for (const ready of [false, true, false, undefined]) {
      const html = renderToStaticMarkup(
        createElement(Card, { card: sampleCard, ready, disabled: true }),
      );
      expect(html.includes(tokenMarker)).toBe(ready === false);
      expect(html.includes(`${sampleCard.name} · Exhausted`)).toBe(
        ready === false,
      );
    }
  });

  it("retains the marker when card art is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(Card, {
        card: { ...sampleCard, image: "" },
        ready: false,
      }),
    );
    expect(html).toContain('class="card-fallback"');
    expect(html).toContain(tokenMarker);
  });

  it.each([true, false])("marks only spent runes (ready=%s)", (ready) => {
    const inspect = vi.fn();
    const html = renderToStaticMarkup(
      createElement(RuneCard, {
        rune: { id: "test-rune", domain: "Mind", ready },
        inspect,
      }),
    );
    expect(html.includes(tokenMarker)).toBe(!ready);
    if (!ready) {
      expect(html).toContain('class="exhausted-token is-compact"');
      expect(html).toContain('class="exhausted-token-label"');
      expect(html).toContain('aria-hidden="true">EXHAUSTED</span>');
      expect(html).toContain(" · Exhausted");
    }
    expect(inspect).not.toHaveBeenCalled();
  });

  it.each([0, 1] as const)(
    "marks player %i's exhausted Legend and preserves name-hover readiness across turns",
    (player) => {
      const game = createGame({ seed: 31 });
      game.turn = 6;
      const before = JSON.stringify(game);
      for (const usedTurn of [4, -1]) {
        game.players[player].legendUsedTurn = usedTurn;
        const html = renderToStaticMarkup(
          createElement(ChampionZone, {
            game,
            player,
            legal: [],
            selected: null,
            select: () => {},
            inspect: () => {},
          }),
        );
        expect(html.includes(tokenMarker)).toBe(usedTurn >= 0);
        expect(html).toContain(
          `data-card-preview="${game.players[player].legendId}" data-card-ready="${usedTurn < 0}"`,
        );
      }
      expect(JSON.stringify(game)).toBe(before);
    },
  );

  it.each([
    ["en", "Exhausted"],
    ["sr", "Iscrpljena"],
    ["it", "Esausta"],
  ] as const)(
    "localizes accessible token text in %s while preserving the EXHAUSTED mark",
    (locale, label) => {
      vi.stubGlobal("localStorage", { getItem: () => locale });
      const html = renderToStaticMarkup(
        createElement(
          LanguageProvider,
          null,
          createElement(ExhaustedToken, { ready: false }),
        ),
      );
      expect(html).toContain(`aria-label="${label}" title="${label}"`);
      expect(html).toContain('aria-hidden="true">EXHAUSTED</span>');
      expect(html).toContain('src="/art/tokens/exhausted-square.png"');
    },
  );
});
