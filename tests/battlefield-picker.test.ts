import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { catalog } from "../src/catalog";
import { BattlefieldPicker } from "../src/components/BattlefieldPicker";
import { canonicalCardName } from "../src/data/card-identity";
import {
  officialPreconDecks,
  starterDecks,
  type StarterDeck,
} from "../src/data/decks";
import {
  battlefieldChoices,
  deckBattlefieldChoices,
  defaultBattlefield,
  resolveBattlefieldChoice,
} from "../src/game/battlefield-selection";

function renderPicker(deck: StarterDeck, value = defaultBattlefield(deck)) {
  return renderToStaticMarkup(
    createElement(BattlefieldPicker, {
      deck,
      value,
      onChange: vi.fn(),
      inspect: vi.fn(),
    }),
  ).replaceAll("&#x27;", "'");
}

describe("supplied battlefield selection", () => {
  it.each(officialPreconDecks.map((deck) => [deck.name, deck] as const))(
    "%s prominently offers its supplied pool and keeps alternatives selectable",
    (_name, deck) => {
      const html = renderPicker(deck);
      const supplied = deckBattlefieldChoices(deck);
      expect(supplied).toHaveLength(deck.battlefieldIds!.length);
      expect(html).toContain('role="group" aria-label="Precon battlefields"');
      expect(html).toContain("Supplied with precon");
      for (const card of supplied) {
        expect(html).toContain(`aria-label="Select battlefield: ${card.name}"`);
        expect(html).toContain(`data-card-preview="${card.id}"`);
      }
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(html).toContain("Selected battlefield");
      expect(html).not.toContain('class="battlefield-choice-preview"');
      expect(html).toContain('<optgroup label="Precon battlefields">');
      expect(html).toContain('<optgroup label="Other supported battlefields">');
      for (const card of battlefieldChoices)
        expect(
          html.match(new RegExp(`<option value="${card.id}"`, "g")),
        ).toHaveLength(1);
    },
  );

  it("resolves duplicate printings into one selected tile and one option", () => {
    const printing = catalog.find((card) => {
      const choice = resolveBattlefieldChoice(card.id);
      return choice && choice.id !== card.id;
    });
    expect(printing).toBeDefined();
    const choice = resolveBattlefieldChoice(printing!.id)!;
    expect(canonicalCardName(choice.name)).toBe(
      canonicalCardName(printing!.name),
    );
    const deck: StarterDeck = {
      ...starterDecks[0],
      source: "Imported deck",
      battlefieldId: printing!.id,
      battlefieldIds: [printing!.id, choice.id],
    };
    expect(deckBattlefieldChoices(deck).map((card) => card.id)).toEqual([
      choice.id,
    ]);
    expect(defaultBattlefield(deck)).toBe(choice.id);
    const html = renderPicker(deck, printing!.id);
    expect(html).toContain("Deck battlefields");
    expect(html).toContain("Supplied with deck");
    expect(html).not.toContain("Supplied with precon");
    expect(html.match(/class="battlefield-supplied-choice"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(`<option value="${choice.id}" selected="">`);
  });

  it("shows an inspected preview for a deliberate alternative and keeps the original pool", () => {
    const deck = officialPreconDecks[0];
    const supplied = deckBattlefieldChoices(deck);
    const alternative = battlefieldChoices.find(
      (card) => !supplied.some((field) => field.id === card.id),
    )!;
    const html = renderPicker(deck, alternative.id);
    expect(html).toContain('class="battlefield-choice-preview"');
    expect(html).toContain(`data-card-preview="${alternative.id}"`);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain(
      `aria-label="Select battlefield: ${supplied[0].name}"`,
    );
  });

  it("uses the single supplied field for an empty optional pool and excludes invalid entries", () => {
    const deck = { ...starterDecks[0], battlefieldIds: [] };
    expect(deckBattlefieldChoices(deck).map((card) => card.id)).toEqual([
      resolveBattlefieldChoice(deck.battlefieldId)!.id,
    ]);
    expect(
      deckBattlefieldChoices({
        ...deck,
        battlefieldIds: ["ogn-004-298", "does-not-exist", "token-baron-pit"],
      }),
    ).toEqual([]);
    expect(resolveBattlefieldChoice("ogn-004-298")).toBeUndefined();
  });
});
