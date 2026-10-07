import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import { gameplayFingerprint } from "../src/data/card-identity";
import {
  applyAction,
  getLegalActions,
  getKeywords,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getScript, cardRegistry } from "../src/game/scripts";
import { reviewedRuleFamilies } from "../src/game/rule-families";
import { validState } from "../src/persistence";
import {
  getObservation,
  observationRulesView,
  sampleState,
} from "../src/game/ai/observation";
import { getDecisionRequest, validateDecision } from "../src/game/ai/decisions";
import { fixture, unit, act, chain, ogn, sfd } from "./fixtures/cards";
import type { Effect, GameState } from "../src/game/types";
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const options = (s: GameState) => getLegalActions(s, s.priorityPlayer);
function cast(s: GameState, id: string, targetId?: string) {
  s.players[s.priorityPlayer].hand.push(id);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === id &&
      (!targetId || a.targetId === targetId),
  );
}
function resolve(s: GameState) {
  return act(act(s, "pass"), "pass");
}
function run(
  s: GameState,
  effects: Effect[],
  sourceId?: string,
  locationId: "base:0" | "field:0" = "base:0",
) {
  s.stack.push({
    id: "test",
    kind: "ability",
    cardId: ogn(49),
    player: 0,
    sourceId,
    locationId,
    effects,
  });
  return resolve(s);
}
function finishPending(s: GameState, cardId: string, locationId = "base:0") {
  expect(s.pendingChoice?.kind).toBe("effectPlay");
  expect(validState(s)).toBe(true);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      (getCard(cardId).type !== "Unit" || a.locationId === locationId),
  );
}

describe("reviewed independent printing scripts", () => {
  it.each(Object.entries(reviewedRuleFamilies))(
    "preserves %s metadata while sharing the reviewed effect family",
    (id, source) => {
      const card = getCard(id),
        original = getCard(source);
      const text = (s: string) =>
        s
          .replace(/\([^()]*\)/g, "")
          .replace(/\[&gt;\]|[—–]/g, "")
          .replace(/[‘’]/g, "'")
          .replace("Sand Soldiers you play have", "Your Sand Soldiers have")
          .replace(
            "You may banish one, then play it. Recycle the rest.",
            "You may play one. Then recycle the rest.",
          )
          .replace(/\s+/g, "");
      expect(text(card.text)).toBe(text(original.text));
      if (
        ![
          "unl-235-219",
          "unl-235*-219",
          "ogn-310-298",
          "ogn-310*-298",
          "sfd-239-221",
          "sfd-239*-221",
        ].includes(id)
      )
        expect(gameplayFingerprint(card)).not.toBe(
          gameplayFingerprint(original),
        );
      expect(cardRegistry[id].status).toBe("scripted");
      expect(cardRegistry[id].rulesCardId).toBe(id);
      expect(getScript(id)).toEqual(getScript(source));
      const s = fixture();
      const printed = {
        ...unit("variant"),
        cardId: id,
        baseMightOverride: undefined,
        empowered: true,
        empowerCount: 3,
      };
      s.units = [printed];
      expect(getMight(s, printed)).toBe(
        getMight(s, { ...printed, cardId: source }),
      );
      expect(getKeywords(s, printed)).toEqual(
        getKeywords(s, { ...printed, cardId: source }),
      );
    },
  );
  it("Vayne's Sentinel printing enters ready and Darius's printing grants its local aura", () => {
    let s = fixture();
    s.fields[0].controller = 1;
    s.units = [unit("enemy", 1, "field:0")];
    s = cast(s, "sfd-223-221");
    expect(s.units.find((u) => u.cardId === "sfd-223-221")?.ready).toBe(true);
    s.units.push({ ...unit("darius"), cardId: "sfd-236-221" });
    const ally = unit("ally", 0, "base:0", 2);
    s.units.push(ally);
    expect(getMight(s, ally)).toBe(3);
  });
  it("Volibear's premium legend offers its paid Mighty trigger", () => {
    let s = fixture();
    s.players[0].legendId = "ogn-300-298";
    s = cast(s, ogn(49));
    expect(s.pendingChoice?.cardId).toBe(ogn(249));
    s = chain(act(s, (a) => !a.id.includes("skip")));
    expect(s.players[0].runes).toHaveLength(1);
    expect(s.players[0].runes[0].ready).toBe(false);
  });
});

