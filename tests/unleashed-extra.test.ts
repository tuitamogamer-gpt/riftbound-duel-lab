import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
  getCombatPreview,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import {
  unleashedExtraModule,
  unleashedExtraScripts,
} from "../src/game/unleashed-extra";
import type {
  GameAction,
  GameState,
  LocationId,
  Unit,
} from "../src/game/types";

const card = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function position(): GameState {
  const s = createGame({ seed: 913 });
  Object.assign(s, {
    phase: "main",
    turn: 5,
    currentPlayer: 0,
    priorityPlayer: 0,
    focusPlayer: 0,
    units: [],
    gears: [],
    stack: [],
    hidden: [],
    combat: null,
    pendingChoice: null,
    pendingTriggers: [],
  });
  for (const p of s.players) {
    Object.assign(p, {
      hand: [],
      discard: [],
      banished: [],
      energy: 40,
      power: 40,
      points: 0,
      xp: 0,
      championAvailable: false,
      legendId: "ogn-251-298",
      hasBegun: true,
      deck: Array(30).fill("ogn-049-298"),
      runes: [],
      runeDeck: ["Mind", "Body", "Fury"],
    });
  }
  for (const field of s.fields) {
    field.controller = null;
    field.cardId = "ogn-280-298";
  }
  return s;
}
function unit(
  s: GameState,
  c: string | number,
  uid: string,
  owner: 0 | 1 = 0,
  location: LocationId = `base:${owner}`,
): Unit {
  const u: Unit = {
    id: uid,
    cardId: typeof c === "number" ? card(c) : c,
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
  s.units.push(u);
  return u;
}
function take(
  s: GameState,
  select: string | ((a: GameAction) => boolean),
): GameState {
  const legal = getLegalActions(s, s.priorityPlayer);
  const action = legal.find(
    typeof select === "string" ? (a) => a.id === select : select,
  );
  expect(
    action,
    `Missing action ${String(select)} in ${s.phase}: ${legal.map((a) => a.id).join(", ")}`,
  ).toBeDefined();
  return applyAction(s, action!);
}
function settle(s: GameState): GameState {
  for (
    let i = 0;
    i < 120 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  )
    s = take(s, s.pendingChoice ? () => true : "pass");
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function play(s: GameState, c: number | string, targetId?: string): GameState {
  const cid = typeof c === "number" ? card(c) : c;
  return take(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cid &&
      (targetId === undefined || a.targetId === targetId) &&
      !a.repeated &&
      !a.id.includes("accelerate") &&
      !a.id.includes("additional"),
  );
}
function cast(s: GameState, c: number | string, targetId?: string): GameState {
  s.players[s.priorityPlayer].hand.push(typeof c === "number" ? card(c) : c);
  return settle(play(s, c, targetId));
}
function reachChoice(s: GameState): GameState {
  for (let i = 0; i < 30 && !s.pendingChoice; i++) s = take(s, "pass");
  expect(s.pendingChoice).not.toBeNull();
  return s;
}
function begin(s: GameState): GameState {
  s.currentPlayer = 1;
  s.priorityPlayer = 1;
  s.focusPlayer = 1;
  return take(s, "end-turn");
}

it("derived card views never initialize or reset expansion state", () => {
  const s = position();
  const u = unit(s, 108, "u");
  s.players[0].hand = [card(91), card(89)];
  for (const stale of [false, true]) {
    if (stale)
      (s as GameState & { unleashedExtra: object }).unleashedExtra = {
        turn: -1,
      };
    const before = JSON.stringify(s);
    getMight(s, u);
    getKeywords(s, u);
    getLegalActions(s, 0);
    getCombatPreview(s);
    expect(JSON.stringify(s)).toBe(before);
  }
});

it.each([11, 65, 119, 121, 137, 167, 196])(
  "does not publish UNL%s before its complete finalization flow exists",
  (n) => {
    expect(unleashedExtraScripts[card(n)]).toBeUndefined();
  },
);

describe("additional Unleashed through the real engine", () => {
  it.each(
    Object.keys(unleashedExtraScripts).filter((cid) =>
      ["Unit", "Spell", "Gear"].includes(getCard(cid).type),
    ),
  )(
    "resolves complete registered script %s without an unknown custom effect",
    (cid) => {
      let s = position();
      unit(s, "ogn-049-298", "friend", 0, s.fields[0].id);
      unit(s, "ogn-049-298", "enemy", 1, s.fields[1].id);
      s.fields[0].controller = 0;
      s.fields[1].controller = 1;
      s.players[0].xp = 12;
      s.players[0].hand = [cid];
      s.players[0].discard = ["ogn-049-298"];
      s.gears = [{ id: "gear", cardId: "ogn-024-298", owner: 1, ready: true }];
      if (cid === card(131))
        s.stack.push({
          id: "opponent-spell",
          kind: "spell",
          player: 1,
          cardId: card(91),
          effects: [{ type: "draw", amount: 2 }],
        });
      expect(getScript(cid)?.implemented).toBe(true);
      s = settle(play(s, cid));
      expect(
        s.log.some((entry) =>
          /not scripted|unsupported effect|unknown effect/i.test(entry.text),
        ),
      ).toBe(false);
      if (getCard(cid).type === "Spell")
        expect(s.players[0].discard).toContain(cid);
      else
        expect(
          [...s.units, ...s.gears].some((u) => u.cardId === cid) ||
            s.players[0].hand.includes(cid),
        ).toBe(true);
    },
  );

  it("Flurry announces a legal counter target before responses and counters it", () => {
    let s = position();
    s.players[0].hand = [card(91)];
    s = play(s, 91);
    const target = s.stack[0].id;
    s.players[1].hand = [card(44)];
    s = take(s, "pass");
    const options = getLegalActions(s, 1).filter((a) => a.cardId === card(44));
    expect(options.some((a) => a.targetId === target)).toBe(true);
    expect(options.some((a) => !a.targetId)).toBe(true);
    s = take(s, (a) => a.cardId === card(44) && a.targetId === target);
    expect(s.stack.at(-1)?.effects).toMatchObject([
      { type: "counter", target: "spell" },
    ]);
    expect(s.pendingChoice).toBeNull();
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.units).toHaveLength(0);
  });

  it("Flurry bird mode needs no opponent spell and makes four chosen Bird tokens", () => {
    let s = position();
    s = cast(s, 44);
    expect(s.units).toHaveLength(4);
    expect(
      s.units.every(
        (u) =>
          u.owner === 0 &&
          u.token &&
          getCard(u.cardId).tags.includes("Bird") &&
          getKeywords(s, u).includes("Deflect"),
      ),
    ).toBe(true);
  });

  it("Abandon returns a countered spell and still predicts", () => {
    let s = position();
    s.players[0].hand = [card(91)];
    s = play(s, 91);
    const target = s.stack[0].id;
    s.players[1].hand = [card(131)];
    s = take(s, "pass");
    s = play(s, 131, target);
    s = reachChoice(s);
    expect(s.players[0].hand).toEqual([card(91)]);
    expect(s.players[0].discard).not.toContain(card(91));
    expect(s.pendingChoice?.kind).toBe("predict");
    s = settle(s);
  });

  it("Harpoon damage switches only while a hidden card is controlled", () => {
    for (const hidden of [false, true]) {
      let s = position();
      const target = unit(s, 171, "target", 1, s.fields[1].id);
      s.fields[1].controller = 1;
      if (hidden) {
        unit(s, "ogn-049-298", "guard", 0, s.fields[0].id);
        s.fields[0].controller = 0;
        s.hidden = [
          {
            id: "hidden",
            cardId: card(3),
            owner: 0,
            location: s.fields[0].id,
            hiddenTurn: 1,
          },
        ];
      }
      s = cast(s, 14, target.id);
      expect(s.units.find((u) => u.id === target.id)?.damage).toBe(
        hidden ? 4 : 2,
      );
    }
  });

  it("expensive spell status applies at payment, while Revna and Diana trigger only after resolution", () => {
    let s = position();
    const neophyte = unit(s, 4, "neo");
    unit(s, 5, "revna").ready = false;
    unit(s, 149, "diana");
    const baseMight = getMight(s, neophyte);
    s.players[0].hand = [card(91)];
    s = play(s, 91);
    expect(getMight(s, s.units[0])).toBe(baseMight + 4);
    expect(s.units[1].ready).toBe(false);
    expect(s.units[2].temporaryMight).toBe(0);
    s = settle(s);
    expect(s.units[1].ready).toBe(true);
    expect(s.units[2].temporaryMight).toBe(2);
  });

  it("a countered expensive spell keeps the paid flag but does not trigger when-play effects", () => {
    let s = position();
    unit(s, 5, "revna").ready = false;
    unit(s, 149, "diana");
    unit(s, 4, "neo");
    s.players[0].hand = [card(91)];
    s = play(s, 91);
    const target = s.stack[0].id;
    s.players[1].hand = [card(131)];
    s = take(s, "pass");
    s = settle(play(s, 131, target));
    expect(s.units.find((u) => u.id === "revna")?.ready).toBe(false);
    expect(s.units.find((u) => u.id === "diana")?.temporaryMight).toBe(0);
    expect(
      getMight(
        s,
        s.units.find((u) => u.id === "neo")!,
      ),
    ).toBe((getCard(card(4)).might ?? 0) + 4);
  });

  it.each([false, true])(
    "Jhin can use his alternate cost from %s champion source",
    (champion) => {
      let s = position();
      s = cast(s, 91);
      s.players[0].energy = 0;
      s.players[0].power = 1;
      if (champion) {
        s.players[0].championId = card(89);
        s.players[0].championAvailable = true;
      } else s.players[0].hand.push(card(89));
      s = take(s, (a) => a.abilityKey === "jhin-play");
      expect(s.players[0].energy).toBe(0);
      expect(s.players[0].power).toBe(0);
      s = settle(s);
      expect(s.units.some((u) => u.cardId === card(89))).toBe(true);
      expect(s.players[0].championAvailable).toBe(false);
    },
  );

  it("Jhin's movement adds resources immediately and Lillia leaves a Sprite at her previous location", () => {
    let s = position();
    unit(s, 22, "jhin");
    s = take(
      s,
      (a) =>
        a.category === "move" &&
        a.sourceId === "jhin" &&
        a.locationId === s.fields[0].id,
    );
    s = take(s, "move-confirm");
    expect(s.players[0].energy).toBe(41);
    expect(s.players[0].power).toBe(41);
    expect(s.stack).toHaveLength(0);
    s = position();
    unit(s, 82, "lillia");
    s = take(
      s,
      (a) =>
        a.category === "move" &&
        a.sourceId === "lillia" &&
        a.locationId === s.fields[0].id,
    );
    s = take(s, "move-confirm");
    s = settle(s);
    expect(s.units.find((u) => u.token)).toMatchObject({
      location: "base:0",
      temporary: true,
      ready: false,
    });
  });

  it("Double Trouble reveals its chosen unit and recycles the other viewed cards", () => {
    let s = position();
    const viewed = [card(91), card(92), card(14)];
    const rest = [card(98), card(94)];
    s.players[0].deck = [...viewed, ...rest];
    s.players[0].hand = [card(32)];
    s = reachChoice(play(s, 32));
    s = take(s, (a) => a.label.includes("Demacian Diplomat"));
    s = settle(s);
    expect(s.players[0].hand).toEqual([card(92)]);
    expect(s.players[0].deck.slice(0, 2)).toEqual(rest);
    expect(s.players[0].deck.slice(2).sort()).toEqual(
      [card(91), card(14)].sort(),
    );
    expect(
      s.log.some((e) => e.text.includes("reveals Demacian Diplomat")),
    ).toBe(true);
  });

  it("Fate Weaver rejects cheap spells and Ivern only offers a buff after revealing a matching tribe", () => {
    let s = position();
    s.players[0].deck = [card(14), card(91), card(92), card(94)];
    s.players[0].hand = [card(64)];
    s = reachChoice(play(s, 64));
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.label.startsWith("Reveal"))
        .map((a) => a.label),
    ).toEqual(["Reveal and draw Concentrate"]);
    s = position();
    unit(s, 92, "friend");
    s.players[0].deck = [card(137), card(91), card(14), card(98)];
    s.players[0].hand = [card(51)];
    s = reachChoice(play(s, 51));
    s = take(s, (a) => a.label.includes("Sinister Poro"));
    expect(s.pendingChoice).not.toBeNull();
    s = take(s, (a) => a.targetId === "friend");
    expect(s.units.find((u) => u.id === "friend")?.buff).toBe(0);
    expect(s.stack.some((item) => item.cardId === card(51))).toBe(true);
    s = settle(s);
    expect(s.units.find((u) => u.id === "friend")?.buff).toBe(1);
  });

  it("Dramatic Visionary permits reversed top order without drawing", () => {
    let s = position();
    unit(s, 62, "visionary");
    s.players[0].deck = [card(92), card(94), card(98)];
    s.players[0].hand = [card(180)];
    s = reachChoice(play(s, 180));
    s = take(
      s,
      (a) => a.label === "Keep Gemhand Hunter then Demacian Diplomat",
    );
    s = settle(s);
    expect(s.players[0].deck).toEqual([card(94), card(92), card(98)]);
    expect(s.players[0].hand).toHaveLength(0);
  });

  it("Sprite generation applies token auras and own-token play triggers", () => {
    let s = position();
    unit(s, 58, "lillia");
    unit(s, 77, "shepherd");
    s = cast(s, 69);
    const tokens = s.units.filter((u) => u.token);
    expect(tokens).toHaveLength(2);
    for (const token of tokens) {
      expect(token.ready).toBe(true);
      expect(token.temporary).toBe(true);
      expect(getMight(s, token)).toBe(4);
      expect(getKeywords(s, token)).toContain("Tank");
    }
    expect(s.units.find((u) => u.id === "lillia")?.temporaryMight).toBe(2);
  });

  it("Sprite Fountain creates a ready base token both on play and its next Beginning death", () => {
    let s = position();
    s = cast(s, 78);
    expect(s.gears[0].temporary).toBe(true);
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
    s = settle(begin(s));
    expect(s.gears).toHaveLength(0);
    expect(s.players[0].discard).toContain(card(78));
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
    expect(s.units[0]).toMatchObject({
      ready: true,
      temporary: true,
      location: "base:0",
    });
  });

  it("level thresholds change costs, Might, keywords, and entry readiness", () => {
    let s = position();
    const hunter = unit(s, 94, "hunter"),
      yi = unit(s, 113, "yi"),
      visionary = unit(s, 98, "visionary");
    const initial = [hunter, yi, visionary].map((u) => getMight(s, u));
    s.players[0].xp = 6;
    expect(getMight(s, hunter)).toBe(initial[0] + 1);
    expect(getKeywords(s, yi)).toEqual(
      expect.arrayContaining(["Deflect", "Ganking"]),
    );
    expect(unleashedExtraModule.cost!(s, 0, getCard(card(91)))).toEqual({
      energy: -2,
    });
    s.players[0].xp = 11;
    expect(getMight(s, visionary)).toBe(initial[2] + 4);
    expect(unleashedExtraModule.cost!(s, 0, getCard(card(91)))).toEqual({
      energy: -4,
    });
    s = cast(s, 151);
    expect(s.units.find((u) => u.cardId === card(151))?.ready).toBe(true);
    s.players[0].legendId = card(191);
    s = cast(s, 92);
    expect(s.units.find((u) => u.cardId === card(92))?.ready).toBe(true);
    expect(
      getMight(
        s,
        s.units.find((u) => u.cardId === card(92))!,
      ),
    ).toBe((getCard(card(92)).might ?? 0) + 1);
  });

  it("XP gain remains remembered after spending and expires on the next turn", () => {
    let s = position();
    unit(s, 108, "newtfish");
    unit(s, 102, "favorite");
    const initial = getMight(s, s.units[0]);
    s = cast(s, 157);
    expect(s.players[0].xp).toBe(3);
    expect(getMight(s, s.units[0])).toBe(initial + 1);
    s = settle(take(s, (a) => a.abilityKey === "xp-buff"));
    expect(s.players[0].xp).toBe(1);
    expect(getKeywords(s, s.units[0])).toContain("Ganking");
    expect(getLegalActions(s, 0).some((a) => a.abilityKey === "xp-buff")).toBe(
      false,
    );
    s = take(s, "end-turn");
    expect(getKeywords(s, s.units[0])).not.toContain("Ganking");
  });

  it("Gentle Gemdragon offers real exhausted rune selection and optional stopping", () => {
    let s = position();
    s.players[0].runes = [
      { id: "mind", domain: "Mind", ready: false },
      { id: "body", domain: "Body", ready: false },
      { id: "fury", domain: "Fury", ready: false },
    ];
    s.players[0].hand = [card(104)];
    s = reachChoice(play(s, 104));
    expect(s.pendingChoice?.kind).toBe("readyRunes");
    s = take(s, (a) => a.id.includes("fury"));
    s = take(s, (a) => a.id === "choose-rune:skip");
    s = settle(s);
    expect(s.players[0].runes.map((r) => r.ready)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("death watchers exclude themselves and resolve once for each other friendly death", () => {
    let s = position();
    unit(s, 68, "centaur");
    unit(s, 129, "snapjaws");
    unit(s, 92, "victim", 0, s.fields[0].id);
    s = cast(s, 159, "victim"); // Soul Harvest kills the Diplomat.
    expect(s.players[0].xp).toBe(1);
    expect(s.units.find((u) => u.id === "centaur")?.temporaryMight).toBe(2);
  });

  it("Isolate draws only when exactly one enemy remains at the previous battlefield", () => {
    for (const count of [1, 2, 3]) {
      let s = position();
      for (let n = 0; n < count; n++)
        unit(s, "ogn-049-298", `e${n}`, 1, s.fields[0].id);
      s = cast(s, 124, "e0");
      expect(s.units.find((u) => u.id === "e0")?.location).toBe("base:1");
      expect(s.players[0].hand).toHaveLength(count === 2 ? 1 : 0);
    }
  });

  it("Star-Crossed returns both announced targets to their respective hands", () => {
    let s = position();
    unit(s, 77, "aura", 0);
    unit(s, "ogn-049-298", "wounded", 1);
    s = cast(s, 128, "aura~wounded");
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toContain(card(77));
    expect(s.players[1].hand).toContain("ogn-049-298");
  });

  it("Angler Beast's global return ignores enemy target protection and detaches gear", () => {
    let s = position();
    const tiny = unit(s, "unl-152-219", "tiny", 1);
    tiny.untargetableByEnemy = true;
    tiny.cardId = "ogn-049-298";
    tiny.temporaryMight = 1 - (getCard(tiny.cardId).might ?? 0);
    s.gears = [
      {
        id: "equipment",
        cardId: "ogn-024-298",
        owner: 1,
        ready: true,
        attachedTo: "tiny",
      },
    ];
    tiny.gear = ["equipment"];
    s = cast(s, 132);
    expect(s.units.some((u) => u.id === "tiny")).toBe(false);
    expect(s.players[1].hand).toContain(tiny.cardId);
    expect(s.gears[0].attachedTo).toBeUndefined();
  });

  it("Keeper's Verdict gives the opposing owner the top/bottom decision and detaches gear", () => {
    let s = position();
    unit(s, 98, "enemy", 1, s.fields[0].id);
    s.gears = [
      {
        id: "g",
        cardId: "ogn-024-298",
        owner: 1,
        ready: true,
        attachedTo: "enemy",
      },
    ];
    s.players[0].hand = [card(204)];
    s = reachChoice(play(s, 204, "enemy"));
    expect(s.priorityPlayer).toBe(1);
    s = take(s, (a) => a.label.endsWith("on bottom"));
    s = settle(s);
    expect(s.players[1].deck.at(-1)).toBe(card(98));
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.players[1].discard).not.toContain(card(98));
  });

  it("Lillia's legend cost counts Temporary units and Poro's bird ability requires a battlefield", () => {
    let s = position();
    s.players[0].legendId = card(189);
    s.players[0].energy = 2;
    unit(s, "ogn-274-298", "sprite-a").temporary = true;
    unit(s, "ogn-274-298", "sprite-b").temporary = true;
    unit(s, 160, "poro");
    expect(
      getLegalActions(s, 0).some((a) => a.abilityKey === "poro-birds"),
    ).toBe(false);
    s = settle(take(s, (a) => a.abilityKey === "legend-sprite"));
    expect(s.players[0].energy).toBe(0);
    expect(s.units.filter((u) => u.token)).toHaveLength(1);
    s.units.find((u) => u.id === "poro")!.location = s.fields[0].id;
    s = settle(take(s, (a) => a.abilityKey === "poro-birds"));
    expect(s.units.filter((u) => u.token)).toHaveLength(3);
    expect(s.units.find((u) => u.id === "poro")?.ready).toBe(false);
  });

  it("Rengar triggers a chosen target Might grant and Pyke returns a unit then creates exhausted Gold", () => {
    let s = position();
    s.players[0].legendId = card(183);
    unit(s, 98, "enemy", 1);
    s.players[0].hand = [card(92)];
    s = play(s, 92);
    expect(s.pendingChoice?.kind).toBe("trigger");
    s = take(s, (a) => a.targetId === "enemy");
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.temporaryMight).toBe(1);
    s = position();
    s.players[0].legendId = card(185);
    unit(s, 92, "friend", 0, s.fields[0].id);
    s = settle(
      take(
        s,
        (a) =>
          a.category === "ability" &&
          a.sourceId === "legend" &&
          a.targetId === "friend",
      ),
    );
    expect(s.players[0].hand).toContain(card(92));
    expect(s.gears).toHaveLength(1);
    expect(s.gears[0].ready).toBe(false);
    expect(getCard(s.gears[0].cardId).name).toContain("Gold");
  });

  it("field Shield and lone defender reduction affect only defending units", () => {
    const s = position();
    const field = s.fields[0];
    const u = unit(s, "ogn-274-298", "sprite", 1, field.id);
    u.temporary = true;
    const n = getMight(s, u);
    field.cardId = card(208);
    expect(getMight(s, u)).toBe(n);
    s.combat = {
      fieldId: field.id,
      attacker: 0,
      defender: 1,
      stage: "priority",
      engaged: true,
      designatedUnits: [u.id],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getMight(s, u)).toBe(n + 1);
    expect(getKeywords(s, u)).toContain("Shield");
    field.cardId = card(210);
    expect(getMight(s, u)).toBe(Math.max(0, n - 2));
    unit(s, 98, "other", 1, field.id);
    expect(getMight(s, u)).toBe(n);
  });

  it("Vaults hold penalty starts only after its trigger resolves and expires next turn", () => {
    let s = position();
    s.fields[0].cardId = card(219);
    s.fields[0].controller = 0;
    unit(s, 98, "holder", 0, s.fields[0].id);
    s = begin(s);
    for (
      let i = 0;
      i < 10 && !s.stack.some((item) => item.cardId === card(219));
      i++
    )
      s = take(s, "pass");
    expect(s.stack.some((i) => i.cardId === card(219))).toBe(true);
    expect(unleashedExtraModule.cost!(s, 0, getCard(card(92)))).toEqual({
      energy: 0,
    });
    s = settle(s);
    expect(unleashedExtraModule.cost!(s, 0, getCard(card(92)))).toEqual({
      energy: 1,
    });
    s = take(s, "end-turn");
    expect(unleashedExtraModule.cost!(s, 0, getCard(card(92)))).toEqual({
      energy: 0,
    });
  });

  it("Frozen Fortress damage happens before hold scoring and kills a one-Might holder", () => {
    let s = position();
    const field = s.fields[0];
    field.cardId = card(212);
    field.controller = 0;
    const holder = unit(s, "ogn-049-298", "holder", 0, field.id);
    holder.temporaryMight = 1 - (getCard(holder.cardId).might ?? 0); // Beginning does not clear until previous end; damage instead leaves exactly one health.
    holder.temporaryMight = 0;
    holder.damage = (getCard(holder.cardId).might ?? 1) - 1;
    s.currentPlayer = 1;
    s.priorityPlayer = 1;
    s.focusPlayer = 1;
    s = take(s, "end-turn"); // cleanup removes old damage, so inspect pending fortress ordering explicitly.
    const fortress = s.stack.find((i) => i.cardId === card(212));
    expect(fortress).toBeDefined();
    expect(s.players[0].points).toBe(0);
    s.units.find((u) => u.id === "holder")!.damage =
      getMight(
        s,
        s.units.find((u) => u.id === "holder")!,
      ) - 1;
    s = settle(s);
    expect(s.units.some((u) => u.id === "holder")).toBe(false);
    expect(s.players[0].points).toBe(0);
  });
  it("Angler returns its whole small-unit batch before checking lost-aura lethal damage", () => {
    let s = position();
    const garen = unit(s, "ogs-013-024", "garen");
    garen.temporaryMight = -3;
    const recruit = unit(s, "ogn-271-298", "recruit");
    recruit.token = true;
    recruit.damage = 1;
    unit(s, 129, "snapjaws");
    expect(getMight(s, garen)).toBe(2);
    expect(getMight(s, recruit)).toBe(2);
    s = cast(s, 132);
    expect(s.units.some((u) => ["garen", "recruit"].includes(u.id))).toBe(
      false,
    );
    expect(s.players[0].hand).toContain("ogs-013-024");
    expect(s.players[0].xp).toBe(0);
  });

  it("simultaneously destroyed Snapjaws do not observe allied deaths", () => {
    let s = position();
    unit(s, 129, "snapjaws");
    unit(s, 68, "centaur");
    unit(s, 92, "friend");
    s = cast(s, 180);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].xp).toBe(0);
  });

  it("Chakram Shield excludes itself, follows the recipient, and expires next turn", () => {
    let s = position();
    const f = s.fields[0];
    f.controller = 0;
    unit(s, 92, "friend", 0, f.id);
    s.players[0].hand = [card(71)];
    s = take(s, (a) => a.cardId === card(71) && a.locationId === f.id);
    s = settle(s);
    const friend = s.units.find((u) => u.id === "friend")!;
    const dancer = s.units.find((u) => u.cardId === card(71))!;
    expect(getKeywords(s, friend)).toContain("Shield");
    expect(getKeywords(s, dancer)).not.toContain("Shield");
    const regularMight = getMight(s, friend);
    s.combat = {
      fieldId: f.id,
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(getMight(s, friend)).toBe(regularMight + 1);
    s.turn++;
    expect(getKeywords(s, friend)).not.toContain("Shield");
    expect(getMight(s, friend)).toBe(regularMight);
  });

  it("Yuumi chooses another friendly defender before granting Might and Tank", () => {
    let s = position();
    const f = s.fields[0];
    f.controller = 1;
    unit(s, 56, "yuumi", 1, f.id);
    unit(s, 98, "friend", 1, f.id);
    unit(s, 98, "attacker");
    s = take(
      s,
      (a) =>
        a.category === "move" &&
        a.sourceId === "attacker" &&
        a.locationId === f.id,
    );
    s = take(s, "move-confirm");
    s = settle(s);
    const friend = s.units.find((u) => u.id === "friend")!;
    expect(friend.temporaryMight).toBe(3);
    expect(getKeywords(s, friend)).toContain("Tank");
    expect(s.units.find((u) => u.id === "yuumi")?.temporaryMight).toBe(0);
  });

  it("Petal Pixie counts friendly Temporary units only at its battlefield", () => {
    const s = position();
    const pixie = unit(s, 76, "pixie", 0, s.fields[0].id);
    const printed = getMight(s, pixie);
    unit(s, "ogn-274-298", "own", 0, s.fields[0].id).temporary = true;
    unit(s, "ogn-274-298", "enemy", 1, s.fields[0].id).temporary = true;
    unit(s, "ogn-274-298", "away").temporary = true;
    expect(getMight(s, pixie)).toBe(printed + 1);
    pixie.location = "base:0";
    expect(getMight(s, pixie)).toBe(printed);
  });

  it("Dragonsoul Sage exhausts and adds energy without creating a reaction window", () => {
    let s = position();
    unit(s, 93, "sage");
    s = take(s, (a) => a.sourceId === "sage" && a.category === "ability");
    expect(s.players[0].energy).toBe(41);
    expect(s.units[0].ready).toBe(false);
    expect(s.stack).toHaveLength(0);
  });

  it.each([4, 5])(
    "Poppy's catch-up play effect checks opposing score %s",
    (points) => {
      let s = position();
      s.players[1].points = points;
      s = cast(s, 116);
      expect(s.units[0].ready).toBe(points >= 5);
      expect(s.players[0].xp).toBe(points >= 5 ? 3 : 0);
    },
  );

  it("Kinkou's draw counts the other units' current total Might", () => {
    for (const total of [4, 5]) {
      let s = position();
      const other = unit(s, 98, "other");
      other.temporaryMight = total - (getCard(other.cardId).might ?? 0);
      s = cast(s, 97);
      expect(s.players[0].hand).toHaveLength(total === 5 ? 1 : 0);
    }
  });

  it("LeBlanc draws two during Beginning and one outside it", () => {
    let s = position();
    unit(s, 172, "leblanc");
    s = cast(s, 180);
    expect(s.players[0].hand).toHaveLength(1);
    s = position();
    s.players[0].legendId = card(191);
    unit(s, 172, "leblanc").temporary = true;
    s = settle(begin(s));
    expect(s.players[0].hand).toHaveLength(3); // two Deathknell draws and the normal turn draw
  });

  it("Shard of Undoing triggers once for a simultaneous Beginning death batch", () => {
    let s = position();
    s.players[0].legendId = card(191);
    s.gears = [{ id: "shard", cardId: card(174), owner: 0, ready: true }];
    unit(s, 92, "a").temporary = true;
    unit(s, 92, "b").temporary = true;
    unit(s, 98, "enemy-a", 1);
    unit(s, 98, "enemy-b", 1);
    s = settle(begin(s));
    expect(s.units.filter((u) => u.owner === 1)).toHaveLength(1);
  });

  it("Poppy legend gains XP on a hold and spends it before her draw resolves", () => {
    let s = position();
    s.players[0].legendId = card(203);
    s.players[0].xp = 2;
    s.fields[0].controller = 0;
    unit(s, 98, "holder", 0, s.fields[0].id);
    s = settle(begin(s));
    expect(s.players[0].xp).toBe(3);
    const before = s.players[0].hand.length;
    s = take(s, (a) => a.abilityKey === "legend-draw");
    expect(s.players[0].xp).toBe(0);
    expect(s.players[0].hand).toHaveLength(before);
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(before + 1);
  });

  it("Abandoned Hall lets the spell player announce a friendly local buff target", () => {
    let s = position();
    s.fields[0].cardId = card(205);
    unit(s, 98, "here", 0, s.fields[0].id);
    unit(s, 98, "away");
    s.players[0].hand = [card(91)];
    s = reachChoice(play(s, 91));
    expect(s.pendingChoice?.kind).toBe("trigger");
    const actions = getLegalActions(s, 0);
    expect(actions.some((a) => a.targetId === "here")).toBe(true);
    expect(actions.some((a) => a.targetId === "away")).toBe(false);
    s = take(s, (a) => a.targetId === "here");
    expect(s.units.find((u) => u.id === "here")?.temporaryMight).toBe(0);
    s = settle(s);
    expect(s.units.find((u) => u.id === "here")?.temporaryMight).toBe(1);
  });

  it("Forgotten Library predicts only for its controller's resolved expensive spell", () => {
    let s = position();
    s.fields[0].cardId = card(211);
    s.fields[0].controller = 0;
    unit(s, 98, "holder", 0, s.fields[0].id);
    s.players[0].hand = [card(91)];
    s = reachChoice(play(s, 91));
    expect(s.pendingChoice?.kind).toBe("predict");
    s = settle(s);
    const other = position();
    other.fields[0].cardId = card(211);
    other.fields[0].controller = 1;
    unit(other, 98, "holder", 1, other.fields[0].id);
    const done = cast(other, 91);
    expect(
      done.log.filter((entry) => /Predict|predict/.test(entry.text)),
    ).toHaveLength(0);
  });

  it("Poppy's opponent-score condition is fixed when she enters", () => {
    for (const initial of [4, 5]) {
      let s = position();
      s.players[1].points = initial;
      s.players[0].hand = [card(116)];
      s = play(s, 116);
      s.players[1].points = initial === 4 ? 5 : 4;
      s = settle(s);
      expect(s.players[0].xp).toBe(initial === 5 ? 3 : 0);
    }
  });

  it("Pyke's optional additional cost readies him and grants exactly two temporary Might", () => {
    let s = position();
    s.players[0].hand = [card(28)];
    s = take(s, (a) => a.cardId === card(28) && a.additionalCostPaid === true);
    s = settle(s);
    expect(s.units[0]).toMatchObject({
      ready: true,
      temporaryMight: 2,
      additionalCostPaid: true,
    });
    const normal = cast(position(), 28);
    expect(normal.units[0]).toMatchObject({ ready: false, temporaryMight: 0 });
  });

  it("Frisky Hunter's Bird is created at the same location and Walking Roost gives the opponent their choice", () => {
    let s = position();
    const field = s.fields[0];
    field.controller = 0;
    unit(s, 98, "holder", 0, field.id);
    s.players[0].hand = [card(33)];
    s = take(s, (a) => a.cardId === card(33) && a.locationId === field.id);
    s = settle(s);
    expect(s.units.find((u) => u.token)).toMatchObject({
      owner: 0,
      location: field.id,
    });
    s = position();
    s.players[0].hand = [card(130)];
    s = reachChoice(play(s, 130));
    expect(s.priorityPlayer).toBe(1);
    s = settle(s);
    expect(s.units.find((u) => u.token)).toMatchObject({
      owner: 1,
      location: "base:1",
    });
  });

  it("Hunt grants the printed XP amount when holding", () => {
    for (const [cid, amount] of [
      [94, 1],
      [75, 2],
      [100, 3],
    ]) {
      let s = position();
      s.players[0].legendId = card(191);
      s.fields[0].controller = 0;
      unit(s, cid, "hunter", 0, s.fields[0].id);
      s = settle(begin(s));
      expect(s.players[0].xp).toBe(amount);
    }
  });

  it("Friendship counts distinct friendly tribes rather than unit count", () => {
    let s = position();
    unit(s, 137, "poro-a");
    unit(s, 137, "poro-b");
    unit(s, 56, "cat");
    unit(s, "token-bird", "bird").token = true;
    unit(s, 75, "target", 1);
    s = cast(s, 46, "target");
    expect(s.units.find((u) => u.id === "target")?.temporaryMight).toBe(3);
  });

  it.each([1, 2])(
    "Kha'Zix freezes his alone condition at attack with %s enemy units",
    (count) => {
      let s = position();
      const f = s.fields[0];
      f.controller = 1;
      unit(s, 143, "khazix");
      for (let i = 0; i < count; i++) unit(s, 98, `enemy-${i}`, 1, f.id);
      s = take(
        s,
        (a) =>
          a.category === "move" &&
          a.sourceId === "khazix" &&
          a.locationId === f.id,
      );
      s = take(s, "move-confirm");
      expect(s.stack.some((item) => item.cardId === card(143))).toBe(
        count === 1,
      );
      if (count === 1) unit(s, 98, "later-arrival", 1, f.id);
      else s.units = s.units.filter((u) => u.id !== "enemy-1");
      s = settle(s);
      expect(s.players[0].xp).toBe(count === 1 ? 2 : 0);
      expect(s.units.find((u) => u.id === "khazix")?.temporaryMight).toBe(
        count === 1 ? 2 : 0,
      );
    },
  );

  it("Ivern's reflexive buff survives its source leaving before the reveal", () => {
    let s = position();
    unit(s, 92, "friend");
    s.players[0].deck = [card(137), card(91), card(14), card(98)];
    s.players[0].hand = [card(51)];
    s = play(s, 51);
    s.units = s.units.filter((u) => u.cardId !== card(51));
    s = reachChoice(s);
    s = take(s, (a) => a.label.includes("Sinister Poro"));
    expect(s.stack.some((item) => item.cardId === card(51))).toBe(true);
    expect(s.units[0].buff).toBe(0);
    s = settle(s);
    expect(s.units[0].buff).toBe(1);
  });

  it("Nidalee draws for remaining after combat and Nilah gains XP on a move", () => {
    let s = position();
    const f = s.fields[0];
    f.controller = 1;
    unit(s, 114, "nidalee");
    unit(s, "ogn-271-298", "recruit", 1, f.id).token = true;
    s = take(
      s,
      (a) =>
        a.category === "move" &&
        a.sourceId === "nidalee" &&
        a.locationId === f.id,
    );
    s = take(s, "move-confirm");
    for (
      let i = 0;
      i < 30 && (s.combat || s.stack.length || s.pendingChoice);
      i++
    ) {
      const actions = getLegalActions(s, s.priorityPlayer);
      const next =
        actions.find((a) => a.id.startsWith("damage:")) ??
        actions.find((a) => a.id === "damage-done") ??
        actions.find((a) => a.id === "pass") ??
        actions[0];
      expect(next).toBeDefined();
      s = applyAction(s, next);
    }
    expect(s.units.some((u) => u.id === "nidalee")).toBe(true);
    expect(s.players[0].hand).toHaveLength(1);
    s = position();
    unit(s, 115, "nilah");
    s = take(
      s,
      (a) =>
        a.category === "move" &&
        a.sourceId === "nilah" &&
        a.locationId === s.fields[0].id,
    );
    s = take(s, "move-confirm");
    s = settle(s);
    expect(s.players[0].xp).toBe(1);
  });
});
