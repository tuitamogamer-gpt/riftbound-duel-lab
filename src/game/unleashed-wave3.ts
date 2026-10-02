import { getCard } from "../data/cards";
import { getMight, getKeywords } from "./engine";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";

const id = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const plain: CardScript = { implemented: true };
const fx = (key: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `unl-wave3:${key}`,
  ...extra,
});
const xp = (amount: number): Effect => fx("xp", { amount });
const self = (type: Effect["type"], amount?: number): Effect => ({
  type,
  condition: "self",
  ...(amount === undefined ? {} : { amount }),
});
const gold: Effect = fx("gold");
const currentXP = (s: GameState, p: PlayerId) => s.players[p].xp ?? 0;
const tribes = ["Bird", "Cat", "Dog", "Poro"];
const tribeCount = (s: GameState, p: PlayerId) =>
  tribes.filter((tag) =>
    s.units.some((u) => u.owner === p && getCard(u.cardId).tags.includes(tag)),
  ).length;

export const unleashedWave3Scripts: Record<string, CardScript> = {
  [id(11)]: plain,
  [id(23)]: plain,
  [id(37)]: plain,
  [id(49)]: plain,
  [id(57)]: { ...plain, keywords: ["Tank"] },
  [id(59)]: plain,
  [id(60)]: { ...plain, ambush: true, onHold: [{ type: "draw", amount: 1 }] },
  [id(65)]: {
    ...plain,
    onAttack: [
      {
        type: "might",
        target: "unitHere",
        amount: -1,
        optional: true,
        triggerCost: { energy: 1 },
      },
    ],
  },
  [id(73)]: {
    ...plain,
    spell: [
      fx("gold-mark", { target: "enemyUnit" }),
      { type: "damage", amount: 3, target: "enemyUnit" },
    ],
  },
  [id(74)]: plain,
  [id(79)]: plain,
  [id(85)]: { ...plain, reaction: true, keywords: ["Temporary"] },
  [id(88)]: plain,
  [id(95)]: {
    ...plain,
    action: true,
    spell: [
      { type: "might", amount: 3, target: "friendlyUnit" },
      fx("combat-xp-mark", { target: "friendlyUnit" }),
    ],
  },
  [id(109)]: plain,
  [id(110)]: { ...plain, spell: [{ type: "duel", target: "anyTwoUnits" }] },
  [id(121)]: {
    ...plain,
    onPlay: [
      {
        type: "special",
        modes: [
          {
            label: "Choose yourself: discard 1",
            effects: [{ type: "discard", who: "self" }],
          },
          {
            label: "Choose your opponent: they discard 1",
            effects: [{ type: "discard", who: "opponent" }],
          },
        ],
      },
    ],
  },
  [id(119)]: {
    ...plain,
    keywords: ["Hunt"],
    onConquer: [xp(1)],
    onHold: [xp(1)],
    onAttack: [
      fx("might-damage", {
        target: "enemyUnitHere",
        optional: true,
        triggerCost: { xp: 3 },
      }),
    ],
  },
  [id(120)]: { ...plain, ambush: true, keywords: ["AmbushEnemyOccupied"] },
  [id(165)]: {
    ...plain,
    spell: [
      { type: "temporary", target: "friendlyUnitWithoutTemporary" },
      { type: "draw", amount: 2 },
    ],
  },
  [id(190)]: {
    ...plain,
    reaction: true,
    spell: [fx("lullaby", { target: "spell" })],
  },
  [id(137)]: {
    ...plain,
    onAttack: [
      {
        type: "moveTarget",
        target: "enemyUnitHere",
        optional: true,
        triggerCost: { energy: 1 },
      },
    ],
  },
  [id(145)]: { ...plain, hidden: true, keywords: ["Backline"] },
  [id(196)]: {
    ...plain,
    keywords: ["Enters ready"],
    onAttack: [
      { type: "stun", target: "enemyUnitHere", condition: "allFourTribes" },
    ],
  },
  [id(201)]: plain,
};

