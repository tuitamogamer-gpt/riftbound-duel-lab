import { describe, expect, it, vi } from "vitest";
import { getCard } from "../src/data/cards";
import {
  applyAction,
  createGame,
  getLegalActions,
  getMight,
} from "../src/game/engine";
import { unleashedModule, unleashedScripts } from "../src/game/unleashed";
import type { PreconContext } from "../src/game/later-precon-engine";
import type {
  Effect,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "../src/game/types";

const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
function game() {
  const state = createGame({
    seed: 12,
    playerDeckId: "annie",
    botDeckId: "garen",
  });
  state.phase = "main";
  state.turn = 3;
  state.currentPlayer = 0;
  state.priorityPlayer = 0;
  state.stack = [];
  state.units = [];
  state.gears = [];
  state.pendingChoice = null;
  for (const p of state.players) {
    p.energy = 30;
    p.hand = [];
    p.discard = [];
    p.runes = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"].flatMap(
      (domain) =>
        Array.from({ length: 4 }, (_, i) => ({
          id: `${p.id}-${domain}-${i}`,
          domain,
          ready: true,
        })),
    );
  }
  return state;
}
function unit(
  s: GameState,
  n: number,
  owner: PlayerId = 0,
  location: LocationId = "field:0",
) {
  const result: Unit = {
    id: `test-${s.nextId++}`,
    cardId: unl(n),
    owner,
    location,
    ready: true,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: s.turn,
  };
  s.units.push(result);
  return result;
}
function context(
  s: GameState,
  sourceId?: string,
  targetId?: string,
  locationId?: LocationId,
): PreconContext {
  const ctx: PreconContext = {
    sourceId,
    targetId,
    locationId,
    runEffects: vi.fn(
      (state: GameState, p: PlayerId, effects: Effect[], selected?: string) => {
        const u = state.units.find((u) => u.id === selected);
        for (const effect of effects) {
          if (u && effect.type === "stun") u.stunned = true;
          if (u && effect.type === "ready") u.ready = true;
          if (u && effect.type === "buff") u.buff = 1;
          if (effect.type === "bounce" && u) {
            state.players[u.owner].hand.push(u.cardId);
            state.units = state.units.filter((v) => v.id !== u.id);
          }
        }
      },
    ),
    cardEvent: vi.fn(),
    killGear: vi.fn(),
    dealDamage: vi.fn(),
    costFor: vi.fn(() => ({ energy: 0, power: 0, extraPower: 0 })),
    pay: vi.fn(),
    canPay: vi.fn(() => true),
    draw: vi.fn(),
    trigger: vi.fn(),
    pushStack: vi.fn(),
    spawnToken: vi.fn(),
    killUnits: vi.fn(),
    channel: vi.fn(),
    getMight,
    moveUnit: vi.fn((state: GameState, u: Unit, to: LocationId) => {
      u.location = to;
    }),
    playUnit: vi.fn(),
    discardCards: vi.fn(),
    spellPlayed: vi.fn(),
    openChoice: vi.fn((state: GameState, p: PlayerId, choice) => {
      state.pendingChoice = {
        ...choice,
        player: p,
        kind: "custom",
        remaining: 1,
        returnPhase: state.phase,
        returnPriority: state.priorityPlayer,
      };
      state.phase = "choice";
    }),
  } as PreconContext;
  return ctx;
}
function effect(
  s: GameState,
  name: string,
  ctx: PreconContext,
  p: PlayerId = 0,
  amount?: number,
) {
  expect(
    unleashedModule.effect?.(
      s,
      p,
      { type: "special", custom: `unl:${name}`, amount },
      ctx,
    ),
  ).toBe(true);
}
describe("Unleashed precon effects", () => {
  it("tracks XP persistently, applies thresholds live and spends XP for Megatusk", () => {
    const s = game(),
      moss = unit(s, 47),
      megatusk = unit(s, 126),
      ctx = context(s);
    effect(s, "xp", ctx, 0, 3);
    expect(s.players[0].xp).toBe(3);
    expect(unleashedModule.might?.(s, moss, 3)).toBe(4);
    expect(unleashedModule.keywords?.(s, moss)).toContain("Deflect");
    const ability = unleashedModule
      .actions?.(s, 0, ctx)
      .find((a) => a.abilityKey === "megatusk")!;
    expect(ability).toBeTruthy();
    unleashedModule.apply?.(s, ability, ctx);
    expect(s.players[0].xp).toBe(0);
    expect(unleashedModule.might?.(s, moss, 3)).toBe(3);
    expect(unleashedModule.keywords?.(s, moss)).not.toContain("Deflect");
    expect(moss.temporaryKeywords).toContain("Ganking");
    expect(megatusk.temporaryKeywords).toContain("Ganking");
    expect(JSON.parse(JSON.stringify(s)).players[0].xp).toBe(0);
  });
  it("uses the printed lower equipment box for Soul Sword and Serrated Dirk", () => {
    const s = game(),
      u = unit(s, 34),
      ctx = context(s);
    s.gears.push(
      { id: "sword", cardId: unl(39), owner: 0, ready: true, attachedTo: u.id },
      {
        id: "dirk",
        cardId: "sfd-009-221",
        owner: 0,
        ready: true,
        attachedTo: u.id,
      },
    );
    u.gear = ["sword", "dirk"];
    expect(unleashedScripts[unl(39)].gearMight).toBe(1);
    expect(unleashedScripts[unl(188)].gearMight).toBe(3);
    expect(unleashedModule.might?.(s, u, 4)).toBe(4);
    effect(s, "xp", ctx, 0, 3);
    expect(unleashedModule.might?.(s, u, 4)).toBe(5);
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(unleashedModule.might?.(s, u, 4)).toBe(7);
  });
  it("limits Allay's Deflect aura to other friendly units at its battlefield", () => {
    const s = game(),
      allay = unit(s, 41),
      friend = unit(s, 34),
      enemy = unit(s, 34, 1),
      elsewhere = unit(s, 34, 0, "base:0");
    expect(unleashedModule.keywords?.(s, friend)).toContain("Deflect");
    expect(unleashedModule.keywords?.(s, enemy)).not.toContain("Deflect");
    expect(unleashedModule.keywords?.(s, elsewhere)).not.toContain("Deflect");
    allay.location = "base:0";
    expect(unleashedModule.keywords?.(s, friend)).not.toContain("Deflect");
  });
  it("checks Existential Dread's attacking restriction and bounces an already-stunned attacker", () => {
    const s = game(),
      attacker = unit(s, 34, 1),
      defender = unit(s, 34),
      ctx = context(s, undefined, attacker.id);
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    effect(s, "dread", ctx);
    expect(attacker.stunned).toBe(true);
    effect(s, "dread", ctx);
    expect(s.players[1].hand).toContain(attacker.cardId);
    expect(s.units.some((u) => u.id === attacker.id)).toBe(false);
    effect(s, "dread", context(s, undefined, defender.id));
    expect(defender.stunned).toBe(false);
  });
  it("queues Apathetic's automatic stun for the played unit and records its movement lock", () => {
    const s = game(),
      vex = unit(s, 150),
      played = unit(s, 34, 1, "base:1"),
      ctx = context(s, played.id);
    unleashedModule.event?.(
      s,
      "unitPlayed",
      1,
      played.cardId,
      played.id,
      played.location,
      ctx,
    );
    expect(ctx.trigger).toHaveBeenCalledWith(
      s,
      0,
      vex.cardId,
      vex.id,
      [
        expect.objectContaining({
          custom: "unl:apathetic",
          cardName: played.id,
        }),
      ],
      played.location,
    );
    unleashedModule.effect?.(
      s,
      0,
      { type: "special", custom: "unl:apathetic", cardName: played.id },
      context(s, vex.id),
    );
    expect(played.stunned).toBe(true);
    expect(played.moveLockedTurn).toBe(s.turn);
  });
  it("records Loyal Poro last-known companions before simultaneous death", () => {
    const s = game(),
      poro = unit(s, 156),
      ally = unit(s, 34),
      ctx = context(s, poro.id);
    unleashedModule.event?.(
      s,
      "death",
      0,
      poro.cardId,
      poro.id,
      poro.location,
      ctx,
    );
    s.units = [];
    effect(s, "loyal-poro", ctx);
    expect(ctx.draw).toHaveBeenCalledWith(s, 0, 1);
    const lonely = unit(s, 156),
      aloneCtx = context(s, lonely.id);
    unleashedModule.event?.(
      s,
      "death",
      0,
      lonely.cardId,
      lonely.id,
      lonely.location,
      aloneCtx,
    );
    s.units = [];
    effect(s, "loyal-poro", aloneCtx);
    expect(aloneCtx.draw).not.toHaveBeenCalled();
  });
  it("requires 3 excess damage for Vi, Trapping Grounds and attached Gauntlets", () => {
    const s = game(),
      u = unit(s, 18),
      ctx = context(s);
    s.players[0].legendId = unl(187);
    s.fields[0].cardId = unl(217);
    s.gears.push({
      id: "gauntlets",
      cardId: unl(188),
      owner: 0,
      ready: true,
      attachedTo: u.id,
    });
    u.gear.push("gauntlets");
    s.lastExcessDamage = 2;
    unleashedModule.event?.(
      s,
      "conquer",
      0,
      unl(217),
      "field:0",
      "field:0",
      ctx,
    );
    expect(ctx.trigger).not.toHaveBeenCalled();
    s.lastExcessDamage = 3;
    unleashedModule.event?.(
      s,
      "conquer",
      0,
      unl(217),
      "field:0",
      "field:0",
      ctx,
    );
    expect(ctx.trigger).toHaveBeenCalledTimes(3);
    effect(s, "yeti-gold", ctx);
    expect(ctx.spawnToken).toHaveBeenCalledTimes(2);
    expect(ctx.spawnToken).toHaveBeenCalledWith(s, 0, "Gold", "base:0", false);
  });
  it("constrains Vex Cheerless spell discounts and surcharges to combat", () => {
    const s = game(),
      vex = unit(s, 35),
      spell = getCard(unl(31));
    vex.cardId = "sfd-146-221";
    expect(unleashedModule.cost?.(s, 0, spell)).toEqual({});
    s.combat = {
      fieldId: "field:0",
      attacker: 0,
      defender: 1,
      stage: "priority",
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 0,
    };
    expect(unleashedModule.cost?.(s, 0, spell)).toEqual({
      energy: Math.max(1 - (spell.energy ?? 0), -1),
      power: -1,
    });
    expect(unleashedModule.cost?.(s, 1, spell)).toEqual({
      energy: 1,
      power: 1,
    });
  });
  it("places optional trigger decisions in an explicit choice and does not auto-use the legend", () => {
    const s = game(),
      ctx = context(s);
    s.players[0].legendId = unl(193);
    effect(s, "vex-hold", ctx);
    expect(s.pendingChoice?.options).toHaveLength(2);
    expect(s.players[0].legendUsedTurn).not.toBe(s.turn);
    effect(s, "vex-draw", ctx);
    expect(s.players[0].legendUsedTurn).toBe(s.turn);
    expect(ctx.draw).toHaveBeenCalledOnce();
    effect(s, "vex-draw", ctx);
    expect(ctx.draw).toHaveBeenCalledOnce();
  });
  it("allows Gardens of Becoming only for a ready friendly unit at that battlefield", () => {
    const s = game(),
      u = unit(s, 34),
      ctx = context(s);
    s.fields[0].cardId = unl(213);
    expect(
      unleashedModule
        .actions?.(s, 0, ctx)
        .filter((a) => a.abilityKey === "garden"),
    ).toHaveLength(1);
    u.ready = false;
    expect(
      unleashedModule
        .actions?.(s, 0, ctx)
        .filter((a) => a.abilityKey === "garden"),
    ).toHaveLength(0);
  });
  it("sets Tactical Retreat's current-turn death replacement without moving or healing early", () => {
    const s = game(),
      u = unit(s, 34),
      ctx = context(s, undefined, u.id);
    u.damage = 2;
    effect(s, "retreat", ctx);
    expect(u.deathReplacementTurn).toBe(s.turn);
    expect(u.location).toBe("field:0");
    expect(u.damage).toBe(2);
    expect(ctx.moveUnit).not.toHaveBeenCalled();
  });
});

