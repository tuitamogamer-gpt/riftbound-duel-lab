import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { recycleCards, recycleRunes } from "./zone-events";
import { cards, getCard } from "../data/cards";
import { disempower, getUnitTags, isFace } from "./board-rules";
import { instructedPlay } from "./card-wave13";
import { takeTrash, trashCards } from "./trash";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
} from "./types";
const plain: CardScript = { implemented: true };
const fx = (key: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave15:${key}`,
  ...rest,
});
const ability = (
  p: PlayerId,
  id: string,
  label: string,
  effects: Effect[],
  targetId?: string,
): GameAction => ({
  id: `choose-custom:wave15:${id}`,
  player: p,
  category: "ability",
  label,
  effects,
  targetId,
});
const skip = (p: PlayerId) => ability(p, "skip", "Decline", []);
const choose = (
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: GameAction[],
) =>
  ctx.openChoice(s, p, {
    options,
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
  });
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const tribes = ["Bird", "Cat", "Dog", "Poro"];
export const cardWave15Scripts: Record<string, CardScript> = {
  "ogn-072-298": plain,
  "ogn-113-298": plain,
  "ogn-115-298": {
    ...plain,
    spell: [
      instructedPlay({ zone: "top", count: 5, ignoreEnergy: true }),
      instructedPlay(
        { zone: "top", count: 5, ignoreEnergy: true },
        { who: "opponent" },
      ),
    ],
  },
  "ogn-122-298": { ...plain, spell: [fx("time-warp")] },
  "ogn-177-298": plain,
  "ogn-181-298": {
    ...plain,
    abilities: [
      {
        label: "Return another friendly card to hand",
        exhaust: true,
        effects: [
          fx("pack", {
            target: "boardCards",
            who: "self",
            cardTypes: ["Unit", "Gear", "Hidden"],
            targetCount: 1,
            excludeSource: true,
          }),
        ],
      },
    ],
  },
  "ogn-200-298": { ...plain, onAttack: [fx("twisted-fate")] },
  "ogn-242-298": {
    ...plain,
    abilities: [
      {
        label: "Kill a unit and find a replacement",
        energy: 1,
        power: 1,
        domain: "Order",
        exhaust: true,
        effects: [fx("baited-hook", { target: "friendlyUnit" })],
      },
    ],
  },
  "ogn-252-298": {
    ...plain,
    spell: [{ type: "damage", amount: 5, target: "anyUnit" }],
  },
  "ogn-258-298": {
    ...plain,
    spell: [fx("dragons-rage", { target: "enemyMoveDestination" })],
  },
  "ogn-262-298": {
    ...plain,
    action: true,
    spell: [fx("zenith", { target: "enemyAndOptionalFriendly" })],
  },
  "ogn-268-298": {
    ...plain,
    action: true,
    spell: [fx("bullet-time", { target: "battlefield" })],
  },
  "sfd-184-221": {
    ...plain,
    action: true,
    spell: [fx("relentless", { target: "relentlessMove" })],
  },
  "sfd-200-221": {
    ...plain,
    action: true,
    spell: [fx("arcane-shift", { target: "friendlyAndEnemyBattlefield" })],
  },
  "sfd-207-221": {
    ...plain,
    onConquer: [
      {
        type: "token",
        cardName: "Sand Soldier",
        amount: 1,
        location: "here",
        optional: true,
        triggerCost: { energy: 1, board: "returnUnitHere" },
      },
    ],
  },
  "unl-045-219": plain,
  "unl-101-219": {
    ...plain,
    spell: [fx("call-battle", { target: "friendlyUnitAndBattlefield" })],
  },
  "unl-138-219": {
    ...plain,
    asPlayTag: "any",
    abilities: [
      {
        label: "Give a unit with the named tag -2 Might",
        exhaust: true,
        effects: [
          {
            type: "might",
            amount: -2,
            target: "anyUnit",
            condition: "namedTag",
          },
        ],
      },
    ],
  },
  "unl-177-219": {
    ...plain,
    asPlayTag: "tribe",
    onConquer: [fx("tribes")],
    onHold: [fx("tribes")],
  },
  "unl-209-219": plain,
  "ven-082-166": {
    ...plain,
    onPlay: [
      fx("empower-target", {
        target: "empowerObject",
        optional: true,
        triggerCost: { board: "disempower" },
      }),
    ],
  },
  "ven-099-166": {
    ...plain,
    hidden: true,
    onPlay: [
      fx("tornado", {
        target: "unitHere",
        optional: true,
        condition: "playedFromHidden",
      }),
    ],
  },
  "ven-157-166": plain,
};
for (const c of cards.filter((c) => c.set === "VEN" && !c.variant)) {
  if (c.collectorNumber === 140)
    cardWave15Scripts[c.id] = {
      ...plain,
      spell: [fx("shuriken", { target: "shurikenMove" })],
      flow: { energy: 3, power: 1 },
    };
}
export const allCardTags = [...new Set(cards.flatMap((c) => c.tags))].sort();
export function triggerBoardSources(
  s: GameState,
  p: PlayerId,
  kind: NonNullable<NonNullable<Effect["triggerCost"]>["board"]>,
  locationId?: LocationId,
  sourceId?: string,
) {
  if (kind === "killThree") {
    const ids = [
      ...new Set(
        [...s.units, ...s.gears]
          .filter((o) => o.owner === p && o.id !== sourceId)
          .map((o) => o.id),
      ),
    ];
    return ids.flatMap((a, i) =>
      ids
        .slice(i + 1)
        .flatMap((b, j) =>
          ids.slice(i + j + 2).map((c) => [a, b, c].join("~")),
        ),
    );
  }
  if (kind === "disempower")
    return [...s.units, ...s.gears]
      .filter((o) => o.owner === p && o.empowered)
      .map((o) => o.id)
      .concat(s.players[p].legendEmpowered ? ["legend"] : []);
  return own(s, p)
    .filter((u) => u.location === locationId)
    .map((u) => u.id);
}
export function payTriggerBoard(
  s: GameState,
  p: PlayerId,
  kind: NonNullable<NonNullable<Effect["triggerCost"]>["board"]>,
  id: string,
  ctx: PreconContext,
) {
  if (kind === "killThree") {
    const ids = id.split("~");
    ctx.killUnits(s, ids);
    for (const id of ids)
      if (s.gears.some((g) => g.id === id)) ctx.killGear(s, id);
  } else if (kind === "disempower") {
    if (id === "legend") s.players[p].legendEmpowered = false;
    else {
      const o = [...s.units, ...s.gears].find((o) => o.id === id);
      if (o) disempower(o);
    }
  } else if (kind === "killUnitHere") ctx.killUnits(s, [id]);
  else ctx.runEffects(s, p, [{ type: "bounce", chosenTargetId: id }]);
}
export const cardWave15Module: ExpansionModule = {
  actions(s, p, ctx) {
    const available =
      !s.stack.length &&
      ((s.phase === "main" && s.currentPlayer === p) ||
        (s.phase === "showdown" && s.focusPlayer === p));
    if (!available) return [];
    const actions: GameAction[] = [];
    for (const source of own(s, p)
      .flatMap((u) => textSources(s, u))
      .filter((u) => u.ready && isFace(u.cardId, "OGN", 113)))
      for (const cost of [
        ...own(s, p),
        ...s.gears.filter((g) => g.owner === p),
      ])
        actions.push({
          id: `wave15:malzahar:${source.id}:${cost.id}`,
          player: p,
          category: "resource",
          sourceId: source.id,
          costSourceId: cost.id,
          cardId: source.cardId,
          label: `Exhaust Malzahar and kill ${getCard(cost.cardId).name}: add 2 Power`,
        });
    for (const g of s.gears.filter(
      (g) => g.owner === p && g.ready && isFace(g.cardId, "UNL", 45),
    ))
      for (const cost of own(s, p).filter((u) => u.ready))
        for (const u of own(s, p).filter((u) => u.id !== cost.id))
          actions.push({
            id: `wave15:signpost:${g.id}:${cost.id}:${u.id}`,
            player: p,
            category: "ability",
            sourceId: g.id,
            costSourceId: cost.id,
            targetId: u.id,
            cardId: g.cardId,
            label: `Exhaust ${getCard(cost.cardId).name}: move ${getCard(u.cardId).name} to its location`,
          });
    return actions;
  },
  apply(s, a, ctx) {
    if (a.id.startsWith("wave15:malzahar:")) {
      s.units.find((u) => u.id === a.sourceId)!.ready = false;
      if (s.units.some((u) => u.id === a.costSourceId))
        ctx.killUnits(s, [a.costSourceId!]);
      else ctx.killGear(s, a.costSourceId!);
      s.players[a.player].power = (s.players[a.player].power ?? 0) + 2;
      return true;
    }
    if (a.id.startsWith("wave15:signpost:")) {
      s.gears.find((g) => g.id === a.sourceId)!.ready = false;
      s.units.find((u) => u.id === a.costSourceId)!.ready = false;
      ctx.pushStack(s, {
        player: a.player,
        cardId: a.cardId!,
        sourceId: a.sourceId,
        targetId: a.targetId,
        kind: "ability",
        effects: [
          fx("signpost", { target: "friendlyUnit", cardName: a.costSourceId }),
        ],
      });
      return true;
    }
    return false;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    if (event === "move" && ctx.previousLocation) {
      const moved = s.units.find((u) => u.id === sourceId);
      if (moved)
        for (const u of own(s, moved.owner)
          .flatMap((u) => textSources(s, u))
          .filter(
            (u) =>
              u.id !== sourceId &&
              u.location === ctx.previousLocation &&
              isFace(u.cardId, "OGN", 177),
          ))
          ctx.trigger(
            s,
            u.owner,
            u.cardId,
            u.id,
            textEffects(u, [
              fx("pursuer", {
                optional: true,
                cardName: locationId,
                condition: ctx.previousLocation,
              }),
            ]),
            u.location,
          );
    }
    if (event === "conquer") {
      for (const c of trashCards(s, p).filter((c) =>
        isFace(c.cardId, "OGN", 252),
      ))
        ctx.trigger(
          s,
          p,
          c.cardId,
          c.id,
          textEffects(c, [
            fx("rocket-return", {
              optional: true,
              cardName: c.id,
              triggerCost: { discard: 1 },
            }),
          ]),
          locationId,
        );
      for (const u of own(s, p).filter(
        (u) => u.location === locationId && u.recallOnConquerTurn === s.turn,
      ))
        ctx.trigger(
          s,
          p,
          u.cardId,
          u.id,
          textEffects(u, [
            { type: "moveTarget", condition: "self", optional: true },
          ]),
          u.location,
        );
    }
    if (event === "beginning")
      for (const f of s.fields.filter((f) => isFace(f.cardId, "UNL", 209)))
        ctx.trigger(
          s,
          p,
          f.cardId,
          f.id,
          textEffects(f, [
            {
              type: "draw",
              amount: 1,
              optional: true,
              triggerCost: { board: "killUnitHere" },
            },
          ]),
          f.id,
        );
    if (event === "end")
      for (const item of (s.endDisempowers ?? []).filter(
        (d) => d.turn === s.turn,
      ))
        ctx.trigger(s, item.player, "ven-099-166", `delayed:${item.id}`, [
          fx("disempower", { cardName: item.id }),
        ]);
    if (event === "death" && sourceId) {
      const dead = s.units.find((u) => u.id === sourceId);
      if (
        dead?.stunned &&
        ctx.killer !== undefined &&
        ctx.killer !== dead.owner
      )
        for (const g of s.gears.filter(
          (g) => g.owner === ctx.killer && isFace(g.cardId, "OGN", 72),
        ))
          ctx.trigger(
            s,
            g.owner,
            g.cardId,
            g.id,
            textEffects(g, [
              {
                type: "draw",
                amount: 1,
                optional: true,
                triggerCost: { exhaust: true },
              },
            ]),
          );
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave15:")) return false;
    const x = s.players[p],
      source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance),
      target = s.units.find((u) => u.id === ctx.targetId);
    switch (e.custom.slice(7)) {
      case "call-battle": {
        const [id, to] = (ctx.targetId ?? "").split("~"),
          u = s.units.find((u) => u.id === id && u.owner === p);
        if (!s.fields.some((f) => f.id === to && f.controller === p)) break;
        if (u) ctx.moveUnit(s, u, to as LocationId, p);
        const opponent = (1 - p) as PlayerId;
        const options = own(s, opponent)
          .filter((u) => u.location !== to)
          .map((u) =>
            ability(
              opponent,
              `call-battle:${u.id}`,
              `Move ${getCard(u.cardId).name} to ${to}`,
              [fx("call-battle-move", { cardName: u.id, condition: to })],
            ),
          );
        if (options.length) choose(s, opponent, ctx, options);
        break;
      }
      case "call-battle-move": {
        const u = s.units.find((u) => u.id === e.cardName && u.owner === p);
        if (u) ctx.moveUnit(s, u, e.condition as LocationId, p);
        break;
      }
      case "time-warp":
        (s.extraTurns ??= []).push(p);
        break;
      case "pursuer":
        if (source && source.location === e.condition)
          ctx.moveUnit(s, source, e.cardName as LocationId, p);
        break;
      case "rocket-return": {
        const card = takeTrash(s, p, e.cardName!);
        if (card) x.hand.push(card);
        break;
      }
      case "pack": {
        if (target?.owner === p)
          ctx.runEffects(
            s,
            p,
            [{ type: "bounce" }],
            target.id,
            ctx.sourceId,
            ctx.locationId,
          );
        const g = s.gears.find((g) => g.id === ctx.targetId && g.owner === p);
        if (g) {
          s.gears = s.gears.filter((v) => v.id !== g.id);
          for (const u of s.units) u.gear = u.gear.filter((id) => id !== g.id);
          if (!g.token) x.hand.push(g.cardId);
          ctx.cardEvent(s, "bounce", p, g.cardId, g.id, `base:${p}`);
        }
        const h = s.hidden?.find((h) => h.id === ctx.targetId && h.owner === p);
        if (h) {
          s.hidden = s.hidden!.filter((v) => v.id !== h.id);
          x.hand.push(h.cardId);
        }
        break;
      }
      case "baited-hook": {
        const might = target && ctx.getMight(s, target);
        if (target) ctx.killUnits(s, [target.id]);
        ctx.runEffects(
          s,
          p,
          [
            instructedPlay(
              {
                zone: "top",
                count: 5,
                cardTypes: ["Unit"],
                maxMight:
                  target &&
                  !s.units.some((u) => u.id === target.id) &&
                  might !== undefined
                    ? might + 1
                    : 0,
                ignoreCost: true,
                optional: true,
              },
              {
                condition:
                  target && !s.units.some((u) => u.id === target.id)
                    ? undefined
                    : "noReplacement",
              },
            ),
          ],
          undefined,
          ctx.sourceId,
          ctx.locationId,
        );
        break;
      }
      case "bullet-time": {
        const max =
          (x.power ?? 0) +
          x.runes.length +
          Object.values(x.typedPower ?? {}).reduce((a, b) => a + b, 0);
        choose(
          s,
          p,
          ctx,
          Array.from({ length: max + 1 }, (_, i) => i)
            .filter((n) => ctx.canPay(s, p, 0, 0, [], n))
            .map((n) =>
              ability(p, `bullet:${n}`, `Pay ${n} Power; deal ${n} damage`, [
                fx("bullet-paid", { amount: n }),
              ]),
            ),
        );
        break;
      }
      case "bullet-paid":
        ctx.pay(s, p, 0, 0, [], e.amount);
        ctx.runEffects(
          s,
          p,
          [
            {
              type: "damageAll",
              amount: e.amount,
              who: "opponent",
              location: "target",
            },
          ],
          ctx.targetId,
          ctx.sourceId,
          ctx.targetId as LocationId,
        );
        break;
      case "twisted-fate": {
        const rune = x.runeDeck.shift();
        if (!rune) break;
        recycleRunes(s, p, [rune], p);
        ctx.log?.(s, `Twisted Fate reveals ${rune}.`, "info", p);
        const effects: Effect[] =
          rune === "Mind"
            ? [{ type: "draw", amount: 1 }]
            : rune === "Order"
              ? [{ type: "stun", target: "enemyUnit" }]
              : rune === "Fury"
                ? [fx("fate-damage", { target: "enemyUnitHere" })]
                : [];
        if (effects.length)
          ctx.trigger(
            s,
            p,
            "ogn-200-298",
            ctx.sourceId!,
            effects,
            ctx.locationId,
          );
        break;
      }
      case "fate-damage": {
        const here = source?.location ?? ctx.locationId;
        if (!target || target.owner === p || target.location !== here) break;
        const others = s.units.filter(
          (u) => u.owner !== p && u.location === here && u.id !== target.id,
        );
        ctx.runEffects(
          s,
          p,
          [
            {
              type: "damage",
              amount: 2,
              chosenTargetId: target.id,
              damageSource: "unit",
            },
            ...others.map(
              (u) =>
                ({
                  type: "damage",
                  amount: 1,
                  chosenTargetId: u.id,
                  damageSource: "unit",
                }) as Effect,
            ),
          ],
          undefined,
          ctx.sourceId,
          here,
        );
        break;
      }
      case "dragons-rage": {
        const [id, to] = (ctx.targetId ?? "").split("~"),
          u = s.units.find((u) => u.id === id && u.owner !== p);
        if (!u || !ctx.canTargetUnit?.(s, p, u)) break;
        ctx.moveUnit(s, u, to as LocationId, p);
        if (u.location === to)
          ctx.trigger(
            s,
            p,
            "ogn-258-298",
            `reflexive:${u.id}`,
            [
              fx("dragons-duel", {
                target: "enemyUnit",
                cardName: u.id,
                targetLocations: [u.location],
                excludeSource: true,
              }),
            ],
            u.location,
          );
        break;
      }
      case "dragons-duel": {
        const first = s.units.find((u) => u.id === e.cardName);
        if (
          first &&
          target &&
          target.id !== first.id &&
          target.owner !== p &&
          first.location === target.location
        ) {
          ctx.runEffects(
            s,
            p,
            [{ type: "duel", target: "anyTwoUnits" }],
            `${first.id}~${target.id}`,
            ctx.sourceId,
            ctx.locationId,
          );
        }
        break;
      }
      case "zenith": {
        const [enemyId, friendId] = (ctx.targetId ?? "").split("~"),
          enemy = s.units.find(
            (u) =>
              u.id === enemyId &&
              u.owner !== p &&
              u.location.startsWith("field:"),
          ),
          friend = s.units.find((u) => u.id === friendId && u.owner === p);
        if (!enemy || !ctx.canTargetUnit?.(s, p, enemy)) break;
        ctx.runEffects(
          s,
          p,
          [{ type: "stun", target: "enemyUnitAtBattlefield" }],
          enemy.id,
          ctx.sourceId,
          ctx.locationId,
        );
        if (friend) ctx.moveUnit(s, friend, enemy.location, p);
        break;
      }
      case "arcane-shift": {
        const [friendly, enemy] = (ctx.targetId ?? "").split("~");
        ctx.runEffects(
          s,
          p,
          [
            instructedPlay(
              { zone: "blink", ignoreCost: true },
              { target: "friendlyUnit", chosenTargetId: friendly },
            ),
            {
              type: "damage",
              amount: 3,
              target: "enemyUnitAtBattlefield",
              chosenTargetId: enemy,
            },
          ],
          undefined,
          ctx.sourceId,
          ctx.locationId,
        );
        break;
      }
      case "shuriken": {
        const [friendId, to, enemyId] = (ctx.targetId ?? "").split("~");
        const friend = s.units.find((u) => u.id === friendId && u.owner === p);
        if (enemyId)
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: 2, target: "enemyUnitAtBattlefield" }],
            enemyId,
            ctx.sourceId,
            ctx.locationId,
          );
        if (friend) ctx.moveUnit(s, friend, to as LocationId, p);
        break;
      }
      case "relentless": {
        const [id, to, gearId] = (ctx.targetId ?? "").split("~");
        const u = s.units.find((u) => u.id === id && u.owner === p);
        if (!u) break;
        ctx.moveUnit(s, u, to as LocationId, p);
        const gear = s.gears.find(
          (g) => g.id === gearId && g.owner === u.owner,
        );
        if (gear) ctx.runEffects(s, p, [{ type: "equip" }], u.id, gear.id);
        u.recallOnConquerTurn = s.turn;
        break;
      }
      case "attach":
        if (
          target &&
          s.gears.some((g) => g.id === e.cardName && g.owner === target.owner)
        )
          ctx.runEffects(s, p, [{ type: "equip" }], target.id, e.cardName);
        break;
      case "signpost": {
        const cost = s.units.find((u) => u.id === e.cardName);
        if (target?.owner === p && cost)
          ctx.moveUnit(s, target, cost.location, p);
        break;
      }
      case "tribes":
        if (
          tribes.every((t) => own(s, p).some((u) => getUnitTags(u).includes(t)))
        )
          ctx.runEffects(s, p, [{ type: "score", amount: 1 }]);
        break;
      case "empower-target": {
        if (ctx.targetId?.startsWith("legend:")) {
          const owner = Number(ctx.targetId.split(":")[1]) as PlayerId;
          ctx.empower!(s, owner, "legend");
        } else {
          const o = [...s.units, ...s.gears].find((o) => o.id === ctx.targetId);
          if (o) ctx.empower!(s, o.owner, o.id);
        }
        break;
      }
      case "tornado":
        if (target) {
          ctx.empower!(s, target.owner, target.id);
          (s.endDisempowers ??= []).push({
            id: target.id,
            player: target.owner,
            turn: s.turn,
          });
        }
        break;
      case "disempower": {
        const o = [...s.units, ...s.gears].find((o) => o.id === e.cardName);
        if (o) disempower(o);
        s.endDisempowers = s.endDisempowers?.filter(
          (d) => d.id !== e.cardName || d.turn !== s.turn,
        );
        break;
      }
    }
    return true;
  },
};
