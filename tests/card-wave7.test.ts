import { describe, expect, it } from "vitest";
import { cards, getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
  serializeGame,
  deserializeGame,
} from "../src/game/engine";
import { getRulesCardId, getScript } from "../src/game/scripts";
import {
  addToTrash,
  emptyTrash,
  takeTrash,
  trashCards,
} from "../src/game/trash";
import { disempower } from "../src/game/board-rules";
import { decideBot, getBotAction, getObservation } from "../src/game/bot";
import { sampleState } from "../src/game/ai/observation";
import { parseSession, validState } from "../src/persistence";
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
  const s = createGame({ seed: 7103 });
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
    p.hasBegun = true;
    p.mulliganDone = true;
    p.championAvailable = false;
    p.points = 0;
  }
  for (const f of s.fields) {
    f.cardId = ogn(279);
    f.controller = null;
  }
  return s;
}
function unit(cardId: string, owner: PlayerId = 0, id = cardId): Unit {
  return {
    id: `u:${owner}:${id}`,
    cardId,
    owner,
    location: `base:${owner}`,
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: 1,
  };
}
function act(s: GameState, predicate: (a: GameAction) => boolean) {
  const action = getLegalActions(s, s.priorityPlayer).find(predicate);
  expect(
    action,
    getLegalActions(s, s.priorityPlayer)
      .map((a) => a.id)
      .join("\n"),
  ).toBeDefined();
  return applyAction(s, action!);
}
function settle(
  s: GameState,
  choose?: (a: GameAction[], s: GameState) => GameAction | undefined,
) {
  for (
    let i = 0;
    i < 160 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const actions = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(actions, s) ??
        (s.pendingChoice.kind === "trashTargets"
          ? (actions.find((a) => a.id === "choose-trash:done") ??
            actions.find((a) => a.amount === 1))
          : actions[0]))
      : actions.find((a) => a.category === "pass");
    if (!action) throw new Error("Stuck: " + s.phase);
    s = applyAction(s, action);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
function play(s: GameState, cardId: string, targetId?: string, mode?: number) {
  s.players[s.priorityPlayer].hand.push(cardId);
  return act(
    s,
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      a.targetId === targetId &&
      !a.additionalCostPaid &&
      !a.repeated &&
      !a.id.includes("accelerate") &&
      !a.locationId?.startsWith("field:") &&
      (mode === undefined || a.id.includes(`|mode:${mode}`)),
  );
}
function ability(s: GameState, sourceId: string, targetId?: string, index = 0) {
  return act(
    s,
    (a) =>
      a.id.startsWith(`ability|${sourceId}|${index}|`) &&
      a.targetId === targetId,
  );
}
function selectTrash(s: GameState, ids: string[]) {
  expect(s.pendingChoice?.kind).toBe("trashTargets");
  for (const id of ids) s = act(s, (a) => a.targetId === id);
  return act(s, (a) => a.id === "choose-trash:done");
}
function effect(
  s: GameState,
  effects: Effect[],
  player: PlayerId = 0,
  sourceId?: string,
) {
  s.stack.push({
    id: "fixture-effect",
    kind: "ability",
    cardId: ogn(29),
    player,
    effects,
    sourceId,
  });
  return settle(s);
}
function endTurn(s: GameState) {
  return settle(act(s, (a) => a.id === "end-turn"));
}

describe("physical trash targets", () => {
  it("retains duplicate identities through removal, re-entry, emptying, and save/load", () => {
    const s = fixture();
    addToTrash(s, 0, ogn(49), ogn(49));
    const [a, b] = trashCards(s, 0);
    const before = serializeGame(s);
    getLegalActions(s, 0);
    expect(serializeGame(s)).toBe(before);
    takeTrash(s, 0, a.id);
    expect(trashCards(s, 0)[0].id).toBe(b.id);
    addToTrash(s, 0, a.cardId);
    expect(trashCards(s, 0).map((c) => c.id)).not.toContain(a.id);
    expect(trashCards(deserializeGame(serializeGame(s)), 0)).toEqual(
      trashCards(s, 0),
    );
    emptyTrash(s, 0);
    addToTrash(s, 0, ogn(49));
    expect(trashCards(s, 0)[0].id).not.toBe(b.id);
  });
  it.each([false, true])(
    "Aspiring Engineer retains the selected copy across a reaction (remove selected=%s)",
    (removeSelected) => {
      let s = fixture();
      addToTrash(s, 0, ogn(32), ogn(32));
      const [a, b] = trashCards(s, 0);
      s = play(s, sfd(61));
      s = act(s, (action) => action.targetId === b.id);
      expect(s.stack.at(-1)?.targetId).toBe(b.id);
      s = act(s, (a) => a.id === "pass");
      s = play(s, unl(103), undefined, 0);
      s = selectTrash(s, [removeSelected ? b.id : a.id]);
      s = settle(s);
      expect(s.players[0].hand.filter((c) => c === ogn(32))).toHaveLength(
        removeSelected ? 0 : 1,
      );
      expect(trashCards(s, 0).map((c) => c.id)).not.toContain(b.id);
      if (removeSelected) expect(trashCards(s, 0)[0].id).toBe(a.id);
    },
  );
  it("a departed target does not return a fresh visit of the same card", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(32));
    const chosen = trashCards(s, 0)[0];
    s = play(s, sfd(61));
    takeTrash(s, 0, chosen.id);
    addToTrash(s, 0, chosen.cardId);
    s = settle(s);
    expect(s.players[0].hand).not.toContain(ogn(32));
    expect(s.players[0].discard).toContain(ogn(32));
  });
  it("Starhound filters tribe tags before responses", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(49), ogn(32));
    const legalTribe = cards.find(
      (c) => getScript(c.id) && c.tags.includes("Poro"),
    )!;
    addToTrash(s, 0, legalTribe.id, legalTribe.id);
    s = play(s, unl(167));
    expect(s.pendingChoice?.kind).toBe("trigger");
    const actions = getLegalActions(s, 0);
    expect(actions).toHaveLength(2);
    s = settle(s);
    expect(s.players[0].hand).toContain(legalTribe.id);
  });
  it("Guardian of the Passage targets a unit or gear when holding", () => {
    let s = fixture();
    const guardian = unit(sfd(35));
    guardian.location = "field:0";
    s.units = [guardian];
    s.fields[0].controller = 0;
    addToTrash(s, 0, ogn(49), ogn(32), ogn(9));
    s = endTurn(s);
    s = act(s, (a) => a.id === "end-turn");
    const targets = getLegalActions(s, 0)
      .filter((a) => a.targetId)
      .map((a) => a.targetId);
    expect(targets).toEqual(
      trashCards(s, 0)
        .filter((c) => getCard(c.cardId).type !== "Spell")
        .map((c) => c.id),
    );
    s = settle(s);
    expect(s.players[0].hand).toContain(ogn(49));
  });
  it("Shadows of the Past declares both public targets before payment and restores the draft", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(49));
    addToTrash(s, 1, ogn(52));
    const ids = [trashCards(s, 0)[0].id, trashCards(s, 1)[0].id];
    s = play(s, ven(103));
    expect(s.stack).toHaveLength(0);
    expect(s.players[0].energy).toBe(30);
    s = act(s, (a) => a.targetId === ids[0]);
    expect(validState(s)).toBe(true);
    s = parseSession(serializeGame(s)).match!;
    expect(s).not.toBeNull();
    s = act(s, (a) => a.targetId === ids[1]);
    s = act(s, (a) => a.id === "choose-trash:done");
    expect(s.stack.at(-1)?.targetId).toBe(ids.join("~"));
    expect(s.players[0].energy).toBeLessThan(30);
    s = settle(s);
    expect(s.players[0].hand).toContain(ogn(49));
    expect(s.players[1].hand).toContain(ogn(52));
  });
  it("Disposal Order can draw with no trash, or choose zero without drawing", () => {
    let s = settle(play(fixture(), unl(103), undefined, 1));
    expect(s.players[0].hand).toHaveLength(1);
    s = fixture();
    s = play(s, unl(103), undefined, 0);
    s = settle(selectTrash(s, []));
    expect(s.players[0].hand).toHaveLength(0);
  });
  it("Dr. Mundo recycles three declared cards at Beginning and loses their Might", () => {
    let s = fixture();
    const mundo = unit(ogn(109));
    s.units = [mundo];
    addToTrash(s, 0, ogn(49), ogn(49), ogn(49), ogn(49));
    expect(getMight(s, mundo)).toBe(10);
    s = endTurn(s);
    s = act(s, (a) => a.id === "end-turn");
    expect(s.pendingChoice?.kind).toBe("trashTargets");
    expect(
      getLegalActions(s, 0).some((a) => a.id === "choose-trash:done"),
    ).toBe(false);
    s = selectTrash(
      s,
      trashCards(s, 0)
        .slice(0, 3)
        .map((c) => c.id),
    );
    s = settle(s);
    expect(s.players[0].discard).toHaveLength(1);
    expect(getMight(s, s.units[0])).toBe(7);
  });
  it("scales declaration linearly in a large trash and the bot completes it", () => {
    let s = fixture();
    addToTrash(s, 1, ...Array(100).fill(ogn(49)));
    s = play(s, unl(103), undefined, 0);
    expect(getLegalActions(s, 0)).toHaveLength(101);
    for (let i = 0; i < 4; i++) s = applyAction(s, getBotAction(s, 0)!);
    expect(s.pendingChoice).toBeNull();
    expect(s.stack.at(-1)?.targetId?.split("~")).toHaveLength(3);
  });
  it("a zero-budget bot completes a mandatory trash selection without toggling", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(49), ogn(52), ogn(32));
    s.phase = "choice";
    s.currentPlayer = 1;
    s.pendingChoice = {
      player: 0,
      kind: "trashTargets",
      remaining: 1,
      returnPhase: "main",
      returnPriority: 0,
      effect: { type: "special", target: "trashCards", targetCount: 2 },
      trashSelection: {
        selected: [],
        action: {
          id: "declared",
          label: "Declared targets",
          player: 0,
          category: "ability",
        },
      },
    };
    for (let i = 0; i < 2; i++) {
      const result = decideBot(s, 0, { deterministic: true, maxNodes: 0 })!;
      expect(result.action.amount).toBe(1);
      s = applyAction(s, result.action);
      expect(s.pendingChoice!.trashSelection!.selected).toHaveLength(i + 1);
    }
    expect(
      decideBot(s, 0, { deterministic: true, maxNodes: 0 })!.action.id,
    ).toBe("choose-trash:done");
  });
  it("the simulation keeps public resolving abilities and restricted resources", () => {
    const s = fixture();
    s.resolvingAbilities = [
      {
        id: "ability-1",
        cardId: ogn(212),
        player: 0,
        kind: "ability",
        effects: [{ type: "draw", amount: 1 }],
        abilityEnergyCost: 2,
      },
    ];
    s.players[0].unitEnergy = 4;
    s.players[0].spellPower = 2;
    const simulated = sampleState(getObservation(s, 0), 123);
    expect(simulated.resolvingAbilities).toEqual(s.resolvingAbilities);
    expect(simulated.players[0].unitEnergy).toBe(4);
    expect(simulated.players[0].spellPower).toBe(2);
  });
  it("Forge of the Future pays its sacrifice only after target declaration and still makes a Recruit on play", () => {
    let s = settle(play(fixture(), ogn(212)));
    expect(s.units.some((u) => u.token)).toBe(true);
    const forge = s.gears.find((g) => g.cardId === ogn(212))!;
    addToTrash(s, 1, ogn(49), ogn(52));
    const targets = trashCards(s, 1).map((c) => c.id);
    s = ability(s, forge.id);
    expect(s.gears.some((g) => g.id === forge.id)).toBe(true);
    s = selectTrash(s, targets);
    expect(s.gears.some((g) => g.id === forge.id)).toBe(false);
    expect(s.players[0].discard).toContain(ogn(212));
    s = settle(s);
    expect(s.players[1].discard).toHaveLength(0);
  });
  it("rejects corrupt saved identity tables and duplicate selections", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(49), ogn(49));
    s.players[0].trashCards![1].id = s.players[0].trashCards![0].id;
    expect(validState(s)).toBe(false);
    s = fixture();
    addToTrash(s, 1, ogn(49));
    s = play(s, unl(103), undefined, 0);
    const id = trashCards(s, 1)[0].id;
    s.pendingChoice!.trashSelection!.selected = [id, id];
    expect(validState(s)).toBe(false);
  });
});

