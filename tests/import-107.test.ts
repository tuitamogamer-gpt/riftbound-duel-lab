import { battlefieldChoices } from "../src/game/battlefield-selection";
import { describe, it, expect } from "vitest";
import ids from "./fixtures/import-107-card-ids.json";
import previous from "./fixtures/import-100-card-ids.json";
import { cardRegistry, getScript } from "../src/game/scripts";
import { cardsById } from "../src/data/cards";
import { fixture, unit, act, chain, ogn, sfd, addGear } from "./fixtures/cards";
import {
  applyAction,
  getLegalActions,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { validState, parseSession } from "../src/persistence";
import { getObservation } from "../src/game/ai/observation";
import type { GameState } from "../src/game/types";
const resolve = (s: GameState) => act(act(s, "pass"), "pass");
describe("remaining 107 catalog entries", () => {
  it("records exactly the remaining 107 printings without overlapping the preceding hundred", () => {
    expect(ids).toHaveLength(107);
    expect(new Set(ids).size).toBe(107);
    expect(ids.some((id) => previous.includes(id))).toBe(false);
  });
  it.each(ids)("%s has a supported executable registration", (id) => {
    expect(cardsById[id]).toBeDefined();
    expect(getScript(id)?.implemented).toBe(true);
    expect(cardRegistry[id].status).not.toBe("unsupported");
    expect(cardRegistry[id].script).toEqual(getScript(id));
  });
  it("reserves generated battlefields for card effects instead of deck setup", () => {
    expect(battlefieldChoices.some((c) => c.set === "TOKEN")).toBe(false);
  });
  it("leaves no unsupported entry in the imported catalog", () => {
    expect(
      Object.values(cardRegistry).filter((c) => c.status === "unsupported"),
    ).toEqual([]);
  });
  it("saves and resumes every Rain declaration without paying twice or changing query state", () => {
    let s = fixture();
    s.players[0].hand = [ogn(248)];
    s.units = [unit("a", 1, "field:0", 20)];
    s = act(s, (a) => a.category === "play");
    for (let n = 0; n <= 6; n++) {
      expect(validState(s)).toBe(true);
      const before = JSON.stringify(s),
        actions = getLegalActions(s, 0);
      expect(JSON.stringify(s)).toBe(before);
      const restored = parseSession(
        JSON.stringify({ match: s, review: null }),
      ).match;
      expect(restored).toEqual(s);
      s = applyAction(
        restored!,
        actions.find(
          (a) => a.id === (n < 6 ? "draft:target:a" : "draft:done"),
        )!,
      );
    }
    s = chain(s);
    expect(s.units[0].damage).toBe(12);
  });
  it("Mystic Reversal preserves all repetitions while allowing six new Rain targets without repayment", () => {
    let s = fixture();
    s.units = [unit("a", 0, "field:0", 20), unit("b", 1, "field:0", 20)];
    s.currentPlayer = s.priorityPlayer = 1;
    s.players[1].hand = [ogn(248)];
    s = act(s, (a) => a.category === "play");
    for (let n = 0; n < 6; n++) s = act(s, "draft:target:a");
    s = act(s, "draft:done");
    s = act(s, "pass");
    s.players[0].hand = [ogn(80)];
    s = act(s, (a) => a.category === "play");
    s = resolve(s);
    const energy = s.players[0].energy,
      power = s.players[0].power;
    s = act(s, "choose-custom:retarget:change");
    for (let n = 0; n < 6; n++) s = act(s, "draft:target:b");
    s = act(s, "draft:done");
    expect(s.players[0].energy).toBe(energy);
    expect(s.players[0].power).toBe(power);
    expect(s.stack[0].effects).toHaveLength(6);
    s = chain(s);
    expect(s.units.find((u) => u.id === "a")?.damage).toBe(0);
    expect(s.units.find((u) => u.id === "b")?.damage).toBe(12);
    expect(s.players[1].discard).toContain(ogn(248));
  });
  it("Altar of Blood replaces actual lethal combat before recall and healing", () => {
    let s = fixture();
    s.fields[0].cardId = "unl-206-219";
    s.units = [
      unit("attacker", 0, "field:0", 4),
      unit("defender", 1, "field:0", 4),
    ];
    s.phase = "damage";
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "assign",
      engaged: true,
      total: [4, 4],
      remaining: [4, 4],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    s = act(s, (a) => a.id.startsWith("damage:defender:"));
    while (s.phase === "damage")
      s = act(s, (a) => a.id.startsWith("damage:attacker:"));
    expect(s.pendingChoice?.player).toBe(0);
    s = act(s, "choose-custom:death:altar:attacker");
    s = act(s, "choose-custom:death:decline");
    s = chain(s);
    expect(s.units.map((u) => u.id)).toEqual(["attacker"]);
    expect(s.units[0]).toMatchObject({
      location: "base:0",
      damage: 0,
      ready: false,
    });
    expect(s.players[0].power).toBe(27);
  });
  it("a copied Deathknell remains independent after its Equipment detaches", () => {
    let s = fixture();
    s.units = [{ ...unit("ally"), cardId: ogn(96) }];
    addGear(s, 59, "svell");
    s.stack = [
      {
        id: "equip",
        player: 0,
        cardId: sfd(59),
        kind: "ability",
        sourceId: "svell",
        targetId: "ally",
        effects: [{ type: "equip" }],
      },
    ];
    s = chain(resolve(s));
    s.stack = [
      {
        id: "kill",
        player: 1,
        cardId: ogn(49),
        kind: "ability",
        targetId: "ally",
        effects: [{ type: "kill", target: "anyUnit" }],
      },
    ];
    s = chain(resolve(s));
    expect(s.players[0].hand).toHaveLength(2);
    expect(s.players[0].discard).toEqual([ogn(96)]);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });
  it("public linkage and independent copied state survive bot observation and saved games", () => {
    const s = fixture();
    s.linkedBanishments = [{ sourceId: "gear", owner: 0, ref: "banished:0:1" }];
    s.tokenCopyLinks = [{ original: "one", copy: "two" }];
    expect(getObservation(s, 0).state.linkedBanishments).toEqual(
      s.linkedBanishments,
    );
    expect(deserializeGame(serializeGame(s))).toEqual(s);
  });
});
