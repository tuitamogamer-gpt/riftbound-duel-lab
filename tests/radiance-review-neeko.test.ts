import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { starterDecks, type StarterDeck } from "../src/data/decks";
import { applyAction, emitGameEvent } from "../src/game/engine";
import { validateImportedDeck } from "../src/game/deck-import";
import { legendEmpowered, legendReady, legendRefs } from "../src/game/legends";
import type { Effect, GameState, PlayerId } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import {
  actions,
  byId,
  deployGear,
  goldCount,
  play,
  rad,
  settle,
  until,
} from "./fixtures/radiance";

const NEEKO = rad(167);
const LEE_SIN = "ogn-257-298";
const LADY = rad(145);
const neekoHere = (s: GameState) => s.units.find((u) => u.cardId === NEEKO)!;
const neekoKey = (s: GameState) => `neeko-legend:${neekoHere(s).id}`;

function withNeeko(extra: string[], pick: string, legendId?: string) {
  let s = fixture();
  if (legendId) s.players[0].legendId = legendId;
  s.players[0].extraLegends = extra;
  s.units = [unit("a", 0, "base:0", 2)];
  s.players[0].hand = [NEEKO];
  return settle(until(play(s, NEEKO, { locationId: "base:0" }), pick));
}
/** Put an ability on the chain for a player. */
function push(
  s: GameState,
  player: PlayerId,
  effects: Effect[],
  targetId?: string,
) {
  s.stack.push({
    id: `review-${s.nextId++}`,
    kind: "ability",
    cardId: rad(59),
    player,
    effects,
    targetId,
  });
  s.priorityPlayer = player;
  return s;
}
/** Both players pass once: the top of the chain resolves. */
const resolveTop = (s: GameState) => act(act(s, "pass"), "pass");
/** Lady of Clockwork's effect: the gear becomes a unit gear. */
const animate = (s: GameState, gearId: string, player: PlayerId = 0) =>
  resolveTop(
    push(s, player, [
      { type: "special", custom: "radiance7:animate", cardName: gearId },
    ]),
  );
const neekoDeck = (legendId: string, extra: string[]): StarterDeck => {
  const base = starterDecks[0];
  return {
    ...base,
    legendId,
    main: [
      ...base.main.slice(0, -1),
      { ...base.main.at(-1)!, count: base.main.at(-1)!.count - 1 },
      { cardId: NEEKO, count: 1 },
    ].filter((e) => e.count > 0),
    extraLegendIds: extra,
  };
};
const errorCodes = (deck: StarterDeck) =>
  validateImportedDeck(deck)
    .filter((i) => i.severity === "error")
    .map((i) => i.code);