describe("hero and shared rules", () => {
  it("Renekton's pool also pays an expansion module's seven-Energy unit activation", () => {
    let s = fixture();
    const target = unit(ven(43));
    s.units = [target];
    s.players[0].energy = 0;
    s.players[0].unitEnergy = 7;
    const before = serializeGame(s);
    const actions = getLegalActions(s, 0);
    expect(serializeGame(s)).toBe(before);
    const activation = actions.find((a) =>
      a.id.startsWith(`ven-empower:${target.id}:`),
    );
    expect(activation).toBeDefined();
    s = applyAction(s, activation!);
    expect(s.players[0].unitEnergy).toBe(0);
    expect(s.stack[0].abilityEnergyCost).toBe(7);
    s = settle(s);
    expect(s.units[0].empowered).toBe(true);
  });
  it("Nasus observes a completed seven-Energy expansion ability, including a saved choice", () => {
    let s = fixture();
    const target = unit(ven(43));
    s.units = [target];
    s.players[0].legendId = ven(145);
    s.players[0].runes = [{ id: "nasus:module", domain: "Mind", ready: false }];
    s = act(s, (a) => a.id.startsWith(`ven-empower:${target.id}:`));
    expect(s.players[0].legendUsedTurn).toBe(-1);
    expect(s.pendingChoice).toBeNull();
    s = act(s, (a) => a.id === "pass");
    s = act(s, (a) => a.id === "pass");
    expect(s.pendingChoice?.kind).toBe("readyRunes");
    s = parseSession(JSON.stringify({ match: s, review: null })).match!;
    s = settle(s);
    expect(s.players[0].runes[0].ready).toBe(true);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
  });
  it("Kai'Sa's Power pays spell costs but cannot pay unit costs, Equip, or hiding", () => {
    let s = fixture();
    s.players[0].legendId = ogn(247);
    s.players[0].power = 0;
    const ally = unit(ogn(49));
    s.units = [ally];
    s.gears = [{ id: "blade", cardId: sfd(95), owner: 0, ready: true }];
    s.players[0].hand = [sfd(61), ogn(83), ogn(50)];
    s.fields[0].controller = 0;
    s = ability(s, "legend");
    expect(s.stack).toHaveLength(0);
    expect(s.players[0].spellPower).toBe(1);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.cardId === sfd(61) && a.category === "play",
      ),
    ).toBe(false);
    expect(
      getLegalActions(s, 0).some(
        (a) => a.id.startsWith("equip:") || a.id.startsWith("hide:"),
      ),
    ).toBe(false);
    s = act(
      s,
      (a) =>
        a.category === "play" && a.cardId === ogn(50) && a.targetId === ally.id,
    );
    expect(s.players[0].spellPower).toBe(0);
    expect(s.players[0].powerSpentThisTurn).toBe(1);
    s = settle(s);
    expect(s.units[0].stunned).toBe(true);
  });
  it("spell-only Power is allocated across colored cost and Deflect without consuming unusable runes", () => {
    let s = fixture();
    const target = unit(sfd(54), 1);
    s.units = [target];
    s.players[0].power = 0;
    s.players[0].spellPower = 1;
    s.players[0].runes = [{ id: "body", domain: "Body", ready: false }];
    s = play(s, ogn(50), target.id);
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.players[0].spellPower).toBe(0);
    expect(s.players[0].powerSpentThisTurn).toBe(2);
  });
  it("Renekton's Energy pays units and unit abilities, but not spells or gear", () => {
    let s = fixture();
    s.players[0].legendId = ven(141);
    s.players[0].energy = 0;
    s.players[0].power = 2;
    s.units = [unit(ven(134))];
    s.players[0].hand = [ogn(52), sfd(95), ogn(58)];
    s = ability(s, "legend");
    expect(s.players[0].power).toBe(0);
    expect(s.players[0].unitEnergy).toBe(2);
    expect(s.stack).toHaveLength(0);
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.category === "play")
        .every((a) => a.cardId === ogn(52)),
    ).toBe(true);
    s = act(
      s,
      (a) =>
        a.category === "play" &&
        a.cardId === ogn(52) &&
        a.locationId === "base:0",
    );
    expect(s.players[0].unitEnergy).toBe(2 - (getCard(ogn(52)).energy ?? 0));
    s.players[0].unitEnergy = 3;
    s = settle(ability(s, s.units.find((u) => u.cardId === ven(134))!.id));
    expect(s.players[0].unitEnergy).toBe(0);
    expect(s.players[0].energy).toBe(0);
    expect(s.units.find((u) => u.cardId === ven(134))!.empowerCount).toBe(1);
  });
  it("restricted resources survive save/load and expire at the turn boundary", () => {
    let s = fixture();
    s.players[0].spellPower = 2;
    s.players[0].unitEnergy = 3;
    s = parseSession(JSON.stringify({ match: s, review: null })).match!;
    expect(s.players[0].spellPower).toBe(2);
    expect(s.players[0].unitEnergy).toBe(3);
    s = endTurn(s);
    expect(s.players[0].spellPower).toBe(0);
    expect(s.players[0].unitEnergy).toBe(0);
  });
  it("Kennen's legend empowers on champion plays, and disempowers as an upfront Action cost", () => {
    let s = fixture();
    s.players[0].legendId = ven(155);
    s.players[0].championId = ogn(197);
    s.players[0].championAvailable = true;
    s = settle(
      act(
        s,
        (a) =>
          a.category === "play" &&
          a.sourceId === "champion" &&
          a.locationId === "base:0",
      ),
    );
    expect(s.players[0].legendEmpowered).toBe(true);
    const target = s.units[0];
    s = ability(s, "legend", target.id);
    expect(s.players[0].legendEmpowered).toBe(false);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.units[0].temporaryAssault).toBe(0);
    s = settle(s);
    expect(s.units[0].temporaryAssault).toBe(2);
  });
  it.each([false, true])(
    "Kennen's legend waits for a Hidden spell to resolve (countered=%s)",
    (countered) => {
      let s = fixture();
      s.players[0].legendId = ven(155);
      s.hidden = [
        {
          id: "hidden",
          cardId: ogn(83),
          owner: 0,
          location: "field:0",
          hiddenTurn: s.turn - 1,
        },
      ];
      s.fields[0].controller = 0;
      const holder = unit(ogn(49));
      holder.location = "field:0";
      s.units = [holder];
      s = act(
        s,
        (a) => a.category === "play" && a.sourceId === "hidden:hidden",
      );
      expect(s.players[0].legendEmpowered).toBeFalsy();
      expect(s.stack).toHaveLength(1);
      if (countered) {
        const target = s.stack[0].id;
        s = act(s, (a) => a.id === "pass");
        s = play(s, ogn(45), target);
      }
      s = settle(s);
      expect(!!s.players[0].legendEmpowered).toBe(!countered);
    },
  );
  it("Kennen grants Flow to one physical spell, preserving costs, timing, and banishment", () => {
    let s = fixture();
    const kennen = unit(ven(113));
    s.units = [kennen];
    addToTrash(s, 0, ogn(50), ogn(50));
    const [a, b] = trashCards(s, 0);
    s = act(
      s,
      (a) =>
        a.id.startsWith("move-start:") &&
        a.sourceId === kennen.id &&
        a.locationId === "field:0",
    );
    s = act(s, (a) => a.id === "move-confirm");
    s = act(s, (a) => a.id === "pass");
    s = act(s, (a) => a.id === "pass");
    s = act(s, (action) => action.targetId === b.id);
    s = settle(s);
    expect(s.players[0].grantedFlow).toEqual([{ trashId: b.id, turn: s.turn }]);
    s = parseSession(JSON.stringify({ match: s, review: null })).match!;
    const plays = getLegalActions(s, 0).filter(
      (a) => a.category === "play" && a.cardId === ogn(50),
    );
    expect(plays.length).toBeGreaterThan(0);
    expect(plays.every((a) => a.sourceId === "trash:1:granted")).toBe(true);
    const energy = s.players[0].energy,
      power = s.players[0].power!;
    s = applyAction(s, plays[0]);
    expect(s.players[0].energy).toBe(energy - (getCard(ogn(50)).energy ?? 0));
    expect(s.players[0].power).toBe(power - 1);
    s = settle(s);
    expect(s.players[0].banished).toContain(ogn(50));
    expect(trashCards(s, 0).map((c) => c.id)).toContain(a.id);
    expect(
      getLegalActions(s, 0).some((a) => a.sourceId?.startsWith("trash:")),
    ).toBe(false);
  });
  it("a Flow grant expires on leaving trash or reaching the next turn", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(83));
    const old = trashCards(s, 0)[0];
    s.players[0].grantedFlow = [{ trashId: old.id, turn: s.turn }];
    takeTrash(s, 0, old.id);
    addToTrash(s, 0, old.cardId);
    expect(
      getLegalActions(s, 0).some((a) => a.sourceId?.startsWith("trash:")),
    ).toBe(false);
    s.players[0].grantedFlow = [
      { trashId: trashCards(s, 0)[0].id, turn: s.turn },
    ];
    s = endTurn(s);
    expect(s.players[0].grantedFlow).toEqual([]);
  });
  it("Nasus declares up to two runes and exhausts before responses, using printed cost", () => {
    let s = fixture();
    s.players[0].legendId = ven(145);
    s.players[0].energy = 0;
    s.players[0].unitEnergy = 8;
    s.players[0].runes = [0, 1, 2].map((n) => ({
      id: `nasus:${n}`,
      domain: "Mind",
      ready: false,
    }));
    s = play(s, ogn(88));
    expect(s.pendingChoice?.kind).toBe("readyRunes");
    s = act(s, (a) => a.sourceId === "nasus:0");
    s = act(s, (a) => a.sourceId === "nasus:1");
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
    s = settle(s);
    expect(s.players[0].runes.filter((r) => r.ready)).toHaveLength(2);
  });
  it.each([false, true])(
    "Prize waits for a gear ability, and Not So Fast can stop it (countered=%s)",
    (countered) => {
      let s = fixture();
      const prize = unit(sfd(75)),
        enemy = unit(ogn(88), 1);
      enemy.location = "field:0";
      s.units = [prize, enemy];
      s.gears = [{ id: "ballista", cardId: ogn(17), owner: 0, ready: true }];
      s = ability(s, "ballista", enemy.id);
      expect(s.stack).toHaveLength(1);
      expect(s.units[0].temporaryMight).toBe(0);
      if (countered) {
        const target = s.stack[0].id;
        s = act(s, (a) => a.id === "pass");
        s = play(s, sfd(45), target);
      }
      s = settle(s);
      expect(s.units.find((u) => u.id === prize.id)!.temporaryMight).toBe(
        countered ? 0 : 1,
      );
      expect(s.units.find((u) => u.id === enemy.id)!.damage).toBe(
        countered ? 0 : 2,
      );
      expect(s.players[0].discard).not.toContain(ogn(17));
      expect(s.gears[0].cardId).toBe(ogn(17));
    },
  );
  it("Repulse permits only one friendly chosen unit, at a battlefield", () => {
    let s = fixture();
    const first = unit(ogn(88), 1, "a"),
      second = unit(ogn(88), 1, "b");
    first.location = second.location = "field:0";
    s.units = [first, second];
    s = play(s, ogn(29), first.id + "~" + second.id);
    s = act(s, (a) => a.id === "pass");
    s.players[1].hand = [unl(106)];
    expect(getLegalActions(s, 1).some((a) => a.cardId === unl(106))).toBe(
      false,
    );
    s.stack[0].targetId = first.id + "~" + first.id;
    const target = `${first.id}~${s.stack[0].id}`;
    expect(getLegalActions(s, 1).some((a) => a.targetId === target)).toBe(true);
    s = act(s, (a) => a.cardId === unl(106) && a.targetId === target);
    s = settle(s);
    expect(s.units.every((u) => u.damage === 0)).toBe(true);
    expect(s.players[0].discard).toContain(ogn(29));
  });
  it("Prize waits through a saved multi-token ability until all its choices finish", () => {
    let s = fixture();
    s.units = [unit(sfd(75))];
    s.gears = [{ id: "armory", cardId: sfd(168), owner: 0, ready: true }];
    s = ability(s, "armory");
    s = act(s, (a) => a.id === "pass");
    s = act(s, (a) => a.id === "pass");
    expect(s.pendingChoice?.kind).toBe("token");
    expect(s.resolvingAbilities).toHaveLength(1);
    expect(s.units[0].temporaryMight).toBe(0);
    s = parseSession(JSON.stringify({ match: s, review: null })).match!;
    expect(s).not.toBeNull();
    s = settle(s);
    expect(s.units[0].temporaryMight).toBe(1);
    expect(s.resolvingAbilities).toEqual([]);
    expect(s.units.filter((u) => u.token)).toHaveLength(3);
  });
  it("Mageseeker Warden permits entering ready under Magma Wurm", () => {
    let s = fixture();
    const warden = unit(ogn(70), 1);
    warden.location = "field:0";
    s.units = [warden, unit(ogn(11))];
    s = settle(play(s, ogn(49)));
    expect(s.units.find((u) => u.cardId === ogn(49))?.ready).toBe(true);
  });
  it("Jinx, Rebel triggers once for a batch of two discarded cards", () => {
    let s = fixture();
    const jinx = unit(ogn(202));
    jinx.ready = false;
    s.units = [jinx];
    s.players[0].hand = [ogn(49), ogn(49)];
    s = effect(s, [{ type: "discard", amount: 2 }]);
    expect(s.units[0].ready).toBe(true);
    expect(s.units[0].temporaryMight).toBe(1);
    expect(s.players[0].discardedThisTurn).toBe(2);
    expect(s.players[0].discard).toHaveLength(2);
  });
  it("two separate discard instructions trigger Jinx twice", () => {
    let s = fixture();
    s.units = [unit(ogn(202))];
    s.players[0].hand = [ogn(49), ogn(49)];
    s = effect(s, [{ type: "discard" }, { type: "discard" }]);
    expect(s.units[0].temporaryMight).toBe(2);
  });
  it.each(["Unit", "Spell", "Gear"])(
    "Hwei's %s discard creates a separate reflexive trigger",
    (type) => {
      let s = fixture();
      const hwei = unit(unl(80));
      s.units = [hwei];
      const discarded =
        type === "Unit" ? ogn(49) : type === "Spell" ? ogn(9) : sfd(95);
      s.players[0].hand = [discarded];
      s.players[0].runes = [0, 1, 2].map((n) => ({
        id: `r:${n}`,
        domain: "Mind",
        ready: false,
      }));
      s = act(
        s,
        (a) =>
          a.id.startsWith("move-start:") &&
          a.sourceId === hwei.id &&
          a.locationId === "field:0",
      );
      s = act(s, (a) => a.id.startsWith("move-confirm"));
      for (let i = 0; i < 10 && s.pendingChoice?.kind !== "discard"; i++)
        s = act(s, (a) => a.id === "pass");
      expect(s.pendingChoice?.kind).toBe("discard");
      s = act(s, (a) => a.cardId === discarded);
      expect(s.pendingChoice || s.stack.length).toBeTruthy();
      if (type === "Gear") {
        expect(s.pendingChoice?.kind).toBe("readyRunes");
        s = act(s, (a) => a.sourceId === "r:0");
        s = act(s, (a) => a.sourceId === "r:1");
        expect(s.stack.at(-1)?.effects[0].type).toBe("readyRunes");
        expect(s.players[0].runes.every((r) => !r.ready)).toBe(true);
      } else
        expect(s.stack.at(-1)?.effects[0].type).toBe(
          type === "Spell" ? "draw" : "might",
        );
      s = settle(s);
      if (type === "Unit") expect(s.units[0].temporaryMight).toBe(3);
      if (type === "Spell") expect(s.players[0].hand).toHaveLength(2);
      if (type === "Gear")
        expect(s.players[0].runes.filter((r) => r.ready)).toHaveLength(2);
    },
  );
  it("Miss Fortune readies another exhausted object on only her first move", () => {
    let s = fixture();
    const mf = unit(ogn(162));
    s.units = [mf];
    s.players[0].runes = [{ id: "r:target", domain: "Body", ready: false }];
    s.players[1].legendUsedTurn = s.turn;
    s = act(
      s,
      (a) =>
        a.id.startsWith("move-start:") &&
        a.sourceId === mf.id &&
        a.locationId === "field:0",
    );
    s = act(s, (a) => a.id.startsWith("move-confirm"));
    expect(s.pendingChoice?.kind).toBe("trigger");
    expect(getLegalActions(s, 0).some((a) => a.targetId === "legend:1")).toBe(
      true,
    );
    expect(getLegalActions(s, 0).some((a) => a.targetId === mf.id)).toBe(false);
    s = act(s, (a) => a.targetId === "r:target");
    s = settle(s);
    expect(s.players[0].runes[0].ready).toBe(true);
    s.players[0].runes[0].ready = false;
    s = effect(s, [
      { type: "moveTarget", target: "anyUnit", chosenTargetId: mf.id },
    ]);
    expect(s.units[0].movesThisTurn).toBe(2);
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("Jayce readies another object on play and on the first non-token gear play of the turn", () => {
    let s = fixture();
    s.players[0].runes = [{ id: "r:jayce", domain: "Mind", ready: false }];
    s = settle(play(s, ven(68)), (a) =>
      a.find((a) => a.targetId === "r:jayce"),
    );
    expect(s.players[0].runes[0].ready).toBe(true);
    s.players[0].runes[0].ready = false;
    s = settle(play(s, sfd(95)), (a) =>
      a.find((a) => a.targetId === "r:jayce"),
    );
    expect(s.players[0].runes[0].ready).toBe(true);
    s.players[0].runes[0].ready = false;
    s = settle(play(s, sfd(95)));
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("a gear played before Jayce still consumes the first-gear condition", () => {
    let s = settle(play(fixture(), sfd(95)));
    s.units.push(unit(ven(68)));
    s.players[0].runes = [{ id: "r:late", domain: "Mind", ready: false }];
    s = settle(play(s, sfd(95)));
    expect(s.players[0].runes[0].ready).toBe(false);
  });
  it("Sivir gains Might and Ganking after two paid Power and resets next turn", () => {
    let s = fixture();
    const sivir = unit(sfd(143));
    s.units = [sivir];
    const printed = getMight(s, sivir);
    s = settle(play(s, sfd(61)));
    s = settle(play(s, sfd(61)));
    expect(s.players[0].powerSpentThisTurn).toBe(2);
    expect(getMight(s, s.units[0])).toBe(printed + 2);
    expect(getKeywords(s, s.units[0])).toContain("Ganking");
    expect(validState(s)).toBe(true);
    s = endTurn(s);
    expect(getMight(s, s.units[0])).toBe(printed);
    expect(getKeywords(s, s.units[0])).not.toContain("Ganking");
  });
  it("Kayle stacks three Empowered statuses, loses one per disempower, and can activate at the cap", () => {
    let s = fixture();
    const kayle = unit(ven(134));
    s.units = [kayle];
    const printed = getMight(s, kayle);
    for (let i = 0; i < 3; i++) s = settle(ability(s, kayle.id));
    expect(s.units[0].empowerCount).toBe(3);
    expect(getMight(s, s.units[0])).toBe(printed + 6);
    expect(getKeywords(s, s.units[0])).toEqual(
      expect.arrayContaining(["Deflect 3", "Ganking"]),
    );
    s = settle(ability(s, kayle.id));
    expect(s.units[0].empowerCount).toBe(3);
    expect(s.players[0].energy).toBe(18);
    s = settle(play(s, ven(127), kayle.id));
    expect(s.units[0].empowerCount).toBe(2);
    expect(s.units[0].empowered).toBe(true);
    expect(getMight(s, s.units[0])).toBe(printed + 4);
    expect(getKeywords(s, s.units[0])).not.toContain("Deflect 3");
    disempower(s.units[0]);
    disempower(s.units[0]);
    expect(s.units[0].empowered).toBe(false);
    expect(parseSession(serializeGame(s)).match?.units[0].empowerCount).toBe(0);
  });
  it("Teemo's legend offers the Energy hide cost and returns his chosen champion or board unit", () => {
    let s = fixture();
    s.players[0].legendId = ogn(263);
    s.players[0].energy = 1;
    s.players[0].power = 0;
    s.fields[0].controller = 0;
    const ally = unit(ogn(49));
    ally.location = "field:0";
    s.units = [ally];
    s.players[0].hand = [ogn(197)];
    const hides = getLegalActions(s, 0).filter((a) => a.id.startsWith("hide:"));
    expect(hides).toHaveLength(1);
    expect(hides[0].id).toMatch(/:energy$/);
    s = applyAction(s, hides[0]);
    expect(s.players[0].energy).toBe(0);
    s = fixture();
    s.players[0].legendId = ogn(263);
    s.players[0].championId = ogn(197);
    s.players[0].championAvailable = true;
    s = settle(ability(s, "legend", "champion:0"));
    expect(s.players[0].championAvailable).toBe(false);
    expect(s.players[0].hand).toContain(ogn(197));
    s = fixture();
    s.players[0].legendId = ogn(263);
    const scout = unit(ogn(197));
    s.units = [scout];
    s = settle(ability(s, "legend", scout.id));
    expect(s.units).toHaveLength(0);
    expect(s.players[0].hand).toContain(ogn(197));
  });
  it("Guerilla Warfare returns only Hidden cards and makes subsequent hides free this turn", () => {
    let s = fixture();
    addToTrash(s, 0, ogn(197), ogn(49));
    s.fields[0].controller = 0;
    const ally = unit(ogn(49));
    ally.location = "field:0";
    s.units = [ally];
    s = play(s, ogn(264));
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.cardId)
        .map((a) => a.cardId),
    ).toEqual([ogn(197)]);
    s = settle(selectTrash(s, [trashCards(s, 0)[0].id]));
    s.players[0].energy = s.players[0].power = 0;
    s = act(s, (a) => a.id.startsWith("hide:"));
    expect(s.hidden).toHaveLength(1);
    expect(s.players[0].freeHideTurn).toBe(s.turn);
    s = endTurn(s);
    expect(s.players[0].freeHideTurn).not.toBe(s.turn);
  });
  it("Jax grants Quick-Draw to Equipment in hand and its attachment can be answered", () => {
    let s = fixture();
    const jax = unit(sfd(54));
    s.units = [jax];
    s.stack = [
      {
        id: "response",
        kind: "ability",
        cardId: ogn(29),
        player: 1,
        effects: [{ type: "draw" }],
      },
    ];
    s = play(s, sfd(95));
    expect(s.gears).toHaveLength(1);
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.stack.at(-1)?.effects[0].type).toBe("equip");
    s = settle(s);
    expect(s.gears[0].attachedTo).toBe(jax.id);
    expect(getMight(s, s.units[0])).toBe((getCard(sfd(54)).might ?? 0) + 2);
  });
  it("Jax does not duplicate an Equipment's existing Quick-Draw trigger", () => {
    let s = fixture();
    s.units = [unit(sfd(54))];
    s = play(s, sfd(22));
    expect(s.stack.filter((item) => item.cardId === sfd(22))).toHaveLength(1);
    s = settle(s);
    expect(s.gears[0].attachedTo).toBe(s.units[0].id);
  });
  it("Jax's legend distinguishes detached and attached Equipment and pays before responses", () => {
    let s = fixture();
    s.players[0].legendId = sfd(193);
    const a = unit(ogn(49)),
      b = unit(ogn(52));
    s.units = [a, b];
    s.gears = [{ id: "gear", cardId: sfd(95), owner: 0, ready: true }];
    s = ability(s, "legend", a.id + "~gear");
    expect(s.players[0].energy).toBe(29);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    s = settle(s);
    expect(s.gears[0].attachedTo).toBe(a.id);
    s.players[0].legendUsedTurn = -1;
    expect(
      getLegalActions(s, 0).some((a) => a.id.startsWith("ability|legend|0|")),
    ).toBe(false);
    s = settle(ability(s, "legend", b.id + "~gear", 1));
    expect(s.gears[0].attachedTo).toBe(b.id);
    expect(s.units[0].gear).toHaveLength(0);
    expect(s.players[0].energy).toBe(29);
  });
  it("Angle Shot attaches and detaches same-controller objects, including enemy Equipment", () => {
    let s = fixture();
    const a = unit(ogn(49), 1);
    s.units = [a];
    s.gears = [{ id: "gear", cardId: sfd(95), owner: 1, ready: true }];
    s = settle(play(s, sfd(11), a.id + "~gear", 0));
    expect(s.gears[0].attachedTo).toBe(a.id);
    expect(s.players[0].hand).toHaveLength(1);
    s = settle(play(s, sfd(11), a.id + "~gear", 1));
    expect(s.gears[0].attachedTo).toBeUndefined();
    expect(s.units[0].gear).toHaveLength(0);
    expect(s.players[0].hand).toHaveLength(2);
  });
  it("Prize of Progress triggers for an Equip activation and for Gold, but not when gear is played", () => {
    let s = fixture();
    const prize = unit(sfd(75));
    s.units = [prize];
    s = settle(play(s, sfd(95)));
    expect(s.units[0].temporaryMight).toBe(0);
    s = settle(
      act(s, (a) => a.id.startsWith("equip:") && a.targetId === prize.id),
    );
    expect(s.units[0].temporaryMight).toBe(1);
    s.gears.push({
      id: "gold",
      cardId: "sfd-t03",
      owner: 0,
      ready: true,
      token: true,
    });
    s = settle(act(s, (a) => a.id === "gold:gold"));
    expect(s.units[0].temporaryMight).toBe(2);
  });
  it("Mageseeker Warden blocks opposing battlefield plays and effect readying, but not Awaken", () => {
    let s = fixture();
    const warden = unit(ogn(70), 1),
      ally = unit(ogn(49));
    warden.location = "field:1";
    ally.ready = false;
    s.units = [warden, ally];
    s.fields[0].controller = 0;
    s.fields[1].controller = 1;
    s.players[0].hand = [ogn(49)];
    expect(
      getLegalActions(s, 0)
        .filter((a) => a.category === "play")
        .every((a) => a.locationId === "base:0"),
    ).toBe(true);
    s = effect(s, [
      { type: "ready", target: "anyUnit", chosenTargetId: ally.id },
    ]);
    expect(s.units.find((u) => u.id === ally.id)?.ready).toBe(false);
    s = endTurn(s);
    s = endTurn(s);
    expect(s.units.find((u) => u.id === ally.id)?.ready).toBe(true);
  });
  it("Esteemed Hierophant prevents enemy effect damage with seven runes, while friendly and unit damage remain", () => {
    let s = fixture();
    const hierophant = unit(ven(25));
    s.units = [hierophant];
    s.players[0].runes = Array.from({ length: 7 }, (_, i) => ({
      id: `r${i}`,
      domain: "Body",
      ready: true,
    }));
    const hit: Effect = {
      type: "damage",
      amount: 1,
      target: "anyUnit",
      chosenTargetId: hierophant.id,
    };
    s = effect(s, [hit], 1);
    expect(s.units[0].damage).toBe(0);
    s = effect(s, [hit], 0);
    expect(s.units[0].damage).toBe(1);
    s = effect(s, [{ ...hit, damageSource: "unit" }], 1);
    expect(s.units[0].damage).toBe(2);
    s.players[0].runes.pop();
    s = effect(s, [hit], 1);
    expect(s.units[0].damage).toBe(3);
  });
  it("reviewed reminder-only printings retain canonical engine hooks without changing tags", () => {
    expect(getRulesCardId("unl-022a-219")).toBe("unl-022-219");
    expect(getRulesCardId("unl-221-219")).toBe("sfd-036-221");
    expect(getScript("sfd-232-221")).toBeUndefined();
    expect(getScript("ven-058-166--6a517607ad64d2d80a4f03b5")).toBeUndefined();
  });
});
