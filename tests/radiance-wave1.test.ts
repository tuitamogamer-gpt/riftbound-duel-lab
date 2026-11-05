import { describe, expect, it } from "vitest";
import { getCard, referenceCards } from "../src/data/cards";
import { starterDecks, type StarterDeck } from "../src/data/decks";
import {
  applyDecision,
  getDecisionRequest,
  validateDecision,
} from "../src/game/ai/decisions";
import { decideBot } from "../src/game/bot";
import {
  applyAction,
  createGame,
  deserializeGame,
  getKeywords,
  getLegalActions,
  getMight,
  serializeGame,
} from "../src/game/engine";
import {
  radianceWave1Scripts,
  reviewedRadiancePrintings,
} from "../src/game/radiance-wave1";
import { cardRegistry, getScript, isImplemented } from "../src/game/scripts";
import type { GameState, PlayerId } from "../src/game/types";
import { act, addGear, chain, fixture, unit } from "./fixtures/cards";

const rad = (n: number) => `rad-${String(n).padStart(3, "0")}-167`;
const reviewed = new Set(reviewedRadiancePrintings);
const play = (s: GameState, cardId: string, extra = "") =>
  act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (!extra || a.id.includes(extra)),
  );
const target = (s: GameState, cardId: string, targetId: string) =>
  act(
    s,
    (a) =>
      a.category === "play" && a.cardId === cardId && a.targetId === targetId,
  );
