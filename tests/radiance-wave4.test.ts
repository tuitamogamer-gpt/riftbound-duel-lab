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
import { getScript } from "../src/game/scripts";
import type { GameState } from "../src/game/types";
import { act, chain, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  choose,
  play,
  rad,
  resolveEffects,
  settle,
  until,
} from "./fixtures/radiance";

const recruits = (s: GameState, owner = 0) =>
  s.units.filter(
    (u) => u.owner === owner && getCard(u.cardId).name.startsWith("Recruit"),
  );
const exhaust = (s: GameState, id: string) =>
  settle(act(act(s, `move-start:${id}:field:0`), "move-confirm"));

describe("Radiance wave 4: Seraphine list", () => {
  it("Fanfare draws for each of the next three units played this turn", () => {
    let s = fixture();
    s.players[0].hand = [rad(47), ...Array(4).fill("ogn-049-298")];
    s = chain(play(s, rad(47)));
    for (let i = 0; i < 4; i++)
      s = settle(play(s, "ogn-049-298", { locationId: "base:0" }));
    // Four units played, three draws.
    expect(s.players[0].hand).toHaveLength(3);
  });

  it("High Note gives -Might equal to your exhausted units", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 0, "base:0", 2), ready: false },
      { ...unit("b", 0, "base:0", 2), ready: false },
      unit("c", 0, "base:0", 2),
      unit("enemy", 1, "base:1", 5),
    ];
    s.players[0].hand = [rad(48)];
    s = chain(play(s, rad(48), { targetId: "enemy" }));
    expect(byId(s, "enemy").temporaryMight).toBe(-2);
  });

  it("Strigian Oracle predicts and Seraphine, Not Alone makes a Recruit when exhausted", () => {
    let s = fixture();
    s.units = [
      { ...unit("oracle", 0, "base:0", 2), cardId: rad(53) },
      { ...unit("sera", 0, "base:0", 1), cardId: rad(138) },
    ];
    s = act(act(s, "move-start:oracle:field:0"), "move-toggle:sera");
    s = act(s, "move-confirm");
    s = until(s, "Recycle");
    s = settle(s);
    expect(recruits(s)).toHaveLength(1);
  });

  it("Seraphine, Not Alone has +1 Might per other exhausted friendly unit", () => {
    const s = fixture();
    s.units = [
      { ...unit("sera", 0, "base:0", 1), cardId: rad(138) },
      { ...unit("a", 0, "base:0", 2), ready: false },
      { ...unit("b", 0, "base:0", 2), ready: false },
      { ...unit("e", 1, "base:1", 2), ready: false },
    ];
    delete s.units[0].baseMightOverride;
    expect(getMight(s, s.units[0])).toBe(3);
  });

  it("Piltovan Guidebot may take a played card's Energy cost as base Might", () => {
    let s = fixture();
    s.units = [{ ...unit("bot", 0, "base:0", 3), cardId: rad(57) }];
    delete s.units[0].baseMightOverride;
    s.players[0].hand = [rad(59)];
    s.units.push(unit("enemy", 1, "base:1", 20));
    s = play(s, rad(59), { targetId: "enemy" });
    s = settle(until(s, "base Might becomes 9"));
    expect(getMight(s, byId(s, "bot"))).toBe(9);
  });

  it("The Empyrean shows off a card, predicts its Power cost and draws 2", () => {
    let s = fixture();
    s.players[0].hand = [rad(60), "ogn-001-298"];
    const show = actions(s).find(
      (a) => a.cardId === rad(60) && a.id.includes("|showoff:hand:1"),
    );
    expect(show).toBeDefined();
    const power = getCard("ogn-001-298").power ?? 0;
    s = act(s, (a) => a.id === show!.id);
    s = settle(s);
    expect(s.players[0].hand).toHaveLength(1 + 2);
    expect(
      s.log.some((l) => l.text.includes(`predicts ${power}`) || power < 2),
    ).toBe(true);
  });

  it("Seraphine, Inspiring may draw once a turn when three units exhaust together", () => {
    let s = fixture();
    s.units = [
      { ...unit("sera", 0, "field:1", 3), cardId: rad(65) },
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
      unit("c", 0, "base:0", 2),
    ];
    s.fields[1].controller = 0;
    s = act(act(s, "move-start:a:field:0"), "move-toggle:b");
    s = act(act(s, "move-toggle:c"), "move-confirm");
    s = settle(until(s, "Draw 1"));
    expect(s.players[0].hand).toHaveLength(1);
    expect(getKeywords(s, byId(s, "sera"))).toContain("Disarm 2");
  });

  it("For Demacia! gives friendly units at the chosen battlefield Shield 2", () => {
    let s = fixture();
    s.units = [unit("a", 0, "field:0", 2), unit("b", 0, "base:0", 2)];
    s.players[0].hand = [rad(117)];
    s = chain(play(s, rad(117), { targetId: "field:0" }));
    expect(byId(s, "a").temporaryKeywords).toContain("Shield 2");
    expect(byId(s, "b").temporaryKeywords ?? []).not.toContain("Shield 2");
  });

  it("Herald of the Emperor makes a friendly unit's base Might 5 this turn", () => {
    let s = fixture();
    s.units = [unit("ally", 0, "base:0", 2)];
    delete s.units[0].baseMightOverride;
    s.units[0].cardId = "ogn-049-298";
    s.players[0].hand = [rad(118)];
    s = play(s, rad(118), { locationId: "base:0" });
    s = settle(until(s, "Playful Phantom"));
    expect(getMight(s, byId(s, "ally"))).toBe(5);
    s = settle(act(s, "end-turn"));
    expect(byId(s, "ally").baseMightOverride).toBeUndefined();
  });

  it("Meticulous Restorationist may return from trash for Order Power after a 7+ card", () => {
    let s = fixture();
    s.players[0].discard = [rad(120)];
    s.players[0].hand = [rad(59)];
    s.units = [unit("enemy", 1, "base:1", 20)];
    s = play(s, rad(59), { targetId: "enemy" });
    s = settle(s);
    expect(s.units.some((u) => u.cardId === rad(120))).toBe(true);
    expect(s.players[0].discard).not.toContain(rad(120));
  });

  it("Party Crasher costs 1 less per exhausted friendly unit", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 0, "base:0", 2), ready: false },
      { ...unit("b", 0, "base:0", 2), ready: false },
    ];
    s.players[0].hand = [rad(122)];
    const energy = s.players[0].energy;
    s = settle(play(s, rad(122), { locationId: "base:0" }));
    expect(energy - s.players[0].energy).toBe(9 - 2);
    expect(
      getKeywords(
        s,
        s.units.find((u) => u.cardId === rad(122))!,
      ),
    ).toContain("Tank");
  });

  it("Burn Away banishes a small unit or a gear and burns 2", () => {
    let s = fixture();
    s.units = [unit("small", 1, "base:1", 3), unit("big", 1, "base:1", 4)];
    s.players[0].hand = [rad(124)];
    const unitTargets = actions(s)
      .filter((a) => a.cardId === rad(124) && a.id.includes("mode:0"))
      .map((a) => a.targetId);
    expect(unitTargets).toEqual(["small"]);
    const deck = s.players[0].deck.length;
    s = chain(act(s, (a) => a.cardId === rad(124) && a.targetId === "small"));
    expect(s.units.map((u) => u.id)).toEqual(["big"]);
    expect(s.players[1].banished).toContain("ogn-049-298");
    expect(s.players[0].deck).toHaveLength(deck - 2);
  });

  it("Dune Devourer may kill a friendly unit to cost 2 less", () => {
    let s = fixture();
    s.units = [unit("fodder", 0, "base:0", 1)];
    s.players[0].hand = [rad(125)];
    const options = actions(s).filter((a) => a.cardId === rad(125));
    expect(options.some((a) => a.additionalCostPaid)).toBe(true);
    const energy = s.players[0].energy;
    s = settle(
      act(s, (a) => a.cardId === rad(125) && Boolean(a.additionalCostPaid)),
    );
    expect(s.units.some((u) => u.id === "fodder")).toBe(false);
    expect(energy - s.players[0].energy).toBe(7 - 2);
    expect(getScript(rad(125))?.deflect).toBe(1);
  });

  it("Rousing Display makes four Recruits when it shows off a 7+ card", () => {
    let s = fixture();
    s.players[0].hand = [rad(127), rad(59)];
    s = chain(play(s, rad(127), { id: "showoff:hand:1" }));
    expect(recruits(s)).toHaveLength(4);
    let t = fixture();
    t.players[0].hand = [rad(127)];
    t = chain(play(t, rad(127)));
    expect(recruits(t)).toHaveLength(2);
  });

  it("Steadfast Outrider gets +2 with two other friendly units or gear at its battlefield", () => {
    const s = fixture();
    s.units = [
      { ...unit("rider", 0, "field:0", 3), cardId: rad(128) },
      unit("a", 0, "field:0", 2),
    ];
    delete s.units[0].baseMightOverride;
    expect(getMight(s, s.units[0])).toBe(3);
    s.gears.push({
      id: "banner",
      cardId: rad(2),
      owner: 0,
      ready: true,
      deployedAt: "field:0",
    });
    expect(getMight(s, s.units[0])).toBe(5);
  });

  it("Heimerdinger may replace a unit token with a 3 Might Mech", () => {
    let s = fixture();
    s.units = [{ ...unit("heimer", 0, "field:0", 5), cardId: rad(132) }];
    s.players[0].hand = [rad(127)];
    s = play(s, rad(127));
    s = act(act(s, "pass"), "pass");
    for (let i = 0; i < 2; i++) s = choose(s, "Play a 3 Might Mech");
    s = settle(s);
    expect(s.units.filter((u) => u.cardId === "token-mech")).toHaveLength(2);
    expect(recruits(s)).toHaveLength(0);
  });

  it("Starry-Eyed Songstress exhausts itself and three units to reduce a spell by 2", () => {
    let s = fixture();
    s.players[0].legendId = rad(151);
    s.units = [
      unit("a", 0, "base:0", 2),
      unit("b", 0, "base:0", 2),
      unit("c", 0, "base:0", 2),
      unit("enemy", 1, "base:1", 8),
    ];
    s.players[0].energy = 7;
    s.players[0].hand = [rad(59)];
    // Supernova costs 9: only the Songstress option is affordable.
    const plays = actions(s).filter((a) => a.cardId === rad(59));
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((a) => a.songstressUnits)).toBe(true);
    s = chain(
      act(s, (a) => a.cardId === rad(59) && a.targetId === "enemy"),
    );
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(["a", "b", "c"].every((id) => !byId(s, id).ready)).toBe(true);
    expect(s.players[0].energy).toBe(0);
    expect(s.units.some((u) => u.id === "enemy")).toBe(false);
  });

  it("Encore resolves two different chosen modes", () => {
    let s = fixture();
    s.units = [unit("enemy", 1, "base:1", 3), unit("ally", 0, "base:0", 2)];
    s.players[0].hand = [rad(152)];
    s = play(s, rad(152));
    expect(s.pendingChoice?.kind).toBe("effectDraft");
    s = choose(s, "Deal 2 to a unit");
    s = act(s, (a) => a.targetId === "enemy");
    expect(actions(s).some((a) => a.label === "Deal 2 to a unit")).toBe(false);
    s = choose(s, "Give up to two units each +1 Might");
    s = act(s, (a) => a.targetId === "ally");
    s = act(s, "draft:done");
    s = chain(s);
    expect(byId(s, "enemy").damage).toBe(2);
    expect(byId(s, "ally").temporaryMight).toBe(1);
  });

  it("Black Rose Sanctum makes one Recruit for the first unit death there each turn", () => {
    let s = fixture();
    s.fields[0].cardId = rad(159);
    s.units = [unit("a", 0, "field:0", 1), unit("b", 0, "field:0", 1)];
    s.players[1].hand = [];
    s = resolveEffects(s, "ogn-004-298", [
      {
        type: "damageAll",
        amount: 5,
        who: "all",
        condition: "allBattlefields",
      },
    ]);
    s = settle(s);
    expect(recruits(s)).toHaveLength(1);
  });

  it("Ruined Monastery may discard 1 to channel a rune when you conquer it", () => {
    let s = fixture();
    s.fields[0].cardId = rad(166);
    s.units = [unit("ally", 0, "base:0", 3)];
    s.players[0].hand = ["ogn-001-298"];
    const runes = s.players[0].runes.length;
    s = act(act(s, "move-start:ally:field:0"), "move-confirm");
    s = settle(until(s, "Discard 1 and channel"));
    expect(s.players[0].hand).toHaveLength(0);
    expect(s.players[0].runes.length).toBe(runes + 1);
  });
});

describe("Seraphine Radiance precon", () => {
  it.each([5, 14])(
    "seed %i plays a complete bot game against a retail precon",
    async (seed) => {
      let state = createGame({
        playerDeckId: "reference-precon-seraphine",
        botDeckId: officialPreconDecks[seed % officialPreconDecks.length].id,
        seed,
        firstPlayer: (seed % 2) as 0 | 1,
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

export { exhaust, getLegalActions };
