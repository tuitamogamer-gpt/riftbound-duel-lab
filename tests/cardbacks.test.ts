import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CardSleeve } from "../src/components/CardSleeve";
import {
  CARD_BACK_STORAGE_KEY,
  DEFAULT_CARD_BACK,
  readCardBackPreference,
  resolveCardBack,
  saveCardBackPreference,
  type CardBackId,
} from "../src/data/cardbacks";

describe("local card-back preferences", () => {
  it("remembers a cosmetic choice without storing any game data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(saveCardBackPreference("moonveil", storage)).toBe(true);
    expect(readCardBackPreference(storage)).toBe("moonveil");
    expect([...values.entries()]).toEqual([
      [CARD_BACK_STORAGE_KEY, "moonveil"],
    ]);
  });

  it.each([null, "", "unknown", "ogn-199-298", "/cards/ogn-199-298.webp"])(
    "uses the default for an absent or invalid saved choice: %s",
    (value) => {
      expect(readCardBackPreference({ getItem: () => value })).toBe(
        DEFAULT_CARD_BACK,
      );
    },
  );

  it("does not crash when the browser blocks storage", () => {
    const storage = {
      getItem: () => {
        throw new Error("Storage unavailable");
      },
      setItem: () => {
        throw new Error("Storage unavailable");
      },
    };
    expect(readCardBackPreference(storage)).toBe(DEFAULT_CARD_BACK);
    expect(saveCardBackPreference("sunforge", storage)).toBe(false);
  });

  it("rejects invalid choices instead of persisting an arbitrary image path", () => {
    const setItem = vi.fn();
    expect(
      saveCardBackPreference("/cards/ogn-199-298.webp" as CardBackId, {
        setItem,
      }),
    ).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("face-down artwork privacy", () => {
  const publicSetup = {
    championId: "ogn-004-298",
    legendId: "ogn-001-298",
  };

  it("renders the same decorative back regardless of hidden hand and deck", () => {
    const render = (hand: string[], deck: string[]) => {
      const player = { ...publicSetup, hand, deck };
      return renderToStaticMarkup(createElement(CardSleeve, { player }));
    };
    const first = render(["ogn-199-298"], ["ogn-083-298"]);
    const second = render(["ogn-088-298"], ["ogn-097-298"]);
    expect(first).toBe(second);
    expect(first).toContain("/art/cardbacks/riftglass.webp");
    expect(first).toContain('alt=""');
    expect(first).toContain('aria-hidden="true"');
    expect(first).not.toMatch(/ogn-|data-card-preview|title=/);
  });

  it("uses the chosen collection back independently of public champion identity", () => {
    const first = resolveCardBack("moonveil", publicSetup);
    const second = resolveCardBack("moonveil", {
      championId: "sfd-108-221",
      legendId: "ogn-049-298",
    });
    expect(first.src).toBe("/art/cardbacks/moonveil.webp");
    expect(second.src).toBe(first.src);
  });
});
