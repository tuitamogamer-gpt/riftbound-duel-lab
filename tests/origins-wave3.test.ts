import { describe, expect, it } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getKeywords,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { getScript } from "../src/game/scripts";
import { originsWave3Scripts } from "../src/game/origins-wave3";
import type { GameAction, GameState, PlayerId, Unit } from "../src/game/types";
const ogn = (n: number) => `ogn-${String(n).padStart(3, "0")}-298`;
const sfd = (n: number) => `sfd-${String(n).padStart(3, "0")}-221`;
const unit = (cardId: string, owner: PlayerId = 0, suffix = ""): Unit => ({
  id: `u:${cardId}:${owner}:${suffix}`,
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
});
function fixture() {
  const s = createGame({ seed: 3103 });
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
    p.legendId = ogn(251);
    p.hand = [];
    p.discard = [];
    p.deck = Array(30).fill(ogn(49));
    p.runes = [];
    p.runeDeck = Array(12).fill("Body");
    p.energy = p.power = 30;
    p.cardsPlayedThisTurn = 0;
    p.legendUsedTurn = -1;
    p.hasBegun = true;
    p.championAvailable = false;
    p.points = 0;
  }
  for (const f of s.fields) {
    f.cardId = ogn(275);
    f.controller = null;
  }
  return s;
}
type Chooser = (a: GameAction[], s: GameState) => GameAction | undefined;
function settle(s: GameState, choose?: Chooser) {
  for (
    let i = 0;
    i < 150 && (s.stack.length || s.pendingChoice || s.pendingTriggers?.length);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    const action = s.pendingChoice
      ? (choose?.(a, s) ?? a[0])
      : a.find((a) => a.category === "pass");
    if (!action) throw new Error(`No settle action ${s.phase}`);
    s = applyAction(s, action);
  }
  expect(s.pendingChoice).toBeNull();
  expect(s.stack).toHaveLength(0);
  return s;
}
function startPlay(s: GameState, cardId: string, targetId?: string) {
  s.players[s.priorityPlayer].hand.push(cardId);
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.category === "play" &&
      a.cardId === cardId &&
      a.targetId === targetId &&
      !a.additionalCostPaid &&
      !a.repeated &&
      !a.locationId?.startsWith("field:"),
  );
  expect(a, `play ${cardId}`).toBeDefined();
  return applyAction(s, a!);
}
const play = (s: GameState, id: string, target?: string, choose?: Chooser) =>
  settle(startPlay(s, id, target), choose);
function move(s: GameState, uid: string, field = "field:0") {
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.id.startsWith("move-start:") &&
      a.sourceId === uid &&
      a.locationId === field,
  );
  expect(a).toBeDefined();
  return applyAction(applyAction(s, a!), "move-confirm");
}
function finishCombat(s: GameState, choose?: Chooser) {
  for (
    let i = 0;
    i < 200 && (s.combat || s.stack.length || s.pendingChoice);
    i++
  ) {
    const a = getLegalActions(s, s.priorityPlayer);
    let action: GameAction | undefined;
    if (s.pendingChoice) action = choose?.(a, s) ?? a[0];
    else if (s.phase === "damage")
      action =
        a
          .filter((a) => a.id.startsWith("damage:"))
          .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0] ??
        a.find((a) => a.id === "damage-done");
    else action = a.find((a) => a.category === "pass");
    if (!action)
      throw new Error(`No combat action ${s.phase}: ${a.map((a) => a.id)}`);
    s = applyAction(s, action);
  }
  expect(s.combat).toBeNull();
  return s;
}
const decline: Chooser = (a) =>
  a.find((a) => a.id.endsWith("skip") || /decline/i.test(a.label));

