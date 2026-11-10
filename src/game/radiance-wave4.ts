import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import { useOncePerTurn } from "./radiance-rules";
import { textSources } from "./text-sources";
import { trashCards } from "./trash";
import type { CardScript, Effect, GameState, PlayerId, Unit } from "./types";
import { recycleCards } from "./zone-events";

/**
 * Radiance wave 4: the Seraphine Showdown list (exhaustion, Show Off, base
 * Might changes, Predict N) and Starry-Eyed Songstress's additional cost,
 * which the core play generator offers.
 */
const plain: CardScript = { implemented: true };
export const rd4 = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `radiance4:${custom}`,
  ...extra,
});
const recruit: Effect = { type: "token", amount: 1, location: "base" };
const encoreModes: { label: string; effects: Effect[] }[] = [
  {
    label: "Deal 2 to a unit",
    effects: [{ type: "damage", amount: 2, target: "anyUnit" }],
  },
  {
    label: "Play two 1 Might Recruit unit tokens",
    effects: [{ type: "token", amount: 2 }],
  },
  {
    label: "Give up to two units each +1 Might this turn",
    effects: [rd4("encore-might", { target: "upToTwoUnits" })],
  },
  {
    label: "Look at the top 2 cards: draw 1, recycle the other",
    effects: [rd4("encore-look")],
  },
];

export const radianceWave4Scripts: Record<string, CardScript> = {
  // Fanfare: the next three times you play a unit this turn, draw 1.
  "rad-047-167": { ...plain, spell: [rd4("fanfare")] },
  // High Note: [Reaction] -Might equal to the exhausted units you control.
  "rad-048-167": {
    ...plain,
    reaction: true,
    spell: [rd4("high-note", { target: "anyUnit" })],
  },
  // Strigian Oracle: when I become exhausted, [Predict].
  "rad-053-167": plain,
  // Piltovan Guidebot: base Might may become a played card's Energy cost.
  "rad-057-167": plain,
  // The Empyrean: [Show Off] a card; Predict its Power cost, then draw 2.
  "rad-060-167": {
    ...plain,
    showOff: { kind: "card", value: "power" },
    onPlay: [rd4("empyrean")],
  },
  // Seraphine, Inspiring: [Disarm 2]; once each turn, draw when exhausting 3+.
  "rad-065-167": {
    ...plain,
    keywords: ["Disarm 2"],
    onAttack: [{ type: "might", amount: -2, target: "enemyUnitHere" }],
  },
  // For Demacia!: [Reaction] friendly units at a battlefield get [Shield 2].
  "rad-117-167": {
    ...plain,
    reaction: true,
    spell: [rd4("for-demacia", { target: "battlefield" })],
  },
  // Herald of the Emperor: a friendly unit's base Might becomes 5 this turn.
  "rad-118-167": {
    ...plain,
    onPlay: [rd4("base-might", { target: "friendlyUnit", amount: 5 })],
  },
  // Meticulous Restorationist: from trash for Order Power after a 7+ card.
  "rad-120-167": plain,
  // Party Crasher: 1 less per exhausted friendly unit; [Tank].
  "rad-122-167": { ...plain, keywords: ["Tank"] },
  // Burn Away: banish a unit with 3 Might or less or a gear; [Burn 2].
  "rad-124-167": {
    ...plain,
    spellModes: [
      {
        label: "Banish a unit with 3 Might or less",
        effects: [
          rd4("banish", { target: "anyUnit", targetMaxMight: 3 }),
          { type: "mill", amount: 2 },
        ],
      },
      {
        label: "Banish a gear",
        effects: [
          rd4("banish", { target: "anyGear" }),
          { type: "mill", amount: 2 },
        ],
      },
    ],
  },
  // Dune Devourer: may kill a friendly unit to cost 2 less; [Deflect].
  "rad-125-167": {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    additionalCost: { board: { kind: "killUnit" }, energyReduction: 2 },
  },
  // Rousing Display: [Show Off] a 7+ card; two Recruits, or four.
  "rad-127-167": {
    ...plain,
    showOff: { kind: "cost7" },
    spell: [rd4("rousing")],
  },
  // Steadfast Outrider: [Tank]; +2 with two other friendly units/gear here.
  "rad-128-167": { ...plain, keywords: ["Tank"] },
  // Heimerdinger, Academy Instructor: unit tokens may become 3 Might Mechs.
  "rad-132-167": plain,
  // Seraphine, Not Alone: Recruit on play and when exhausted; +1 per exhausted ally.
  "rad-138-167": { ...plain, onPlay: [recruit] },
  // Starry-Eyed Songstress: the additional cost is offered by the play generator.
  "rad-151-167": plain,
  // Encore: choose two different modes.
  "rad-152-167": {
    ...plain,
    spell: [
      { type: "special", custom: "draft:choose-two", modes: encoreModes },
    ],
  },
  // Black Rose Sanctum: first non-token unit death here each turn: Recruit.
  "rad-159-167": plain,
  // Ruined Monastery: when you conquer here, may discard 1 to channel 1.
  "rad-166-167": { ...plain, onConquer: [rd4("monastery")] },
};

