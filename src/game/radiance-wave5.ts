import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import { deployedGear } from "./deploy";
import { attachedEquipment } from "./equipment";
import type { ExpansionModule } from "./later-precon-engine";
import { markDied, useOncePerTurn } from "./radiance-rules";
import { predictN } from "./radiance-wave4";
import { getScript } from "./scripts";
import { textSources } from "./text-sources";
import type {
  CardScript,
  Effect,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";

/**
 * Radiance wave 5: cards built on existing rules plus small shared hooks
 * (conditional "enter ready", new additional costs, battlefields, legends).
 */
const plain: CardScript = { implemented: true };
const rd5 = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `radiance5:${custom}`,
  ...extra,
});
const disarm = (n = 1): Effect => ({
  type: "might",
  amount: -n,
  target: "enemyUnitHere",
});
const equip = (text: string, keywords: string[], shield = 0): CardScript => ({
  ...plain,
  equipCost: 1,
  equipEnergy: 1,
  equipment: { text, keywords, ...(shield ? { shield } : {}) },
});

export const radianceWave5Scripts: Record<string, CardScript> = {
  "rad-004-167": {
    ...plain,
    action: true,
    spell: [rd5("brawl", { target: "anyUnit" })],
  },
  "rad-005-167": plain,
  "rad-007-167": {
    ...plain,
    spell: [
      rd5("rally", { target: "battlefield", condition: "occupiedEnemy" }),
    ],
  },
  "rad-011-167": { ...plain, showOff: { kind: "mech" } },
  "rad-016-167": { ...plain, onEnd: [rd5("coalesced")] },
  "rad-018-167": {
    ...plain,
    onPlay: [{ type: "special", custom: "wave16:blind-fury" }],
  },
  "rad-019-167": {
    ...plain,
    keywords: ["Enters ready"],
    onPlay: [rd5("ready-enemies")],
  },
  "rad-026-167": { ...plain, optionalEnterReady: true },
  "rad-027-167": {
    ...plain,
    abilities: [
      {
        label: "[Buff] a unit, or +2 Might if it is buffed",
        exhaust: true,
        effects: [rd5("avian", { target: "anyUnit" })],
      },
    ],
  },
  "rad-028-167": {
    ...plain,
    action: true,
    additionalCost: { required: true, board: { kind: "exhaustUnit" } },
    spell: [{ type: "stun", target: "anyUnit" }],
  },
  "rad-029-167": {
    ...plain,
    reaction: true,
    additionalCost: { required: true, board: { kind: "exhaustUnit" } },
    spell: [
      { type: "draw", amount: 1 },
      { type: "channel", amount: 1 },
    ],
  },
  "rad-030-167": plain,
  "rad-031-167": {
    ...plain,
    shield: 3,
    keywords: ["Shield 3"],
    onPlay: [rd5("ferryman")],
  },
  "rad-032-167": {
    ...plain,
    reaction: true,
    showOff: { kind: "gear" },
    spell: [{ type: "might", amount: 2, target: "anyUnit" }, rd5("prep-runes")],
  },
  "rad-034-167": {
    ...plain,
    reaction: true,
    spell: [
      rd5("hunker", { target: "friendlyUnit" }),
      { type: "draw", amount: 1 },
    ],
  },
  "rad-035-167": {
    ...plain,
    onPlay: [{ type: "might", amount: 3, target: "friendlyUnit" }],
    abilities: [
      {
        label: "Exhaust a friendly Mighty unit: draw 1",
        exhaust: true,
        condition: "radiance:mighty-ready",
        effects: [rd5("bloom")],
      },
    ],
  },
  "rad-037-167": plain,
  "rad-039-167": plain,
  "rad-041-167": {
    ...plain,
    reaction: true,
    spell: [{ type: "counter", target: "spell", minPower: 2 }],
  },
  "rad-042-167": { ...plain, shield: 1, keywords: ["Shield"] },
  "rad-050-167": {
    ...plain,
    keywords: ["Disarm 2"],
    onAttack: [disarm(2)],
    onPlay: [rd5("predict", { amount: 2 })],
  },
  "rad-051-167": {
    ...plain,
    additionalCost: { required: true, board: { kind: "returnUnit" } },
    spell: [{ type: "damage", amount: 5, target: "unitAtBattlefield" }],
  },
  "rad-055-167": plain,
  "rad-061-167": {
    ...plain,
    keywords: ["Ganking"],
    additionalCost: { required: true, board: { kind: "returnUnit" } },
  },
  "rad-063-167": { ...plain, keywords: ["Disarm"], onAttack: [disarm()] },
  "rad-066-167": {
    ...plain,
    additionalCost: { board: { kind: "returnGear" } },
    onPlay: [rd5("forge")],
  },
  "rad-067-167": {
    ...plain,
    onPlay: [rd5("predict", { amount: 3 })],
    onHold: [rd5("predict", { amount: 3 })],
    onDeath: [
      {
        type: "playCard",
        play: {
          zone: "top",
          count: 1,
          optional: true,
          ignoreEnergy: true,
          revealed: true,
          unplayedBanished: true,
        },
      },
    ],
  },
  "rad-071-167": equip("[Shield 2]", ["Shield 2"], 2),
  "rad-074-167": { ...plain, onMove: [rd5("witness")] },
  "rad-075-167": {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    additionalCost: { board: { kind: "returnGear" }, energyReduction: 2 },
  },
  "rad-078-167": {
    ...plain,
    shield: 3,
    keywords: ["Shield 3", "Tank"],
    onMove: [rd5("tusker")],
  },
  "rad-080-167": plain,
  "rad-082-167": {
    ...plain,
    showOff: { kind: "unit", value: "might" },
    spell: [rd5("roar", { target: "anyUnit" })],
  },
  "rad-083-167": {
    ...plain,
    shield: 2,
    keywords: ["Shield 2"],
    onPlay: [
      { type: "kill", target: "anyGear", targetMaxEnergy: 4, optional: true },
    ],
  },
  "rad-084-167": {
    ...plain,
    spell: [
      rd5("cataclysm-lock"),
      rd5("cataclysm-move", { target: "friendlyUnit" }),
    ],
  },
  "rad-089-167": plain,
  "rad-092-167": plain,
  "rad-093-167": { ...plain, keywords: ["Disarm 2"], onAttack: [disarm(2)] },
  "rad-101-167": {
    ...plain,
    action: true,
    spell: [rd5("offer", { target: "anyGear" })],
  },
  "rad-107-167": {
    ...plain,
    hidden: true,
    onPlay: [rd5("stranger", { target: "battlefield" })],
  },
  "rad-110-167": { ...plain, onMove: [rd5("lulu")] },
  "rad-121-167": {
    ...plain,
    action: true,
    spell: [
      { type: "buff", target: "friendlyUnit" },
      { type: "special", custom: "draft:stun", target: "enemyUnit" },
    ],
  },
  "rad-123-167": {
    ...equip("[Tank]", ["Tank"]),
    reaction: true,
    keywords: ["Quick-Draw"],
  },
  "rad-126-167": { ...plain, onDeath: [rd5("mournful")] },
  "rad-129-167": { ...plain, onPlay: [rd5("captain")] },
  "rad-131-167": plain,
  "rad-133-167": {
    ...plain,
    assault: 1,
    keywords: ["Assault", "Tank"],
    onAttack: [rd5("jarvan-call")],
  },
  "rad-135-167": {
    ...plain,
    spell: [
      {
        type: "playCard",
        play: {
          zone: "trash",
          cardTypes: ["Unit", "Gear"],
          maxEnergy: 3,
          maxPower: 1,
          ignoreCost: true,
          count: 3,
          optional: true,
        },
      },
    ],
  },
  "rad-137-167": {
    ...plain,
    onPlay: [rd5("morde")],
    onAttack: [rd5("morde")],
  },
  "rad-144-167": { ...plain, spell: [rd5("realm", { target: "duel" })] },
  "rad-147-167": {
    ...plain,
    abilities: [
      {
        label: "Give a friendly unit Assault equal to its Shield this turn",
        energy: 1,
        exhaust: true,
        effects: [rd5("pride", { target: "friendlyUnit" })],
      },
    ],
  },
  "rad-148-167": {
    ...plain,
    action: true,
    spell: [rd5("ntofo", { target: "duel" })],
  },
  "rad-149-167": plain,
  "rad-158-167": plain,
  "rad-160-167": { ...plain, onHold: [rd5("vista")] },
  "rad-161-167": plain,
  "rad-162-167": { ...plain, onConquer: [rd5("hideout")] },
  "rad-163-167": plain,
  "rad-164-167": plain,
};

