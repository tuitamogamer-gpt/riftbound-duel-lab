import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App from "../src/App";
import {
  LanguageProvider,
  LANGUAGE_KEY,
  messages,
  readLanguage,
  translate,
} from "../src/i18n";
import type { Locale } from "../src/i18n";

afterEach(() => vi.unstubAllGlobals());

describe("language preferences", () => {
  it("defaults to English, regardless of browser language or invalid stored values", () => {
    vi.stubGlobal("navigator", { language: "sr-RS" });
    for (const value of [null, "", "bs", "ENG", "fr"])
      expect(readLanguage({ getItem: () => value })).toBe("en");
  });
  it("restores supported choices and tolerates blocked storage", () => {
    for (const locale of ["en", "sr", "it"] as const)
      expect(
        readLanguage({
          getItem: (key) => (key === LANGUAGE_KEY ? locale : null),
        }),
      ).toBe(locale);
    expect(
      readLanguage({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe("en");
  });
});

describe("translation coverage", () => {
  it("has complete translations and preserves all named values in every language", () => {
    const placeholders = (s: string) =>
      [...new Set(s.match(/\{[a-zA-Z]\w*\}/g) ?? [])].sort();
    for (const [key, translations] of Object.entries(messages)) {
      expect(translations, key).toHaveLength(3);
      for (const text of translations) {
        expect(text.trim(), key).not.toBe("");
        expect(placeholders(text), `${key}: ${text}`).toEqual(
          placeholders(key),
        );
      }
    }
  });
  it("translates persisted review text at display time and preserves card identities", () => {
    expect(translate("Promijenjeno jedinica: 3.", "en")).toBe(
      "Units changed: 3.",
    );
    expect(
      translate("Detalji {card}", "it", { card: "Jinx, Loose Cannon" }),
    ).toBe("Dettagli di Jinx, Loose Cannon");
    expect(translate("Jinx, Loose Cannon", "sr")).toBe("Jinx, Loose Cannon");
    expect(translate("Pretraži karte")).toBe("Search cards");
    for (const name of ["constructor", "toString", "__proto__"])
      expect(translate(name, "it")).toBe(name);
    expect(translate("Rune", "en")).toBe("Rune");
    expect(translate("Runes", "it")).toBe("Rune");
    expect(
      translate("Assign combat damage: You 3 · Nexus AI 4.", "it"),
    ).not.toContain("Nexus AI");
  });
  it.each([
    ["en", "How to play", "CHOOSE YOUR CHAMPION"],
    ["sr", "Kako igrati", "IZABERI ŠAMPIONA"],
    ["it", "Come giocare", "SCEGLI IL CAMPIONE"],
  ] as [Locale, string, string][])(
    "renders the complete lobby in %s without altering stored deck/filter identifiers",
    (locale, navigation, heading) => {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => (key === LANGUAGE_KEY ? locale : null),
      });
      const html = renderToStaticMarkup(
        createElement(LanguageProvider, null, createElement(App)),
      );
      expect(html).toContain(navigation);
      expect(html).toContain(heading);
      expect(html).toMatch(
        new RegExp(`<option value="${locale}"[^>]* selected=""`),
      );
      expect(html).toContain("ENG · English");
      expect(html).toContain("SRB · Srpski");
      expect(html).toContain("ITA · Italiano");
      if (locale === "en") {
        expect(html.replace(/<[^>]+>/g, "")).not.toMatch(
          /TVOJA|ČEKA|špil|šampiona|Početnik|Taktički/,
        );
      }
    },
  );
});