const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const has = (s: GameState, u: Unit, n: number) =>
  textSources(s, u).some((t) => isFace(t.cardId, "RAD", n));
const exhaustedFriends = (s: GameState, p: PlayerId, except?: string) =>
  s.units.filter((u) => u.owner === p && !u.ready && u.id !== except).length;
/** Fanfare: each of the next three units you play this turn draws 1. */
function fanfareDraws(s: GameState, p: PlayerId, ctx: PreconContext) {
  for (const grant of (s.radiance?.fanfare ?? []).filter(
    (g) => g.player === p && g.turn === s.turn && g.remaining > 0,
  )) {
    grant.remaining--;
    ctx.trigger(s, p, "rad-047-167", "legend", [{ type: "draw", amount: 1 }]);
  }
}
/** Set while Heimerdinger's Mech replaces a token: still one unit played. */
let replacingToken = false;

/** Predict N: look at the top N, recycle any, put the rest back in any order. */
function askPredict(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  n: number,
  decisions: string,
  order: number[],
) {
  const top = s.players[p].deck.slice(0, n);
  const state = (d: string, o: number[]) => `${n}|${d}|${o.join(",")}`;
  if (decisions.length < n) {
    const card = getCard(top[decisions.length]).name;
    choices(s, p, ctx, [
      option(p, `predict:keep:${decisions.length}`, `Keep ${card}`, [
        rd4("predict-step", { cardName: state(decisions + "k", order) }),
      ]),
      option(p, `predict:recycle:${decisions.length}`, `Recycle ${card}`, [
        rd4("predict-step", { cardName: state(decisions + "r", order) }),
      ]),
    ]);
    return;
  }
  const kept = [...decisions].flatMap((d, i) => (d === "k" ? [i] : []));
  const left = kept.filter((i) => !order.includes(i));
  if (left.length > 1) {
    choices(
      s,
      p,
      ctx,
      left.map((i) =>
        option(
          p,
          `predict:top:${i}`,
          `Put ${getCard(top[i]).name} ${order.length ? "next" : "on top"}`,
          [rd4("predict-step", { cardName: state(decisions, [...order, i]) })],
        ),
      ),
    );
    return;
  }
  const final = [...order, ...left];
  const recycled = [...decisions].flatMap((d, i) => (d === "r" ? [i] : []));
  const x = s.players[p];
  x.deck = [...final.map((i) => top[i]), ...x.deck.slice(n)];
  // One recycle event for the batch ("when you recycle one or more cards").
  recycleCards(
    s,
    p,
    recycled.map((i) => top[i]),
  );
  ctx.log?.(
    s,
    `${x.name} predicts ${n}: keeps ${final.length}, recycles ${recycled.length}.`,
    "info",
    p,
  );
}
export function predictN(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  amount: number,
) {
  const n = Math.min(amount, s.players[p].deck.length);
  if (n <= 0) return;
  if (n === 1) ctx.runEffects(s, p, [{ type: "predict" }]);
  else askPredict(s, p, ctx, n, "", []);
}

/** Heimerdinger, Academy Instructor: replacement offered after a token enters. */
export function queueHeimerdinger(s: GameState, p: PlayerId, token: Unit) {
  if (
    token.cardId === "token-mech" ||
    !s.units.some(
      (u) =>
        u.owner === p &&
        u.id !== token.id &&
        u.location.startsWith("field:") &&
        isFace(u.cardId, "RAD", 132),
    )
  )
    return;
  ((s.radiance ??= {}).heimer ??= []).push({ player: p, tokenId: token.id });
}
export function drainHeimerdinger(s: GameState, ctx: PreconContext) {
  if (s.pendingChoice) return;
  const queue = s.radiance?.heimer;
  while (queue?.length) {
    const next = queue.shift()!;
    const token = s.units.find((u) => u.id === next.tokenId);
    if (!token) continue;
    choices(s, next.player, { ...ctx, sourceId: token.id }, [
      option(
        next.player,
        `heimer:${token.id}:mech`,
        `Play a 3 Might Mech instead of ${getCard(token.cardId).name}`,
        [rd4("heimer-swap", { cardName: token.id })],
      ),
      option(
        next.player,
        `heimer:${token.id}:keep`,
        `Keep ${getCard(token.cardId).name}`,
        [],
      ),
    ]);
    return;
  }
}

