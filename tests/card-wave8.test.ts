import { describe, expect, it } from "vitest";
import { cards } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { cardWave8Scripts } from "../src/game/card-wave8";
import { getScript } from "../src/game/scripts";
import { addToTrash, trashCards } from "../src/game/trash";
import { validState } from "../src/persistence";
import { decisionActions } from "../src/game/flow";
import { fallbackAction } from "../src/game/ai/decisions";
import { getBotAction } from "../src/game/bot";
import { getReferenceAction } from "../src/game/bot-reference";
import { starterDecks } from "../src/data/decks";
import type {
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "../src/game/types";

const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const ven = (n: number) =>
  cards.find((c) => c.set === "VEN" && c.collectorNumber === n && !c.variant)!
    .id;
function fixture() {
  const s = createGame({ seed: 8121 });
  s.phase = "main";
  s.turn = 6;
  s.currentPlayer = s.priorityPlayer = s.focusPlayer = 0;
  s.stack = [];
  s.pendingChoice = null;
  s.pendingTriggers = [];
  s.combat = null;
  s.units = [];
  s.gears = [];
  for (const p of s.players) {
    p.legendId = ogn(259);
    p.hand = [];
    p.discard = [];
    p.deck = Array(30).fill(ogn(49));
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.cardsPlayedThisTurn = 0;
    p.legendUsedTurn = -1;
    p.hasBegun = p.mulliganDone = true;
    p.championAvailable = false;
    p.points = 0;
  }
  for (const f of s.fields) {
    f.cardId = ogn(279);
    f.controller = null;
  }
  return s;
}
function unit(
  id: string,
  might = 1,
  owner: PlayerId = 1,
  cardId = ogn(271),
): Unit {
  return {
    id,
    cardId,
    owner,
    location: "field:0",
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
    baseMightOverride: might,
  };
}
function act(s: GameState, predicate: string | ((a: GameAction) => boolean)) {
  const actions = getLegalActions(s, s.priorityPlayer);
  const a = actions.find(
    typeof predicate === "string" ? (a) => a.id === predicate : predicate,
  );
  expect(a, actions.map((a) => a.id).join("\n")).toBeDefined();
  return applyAction(s, a!);
}
function settle(s: GameState) {
  for (
    let i = 0;
    i < 100 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    s = applyAction(
      s,
      s.pendingChoice
        ? (a.find((a) => a.id.endsWith(":done")) ?? a[0])
        : a.find((a) => a.category === "pass")!,
    );
  }
  expect(s.stack).toHaveLength(0);
  expect(s.pendingChoice).toBeNull();
  return s;
}
function play(s: GameState, id: string) {
  s.players[0].hand.push(id);
  return act(
    s,
    (a) =>
      a.category === "play" && a.cardId === id && !a.id.includes("accelerate"),
  );
}
function select(s: GameState, ids: string[], destination?: string) {
  expect(s.pendingChoice?.kind).toBe("boardTargets");
  for (const id of ids) s = act(s, `choose-board:${id}`);
  if (destination) s = act(s, `choose-board:destination:${destination}`);
  return act(s, "choose-board:done");
}
function queue(
  s: GameState,
  effects: Effect[],
  targetId?: string,
  sourceId?: string,
) {
  s.stack.push({
    id: "test-effect",
    player: 0,
    cardId: ogn(256),
    kind: "ability",
    sourceId,
    effects,
    targetId,
  });
  return s;
}
function resolveOne(s: GameState) {
  return act(act(s, "pass"), "pass");
}

describe("eighth card wave", () => {
  it.each(Object.keys(cardWave8Scripts))(
    "registers a complete explicit face: %s",
    (id) => {
      expect(getScript(id)?.implemented).toBe(true);
    },
  );
  it("declares Fox-Fire before payment and kills all chosen targets together", () => {
    let s = fixture();
    s.units = [unit("a"), unit("b"), unit("c"), unit("d"), unit("other", 1, 0)];
    s = play(s, ogn(256));
    expect(s.players[0].energy).toBe(30);
    expect(s.stack).toHaveLength(0);
    s = select(s, ["a", "b", "c", "d"]);
    expect(s.stack.at(-1)?.targetId).toBe("a~b~c~d");
    expect(s.players[0].energy).toBe(27);
    s = settle(s);
    expect(s.units.map((u) => u.id)).toEqual(["other"]);
  });
  it("enforces total Might, one battlefield and target immunity while selecting", () => {
    let s = fixture();
    s.units = [
      unit("a", 3),
      unit("b", 2),
      { ...unit("elsewhere"), location: "field:1" },
      { ...unit("protected"), untargetableByEnemy: true },
    ];
    s = play(s, ogn(256));
    s = act(s, "choose-board:a");
    const ids = getLegalActions(s, 0).map((a) => a.id);
    expect(ids).not.toContain("choose-board:b");
    expect(ids).not.toContain("choose-board:elsewhere");
    expect(ids).not.toContain("choose-board:protected");
  });
  it("can pay for zero targets and keeps confirmation outside paginated options", () => {
    let s = play(fixture(), ogn(256));
    const ui = decisionActions(s, getLegalActions(s, 0));
    expect(ui.confirm?.id).toBe("choose-board:done");
    expect(ui.options).not.toContain(ui.confirm);
    s = settle(select(s, []));
    expect(s.players[0].energy).toBe(27);
    expect(s.players[0].discard).toContain(ogn(256));
  });
  it("includes Deflect in the group payment and rejects unaffordable additions", () => {
    let s = fixture();
    s.units = [unit("a", 1, 1, ogn(236)), unit("b", 1, 1, ogn(236))];
    s.units.forEach((u) => {
      u.temporaryKeywords = ["Deflect 2"];
    });
    s.players[0].power = 2;
    s = act(play(s, ogn(256)), "choose-board:a");
    expect(getLegalActions(s, 0).some((a) => a.id === "choose-board:b")).toBe(
      false,
    );
    s = act(s, "choose-board:done");
    expect(s.players[0].power).toBe(0);
  });
  it("reselects only original targets when a reaction raises total Might", () => {
    let s = fixture();
    s.units = [unit("a", 2), unit("b", 2), unit("new", 1)];
    s = select(play(s, ogn(256)), ["a", "b"]);
    s = resolveOne(
      queue(s, [{ type: "might", amount: 2, target: "anyUnit" }], "a"),
    );
    s = resolveOne(s);
    expect(s.pendingChoice?.kind).toBe("boardTargets");
    expect(getLegalActions(s, 0).some((a) => a.targetId === "new")).toBe(false);
    s = settle(select(s, ["b"]));
    expect(s.units.map((u) => u.id)).toEqual(["a", "new"]);
  });
  it("rechecks same battlefield after movement and preserves the original identities", () => {
    let s = fixture();
    s.units = [unit("a"), unit("b")];
    s = select(play(s, ogn(256)), ["a", "b"]);
    s.units[0].location = "field:1";
    s = resolveOne(s);
    s = settle(select(s, ["a"]));
    expect(s.units.map((u) => u.id)).toEqual(["b"]);
  });
  it("restores a board draft and a resolution subset draft", () => {
    let s = fixture();
    s.units = [unit("a", 2), unit("b", 2)];
    s = act(play(s, ogn(256)), "choose-board:a");
    expect(validState(s)).toBe(true);
    s = deserializeGame(serializeGame(s))!;
    expect(s.pendingChoice?.boardSelection?.selected).toEqual(["a"]);
    s = act(act(s, "choose-board:b"), "choose-board:done");
    s.units[0].temporaryMight = 2;
    s = resolveOne(s);
    expect(validState(s)).toBe(true);
    s = deserializeGame(serializeGame(s))!;
    s = settle(select(s, ["b"]));
    expect(s.units).toHaveLength(1);
  });
  it("rejects malformed or duplicate saved board selections", () => {
    const s = play(fixture(), ogn(256));
    s.pendingChoice!.boardSelection!.selected = ["a", "a"];
    expect(validState(s)).toBe(false);
    s.pendingChoice!.boardSelection!.selected = [];
    s.pendingChoice!.effect!.group!.totalMight = -1;
    expect(validState(s)).toBe(false);
  });
  it("keeps choice generation linear on a large board", () => {
    let s = fixture();
    s.units = Array.from({ length: 100 }, (_, i) => unit(`u${i}`, 0));
    s = play(s, ogn(256));
    expect(
      getLegalActions(s, 0),
      JSON.stringify({
        phase: s.phase,
        priority: s.priorityPlayer,
        winner: s.winner,
        choice: s.pendingChoice,
        log: s.log.slice(-5),
      }),
    ).toHaveLength(101);
    s = select(
      s,
      s.units.map((u) => u.id),
    );
    s = settle(s);
    expect(s.units).toHaveLength(0);
  });
  it("moves any number of friendly units with Emperor's Divide", () => {
    let s = fixture();
    s.units = [unit("a", 1, 0), unit("b", 1, 0), unit("enemy")];
    s = play(s, sfd(43));
    expect(getLegalActions(s, 0).some((a) => a.targetId === "enemy")).toBe(
      false,
    );
    s = settle(select(s, ["a", "b"]));
    expect(
      s.units
        .filter((u) => u.owner === 0)
        .every((u) => u.location === "base:0"),
    ).toBe(true);
  });
  it("keeps Hidden group choices local and pays the Hidden alternative cost", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [
      unit("own", 1, 0),
      unit("a"),
      { ...unit("elsewhere"), location: "field:1" },
    ];
    s.hidden = [
      {
        id: "hidden:test",
        cardId: ogn(256),
        owner: 0,
        location: "field:0",
        hiddenTurn: 5,
      },
    ];
    s = act(
      s,
      (a) => a.category === "play" && a.sourceId === "hidden:hidden:test",
    );
    expect(getLegalActions(s, 0).some((a) => a.targetId === "elsewhere")).toBe(
      false,
    );
    s = settle(select(s, ["a"]));
    expect(s.players[0].energy).toBe(30);
  });
  it("declares the shared Tricksy Tentacles destination before responses", () => {
    let s = fixture();
    s.units = [
      unit("a", 4),
      { ...unit("b", 4), location: "base:1" },
      unit("large", 9),
    ];
    s = play(s, unl(54));
    expect(
      getLegalActions(s, 0).some((a) => a.id === "choose-board:done"),
    ).toBe(false);
    s = select(s, ["a", "b"], "field:1");
    expect(s.stack.at(-1)?.locationId).toBe("field:1");
    s = settle(s);
    expect(
      s.units
        .filter((u) => u.id !== "large")
        .every((u) => u.location === "field:1"),
    ).toBe(true);
  });
  it("respects prevention of enemy movement", () => {
    let s = fixture();
    s.units = [
      { ...unit("a"), temporaryKeywords: ["Cannot be moved by enemies"] },
    ];
    s = settle(select(play(s, unl(54)), ["a"], "base:1"));
    expect(s.units[0].location).toBe("field:0");
  });
  it("Decree of Discord chooses only enemy Order units with total Might at most five", () => {
    let s = fixture();
    s.units = [
      unit("a", 2, 1, ogn(208)),
      unit("b", 3, 1, ogn(208)),
      unit("own", 1, 0, ogn(208)),
      unit("other", 1, 1, ogn(49)),
    ];
    s = play(s, ven(107));
    expect(
      getLegalActions(s, 0).some((a) =>
        ["own", "other"].includes(a.targetId ?? ""),
      ),
    ).toBe(false);
    s = settle(select(s, ["a", "b"]));
    expect(s.players[1].hand).toEqual([ogn(208), ogn(208)]);
  });
  it("Acceleration Gate readies up to four units, gears and runes across owners", () => {
    let s = fixture();
    s.units = [
      { ...unit("a", 1, 0), ready: false },
      { ...unit("b"), ready: false },
    ];
    s.gears = [{ id: "gear", cardId: ogn(23), owner: 0, ready: false }];
    s.players[1].runes = [{ id: "rune", domain: "Body", ready: false }];
    s.players[0].runes = [{ id: "extra", domain: "Body", ready: false }];
    s = play(s, ven(150));
    for (const id of ["a", "b", "gear", "rune"])
      s = act(s, `choose-board:${id}`);
    expect(getLegalActions(s, 0).some((a) => a.targetId === "extra")).toBe(
      false,
    );
    s = settle(act(s, "choose-board:done"));
    expect(s.units.every((u) => u.ready)).toBe(true);
    expect(s.gears[0].ready).toBe(true);
    expect(s.players[1].runes[0].ready).toBe(true);
  });
  it("Corrupted Dragon enters ready only when more than three points below victory", () => {
    for (const [points, ready] of [
      [4, true],
      [5, false],
    ] as const) {
      let s = fixture();
      s.players[0].points = points;
      s = play(s, ven(91));
      expect(s.units.find((u) => u.cardId === ven(91))?.ready).toBe(ready);
    }
  });
  it("Corrupted Dragon attack chooses enemies here with Might at most five", () => {
    let s = fixture();
    const dragon = {
      ...unit("dragon", 10, 0, ven(91)),
      location: "base:0" as const,
    };
    s.units = [dragon, unit("small", 5), unit("large", 6)];
    s = act(act(s, "move-start:dragon:field:0"), "move-confirm");
    while (s.pendingChoice?.kind === "trigger")
      s = act(
        s,
        (a) => a.id.startsWith("choose-trigger:") && !a.id.includes("skip"),
      );
    expect(s.pendingChoice?.kind).toBe("boardTargets");
    expect(getLegalActions(s, 0).some((a) => a.targetId === "large")).toBe(
      false,
    );
    s = settle(select(s, ["small"]));
    expect(s.units.find((u) => u.id === "small")?.location).toBe("base:1");
  });
  it("Azir moves friendly tokens to his live battlefield after he moves in response", () => {
    let s = fixture();
    s.units = [
      { ...unit("azir", 6, 0, sfd(177)), location: "base:0" },
      { ...unit("token", 1, 0), token: true, location: "base:0" },
      unit("enemy", 4),
    ];
    s = act(act(s, "move-start:azir:field:0"), "move-confirm");
    while (s.pendingChoice?.kind === "trigger")
      s = act(
        s,
        (a) => a.id.startsWith("choose-trigger:") && !a.id.includes("skip"),
      );
    s = select(s, ["token"]);
    s.units.find((u) => u.id === "azir")!.location = "field:1";
    s = settle(s);
    expect(s.units.find((u) => u.id === "token")?.location).toBe("field:1");
  });
  it("Ekko recycles his exact physical copy before opponents can react", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(110));
    const old = trashCards(s, 0)[0].id;
    s.units = [unit("ekko", 5, 0, ogn(110))];
    s.players[0].runes = [{ id: "r", domain: "Mind", ready: false }];
    s = resolveOne(queue(s, [{ type: "kill", target: "anyUnit" }], "ekko"));
    expect(s.stack.at(-1)?.cardId).toBe(ogn(110));
    expect(trashCards(s, 0).map((c) => c.id)).toEqual([old]);
    expect(s.players[0].runes[0].ready).toBe(false);
    s = settle(s);
    expect(s.players[0].runes[0].ready).toBe(true);
  });
  it("Ekko's token cannot pay the recycle cost", () => {
    let s = fixture();
    s.units = [{ ...unit("ekko", 5, 0, ogn(110)), token: true }];
    s.players[0].runes = [{ id: "r", domain: "Mind", ready: false }];
    s = settle(queue(s, [{ type: "kill", target: "anyUnit" }], "ekko"));
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("Overzealous Fan pays its sacrifice before the defensive move resolves", () => {
    let s = fixture();
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    s.units = [
      unit("fan", 1, 0, sfd(128)),
      { ...unit("attacker", 4), location: "base:1" },
    ];
    s.fields[0].controller = 0;
    s = act(act(s, "move-start:attacker:field:0"), "move-confirm");
    s = act(
      s,
      (a) => a.id.startsWith("choose-trigger:") && a.targetId === "attacker",
    );
    expect(s.units.some((u) => u.id === "fan")).toBe(false);
    expect(s.units[0].location).toBe("field:0");
    s = settle(s);
    expect(s.units.find((u) => u.id === "attacker")?.location).toBe("base:1");
  });
  it("Teemo reveals five, deals unit damage per Hidden card, and recycles without drawing", () => {
    let s = fixture();
    s.players[0].deck = [ogn(256), sfd(43), ogn(49), ogn(49), ogn(49), ogn(52)];
    s.units = [unit("teemo", 2, 0, ogn(121)), unit("enemy", 5)];
    s = settle(queue(s, getScript(ogn(121))!.onDefend!, "enemy", "teemo"));
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(2);
    expect(s.players[0].deck).toHaveLength(6);
    expect(s.players[0].deck[0]).toBe(ogn(52));
    expect(s.players[0].hand).toHaveLength(0);
  });
  it("Teemo played from hand does not trigger his defend ability", () => {
    const s = play(fixture(), ogn(121));
    expect(s.pendingChoice).toBeNull();
    expect(s.stack).toHaveLength(0);
  });
  it("Teemo still reveals and recycles when its declared enemy leaves", () => {
    let s = fixture();
    s.units = [unit("teemo", 2, 0, ogn(121))];
    const deck = [...s.players[0].deck];
    s = settle(queue(s, getScript(ogn(121))!.onDefend!, "gone", "teemo"));
    expect(s.log.some((entry) => entry.text.startsWith("Teemo reveals"))).toBe(
      true,
    );
    expect(s.players[0].deck.slice().sort()).toEqual(deck.sort());
  });
  it("Teemo revealed into combat triggers once for defending under the Origins errata", () => {
    let s = fixture();
    s.fields[0].controller = 0;
    s.units = [unit("ally", 3, 0), unit("enemy", 6)];
    s.phase = "showdown";
    s.currentPlayer = 1;
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      designatedUnits: ["ally", "enemy"],
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s.hidden = [
      {
        id: "teemo-hidden",
        owner: 0,
        cardId: ogn(121),
        location: "field:0",
        hiddenTurn: 5,
      },
    ];
    s.players[0].deck = [ogn(256), sfd(43), ogn(49), ogn(49), ogn(49)];
    s = act(
      s,
      (a) => a.category === "play" && a.sourceId === "hidden:teemo-hidden",
    );
    s = settle(s);
    expect(s.units.find((u) => u.id === "enemy")?.damage).toBe(2);
    expect(
      s.log.filter((entry) => entry.text.startsWith("Teemo reveals")),
    ).toHaveLength(1);
  });
  it("Acceleration Gate respects Warden for units and gear while runes can ready", () => {
    let s = fixture();
    s.units = [
      unit("warden", 3, 1, ogn(70)),
      { ...unit("ally", 2, 0), ready: false },
    ];
    s.gears = [{ id: "gear", cardId: ogn(23), owner: 0, ready: false }];
    s.players[0].runes = [{ id: "r", domain: "Body", ready: false }];
    s = settle(select(play(s, ven(150)), ["ally", "gear", "r"]));
    expect(s.units.find((u) => u.id === "ally")?.ready).toBe(false);
    expect(s.gears[0].ready).toBe(false);
    expect(s.players[0].runes[0].ready).toBe(true);
  });
  it("the normal bot finishes a useful multi-object choice without cycles", () => {
    let s = fixture();
    s.units = [unit("a", 2), unit("b", 2)];
    s = play(s, ogn(256));
    for (let i = 0; i < 8 && s.pendingChoice; i++)
      s = applyAction(s, getBotAction(s)!);
    expect(s.pendingChoice).toBeNull();
    s = settle(s);
    expect(s.units).toHaveLength(0);
  });
  it.each([812, 829])(
    "mixed eighth-wave game preserves cards, runes and saved decisions (seed %i)",
    (seed) => {
      const main = [
        ogn(110),
        ogn(121),
        ogn(256),
        sfd(10),
        sfd(43),
        sfd(128),
        sfd(164),
        sfd(177),
        unl(54),
        ven(91),
        ven(107),
        ven(150),
        ogn(49),
      ].map((cardId) => ({ cardId, count: 3 }));
      const deck = { ...starterDecks[0], id: `wave8-${seed}`, main };
      let s = createGame({ seed, playerDeck: deck, botDeck: deck });
      for (let i = 0; i < 2000 && s.winner === null; i++) {
        for (const p of s.players) {
          const total =
            p.deck.length +
            p.hand.length +
            p.discard.length +
            p.banished.length +
            Number(p.championAvailable) +
            s.units.filter((u) => u.owner === p.id && !u.token).length +
            s.gears.filter((g) => g.owner === p.id && !g.token).length +
            s.stack.filter((a) => a.player === p.id && a.kind === "spell")
              .length +
            (s.resolving ?? []).filter(
              (a) => a.player === p.id && a.kind === "spell",
            ).length +
            (s.hidden ?? []).filter((h) => h.owner === p.id).length;
          expect(total).toBe(40);
          expect(p.runes.length + p.runeDeck.length).toBe(12);
          expect(p.energy).toBeGreaterThanOrEqual(0);
        }
        const before = serializeGame(s);
        const a = getReferenceAction(s)!;
        expect(serializeGame(s)).toBe(before);
        expect(a).not.toBeNull();
        s = applyAction(s, a);
        if (s.pendingChoice) {
          expect(validState(s)).toBe(true);
          s = deserializeGame(serializeGame(s))!;
        }
      }
      expect(s.winner).not.toBeNull();
    },
  );
  it("Void Drone discounts champion-zone play but not ordinary hand play", () => {
    let s = fixture();
    s.players[0].championId = sfd(10);
    s.players[0].championAvailable = true;
    s = act(s, (a) => a.category === "play" && a.sourceId === "champion");
    expect(s.players[0].energy).toBe(29);
    s = play(fixture(), sfd(10));
    expect(s.players[0].energy).toBe(27);
  });
  it("Drag Under's granted Flow pays the discounted alternative cost and banishes", () => {
    let s = fixture();
    s.units = [unit("enemy", 8)];
    addToTrash(s, 0, sfd(164));
    s.players[0].grantedFlow = [
      { trashId: trashCards(s, 0)[0].id, turn: s.turn },
    ];
    s = act(s, (a) => a.category === "play" && a.cardId === sfd(164));
    s = settle(s);
    expect(s.players[0].energy).toBe(27);
    expect(s.players[0].banished).toContain(sfd(164));
    expect(s.units).toHaveLength(0);
  });
  it("bot fallback finishes optional groups instead of toggling them indefinitely", () => {
    let s = play(fixture(), unl(54));
    const first = fallbackAction(s, 0)!;
    expect(first.id).toMatch(/^choose-board:destination:/);
    s = applyAction(s, first);
    expect(fallbackAction(s, 0)?.id).toBe("choose-board:done");
  });
});
