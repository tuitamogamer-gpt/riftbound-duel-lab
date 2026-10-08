import { describe, expect, it } from "vitest";
import { lockBodyScroll } from "../src/hooks/useBodyScrollLock";

describe("overlapping dialog scroll locks", () => {
  it.each(["parent", "inspection"] as const)(
    "keeps the page locked when %s closes first",
    (first) => {
      const body = { style: { overflow: "auto" } } as HTMLElement;
      const parent = lockBodyScroll(body);
      const inspection = lockBodyScroll(body);
      (first === "parent" ? parent : inspection)();
      expect(body.style.overflow).toBe("hidden");
      (first === "parent" ? inspection : parent)();
      expect(body.style.overflow).toBe("auto");
    },
  );

  it("handles repeated cleanup and a later remount without leaving the page locked", () => {
    const body = { style: { overflow: "" } } as HTMLElement;
    const old = lockBodyScroll(body);
    old();
    const current = lockBodyScroll(body);
    old();
    expect(body.style.overflow).toBe("hidden");
    current();
    expect(body.style.overflow).toBe("");
    const next = lockBodyScroll(body);
    next();
    expect(body.style.overflow).toBe("");
  });
});
