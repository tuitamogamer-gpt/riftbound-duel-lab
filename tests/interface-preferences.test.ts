import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INTERFACE_PREFERENCES_KEY,
  parseInterfacePreferences,
  setInterfacePreferences,
} from "../src/interface-preferences";

afterEach(() => vi.unstubAllGlobals());

describe("interface preferences", () => {
  it.each([null, "broken", "null", "42", '"high"', "[]"])(
    "recovers safe defaults from an absent or invalid stored value: %s",
    (value) => {
      expect(parseInterfacePreferences(value)).toEqual({
        reducedEffects: false,
        soundEnabled: false,
        boardContrast: "standard",
      });
    },
  );

  it("does not coerce invalid values into accessibility preferences", () => {
    expect(
      parseInterfacePreferences(
        '{"reducedEffects":"false","boardContrast":"bright"}',
      ),
    ).toEqual({
      reducedEffects: false,
      soundEnabled: false,
      boardContrast: "standard",
    });
    expect(
      parseInterfacePreferences(
        '{"reducedEffects":true,"boardContrast":"high"}',
      ),
    ).toEqual({
      reducedEffects: true,
      soundEnabled: false,
      boardContrast: "high",
    });
  });

  it("keeps independent preferences when only one is changed", () => {
    const values = new Map([
      [
        INTERFACE_PREFERENCES_KEY,
        '{"reducedEffects":true,"boardContrast":"standard"}',
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", new EventTarget());
    expect(setInterfacePreferences({ boardContrast: "high" })).toBe(true);
    expect(JSON.parse(values.get(INTERFACE_PREFERENCES_KEY)!)).toEqual({
      reducedEffects: true,
      soundEnabled: false,
      boardContrast: "high",
    });
  });

  it("keeps preferences usable in memory when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const target = new EventTarget();
    const notify = vi.fn();
    target.addEventListener("riftbound:interface-change", notify);
    vi.stubGlobal("window", target);
    expect(setInterfacePreferences({ reducedEffects: true })).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
  });
});