const byId = (s: GameState, id: string) => s.units.find((u) => u.id === id)!;
/** Pass through showdowns and combat, taking the first option at choices. */
function settle(s: GameState) {
  for (
    let i = 0;
    i < 100 &&
    (s.combat ||
      s.stack.length ||
      s.pendingChoice ||
      s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    s = applyAction(
      s,
      s.pendingChoice
        ? actions[0]
        : (actions.find((a) => a.id === "pass") ?? actions[0]),
    );
  }
  expect(s.combat).toBeNull();
  return s;
}
function nextOwnTurn(s: GameState) {
  s = chain(act(s, "end-turn"));
  return chain(act(s, "end-turn"));
}

describe("Radiance wave 1 registry", () => {
  it("promotes only the exact reviewed printings", () => {
    expect(reviewedRadiancePrintings).toHaveLength(33);
    for (const card of referenceCards) {
      const entry = cardRegistry[card.id];
      if (reviewed.has(card.id)) {
        expect(entry.status, card.id).not.toBe("unsupported");
        expect(isImplemented(card.id)).toBe(true);
      } else {
        expect(entry.status, card.id).toBe("unsupported");
        expect(entry.reason).toContain("Reference import");
      }
    }
    // Every script names an imported Radiance printing.
    for (const id of Object.keys(radianceWave1Scripts))
      expect(getCard(id).set).toBe("RAD");
  });

  it("reviews showcase K'Sante printings with the same rules face", () => {
    const base = getCard(rad(86));
    for (const id of ["rad-086a-167", "rad-178-167"]) {
      const card = getCard(id);
      for (const key of [
        "name",
        "type",
        "supertype",
        "energy",
        "power",
        "might",
      ] as const)
        expect(card[key]).toEqual(base[key]);
      expect(card.domains).toEqual(base.domains);
      expect(card.tags).toEqual(base.tags);
      expect(base.text.replace(/\s*\([^()]*\)/g, "")).toBe(card.text);
      expect(getScript(id)).toEqual(getScript(rad(86)));
    }
  });

  it("aliases blank Radiance rune variants to the reviewed blank face", () => {
    for (let n = 1; n <= 6; n++) {
      expect(cardRegistry[`rad-r0${n}a`].status).toBe("alias");
      expect(cardRegistry[`rad-r0${n}a`].rulesCardId).toBe(`rad-r0${n}`);
    }
  });
});

describe("Radiance wave 1 behavior", () => {
  it("War Scout can accelerate and gives a unit +2 Might", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [rad(8)];
    s = play(s, rad(8), "accelerate");
    s = chain(s);
    const scout = s.units.find((u) => u.cardId === rad(8))!;
    expect(scout.ready).toBe(true);
    const buffed = s.units.filter((u) => u.temporaryMight === 2);
    expect(buffed).toHaveLength(1);
  });

  it("Antagonistic Apparatus enters ready with a ready Mech beside it", () => {
    let s = fixture();
    s.players[0].hand = [rad(9)];
    s = chain(play(s, rad(9)));
    const apparatus = s.units.find((u) => u.cardId === rad(9))!;
    const mech = s.units.find((u) => u.cardId === "token-mech")!;
    expect(apparatus.ready).toBe(true);
    expect(mech.ready).toBe(true);
    expect(mech.location).toBe(apparatus.location);
    expect(getMight(s, mech)).toBe(3);
  });

  it("Industrious Mechsmith plays an exhausted 3 Might Mech here", () => {
    let s = fixture();
    s.players[0].hand = [rad(49)];
    s = chain(play(s, rad(49)));
    const mech = s.units.find((u) => u.cardId === "token-mech")!;
    expect(mech.ready).toBe(false);
    expect(mech.location).toBe("base:0");
  });

  it("Riptide Mage gives only an enemy unit -3 Might", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 5), unit("enemy", 1, "base:1", 5)];
    s.players[0].hand = [rad(58)];
    s = chain(play(s, rad(58)));
    expect(byId(s, "enemy").temporaryMight).toBe(-3);
    expect(byId(s, "ally").temporaryMight).toBe(0);
  });

  it("Supernova deals 10 to any unit and draws 2", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "base:1", 9)];
    s.players[0].hand = [rad(59)];
    s = chain(target(s, rad(59), "enemy"));
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toHaveLength(2);
  });

  it("Staunch Survivor and Wrath of the Freljord carry their printed keywords", () => {
    const survivor = getScript(rad(88))!;
    expect([survivor.assault, survivor.shield]).toEqual([2, 2]);
    let s = fixture();
    s.players[0].hand = [rad(77)];
    s = chain(play(s, rad(77)));
    const wrath = s.units.find((u) => u.cardId === rad(77))!;
    expect(wrath.ready).toBe(true);
    expect(getKeywords(s, wrath)).toContain("Shield 3");
  });

  it("Pitiless Stalker exhausts to stun an enemy unit", () => {
    let s = fixture();
    s.units = [
      { ...unit("stalker", 0, "base:0", 5), cardId: rad(104) },
      unit("ally", 0, "base:0", 2),
      unit("enemy", 1, "base:1", 5),
    ];
    const targets = getLegalActions(s, 0).filter(
      (a) => a.sourceId === "stalker" && a.category === "ability",
    );
    expect(targets.map((a) => a.targetId)).toEqual(["enemy"]);
    s = chain(act(s, (a) => a === targets[0] || a.id === targets[0].id));
    expect(byId(s, "enemy").stunned).toBe(true);
    expect(byId(s, "stalker").ready).toBe(false);
  });

  it("K'Sante, Courageous channels one ready rune when he holds", () => {
    let s = fixture();
    s.units = [{ ...unit("ksante", 0, "field:0", 4), cardId: rad(86) }];
    s.fields[0].controller = 0;
    const before = s.players[0].runes.length;
    s = nextOwnTurn(s);
    const channeled = s.players[0].runes.slice(before);
    expect(s.players[0].points).toBeGreaterThanOrEqual(1);
    // The Channel Phase adds two runes; K'Sante's hold adds the third.
    expect(channeled.length).toBeGreaterThanOrEqual(3);
    expect(s.log.some((l) => /channels 1 rune\(s\) ready/.test(l.text))).toBe(
      true,
    );
  });

  it("Suave Negotiator draws one card for each player", () => {
    let s = fixture();
    s.players[0].hand = [rad(99)];
    s = chain(play(s, rad(99)));
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[1].hand).toHaveLength(1);
  });

  it("Hunting Dog leaves a 1 Might Deflect Bird in its owner's base", () => {
    let s = fixture();
    s.units = [{ ...unit("dog", 0, "field:0", 3), cardId: rad(119) }];
    s.players[0].hand = [rad(59)];
    s = chain(target(s, rad(59), "dog"));
    const bird = s.units.find((u) => u.cardId === "token-bird")!;
    expect(bird.owner).toBe(0);
    expect(bird.location).toBe("base:0");
    expect(getMight(s, bird)).toBe(1);
    expect(getKeywords(s, bird)).toContain("Deflect");
  });

  it("Sneaky Zeebles adds one Power of any domain when it conquers", () => {
    let s = fixture();
    s.units = [{ ...unit("zeebles", 0, "base:0", 1), cardId: rad(76) }];
    const power = s.players[0].power ?? 0;
    s = settle(act(act(s, "move-start:zeebles:field:0"), "move-confirm"));
    expect(s.players[0].points).toBe(1);
    expect(s.players[0].power).toBe(power + 1);
  });

  it("Disarm gives an enemy unit here -1 Might when the unit attacks", () => {
    for (const cardId of [rad(54), rad(97)]) {
      let s = fixture();
      s.units = [
        { ...unit("disarmer", 0, "base:0", 20), cardId },
        unit("enemy", 1, "field:0", 3),
      ];
      s.fields[0].controller = 1;
      s = act(act(s, "move-start:disarmer:field:0"), "move-confirm");
      expect(s.stack).toHaveLength(1);
      s = act(act(s, "pass"), "pass");
      expect(byId(s, "enemy").temporaryMight).toBe(-1);
      expect(getMight(s, byId(s, "enemy"))).toBe(2);
      s = settle(s);
      expect(s.units.map((u) => u.id)).toEqual(["disarmer"]);
      expect(s.players[0].points).toBe(1);
    }
    const siren = { ...unit("siren", 0, "base:0", 1), cardId: rad(97) };
    expect(getKeywords(fixture(), siren)).toEqual(
      expect.arrayContaining(["Disarm", "Ganking"]),
    );
  });

  it("Disarm does not trigger while defending", () => {
    let s = fixture();
    s.units = [
      { ...unit("peddler", 1, "field:0", 3), cardId: rad(54) },
      unit("attacker", 0, "base:0", 20),
    ];
    s.fields[0].controller = 1;
    s = act(act(s, "move-start:attacker:field:0"), "move-confirm");
    expect(s.stack).toHaveLength(0);
    s = settle(s);
    expect(byId(s, "attacker").temporaryMight).toBe(0);
  });

  it("Lost to the Sands offers both modes with their own legal targets", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:0", 4), unit("home", 1, "base:1", 4)];
    addGear(s, 33, "gear", undefined, 1);
    s.players[0].hand = [rad(13)];
    const options = getLegalActions(s, 0).filter((a) => a.cardId === rad(13));
    expect(options.map((a) => a.targetId).sort()).toEqual(["enemy", "gear"]);
    s = chain(act(s, (a) => a.cardId === rad(13) && a.targetId === "gear"));
    expect(s.gears).toHaveLength(0);
    s.players[0].hand = [rad(13)];
    s = chain(act(s, (a) => a.cardId === rad(13) && a.targetId === "enemy"));
    expect(s.units.map((u) => u.id)).toEqual(["home"]);
  });

  it("Consult the Heavens gives Shield 2 this turn and then predicts", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "field:0", 3)];
    s.players[0].hand = [rad(25)];
    s = target(s, rad(25), "ally");
    s = act(act(s, "pass"), "pass");
    expect(s.pendingChoice?.kind).toBe("predict");
    s = chain(act(s, "choose-predict:recycle"));
    expect(byId(s, "ally").temporaryKeywords).toContain("Shield 2");
    expect(s.players[0].deck).toHaveLength(30);
  });

  it("Avalanche deals 3 to units in both bases only", () => {
    let s = fixture();
    s.units = [
      unit("mine", 0, "base:0", 3),
      unit("theirs", 1, "base:1", 4),
      unit("field", 1, "field:0", 3),
    ];
    s.players[0].hand = [rad(79)];
    s = chain(play(s, rad(79)));
    expect(s.units.map((u) => u.id).sort()).toEqual(["field", "theirs"]);
    expect(byId(s, "theirs").damage).toBe(3);
    expect(byId(s, "field").damage).toBe(0);
  });

  it("Raucous Anthem readies your units and gives them +3 Might", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 0, "base:0", 2), ready: false },
      { ...unit("b", 0, "field:0", 2), ready: false },
      { ...unit("enemy", 1, "base:1", 2), ready: false },
    ];
    s.players[0].hand = [rad(134)];
    s = chain(play(s, rad(134)));
    expect(["a", "b"].map((id) => byId(s, id).ready)).toEqual([true, true]);
    expect(["a", "b"].map((id) => byId(s, id).temporaryMight)).toEqual([3, 3]);
    expect(byId(s, "enemy").ready).toBe(false);
    expect(byId(s, "enemy").temporaryMight).toBe(0);
  });

  it("Bilgewater Tracker deals 1 to each of up to two units", () => {
    let s = fixture();
    s.units = [unit("x", 1, "base:1", 3), unit("y", 1, "field:0", 3)];
    s.players[0].hand = [rad(3)];
    s = play(s, rad(3));
    const pair = getLegalActions(s, s.priorityPlayer).find(
      (a) => a.targetId?.split("~").sort().join("~") === "x~y",
    );
    expect(pair).toBeDefined();
    s = chain(act(s, (a) => a.id === pair!.id));
    expect([byId(s, "x").damage, byId(s, "y").damage]).toEqual([1, 1]);
  });

  it("restores reviewed Radiance cards from a saved game", () => {
    let s = fixture();
    s.units = [{ ...unit("ksante", 0, "field:0", 4), cardId: rad(86) }];
    s.players[0].hand = [rad(59), "rad-r01"];
    const restored = deserializeGame(serializeGame(s));
    expect(restored.units[0].cardId).toBe(rad(86));
    expect(restored.players[0].hand).toEqual([rad(59), "rad-r01"]);
  });
});