describe("effect-directed card finalization", () => {
  it.each([ogn(198), ogn(196), ogn(226), sfd(165), unl(168)])(
    "%s plays the declared physical trash unit through ordinary payment",
    (id) => {
      let s = fixture();
      s.players[0].discard = [ogn(52)];
      if (id === sfd(165)) {
        s.units = [{ ...unit("mixologist"), cardId: id }];
        s = run(s, [{ type: "kill", chosenTargetId: "mixologist" }]);
      } else s = cast(s, id);
      s = chain(s);
      expect(s.units.some((u) => u.cardId === ogn(52))).toBe(true);
      expect(s.players[0].discard.filter((c) => c === ogn(52))).toHaveLength(0);
      expect(validState(s)).toBe(true);
    },
  );
  it("pays Power and taxes even when a parent ignores Energy, and remains resumable", () => {
    let s = fixture();
    s.players[0].discard = [ogn(13)];
    s = resolve(cast(s, ogn(198)));
    expect(s.pendingChoice?.kind).toBe("effectPlay");
    expect(s.players[0].discard).toContain(ogn(198));
    expect(s.units).toHaveLength(0);
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = finishPending(deserializeGame(serializeGame(s)), ogn(13));
    expect(s.players[0].energy).toBe(energy);
    expect(s.players[0].power).toBe(power - (getCard(ogn(13)).power ?? 0));
  });
  it("losing the declared trash visit never substitutes another copy", () => {
    let s = fixture();
    s.players[0].discard = [ogn(49), ogn(49)];
    s = cast(s, ogn(198));
    s.players[0].discard.shift();
    // Make the surviving visit explicit instead of using legacy array identities.
    s.players[0].trashCards = [{ id: "trash:0:other", cardId: ogn(49) }];
    s = chain(s);
    expect(s.units).toHaveLength(0);
    expect(s.players[0].discard).toContain(ogn(49));
  });
  it("a required board cost remains required for a free instructed unit", () => {
    let s = fixture();
    s.players[0].discard = [sfd(44)];
    s = run(s, [
      {
        type: "playCard",
        target: "trashCards",
        play: { zone: "trash", cardTypes: ["Unit"], ignoreCost: true },
        chosenTargetId: "trash:0:legacy:0:sfd-044-221",
      },
    ]);
    expect(options(s).filter((a) => a.category === "play")).toHaveLength(0);
    s = act(s, "cancel-effect-play");
    expect(s.players[0].discard).toContain(sfd(44));
    expect(s.units).toHaveLength(0);
  });
  it("reveals and recycles the rest before finalizing the chosen unit", () => {
    let s = fixture();
    s.players[0].deck = [ogn(49), ogn(52), ogn(50), ogn(58), ogn(64), ogn(217)];
    s = resolve(cast(s, ogn(62)));
    expect(s.pendingChoice?.kind).toBe("custom");
    s = act(s, (a) => a.cardId === ogn(52));
    expect(s.players[0].deck[0]).toBe(ogn(217));
    expect(s.players[0].deck).toHaveLength(5);
    expect(s.players[0].discard).toContain(ogn(62));
    expect(s.units).toHaveLength(0);
    s = finishPending(s, ogn(52));
    expect(s.players[0].energy).toBe(25);
    expect(s.units[0].cardId).toBe(ogn(52));
  });
  it("Void Rush draws unchosen cards, and a failed banished selection stays banished", () => {
    let s = fixture();
    s.players[0].deck = [sfd(44), ogn(49)];
    s = resolve(cast(s, sfd(188)));
    s = act(s, (a) => a.cardId === sfd(44));
    expect(s.players[0].hand).toContain(ogn(49));
    s = act(s, "cancel-effect-play");
    expect(s.players[0].banished).toContain(sfd(44));
    expect(s.players[0].deck).toHaveLength(0);
  });
  it("declining Void Rush draws both cards", () => {
    let s = fixture();
    s.players[0].deck = [ogn(49), ogn(52)];
    s = resolve(cast(s, sfd(188)));
    s = act(s, "choose-custom:play-card:skip");
    expect(s.players[0].hand).toEqual([ogn(49), ogn(52)]);
    expect(s.pendingPlays ?? []).toHaveLength(0);
  });
  it("Here to Help has controlled battlefield destinations and still respects Warden", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally", 0, "field:0")];
    s.players[0].hand = [ogn(49)];
    s = resolve(cast(s, sfd(111)));
    s = act(s, (a) => a.cardId === ogn(49));
    expect(
      options(s)
        .filter((a) => a.category === "play")
        .map((a) => a.locationId),
    ).toEqual(["field:0"]);
    s.units.push({ ...unit("warden", 1, "field:1"), cardId: ogn(70) });
    expect(options(s).filter((a) => a.category === "play")).toHaveLength(0);
    s = act(s, "cancel-effect-play");
    expect(s.players[0].hand).toContain(ogn(49));
  });
  it("Rell attaches the selected Equipment after its parent resolves", () => {
    let s = fixture();
    s.units = [{ ...unit("rell"), cardId: sfd(24) }];
    s.players[0].hand = [sfd(33)];
    s = run(s, getScript(sfd(24))!.onAttack!, "rell");
    s = act(s, (a) => a.cardId === sfd(33));
    s = finishPending(s, sfd(33));
    expect(s.gears[0].attachedTo).toBe("rell");
    expect(s.units[0].gear).toEqual([s.gears[0].id]);
  });
  it("Fizz declares a trash spell before responses and recycles it even when countered", () => {
    let s = fixture();
    s.players[0].discard = [ogn(50)];
    s.units = [unit("target")];
    s = cast(s, sfd(140));
    s = act(s, (a) => !a.id.includes("skip"));
    s = resolve(s);
    s = finishPending(s, ogn(50));
    s.players[1].hand = [ogn(64)];
    s = act(s, "pass");
    s = cast(s, ogn(64));
    s = chain(s);
    expect(s.players[0].discard).not.toContain(ogn(50));
    expect(s.players[0].deck.at(-1)).toBe(ogn(50));
  });
  it("blink creates a new unit object and clears old attachments and temporary statuses", () => {
    let s = fixture();
    s.units = [
      { ...unit("old", 0, "field:0"), buff: 1, temporaryMight: 3, damage: 2 },
    ];
    s.gears = [
      { id: "gear", cardId: sfd(33), owner: 0, ready: true, attachedTo: "old" },
    ];
    s.units[0].gear = ["gear"];
    s = resolve(cast(s, ogn(102), "old"));
    expect(s.units).toHaveLength(0);
    expect(s.gears[0].attachedTo).toBeUndefined();
    s = finishPending(s, ogn(49));
    expect(s.units[0].id).not.toBe("old");
    expect(s.units[0]).toMatchObject({
      location: "base:0",
      ready: false,
      buff: 0,
      damage: 0,
      temporaryMight: 0,
      gear: [],
    });
  });
  it("Rek'Sai grants Accelerate to units instructed from outside hand", () => {
    let s = fixture();
    s.units = [{ ...unit("reksai"), cardId: sfd(29) }];
    s.players[0].discard = [ogn(49)];
    s = resolve(cast(s, ogn(198)));
    expect(options(s).some((a) => a.id.includes("accelerate"))).toBe(true);
    s = act(s, (a) => a.id.includes("accelerate"));
    expect(s.units.find((u) => u.cardId === ogn(49))?.ready).toBe(true);
  });
  it("Rek'Sai grants Accelerate in the champion zone and face-down, but not in hand", () => {
    const s = fixture();
    s.units = [{ ...unit("reksai"), cardId: sfd(29) }];
    s.players[0].championId = ogn(35);
    s.players[0].championAvailable = true;
    s.players[0].hand = [ogn(49)];
    s.fields[0].controller = 0;
    s.hidden = [
      {
        id: "hidden",
        cardId: ogn(121),
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    const accelerated = options(s).filter((a) => a.id.includes("accelerate"));
    expect(accelerated.some((a) => a.sourceId === "champion")).toBe(true);
    expect(accelerated.some((a) => a.sourceId === "hidden:hidden")).toBe(true);
    expect(accelerated.some((a) => a.sourceId?.startsWith("hand:"))).toBe(
      false,
    );
  });
  it("Jax's Quick-Draw is retained when Rell plays an Equipment from hand", () => {
    let s = fixture();
    s.units = [
      { ...unit("jax"), cardId: sfd(54) },
      { ...unit("rell"), cardId: sfd(24) },
    ];
    s.players[0].hand = [sfd(33)];
    s = run(s, getScript(sfd(24))!.onAttack!, "rell");
    s = act(s, (a) => a.cardId === sfd(33));
    s = finishPending(s, sfd(33));
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(options(s).some((a) => a.targetId === "jax")).toBe(true);
    s = chain(s);
    expect(s.gears[0].attachedTo).toBeDefined();
  });
  it("bot observations retain pending plays and only the chooser's inspected deck cards", () => {
    let s = fixture();
    s.players[0].deck = [ogn(49), ogn(52), ogn(11)];
    s = resolve(cast(s, sfd(188)));
    const own = getObservation(s, 0),
      opponent = getObservation(s, 1);
    expect(own.state.players[0].knownTopCards).toEqual([ogn(49), ogn(52)]);
    expect(opponent.state.players[0].knownTopCards).toBeUndefined();
    expect(opponent.state.pendingChoice?.options).toBeUndefined();
    expect(sampleState(own, 17).players[0].deck.slice(0, 2)).toEqual([
      ogn(49),
      ogn(52),
    ]);
    s = act(s, (a) => a.cardId === ogn(49));
    const observed = observationRulesView(getObservation(s, 0));
    expect(getLegalActions(observed, 0).map((a) => a.id)).toEqual(
      options(s).map((a) => a.id),
    );
    const request = getDecisionRequest(s)!;
    expect(validateDecision(s, request, request.fallbackDecision).valid).toBe(
      true,
    );
  });
  it("validates pending card metadata on saved games", () => {
    let s = fixture();
    s.players[0].discard = [ogn(49)];
    s = resolve(cast(s, ogn(198)));
    expect(validState(s)).toBe(true);
    const bad = structuredClone(s) as any;
    bad.pendingPlays[0].spec.energyReduction = -1;
    expect(validState(bad)).toBe(false);
    bad.pendingPlays[0].spec.energyReduction = 0;
    bad.pendingPlays[0].player = 1;
    expect(validState(bad)).toBe(false);
  });
});