export const radianceWave4Module: ExpansionModule = {
  might(s, u, value) {
    let bonus = 0;
    // Seraphine, Not Alone: +1 for each other exhausted unit you control.
    if (has(s, u, 138)) bonus += exhaustedFriends(s, u.owner, u.id);
    // Steadfast Outrider: +2 with two or more other friendly units/gear at
    // its battlefield (a base is not a battlefield).
    if (has(s, u, 128) && u.location.startsWith("field:")) {
      const others =
        s.units.filter(
          (v) =>
            v.owner === u.owner && v.id !== u.id && v.location === u.location,
        ).length +
        s.gears.filter(
          (g) =>
            g.owner === u.owner &&
            !s.units.some((v) => v.id === g.id) &&
            ((g.deployedAt ?? `base:${g.owner}`) === u.location ||
              s.units.some(
                (v) => v.id === g.attachedTo && v.location === u.location,
              )),
        ).length;
      if (others >= 2) bonus += 2;
    }
    return value + bonus;
  },
  cost(s, p, card) {
    // Party Crasher: 1 less for each exhausted unit you control.
    if (isFace(card.id, "RAD", 122)) return { energy: -exhaustedFriends(s, p) };
    return {};
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    if (name === "exhausted" && sourceId) {
      const unit = s.units.find((u) => u.id === sourceId);
      if (unit && has(s, unit, 53))
        ctx.trigger(
          s,
          p,
          unit.cardId,
          unit.id,
          [{ type: "predict" }],
          unit.location,
        );
      if (unit && has(s, unit, 138))
        ctx.trigger(s, p, unit.cardId, unit.id, [recruit], unit.location);
    }
    if (name === "exhaustBatch" && (ctx.amount ?? 0) >= 3)
      for (const u of own(s, p).filter((u) => has(s, u, 65)))
        if (useOncePerTurn(s, `seraphine-inspiring:${u.id}`, p))
          ctx.trigger(s, p, u.cardId, u.id, [rd4("may-draw")], u.location);
    if (name === "play") {
      const card = getCard(cardId);
      // Piltovan Guidebot: "When you play a card" (tokens are not cards).
      const token = s.gears.some((g) => g.id === sourceId && g.token);
      for (const u of own(s, p).filter(
        (u) => !token && has(s, u, 57) && u.id !== sourceId,
      ))
        ctx.trigger(
          s,
          p,
          u.cardId,
          u.id,
          [rd4("guidebot", { amount: card.energy ?? 0 })],
          u.location,
        );
      // Fanfare.
      if (isCardType(card, "Unit")) fanfareDraws(s, p, ctx);
      // Meticulous Restorationist: play me from your trash for Order Power.
      if ((card.energy ?? 0) >= 7)
        for (const t of trashCards(s, p).filter(
          (t) => t.cardId === "rad-120-167",
        ))
          ctx.trigger(s, p, t.cardId, t.id, [
            {
              type: "playCard",
              optional: true,
              triggerCost: { power: 1, domain: "Order" },
              play: { zone: "trash", sourceRef: t.id, ignoreCost: true },
            },
          ]);
    }
    // Fanfare: a unit token is a unit you play; it raises only "unitPlayed".
    if (
      name === "unitPlayed" &&
      !replacingToken &&
      s.units.find((u) => u.id === sourceId)?.token
    )
      fanfareDraws(s, p, ctx);
    // Black Rose Sanctum: first non-token unit of each player dying here each turn.
    if (name === "death" && locationId?.startsWith("field:")) {
      const field = s.fields.find((f) => f.id === locationId);
      const card = getCard(cardId);
      if (
        field &&
        isFace(field.cardId, "RAD", 159) &&
        isCardType(card, "Unit") &&
        card.supertype !== "Token" &&
        useOncePerTurn(s, `sanctum:${field.id}`, p)
      )
        ctx.trigger(s, p, field.cardId, field.id, [recruit], field.id);
    }
  },
  effect(s, p, e, ctx) {
    if (e.custom === "draft:choose-two") return true;
    if (!e.custom?.startsWith("radiance4:")) return false;
    const self = s.units.find((u) => u.id === ctx.sourceId);
    const target = s.units.find((u) => u.id === ctx.targetId);
    const x = s.players[p];
    switch (e.custom.slice("radiance4:".length)) {
      case "fanfare":
        ((s.radiance ??= {}).fanfare ??= []).push({
          player: p,
          turn: s.turn,
          remaining: 3,
        });
        return true;
      case "high-note":
        if (target)
          ctx.runEffects(
            s,
            p,
            [
              {
                type: "might",
                amount: -exhaustedFriends(s, p),
                target: "anyUnit",
              },
            ],
            target.id,
          );
        return true;
      case "empyrean":
        if (e.shown) {
          predictN(s, p, { ...ctx }, e.shown.power);
          // "..., then draw 2": the draw waits for the Predict choices.
          if (s.pendingChoice)
            s.pendingChoice.afterEffects = [
              ...(s.pendingChoice.afterEffects ?? []),
              { type: "draw", amount: 2 },
            ];
          else ctx.draw(s, p, 2);
        }
        return true;
      case "predict-step": {
        const [n, decisions, order] = (e.cardName ?? "").split("|");
        askPredict(
          s,
          p,
          ctx,
          Number(n),
          decisions,
          order ? order.split(",").map(Number) : [],
        );
        return true;
      }
      case "for-demacia":
        for (const u of s.units.filter(
          (u) => u.owner === p && u.location === ctx.targetId,
        ))
          (u.temporaryKeywords ??= []).push("Shield 2");
        return true;
      case "base-might":
        if (target) target.baseMightOverride = e.amount ?? 0;
        return true;
      case "banish": {
        const gear = s.gears.find((g) => g.id === ctx.targetId);
        const object = target ?? gear;
        if (!object) return true;
        const owner = object.originalOwner ?? object.owner;
        const physical = object.originalCardId ?? object.cardId;
        s.units = s.units.filter((u) => u.id !== object.id);
        s.gears = s.gears.filter((g) => g.id !== object.id);
        for (const u of s.units)
          u.gear = u.gear.filter((id) => id !== object.id);
        for (const g of s.gears.filter((g) => g.attachedTo === object.id))
          delete g.attachedTo;
        if (!object.token) s.players[owner].banished.push(physical);
        ctx.cardEvent(s, "banish", owner, physical, object.id, ctx.locationId);
        ctx.log?.(s, `${getCard(physical).name} is banished.`, "play", p);
        return true;
      }
      case "rousing": {
        const count = e.shown ? 4 : 2;
        for (let i = 0; i < count; i++)
          ctx.spawnToken(s, p, "Recruit", `base:${p}`, false);
        return true;
      }
      case "encore-might":
        for (const id of (ctx.targetId ?? "").split("~")) {
          const unit = s.units.find((u) => u.id === id);
          if (unit) unit.temporaryMight += 1;
        }
        return true;
      case "encore-look": {
        const top = x.deck.slice(0, 2);
        if (top.length === 1) ctx.draw(s, p, 1);
        else if (top.length === 2)
          choices(
            s,
            p,
            ctx,
            [0, 1].map((i) =>
              option(
                p,
                `encore:${i}`,
                `Draw ${getCard(top[i]).name}, recycle ${getCard(top[1 - i]).name}`,
                [rd4("encore-pick", { amount: i })],
              ),
            ),
          );
        return true;
      }
      case "encore-pick": {
        const top = x.deck.splice(0, 2);
        const i = e.amount ?? 0;
        x.deck.unshift(top[i]);
        recycleCards(s, p, [top[1 - i]]);
        ctx.draw(s, p, 1);
        return true;
      }
      case "may-draw":
        choices(s, p, ctx, [
          option(p, "seraphine:draw", "Draw 1", [{ type: "draw", amount: 1 }]),
          option(p, "seraphine:skip", "Do not draw", []),
        ]);
        return true;
      case "guidebot":
        if (self)
          choices(s, p, ctx, [
            option(
              p,
              `guidebot:${self.id}:set`,
              `Guidebot's base Might becomes ${e.amount ?? 0} this turn`,
              [rd4("guidebot-set", { amount: e.amount })],
            ),
            option(p, `guidebot:${self.id}:keep`, "Keep Guidebot's Might", []),
          ]);
        return true;
      case "guidebot-set":
        if (self) self.baseMightOverride = e.amount ?? 0;
        return true;
      case "monastery":
        if (x.hand.length)
          choices(s, p, ctx, [
            option(
              p,
              "monastery:yes",
              "Discard 1 and channel 1 rune exhausted",
              [
                { type: "discard", amount: 1 },
                { type: "channel", amount: 1 },
              ],
            ),
            option(p, "monastery:no", "Decline", []),
          ]);
        return true;
      case "heimer-swap": {
        const token = s.units.find((u) => u.id === e.cardName);
        if (token) {
          s.units = s.units.filter((u) => u.id !== token.id);
          let mech: Unit | undefined;
          replacingToken = true;
          try {
            mech = ctx.spawnToken(
              s,
              token.owner,
              "Mech",
              token.location,
              token.ready,
            );
          } finally {
            replacingToken = false;
          }
          if (mech)
            ctx.log?.(
              s,
              "Heimerdinger replaces the token with a 3 Might Mech.",
              "play",
              p,
            );
        }
        return true;
      }
    }
    return false;
  },
};

export const reviewedRadianceWave4Printings: readonly string[] =
  Object.keys(radianceWave4Scripts).sort();