describe("Origins and Spiritforged wave 3", () => {
  it("registers complete explicit scripts without claiming unsupported recycling/resurrection", () => {
    expect(Object.keys(originsWave3Scripts)).toHaveLength(28);
    for (const [id, sc] of Object.entries(originsWave3Scripts))
      expect(getScript(id)).toEqual(sc);
    for (const id of [ogn(110), ogn(196), sfd(140)])
      expect(originsWave3Scripts[id]).toBeUndefined();
  });
  it.each([false, true])(
    "Vayne enters ready only while the opponent controls a battlefield (%s)",
    (enemyControls) => {
      const s = fixture();
      if (enemyControls) s.fields[1].controller = 1;
      expect(play(s, ogn(35)).units[0].ready).toBe(enemyControls);
    },
  );
  it("Vayne pays the optional conquer cost before the response window", () => {
    const s = fixture(),
      v = unit(ogn(35));
    s.units = [v];
    let end = move(s, v.id);
    end = finishCombat(end, (actions, state) => {
      expect(state.players[0].energy).toBe(30);
      return actions.find((a) => !/decline/i.test(a.label));
    });
    expect(end.units).toHaveLength(0);
    expect(end.players[0].hand).toContain(v.cardId);
    expect(end.players[0].energy).toBe(29);
  });
  it("Vayne may decline the trigger and keeps the unit and Energy", () => {
    const s = fixture(),
      v = unit(ogn(35));
    s.units = [v];
    const end = finishCombat(move(s, v.id), decline);
    expect(end.units).toHaveLength(1);
    expect(end.players[0].energy).toBe(30);
  });
  it("Caitlyn requires a battlefield and deals no damage after leaving the board", () => {
    const s = fixture(),
      c = unit(ogn(68)),
      enemy = unit(ogn(88), 1);
    enemy.location = "field:0";
    enemy.baseMightOverride = 20;
    s.units = [c, enemy];
    expect(getKeywords(s, c)).toContain("Backline");
    expect(
      getLegalActions(s, 0).some(
        (a) => a.sourceId === c.id && a.category === "ability",
      ),
    ).toBe(false);
    c.location = "field:0";
    c.temporaryMight = 3;
    const ability = getLegalActions(s, 0).find(
      (a) =>
        a.sourceId === c.id &&
        a.targetId === enemy.id &&
        a.category === "ability",
    )!;
    let end = applyAction(s, ability);
    end = startPlay(end, ogn(104), c.id);
    end = settle(end);
    expect(end.units.find((u) => u.id === enemy.id)?.damage).toBe(0);
    expect(end.players[0].hand).toContain(c.cardId);
  });
  it.each(["party-cards", "party-runes"])(
    "Party Favors leaves the decision to the opponent: %s",
    (decision) => {
      const s = fixture();
      let picker: PlayerId | undefined;
      const end = play(s, ogn(71), undefined, (a, state) => {
        picker = state.priorityPlayer;
        return a.find((a) => a.id.endsWith(decision));
      });
      expect(picker).toBe(1);
      if (decision === "party-cards")
        expect(end.players.map((p) => p.hand.length)).toEqual([1, 1]);
      else
        expect(
          end.players.every((p) => p.runes.length === 1 && !p.runes[0].ready),
        ).toBe(true);
    },
  );
  it("Volibear exhausts during finalization of a Mighty-play trigger", () => {
    const s = fixture();
    s.players[0].legendId = ogn(249);
    let end = startPlay(s, ogn(88));
    expect(end.pendingChoice).not.toBeNull();
    const a = getLegalActions(end, 0).find((a) => !/decline/i.test(a.label))!;
    end = applyAction(end, a);
    expect(end.players[0].legendUsedTurn).toBe(end.turn);
    expect(end.players[0].runes).toHaveLength(0);
    end = settle(end);
    expect(end.players[0].runes).toHaveLength(1);
    end = play(end, ogn(88));
    expect(end.players[0].runes).toHaveLength(1);
  });
  it("Volibear does not trigger for a small unit", () => {
    const s = fixture();
    s.players[0].legendId = ogn(249);
    const end = play(s, ogn(13));
    expect(end.players[0].runes).toHaveLength(0);
    expect(end.players[0].legendUsedTurn).toBe(-1);
  });
  it("Royal Entourage chooses the legend early and ready-or-exhaust on resolution", () => {
    const s = fixture();
    let end = startPlay(s, sfd(39));
    expect(end.pendingChoice).not.toBeNull();
    const mode = getLegalActions(end, 0).find((a) =>
      a.label.includes("Choose player 2"),
    )!;
    expect(mode).toBeDefined();
    end = applyAction(end, mode);
    expect(end.players[1].legendUsedTurn).toBe(-1);
    expect(end.stack.length).toBeGreaterThan(0);
    end = settle(end, (a) => a.find((a) => a.id.endsWith("royal-exhaust")));
    expect(end.players[1].legendUsedTurn).toBe(end.turn);
  });
  it("Poro Snax draws on play and pays all activation costs before its next draw", () => {
    let s = play(fixture(), sfd(46));
    expect(s.players[0].hand).toHaveLength(1);
    const a = getLegalActions(s, 0).find((a) =>
      a.id.startsWith("wave3:snax:"),
    )!;
    const energy = s.players[0].energy,
      power = s.players[0].power ?? 0;
    s = applyAction(s, a);
    expect(s.gears).toHaveLength(0);
    expect(s.players[0].discard).toContain(sfd(46));
    expect(s.players[0].energy).toBe(energy - 1);
    expect(s.players[0].power).toBe(power - 1);
    expect(s.players[0].hand).toHaveLength(1);
    expect(settle(s).players[0].hand).toHaveLength(2);
  });
  it("Irelia Fervent reacts to her controller choosing her but not an enemy choosing her", () => {
    const s = fixture(),
      u = unit(sfd(57));
    s.units = [u];
    let end = play(s, ogn(95), u.id);
    expect(end.units[0].temporaryMight).toBe(0);
    end.currentPlayer = end.priorityPlayer = end.focusPlayer = 1;
    end = play(end, ogn(95), u.id);
    expect(end.units[0].temporaryMight).toBe(-1);
  });
  it.each([0, 1] as const)(
    "Irelia Fervent reacts only to actual friendly ready transitions (actor=%i)",
    (actor) => {
      for (const ready of [false, true]) {
        const s = fixture(),
          u = unit(sfd(57));
        u.ready = ready;
        s.units = [u];
        s.stack.push({
          id: "ready-driver",
          player: actor,
          cardId: ogn(95),
          targetId: u.id,
          kind: "ability",
          effects: [{ type: "ready", target: "anyUnit" }],
        });
        s.priorityPlayer = actor;
        const end = settle(s);
        expect(end.units[0].ready).toBe(true);
        expect(end.units[0].temporaryMight).toBe(actor === 0 && !ready ? 1 : 0);
      }
    },
  );
  it("Chemtech Cask triggers after an opponent-turn spell resolves and pays exhaust upfront", () => {
    const s = fixture();
    s.currentPlayer = 1;
    s.priorityPlayer = 0;
    s.phase = "showdown";
    s.gears = [{ id: "cask", cardId: sfd(63), owner: 0, ready: true }];
    let end = startPlay(s, ogn(144));
    expect(end.gears).toHaveLength(1);
    end = settle(end, (a, state) => {
      expect(state.gears[0].ready).toBe(true);
      return a.find((a) => !/decline/i.test(a.label));
    });
    expect(end.gears.find((g) => g.id === "cask")?.ready).toBe(false);
    expect(end.gears.filter((g) => g.token)).toHaveLength(1);
  });
  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "Card Sharp respects both players' choices (%s/%s)",
    (casterAccept, opponentAccept) => {
      const s = fixture();
      const owners: number[] = [];
      const end = play(s, sfd(81), undefined, (a, state) => {
        owners.push(state.priorityPlayer);
        return a.find((a) =>
          a.id.endsWith(
            (state.priorityPlayer === 0 ? casterAccept : opponentAccept)
              ? "sharp-yes"
              : "sharp-no",
          ),
        );
      });
      expect(owners).toEqual([0, 1]);
      expect(end.gears.filter((g) => g.owner === 0)).toHaveLength(
        Number(casterAccept) + Number(opponentAccept),
      );
      expect(end.gears.filter((g) => g.owner === 1)).toHaveLength(
        Number(opponentAccept),
      );
    },
  );
  it.each([83, 117])(
    "resource converter %i pays and adds immediately without entering the chain",
    (n) => {
      const s = fixture();
      s.players[0].energy = 3;
      s.players[0].power = 4;
      s.gears = [{ id: "converter", cardId: sfd(n), owner: 0, ready: true }];
      const action = getLegalActions(s, 0).find(
        (a) => a.id === "wave3:convert:converter:3",
      )!;
      const end = applyAction(s, action);
      expect(end.stack).toHaveLength(0);
      expect(end.gears[0].ready).toBe(false);
      expect([end.players[0].energy, end.players[0].power]).toEqual(
        n === 83 ? [6, 1] : [0, 7],
      );
      expect(
        getLegalActions(end, 0).some((a) => a.id.startsWith("wave3:convert")),
      ).toBe(false);
    },
  );
  it("Called Shot chooses one private top card, recycles the other, and repeats independently", () => {
    const s = fixture();
    s.players[0].deck = [ogn(13), ogn(49), ogn(52), ogn(88), ogn(96)];
    s.players[0].hand = [sfd(122)];
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === sfd(122) && a.repeated,
    )!;
    let count = 0;
    const end = settle(applyAction(s, a), (a) => {
      count++;
      return a.find((a) => a.id.endsWith("called:1"));
    });
    expect(count).toBe(2);
    expect(end.players[0].hand).toEqual([ogn(49), ogn(88)]);
    expect(end.players[0].deck).toEqual([ogn(96), ogn(13), ogn(52)]);
    expect(end.log.some((l) => l.text.includes("Pouty Poro"))).toBe(false);
  });
  it("Jae draws when chosen by his controller's spell before that spell resolves", () => {
    const s = fixture(),
      u = unit(sfd(142));
    s.units = [u];
    let end = startPlay(s, ogn(95), u.id);
    expect(end.stack.at(-1)?.cardId).toBe(sfd(142));
    expect(end.units[0].temporaryMight).toBe(0);
    end = settle(end);
    expect(end.players[0].hand).toHaveLength(2);
  });
  it("Jae does not draw when an ability chooses him", () => {
    const s = fixture(),
      u = unit(sfd(142));
    s.units = [u];
    s.gears = [{ id: "orb", cardId: ogn(90), owner: 0, ready: true }];
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.category === "ability" && a.sourceId === "orb" && a.targetId === u.id,
    )!;
    const end = settle(applyAction(s, a));
    expect(end.players[0].hand).toHaveLength(0);
  });
  it("Spirit Wheel charges Energy and exhaust before its triggered draw", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.gears = [{ id: "wheel", cardId: sfd(144), owner: 0, ready: true }];
    let end = startPlay(s, ogn(95), u.id);
    const energy = end.players[0].energy;
    const action = getLegalActions(end, 0).find(
      (a) => !/decline/i.test(a.label),
    )!;
    end = applyAction(end, action);
    expect(end.players[0].energy).toBe(energy - 1);
    expect(end.gears[0].ready).toBe(false);
    expect(end.players[0].hand).toHaveLength(0);
    end = settle(end);
    expect(end.players[0].hand).toHaveLength(2);
  });
  it("Altar of Memories exhausts before drawing and keeps the returned card private", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.gears = [{ id: "altar", cardId: sfd(169), owner: 0, ready: true }];
    s.players[0].deck = [ogn(13), ogn(49)];
    const end = play(s, ogn(229), u.id, (a, state) =>
      state.pendingChoice?.kind === "trigger"
        ? a.find((a) => !/decline/i.test(a.label))
        : a.find((a) => a.id.endsWith(":false")),
    );
    expect(end.gears[0].ready).toBe(false);
    expect(end.players[0].hand).toHaveLength(0);
    expect(end.players[0].deck).toEqual([ogn(49), ogn(13)]);
    expect(end.log.some((l) => l.text.includes("Pouty Poro"))).toBe(false);
  });
  it("Irelia legend pays Power and exhausts when choosing a friend, then readies that same friend", () => {
    const s = fixture(),
      u = unit(ogn(49));
    u.ready = false;
    s.units = [u];
    s.players[0].legendId = sfd(195);
    let end = startPlay(s, ogn(95), u.id);
    const power = end.players[0].power ?? 0;
    const a = getLegalActions(end, 0).find((a) => !/decline/i.test(a.label))!;
    end = applyAction(end, a);
    expect(end.players[0].power).toBe(power - 1);
    expect(end.players[0].legendUsedTurn).toBe(end.turn);
    expect(end.units[0].ready).toBe(false);
    end = settle(end);
    expect(end.units[0].ready).toBe(true);
  });
  it.each([4, 5])(
    "Renata's Gold produces additional Energy only near victory (%i points)",
    (points) => {
      const s = fixture();
      s.players[0].legendId = sfd(201);
      s.players[0].points = points;
      s.gears = [
        { id: "gold", cardId: "sfd-t03", owner: 0, ready: true, token: true },
      ];
      const end = applyAction(s, "gold:gold");
      expect(end.players[0].power).toBe(31);
      expect(end.players[0].energy).toBe(points === 5 ? 31 : 30);
      expect(end.gears).toHaveLength(0);
      expect(end.stack).toHaveLength(0);
    },
  );
  it("Hall of Legends pays at conquer-trigger finalization", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.fields[0].cardId = sfd(210);
    s.players[0].legendUsedTurn = s.turn;
    const end = finishCombat(move(s, u.id));
    expect(end.players[0].energy).toBe(29);
    expect(end.players[0].legendUsedTurn).toBe(-1);
  });
  it("Power Nexus spends four Power on its hold trigger before scoring its extra point", () => {
    let s = fixture(),
      u = unit(ogn(49));
    u.location = "field:0";
    s.units = [u];
    s.fields[0].cardId = sfd(214);
    s.fields[0].controller = 0;
    s = settle(applyAction(s, "end-turn"));
    s.players[0].runes = Array.from({ length: 4 }, (_, i) => ({
      id: `nexus-cost-${i}`,
      domain: "Body",
      ready: false,
    }));
    s = settle(applyAction(s, "end-turn"));
    expect(s.players[0].points).toBe(2);
    expect(
      s.players[0].runes.filter((r) => r.id.startsWith("nexus-cost-")),
    ).toHaveLength(0);
  });
  it("Caitlyn uses her current Might while remaining on the board", () => {
    const s = fixture(),
      c = unit(ogn(68)),
      enemy = unit(ogn(88), 1);
    c.location = enemy.location = "field:0";
    c.temporaryMight = 2;
    enemy.baseMightOverride = 30;
    s.units = [c, enemy];
    const expected = getMight(s, c);
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.sourceId === c.id &&
        a.targetId === enemy.id &&
        a.category === "ability",
    )!;
    const end = settle(applyAction(s, a));
    expect(end.units.find((u) => u.id === enemy.id)?.damage).toBe(expected);
    expect(end.units.find((u) => u.id === c.id)?.ready).toBe(false);
  });
  it.each([false, true])(
    "Draven Vanquisher only creates Gold for an actual combat win (defended=%s)",
    (defended) => {
      const s = fixture(),
        d = unit(sfd(20)),
        enemy = unit(ogn(49), 1);
      d.baseMightOverride = 12;
      s.units = [d];
      if (defended) {
        enemy.location = "field:0";
        enemy.baseMightOverride = 1;
        s.units.push(enemy);
        s.fields[0].controller = 1;
      }
      const end = finishCombat(move(s, d.id), decline);
      expect(end.gears.filter((g) => g.token)).toHaveLength(defended ? 1 : 0);
    },
  );
  it.each([0, 1] as const)(
    "Draven Vanquisher pays Fury before his attack/defend boost (side=%i)",
    (owner) => {
      const s = fixture(),
        d = unit(sfd(20), owner),
        opponent = unit(ogn(88), owner === 0 ? 1 : 0);
      d.baseMightOverride = 12;
      opponent.baseMightOverride = 1;
      if (owner === 0) {
        opponent.location = "field:0";
        s.fields[0].controller = 1;
      } else {
        d.location = "field:0";
        s.fields[0].controller = 1;
      }
      s.units = [d, opponent];
      let end = move(s, owner === 0 ? d.id : opponent.id);
      expect(end.pendingChoice).not.toBeNull();
      const before = end.players[owner].power ?? 0;
      const decision = getLegalActions(end, owner).find(
        (a) => !/decline/i.test(a.label),
      )!;
      end = applyAction(end, decision);
      expect(end.players[owner].power).toBe(before - 1);
      expect(end.units.find((u) => u.id === d.id)?.temporaryMight).toBe(0);
      end = settle(end);
      expect(end.units.find((u) => u.id === d.id)?.temporaryMight).toBe(2);
    },
  );
  it.each([4, 5])(
    "Tryndamere's conquest rewards the actual assigned excess threshold (%i)",
    (excess) => {
      const s = fixture(),
        t = unit(ogn(34)),
        enemy = unit(ogn(49), 1);
      t.baseMightOverride = 1 + excess;
      enemy.baseMightOverride = 1;
      enemy.stunned = true;
      enemy.location = "field:0";
      s.units = [t, enemy];
      s.fields[0].controller = 1;
      const end = finishCombat(move(s, t.id));
      expect(end.lastExcessDamage).toBe(excess);
      expect(end.players[0].points).toBe(excess >= 5 ? 2 : 1);
    },
  );
  it("Sivir Ambitious announces its excess-damage target after winning an attack", () => {
    const s = fixture(),
      sivir = unit(sfd(120)),
      victim = unit(ogn(49), 1),
      remote = unit(ogn(88), 1, "remote");
    sivir.baseMightOverride = 6;
    victim.baseMightOverride = 1;
    victim.stunned = true;
    victim.location = "field:0";
    remote.baseMightOverride = 30;
    remote.location = "field:1";
    s.units = [sivir, victim, remote];
    s.fields[0].controller = 1;
    let selected = false;
    const end = finishCombat(move(s, sivir.id), (a, state) => {
      if (state.pendingChoice?.cardId === sfd(120)) {
        selected = true;
        expect(state.units.find((u) => u.id === remote.id)?.damage).toBe(0);
        return a.find((a) => a.targetId === remote.id);
      }
      return a[0];
    });
    expect(selected).toBe(true);
    expect(end.units.find((u) => u.id === remote.id)?.damage).toBe(5);
  });
  it("Draven Audacious scores once per turn for combat wins", () => {
    let s = fixture(),
      d = unit(sfd(148)),
      first = unit(ogn(49), 1),
      second = unit(ogn(49), 1, "second");
    d.baseMightOverride = 12;
    first.baseMightOverride = second.baseMightOverride = 1;
    first.stunned = second.stunned = true;
    first.location = "field:0";
    second.location = "field:1";
    s.units = [d, first, second];
    s.fields[0].controller = s.fields[1].controller = 1;
    s = finishCombat(move(s, d.id));
    expect(s.players[0].points).toBe(2);
    const survivor = s.units.find((u) => u.id === d.id)!;
    survivor.location = "base:0";
    survivor.ready = true;
    s = finishCombat(move(s, d.id, "field:1"));
    expect(s.players[0].points).toBe(3);
  });
  it("Draven Audacious dying during combat awards the opponent a point", () => {
    const s = fixture(),
      d = unit(sfd(148)),
      enemy = unit(ogn(88), 1);
    d.baseMightOverride = 1;
    enemy.baseMightOverride = 12;
    enemy.location = "field:0";
    s.units = [d, enemy];
    s.fields[0].controller = 1;
    const end = finishCombat(move(s, d.id));
    expect(end.units.some((u) => u.id === d.id)).toBe(false);
    expect(end.players[1].points).toBe(1);
  });
  it("Irelia legend can pay Energy after conquering to ready herself", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.players[0].legendId = sfd(195);
    s.players[0].legendUsedTurn = s.turn;
    const end = finishCombat(move(s, u.id));
    expect(end.players[0].legendUsedTurn).toBe(-1);
    expect(end.players[0].energy).toBe(29);
  });
  it("Renata's hold trigger exhausts the legend and creates one Gold", () => {
    let s = fixture(),
      u = unit(ogn(49));
    u.location = "field:0";
    s.units = [u];
    s.fields[0].controller = 0;
    s.players[0].legendId = sfd(201);
    s = settle(applyAction(s, "end-turn"));
    s = settle(applyAction(s, "end-turn"));
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(s.gears.filter((g) => g.token)).toHaveLength(1);
    expect(s.gears[0].ready).toBe(false);
  });
  it("Hall cannot offer its paid trigger without an Energy source", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.fields[0].cardId = sfd(210);
    s.players[0].legendUsedTurn = s.turn;
    s.players[0].energy = s.players[0].power = 0;
    const end = finishCombat(move(s, u.id));
    expect(end.players[0].legendUsedTurn).toBe(s.turn);
    expect(end.players[0].energy).toBe(0);
  });

  it("Called Shot draws count separately for Frigid Jewel's second-card trigger", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.gears = [{ id: "jewel", cardId: "unl-074-219", owner: 0, ready: true }];
    s.players[0].deck = [ogn(13), ogn(49), ogn(52), ogn(88)];
    s.players[0].hand = [sfd(122)];
    const a = getLegalActions(s, 0).find(
      (a) => a.cardId === sfd(122) && a.repeated,
    )!;
    const end = settle(applyAction(s, a));
    expect(end.players[0].hand).toHaveLength(2);
    expect(end.units[0].temporaryMight).toBe(2);
  });
  it("Ornn's selected gear is drawn and counts toward Frigid Jewel", () => {
    let s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.gears = [{ id: "jewel", cardId: "unl-074-219", owner: 0, ready: true }];
    s = play(s, "sfd-087-221");
    s.players[0].deck = [sfd(52), ogn(13), ogn(49), ogn(88), ogn(96)];
    s = play(s, sfd(58));
    expect(s.players[0].hand).toContain(sfd(52));
    expect(s.units.find((v) => v.id === u.id)?.temporaryMight).toBe(2);
  });
  it("Blood Rush can repeat Assault 2 on the same unit and charges one extra Energy", () => {
    const s = fixture(),
      u = unit(ogn(49));
    s.units = [u];
    s.players[0].hand = [sfd(3)];
    const a = getLegalActions(s, 0).find(
      (a) =>
        a.cardId === sfd(3) &&
        a.repeated &&
        a.targetId === u.id &&
        a.repeatedTargetId === u.id,
    )!;
    const end = settle(applyAction(s, a));
    expect(end.units[0].temporaryAssault).toBe(4);
    expect(end.players[0].energy).toBe(30 - getCard(sfd(3)).energy! - 1);
  });
  it.each([0, 1] as const)(
    "Thwonk targets attackers belonging to either player (caster=%i)",
    (caster) => {
      const s = fixture(),
        a = unit(ogn(49)),
        b = unit(ogn(49), 0, "other"),
        defender = unit(ogn(49), 1);
      a.location = b.location = defender.location = "field:0";
      s.units = [a, b, defender];
      s.currentPlayer = s.priorityPlayer = s.focusPlayer = caster;
      s.phase = "showdown";
      s.combat = {
        fieldId: "field:0",
        attacker: 0,
        defender: 1,
        stage: "priority",
        engaged: true,
        total: [0, 0],
        remaining: [0, 0],
        assignments: [{}, {}],
        assigningPlayer: 0,
      };
      s.players[caster].hand = [sfd(40)];
      const legal = getLegalActions(s, caster).filter(
        (a) => a.cardId === sfd(40),
      );
      expect(legal.some((a) => a.targetId === defender.id)).toBe(false);
      const action = legal.find(
        (x) => x.repeated && x.targetId === a.id && x.repeatedTargetId === b.id,
      )!;
      expect(action).toBeDefined();
      const end = settle(applyAction(s, action));
      expect(
        end.units
          .filter((u) => u.stunned)
          .map((u) => u.id)
          .sort(),
      ).toEqual([a.id, b.id].sort());
    },
  );
  it("Minotaur Reckoner blocks movement to base for both players and stops when it leaves", () => {
    let s = fixture(),
      mine = unit(ogn(49)),
      enemy = unit(ogn(49), 1),
      reckoner = unit(sfd(14), 1);
    mine.location = "field:0";
    enemy.location = "field:1";
    s.units = [mine, enemy, reckoner];
    s.fields[0].controller = 0;
    s.fields[1].controller = 1;
    expect(getKeywords(s, mine)).toContain("Cannot move to base");
    expect(
      getLegalActions(s, 0).some(
        (a) => a.id.startsWith("move-start:") && a.locationId === "base:0",
      ),
    ).toBe(false);
    s.currentPlayer = s.priorityPlayer = s.focusPlayer = 1;
    expect(
      getLegalActions(s, 1).some(
        (a) => a.id.startsWith("move-start:") && a.locationId === "base:1",
      ),
    ).toBe(false);
    s.units = s.units.filter((u) => u.id !== reckoner.id);
    expect(
      getLegalActions(s, 1).some(
        (a) => a.id.startsWith("move-start:") && a.locationId === "base:1",
      ),
    ).toBe(true);
  });
  it("Called Shot's Chaos Repeat cannot be paid with only an off-domain rune", () => {
    const s = fixture();
    s.players[0].power = 0;
    s.players[0].runes = [
      { id: "chaos", domain: "Chaos", ready: false },
      { id: "wrong", domain: "Body", ready: false },
    ];
    s.players[0].hand = [sfd(122)];
    expect(
      getLegalActions(s, 0).some((a) => a.cardId === sfd(122) && !a.repeated),
    ).toBe(true);
    expect(
      getLegalActions(s, 0).some((a) => a.cardId === sfd(122) && a.repeated),
    ).toBe(false);
  });

  it("Perched Grimwyrm can only be played to a controlled battlefield conquered this turn", () => {
    const s = fixture();
    s.players[0].hand = [sfd(15)];
    s.fields[0].controller = s.fields[1].controller = 0;
    expect(
      getLegalActions(s, 0).filter(
        (a) => a.cardId === sfd(15) && a.category === "play",
      ),
    ).toHaveLength(0);
    s.players[0].conqueredThisTurn = [0];
    const legal = getLegalActions(s, 0).filter(
      (a) => a.cardId === sfd(15) && a.category === "play",
    );
    expect(legal.map((a) => a.locationId)).toEqual(["field:0"]);
    const end = settle(applyAction(s, legal[0]));
    expect(end.units[0].location).toBe("field:0");
  });
  it.each([false, true])(
    "Rocket Barrage repeats with independent modes and targets (damage first=%s)",
    (damageFirst) => {
      const s = fixture(),
        u = unit(ogn(88), 1),
        remote = unit(ogn(49), 1);
      u.baseMightOverride = 20;
      remote.location = "field:0";
      s.units = [u, remote];
      s.gears = [{ id: "gear", cardId: ogn(17), owner: 1, ready: true }];
      s.players[0].hand = [sfd(77)];
      const actions = getLegalActions(s, 0).filter((a) => a.cardId === sfd(77));
      expect(actions.some((a) => a.targetId === remote.id)).toBe(false);
      const action = actions.find(
        (a) =>
          a.repeated &&
          a.effects?.[0].type === (damageFirst ? "damage" : "kill") &&
          a.repeatedEffects?.[0].type === (damageFirst ? "kill" : "damage") &&
          a.targetId === (damageFirst ? u.id : "gear") &&
          a.repeatedTargetId === (damageFirst ? "gear" : u.id),
      )!;
      expect(action).toBeDefined();
      const end = settle(applyAction(s, action));
      expect(end.units.find((v) => v.id === u.id)?.damage).toBe(4);
      expect(end.gears).toHaveLength(0);
      expect(end.players[0].energy).toBe(22);
      expect(end.players[0].power).toBe(28);
    },
  );
  it("Rocket Barrage's repeated mode still needs a second Mind Power", () => {
    const s = fixture(),
      u = unit(ogn(88));
    s.units = [u];
    s.players[0].hand = [sfd(77)];
    s.players[0].power = 0;
    s.players[0].runes = [
      { id: "mind", domain: "Mind", ready: false },
      { id: "wrong", domain: "Body", ready: false },
    ];
    const actions = getLegalActions(s, 0).filter((a) => a.cardId === sfd(77));
    expect(actions.some((a) => !a.repeated)).toBe(true);
    expect(actions.some((a) => a.repeated)).toBe(false);
  });
  it("Royal Entourage may ready the chosen legend after its opponent exhausts it in response", () => {
    const s = fixture();
    s.players[1].legendId = ogn(253);
    s.players[1].cardsPlayedThisTurn = 1;
    let end = startPlay(s, sfd(39));
    const selection = getLegalActions(end, 0).find((a) =>
      a.label.includes("Choose player 2"),
    )!;
    end = applyAction(end, selection);
    end = applyAction(end, "pass");
    const exhaust = getLegalActions(end, 1).find(
      (a) => a.id === "origins-more:darius-energy",
    )!;
    expect(exhaust).toBeDefined();
    end = applyAction(end, exhaust);
    expect(end.players[1].legendUsedTurn).toBe(end.turn);
    end = settle(end, (a) => a.find((a) => a.id.endsWith("royal-ready")));
    expect(end.players[1].legendUsedTurn).toBe(-1);
  });
});