interface WaveState {
  turn: number;
  beginningDeath: [boolean, boolean];
  goldMarks: Record<string, PlayerId[]>;
  combatMarks: Record<string, PlayerId[]>;
  usedPykes: string[];
  drawn: [number, number];
}
function state(s: GameState, write = false): WaveState {
  const game = s as GameState & { unleashedWave3?: WaveState };
  if (game.unleashedWave3?.turn === s.turn) return game.unleashedWave3;
  const fresh: WaveState = {
    turn: s.turn,
    beginningDeath: [false, false],
    goldMarks: {},
    combatMarks: {},
    usedPykes: [],
    drawn: [0, 0],
  };
  if (write) game.unleashedWave3 = fresh;
  return fresh;
}
function trigger(
  s: GameState,
  source: {
    id: string;
    cardId: string;
    owner: PlayerId;
    location?: LocationId;
  },
  effects: Effect[],
  ctx: PreconContext,
) {
  ctx.trigger(
    s,
    source.owner,
    source.cardId,
    source.id,
    effects,
    source.location,
  );
}
function friendlyTargets(s: GameState, p: PlayerId) {
  return s.units.filter((u) => u.owner === p);
}
function anyTargets(s: GameState, p: PlayerId, ctx: PreconContext) {
  return s.units.filter(
    (u) =>
      (u.owner === p ||
        (!u.untargetableByEnemy &&
          !getKeywords(s, u).includes("Untargetable"))) &&
      ctx.canPay(s, p, 0, 0, [], ctx.targetTax?.(s, p, u.id) ?? 0),
  );
}