function resolve(s: GameState): GameState {
  for (
    let steps = 0;
    steps < 40 && (s.stack.length || s.pendingChoice);
    steps++
  ) {
    const legal = getLegalActions(s, s.priorityPlayer);
    const next = s.pendingChoice
      ? legal[0]
      : legal.find((a) => a.category === "pass");
    if (!next)
      throw new Error(
        `Cannot resolve ${s.phase}: ${legal.map((a) => a.id).join(", ")}`,
      );
    s = applyAction(s, next.id);
  }
  if (s.stack.length || s.pendingChoice)
    throw new Error("Trigger did not finish");
  return s;
}
function play(s: GameState, cardId: string, targetId?: string): GameState {
  s.players[s.priorityPlayer].hand.push(cardId);
  const a = getLegalActions(s, s.priorityPlayer).find(
    (a) =>
      a.cardId === cardId &&
      a.category === "play" &&
      (!targetId || a.targetId === targetId),
  );
  if (!a)
    throw new Error(
      `No legal play for ${cardId}: ${getLegalActions(s, s.priorityPlayer)
        .map((a) => a.id)
        .join(", ")}`,
    );
  return resolve(applyAction(s, a));
}
describe("Unleashed engine integration", () => {
  it("plays Herald of Spring and reaches Level 3 through a legal Gardens activation", () => {
    let s = game();
    s = play(s, unl(34));
    expect(s.players[0].xp).toBe(2);
    const herald = s.units.find((u) => u.cardId === unl(34))!;
    herald.location = "field:0";
    herald.ready = true;
    s.fields[0].cardId = unl(213);
    s.phase = "main";
    s.priorityPlayer = 0;
    const gain = getLegalActions(s, 0).find((a) => a.abilityKey === "garden")!;
    expect(gain).toBeTruthy();
    s = applyAction(s, gain);
    expect(s.players[0].xp).toBe(3);
    expect(s.units.find((u) => u.id === herald.id)?.ready).toBe(false);
    const moss = unit(s, 47);
    expect(getMight(s, moss)).toBe((getCard(moss.cardId).might ?? 0) + 1);
  });
  it("resolves Apathetic's mandatory trigger against the actual newly played unit", () => {
    let s = game();
    const vex = unit(s, 150, 1);
    s = play(s, unl(34));
    const herald = s.units.find((u) => u.cardId === unl(34))!;
    expect(herald.stunned).toBe(true);
    expect(herald.moveLockedTurn).toBe(s.turn);
    herald.ready = true;
    s.phase = "main";
    s.priorityPlayer = 0;
    expect(
      getLegalActions(s, 0).filter(
        (a) => a.category === "move" && a.unitIds?.includes(herald.id),
      ),
    ).toHaveLength(0);
  });
  it("applies Combat Experience from a legal reaction at Level 6", () => {
    let s = game();
    const target = unit(s, 34);
    s.players[0].xp = 6;
    s = play(s, unl(31), target.id);
    expect(s.units.find((u) => u.id === target.id)?.temporaryMight).toBe(3);
  });
  it("uses Tactical Retreat once to heal and recall a unit hit by lethal spell damage", () => {
    let s = game();
    const target = unit(s, 34);
    s = play(s, unl(175), target.id);
    s.phase = "main";
    s.priorityPlayer = 0;
    s = play(s, "ogs-022-024", target.id);
    const saved = s.units.find((u) => u.id === target.id);
    expect(saved).toBeTruthy();
    expect(saved?.location).toBe("base:0");
    expect(saved?.damage).toBe(0);
    expect(saved?.ready).toBe(false);
    expect(saved?.deathReplacementTurn).toBeUndefined();
  });
  it("sacrifices Divining Shells as the activation cost and resolves its +2 Might", () => {
    let s = game();
    const target = unit(s, 34);
    s.gears.push({ id: "shells", cardId: unl(161), owner: 0, ready: true });
    const activation = getLegalActions(s, 0).find(
      (a) => a.abilityKey === "shells" && a.targetId === target.id,
    )!;
    expect(activation).toBeTruthy();
    s = applyAction(s, activation);
    expect(s.gears).toHaveLength(0);
    expect(s.players[0].discard).toContain(unl(161));
    s = resolve(s);
    expect(s.units.find((u) => u.id === target.id)?.temporaryMight).toBe(2);
  });
});

