import { canPlayCard } from "./board-rules";
import { getCard } from "../data/cards";
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
const base = (p: PlayerId): LocationId => `base:${p}`;
const foe = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const plain: CardScript = { implemented: true };
const fx = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `unl-extra:${custom}`,
  ...extra,
});
const xpEffect = (amount = 1): Effect => fx("xp", { amount });
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
const hunt = (amount: number): CardScript => ({
  ...plain,
  keywords: [`Hunt ${amount}`],
  onConquer: [xpEffect(amount)],
  onHold: [xpEffect(amount)],
});
const sprite: Effect = {
  type: "token",
  cardName: "Sprite",
  ready: true,
  location: "base",
};
const runes: Effect = {
  type: "readyRunes",
  amount: 2,
  chooseRunes: true,
  optional: true,
};

/** Explicit, complete rules for additional Unleashed cards; no generic fallback. */
export const unleashedExtraScripts: Record<string, CardScript> = {
  [id(3)]: {
    ...plain,
    hidden: true,
    onPlay: [
      {
        type: "damage",
        amount: 2,
        target: "enemyUnitHere",
        condition: "atBattlefield",
      },
    ],
  },
  [id(4)]: plain,
  [id(5)]: { ...plain, keywords: ["Ganking"] },
  [id(14)]: spell([fx("harpoon", { target: "unitAtBattlefield" })], "action"),
  [id(16)]: hunt(2),
  [id(21)]: {
    ...plain,
    ambush: true,
    onPlay: [
      { type: "bounce", target: "friendlyUnitAtBattlefield", optional: true },
    ],
  },
  [id(22)]: { ...plain, deflect: 1, keywords: ["Deflect", "Ganking"] },
  [id(28)]: {
    ...plain,
    hidden: true,
    keywords: ["Ganking"],
    additionalCost: { power: 1, domain: "Fury" },
    onPlay: [fx("pyke-ready")],
  },
  [id(32)]: {
    ...spell([fx("select-top", { amount: 3, condition: "unit" })]),
    repeat: { energy: 2 },
  },
  [id(33)]: {
    ...plain,
    onPlay: [{ type: "token", cardName: "Bird", location: "here" }],
  },
  [id(44)]: {
    ...plain,
    reaction: true,
    spellModes: [
      {
        label: "Counter a spell",
        effects: [{ type: "counter", target: "spell" }],
      },
      {
        label: "Four Birds",
        effects: [{ type: "token", cardName: "Bird", amount: 4 }],
      },
    ],
  },
  [id(46)]: spell([fx("friendship", { target: "anyUnit" })], "reaction"),
  [id(51)]: {
    ...plain,
    onPlay: [fx("select-top", { amount: 3, condition: "tribalUnit" })],
    onHold: [fx("select-top", { amount: 3, condition: "tribalUnit" })],
  },
  [id(56)]: {
    ...plain,
    onAttack: [
      fx("yuumi", { target: "friendlyUnitHere", excludeSource: true }),
    ],
    onDefend: [
      fx("yuumi", { target: "friendlyUnitHere", excludeSource: true }),
    ],
  },
  [id(58)]: plain,
  [id(62)]: { ...plain, onDeath: [fx("predict-two")] },
  [id(64)]: {
    ...plain,
    onPlay: [fx("select-top", { amount: 4, condition: "largeSpell" })],
  },
  [id(68)]: plain,
  [id(69)]: spell([
    { type: "token", amount: 2, cardName: "Sprite", ready: true },
  ]),
  [id(70)]: spell([{ type: "temporary", target: "anyGear" }]),
  [id(71)]: { ...plain, ambush: true, onPlay: [fx("chakram")] },
  [id(75)]: hunt(2),
  [id(76)]: plain,
  [id(77)]: plain,
  [id(78)]: {
    ...plain,
    keywords: ["Temporary"],
    onPlay: [sprite],
    onDeath: [sprite],
  },
  [id(82)]: { ...plain, accelerating: true },
  [id(84)]: { ...plain, onPlay: [sprite], onBegin: [sprite] },
  [id(89)]: { ...plain, keywords: ["Vision"], onPlay: [{ type: "predict" }] },
  [id(91)]: spell([{ type: "draw", amount: 2 }]),
  [id(92)]: { ...plain, onPlay: [xpEffect()] },
  [id(93)]: {
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
  [id(94)]: { ...hunt(1), ambush: true },
  [id(97)]: { ...plain, onPlay: [fx("kinkou-draw")] },
  [id(98)]: plain,
  [id(100)]: hunt(3),
  [id(102)]: hunt(1),
  [id(104)]: plain,
  [id(108)]: plain,
  [id(111)]: { ...plain, keywords: ["Cannot move to base"] },
  [id(113)]: hunt(2),
  [id(114)]: { ...plain, ambush: true },
  [id(115)]: {
    ...plain,
    accelerating: true,
    keywords: ["Ganking"],
    onMove: [xpEffect()],
  },
  [id(116)]: { ...plain, deflect: 1, keywords: ["Deflect"] },
  [id(124)]: spell([fx("isolate", { target: "enemyUnitAtBattlefield" })]),
  [id(128)]: spell([fx("star-crossed", { target: "duel" })], "reaction"),
  [id(129)]: plain,
  [id(130)]: {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    onPlay: [fx("opponent-bird")],
  },
  [id(131)]: spell(
    [
      { type: "counter", target: "spell", condition: "returnCounteredToHand" },
      { type: "predict" },
    ],
    "reaction",
  ),
  [id(132)]: { ...plain, onPlay: [fx("angler")] },
  [id(143)]: {
    ...plain,
    ambush: true,
    onAttack: [fx("mutating", { condition: "enemyAloneHere" })],
    onDefend: [fx("mutating", { condition: "enemyAloneHere" })],
  },
  [id(149)]: { ...plain, ambush: true },
  [id(151)]: plain,
  [id(157)]: { ...plain, onPlay: [fx("sergeant")] },
  [id(160)]: plain,
  [id(162)]: hunt(1),
  [id(171)]: {
    ...plain,
    deflect: 1,
    keywords: ["Deflect", "Tank", "No combat damage"],
  },
  [id(172)]: {
    ...plain,
    assault: 1,
    keywords: ["Assault"],
    onDeath: [fx("fragmented")],
  },
  [id(174)]: plain,
  [id(180)]: spell([fx("ruination")]),
  [id(183)]: plain,
  [id(185)]: {
    ...plain,
    abilities: [
      {
        label: "Return a friendly unit and play Gold",
        energy: 1,
        exhaust: true,
        effects: [
          { type: "bounce", target: "friendlyUnitAtBattlefield" },
          fx("gold"),
        ],
      },
    ],
  },
  [id(189)]: plain,
  [id(191)]: plain,
  [id(203)]: plain,
  [id(204)]: spell(
    [fx("verdict", { target: "enemyUnitAtBattlefield" })],
    "action",
  ),
  [id(205)]: plain,
  [id(208)]: plain,
  [id(210)]: plain,
  [id(211)]: plain,
  [id(212)]: plain,
  [id(219)]: { ...plain, onHold: [fx("hold-tax")] },
};

interface ExtraState {
  turn: number;
  paidSpell: [boolean, boolean];
  gainedXP: [boolean, boolean];
  previousXP: [number, number];
  holdTax: [number, number];
  shields: Record<string, number>;
  beginningDeaths: Record<string, boolean>;
}
const xp = (s: GameState, p: PlayerId) => s.players[p].xp ?? 0;
function data(s: GameState, writable = true): ExtraState {
  const state = s as GameState & { unleashedExtra?: ExtraState };
  if (state.unleashedExtra?.turn === s.turn) return state.unleashedExtra;
  const next: ExtraState = {
    turn: s.turn,
    paidSpell: [false, false],
    gainedXP: [false, false],
    previousXP: [xp(s, 0), xp(s, 1)],
    holdTax: [0, 0],
    shields: {},
    beginningDeaths: {},
  };
  if (writable) state.unleashedExtra = next;
  return next;
}
function gain(s: GameState, p: PlayerId, n: number, ctx: PreconContext) {
  const state = data(s);
  s.players[p].xp = Math.max(0, xp(s, p) + n);
  if (n > 0) state.gainedXP[p] = true;
  state.previousXP[p] = xp(s, p);
  ctx.log?.(
    s,
    `${s.players[p].name} ${n < 0 ? "spends" : "gains"} ${Math.abs(n)} XP.`,
    "info",
    p,
  );
}
const tribes = ["Bird", "Cat", "Dog", "Poro"];
const tribal = (cardId: string) =>
  getCard(cardId).tags.some((tag) => tribes.includes(tag));
const tagCount = (s: GameState, p: PlayerId) =>
  tribes.filter((tag) =>
    s.units.some((u) => u.owner === p && getCard(u.cardId).tags.includes(tag)),
  ).length;
const live = (s: GameState, p: PlayerId, card: number) =>
  s.units.filter((u) => u.owner === p && u.cardId === id(card));
type Choice = {
  label: string;
  effects: Effect[];
  targetId?: string;
  locationId?: LocationId;
};
function choose(
  s: GameState,
  p: PlayerId,
  choices: Choice[],
  ctx: PreconContext,
  optional = false,
) {
  if (!choices.length) return;
  const options: GameAction[] = choices.map((choice, index) => ({
    ...choice,
    id: `choose-custom:unl-extra:${s.nextId++}:${index}`,
    category: "ability",
    player: p,
  }));
  if (optional)
    options.push({
      id: `choose-custom:unl-extra:${s.nextId++}:skip`,
      label: "Decline optional effect",
      effects: [],
      category: "ability",
      player: p,
    });
  ctx.openChoice(s, p, {
    options,
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
  });
}
function trigger(
  s: GameState,
  u: { id: string; cardId: string; owner: PlayerId; location?: LocationId },
  effects: Effect[],
  ctx: PreconContext,
  location = u.location,
) {
  ctx.trigger(s, u.owner, u.cardId, u.id, effects, location);
}
function execute(
  s: GameState,
  p: PlayerId,
  effects: Effect[],
  ctx: PreconContext,
  targetId = ctx.targetId,
) {
  ctx.runEffects(s, p, effects, targetId, ctx.sourceId, ctx.locationId);
}

export const unleashedExtraModule: ExpansionModule = {
  might(s, u, value) {
    const state = data(s, false);
    if (u.cardId === id(4) && state.paidSpell[u.owner]) value += 4;
    if ([id(16), id(75)].includes(u.cardId) && xp(s, u.owner) >= 3) value++;
    if (u.cardId === id(94) && xp(s, u.owner) >= 6) value++;
    if (u.cardId === id(98) && xp(s, u.owner) >= 11) value += 4;
    if (u.cardId === id(108) && state.gainedXP[u.owner]) value++;
    if (u.cardId === id(76) && u.location.startsWith("field:"))
      value += s.units.filter(
        (a) => a.owner === u.owner && a.location === u.location && a.temporary,
      ).length;
    if (u.token) value += live(s, u.owner, 77).length;
    if (s.players[u.owner].legendId === id(191) && xp(s, u.owner) >= 6) value++;
    if (
      s.combat &&
      (s.combat.engaged ?? true) &&
      s.combat.defender === u.owner &&
      s.combat.fieldId === u.location
    ) {
      value += state.shields[u.id] ?? 0;
      if (
        u.temporary &&
        s.fields.find((f) => f.id === u.location)?.cardId === id(208)
      )
        value++;
      if (
        s.fields.find((f) => f.id === u.location)?.cardId === id(210) &&
        s.units.filter((a) => a.owner === u.owner && a.location === u.location)
          .length === 1
      )
        value -= 2;
    }
    return value;
  },
  keywords(s, u) {
    const result: string[] = [];
    if (u.cardId === id(75) && xp(s, u.owner) >= 3) result.push("Ganking");
    if (u.cardId === id(113) && xp(s, u.owner) >= 6)
      result.push("Deflect", "Ganking");
    if (u.cardId === id(108) && data(s, false).gainedXP[u.owner])
      result.push("Ganking");
    if (u.token && live(s, u.owner, 58).length) result.push("Tank");
    if (
      data(s, false).shields[u.id] ||
      (u.temporary &&
        s.fields.find((f) => f.id === u.location)?.cardId === id(208))
    )
      result.push("Shield");
    return result;
  },
  cost(s, p, card) {
    let energy = 0;
    if (card.id === id(91))
      energy -= xp(s, p) >= 11 ? 4 : xp(s, p) >= 6 ? 2 : 0;
    if (card.type === "Unit" && card.supertype !== "Token")
      energy += data(s, false).holdTax[p];
    return { energy };
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("unl-extra:")) return false;
    const key = e.custom.slice("unl-extra:".length);
    const source = s.units.find((u) => u.id === ctx.sourceId) ?? ctx.lastUnit;
    const target = s.units.find((u) => u.id === ctx.targetId);
    switch (key) {
      case "hold-tax":
        data(s).holdTax[p]++;
        break;
      case "xp":
        gain(s, p, e.amount ?? 1, ctx);
        break;
      case "gold":
        ctx.spawnToken(s, p, "Gold", base(p), false);
        break;
      case "harpoon":
        execute(
          s,
          p,
          [
            {
              type: "damage",
              amount: s.hidden?.some((h) => h.owner === p) ? 4 : 2,
              target: "unitAtBattlefield",
            },
          ],
          ctx,
        );
        break;
      case "pyke-ready":
        if (source?.additionalCostPaid)
          execute(s, p, [self("ready"), self("might", 2)], ctx);
        break;
      case "friendship":
        execute(
          s,
          p,
          [{ type: "might", target: "anyUnit", amount: tagCount(s, p) }],
          ctx,
        );
        break;
      case "yuumi":
        execute(
          s,
          p,
          [
            {
              type: "might",
              amount: 3,
              target: "friendlyUnitHere",
              excludeSource: true,
            },
            {
              type: "keyword",
              keyword: "Tank",
              target: "friendlyUnitHere",
              excludeSource: true,
            },
          ],
          ctx,
        );
        break;
      case "chakram":
        for (const unit of s.units.filter(
          (u) =>
            u.owner === p &&
            u.id !== source?.id &&
            u.location === ctx.locationId,
        ))
          data(s).shields[unit.id] = (data(s).shields[unit.id] ?? 0) + 1;
        break;
      case "kinkou-draw":
        if (
          s.units
            .filter((u) => u.owner === p && u.id !== ctx.sourceId)
            .reduce((n, u) => n + ctx.getMight(s, u), 0) >= 5
        )
          ctx.draw(s, p, 1);
        break;
      case "sergeant":
        gain(s, p, s.units.filter((u) => u.owner === p).length, ctx);
        break;
      case "fragmented":
        ctx.draw(s, p, s.pendingBeginning === p ? 2 : 1);
        break;
      case "ruination":
        ctx.killUnits(
          s,
          s.units.map((u) => u.id),
        );
        break;
      case "opponent-bird":
        ctx.runEffects(
          s,
          foe(p),
          [{ type: "token", cardName: "Bird" }],
          undefined,
          ctx.sourceId,
          ctx.locationId,
        );
        break;
      case "mutating":
        execute(s, p, [self("might", 2)], ctx);
        gain(s, p, 2, ctx);
        break;
      case "isolate": {
        const location = target?.location;
        if (target) {
          execute(
            s,
            p,
            [{ type: "moveTarget", target: "enemyUnitAtBattlefield" }],
            ctx,
          );
          if (
            s.units.filter((u) => u.owner !== p && u.location === location)
              .length === 1
          )
            ctx.draw(s, p, 1);
        }
        break;
      }
      case "star-crossed": {
        const [friend, enemy] = (ctx.targetId ?? "").split("~");
        execute(
          s,
          p,
          [
            { type: "bounce", target: "friendlyUnit", chosenTargetId: friend },
            { type: "bounce", target: "enemyUnit", chosenTargetId: enemy },
          ],
          ctx,
        );
        break;
      }
      case "angler":
        execute(
          s,
          p,
          s.units
            .filter((u) => ctx.getMight(s, u) <= 2)
            .map((u) => ({ type: "bounce", chosenTargetId: u.id })),
          ctx,
        );
        break;
      case "select-top": {
        const viewed = s.players[p].deck.slice(0, e.amount ?? 3);
        const eligible = (cardId: string) =>
          e.condition === "largeSpell"
            ? getCard(cardId).type === "Spell" &&
              (getCard(cardId).energy ?? 0) >= 4
            : getCard(cardId).type === "Unit";
        const choices = viewed.flatMap((cardId, index) =>
          eligible(cardId)
            ? [
                {
                  label: `Reveal and draw ${getCard(cardId).name}`,
                  effects: [
                    fx("select-top-apply", {
                      cardName: JSON.stringify({
                        viewed,
                        index,
                        tribal: e.condition === "tribalUnit",
                      }),
                    }),
                  ],
                },
              ]
            : [],
        );
        choices.push({
          label: "Recycle all viewed cards",
          effects: [
            fx("select-top-apply", {
              cardName: JSON.stringify({ viewed, index: -1 }),
            }),
          ],
        });
        choose(s, p, choices, ctx);
        break;
      }
      case "select-top-apply": {
        const selection = JSON.parse(e.cardName!) as {
          viewed: string[];
          index: number;
          tribal?: boolean;
        };
        if (
          s.players[p].deck.slice(0, selection.viewed.length).join("|") !==
          selection.viewed.join("|")
        )
          break;
        const viewed = s.players[p].deck.splice(0, selection.viewed.length);
        const picked =
          selection.index < 0
            ? undefined
            : viewed.splice(selection.index, 1)[0];
        s.players[p].deck.push(...(ctx.shuffle?.(s, viewed) ?? viewed));
        if (picked) {
          s.players[p].deck.unshift(picked);
          ctx.draw(s, p, 1);
          ctx.log?.(
            s,
            `${s.players[p].name} reveals ${getCard(picked).name}.`,
            "info",
            p,
          );
          if (selection.tribal && tribal(picked) && ctx.sourceId)
            ctx.trigger(
              s,
              p,
              id(51),
              ctx.sourceId,
              [{ type: "buff", target: "friendlyUnit" }],
              ctx.locationId,
            );
        }
        break;
      }
      case "predict-two": {
        const viewed = s.players[p].deck.slice(0, 2);
        const keep =
          viewed.length === 2
            ? [[0, 1], [1, 0], [0], [1], []]
            : viewed.length
              ? [[0], []]
              : [[]];
        choose(
          s,
          p,
          keep.map((indices) => ({
            label: indices.length
              ? `Keep ${indices.map((index) => getCard(viewed[index]).name).join(" then ")}`
              : "Recycle all viewed cards",
            effects: [
              fx("predict-two-apply", {
                cardName: JSON.stringify({ viewed, indices }),
              }),
            ],
          })),
          ctx,
        );
        break;
      }
      case "predict-two-apply": {
        const selection = JSON.parse(e.cardName!) as {
          viewed: string[];
          indices: number[];
        };
        if (
          s.players[p].deck.slice(0, selection.viewed.length).join("|") !==
          selection.viewed.join("|")
        )
          break;
        s.players[p].deck.splice(0, selection.viewed.length);
        s.players[p].deck.unshift(
          ...selection.indices.map((index) => selection.viewed[index]),
        );
        const recycled = selection.viewed.filter(
          (_, index) => !selection.indices.includes(index),
        );
        s.players[p].deck.push(...(ctx.shuffle?.(s, recycled) ?? recycled));
        break;
      }
      case "verdict":
        if (target)
          choose(
            s,
            target.owner,
            ["top", "bottom"].map((where) => ({
              label: `Put ${getCard(target.cardId).name} on ${where}`,
              targetId: target.id,
              effects: [
                fx("verdict-place", { condition: where, cardName: target.id }),
              ],
            })),
            ctx,
          );
        break;
      case "verdict-place": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (!unit) break;
        for (const gear of s.gears.filter((g) => g.attachedTo === unit.id))
          gear.attachedTo = undefined;
        s.units = s.units.filter((u) => u.id !== unit.id);
        if (!unit.token) {
          if (e.condition === "top")
            s.players[unit.owner].deck.unshift(unit.cardId);
          else s.players[unit.owner].deck.push(unit.cardId);
        }
        break;
      }
      default:
        return false;
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const state = data(s);
    const source = s.units.find((u) => u.id === sourceId);
    if (event === "stateChanged") {
      for (const owner of [0, 1] as const) {
        if (xp(s, owner) > state.previousXP[owner])
          state.gainedXP[owner] = true;
        state.previousXP[owner] = xp(s, owner);
      }
    }
    if (
      event === "cardFinalized" &&
      getCard(cardId).type === "Spell" &&
      (ctx.energySpent ?? 0) >= 4
    )
      state.paidSpell[p] = true;
    if (event === "unitPlayed" && source) {
      if (cardId === id(116) && s.players[foe(p)].points >= 5)
        trigger(s, source, [self("ready"), xpEffect(3)], ctx);
      if (
        ([id(16), id(151)].includes(cardId) && xp(s, p) >= 3) ||
        (s.players[p].legendId === id(191) && xp(s, p) >= 11)
      )
        source.ready = true;
      if (source.token)
        for (const unit of live(s, p, 58))
          trigger(s, unit, [self("might", 1)], ctx);
      for (const unit of live(s, p, 104))
        if (unit.id === sourceId || getCard(cardId).tags.includes("Dragon"))
          trigger(s, unit, [runes], ctx);
      if (s.players[p].legendId === id(183))
        ctx.trigger(s, p, id(183), "legend", [
          { type: "might", amount: 1, target: "anyUnit" },
        ]);
    }
    if (event === "play") {
      if (cardId === id(78)) {
        const gear = s.gears.find((g) => g.id === sourceId);
        if (gear) gear.temporary = true;
      }
      if (getCard(cardId).type === "Spell") {
        for (const unit of live(s, p, 149))
          trigger(s, unit, [self("might", 2)], ctx);
        if ((ctx.energySpent ?? 0) >= 4) {
          for (const unit of live(s, p, 5))
            trigger(s, unit, [self("ready")], ctx);
          for (const field of s.fields.filter(
            (f) => f.cardId === id(211) && f.controller === p,
          ))
            ctx.trigger(
              s,
              p,
              field.cardId,
              field.id,
              [{ type: "predict" }],
              field.id,
            );
        }
        for (const field of s.fields.filter((f) => f.cardId === id(205)))
          ctx.trigger(
            s,
            p,
            field.cardId,
            field.id,
            [
              {
                type: "might",
                amount: 1,
                target: "friendlyUnitHere",
                optional: true,
              },
            ],
            field.id,
          );
      }
    }
    if (event === "move" && source) {
      if (source.cardId === id(22)) {
        s.players[source.owner].energy++;
        s.players[source.owner].power =
          (s.players[source.owner].power ?? 0) + 1;
      }
      if (source.cardId === id(82) && ctx.previousLocation)
        trigger(
          s,
          source,
          [{ type: "token", cardName: "Sprite", location: "here" }],
          ctx,
          ctx.previousLocation,
        );
    }
    if (event === "death" && source) {
      for (const unit of live(s, source.owner, 68).filter(
        (u) => u.id !== source.id && !ctx.dyingUnitIds?.includes(u.id),
      ))
        trigger(s, unit, [self("might", 2)], ctx);
      for (const unit of live(s, source.owner, 129).filter(
        (u) => u.id !== source.id && !ctx.dyingUnitIds?.includes(u.id),
      ))
        trigger(s, unit, [xpEffect()], ctx);
      if (s.pendingBeginning === source.owner)
        for (const gear of s.gears.filter(
          (g) => g.owner === source.owner && g.cardId === id(174),
        ))
          if (!state.beginningDeaths[gear.id]) {
            state.beginningDeaths[gear.id] = true;
            trigger(s, gear, [{ type: "sacrifice", who: "opponent" }], ctx);
          }
    }
    if (event === "combatEnd" && s.combat && (s.combat.engaged ?? true))
      for (const unit of s.units.filter(
        (u) =>
          u.location === locationId &&
          u.cardId === id(114) &&
          s.combat?.designatedUnits?.includes(u.id),
      ))
        trigger(s, unit, [{ type: "draw", amount: 1 }], ctx);
    if (event === "hold") {
      if (s.players[p].legendId === id(203))
        ctx.trigger(s, p, id(203), "legend", [xpEffect()], locationId);
    }
    if (event === "beginning")
      for (const field of s.fields.filter((f) => f.cardId === id(212)))
        ctx.pushStack(s, {
          player: field.controller ?? p,
          cardId: field.cardId,
          sourceId: field.id,
          targetId: field.id,
          locationId: field.id,
          kind: "trigger",
          effects: [
            { type: "damageAll", amount: 1, who: "all", target: "battlefield" },
          ],
        });
  },
  actions(s, p, ctx) {
    if (
      s.phase !== "main" ||
      s.currentPlayer !== p ||
      s.stack.length ||
      s.pendingChoice
    )
      return [];
    const out: GameAction[] = [];
    const add = (
      key: string,
      cardId: string,
      sourceId: string,
      label: string,
      extra: Partial<GameAction> = {},
    ) =>
      out.push({
        id: `unl-extra:${key}:${sourceId}:${extra.locationId ?? ""}`,
        category: "ability",
        abilityKey: key,
        player: p,
        cardId,
        sourceId,
        label,
        ...extra,
      });
    for (const unit of s.units.filter((u) => u.owner === p)) {
      if ([id(102), id(162)].includes(unit.cardId) && xp(s, p) >= 2)
        add("xp-buff", unit.cardId, unit.id, "Spend 2 XP to buff me");
      if (
        unit.cardId === id(160) &&
        unit.ready &&
        unit.location.startsWith("field:")
      )
        add("poro-birds", unit.cardId, unit.id, "Exhaust: play two Birds");
    }
    const player = s.players[p];
    if (player.legendUsedTurn !== s.turn) {
      if (player.legendId === id(203) && xp(s, p) >= 3)
        add(
          "legend-draw",
          player.legendId,
          "legend",
          "Spend 3 XP and exhaust: draw 1",
        );
      const price = Math.max(
        0,
        4 - s.units.filter((u) => u.owner === p && u.temporary).length,
      );
      if (player.legendId === id(189) && ctx.canPay(s, p, price, 0))
        add(
          "legend-sprite",
          player.legendId,
          "legend",
          `Pay ${price} Energy and exhaust: play a ready Sprite`,
          { amount: price },
        );
    }
    if (data(s, false).paidSpell[p] && ctx.canPay(s, p, 0, 1, ["Mind"]))
      for (const entry of [
        ...player.hand.map((cardId, index) => ({
          cardId,
          sourceId: `hand:${index}`,
        })),
        ...(player.championAvailable
          ? [{ cardId: player.championId, sourceId: "champion" }]
          : []),
      ])
        if (entry.cardId === id(89))
          for (const locationId of [
            base(p),
            ...s.fields.filter((f) => f.controller === p).map((f) => f.id),
          ])
            add(
              "jhin-play",
              entry.cardId,
              entry.sourceId,
              "Play Jhin for 1 Mind Power",
              { locationId, category: "play" },
            );
    return out;
  },
  apply(s, action, ctx) {
    if (!action.id.startsWith("unl-extra:")) return false;
    const p = action.player;
    const source = s.units.find((u) => u.id === action.sourceId);
    let effects: Effect[] = [];
    switch (action.abilityKey) {
      case "xp-buff":
        gain(s, p, -2, ctx);
        effects = [self("buff")];
        break;
      case "poro-birds":
        if (source) source.ready = false;
        effects = [{ type: "token", cardName: "Bird", amount: 2 }];
        break;
      case "legend-draw":
        gain(s, p, -3, ctx);
        s.players[p].legendUsedTurn = s.turn;
        effects = [{ type: "draw", amount: 1 }];
        break;
      case "legend-sprite":
        ctx.pay(s, p, action.amount ?? 0, 0);
        s.players[p].legendUsedTurn = s.turn;
        effects = [{ type: "token", cardName: "Sprite", ready: true }];
        break;
      case "jhin-play": {
        const index = Number(action.sourceId?.split(":")[1]);
        const champion = action.sourceId === "champion";
        if (
          !action.locationId ||
          !canPlayCard(s, p, getCard(id(89)), action.locationId) ||
          (champion
            ? !s.players[p].championAvailable ||
              s.players[p].championId !== id(89)
            : s.players[p].hand[index] !== id(89))
        )
          return true;
        ctx.pay(s, p, 0, 1, ["Mind"]);
        if (champion) s.players[p].championAvailable = false;
        else s.players[p].hand.splice(index, 1);
        ctx.playUnit(s, p, id(89), action.locationId);
        return true;
      }
      default:
        return false;
    }
    ctx.pushStack(s, {
      player: p,
      cardId: action.cardId!,
      sourceId: action.sourceId,
      kind: "ability",
      effects,
      locationId: source?.location,
    });
    return true;
  },
};