export const unleashedWave3Module: ExpansionModule = {
  cost(s, p, card) {
    if (card.id === id(59)) {
      const steps =
        currentXP(s, p) >= 11
          ? 3
          : currentXP(s, p) >= 6
            ? 2
            : currentXP(s, p) >= 3
              ? 1
              : 0;
      return { energy: -2 * steps, power: -steps };
    }
    if (card.id === id(196)) return { energy: -tribeCount(s, p) };
    return {};
  },
  keywords(s, u) {
    const result: string[] = [];
    if (u.cardId === id(59) && currentXP(s, u.owner) >= 16)
      result.push("Untargetable");
    if (
      s.units.some(
        (source) =>
          source.cardId === id(57) &&
          source.owner === u.owner &&
          source.location === u.location &&
          getMight(s, source) > getMight(s, u),
      )
    )
      result.push("Untargetable");
    if (
      s.units.some(
        (source) =>
          source.cardId === id(60) &&
          source.owner !== u.owner &&
          source.location === u.location &&
          getMight(s, source) > getMight(s, u),
      )
    )
      result.push("No combat damage");
    return result;
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("unl-wave3:")) return false;
    const source = s.units.find((u) => u.id === ctx.sourceId);
    switch (e.custom.slice("unl-wave3:".length)) {
      case "palace-win":
        s.winner = p;
        s.phase = "ended";
        ctx.log?.(
          s,
          `${s.players[p].name} wins through Gutter Palace.`,
          "score",
          p,
        );
        break;
      case "lullaby": {
        const spell = s.stack.find(
          (item) => item.id === ctx.targetId && item.kind === "spell",
        );
        if (spell) {
          s.players[spell.player].cannotPlaySpellsTurn = s.turn;
          ctx.runEffects(
            s,
            p,
            [{ type: "counter", target: "spell" }],
            ctx.targetId,
            ctx.sourceId,
            ctx.locationId,
          );
        }
        break;
      }
      case "xp":
        s.players[p].xp = Math.max(0, currentXP(s, p) + (e.amount ?? 1));
        break;
      case "exhausted-return": {
        const target = s.units.find((u) => u.id === ctx.targetId && !u.ready);
        if (target)
          ctx.runEffects(
            s,
            p,
            [{ type: "moveTarget", target: "friendlyUnitAtBattlefield" }],
            ctx.targetId,
            ctx.sourceId,
            ctx.locationId,
          );
        break;
      }
      case "gold":
        ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
        break;
      case "gold-mark":
        if (ctx.targetId)
          (state(s, true).goldMarks[ctx.targetId] ??= []).push(p);
        break;
      case "combat-xp-mark":
        if (ctx.targetId)
          (state(s, true).combatMarks[ctx.targetId] ??= []).push(p);
        break;
      case "might-damage":
        if (source)
          ctx.runEffects(
            s,
            p,
            [
              {
                type: "damage",
                target: "enemyUnitHere",
                amount: ctx.getMight(s, source),
              },
            ],
            ctx.targetId,
            ctx.sourceId,
            ctx.locationId,
          );
        break;
      case "diana-pay":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.runEffects(
            s,
            p,
            [{ type: "predict" }, fx("diana-reveal")],
            undefined,
            ctx.sourceId,
            ctx.locationId,
          );
        }
        break;
      case "diana-reveal": {
        const top = s.players[p].deck[0];
        if (top) {
          ctx.log?.(
            s,
            `${s.players[p].name} reveals ${getCard(top).name}.`,
            "info",
            p,
          );
          if (getCard(top).type === "Spell") ctx.draw(s, p, 1);
        }
        break;
      }
      default:
        return false;
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const data = state(s, true);
    const source = s.units.find((u) => u.id === sourceId);
    if (event === "draw") {
      const before = data.drawn[p];
      data.drawn[p] += ctx.amount ?? 1;
      if (before < 2 && data.drawn[p] >= 2)
        for (const gear of s.gears.filter(
          (g) => g.owner === p && g.cardId === id(74),
        ))
          trigger(
            s,
            gear,
            [{ type: "might", amount: 2, target: "friendlyUnit" }],
            ctx,
          );
    }
    if (event === "hide")
      for (const u of s.units.filter(
        (u) => u.owner === p && u.cardId === id(23),
      ))
        trigger(s, u, [self("ready")], ctx);
    if (event === "play") {
      if (ctx.fromHidden)
        for (const u of s.units.filter(
          (u) => u.owner === p && u.cardId === id(23),
        ))
          trigger(
            s,
            u,
            [{ type: "damage", amount: 2, target: "enemyUnit" }],
            ctx,
          );
      if (cardId === id(49)) {
        const gear = s.gears.find((g) => g.id === sourceId);
        if (gear) gear.ready = false;
      }
      if (cardId === id(85)) {
        const gear = s.gears.find((g) => g.id === sourceId);
        if (gear) gear.temporary = true;
      }
    }
    if (event === "unitPlayed" && source) {
      if (cardId === id(37) && data.beginningDeath[p]) source.ready = true;
      for (const gear of s.gears.filter(
        (g) => g.owner === p && g.cardId === id(109),
      ))
        trigger(
          s,
          gear,
          [xp(1)].map((e) => ({
            ...e,
            optional: true,
            triggerCost: { energy: 1 },
          })),
          ctx,
        );
      if (s.phase === "showdown" || s.pendingChoice?.returnPhase === "showdown")
        for (const gear of s.gears.filter(
          (g) => g.owner === p && g.cardId === id(11),
        ))
          trigger(
            s,
            gear,
            [
              {
                type: "draw",
                amount: 1,
                optional: true,
                triggerCost: { exhaust: true },
              },
            ],
            ctx,
          );
    }
    if (event === "showdownStart")
      for (const u of s.units.filter(
        (u) => u.cardId === id(79) && u.location === locationId,
      ))
        trigger(s, u, [fx("diana-pay", { optional: true })], ctx);
    if (event === "beginning")
      for (const gear of s.gears.filter(
        (g) => g.owner === p && g.cardId === id(88),
      ))
        if (
          s.players[p].hand.length === 4 &&
          s.units.filter(
            (u) => u.owner === p && u.location.startsWith("field:"),
          ).length === 4
        ) {
          // The win is an ordinary trigger: an opponent may answer before it resolves.
          trigger(s, gear, [fx("palace-win")], ctx);
        }
    if (event === "score")
      for (const gear of s.gears.filter(
        (g) => g.owner !== p && g.cardId === id(85),
      ))
        trigger(s, gear, [{ type: "draw", amount: 1 }], ctx);
    if (event === "death" && source) {
      if (s.pendingBeginning === source.owner)
        data.beginningDeath[source.owner] = true;
      for (const owner of data.goldMarks[source.id] ?? [])
        ctx.trigger(s, owner, id(73), `mark:${source.id}`, [gold]);
      delete data.goldMarks[source.id];
      for (const pyke of s.units.filter(
        (u) =>
          u.cardId === id(145) &&
          u.owner !== source.owner &&
          u.location.startsWith("field:") &&
          !ctx.dyingUnitIds?.includes(u.id) &&
          !data.usedPykes.includes(u.id),
      )) {
        data.usedPykes.push(pyke.id);
        trigger(s, pyke, [gold], ctx);
      }
    }
    if (event === "combatEnd" && s.combat?.engaged) {
      const survivors = s.units.filter(
        (u) =>
          u.location === locationId &&
          s.combat?.designatedUnits?.includes(u.id),
      );
      for (const u of survivors)
        for (const owner of data.combatMarks[u.id] ?? [])
          ctx.trigger(s, owner, id(95), `combat-mark:${u.id}`, [xp(2)]);
      for (const owner of [0, 1] as const)
        if (
          survivors.some((u) => u.owner === owner) &&
          s.players[owner].legendId === id(201)
        )
          ctx.trigger(s, owner, id(201), "legend", [xp(1)], locationId);
    }
  },
  actions(s, p, ctx) {
    const actions: GameAction[] = [];
    const add = (
      key: string,
      sourceId: string,
      cardId: string,
      label: string,
      extra: Partial<GameAction> = {},
    ) =>
      actions.push({
        id: `unl-wave3:${key}:${sourceId}:${extra.targetId ?? extra.amount ?? ""}`,
        label,
        category: "ability",
        player: p,
        cardId,
        sourceId,
        abilityKey: key,
        ...extra,
      });
    for (const gear of s.gears.filter(
      (g) => g.owner === p && g.cardId === id(49) && g.ready,
    )) {
      add(
        "honey-power",
        gear.id,
        gear.cardId,
        "Exhaust: add 1 universal Power",
        { category: "resource" },
      );
      if (currentXP(s, p) >= 6)
        add(
          "honey-both",
          gear.id,
          gear.cardId,
          "Exhaust: add 1 Energy and 1 universal Power",
          { category: "resource" },
        );
    }
    if (
      s.currentPlayer !== p ||
      s.phase !== "main" ||
      s.stack.length ||
      s.pendingChoice
    )
      return actions;
    for (const gear of s.gears.filter((g) => g.owner === p && g.ready)) {
      if (gear.cardId === id(88))
        for (const [index, cardId] of s.players[p].hand.entries())
          add(
            "palace-bird",
            gear.id,
            gear.cardId,
            `Discard ${getCard(cardId).name} and exhaust: play a Bird`,
            { amount: index },
          );
      if (gear.cardId === id(109) && currentXP(s, p) >= 3)
        for (const u of anyTargets(s, p, ctx))
          add(
            "rose-ready",
            gear.id,
            gear.cardId,
            "Spend 3 XP and exhaust: ready a unit",
            { targetId: u.id },
          );
    }
    if (
      s.players[p].legendId === id(201) &&
      s.players[p].legendUsedTurn !== s.turn
    ) {
      if (currentXP(s, p) >= 1)
        for (const u of anyTargets(s, p, ctx))
          add(
            "legend-buff",
            "legend",
            id(201),
            "Spend 1 XP and exhaust: buff a unit",
            { targetId: u.id },
          );
      if (currentXP(s, p) >= 2)
        for (const u of friendlyTargets(s, p).filter(
          (u) => !u.ready && u.location.startsWith("field:"),
        ))
          add(
            "legend-return",
            "legend",
            id(201),
            "Spend 2 XP and exhaust: move an exhausted friendly unit to base",
            { targetId: u.id },
          );
    }
    return actions;
  },
  apply(s, action, ctx) {
    if (!action.id.startsWith("unl-wave3:")) return false;
    const p = action.player;
    const gear = s.gears.find((g) => g.id === action.sourceId);
    if (
      action.abilityKey === "honey-power" ||
      action.abilityKey === "honey-both"
    ) {
      if (gear) gear.ready = false;
      s.players[p].power = (s.players[p].power ?? 0) + 1;
      if (action.abilityKey === "honey-both") s.players[p].energy++;
      return true;
    }
    let effects: Effect[];
    if (action.abilityKey === "palace-bird")
      effects = [{ type: "token", cardName: "Bird" }];
    else if (action.abilityKey === "rose-ready") {
      s.players[p].xp = currentXP(s, p) - 3;
      effects = [{ type: "ready", target: "anyUnit" }];
    } else if (action.abilityKey === "legend-buff") {
      s.players[p].xp = currentXP(s, p) - 1;
      effects = [{ type: "buff", target: "anyUnit" }];
    } else if (action.abilityKey === "legend-return") {
      s.players[p].xp = currentXP(s, p) - 2;
      effects = [
        fx("exhausted-return", { target: "friendlyUnitAtBattlefield" }),
      ];
    } else return false;
    ctx.pay(s, p, 0, 0, [], ctx.targetTax?.(s, p, action.targetId) ?? 0);
    if (gear) gear.ready = false;
    else s.players[p].legendUsedTurn = s.turn;
    ctx.pushStack(s, {
      player: p,
      cardId: action.cardId!,
      sourceId: action.sourceId,
      targetId: action.targetId,
      kind: "ability",
      effects,
    });
    if (action.abilityKey === "palace-bird")
      ctx.discardCards(s, p, s.players[p].hand.splice(action.amount!, 1));
    return true;
  },
};
