import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { officialPreconDecks } from "../src/data/decks";
import {
  applyDecision,
  getDecisionRequest,
  validateDecision,
} from "../src/game/ai/decisions";
import { decideBot } from "../src/game/bot";
import {
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { radianceRuleFamilies } from "../src/game/rule-families";
import { cardRegistry, getScript, isImplemented } from "../src/game/scripts";
import { act, chain, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  choose,
  goldCount,
  hide,
  play,
  rad,
  resolveEffects,
  settle,
  until,
} from "./fixtures/radiance";

describe("Radiance wave 3: face-down cards", () => {
  it("Elnuk Herd gives +3 and is recycled only when played from face down", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    s.players[0].hand = [rad(81)];
    s = play(s, rad(81), { locationId: "field:0" });
    s = settle(until(s, "Playful Phantom"));
    expect(byId(s, "ally").temporaryMight).toBe(3);
    expect(s.units.some((u) => u.cardId === rad(81))).toBe(true);

    let t = fixture();
    t.fields[0].controller = 0;
    t.units = [unit("ally", 0, "field:0", 3)];
    hide(t, rad(81), "field:0", 0, "h");
    const deck = t.players[0].deck.length;
    t = act(t, (a) => a.sourceId === "hidden:h");
    t = settle(until(t, "Playful Phantom"));
    expect(byId(t, "ally").temporaryMight).toBe(3);
    expect(t.units.some((u) => u.cardId === rad(81))).toBe(false);
    expect(t.players[0].deck).toHaveLength(deck + 1);
    expect(t.players[0].deck.at(-1)).toBe(rad(81));
  });

  it("Evelynn, Consuming readies and grows when you play a card from face down", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [
      { ...unit("eve", 0, "base:0", 5), cardId: rad(90), ready: false },
      unit("ally", 0, "field:0", 3),
    ];
    hide(s, rad(81), "field:0", 0, "h");
    s = act(s, (a) => a.sourceId === "hidden:h");
    s = settle(s);
    expect(byId(s, "eve").ready).toBe(true);
    expect(byId(s, "eve").temporaryMight).toBe(1);
    expect(getScript(rad(90))?.ambush).toBe(true);
  });

  it("Momentary Companion becomes Temporary only on an opponent's turn", () => {
    let s = fixture();
    s.units = [{ ...unit("c", 0, "field:0", 4), cardId: rad(95) }];
    s = resolveEffects(s, rad(95), getScript(rad(95))!.onPlay!, {
      sourceId: "c",
    });
    expect(byId(s, "c").temporary).toBeFalsy();
    s.currentPlayer = 1;
    s = resolveEffects(s, rad(95), getScript(rad(95))!.onPlay!, {
      sourceId: "c",
    });
    expect(byId(s, "c").temporary).toBe(true);
  });

  it("Siren's Song can move only an enemy unit that moved this turn", () => {
    let s = fixture();
    s.units = [
      {
        ...unit("moved", 1, "field:1", 3),
        movesTurn: s.turn,
        movesThisTurn: 1,
      },
      unit("still", 1, "field:1", 3),
    ];
    s.players[0].hand = [rad(98)];
    const targets = getLegalActions(s, 0)
      .filter((a) => a.cardId === rad(98))
      .map((a) => a.targetId);
    expect(targets).toEqual(["moved"]);
    s = act(s, (a) => a.cardId === rad(98));
    s = act(act(s, "pass"), "pass");
    s = chain(act(s, "choose-destination:base:1"));
    expect(byId(s, "moved").location).toBe("base:1");
  });

  it("The Waters' Wage makes three ready Gold only from face down on your turn", () => {
    let s = fixture();
    s.players[0].hand = [rad(100)];
    s = chain(play(s, rad(100)));
    expect(goldCount(s)).toBe(1);
    expect(s.gears.find((g) => g.cardId === "sfd-t03")?.ready).toBe(false);

    let t = fixture();
    t.fields[0].controller = 0;
    t.units = [unit("ally", 0, "field:0", 3)];
    hide(t, rad(100), "field:0", 0, "h");
    t = chain(act(t, (a) => a.sourceId === "hidden:h"));
    expect(goldCount(t)).toBe(3);
    expect(t.gears.every((g) => g.ready)).toBe(true);
  });

  it("Demon Shade moves a friendly unit to an open battlefield, or grants Ganking when none is open", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = [rad(102)];
    s = act(
      s,
      (a) =>
        a.cardId === rad(102) &&
        a.targetId === "ally" &&
        a.id.includes("mode:0"),
    );
    s = act(act(s, "pass"), "pass");
    if (s.pendingChoice) s = choose(s, "Move to");
    s = settle(s);
    expect(byId(s, "ally").location.startsWith("field:")).toBe(true);

    let t = fixture();
    t.units = [
      unit("ally", 0, "base:0", 3),
      unit("e0", 1, "field:0", 3),
      unit("e1", 1, "field:1", 3),
    ];
    t.fields[0].controller = 1;
    t.fields[1].controller = 1;
    t.players[0].hand = [rad(102)];
    t = act(
      t,
      (a) =>
        a.cardId === rad(102) &&
        a.targetId === "ally" &&
        a.id.includes("mode:1"),
    );
    t = chain(t);
    expect(getKeywords(t, byId(t, "ally"))).toContain("Ganking");
  });

  it("Gutter Guardian adds 1 Power only when it shows off a Hidden card", () => {
    let s = fixture();
    s.players[0].power = 0;
    s.players[0].hand = [rad(103), rad(95)];
    const ids = actions(s)
      .filter((a) => a.cardId === rad(103))
      .map((a) => a.id);
    expect(ids.some((id) => id.includes("|showoff:hand:1"))).toBe(true);
    s = chain(
      play(s, rad(103), { locationId: "base:0", id: "showoff:hand:1" }),
    );
    expect(s.players[0].power).toBe(1);
    expect(
      s.log.some((l) => l.text.includes("shows off Momentary Companion")),
    ).toBe(true);

    let t = fixture();
    t.players[0].power = 0;
    t.players[0].hand = [rad(103), "ogn-001-298"];
    expect(
      actions(t).some((a) => a.cardId === rad(103) && a.id.includes("showoff")),
    ).toBe(false);
    t = chain(play(t, rad(103), { locationId: "base:0" }));
    expect(t.players[0].power).toBe(0);
  });

  it("Reckless Innovator chooses Gold or a paid draw when it becomes exhausted", () => {
    let s = fixture();
    s.units = [{ ...unit("inno", 0, "base:0", 3), cardId: rad(105) }];
    s = act(act(s, "move-start:inno:field:0"), "move-confirm");
    s = until(s, "Play a Gold gear token exhausted");
    s = settle(s);
    expect(goldCount(s)).toBe(1);
  });

  it("Evelynn, In Control scores an extra point when holding with a facedown card", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [{ ...unit("eve", 0, "field:0", 4), cardId: rad(109) }];
    hide(s, "ogn-199-298", "field:0", 0);
    s = settle(act(settle(act(s, "end-turn")), "end-turn"));
    expect(s.players[0].points).toBe(2);
    expect(getKeywords(s, byId(s, "eve"))).toContain("Disarm");
  });

  it("Hold 'Em costs 2 less after you play a unit to a battlefield", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    s.players[0].hand = [rad(70), "ogn-049-298"];
    const before = s.players[0].energy;
    s = chain(play(s, rad(70), { targetId: "ally" }));
    const full = before - s.players[0].energy;
    s.players[0].hand = [rad(70), "ogn-049-298"];
    s = chain(play(s, "ogn-049-298", { locationId: "field:0" }));
    const afterUnit = s.players[0].energy;
    s = chain(play(s, rad(70), { targetId: "ally" }));
    expect(afterUnit - s.players[0].energy).toBe(full - 2);
  });

  it("Agony's Embrace draws once each turn on face-down plays", () => {
    let s = fixture();
    s.players[0].legendId = rad(153);
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    hide(s, rad(100), "field:0", 0, "h1");
    hide(s, rad(100), "field:0", 0, "h2");
    s = settle(act(s, (a) => a.sourceId === "hidden:h1"));
    expect(s.players[0].hand).toHaveLength(1);
    s = settle(act(s, (a) => a.sourceId === "hidden:h2"));
    expect(s.players[0].hand).toHaveLength(1);
  });

  it("Last Caress lets the next unit go to any battlefield, buffed", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "field:1", 2)];
    s.fields[1].controller = 1;
    s.players[0].hand = [rad(154), "ogn-049-298"];
    expect(
      actions(s).some(
        (a) => a.cardId === "ogn-049-298" && a.locationId === "field:1",
      ),
    ).toBe(false);
    s = chain(play(s, rad(154)));
    s = play(s, "ogn-049-298", { locationId: "field:1" });
    s = settle(s);
    const played = s.units.find((u) => u.cardId === "ogn-049-298");
    expect(played?.buff).toBe(1);
    expect(
      actions(s).some(
        (a) => a.cardId === "ogn-049-298" && a.locationId === "field:1",
      ),
    ).toBe(false);
  });

  it("Bandle Scouts' Academy and Rakelstake trigger from their battlefield", () => {
    let s = fixture();
    s.fields[0].cardId = rad(157);
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0", 3)];
    s.players[0].hand = [rad(81)];
    s = settle(act(s, (a) => a.id.startsWith("hide:")));
    expect(goldCount(s)).toBe(1);

    let t = fixture();
    t.fields[0].cardId = rad(165);
    t.fields[0].controller = 0;
    t.units = [unit("ally", 0, "field:0", 3)];
    t.players[0].hand = ["ogn-049-298", "ogn-049-298"];
    t = play(t, "ogn-049-298", { locationId: "field:0" });
    t = until(t, "Recycle");
    t = settle(t);
    t = play(t, "ogn-049-298", { locationId: "field:0" });
    expect(t.pendingChoice?.kind).not.toBe("predict");
    t = settle(t);
    expect(
      t.units.filter((u) => u.cardId === "ogn-049-298" && u.id !== "ally"),
    ).toHaveLength(2);
  });
});