describe("Unleashed additional costs, hidden cards and Repeat", () => {
  it("stuns with Nami only when the additional Calm power was paid", () => {
    let without = game();
    const enemy = unit(without, 34, 1);
    without = play(without, unl(52));
    expect(without.units.find((u) => u.id === enemy.id)?.stunned).toBe(false);
    let withCost = game();
    const victim = unit(withCost, 34, 1);
    withCost.players[0].hand = [unl(52)];
    const paid = getLegalActions(withCost, 0).find(
      (a) => a.cardId === unl(52) && a.additionalCostPaid,
    )!;
    expect(paid).toBeTruthy();
    withCost = resolve(applyAction(withCost, paid));
    expect(
      withCost.units.find((u) => u.cardId === unl(52))?.additionalCostPaid,
    ).toBe(true);
    expect(withCost.units.find((u) => u.id === victim.id)?.stunned).toBe(true);
  });
  it("draws Back Off's extra card from hand and omits it when revealed from Hidden", () => {
    let hand = game();
    const target = unit(hand, 34, 1);
    hand = play(hand, unl(42), target.id);
    expect(hand.players[0].hand).toHaveLength(1);
    let hidden = game();
    hidden.fields[0].controller = 0;
    unit(hidden, 34);
    const enemy = unit(hidden, 34, 1);
    hidden.hidden = [
      {
        id: "hidden-back-off",
        cardId: unl(42),
        owner: 0,
        location: "field:0",
        hiddenTurn: 1,
      },
    ];
    const reveal = getLegalActions(hidden, 0).find(
      (a) => a.sourceId === "hidden:hidden-back-off" && a.targetId === enemy.id,
    )!;
    expect(reveal).toBeTruthy();
    hidden = resolve(applyAction(hidden, reveal));
    expect(hidden.players[0].hand).toHaveLength(0);
    expect(hidden.units.find((u) => u.id === enemy.id)?.stunned).toBe(true);
  });
  it("repeats Square Up only after discarding its additional card", () => {
    let s = game();
    const target = unit(s, 34);
    s.players[0].hand = [unl(17), "ogn-001-298"];
    const repeat = getLegalActions(s, 0).find(
      (a) => a.cardId === unl(17) && a.repeated && a.targetId === target.id,
    )!;
    expect(repeat).toBeTruthy();
    s = applyAction(s, repeat);
    expect(s.players[0].discard).toContain("ogn-001-298");
    expect(s.players[0].hand).toHaveLength(0);
    s = resolve(s);
    expect(s.units.find((u) => u.id === target.id)?.temporaryAssault).toBe(8);
  });
  it("keeps an exhausted legend unavailable across the opponent's turn", () => {
    const s = game();
    s.players[0].legendId = unl(193);
    s.players[0].legendUsedTurn = s.turn - 1;
    const ctx = context(s);
    effect(s, "vex-hold", ctx);
    expect(ctx.openChoice).not.toHaveBeenCalled();
    expect(ctx.draw).not.toHaveBeenCalled();
  });
});

