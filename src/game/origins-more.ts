import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { recycleCards, recycleRunes } from "./zone-events";
import { isCardType } from "../data/cards";
import { ruleFamily } from "./rule-families";
import { takeTrashAt } from "./trash";
import { getCard } from "../data/cards";
import { getMight } from "./engine";
import { getScript } from "./scripts";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "./types";
const plain: CardScript = { implemented: true };
const effect = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `origins-more:${custom}`,
  ...extra,
});
const self = (type: Effect["type"], amount?: number): Effect => ({
  type,
  condition: "self",
  ...(amount === undefined ? {} : { amount }),
});
const spell = (
  effects: Effect[],
  timing?: "action" | "reaction",
): CardScript => ({
  ...plain,
  spell: effects,
  ...(timing ? { [timing]: true } : {}),
});
export const originsMoreScripts: Record<string, CardScript> = {
  "ogn-021-298": {
    ...plain,
    abilities: [
      {
        label: "Legion: next unit enters ready",
        exhaust: true,
        effects: [effect("sun-disc")],
      },
    ],
  },
  "ogn-031-298": { ...plain, onPlay: [effect("firebrand")] },
  "ogn-033-298": spell(
    [effect("shakedown", { target: "enemyUnit" })],
    "reaction",
  ),
  "ogn-056-298": {
    ...plain,
    onConquer: [effect("adaptatron", { target: "anyGear", optional: true })],
  },
  "ogn-063-298": {
    ...plain,
    onPlay: [{ type: "buff", target: "friendlyUnit" }],
  },
  "ogn-078-298": {
    ...plain,
    shield: 1,
    keywords: ["Shield"],
    abilities: [{ label: "Buff me", exhaust: true, effects: [self("buff")] }],
  },
  "ogn-079-298": plain,
  "ogn-100-298": { ...plain, onPlay: [{ type: "predict" }] },
  "ogn-141-298": {
    ...plain,
    onPlay: [
      effect("kinkou", { target: "upToTwoFriendlyUnits", excludeSource: true }),
    ],
  },
  "ogn-155-298": {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    onConquer: [effect("qiyana")],
  },
  "ogn-156-298": spell([effect("sabotage")]),
  "ogn-158-298": { ...plain, shield: 3, keywords: ["Shield 3", "Tank"] },
  "ogn-167-298": plain,
  "ogn-179-298": spell(
    [effect("losses", { amount: 0 }), effect("losses", { amount: 1 })],
    "action",
  ),
  "ogn-183-298": spell([effect("stacked-deck")], "action"),
  "ogn-184-298": {
    ...plain,
    abilities: [
      {
        label: "Move a friendly battlefield unit to base",
        energy: 1,
        exhaust: true,
        effects: [{ type: "moveTarget", target: "friendlyUnitAtBattlefield" }],
      },
    ],
  },
  "ogn-186-298": {
    ...plain,
    abilities: [
      {
        label: "Kill this",
        power: 1,
        domain: "Chaos",
        exhaust: true,
        effects: [effect("trove-kill")],
      },
    ],
  },
  "ogn-187-298": spell([effect("whirlwind")]),
  "ogn-188-298": {
    ...plain,
    onPlay: [
      { type: "bounce", target: "unitAtBattlefield", excludeSource: true },
    ],
  },
  "ogn-192-298": { ...plain, onPlay: [effect("mindsplitter")] },
  "ogn-205-298": { ...plain, keywords: ["Ganking"] },
  "ogn-224-298": spell(
    [
      { type: "kill", target: "anyGear", optional: true },
      { type: "draw", amount: 1 },
    ],
    "action",
  ),
  "ogn-228-298": plain,
  "ogn-232-298": plain,
  "ogn-237-298": spell([{ type: "sacrifice", who: "opponent" }]),
  "ogn-253-298": plain,
  "ogn-266-298": spell(
    [effect("siphon", { target: "battlefield" })],
    "reaction",
  ),
  "ogn-267-298": {
    ...plain,
    abilities: [
      {
        label: "Grant Ganking this turn",
        exhaust: true,
        effects: [{ type: "keyword", keyword: "Ganking", target: "anyUnit" }],
      },
    ],
  },
  "ogn-277-298": plain,
  "ogn-281-298": { ...plain, onHold: [effect("tomb", { optional: true })] },
  "ogn-283-298": { ...plain, onHold: [{ type: "buff", target: "unitHere" }] },
  "ogn-284-298": plain,
  "ogn-290-298": plain,
  "ogn-291-298": { ...plain, onConquer: [effect("candlelit")] },
  "sfd-088-221": {
    ...plain,
    abilities: [
      {
        label: "Draw 1",
        energy: 1,
        power: 1,
        domain: "Mind",
        condition: "sourceAtBattlefield",
        effects: [{ type: "draw", amount: 1 }],
      },
      {
        label: "Score 1 point",
        energy: 4,
        power: 4,
        domain: "Mind",
        exhaust: true,
        condition: "sourceAtBattlefield",
        effects: [{ type: "score", amount: 1 }],
      },
    ],
  },
  "sfd-104-221": { ...plain, keywords: ["Temporary"] },
  "sfd-121-221": plain,
  "sfd-123-221": {
    ...plain,
    onMove: [{ type: "discard", amount: 1, condition: "atBattlefield" }],
  },
  "sfd-137-221": plain,
  "sfd-138-221": {
    ...plain,
    hidden: true,
    onPlay: [
      {
        type: "bounce",
        target: "unitAtBattlefield",
        maxMight: 3,
        excludeSource: true,
        optional: true,
      },
    ],
  },
  "sfd-151-221": {
    ...spell(
      [{ type: "might", amount: 1, target: "twoFriendlyUnits" }],
      "reaction",
    ),
    repeat: { energy: 2 },
  },
};
type State = GameState & {
  originsNextReady?: Partial<Record<PlayerId, number>>;
  originsNextSpellDiscount?: Partial<
    Record<PlayerId, { turn: number; amount: number }>
  >;
  originsMoveCounts?: Record<string, { turn: number; count: number }>;
};
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
function option(
  p: PlayerId,
  key: string,
  label: string,
  effects: Effect[],
  extra: Partial<GameAction> = {},
): GameAction {
  return {
    id: `choose-custom:origins-more:${key}`,
    player: p,
    label,
    category: "ability",
    effects,
    ...extra,
  };
}
function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: GameAction[],
  optional = false,
) {
  if (!options.length) return;
  ctx.openChoice(s, p, {
    options: [
      ...options,
      ...(optional
        ? [option(p, "decline", "Decline optional effect", [])]
        : []),
    ],
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
  });
}
export const originsMoreModule: ExpansionModule = {
  might(s, u, value) {
    if (u.stunned) {
      const count = textUnits(s).filter(
        (v) =>
          v.owner !== u.owner &&
          v.location === u.location &&
          v.cardId === "ogn-079-298",
      ).length;
      if (count) value = Math.max(1, value - 8 * count);
    }
    for (const textSource of textSources(s, u)) {
      const u = textSource;
      if (
        u.cardId === "ogn-232-298" &&
        value >= 5 &&
        s.combat &&
        (s.combat.engaged ?? true) &&
        s.combat.fieldId === u.location &&
        s.combat.defender === u.owner
      )
        value++;
    }
    return value;
  },
  keywords(s, u) {
    const result: string[] = [];
    if (
      u.buff &&
      s.gears.some((g) => g.owner === u.owner && g.cardId === "ogn-063-298")
    )
      result.push("Deflect if absent");
    for (const g of s.gears.filter(
      (g) => g.owner === u.owner && g.cardId === "sfd-104-221",
    ))
      result.push("Deflect");
    for (const textSource of textSources(s, u)) {
      const u = textSource;
      if (u.cardId === "ogn-232-298" && getMight(s, u) >= 5)
        result.push("Deflect", "Ganking", "Shield");
    }
    return result;
  },
  cost(s, p, card) {
    const discount = (s as State).originsNextSpellDiscount?.[p];
    return isCardType(card, "Spell") && discount?.turn === s.turn
      ? { energy: -discount.amount }
      : {};
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("origins-more:")) return false;
    const key = e.custom.slice("origins-more:".length),
      source =
        abilityUnit(s, ctx.sourceId, ctx.abilityInstance) ?? ctx.lastUnit;
    const target = s.units.find((u) => u.id === ctx.targetId);
    const run = (effects: Effect[], targetId = ctx.targetId) =>
      ctx.runEffects(s, p, effects, targetId, ctx.sourceId, ctx.locationId);
    switch (key) {
      case "sun-disc":
        if (s.players[p].cardsPlayedThisTurn > 0)
          ((s as State).originsNextReady ??= {})[p] = s.turn;
        break;
      case "firebrand": {
        const map = ((s as State).originsNextSpellDiscount ??= {}),
          old = map[p];
        map[p] = {
          turn: s.turn,
          amount: (old?.turn === s.turn ? old.amount : 0) + 5,
        };
        break;
      }
      case "shakedown":
        if (target)
          choose(s, target.owner, ctx, [
            option(target.owner, "shakedown-draw", "Let opponent draw 2", [
              effect("shakedown-draw", { amount: p }),
            ]),
            option(target.owner, "shakedown-damage", "Take 6 damage", [
              effect("shakedown-damage", { amount: p, cardName: target.id }),
            ]),
          ]);
        break;
      case "shakedown-draw":
        ctx.draw(s, e.amount as PlayerId, 2);
        break;
      case "shakedown-damage":
        ctx.runEffects(
          s,
          e.amount as PlayerId,
          [{ type: "damage", amount: 6 }],
          e.cardName,
          ctx.sourceId,
          ctx.locationId,
        );
        break;
      case "adaptatron": {
        const g = s.gears.find((g) => g.id === ctx.targetId);
        if (g) {
          ctx.killGear(s, g.id);
          if (source) run([self("buff")]);
        }
        break;
      }
      case "kinkou":
        run(
          (ctx.targetId ?? "")
            .split("~")
            .filter((id) =>
              s.units.some(
                (u) => u.id === id && u.owner === p && u.id !== ctx.sourceId,
              ),
            )
            .map((id) => ({ type: "buff", chosenTargetId: id })),
        );
        break;
      case "qiyana":
        choose(s, p, ctx, [
          option(p, "qiyana-draw", "Draw 1", [{ type: "draw", amount: 1 }]),
          option(p, "qiyana-channel", "Channel 1 rune exhausted", [
            { type: "channel", amount: 1 },
          ]),
        ]);
        break;
      case "sabotage":
      case "mindsplitter": {
        const opponent = other(p),
          hand = s.players[opponent].hand;
        ctx.log?.(
          s,
          `${s.players[opponent].name} reveals: ${hand.map((id) => getCard(id).name).join(", ") || "empty hand"}.`,
          "info",
          p,
        );
        choose(
          s,
          p,
          ctx,
          hand.flatMap((cardId, index) =>
            key === "sabotage" && isCardType(getCard(cardId), "Unit")
              ? []
              : [
                  option(
                    p,
                    `hand:${index}`,
                    `${key === "sabotage" ? "Recycle" : "Discard"} ${getCard(cardId).name}`,
                    [
                      effect("hand-selected", {
                        amount: index,
                        cardName: cardId,
                        condition: key,
                      }),
                    ],
                  ),
                ],
          ),
        );
        break;
      }
      case "hand-selected": {
        const opponent = other(p),
          hand = s.players[opponent].hand;
        if (hand[e.amount!] === e.cardName) {
          const [card] = hand.splice(e.amount!, 1);
          if (e.condition === "sabotage") recycleCards(s, opponent, [card], p);
          else ctx.discardCards(s, opponent, [card]);
        }
        break;
      }
      case "losses": {
        const owner = e.amount === 0 ? p : other(p);
        choose(
          s,
          owner,
          ctx,
          s.gears
            .filter((g) => g.owner === owner)
            .map((g) =>
              option(
                owner,
                `sacrifice:${g.id}`,
                `Kill ${getCard(g.cardId).name}`,
                [effect("kill-gear", { cardName: g.id })],
              ),
            ),
        );
        break;
      }
      case "kill-gear":
        if (e.cardName) ctx.killGear(s, e.cardName);
        break;
      case "trove-kill":
        if (ctx.sourceId) ctx.killGear(s, ctx.sourceId);
        break;
      case "whirlwind":
      case "whirlwind-next": {
        const original = key === "whirlwind" ? p : (e.amount as PlayerId);
        const owner = key === "whirlwind" ? other(original) : original;
        const after: Effect[] =
          key === "whirlwind"
            ? [effect("whirlwind-next", { amount: original })]
            : [];
        const options = s.units.map((u) =>
          option(
            owner,
            `whirlwind:${u.id}`,
            `Return ${getCard(u.cardId).name} to hand`,
            [effect("whirlwind-return", { cardName: u.id }), ...after],
          ),
        );
        options.push(
          option(owner, "whirlwind-decline", "Decline returning a unit", after),
        );
        choose(s, owner, ctx, options);
        break;
      }
      case "whirlwind-return":
        run([{ type: "bounce" }], e.cardName);
        break;
      case "stacked-deck": {
        const top = s.players[p].deck.slice(0, e.lookCount ?? 3);
        choose(
          s,
          p,
          ctx,
          top.map((cardId, index) =>
            option(
              p,
              `stacked:${index}`,
              `Put ${getCard(cardId).name} in hand`,
              [effect("stacked-selected", { amount: index })],
            ),
          ),
        );
        break;
      }
      case "stacked-selected": {
        const top = s.players[p].deck.splice(0, e.lookCount ?? 3),
          index = e.amount ?? 0;
        if (top[index]) s.players[p].hand.push(top.splice(index, 1)[0]);
        recycleCards(s, p, [...ctx.shuffle!(s, top)], p);
        break;
      }
      case "candlelit": {
        const top = s.players[p].deck.slice(0, e.lookCount ?? 2);
        if (top.length)
          choose(s, p, ctx, [
            option(p, "candle-keep", "Keep cards in the same order", [
              effect("candle-selected", { amount: 0 }),
            ]),
            ...(top.length > 1
              ? [
                  option(p, "candle-reverse", "Reverse the top cards", [
                    effect("candle-selected", { amount: 1 }),
                  ]),
                ]
              : []),
            option(
              p,
              "candle-first",
              `Keep ${getCard(top[0]).name}; recycle the other`,
              [effect("candle-selected", { amount: 2 })],
            ),
            ...(top.length > 1
              ? [
                  option(
                    p,
                    "candle-second",
                    `Keep ${getCard(top[1]).name}; recycle the other`,
                    [effect("candle-selected", { amount: 3 })],
                  ),
                ]
              : []),
            option(p, "candle-none", "Recycle all inspected cards", [
              effect("candle-selected", { amount: 4 }),
            ]),
          ]);
        break;
      }
      case "candle-selected": {
        const top = s.players[p].deck.splice(0, e.lookCount ?? 2),
          mode = e.amount ?? 0;
        const kept =
          mode === 0
            ? top
            : mode === 1
              ? [...top].reverse()
              : mode === 2
                ? top.slice(0, 1)
                : mode === 3
                  ? top.slice(1)
                  : [];
        const recycled =
          mode <= 1
            ? []
            : mode === 2
              ? top.slice(1)
              : mode === 3
                ? top.slice(0, 1)
                : top;
        s.players[p].deck = [
          ...kept,
          ...s.players[p].deck,
          ...ctx.shuffle!(s, recycled),
        ];
        break;
      }
      case "siphon": {
        const changes = s.units
          .filter((u) => u.location === ctx.targetId)
          .map((u) => ({
            u,
            n:
              u.owner === p
                ? 1
                : Math.min(0, Math.max(-1, 1 - ctx.getMight(s, u))),
          }));
        for (const { u, n } of changes) u.temporaryMight += n;
        break;
      }
      case "tomb": {
        const x = s.players[p],
          i = x.discard.indexOf(x.championId);
        if (!x.championAvailable && i >= 0) {
          takeTrashAt(s, p, i);
          x.championAvailable = true;
        }
        break;
      }
      case "obelisk":
        ctx.channel(s, p, 1, true);
        break;
      case "gold":
        ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
        break;
      default:
        throw new Error(`Unknown Origins extra effect: ${e.custom}`);
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const u = s.units.find((u) => u.id === sourceId);
    const trigger = (source: Unit, effects: Effect[]) =>
      ctx.trigger(
        s,
        source.owner,
        source.cardId,
        source.id,
        textEffects(source, effects),
        source.location,
      );
    if (event === "unitPlayed" && u) {
      if ((s as State).originsNextReady?.[p] === s.turn) {
        u.ready = true;
        delete (s as State).originsNextReady![p];
      }
      if (u.cardId === "ogn-079-298" && s.players[other(p)].points >= 5)
        u.ready = true;
      for (const seer of own(s, p)
        .flatMap((u) => textSources(s, u))
        .filter((v) => v.id !== u.id && v.cardId === "ogn-100-298"))
        ctx.trigger(
          s,
          p,
          seer.cardId,
          u.id,
          textEffects(u, [{ type: "predict" }]),
          u.location,
        );
    }
    if (event === "cardFinalized" && isCardType(getCard(cardId), "Spell"))
      delete (s as State).originsNextSpellDiscount?.[p];
    if (event === "play" && ctx.fromHidden) {
      for (const monk of own(s, p)
        .flatMap((u) => textSources(s, u))
        .filter((v) => v.cardId === "ogn-167-298"))
        trigger(monk, [self("might", 2)]);
      for (const broker of own(s, p)
        .flatMap((u) => textSources(s, u))
        .filter((v) => v.cardId === "sfd-121-221"))
        trigger(broker, [effect("gold")]);
    }
    if (event === "move" && u) {
      for (const bear of textUnits(s).filter(
        (v) =>
          v.owner !== p &&
          v.cardId === "ogn-158-298" &&
          v.location !== locationId,
      ))
        if (locationId?.startsWith("field:"))
          trigger(bear, [{ type: "draw", amount: 1 }]);
      if (ruleFamily(u.cardId) === "ogn-205-298") {
        const map = ((s as State).originsMoveCounts ??= {}),
          old = map[u.id];
        map[u.id] = {
          turn: s.turn,
          count: (old?.turn === s.turn ? old.count : 0) + 1,
        };
        if (map[u.id].count === 3) trigger(u, [{ type: "score", amount: 1 }]);
      }
      if (
        u.cardId === "sfd-137-221" &&
        ctx.previousLocation?.startsWith("field:")
      )
        trigger(u, [self("might", 2)]);
      if (
        s.fields.find((f) => f.id === ctx.previousLocation)?.cardId ===
        "ogn-277-298"
      )
        trigger(u, [self("might", 1)]);
    }
    if (
      (event === "death" || event === "bounce" || event === "banish") &&
      cardId === "ogn-186-298"
    )
      ctx.trigger(
        s,
        p,
        cardId,
        sourceId!,
        [
          { type: "draw", amount: 1 },
          { type: "channel", amount: 1 },
        ],
        locationId,
      );
    if (
      event === "death" &&
      u?.buff &&
      s.units.some(
        (v) =>
          v.owner === u.owner &&
          v.id !== u.id &&
          !ctx.dyingUnitIds?.includes(v.id),
      )
    ) {
      for (const gear of s.gears.filter(
        (g) => g.owner === u.owner && g.cardId === "ogn-228-298",
      ))
        ctx.trigger(
          s,
          u.owner,
          gear.cardId,
          gear.id,
          textEffects(gear, [{ type: "buff", target: "friendlyUnit" }]),
          `base:${u.owner}`,
        );
    }
    if (event === "combatEnd" && s.combat?.engaged && locationId) {
      const survivors = s.units.filter((v) => v.location === locationId);
      for (const enforcer of survivors.filter(
        (v) => v.cardId === "sfd-123-221",
      ))
        if (survivors.every((v) => v.owner === enforcer.owner))
          trigger(enforcer, [{ type: "draw", amount: 1 }]);
    }
    if (event === "beginning" && !s.players[p].hasBegun)
      for (const field of s.fields) {
        if (field.cardId === "ogn-284-298")
          ctx.trigger(
            s,
            p,
            field.cardId,
            field.id,
            textEffects(field, [effect("obelisk")]),
            field.id,
          );
        if (field.cardId === "ogn-290-298")
          ctx.trigger(
            s,
            p,
            field.cardId,
            field.id,
            textEffects(field, [{ type: "score", amount: 1 }]),
            field.id,
          );
      }
  },
  actions(s, p) {
    if (
      s.players[p].legendId !== "ogn-253-298" ||
      s.players[p].legendUsedTurn >= 0 ||
      !s.players[p].cardsPlayedThisTurn
    )
      return [];
    return [
      {
        id: "origins-more:darius-energy",
        category: "resource",
        player: p,
        sourceId: "legend",
        cardId: "ogn-253-298",
        label: "Exhaust Darius: add 1 Energy",
      },
    ];
  },
  apply(s, a) {
    if (a.id !== "origins-more:darius-energy") return false;
    s.players[a.player].legendUsedTurn = s.turn;
    s.players[a.player].energy++;
    return true;
  },
};
