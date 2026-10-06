import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findCard } from "../src/catalog";
import { Card, CardDetail } from "../src/components/Card";
import { PreviewPanel } from "../src/components/CardPreview";
import { readCardStatuses } from "../src/components/CardStatusTokens";
import { unitStatuses } from "../src/game/status-presentation";
import { LanguageProvider } from "../src/i18n";
import { createCombatFixture } from "./fixtures/combat";

afterEach(() => vi.unstubAllGlobals());

describe("active state on card surfaces", () => {
  it.each([true, false])(
    "keeps stun distinct from readiness=%s on an interactive card",
    (ready) => {
      const game = createCombatFixture();
      const unit = { ...game.units[0], ready, stunned: true, damage: 2 };
      const statuses = unitStatuses(game, unit);
      const html = renderToStaticMarkup(
        createElement(Card, {
          card: findCard(unit.cardId)!,
          ready,
          damage: unit.damage,
          statuses,
        }),
      );
      expect(html).toContain('data-status-id="stunned"');
      expect(html).toContain('data-status-id="damage"');
      expect(html.includes('class="exhausted-token')).toBe(!ready);
      expect(html).not.toContain('class="damage-badge"');
      expect(html).not.toContain('disabled=""');
      expect(html).toContain("Stunned · Damage 2");
    },
  );

  it("keeps all stacked effects readable in hover and touch details", () => {
    const game = createCombatFixture();
    const unit = {
      ...game.units[0],
      stunned: true,
      buff: 1,
      temporaryMight: -2,
      preventDamage: 3,
      moveLockedTurn: game.turn,
    };
    const statuses = unitStatuses(game, unit);
    const card = findCard(unit.cardId)!;
    const preview = renderToStaticMarkup(
      createElement(PreviewPanel, {
        id: "preview",
        preview: {
          card,
          anchor: {
            dataset: { cardStatuses: JSON.stringify(statuses) },
          } as unknown as HTMLElement,
        },
      }),
    );
    const details = renderToStaticMarkup(
      createElement(CardDetail, {
        card,
        statuses,
        scripted: true,
        onClose: vi.fn(),
      }),
    );
    for (const html of [preview, details]) {
      for (const status of statuses)
        expect(html).toContain(`data-status-id="${status.id}"`);
      expect(html).toContain("Might −2");
      expect(html).toContain("Cannot move this turn.");
      expect(html).toContain('aria-label="Active effects"');
    }
    expect(renderToStaticMarkup(createElement(Card, { card }))).not.toContain(
      "card-status-tokens",
    );
  });

  it.each([
    ["sr", "Omamljena"],
    ["it", "Stordita"],
  ])(
    "localizes accessible stun in %s while keeping its physical token name",
    (locale, label) => {
      vi.stubGlobal("localStorage", { getItem: () => locale });
      const game = createCombatFixture();
      const unit = { ...game.units[0], stunned: true };
      const html = renderToStaticMarkup(
        createElement(
          LanguageProvider,
          null,
          createElement(Card, {
            card: findCard(unit.cardId)!,
            statuses: unitStatuses(game, unit),
          }),
        ),
      );
      expect(html).toContain(label);
      expect(html).toContain("STUNNED");
    },
  );

  it("fails closed for absent or malformed preview metadata", () => {
    for (const value of [undefined, "null", "invalid", "{}", '[{"id":"bad"}]'])
      expect(readCardStatuses(value)).toEqual([]);
  });
});
