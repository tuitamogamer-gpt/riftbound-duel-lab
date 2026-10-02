import { describe, expect, it } from "vitest";
import { cards, getCard, type Card } from "../src/data/cards";
import { compileCardScript } from "../src/game/card-script-compiler";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { cardRegistry, getScript } from "../src/game/scripts";
import type {
  GameAction,
  GameState,
  LocationId,
  Unit,
} from "../src/game/types";

const sample = (
  text: string,
  type: Card["type"] = "Unit",
  extra: Partial<Card> = {},
): Card => ({
  ...getCard("ogn-049-298"),
  id: "compiler-test",
  text,
  type,
  keywords: [],
  tags: [],
  ...extra,
});

describe("complete card text compiler", () => {
  it("accepts empty units, battlefields and runes, but does not invent gear or spell effects", () => {
    for (const type of ["Unit", "Battlefield", "Rune"] as const)
      expect(compileCardScript(sample("", type))).toEqual({
        implemented: true,
      });
    expect(compileCardScript(sample("[NO TEXT]", "Rune"))).toEqual({
      implemented: true,
    });
    for (const type of ["Gear", "Spell", "Legend"] as const)
      expect(compileCardScript(sample("", type))).toBeUndefined();
  });

  it("compiles actual static keywords and leaves keyword amounts intact", () => {
    expect(compileCardScript(getCard("unl-036-219"))).toMatchObject({
      shield: 2,
      keywords: ["Shield 2", "Tank"],
    });
    expect(compileCardScript(getCard("ogs-007-024"))).toMatchObject({
      assault: 2,
      shield: 2,
    });
    expect(compileCardScript(getCard("ven-123-166"))).toMatchObject({
      ambush: true,
    });
    expect(compileCardScript(getCard("ogn-171-298"))).toMatchObject({
      onPlay: [{ type: "predict" }],
    });
    expect(compileCardScript(getCard("sfd-096-221"))).toMatchObject({
      keywords: ["Ganking"],
    });
  });

  it("compiles additional cost keywords and a complete death effect sequence", () => {
    expect(compileCardScript(getCard("ogn-075-298"))).toEqual({
      implemented: true,
      accelerating: true,
      onDeath: [
        { type: "channel", amount: 2 },
        { type: "draw", amount: 1 },
      ],
    });
    expect(compileCardScript(getCard("sfd-021-221"))).toMatchObject({
      onDeath: [
        { type: "token", amount: 2, cardName: "Mech", location: "base" },
      ],
    });
  });

  it("retains Flow costs and energy-only Repeat costs", () => {
    expect(compileCardScript(getCard("ven-049-166"))).toEqual({
      implemented: true,
      flow: { energy: 2, power: 0 },
      spell: [{ type: "draw", amount: 1 }],
    });
    expect(compileCardScript(getCard("sfd-034-221"))).toMatchObject({
      reaction: true,
      repeat: { energy: 2, power: 0 },
      spell: [{ type: "might", amount: 2, target: "anyUnit" }],
    });
    expect(
      compileCardScript(sample("[Repeat] :rb_rune_fury: Draw 1.", "Spell")),
    ).toMatchObject({
      repeat: { energy: 0, power: 1, domain: "Fury" },
      spell: [{ type: "draw", amount: 1 }],
    });
    expect(
      compileCardScript(
        sample("Draw 1.[Flow] :rb_energy_3::rb_rune_mind:", "Spell"),
      ),
    ).toMatchObject({ flow: { energy: 3, power: 1, domain: "Mind" } });
  });

  it("preserves Might restrictions, ownership and optional predict choices", () => {
    expect(compileCardScript(getCard("unl-159-219"))).toMatchObject({
      spell: [{ type: "kill", target: "unitAtBattlefield", maxMight: 3 }],
    });
    expect(compileCardScript(getCard("ogn-092-298"))).toMatchObject({
      onPlay: [{ type: "damage", amount: 6, target: "enemyUnitAtBattlefield" }],
    });
    expect(compileCardScript(getCard("unl-063-219"))).toMatchObject({
      spell: [
        { type: "might", amount: -4, target: "anyUnit" },
        { type: "predict" },
      ],
    });
  });

  it.each([
    "[Shield] When I hold, steal an opponent's turn.",
    "[Ganking] I cannot move to base.",
    "[Vision] Other friendly units have [Vision].",
    "[Shield 3] while I'm alone.",
    "When you play me, draw 1. Then banish me.",
    "When you play me, draw 1 unless an opponent discards a card.",
    "When you play me, if you control a Poro, draw 1.",
    "[Assault 2] (Also destroy all other units.)",
    "When I attack, ready another friendly unit.",
    "[Deathknell] — Ready me.",
    "[Predict 5].",
    "[Shield 0]",
    "[Ganking 3]",
    "Recycle 3 from your trash: Give me +1 :rb_might: this turn.",
    "When you play me, return a unit from your trash to your hand.",
    "When you play me, recycle 2 from your trash.",
    "When you play me, ready up to 2 friendly runes. Deal 2 to an enemy unit.",
    ":rb_exhaust:: Ready up to 2 friendly runes.",
  ])("rejects unsupported full-text semantics: %s", (text) => {
    expect(compileCardScript(sample(text))).toBeUndefined();
  });

  it.each([
    "Deal 3 to a unit. Deal 3 to a unit.",
    "Draw 1. Choose an enemy card and banish it.",
    "Draw 1. (Only during your opponent's turn.)",
    "Give a unit [Assault 2].",
    "Draw 1.[Flow] :rb_energy_2: Then score 1 point.",
    "Draw 1.[Flow] :rb_rune_fury::rb_rune_calm:",
    "[Action] Give a unit [Shield 3] this turn.",
    "Deal 2 to an enemy unit here.",
    "Draw 1.[Level 6][>] Draw 2 instead.",
  ])("refuses partial spell support: %s", (text) => {
    expect(compileCardScript(sample(text, "Spell"))).toBeUndefined();
  });

  it("does not trust keyword metadata or absent equipment panels", () => {
    expect(
      compileCardScript(sample("", "Gear", { tags: ["Equipment"] })),
    ).toBeUndefined();
    expect(compileCardScript(getCard("sfd-095-221"))).toBeUndefined();
    expect(compileCardScript(getCard("sfd-161-221"))).toBeUndefined();
    expect(
      compileCardScript(
        sample("Unrecognized rules.", "Unit", { keywords: ["Tank", "Shield"] }),
      ),
    ).toBeUndefined();
    expect(
      compileCardScript(sample("When I attack, draw 1.", "Gear")),
    ).toBeUndefined();
    expect(
      compileCardScript(
        sample("When you hold here, stun a unit.", "Battlefield"),
      ),
    ).toBeUndefined();
  });

  it("creates independent objects and leaves source records unchanged", () => {
    const card = getCard("sfd-034-221");
    const before = JSON.stringify(card);
    const first = compileCardScript(card)!;
    first.spell![0].amount = 100;
    expect(compileCardScript(card)?.spell?.[0].amount).toBe(2);
    expect(JSON.stringify(card)).toBe(before);
  });

  it("retains the end-of-turn condition and the player's choice of runes", () => {
    const sona = cards.find((c) => c.id.startsWith("ven-sp2-006"))!;
    expect(compileCardScript(sona)).toEqual({
      implemented: true,
      onEnd: [
        {
          type: "readyRunes",
          amount: 4,
          chooseRunes: true,
          optional: true,
          condition: "sourceAtBattlefield",
        },
      ],
    });
    expect(compileCardScript(getCard("ogn-073-298"))).toMatchObject({
      onEnd: [
        {
          type: "readyRunes",
          amount: 4,
          chooseRunes: true,
          condition: "sourceAtBattlefield",
        },
      ],
    });
    expect(
      compileCardScript(
        sample("At the end of your turn, if I'm at a battlefield, ready me."),
      ),
    ).toBeUndefined();
    expect(
      compileCardScript(
        sample("At the end of your turn, if I have a buff, draw 1."),
      ),
    ).toBeUndefined();
    expect(compileCardScript(getCard("ogn-274-298"))).toMatchObject({
      keywords: ["Temporary"],
    });
  });

  it("can compile exact supported text regardless of printing name or set", () => {
    const variants = cards.filter(
      (c) => c.text === getCard("ogn-092-298").text,
    );
    expect(variants.length).toBeGreaterThan(1);
    for (const card of variants)
      expect(compileCardScript(card)).toEqual(compileCardScript(variants[0]));
  });
});

