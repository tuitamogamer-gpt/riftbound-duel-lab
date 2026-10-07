import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { isCardType } from "../data/cards";
import { getUnitTags } from "./board-rules";
import { ruleFamily } from "./rule-families";
import { getCard } from "../data/cards";
import type { CardScript, Effect, GameState, PlayerId, Unit } from "./types";
import type { ExpansionModule } from "./later-precon-engine";

const plain: CardScript = { implemented: true };
const special = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `ogn-extra:${custom}`,
  ...extra,
});
const spell = (
  effects: Effect[],
  timing?: "action" | "reaction",
): CardScript => ({
  ...plain,
  spell: effects,
  ...(timing ? { [timing]: true } : {}),
});
const self = (type: Effect["type"], amount?: number): Effect => ({
  type,
  condition: "self",
  ...(amount === undefined ? {} : { amount }),
});

/** Additional Origins rules. Only complete card implementations belong in this registry. */
export const originsExtraScripts: Record<string, CardScript> = {
  "ogn-014-298": spell(
    [{ type: "damage", amount: 5, target: "unitAtBattlefield" }],
    "action",
  ),
  "ogn-015-298": plain,
  "ogn-017-298": {
    ...plain,
    abilities: [
      {
        label: "Deal 2 to a unit at a battlefield",
        exhaust: true,
        effects: [{ type: "damage", amount: 2, target: "unitAtBattlefield" }],
      },
    ],
  },
  "ogn-020-298": { ...plain, onPlay: [special("legion-loot")] },
  "ogn-022-298": spell([special("kill-all-gear")], "action"),
  "ogn-027-298": plain,
  "ogn-028-298": plain,
  "ogn-038-298": { ...plain, onPlay: [special("mighty-draw")] },
  "ogn-039-298": {
    ...plain,
    accelerating: true,
    onConquer: [{ type: "draw", amount: 1 }],
  },
  "ogn-044-298": {
    ...plain,
    additionalCost: { power: 1, domain: "Calm" },
    onPlay: [special("clockwork-draw")],
  },
  "ogn-047-298": spell(
    [
      { type: "draw", amount: 1 },
      { type: "channel", amount: 1 },
    ],
    "action",
  ),
  "ogn-057-298": {
    ...spell([special("block", { target: "anyUnit" })], "action"),
    hidden: true,
  },
  "ogn-059-298": plain,
  "ogn-061-298": { ...plain, onPlay: [special("poro-herder")] },
  "ogn-066-298": { ...plain, onHold: [{ type: "score", amount: 1 }] },
  "ogn-069-298": spell(
    [special("last-stand", { target: "friendlyUnit" })],
    "action",
  ),
  "ogn-073-298": {
    ...plain,
    onEnd: [
      {
        type: "readyRunes",
        amount: 4,
        chooseRunes: true,
        optional: true,
        condition: "sourceAtBattlefield",
      },
    ],
  },
  "ogn-074-298": { ...plain, shield: 1, keywords: ["Shield", "Tank"] },
  "ogn-075-298": {
    ...plain,
    accelerating: true,
    onDeath: [
      { type: "channel", amount: 2 },
      { type: "draw", amount: 1 },
    ],
  },
  "ogn-076-298": {
    ...plain,
    onAttack: [special("might-damage", { target: "enemyUnitHere" })],
  },
  "ogn-082-298": {
    ...plain,
    onPlay: [{ type: "might", amount: 8, target: "anyUnit" }],
  },
  "ogn-091-298": plain,
  "ogn-092-298": {
    ...plain,
    onPlay: [{ type: "damage", amount: 6, target: "enemyUnitAtBattlefield" }],
  },
  "ogn-097-298": {
    ...plain,
    hidden: true,
    onPlay: [{ type: "might", amount: -2, minMight: 1, target: "anyUnit" }],
  },
  "ogn-098-298": {
    ...plain,
    abilities: [
      {
        label: "Add 1 Energy",
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "energy", amount: 1 }],
      },
    ],
  },
  "ogn-099-298": {
    ...plain,
    abilities: [
      {
        label: "Recycle 3 from trash to draw 1",
        energy: 1,
        exhaust: true,
        recycleCost: 3,
        effects: [{ type: "draw", amount: 1 }],
      },
    ],
  },
  "ogn-104-298": spell(
    [
      { type: "bounce", target: "friendlyUnit" },
      { type: "channel", amount: 1 },
    ],
    "reaction",
  ),
  "ogn-106-298": {
    ...plain,
    onPlay: [
      { type: "token", cardName: "Sprite", ready: true, location: "here" },
    ],
  },
  "ogn-116-298": { ...plain, accelerating: true, onPlay: [special("watcher")] },
  "ogn-119-298": {
    ...plain,
    onAttack: [
      { type: "might", amount: -2, minMight: 1, target: "enemyUnitHere" },
    ],
    onDefend: [
      { type: "might", amount: -2, minMight: 1, target: "enemyUnitHere" },
    ],
  },
  "ogn-123-298": spell([special("unchecked-power")]),
  "ogn-124-298": {
    ...plain,
    abilities: [
      {
        label: "Buff an exhausted friendly unit",
        exhaust: true,
        effects: [{ type: "buff", target: "friendlyExhaustedUnit" }],
      },
    ],
  },
  "ogn-133-298": spell(
    [
      {
        type: "damageAll",
        who: "all",
        amount: 1,
        condition: "allBattlefields",
      },
    ],
    "reaction",
  ),
  "ogn-138-298": spell([special("catalyst")]),
  "ogn-140-298": plain,
  "ogn-143-298": plain,
  "ogn-144-298": spell([{ type: "draw", amount: 2 }], "reaction"),
  "ogn-148-298": { ...plain, onAttack: [special("anivia")] },
  "ogn-149-298": {
    ...plain,
    onPlay: [special("snapvine", { target: "enemyUnitAtBattlefield" })],
  },
  "ogn-159-298": {
    ...plain,
    keywords: ["Enters ready"],
    onAttack: [special("warwick")],
  },
  "ogn-164-298": {
    ...plain,
    onPlay: [self("buff")],
    onConquer: [self("buff")],
    abilities: [
      {
        label: "Spend my buff for +4 Might",
        spendBuff: true,
        effects: [self("might", 4)],
      },
    ],
  },
  "ogn-172-298": spell(
    [{ type: "bounce", target: "unitAtBattlefield" }],
    "action",
  ),
  "ogn-190-298": { ...plain, onDeath: [special("kogmaw")] },
  "ogn-197-298": { ...plain, hidden: true, onPlay: [self("might", 3)] },
  "ogn-201-298": spell([special("invert-timelines")]),
  "ogn-217-298": { ...plain, onPlay: [special("legion-buff")] },
  "ogn-218-298": { ...plain, onPlay: [special("legion-recruits")] },
  "ogn-223-298": { ...plain, onPlay: [special("peak-guardian")] },
  "ogn-225-298": {
    ...plain,
    onPlay: [special("solari-chief", { target: "enemyUnit" })],
  },
  "ogn-234-298": { ...plain, onPlay: [{ type: "kill", target: "enemyUnit" }] },
  "ogn-238-298": {
    ...plain,
    shield: 1,
    keywords: ["Shield"],
    onAttack: [{ type: "stun", target: "enemyUnitHere" }],
  },
  "ogn-239-298": { ...plain, onDeath: [special("evangel")] },
  "ogn-240-298": { ...plain, keywords: ["Tank"] },
  "ogn-243-298": { ...plain, onPlay: [special("legion-ready")] },
  "ogn-246-298": plain,
  "ogn-272-298": plain,
  "ogn-273-298": plain,
  "ogn-297-298": plain,
};