describe("Radiance rule families", () => {
  const text = (value: string) =>
    value
      .replace(/\((?:[^()]|\([^()]*\))*\)/g, "")
      .replace(/&quot;/g, '"')
      .replace("a battlefield that was uncontrolled", "an open battlefield")
      .replace("is exhausted", "becomes exhausted")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  it.each(Object.entries(radianceRuleFamilies))(
    "%s shares the rules face of %s",
    (id, source) => {
      const card = getCard(id),
        base = getCard(source);
      expect(text(card.text)).toBe(text(base.text));
      for (const key of ["type", "energy", "power", "might"] as const)
        expect(card[key]).toEqual(base[key]);
      expect(card.domains).toEqual(base.domains);
      if (isImplemented(source)) {
        expect(isImplemented(id)).toBe(true);
        expect(getScript(id)).toEqual(getScript(source));
        expect(cardRegistry[id].status).toBe("scripted");
      } else expect(isImplemented(id)).toBe(false);
    },
  );
  it("reprinted champions keep their earlier rules and Might", () => {
    const s = fixture();
    for (const [id, source] of Object.entries(radianceRuleFamilies).filter(
      ([, source]) => !source.startsWith("rad-"),
    )) {
      const printed = {
        ...unit("x"),
        cardId: id,
        baseMightOverride: undefined,
      };
      expect(getMight(s, printed)).toBe(
        getMight(s, { ...printed, cardId: source }),
      );
    }
  });
});

describe("Evelynn Radiance precon", () => {
  it.each([
    [3, "reference-precon-evelynn", 0],
    [12, "reference-precon-evelynn", 1],
  ] as const)(
    "seed %i: %s plays a complete bot game against a retail precon",
    async (seed, deckId, first) => {
      let state = createGame({
        playerDeckId: deckId,
        botDeckId: officialPreconDecks[seed % officialPreconDecks.length].id,
        seed,
        firstPlayer: first,
        botDifficulty: "beginner",
      });
      let steps = 0;
      while (state.winner === null && steps < 3000) {
        if (steps % 25 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const request = getDecisionRequest(state)!;
        const result = decideBot(state, state.priorityPlayer, {
          deterministic: true,
          maxNodes: 80,
        });
        expect(
          validateDecision(state, request, result!.decision).valid,
          `step ${steps}`,
        ).toBe(true);
        state = applyDecision(state, request, result!.decision);
        steps++;
      }
      expect(state.winner, `stalled after ${steps}`).not.toBeNull();
    },
    180_000,
  );
});