function position(): GameState {
  const s = createGame({ seed: 913 });
  s.phase = "main";
  s.turn = 5;
  s.currentPlayer = 0;
  s.priorityPlayer = 0;
  s.focusPlayer = 0;
  s.units = [];
  s.gears = [];
  s.stack = [];
  s.hidden = [];
  s.combat = null;
  s.pendingChoice = null;
  for (const p of s.players) {
    p.hand = [];
    p.discard = [];
    p.banished = [];
    p.energy = 40;
    p.points = 0;
    p.championAvailable = false;
    p.legendId = "ogs-019-024";
    p.hasBegun = true;
    p.deck = Array(20).fill("ogn-049-298");
    p.runes = Array.from(
      { length: 24 },
      (_, i) => ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"][i % 6],
    ).map((domain, i) => ({
      id: `compiler-rune-${p.id}-${i}`,
      domain,
      ready: true,
    }));
    p.runeDeck = ["Calm", "Calm", "Mind", "Mind"];
  }
  for (const field of s.fields) {
    field.controller = null;
    field.cardId = "ogn-280-298";
  }
  return s;
}
function addUnit(
  s: GameState,
  cardId: string,
  id: string,
  owner: 0 | 1 = 0,
  location: LocationId = "base:0",
): Unit {
  const unit: Unit = {
    id,
    cardId,
    owner,
    location,
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
  s.units.push(unit);
  return unit;
}
function take(
  s: GameState,
  select: string | ((a: GameAction) => boolean),
): GameState {
  const action = getLegalActions(s, s.priorityPlayer).find(
    typeof select === "string" ? (a) => a.id === select : select,
  );
  expect(
    action,
    `Missing action ${String(select)} in ${s.phase}`,
  ).toBeDefined();
  return applyAction(s, action!);
}
function settle(s: GameState): GameState {
  for (let i = 0; i < 80 && (s.stack.length || s.pendingChoice); i++)
    s = take(s, s.pendingChoice ? () => true : "pass");
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function reachRuneChoice(s: GameState): GameState {
  for (let i = 0; i < 10 && s.pendingChoice?.kind !== "readyRunes"; i++)
    s = take(s, s.pendingChoice ? (a) => a.id === "choose-trigger:" : "pass");
  expect(s.pendingChoice?.kind).toBe("readyRunes");
  return s;
}
function play(s: GameState, cardId: string, targetId?: string): GameState {
  return take(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      a.targetId === targetId &&
      !a.repeated &&
      !a.id.includes("accelerate"),
  );
}

describe("compiled cards through the real engine", () => {
  const compiledCards = Object.values(cardRegistry)
    .filter((registration) => registration.status === "compiled")
    .map((registration) => getCard(registration.cardId))
    .filter((card) => ["Unit", "Spell", "Gear"].includes(card.type));

  it.each(compiledCards)(
    "executes the newly compiled $name ($id) without an unsupported effect",
    (card) => {
      let s = position();
      s.players[0].hand = [card.id, "ogn-052-298", "ogn-142-298"];
      addUnit(s, "ogn-142-298", "friendly-base");
      addUnit(s, "ogn-142-298", "friendly-field", 0, "field:0");
      addUnit(s, "ogn-142-298", "enemy-base", 1, "base:1");
      addUnit(s, "ogn-052-298", "enemy-small", 1, "field:1");
      addUnit(s, "ogn-142-298", "enemy-field", 1, "field:1");
      s.fields[0].controller = 0;
      s.fields[1].controller = 1;
      s = take(
        s,
        (a) =>
          a.category === "play" &&
          a.cardId === card.id &&
          a.sourceId === "hand:0" &&
          !a.repeated &&
          !a.id.includes("accelerate"),
      );
      s = settle(s);
      expect(s.players[0].hand).not.toContain(card.id);
      expect(s.log.some((entry) => entry.kind === "error")).toBe(false);
      if (card.type === "Gear" && getScript(card.id)?.abilities?.length) {
        const gear = s.gears.find((g) => g.cardId === card.id)!;
        s = take(s, (a) => a.category === "ability" && a.sourceId === gear.id);
        s = settle(s);
        expect(s.gears.find((g) => g.id === gear.id)?.ready).toBe(false);
      }
    },
  );

  it("plays Premonition and draws exactly three after both priority passes", () => {
    let s = position();
    s.players[0].hand = ["sfd-087-221"];
    s = play(s, "sfd-087-221");
    expect(s.players[0].hand).toHaveLength(0);
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(3);
    expect(s.players[0].discard).toContain("sfd-087-221");
  });

  it("Cloud Drake's entry draws one without replacing its rules with a vanilla unit", () => {
    const card = cards.find((c) => c.name === "Cloud Drake" && !c.variant)!;
    expect(getScript(card.id)).toMatchObject({
      onPlay: [{ type: "draw", amount: 1 }],
    });
    let s = position();
    s.players[0].hand = [card.id];
    s = settle(play(s, card.id));
    expect(s.units.some((u) => u.cardId === card.id)).toBe(true);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Riptide Rex excludes bases and friendly units, then deals the printed damage", () => {
    let s = position();
    s.players[0].hand = ["ogn-092-298"];
    addUnit(s, "ogn-142-298", "enemy-field", 1, "field:0");
    addUnit(s, "ogn-142-298", "enemy-base", 1, "base:1");
    addUnit(s, "ogn-142-298", "friend", 0, "field:1");
    s.fields[0].controller = 1;
    s.fields[1].controller = 0;
    s = settle(play(s, "ogn-092-298"));
    expect(s.units.find((u) => u.id === "enemy-field")?.damage).toBe(6);
    expect(s.units.find((u) => u.id === "enemy-base")?.damage).toBe(0);
    expect(s.units.find((u) => u.id === "friend")?.damage).toBe(0);
  });

  it("enforces Soul Harvest's maximum Might in generated legal actions", () => {
    let s = position();
    s.players[0].hand = ["unl-159-219"];
    addUnit(s, "ogn-052-298", "small", 1, "field:0");
    addUnit(s, "ogn-142-298", "large", 1, "field:0");
    addUnit(s, "ogn-052-298", "base", 1, "base:1");
    s.fields[0].controller = 1;
    const actions = getLegalActions(s, 0).filter(
      (a) => a.cardId === "unl-159-219" && a.category === "play",
    );
    expect(actions.map((a) => a.targetId)).toEqual(["small"]);
    s = settle(play(s, "unl-159-219", "small"));
    expect(s.units.map((u) => u.id)).toEqual(["large", "base"]);
  });

  it("gives a chosen unit Ganking, enabling a move between battlefields", () => {
    let s = position();
    s.players[0].hand = ["sfd-007-221"];
    addUnit(s, "ogn-049-298", "traveler", 0, "field:0");
    s.fields[0].controller = 0;
    s = play(s, "sfd-007-221");
    s = take(
      s,
      (a) => a.id.startsWith("choose-trigger:") && a.targetId === "traveler",
    );
    s = settle(s);
    expect(
      getKeywords(
        s,
        s.units.find((u) => u.id === "traveler")!,
      ),
    ).toContain("Ganking");
    expect(
      getLegalActions(s, 0).some(
        (a) =>
          a.sourceId === "traveler" &&
          a.locationId === "field:1" &&
          a.category === "move",
      ),
    ).toBe(true);
  });

  it("Tasty Faefolk channels exhausted runes and draws on death", () => {
    let s = position();
    s.players[0].hand = ["ogs-022-024"];
    addUnit(s, "ogn-075-298", "fae");
    const runes = s.players[0].runes.length;
    s = settle(play(s, "ogs-022-024", "fae"));
    expect(s.units).toHaveLength(0);
    expect(s.players[0].runes).toHaveLength(runes + 2);
    expect(s.players[0].runes.slice(-2).every((r) => !r.ready)).toBe(true);
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Ferrous Forerunner's death puts both Mechs in base even when a battlefield is controlled", () => {
    let s = position();
    s.players[0].hand = ["ogs-022-024"];
    addUnit(s, "sfd-021-221", "forerunner", 0, "field:0");
    s.fields[0].controller = 0;
    s = settle(play(s, "ogs-022-024", "forerunner"));
    const tokens = s.units.filter((u) => u.cardId === "token-mech");
    expect(tokens).toHaveLength(2);
    expect(
      tokens.every((u) => u.location === "base:0" && !u.ready && u.token),
    ).toBe(true);
  });

  it("Ruined Rex chooses an enemy after death and preserves the source through save/load", () => {
    let s = position();
    s.players[0].hand = ["ogs-022-024"];
    addUnit(s, "unl-067-219", "rex", 0, "base:0");
    addUnit(s, "ogn-142-298", "left", 1, "field:0");
    addUnit(s, "ogn-142-298", "right", 1, "base:1");
    addUnit(s, "ogn-142-298", "friendly", 0, "base:0");
    s.fields[0].controller = 1;
    s = play(s, "ogs-022-024", "rex");
    s = take(take(s, "pass"), "pass");
    expect(s.units.some((u) => u.id === "rex")).toBe(false);
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(s.pendingChoice?.sourceSnapshot).toMatchObject({
      id: "rex",
      cardId: "unl-067-219",
      location: "base:0",
    });
    s = JSON.parse(JSON.stringify(s)) as GameState;
    expect(
      getLegalActions(s, 0)
        .map((a) => a.targetId)
        .sort(),
    ).toEqual(["left", "right"]);
    s = take(s, (a) => a.targetId === "right");
    s = settle(s);
    expect(s.units.find((u) => u.id === "right")?.damage).toBe(4);
    expect(s.units.find((u) => u.id === "left")?.damage).toBe(0);
    expect(s.units.find((u) => u.id === "friendly")?.damage).toBe(0);
  });

  it("Dredge Up can be played from trash for Flow and is banished after resolution", () => {
    let s = position();
    s.players[0].discard = ["ven-049-166"];
    const energy = s.players[0].energy;
    s = take(s, (a) => a.cardId === "ven-049-166" && a.sourceId === "trash:0");
    s = settle(s);
    expect(s.players[0].energy).toBe(energy - 2);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.players[0].discard).not.toContain("ven-049-166");
    expect(s.players[0].banished).toContain("ven-049-166");
  });

  it("Repeat can select different targets and resolves both copies once", () => {
    let s = position();
    s.players[0].hand = ["sfd-034-221"];
    addUnit(s, "ogn-142-298", "a");
    addUnit(s, "ogn-142-298", "b");
    const before = s.units.map((u) => getMight(s, u));
    s = take(
      s,
      (a) =>
        a.cardId === "sfd-034-221" &&
        a.repeated === true &&
        a.targetId === "a" &&
        a.repeatedTargetId === "b",
    );
    s = settle(s);
    expect(s.units.map((u) => getMight(s, u))).toEqual(
      before.map((n) => n + 2),
    );
    expect(
      s.players[0].discard.filter((id) => id === "sfd-034-221"),
    ).toHaveLength(1);
  });

  it("Stellacorn Herder draws when a move from battlefield to base resolves", () => {
    let s = position();
    addUnit(s, "sfd-048-221", "herder", 0, "field:0");
    s.fields[0].controller = 0;
    s = take(
      s,
      (a) =>
        a.id.startsWith("move-start:") &&
        a.sourceId === "herder" &&
        a.locationId === "base:0",
    );
    s = take(s, "move-confirm");
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(1);
    expect(s.units.find((u) => u.id === "herder")?.location).toBe("base:0");
  });

  it("Sona offers up to four chosen exhausted runes and waits for the choice before ending the turn", () => {
    const sona = cards.find((c) => c.id.startsWith("ven-sp2-006"))!;
    let s = position();
    addUnit(s, sona.id, "sona", 0, "field:0");
    s.fields[0].controller = 0;
    for (const rune of s.players[0].runes.slice(0, 6)) rune.ready = false;
    s = take(s, "end-turn");
    s = reachRuneChoice(s);
    expect(s.currentPlayer).toBe(0);
    expect(s.pendingChoice).toMatchObject({ kind: "readyRunes", remaining: 4 });
    expect(getLegalActions(s, 0).some((a) => a.id === "choose-rune:skip")).toBe(
      true,
    );
    for (const index of [5, 3, 1])
      s = take(s, `choose-rune:compiler-rune-0-${index}`);
    s = JSON.parse(JSON.stringify(s)) as GameState;
    expect(s.pendingChoice?.remaining).toBe(1);
    s = take(s, "choose-rune:compiler-rune-0-4");
    s = settle(s);
    expect(s.currentPlayer).toBe(1);
    expect(s.players[0].runes.slice(0, 6).map((r) => r.ready)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
    ]);
  });

  it("Sona can decline the rune choice, and her effect cannot ready runes from base", () => {
    const sona = cards.find((c) => c.id.startsWith("ven-sp2-006"))!;
    let s = position();
    addUnit(s, sona.id, "sona", 0, "field:0");
    s.fields[0].controller = 0;
    s.players[0].runes.forEach((r) => {
      r.ready = false;
    });
    s = reachRuneChoice(take(s, "end-turn"));
    s = take(s, "choose-rune:skip");
    s = settle(s);
    expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    s = position();
    addUnit(s, sona.id, "sona");
    s.players[0].runes.forEach((r) => {
      r.ready = false;
    });
    s = take(s, "end-turn");
    expect(s.stack).toHaveLength(0);
    expect(s.pendingChoice).toBeNull();
    expect(s.currentPlayer).toBe(1);
    expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
  });

  it.each([
    ["moves to base", "ogs-011-024"],
    ["dies", "sfd-066-221"],
  ])(
    "Sona still readies her announced runes if she %s in response to the end trigger",
    (outcome, responseId) => {
      const sona = cards.find((c) => c.id.startsWith("ven-sp2-006"))!;
      let s = position();
      const source = addUnit(s, sona.id, "sona", 0, "field:0");
      if (outcome === "dies") source.damage = 3;
      s.fields[0].controller = 0;
      s.players[0].hand = [responseId];
      s.players[0].power = 20;
      s.players[0].runes.forEach((r) => {
        r.ready = false;
      });
      s = take(s, "end-turn");
      expect(s.pendingChoice?.finalizingTrigger).toBe(true);
      s = take(s, "choose-rune:compiler-rune-0-0");
      expect(s.players[0].runes[0].ready).toBe(false);
      s = take(s, "choose-rune:skip");
      expect(s.stack).toHaveLength(1);
      s = play(s, responseId, "sona");
      s = take(take(s, "pass"), "pass");
      if (outcome === "dies") {
        expect(s.units.some((u) => u.id === "sona")).toBe(false);
        expect(s.players[0].discard).toContain(sona.id);
      } else {
        expect(s.units.find((u) => u.id === "sona")?.location).toBe("base:0");
      }
      s = JSON.parse(JSON.stringify(s)) as GameState;
      s = settle(s);
      expect(s.players[0].runes.filter((r) => r.ready)).toHaveLength(1);
      expect(s.players[0].runes[0].ready).toBe(true);
      expect(s.currentPlayer).toBe(1);
    },
  );

  it("a Temporary unit played directly survives the opponent's turn and dies at its next Beginning before scoring", () => {
    let s = position();
    s.players[0].hand = ["ogn-274-298"];
    s = settle(play(s, "ogn-274-298"));
    expect(s.units[0]).toMatchObject({
      cardId: "ogn-274-298",
      temporary: true,
    });
    s = settle(take(s, "end-turn"));
    expect(s.units).toHaveLength(1);
    s = settle(take(s, "end-turn"));
    expect(s.currentPlayer).toBe(0);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].points).toBe(0);
  });

  it("Ahri's defend hook selects only an enemy here and resolves once per designation", () => {
    let s = position();
    addUnit(s, "sfd-227-221", "ahri", 0, "field:0");
    addUnit(s, "ogn-142-298", "attacker", 1, "field:0");
    addUnit(s, "ogn-142-298", "other-attacker", 1, "field:0");
    addUnit(s, "ogn-142-298", "elsewhere", 1, "base:1");
    s.fields[0].controller = 0;
    s.phase = "showdown";
    s.priorityPlayer = 1;
    s.focusPlayer = 1;
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      designatedUnits: [],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s = take(s, "pass");
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(
      getLegalActions(s, 0)
        .map((a) => a.targetId)
        .sort(),
    ).toEqual(["attacker", "other-attacker"]);
    s = take(s, (a) => a.targetId === "attacker");
    s = settle(s);
    expect(s.units.find((u) => u.id === "attacker")?.temporaryMight).toBe(-2);
    expect(s.units.find((u) => u.id === "other-attacker")?.temporaryMight).toBe(
      0,
    );
    expect(s.pendingChoice).toBeNull();
  });
});