describe("Neeko and more than one legend: review fixes", () => {
  it("treats printings and two-record legends as the same name", () => {
    // Deck building: a printing label does not make a different legend.
    const annie = starterDecks[0].legendId;
    expect(getCard(annie).name).toBe("Annie - Dark Child (Starter)");
    expect(
      errorCodes(neekoDeck(annie, ["opp-017-024--69bc5bf2d308c64675ca8a02"])),
    ).toContain("neeko-legend-duplicate");
    // Vendetta legends exist as two records: "Soul's Reflection" and "Mel - ...".
    expect(
      errorCodes(
        neekoDeck(annie, [
          "ven-151-166--6a517608ad64d2d80a4f03cf",
          "ven-151-166--6a56ab9aff602fd324f4766c",
        ]),
      ),
    ).toContain("neeko-legend-duplicate");
    // Different legends of the same champion stay different.
    expect(
      errorCodes(neekoDeck(annie, ["ogs-019-024", "unl-191-219"])),
    ).not.toContain("neeko-legend-duplicate");
    // In play: another printing of a legend already in the Legend Zone is not offered.
    let s = fixture();
    s.players[0].legendId = LEE_SIN;
    s.players[0].extraLegends = ["ogn-304-298", rad(149)];
    s.players[0].hand = [NEEKO];
    s = play(s, NEEKO, { locationId: "base:0" });
    for (let i = 0; i < 6 && !s.pendingChoice; i++) s = act(s, "pass");
    expect(actions(s).map((a) => a.label)).toEqual([
      "Add The Exile to your Legend Zone",
    ]);
  });

  it("resolves an added legend's 'here' targets (LeBlanc's Reflection becomes a copy)", () => {
    let s = withNeeko(["unl-199-219"], "Add LeBlanc");
    s.units.push(unit("b", 0, "field:0", 3));
    s.fields[0].controller = 0;
    s.players[0].hand = ["ogn-049-298"];
    emitGameEvent(s, "hold", 0, s.fields[0].cardId, "field:0", "field:0");
    s = act(s, (a) => a.label.includes("Use triggered"));
    for (let i = 0; i < 20 && (s.stack.length || s.pendingChoice); i++) {
      const options = actions(s);
      s = applyAction(
        s,
        s.pendingChoice
          ? (options.find((a) => a.targetId === "b") ?? options[0])
          : options.find((a) => a.id === "pass")!,
      );
    }
    const token = s.units.find((u) => u.token)!;
    expect(token.cardId).toBe(byId(s, "b").cardId);
    expect(token.temporary).toBe(true);
  });

  it("empowers every 'when you empower something else' legend (Mel and Ambessa)", () => {
    const mel = "ven-151-166--6a517608ad64d2d80a4f03cf";
    const ambessa = "ven-153-166--6a517606ad64d2d80a4f03a7";
    let s = withNeeko([ambessa], "Add Matriarch", mel);
    s.units.push({
      ...unit("ak", 0, "base:0", 3),
      cardId: "ven-021-166--6a517603ad64d2d80a4f0374",
    });
    s = settle(act(s, (a) => a.id === "ven-wave4:empower:ak"));
    expect(byId(s, "ak").empowered).toBe(true);
    expect(legendEmpowered(s, 0, "legend")).toBe(true);
    expect(legendEmpowered(s, 0, neekoKey(s))).toBe(true);
  });

  it("fires an animated gear's Beginning and End triggers once", () => {
    let s = fixture();
    deployGear(s, rad(52), "field:0", 0, "extractor");
    s.fields[0].controller = 0;
    s = animate(s, "extractor");
    s = act(s, "end-turn");
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, "pass");
    expect(goldCount(s)).toBe(1);

    let t = fixture();
    const bandit = deployGear(t, rad(111), "base:1", 1, "bandit");
    delete bandit.deployedAt;
    t = animate(t, "bandit", 1);
    t = act(t, "end-turn");
    expect(t.stack.filter((item) => item.cardId === rad(111))).toHaveLength(1);
  });

  it("keeps Gravity Field's tax and Dockside Lock-Up's release on an animated gear", () => {
    let s = fixture();
    deployGear(s, rad(62), "field:0", 1, "gf");
    s.fields[0].controller = 1;
    s.units = [unit("a", 0, "base:0", 9)];
    s = animate(s, "gf", 1);
    expect(byId(s, "gf").location).toBe("field:0");
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = act(act(s, "move-start:a:field:0"), "move-confirm");
    expect(energy - s.players[0].energy).toBe(1);
    expect(power - (s.players[0].power ?? 0)).toBe(1);

    let t = fixture();
    t.units = [unit("e", 1, "field:0", 3)];
    t.players[0].hand = [rad(136)];
    t = settle(
      until(play(t, rad(136), { locationId: "field:0" }), "Banish Playful"),
    );
    const lockUp = t.gears.find((g) => g.cardId === rad(136))!;
    t.fields[0].controller = 0;
    t = animate(t, lockUp.id);
    emitGameEvent(t, "hold", 0, t.fields[0].cardId, "field:0", "field:0");
    t = settle(until(t, "Use triggered"));
    expect(t.gears.some((g) => g.id === lockUp.id)).toBe(false);
    expect(t.units.some((u) => u.id === lockUp.id)).toBe(false);
    expect(t.players[1].banished).toHaveLength(0);
    expect(t.units.find((u) => u.cardId === "ogn-049-298")!.owner).toBe(0);
  });

  it("treats a legend whose Neeko left as neither ready nor Empowered", () => {
    let s = withNeeko(["unl-193-219"], "Add Vex");
    const key = neekoKey(s);
    s.units.push(unit("b", 0, "field:0", 3));
    s.fields[0].controller = 0;
    emitGameEvent(s, "hold", 0, s.fields[0].cardId, "field:0", "field:0");
    expect(s.stack.at(-1)!.sourceId).toBe(key);
    // Neeko dies in response; the starting legend is ready and Empowered.
    s.players[0].legendEmpowered = true;
    s = resolveTop(
      push(s, 1, [{ type: "kill", target: "anyUnit" }], neekoHere(s).id),
    );
    expect(legendRefs(s, 0)).toHaveLength(1);
    expect(legendReady(s, 0, "legend")).toBe(true);
    expect(legendReady(s, 0, key)).toBe(false);
    expect(legendEmpowered(s, 0, key)).toBe(false);
    const hand = s.players[0].hand.length;
    s = settle(s);
    expect(s.players[0].hand.length).toBe(hand);
    expect(legendReady(s, 0, "legend")).toBe(true);
  });

  it("Hall of Legends readies the first exhausted legend", () => {
    let s = withNeeko([LEE_SIN], "Add Lee Sin");
    const key = neekoKey(s);
    s = settle(
      act(
        s,
        (a) =>
          a.sourceId === key && a.category === "ability" && a.targetId === "a",
      ),
    );
    expect(legendReady(s, 0, key)).toBe(false);
    s.fields[0].cardId = "sfd-210-221";
    s.units.push(unit("m", 0, "base:0", 3));
    s = act(act(s, "move-start:m:field:0"), "move-confirm");
    s = settle(until(s, "Use triggered"));
    expect(legendReady(s, 0, "legend")).toBe(true);
    expect(legendReady(s, 0, key)).toBe(true);
  });

  it("Dockside Lock-Up cannot choose a protected unit and pays Deflect", () => {
    let s = fixture();
    s.units = [
      { ...unit("e", 1, "field:0", 3), untargetableByEnemy: true },
      unit("own", 0, "field:0", 3),
    ];
    s.players[0].hand = [rad(136)];
    s = play(s, rad(136), { locationId: "field:0" });
    for (let i = 0; i < 6 && !s.pendingChoice; i++) s = act(s, "pass");
    expect(actions(s).map((a) => a.targetId)).toEqual(["own"]);

    let t = fixture();
    // Sivir, Ambitious has [Deflect 2].
    t.units = [{ ...unit("e", 1, "field:0", 3), cardId: "sfd-120-221" }];
    t.players[0].hand = [rad(136)];
    t = play(t, rad(136), { locationId: "field:0" });
    const power = t.players[0].power ?? 0;
    t = settle(t);
    expect(t.players[1].banished).toEqual(["sfd-120-221"]);
    expect(power - (t.players[0].power ?? 0)).toBe(2);
  });

  it("Lady of Clockwork: a gear keeps its own state when it stops being a unit", () => {
    let s = fixture();
    const first = deployGear(s, rad(22), "base:0", 0, "first");
    delete first.deployedAt;
    first.empowered = true;
    first.temporary = true;
    first.namedTag = "Mech";
    const second = deployGear(s, rad(12), "base:0", 0, "second");
    delete second.deployedAt;
    s = animate(animate(s, "first"), "second");
    expect(s.units.map((u) => u.id)).toEqual(["second"]);
    const restored = s.gears.find((g) => g.id === "first")!;
    expect(restored).toEqual({
      id: "first",
      cardId: rad(22),
      owner: 0,
      ready: true,
      empowered: true,
      temporary: true,
      namedTag: "Mech",
    });
  });

  it("Lady of Clockwork: no paid trigger when no gear can be chosen", () => {
    let s = fixture();
    s.players[0].legendId = LADY;
    const only = deployGear(s, rad(22), "base:0", 0, "only");
    delete only.deployedAt;
    s = animate(s, "only");
    emitGameEvent(s, "main", 0, LADY, "legend");
    expect(s.pendingChoice).toBeNull();
    expect(s.stack).toHaveLength(0);
    // A second free gear brings the trigger back.
    const other = deployGear(s, rad(12), "base:0", 0, "other");
    delete other.deployedAt;
    emitGameEvent(s, "main", 0, LADY, "legend");
    expect(actions(s).some((a) => a.label.includes("Use triggered"))).toBe(
      true,
    );
  });

  it("The Ball triggers only when its controller moves it", () => {
    let s = fixture();
    deployGear(s, rad(146), "field:0", 0, "ball");
    s.fields[0].controller = 0;
    s = animate(s, "ball");
    // The opponent's effect moves it to its base.
    s = resolveTop(
      push(s, 1, [{ type: "moveTarget", target: "anyUnit" }], "ball"),
    );
    expect(byId(s, "ball").location).toBe("base:0");
    expect(s.pendingChoice).toBeNull();
    expect(s.stack).toHaveLength(0);
    // Its controller moving it still triggers.
    s = act(act(s, "move-start:ball:field:1"), "move-confirm");
    expect(actions(s).map((a) => a.label)).toEqual([
      "Draw 1",
      "Deal 2 to enemy units here",
    ]);
  });

  it("an added Annie's end-of-turn trigger carries her own card and key", () => {
    let s = withNeeko(["ogs-017-024"], "Add Annie");
    const key = neekoKey(s);
    s = act(s, "end-turn");
    expect(s.stack.at(-1)!.cardId).toBe("ogs-017-024");
    expect(s.stack.at(-1)!.sourceId).toBe(key);
    // The starting Annie's trigger is unchanged: no source id is added.
    let t = fixture();
    t.players[0].legendId = "ogs-017-024";
    t = act(t, "end-turn");
    expect(t.stack.at(-1)!.cardId).toBe("ogs-017-024");
    expect(t.stack.at(-1)!.sourceId).toBeUndefined();
  });
});