describe("Unleashed revealed-card decisions", () => {
  it("Scryer's Bloom reveals two cards, permits reordering, then draws and grants XP", () => {
    let s = game();
    s.gears.push({ id: "bloom", cardId: unl(136), owner: 0, ready: true });
    s.players[0].deck = ["ogn-001-298", "ogn-005-298", "ogn-009-298"];
    const activate = getLegalActions(s, 0).find(
      (a) => a.abilityKey === "scryer",
    )!;
    s = applyAction(s, activate);
    expect(s.gears.some((g) => g.id === "bloom")).toBe(false);
    for (let i = 0; i < 4 && !s.pendingChoice; i++)
      s = applyAction(
        s,
        getLegalActions(s, s.priorityPlayer).find(
          (a) => a.category === "pass",
        )!,
      );
    expect(s.pendingChoice?.options).toHaveLength(5);
    const swap = getLegalActions(s, 0).find((a) =>
      a.effects?.some(
        (e) =>
          e.custom === "unl:predict-two-apply" &&
          JSON.parse(e.cardName!).keep.join() === "1,0",
      ),
    )!;
    s = resolve(applyAction(s, swap));
    expect(s.players[0].hand).toEqual(["ogn-005-298"]);
    expect(s.players[0].deck).toEqual(["ogn-001-298", "ogn-009-298"]);
    expect(s.players[0].xp).toBe(1);
  });
});

