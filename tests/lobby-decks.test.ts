import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
import { Lobby } from "../src/components/Lobby";
import { decks, officialPreconDecks } from "../src/data/decks";
import { LanguageProvider } from "../src/i18n";
import { deckBattlefieldChoices } from "../src/game/battlefield-selection";

afterEach(() => vi.unstubAllGlobals());

function renderLobby(group: string, selectedId = "precon-zed") {
  return renderToStaticMarkup(
    createElement(Lobby, {
      allDecks: decks,
      visibleDecks: decks.filter((deck) => deck.product === group),
      playerDeck: decks.find((deck) => deck.id === selectedId),
      botDeck: decks.find((deck) => deck.id === "precon-vex"),
      deckGroup: group,
      difficulty: "tactical",
      importedCount: 0,
      ready: true,
      hasMatch: false,
      matchEnded: false,
      onGroup: vi.fn(),
      onPlayer: vi.fn(),
      onBot: vi.fn(),
      onDifficulty: vi.fn(),
      onStart: vi.fn(),
      onResume: vi.fn(),
      onImport: vi.fn(),
      onDetails: vi.fn(),
      onExport: vi.fn(),
      onHelp: vi.fn(),
      onLibrary: vi.fn(),
    }),
  );
}

function selectMarkup(html: string, label: string) {
  const select = html.match(
    new RegExp(`<select aria-label="${label}"[^>]*>([\\s\\S]*?)</select>`),
  );
  expect(select, `Missing ${label} selector`).not.toBeNull();
  return select![1];
}

describe("discoverable precon selection", () => {
  it("shows all 13 official precons on a fresh visit, including later sets", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(App)),
    );
    expect(officialPreconDecks).toHaveLength(13);
    expect(html.match(/class="rift-champion /g)).toHaveLength(13);
    for (const deck of officialPreconDecks)
      expect(html).toContain(`aria-label="Select ${deck.name}"`);
    expect(html).toMatch(/aria-pressed="true">All precons<\/button>/);
    expect(html).toContain("13 precons across all sets.");
  });

  it.each(["Proving Grounds", "Origins", "Vendetta Showdown"])(
    "%s gallery filtering keeps every precon available for either player",
    (group) => {
      const html = renderLobby(group);
      for (const label of ["Your deck", "Opponent’s deck"]) {
        const options = selectMarkup(html, label);
        for (const deck of officialPreconDecks)
          expect(options).toContain(`<option value="${deck.id}"`);
        for (const product of new Set(
          officialPreconDecks.map((deck) => deck.product),
        ))
          expect(options).toContain(`<optgroup label="${product}">`);
      }
      expect(selectMarkup(html, "Your deck")).toContain(
        '<option value="precon-zed" selected="">',
      );
      expect(selectMarkup(html, "Opponent’s deck")).toContain(
        '<option value="precon-vex" selected="">',
      );
    },
  );

  it("highlights the supplied battlefield pool for each selected hero", () => {
    const html = renderLobby("Vendetta Showdown").replaceAll("&#x27;", "'");
    for (const id of ["precon-zed", "precon-vex"])
      for (const card of deckBattlefieldChoices(
        decks.find((deck) => deck.id === id),
      ))
        expect(html).toContain(`aria-label="Select battlefield: ${card.name}"`);
    expect(
      html.match(/role="group" aria-label="Precon battlefields"/g),
    ).toHaveLength(2);
    expect(
      html.match(/aria-label="Select battlefield:[^"]+" aria-pressed="true"/g),
    ).toHaveLength(2);
  });
});