type State = GameState & {
  radiancePride?: { unitId: string; turn: number }[];
  radianceIllumBatch?: string;
};
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const has = (s: GameState, u: Unit, n: number) =>
  textSources(s, u).some((t) => isFace(t.cardId, "RAD", n));
const fieldCard = (s: GameState, id?: string) =>
  s.fields.find((f) => f.id === id)?.cardId;
const fieldIs = (s: GameState, id: string | undefined, n: number) => {
  const card = fieldCard(s, id);
  return Boolean(card && isFace(card, "RAD", n));
};
/** The total of a unit's [Shield] instances. */
export function shieldValue(s: GameState, u: Unit) {
  return (
    textSources(s, u).reduce(
      (n, t) => n + (getScript(t.cardId)?.shield ?? 0),
      0,
    ) +
    (u.temporaryKeywords ?? [])
      .filter((k) => k === "Shield" || k.startsWith("Shield "))
      .reduce((n, k) => n + (Number(k.split(" ")[1]) || 1), 0) +
    attachedEquipment(s, u).reduce(
      (n, g) => n + (getScript(g.cardId)?.equipment?.shield ?? 0),
      0,
    ) +
    (u.location.startsWith("field:")
      ? 2 *
        deployedGear(s, u.location, u.owner).filter((g) =>
          isFace(g.cardId, "RAD", 44),
        ).length
      : 0)
  );
}
const friendlyGearHere = (s: GameState, u: Unit) =>
  s.gears.some(
    (g) =>
      g.owner === u.owner &&
      !s.units.some((v) => v.id === g.id) &&
      ((g.deployedAt ?? `base:${g.owner}`) === u.location ||
        s.units.some(
          (v) => v.id === g.attachedTo && v.location === u.location,
        )),
  );