describe("Unleashed equipment and movement payment", () => {
  it("reduces Hextech Gauntlets equip energy by chosen unit Might and accepts any power", () => {
    let s = game();
    const target = unit(s, 18);
    s.gears = [{ id: "gloves", cardId: unl(188), owner: 0, ready: true }];
    s.players[0].energy = 0;
    s.players[0].runes = [{ id: "off-domain", domain: "Calm", ready: false }];
    const equip = getLegalActions(s, 0).find(
      (a) => a.id === `equip:gloves:${target.id}`,
    )!;
    expect(equip).toBeTruthy();
    s = resolve(applyAction(s, equip));
    expect(s.units.find((u) => u.id === target.id)?.gear).toContain("gloves");
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.players[0].energy).toBe(0);
  });
  it("requires one universal power for the second unit moving to Mageseeker Investigator", () => {
    let s = game();
    const first = unit(s, 34, 0, "base:0"),
      second = unit(s, 34, 0, "base:0");
    unit(s, 163, 1);
    s.players[0].runes = [];
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) =>
          a.sourceId === first.id &&
          a.locationId === "field:0" &&
          a.category === "move",
      )!,
    );
    s = applyAction(s, `move-toggle:${second.id}`);
    expect(getLegalActions(s, 0).some((a) => a.id === "move-confirm")).toBe(
      false,
    );
    s.players[0].runes = [{ id: "movement-tax", domain: "Calm", ready: false }];
    expect(getLegalActions(s, 0).some((a) => a.id === "move-confirm")).toBe(
      true,
    );
    s = applyAction(s, "move-confirm");
    expect(s.players[0].runes).toHaveLength(0);
    expect(
      s.units
        .filter((u) => [first.id, second.id].includes(u.id))
        .every((u) => u.location === "field:0"),
    ).toBe(true);
  });
});