type OriginsState = GameState & {
  originsEnemyDeaths?: Partial<Record<PlayerId, number>>;
};
const allies = (s: GameState, p: PlayerId) =>
  s.units.filter((u) => u.owner === p);
const sameSideHere = (s: GameState, u: Unit, cardId: string) =>
  textUnits(s).filter(
    (v) =>
      v.id !== u.id &&
      v.owner === u.owner &&
      v.location === u.location &&
      ruleFamily(v.cardId) === cardId,
  );
const nearVictory = (s: GameState, p: PlayerId) =>
  s.players[p === 0 ? 1 : 0].points >= 5;

export const originsExtraModule: ExpansionModule = {
  might(s, u, value) {
    for (const textSource of textSources(s, u)) {
      const u = textSource;
      if (u.cardId === "ogn-028-298") value += s.players[u.owner].points;
    }
    for (const textSource of textSources(s, u)) {
      const u = textSource;
      if (u.cardId === "ogn-240-298" && u.location.startsWith("field:"))
        value += allies(s, u.owner).filter(
          (v) => v.location === u.location && v.buff > 0,
        ).length;
    }
    value += sameSideHere(s, u, "ogn-243-298").length;
    if (
      s.combat &&
      (s.combat.engaged ?? true) &&
      s.combat.fieldId === u.location
    ) {
      if (u.owner === s.combat.attacker)
        value += sameSideHere(s, u, "ogn-015-298").length;
      if (u.owner === s.combat.defender) {
        value += sameSideHere(s, u, "ogn-074-298").length;
        value +=
          (u.temporaryKeywords ?? []).filter((k) => k === "OGN Block Shield 3")
            .length * 3;
      }
    }
    return value;
  },
  keywords(s, u) {
    const result: string[] = [];
    if (sameSideHere(s, u, "ogn-015-298").length) result.push("Assault");
    if (sameSideHere(s, u, "ogn-074-298").length) result.push("Shield");
    return result;
  },
  cost(s, p, card, ctx) {
    let energy = 0;
    if (card.id === "ogn-014-298" && ctx)
      energy -= Math.max(0, ...allies(s, p).map((u) => ctx.getMight(s, u)));
    if (card.id === "ogn-047-298" && nearVictory(s, p)) energy -= 2;
    if (
      card.id === "ogn-144-298" &&
      (s as OriginsState).originsEnemyDeaths?.[p] === s.turn
    )
      energy -= 2;
    if (isCardType(card, "Unit") && card.tags.includes("Dragon")) {
      const reduction =
        2 *
        allies(s, p)
          .flatMap((u) => textSources(s, u))
          .filter((u) => u.cardId === "ogn-140-298").length;
      energy -= Math.min(Math.max(0, (card.energy ?? 0) - 1), reduction);
    }
    return { energy };
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("ogn-extra:")) return false;
    const source =
      abilityUnit(s, ctx.sourceId, ctx.abilityInstance) ?? ctx.lastUnit;
    const target = s.units.find((u) => u.id === ctx.targetId);
    const run = (effects: Effect[], targetId = ctx.targetId) =>
      ctx.runEffects(s, p, effects, targetId, ctx.sourceId, ctx.locationId);
    const legion = s.players[p].cardsPlayedThisTurn >= 2;
    switch (e.custom.slice("ogn-extra:".length)) {
      case "legion-loot":
        if (legion)
          run([
            { type: "discard", amount: 2 },
            { type: "draw", amount: 2 },
          ]);
        break;
      case "kill-all-gear":
        for (const g of [...s.gears]) ctx.killGear(s, g.id);
        break;
      case "mighty-draw":
        ctx.draw(
          s,
          p,
          allies(s, p).filter((u) => ctx.getMight(s, u) >= 5).length,
        );
        break;
      case "clockwork-draw":
        if (ctx.paidAdditionalCost || source?.additionalCostPaid)
          ctx.draw(s, p, 1);
        break;
      case "block":
        if (target)
          (target.temporaryKeywords ??= []).push("Tank", "OGN Block Shield 3");
        break;
      case "poro-herder":
        if (source && allies(s, p).some((u) => getUnitTags(u).includes("Poro")))
          run([self("buff"), { type: "draw", amount: 1 }]);
        break;
      case "last-stand":
        if (target) {
          target.temporaryMight += ctx.getMight(s, target);
          target.temporary = true;
        }
        break;
      case "might-damage":
        if (source && target)
          run([
            {
              type: "damage",
              amount: ctx.getMight(s, source),
              target: "enemyUnitHere",
            },
          ]);
        break;
      case "watcher": {
        // Snapshot every reduction before applying any: defeated aura sources must
        // not change another unit's reduction partway through this instruction.
        const changes = s.units
          .filter((u) => u.owner !== p)
          .map((u) => ({
            unit: u,
            amount: Math.min(0, Math.max(-3, 1 - ctx.getMight(s, u))),
          }));
        for (const { unit, amount } of changes) unit.temporaryMight += amount;
        break;
      }
      case "unchecked-power":
        for (const u of allies(s, p)) u.ready = false;
        run([
          {
            type: "damageAll",
            amount: 12,
            who: "all",
            condition: "allBattlefields",
          },
        ]);
        break;
      case "catalyst": {
        const count = Math.min(2, s.players[p].runeDeck.length);
        ctx.channel(s, p, 2, false);
        if (count < 2) ctx.draw(s, p, 1);
        break;
      }
      case "anivia":
        if (source)
          run(
            [{ type: "damageAll", amount: 3, who: "opponent" }],
            source.location,
          );
        break;
      case "snapvine":
        if (source && target)
          run([{ type: "duel", target: "duel" }], `${source.id}~${target.id}`);
        break;
      case "warwick":
        if (source)
          ctx.killUnits(
            s,
            s.units
              .filter(
                (u) =>
                  u.owner !== p &&
                  u.location === source.location &&
                  u.damage > 0,
              )
              .map((u) => u.id),
          );
        break;
      case "kogmaw":
        if (ctx.locationId?.startsWith("field:"))
          run([{ type: "damageAll", amount: 4, who: "all" }], ctx.locationId);
        break;
      case "invert-timelines":
        for (const owner of [p, p === 0 ? 1 : 0] as const) {
          const hand = [...s.players[owner].hand];
          s.players[owner].hand = [];
          ctx.discardCards(s, owner, hand);
        }
        for (const owner of [p, p === 0 ? 1 : 0] as const)
          ctx.draw(s, owner, 4);
        break;
      case "legion-buff":
        if (legion) run([self("buff")]);
        break;
      case "legion-recruits":
        if (legion) run([{ type: "token", amount: 2, location: "here" }]);
        break;
      case "legion-ready":
        if (legion) run([self("ready")]);
        break;
      case "peak-guardian":
        if (source) {
          run([self("buff")]);
          if (source.location.startsWith("field:"))
            for (const u of allies(s, p).filter(
              (u) => u.id !== source.id && u.location === source.location,
            ))
              run([{ type: "buff" }], u.id);
        }
        break;
      case "solari-chief":
        if (target)
          run([
            { type: target.stunned ? "kill" : "stun", target: "enemyUnit" },
          ]);
        break;
      case "evangel":
      case "viktor-recruit":
        for (let i = 0; i < (e.custom.endsWith("evangel") ? 3 : 1); i++)
          ctx.spawnToken(s, p, "Recruit", `base:${p}`, false);
        break;
      default:
        throw new Error(`Unknown Origins effect: ${e.custom}`);
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const affected = s.units.find((u) => u.id === sourceId);
    const triggerSelf = (u: Unit, effects: Effect[]) =>
      ctx.trigger(
        s,
        u.owner,
        u.cardId,
        u.id,
        textEffects(u, effects),
        u.location,
      );
    if (event === "play") {
      if (cardId === "ogn-017-298") {
        const gear = s.gears.find((g) => g.id === sourceId);
        if (gear) gear.ready = false;
      }
      if (isCardType(getCard(cardId), "Gear"))
        for (const u of allies(s, p)
          .flatMap((u) => textSources(s, u))
          .filter((u) => u.cardId === "ogn-091-298"))
          triggerSelf(u, [self("ready")]);
    }
    if (event === "play" && ctx.playOrdinal === 2)
      for (const u of allies(s, p)
        .flatMap((u) => textSources(s, u))
        .filter((u) => u.cardId === "ogn-027-298"))
        triggerSelf(u, [self("might", 2), self("ready")]);
    if (event === "stun" && affected && affected.owner !== p)
      for (const u of allies(s, p)
        .flatMap((u) => textSources(s, u))
        .filter((u) => u.cardId === "ogn-059-298"))
        triggerSelf(u, [self("ready"), self("might", 1)]);
    if (event === "ready" && affected)
      for (const g of s.gears.filter(
        (g) => g.owner === affected.owner && g.cardId === "ogn-143-298",
      ))
        ctx.trigger(
          s,
          affected.owner,
          g.cardId,
          g.id,
          textEffects(g, [
            { type: "might", amount: 1, chosenTargetId: affected.id },
          ]),
          affected.location,
        );
    if (event === "death" && affected) {
      ((s as OriginsState).originsEnemyDeaths ??= {})[p === 0 ? 1 : 0] = s.turn;
      if (!getCard(cardId).name.startsWith("Recruit"))
        for (const u of allies(s, p)
          .flatMap((u) => textSources(s, u))
          .filter(
            (u) =>
              u.id !== affected.id &&
              u.cardId === "ogn-246-298" &&
              !ctx.dyingUnitIds?.includes(u.id),
          ))
          triggerSelf(u, [special("viktor-recruit")]);
    }
  },
};