export const radianceWave5Module: ExpansionModule = {
  might(s, u, value) {
    let bonus = 0;
    // Ephemeral Ward: your units have +2 Might.
    bonus +=
      2 *
      s.gears.filter((g) => g.owner === u.owner && isFace(g.cardId, "RAD", 39))
        .length;
    // Packed Amphitheater: champion units here have +1 Might.
    if (
      fieldIs(s, u.location, 164) &&
      getCard(u.cardId).supertype === "Champion"
    )
      bonus += 1;
    // Pride of Nazumah: Assault equal to its Shield while attacking.
    if (
      s.combat?.attacker === u.owner &&
      s.combat.fieldId === u.location &&
      (s.combat.engaged ?? true) &&
      (s as State).radiancePride?.some(
        (g) => g.unitId === u.id && g.turn === s.turn,
      )
    )
      bonus += shieldValue(s, u);
    return value + bonus;
  },
  keywords(s, u) {
    const out: string[] = [];
    // Orianna, Exquisite: no combat damage unless a friendly gear is here.
    if (has(s, u, 42) && !friendlyGearHere(s, u)) out.push("No combat damage");
    // Clanging Sentry: your Mechs have [Disarm].
    if (getCard(u.cardId).tags.includes("Mech") || u.cardId === "token-mech")
      for (const _ of own(s, u.owner).filter((v) => has(s, v, 55)))
        out.push("Disarm");
    return out;
  },
  cost(s, p, card, ctx) {
    let energy = 0;
    // Bloodscent Swarm: 2 less per battlefield you've conquered this turn.
    if (isFace(card.id, "RAD", 80))
      energy -= 2 * s.players[p].conqueredThisTurn.length;
    // Hunters' Circle: the first unit or gear each player plays here on their turn.
    const field = s.fields.find((f) => f.id === ctx?.locationId);
    if (
      field &&
      isFace(field.cardId, "RAD", 163) &&
      s.currentPlayer === p &&
      (isCardType(card, "Unit") || isCardType(card, "Gear")) &&
      s.radiance?.once?.[`hunters:${field.id}:${p}`] !== s.turn
    )
      energy -= 1;
    return { energy };
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    if (name === "death") {
      const card = getCard(cardId);
      // Unit deaths are already recorded by the engine (firstDeathTurn).
      if (isCardType(card, "Gear") && !s.units.some((u) => u.id === sourceId))
        markDied(s, p);
      // Demacian Illuminators: once for each batch of friendly deaths.
      const batch = `${s.turn}:${p}:${(ctx.dyingUnitIds ?? [sourceId]).join(",")}`;
      if (
        isCardType(card, "Unit") &&
        (s as State).radianceIllumBatch !== batch
      ) {
        (s as State).radianceIllumBatch = batch;
        for (const u of own(s, p).filter((u) => has(s, u, 131)))
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            [{ type: "buff", target: "friendlyUnit" }],
            u.location,
          );
      }
    }
    if (name === "play") {
      const card = getCard(cardId);
      if ((card.energy ?? 0) >= 7)
        // Sanctum Conservator: ready me.
        for (const u of own(s, p).filter((u) => has(s, u, 30)))
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            [{ type: "ready", condition: "self" }],
            u.location,
          );
      if (isCardType(card, "Unit")) {
        // Ephemeral Ward: when you play a unit, kill this.
        for (const g of s.gears.filter(
          (g) => g.owner === p && isFace(g.cardId, "RAD", 39),
        ))
          ctx.trigger(s, p, g.cardId, g.id, [rd5("kill-self")]);
        // Titanic Shrine: a unit stronger than every other unit on the board.
        const played = s.units.find((u) => u.id === sourceId);
        if (
          played &&
          s.units
            .filter((u) => u.id !== played.id)
            .every((u) => ctx.getMight(s, u) < ctx.getMight(s, played))
        )
          for (const g of s.gears.filter(
            (g) => g.owner === p && g.ready && isFace(g.cardId, "RAD", 89),
          ))
            ctx.trigger(s, p, g.cardId, g.id, [rd5("shrine")]);
        // Firelights' Hideout grant is used by this unit.
        if (s.radiance?.accelerateNext)
          s.radiance.accelerateNext = s.radiance.accelerateNext.filter(
            (g) => g.player !== p,
          );
      }
      // Hunters' Circle: the discount applies to the first play here.
      const field = s.fields.find((f) => f.id === locationId);
      if (
        field &&
        isFace(field.cardId, "RAD", 163) &&
        s.currentPlayer === p &&
        (isCardType(card, "Unit") || isCardType(card, "Gear"))
      )
        useOncePerTurn(s, `hunters:${field.id}`, p);
    }
    // Clanging Sentry: each of your attacking Mechs has [Disarm].
    if (name === "attack" && sourceId) {
      const u = s.units.find((v) => v.id === sourceId);
      const sentries = u ? own(s, p).filter((v) => has(s, v, 55)).length : 0;
      if (
        u &&
        sentries &&
        (getCard(u.cardId).tags.includes("Mech") || u.cardId === "token-mech")
      )
        ctx.trigger(s, p, u.cardId, u.id, [disarm(sentries)], u.location);
    }
    // Durand Memorial: when you defend here, give a unit you control here Tank.
    if (name === "combatStart" && s.combat && locationId) {
      if (fieldIs(s, locationId, 161))
        ctx.trigger(
          s,
          s.combat.defender,
          fieldCard(s, locationId)!,
          locationId,
          [{ type: "keyword", keyword: "Tank", target: "friendlyUnitHere" }],
          locationId,
        );
    }
  },
  actions(s, p) {
    // Black Market: once on each of your turns, Power x2: draw 1.
    const field = s.fields.find((f) => isFace(f.cardId, "RAD", 158));
    if (
      !field ||
      s.currentPlayer !== p ||
      s.priorityPlayer !== p ||
      s.phase !== "main" ||
      s.stack.length ||
      s.radiance?.once?.[`black-market:${p}`] === s.turn
    )
      return [];
    const x = s.players[p];
    const runes = x.runes.filter((r) => r.ready).length + (x.power ?? 0);
    if (runes < 2) return [];
    return [
      {
        id: `radiance:black-market:${field.id}`,
        label: "Black Market: pay 2 Power to draw 1",
        category: "ability",
        player: p,
        sourceId: field.id,
        cardId: field.cardId,
      },
    ];
  },
  apply(s, action, ctx) {
    if (!action.id.startsWith("radiance:black-market:")) return false;
    const p = action.player;
    if (!ctx.canPay(s, p, 0, 2)) return true;
    ctx.pay(s, p, 0, 2);
    useOncePerTurn(s, "black-market", p);
    ctx.pushStack(s, {
      player: p,
      cardId: action.cardId!,
      sourceId: action.sourceId,
      effects: [{ type: "draw", amount: 1 }],
      kind: "ability",
    });
    return true;
  },
  effect(s, p, e, ctx) {
    if (e.custom === "draft:stun") {
      const t = s.units.find((u) => u.id === ctx.targetId);
      if (t) ctx.runEffects(s, p, [{ type: "stun", target: "anyUnit" }], t.id);
      return true;
    }
    if (!e.custom?.startsWith("radiance5:")) return false;
    const self = s.units.find((u) => u.id === ctx.sourceId);
    const target = s.units.find((u) => u.id === ctx.targetId);
    const x = s.players[p];
    const here = ctx.locationId;
    switch (e.custom.slice("radiance5:".length)) {
      case "brawl":
        if (target) target.temporaryAssault += ctx.getMight(s, target);
        return true;
      case "rally": {
        const field = s.fields.find((f) => f.id === ctx.targetId);
        if (
          field &&
          field.controller !== p &&
          s.units.some((u) => u.owner !== p && u.location === field.id)
        )
          for (let i = 0; i < 3; i++)
            ctx.spawnToken(s, p, "Recruit", field.id, false);
        return true;
      }
      case "coalesced": {
        x.runeDeck.push(...x.runes.map((r) => r.domain));
        x.runes = [];
        ctx.channel(s, p, 4, false);
        return true;
      }
      case "ready-enemies":
        for (const u of s.units.filter((u) => u.owner !== p))
          ctx.runEffects(s, p, [{ type: "ready" }], u.id);
        return true;
      case "avian":
        if (target) {
          if (target.buff) target.temporaryMight += 2;
          else
            ctx.runEffects(
              s,
              p,
              [{ type: "buff", target: "anyUnit" }],
              target.id,
            );
        }
        return true;
      case "ferryman": {
        if (!self || !self.location.startsWith("field:")) return true;
        const others = own(s, p).filter(
          (u) => u.id !== self.id && u.location === self.location,
        );
        if (others.length)
          choices(s, p, ctx, [
            ...others.map((u) =>
              option(
                p,
                `ferry:${u.id}`,
                `Move ${getCard(u.cardId).name} to your base`,
                [rd5("to-base", { cardName: u.id })],
              ),
            ),
            option(p, "ferry:none", "Do not move a unit", []),
          ]);
        return true;
      }
      case "to-base": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (unit) ctx.moveUnit(s, unit, `base:${unit.owner}`, p);
        return true;
      }
      case "prep-runes":
        if (e.shown)
          ctx.runEffects(s, p, [
            { type: "readyRunes", amount: 2, chooseRunes: true },
          ]);
        return true;
      case "hunker":
        if (target) {
          ctx.runEffects(s, p, [{ type: "ready" }], target.id);
          target.moveLockedTurn = s.turn;
        }
        return true;
      case "bloom": {
        const mighty = s.units.filter(
          (u) => u.owner === p && u.ready && ctx.getMight(s, u) >= 5,
        );
        if (!mighty.length) return true;
        choices(
          s,
          p,
          ctx,
          mighty.map((u) =>
            option(
              p,
              `bloom:${u.id}`,
              `Exhaust ${getCard(u.cardId).name}: draw 1`,
              [rd5("exhaust-draw", { cardName: u.id })],
            ),
          ),
        );
        return true;
      }
      case "exhaust-draw": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (unit?.ready) {
          unit.ready = false;
          ctx.draw(s, p, 1);
        }
        return true;
      }
      case "predict":
        predictN(s, p, ctx, e.amount ?? 1);
        return true;
      case "forge": {
        const returned = s.radiance?.returnedEnergy;
        if (e.additionalCostPaid && self) {
          ctx.runEffects(s, p, [{ type: "ready" }], self.id);
          if (returned?.player === p && returned.turn === s.turn)
            self.temporaryMight += returned.energy;
        }
        return true;
      }
      case "witness": {
        const top = x.deck[0];
        if (!top) return true;
        const card = getCard(top);
        ctx.cardEvent(s, "reveal", p, top);
        ctx.log?.(s, `${x.name} reveals ${card.name}.`, "info", p);
        if (isCardType(card, "Unit") && (card.might ?? 0) >= 5)
          ctx.draw(s, p, 1);
        else x.deck.push(x.deck.shift()!);
        return true;
      }
      case "tusker": {
        if (!self) return true;
        const amount = shieldValue(s, self);
        const targets = s.units.filter(
          (u) =>
            u.location.startsWith("field:") &&
            (ctx.canTargetUnit?.(s, p, u) ?? true),
        );
        if (amount && targets.length)
          choices(s, p, ctx, [
            ...targets.map((u) => ({
              ...option(
                p,
                `tusker:${u.id}`,
                `Deal ${amount} to ${getCard(u.cardId).name}`,
                [{ type: "damage", amount, damageSource: "unit" } as Effect],
              ),
              targetId: u.id,
            })),
            option(p, "tusker:none", "Do not deal damage", []),
          ]);
        return true;
      }
      case "roar":
        if (e.shown && target)
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: e.shown.might, target: "anyUnit" }],
            target.id,
          );
        return true;
      case "cataclysm-lock":
        s.players[p === 0 ? 1 : 0].cannotPlaySpellsTurn = s.turn;
        return true;
      case "cataclysm-move": {
        const fields = s.fields.filter(
          (f) =>
            f.controller !== null &&
            f.controller !== p &&
            s.units.some((u) => u.owner !== p && u.location === f.id),
        );
        if (!target || target.owner !== p || !fields.length) return true;
        if (fields.length === 1) ctx.moveUnit(s, target, fields[0].id, p);
        else
          choices(
            s,
            p,
            ctx,
            fields.map((f) =>
              option(
                p,
                `cataclysm:${f.id}`,
                `Move to ${getCard(f.cardId).name}`,
                [rd5("move-to", { cardName: f.id })],
              ),
            ),
          );
        return true;
      }
      case "move-to":
        if (target) ctx.moveUnit(s, target, e.cardName as LocationId, p);
        return true;
      case "offer": {
        const gear = s.gears.find((g) => g.id === ctx.targetId);
        if (gear) {
          const controller = gear.owner;
          ctx.killGear(s, gear.id);
          ctx.spawnToken(s, controller, "Gold", `base:${controller}`, false);
        }
        return true;
      }
      case "stranger": {
        const field = ctx.targetId as LocationId;
        const there = s.units.filter((u) => u.location === field);
        const enemies = there.filter(
          (u) => u.owner !== p && (ctx.canTargetUnit?.(s, p, u) ?? true),
        );
        if (there.length >= 4 && enemies.length)
          choices(s, p, ctx, [
            ...enemies.map((u) => ({
              ...option(
                p,
                `stranger:${u.id}`,
                `Return ${getCard(u.cardId).name} to its owner's hand`,
                [{ type: "bounce" } as Effect],
              ),
              targetId: u.id,
            })),
            option(p, "stranger:none", "Do not return a unit", []),
          ]);
        return true;
      }
      case "lulu": {
        if (!self) return true;
        const others = s.units.filter((u) => u.id !== self.id);
        if (others.length)
          choices(s, p, ctx, [
            ...others.map((u) => ({
              ...option(
                p,
                `lulu:${u.id}`,
                `${getCard(u.cardId).name}'s base Might becomes 4`,
                [rd5("base-4")],
              ),
              targetId: u.id,
            })),
            option(p, "lulu:none", "Do not change a unit", []),
          ]);
        return true;
      }
      case "base-4":
        if (target) target.baseMightOverride = 4;
        return true;
      case "mournful": {
        const unitsHere = s.units.filter((u) => u.location === here);
        const gearHere = s.gears.filter(
          (g) => g.deployedAt === here && !s.units.some((u) => u.id === g.id),
        );
        if (unitsHere.length + gearHere.length)
          choices(s, p, ctx, [
            ...unitsHere.map((u) => ({
              ...option(
                p,
                `mournful:${u.id}`,
                `Kill ${getCard(u.cardId).name}`,
                [{ type: "kill" } as Effect],
              ),
              targetId: u.id,
            })),
            ...gearHere.map((g) =>
              option(p, `mournful:${g.id}`, `Kill ${getCard(g.cardId).name}`, [
                rd5("kill-gear", { cardName: g.id }),
              ]),
            ),
            option(p, "mournful:none", "Do not kill anything", []),
          ]);
        return true;
      }
      case "kill-gear":
        if (s.gears.some((g) => g.id === e.cardName))
          ctx.killGear(s, e.cardName!);
        return true;
      case "kill-self":
        if (s.gears.some((g) => g.id === ctx.sourceId))
          ctx.killGear(s, ctx.sourceId!);
        return true;
      case "captain": {
        const top = x.deck.slice(0, 4);
        const eligible = top
          .map((id, i) => ({ id, i, card: getCard(id) }))
          .filter(
            ({ card }) =>
              (isCardType(card, "Unit") || isCardType(card, "Gear")) &&
              (card.energy ?? 0) <= 3 &&
              (card.power ?? 0) <= 1,
          );
        choices(s, p, ctx, [
          ...eligible.map(({ i, card }) =>
            option(p, `captain:${i}`, `Reveal and draw ${card.name}`, [
              rd5("captain-take", { amount: i, cardName: String(top.length) }),
            ]),
          ),
          option(p, "captain:none", "Recycle all", [
            rd5("captain-take", { amount: -1, cardName: String(top.length) }),
          ]),
        ]);
        return true;
      }
      case "captain-take": {
        const n = Number(e.cardName ?? 0);
        const top = x.deck.splice(0, n);
        const i = e.amount ?? -1;
        if (i >= 0) {
          x.hand.push(top[i]);
          ctx.cardEvent(s, "reveal", p, top[i]);
          ctx.cardEvent(s, "draw", p, top[i]);
        }
        x.deck.push(...top.filter((_, j) => j !== i));
        return true;
      }
      case "jarvan-call": {
        if (!self) return true;
        const units = own(s, p).filter(
          (u) => u.id !== self.id && u.location !== self.location,
        );
        if (units.length)
          choices(s, p, ctx, [
            ...units.map((u) =>
              option(
                p,
                `jarvan:${u.id}`,
                `Move ${getCard(u.cardId).name} to Jarvan's battlefield`,
                [rd5("call-unit", { cardName: u.id })],
              ),
            ),
            option(p, "jarvan:none", "Do not move a unit", []),
          ]);
        return true;
      }
      case "call-unit": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (unit && self) ctx.moveUnit(s, unit, self.location, p);
        return true;
      }
      case "morde": {
        if (!x.hand.length) return true;
        const units = s.units.filter(
          (u) => ctx.canTargetUnit?.(s, p, u) ?? true,
        );
        const gears = s.gears.filter(
          (g) => !s.units.some((u) => u.id === g.id),
        );
        choices(s, p, ctx, [
          ...units.map((u) => ({
            ...option(
              p,
              `morde:${u.id}`,
              `Discard 1 to kill ${getCard(u.cardId).name}`,
              [
                { type: "discard", amount: 1 } as Effect,
                { type: "kill" } as Effect,
              ],
            ),
            targetId: u.id,
          })),
          ...gears.map((g) =>
            option(
              p,
              `morde:${g.id}`,
              `Discard 1 to kill ${getCard(g.cardId).name}`,
              [
                { type: "discard", amount: 1 } as Effect,
                rd5("kill-gear", { cardName: g.id }),
              ],
            ),
          ),
          option(p, "morde:none", "Do not discard", []),
        ]);
        return true;
      }
      case "realm":
      case "ntofo": {
        const [first, second] = (ctx.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        if (!first || !second) return true;
        if (e.custom.endsWith("realm")) {
          second.temporaryMight -= 2;
          first.temporaryMight += 2;
          const a = ctx.getMight(s, first),
            b = ctx.getMight(s, second);
          ctx.dealDamage(s, second, a, true);
          ctx.dealDamage(s, first, b, true);
        } else {
          (first.temporaryKeywords ??= []).push("Shield 2");
          ctx.runEffects(
            s,
            p,
            [
              {
                type: "damage",
                amount: shieldValue(s, first),
                target: "enemyUnit",
              },
            ],
            second.id,
          );
        }
        return true;
      }
      case "pride":
        if (target)
          ((s as State).radiancePride ??= []).push({
            unitId: target.id,
            turn: s.turn,
          });
        return true;
      case "vista":
        if (!x.runeDeck.length)
          ctx.runEffects(s, p, [{ type: "score", amount: 1 }]);
        return true;
      case "hideout":
        ((s.radiance ??= {}).accelerateNext ??= []).push({
          player: p,
          turn: s.turn,
        });
        return true;
      case "shrine": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (gear?.ready) {
          gear.ready = false;
          ctx.draw(s, p, 1);
        }
        return true;
      }
    }
    return false;
  },
};

export const reviewedRadianceWave5Printings: readonly string[] =
  Object.keys(radianceWave5Scripts).sort();
