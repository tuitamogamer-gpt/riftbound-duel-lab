import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardLibrary } from "../src/components/CardLibrary";
import { catalogMeta, getCard, referenceCards } from "../src/data/cards";
import { referencePreconDecks } from "../src/data/decks";
import { rulesTokens } from "../src/data/tokens";
import { LanguageProvider, LANGUAGE_KEY } from "../src/i18n";

afterEach(() => vi.unstubAllGlobals());

function renderLibrary(locale = "en") {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (key === LANGUAGE_KEY ? locale : null),
  });
  return renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(CardLibrary, { inspect: vi.fn() }),
    ),
  );
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&");

describe("reference catalog presentation", () => {
  it("separates provider printings, reference printings and local rules tokens", () => {
    const html = renderLibrary();
    const snapshot = plainText(
      html.match(/<p class="catalog-snapshot">([\s\S]*?)<\/p>/)![1],
    );
    expect(snapshot).toContain(`${catalogMeta.count} Riftcodex printings`);
    expect(snapshot).toContain(`${referenceCards.length} reference printings`);
    expect(snapshot).toContain(`${rulesTokens.length} rules tokens`);
    expect(snapshot).toContain("Riftcodex snapshot:");
    expect(html).toContain('<option value="RAD">Radiance</option>');
  });

  it("offers two collapsed decklists for inspection without presenting a play action", () => {
    const html = renderLibrary();
    const references = html.slice(
      html.indexOf('<details class="library-references">'),
      html.indexOf('<section class="library-toolbar"'),
    );
    const text = plainText(references);
    expect(referencePreconDecks).toHaveLength(2);
    expect(references.match(/class="library-reference-deck"/g)).toHaveLength(2);
    expect(references).not.toMatch(/<details[^>]*\bopen=/);
    expect(text).toContain("Reference only");
    expect(text).toContain("These decks are not available for play");
    expect(text).toContain("Reference card data: Hextech Analytics");
    expect(references).not.toMatch(
      /Select (?:deck|champion)|Start (?:duel|game)/,
    );
    for (const deck of referencePreconDecks) {
      expect(text).toContain(deck.name);
      for (const id of [
        deck.legendId,
        deck.championId,
        ...deck.main.map((entry) => entry.cardId),
        ...deck.runes.map((entry) => entry.cardId),
        ...(deck.battlefieldIds ?? [deck.battlefieldId]),
      ])
        expect(text).toContain(getCard(id).name);
      expect(references).toContain(
        `href="${deck.sourceUrl ?? deck.sourceUrls?.[0]}"`,
      );
    }
  });

  it.each([
    ["sr", "Samo za pregled", "Pogledaj Radiance karte"],
    ["it", "Solo consultazione", "Vedi le carte Radiance"],
  ])(
    "translates the reference status and action in %s",
    (locale, status, action) => {
      const text = plainText(renderLibrary(locale));
      expect(text).toContain(status);
      expect(text).toContain(action);
      expect(text).not.toContain("These decks are not available for play");
    },
  );
});