describe("Radiance wave 1 in complete bot games", () => {
  function radianceDeck(seed: number): StarterDeck {
    const faces = Object.keys(radianceWave1Scripts).filter(
      (id) =>
        !getCard(id).variant && ["Unit", "Spell"].includes(getCard(id).type),
    );
    const main = [
      ...faces.flatMap((id) => [id, id]),
      faces[seed % faces.length],
    ];
    return {
      ...starterDecks[0],
      id: `radiance-wave1-${seed}`,
      main: [...new Set(main)].map((cardId) => ({
        cardId,
        count: main.filter((id) => id === cardId).length,
      })),
      // Mixed domains deliberately exercise every reviewed rune printing.
      runes: [1, 2, 3, 4, 5, 6].map((n) => ({
        cardId: seed % 2 ? `rad-r0${n}` : `rad-r0${n}a`,
        count: 2,
      })),
    };
  }

  it.each([5, 18])(
    "seed %i plays legal bot decisions to a winner",
    async (seed) => {
      let state = createGame({
        playerDeck: radianceDeck(seed),
        botDeck: radianceDeck(seed + 1),
        seed,
        firstPlayer: (seed % 2) as PlayerId,
        botDifficulty: "beginner",
      });
      const played = new Set<string>();
      let steps = 0;
      while (state.winner === null && steps < 3000) {
        if (steps % 25 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const request = getDecisionRequest(state)!;
        const result = decideBot(state, state.priorityPlayer, {
          deterministic: true,
          maxNodes: 80,
        });
        expect(result, `step ${steps}: bot decision`).not.toBeNull();
        expect(
          validateDecision(state, request, result!.decision).valid,
          `step ${steps}: legal decision`,
        ).toBe(true);
        state = applyDecision(state, request, result!.decision);
        for (const piece of state.units)
          if (piece.cardId.startsWith("rad-")) played.add(piece.cardId);
        steps++;
      }
      expect(state.winner, `stalled after ${steps} decisions`).not.toBeNull();
      expect(played.size).toBeGreaterThan(3);
      expect(deserializeGame(serializeGame(state))).toEqual(state);
    },
    180_000,
  );
});
