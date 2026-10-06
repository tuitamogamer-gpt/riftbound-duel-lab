import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RulesErrata } from "../src/components/RulesErrata";

const render = (name: string) =>
  renderToStaticMarkup(createElement(RulesErrata, { name }));

describe("current rules beside preserved provider text", () => {
  it.each([
    "Tideturner",
    "Deathgrip",
    "Tianna Crownguard",
    "Guards!",
    "Rengar, Trophy Hunter",
    "Teemo, Strategist",
    "Astral Heron",
  ])("shows an official correction for %s and equivalent printings", (name) => {
    const html = render(name);
    expect(html).toContain("Updated rules");
    expect(html).toContain(
      "https://playriftbound.com/en-us/news/rules-and-releases/",
    );
    expect(render(`${name} (Alternate Art)`)).toBe(html);
  });
  it("does not attach corrections to unrelated names or inherited object keys", () => {
    for (const name of ["Annie", "constructor", "__proto__", "toString"])
      expect(render(name)).toBe("");
  });
});