describe("Unleashed activated targeting costs", () => {
  it("requires and pays Xerath's Fury cost plus dynamic Deflect power", () => {
    let s = game();
    const xerath = unit(s, 26),
      target = unit(s, 47, 1);
    s.players[1].xp = 3; // Mosstomper gains Deflect from Level, not its static script.
    s.players[0].energy = 0;
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "fury-cost", domain: "Fury", ready: false }];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.abilityKey === "xerath" && a.targetId === target.id,
      ),
    ).toBe(false);
    s.players[0].runes.push({ id: "tax", domain: "Calm", ready: false });
    const ability = getLegalActions(s, 0).find(
      (a) => a.abilityKey === "xerath" && a.targetId === target.id,
    )!;
    expect(ability).toBeTruthy();
    s = applyAction(s, ability);
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.players[0].energy).toBe(0);
    expect(s.units.find((u) => u.id === xerath.id)?.ready).toBe(false);
    expect(s.stack.at(-1)?.targetId).toBe(target.id);
  });
  it("pays Shadow's own universal power plus Deflect and charges enemy targets of Divining Shells", () => {
    let s = game();
    unit(s, 194);
    const target = unit(s, 41, 1);
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    s.players[0].energy = 1;
    s.players[0].power = 0;
    s.players[0].runes = [{ id: "base-cost", domain: "Calm", ready: false }];
    expect(
      getLegalActions(s, 0).some(
        (a) => a.abilityKey === "shadow" && a.targetId === target.id,
      ),
    ).toBe(false);
    s.players[0].runes.push({
      id: "deflect-cost",
      domain: "Fury",
      ready: false,
    });
    s = applyAction(
      s,
      getLegalActions(s, 0).find(
        (a) => a.abilityKey === "shadow" && a.targetId === target.id,
      )!,
    );
    expect(s.players[0].runes).toHaveLength(0);
    expect(s.players[0].energy).toBe(0);
    s = resolve(s);
    expect(s.units.find((u) => u.id === target.id)?.stunned).toBe(true);

    let shells = game();
    const enemy = unit(shells, 41, 1);
    shells.gears = [
      { id: "taxed-shells", cardId: unl(161), owner: 0, ready: true },
    ];
    shells.players[0].runes = [];
    shells.players[0].power = 0;
    expect(
      getLegalActions(shells, 0).some(
        (a) => a.abilityKey === "shells" && a.targetId === enemy.id,
      ),
    ).toBe(false);
    shells.players[0].power = 1;
    shells = applyAction(
      shells,
      getLegalActions(shells, 0).find(
        (a) => a.abilityKey === "shells" && a.targetId === enemy.id,
      )!,
    );
    expect(shells.players[0].power).toBe(0);
    expect(shells.gears).toHaveLength(0);
    expect(shells.players[0].discard).toContain(unl(161));
  });
  it("omits enemy Shroud targets from all three abilities while allowing protected friendly targets", () => {
    const s = game();
    const xerath = unit(s, 26);
    unit(s, 194);
    const enemy = unit(s, 41, 1),
      friend = unit(s, 34);
    enemy.untargetableByEnemy = true;
    friend.untargetableByEnemy = true;
    s.gears = [
      { id: "shells-shroud", cardId: unl(161), owner: 0, ready: true },
    ];
    const mainActions = getLegalActions(s, 0);
    for (const key of ["xerath", "shells"]) {
      expect(
        mainActions.some(
          (a) => a.abilityKey === key && a.targetId === enemy.id,
        ),
      ).toBe(false);
      expect(
        mainActions.some(
          (a) => a.abilityKey === key && a.targetId === friend.id,
        ),
      ).toBe(true);
    }
    s.phase = "showdown";
    s.combat = {
      fieldId: "field:0",
      attacker: 1,
      defender: 0,
      stage: "priority",
      engaged: true,
      total: [0, 0],
      remaining: [0, 0],
      assignments: [{}, {}],
      assigningPlayer: 1,
    };
    expect(
      getLegalActions(s, 0).some(
        (a) => a.abilityKey === "shadow" && a.targetId === enemy.id,
      ),
    ).toBe(false);
    s.phase = "main";
    s.combat = null;
    const chosen = getLegalActions(s, 0).find(
      (a) => a.abilityKey === "xerath" && a.targetId === friend.id,
    )!;
    const ctx = context(s);
    unleashedModule.apply?.(s, chosen, ctx);
    expect(ctx.cardEvent).toHaveBeenCalledWith(
      s,
      "target",
      0,
      friend.cardId,
      friend.id,
      friend.location,
    );
    expect(xerath.ready).toBe(false);
  });
});
