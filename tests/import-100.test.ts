import { describe, expect, it } from "vitest";
import ids from "./fixtures/import-100-card-ids.json";
import before from "./fixtures/wave13-unsupported.json";
import { cardRegistry, getScript } from "../src/game/scripts";
import { cardsById } from "../src/data/cards";
describe("next 100 imported printings", () => {
  it("records exactly 100 distinct previously unsupported catalog entries", () => {
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    expect(ids.every((id) => before.includes(id))).toBe(true);
  });
  it.each(ids)(
    "%s has an executable script and a supported catalog registration",
    (id) => {
      expect(cardsById[id]).toBeDefined();
      expect(getScript(id)).toBeDefined();
      expect(cardRegistry[id].status).not.toBe("unsupported");
      expect(cardRegistry[id].script).toEqual(getScript(id));
    },
  );
  it("requires both card types for the later Porobot implementation", () => {
    for (const c of Object.values(cardsById).filter(
      (c) => c.name === "Patched Porobot",
    )) {
      expect(cardRegistry[c.id].status).not.toBe("unsupported");
      expect(getScript(c.id)?.cardTypes).toEqual(["Unit", "Gear"]);
    }
  });
});
