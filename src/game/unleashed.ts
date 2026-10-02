import { getCard } from "../data/cards";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";

const unl = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const special = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `unl:${custom}`,
  ...extra,
});
const plain: CardScript = { implemented: true };
const action = (spell: Effect[]): CardScript => ({
  ...plain,
  action: true,
  spell,
});
const reaction = (spell: Effect[]): CardScript => ({
  ...plain,
  reaction: true,
  spell,
});

/** Image-only equipment boxes are implemented here too (catalog text omits them). */
export const unleashedScripts: Record<string, CardScript> = {
  [unl(187)]: {
    ...plain,
    notes: "Conquer with 3 excess damage: optional exhaust to ready a unit.",
  },
  [unl(217)]: {
    ...plain,
    notes: "Conquer with 3 excess damage creates a Bird.",
  },
  [unl(215)]: {
    ...plain,
    notes:
      "First non-token unit played here each turn may send another friendly unit to base.",
  },
  [unl(218)]: {
    ...plain,
    notes: "Unit played here may pay 1 energy to gain a buff.",
  },
  [unl(30)]: {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    abilities: [
      {
        label: "Double my Might this turn",
        energy: 2,
        power: 1,
        domain: "Fury",
        effects: [special("double")],
      },
    ],
  },
  [unl(176)]: {
    ...plain,
    ambush: true,
    onAttack: [{ type: "stun", target: "enemyUnitHere" }],
  },
  [unl(10)]: action([
    { type: "assault", amount: 2, target: "anyUnit" },
    { type: "keyword", keyword: "Ganking", target: "anyUnit" },
  ]),
  [unl(2)]: { ...plain, ambush: true, assault: 2 },
  [unl(156)]: { ...plain, onDeath: [special("loyal-poro")] },
  [unl(154)]: {
    ...plain,
    notes: "Gets +2 Might when attacking with another friendly unit.",
  },
  [unl(6)]: { ...plain, accelerating: true, assault: 4 },
  [unl(17)]: {
    ...plain,
    repeat: { discard: 1 },
    spell: [{ type: "assault", amount: 4, target: "anyUnit" }],
  },
  [unl(188)]: {
    ...plain,
    equipEnergy: 3,
    equipCost: 1,
    gearMight: 3,
    notes:
      "Equip energy reduced by chosen unit Might; attached unit draws on conquer with 3 excess damage.",
  },
  [unl(15)]: { ...plain, spell: [special("conquest-draw")] },
  [unl(1)]: {
    ...plain,
    keywords: ["Enters ready"],
    abilities: [
      {
        label: "Give a unit +3 Might this turn",
        exhaust: true,
        effects: [{ type: "might", amount: 3, target: "anyUnit" }],
      },
    ],
  },
  [unl(12)]: { ...plain, ambush: true, onPlay: [special("broadmane")] },
  [unl(8)]: {
    ...plain,
    assault: 1,
    notes: "Enters ready if a unit died this turn.",
  },
  [unl(18)]: { ...plain, onConquer: [special("yeti-gold")] },
  [unl(153)]: { ...plain, onDeath: [special("bird")] },
  [unl(24)]: {
    ...plain,
    accelerating: true,
    assault: 2,
    deflect: 1,
    keywords: ["Ganking", "Deflect"],
  },
  "sfd-009-221": {
    ...plain,
    equipCost: 1,
    gearMight: 0,
    notes: "Attached unit has Assault 2 (equipment box).",
  },
  [unl(175)]: reaction([special("retreat", { target: "friendlyUnit" })]),
  [unl(161)]: {
    ...plain,
    onPlay: [{ type: "predict", amount: 1 }],
    notes: "Action, exhaust and kill this: a unit gets +2 Might.",
  },
  [unl(163)]: {
    ...plain,
    notes:
      "Moving multiple units to this battlefield costs enemy 1 any power per unit after first.",
  },
  [unl(26)]: {
    ...plain,
    notes: "At a battlefield: Fury power, exhaust to deal 3 to a unit.",
  },
  [unl(9)]: {
    ...plain,
    repeat: { energy: 2 },
    spell: [{ type: "ready", target: "anyUnit" }],
  },
  [unl(159)]: {
    ...plain,
    spell: [{ type: "kill", target: "unitAtBattlefield", maxMight: 3 }],
  },
  [unl(193)]: {
    ...plain,
    notes: "When holding, may exhaust legend to draw 1.",
  },
  [unl(150)]: {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    notes:
      "At a battlefield, stuns units opponents play and prevents their movement for this turn.",
  },
  [unl(207)]: {
    ...plain,
    notes: "Holding may move a unit at any battlefield to its base.",
  },
  [unl(213)]: { ...plain, notes: "Units here have exhaust: gain 1 XP." },
  [unl(214)]: {
    ...plain,
    notes:
      "A player whose unit is returned to hand here may pay 1 to channel an exhausted rune.",
  },
  "sfd-146-221": {
    ...plain,
    notes:
      "While in combat: friendly spells -1 energy/-1 any power, enemy spells +1 energy/+1 any power.",
  },
  [unl(55)]: {
    ...plain,
    shield: 1,
    keywords: ["Tank"],
    notes: "When stunning enemy unit at battlefield, may move here.",
  },
  [unl(36)]: { ...plain, shield: 2, keywords: ["Tank"] },
  [unl(35)]: {
    ...plain,
    notes: "Costs 2 less and enters ready while an enemy unit is stunned.",
  },
  [unl(134)]: {
    ...action([special("dread", { target: "enemyAttackingUnit" })]),
    repeat: { energy: 2 },
  },
  [unl(41)]: {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    notes: "Other friendly units at my battlefield gain Deflect.",
  },
  [unl(42)]: {
    ...action([{ type: "stun", target: "anyUnit" }, special("back-off-draw")]),
    hidden: true,
  },
  [unl(43)]: {
    ...plain,
    keywords: ["Backline"],
    onHold: [special("buff-here")],
  },
  [unl(48)]: {
    ...plain,
    shield: 1,
    onHold: [
      {
        type: "token",
        cardName: "Sprite",
        amount: 1,
        location: "here",
        ready: true,
      },
    ],
  },
  [unl(133)]: {
    ...plain,
    onPlay: [special("blast-play")],
    notes: "When moving enemy unit, may exhaust to stun it.",
  },
  [unl(126)]: {
    ...plain,
    notes: "Spend 3 XP: friendly units here gain Ganking this turn.",
  },
  [unl(141)]: {
    ...plain,
    hidden: true,
    keywords: ["Backline"],
    onPlay: [special("evelynn")],
  },
  [unl(52)]: {
    ...plain,
    additionalCost: { power: 1, domain: "Calm" },
    onPlay: [special("nami-play")],
    notes:
      "Optional Calm power when played stuns an enemy unit; hold readies and buffs next friendly unit played.",
  },
  [unl(50)]: { ...plain, onHold: [special("iascylla-schedule")] },
  [unl(194)]: {
    ...plain,
    action: true,
    notes:
      "Enters ready when played to battlefield; Action: 1 energy, any power, exhaust to stun enemy attacking here.",
  },
  [unl(136)]: {
    ...plain,
    notes:
      "Enters exhausted. Kill, 1 energy, exhaust: Predict 2, draw 1, gain 1 XP.",
  },
  [unl(39)]: {
    ...plain,
    equipCost: 1,
    gearMight: 1,
    notes: "Attached unit gets another +1 Might at Level 3 (equipment box).",
  },
  [unl(127)]: { ...plain, accelerating: true, onMove: [special("root-xp")] },
  [unl(38)]: {
    ...plain,
    spell: [
      {
        type: "moveTarget",
        target: "enemyUnit",
        condition: "chooseDestination",
      },
      special("skyward-level"),
    ],
  },
  [unl(31)]: reaction([special("combat-experience", { target: "anyUnit" })]),
  [unl(34)]: {
    ...plain,
    keywords: ["Hunt"],
    onPlay: [special("xp", { amount: 2 })],
    onConquer: [special("xp", { amount: 1 })],
    onHold: [special("xp", { amount: 1 })],
  },
  [unl(40)]: {
    ...plain,
    keywords: ["Hunt"],
    onPlay: [special("wuju-draw")],
    onConquer: [special("xp", { amount: 1 })],
    onHold: [special("xp", { amount: 1 })],
  },
  [unl(47)]: {
    ...plain,
    keywords: ["Hunt 2"],
    onConquer: [special("xp", { amount: 2 })],
    onHold: [special("xp", { amount: 2 })],
    notes: "At Level 3: +1 Might and Deflect.",
  },
};

interface UnleashedState {
  diedTurn?: number;
  deathNotAlone: Record<string, boolean>;
  nami: Partial<Record<PlayerId, number>>;
  iascylla: { owner: PlayerId; location: LocationId }[];
  firstPlay: Record<string, number>;
}
function state(s: GameState): UnleashedState {
  const extensible = s as GameState & { unleashed?: UnleashedState };
  return (extensible.unleashed ??= {
    deathNotAlone: {},
    nami: {},
    iascylla: [],
    firstPlay: {},
  });
}
const xp = (s: GameState, p: PlayerId) =>
  (s.players[p] as (typeof s.players)[0] & { xp?: number }).xp ?? 0;
function gainXP(s: GameState, p: PlayerId, amount: number, ctx: PreconContext) {
  const player = s.players[p] as (typeof s.players)[0] & { xp?: number };
  player.xp = Math.max(0, xp(s, p) + amount);
  ctx.log?.(
    s,
    `${player.name} ${amount < 0 ? "spends" : "gains"} ${Math.abs(amount)} XP (${player.xp} total).`,
    "info",
    p,
  );
}
const base = (p: PlayerId): LocationId => `base:${p}`;
const attached = (s: GameState, u: Unit, cardId: string) =>
  u.gear.filter((id) => s.gears.some((g) => g.id === id && g.cardId === cardId))
    .length;
const trigger = (
  s: GameState,
  p: PlayerId,
  cardId: string,
  sourceId: string,
  custom: string,
  ctx: PreconContext,
  locationId?: LocationId,
  extra: Partial<Effect> = {},
) => ctx.trigger(s, p, cardId, sourceId, [special(custom, extra)], locationId);
function options(
  s: GameState,
  p: PlayerId,
  candidates: {
    label: string;
    targetId?: string;
    effects: Effect[];
    locationId?: LocationId;
  }[],
  ctx: PreconContext,
  optional = true,
) {
  if (!candidates.length) return;
  const actions: GameAction[] = candidates.map((choice, i) => ({
    ...choice,
    id: `choose-custom:unl:${s.nextId}:${i}`,
    player: p,
    category: "ability",
  }));
  if (optional)
    actions.push({
      id: `choose-custom:unl:${s.nextId}:skip`,
      player: p,
      label: "Decline optional effect",
      category: "ability",
      effects: [],
    });
  ctx.openChoice(s, p, {
    options: actions,
    sourceId: ctx.sourceId,
    locationId: ctx.locationId,
    targetId: ctx.targetId,
  });
}
function excess(s: GameState) {
  return (s as GameState & { lastExcessDamage?: number }).lastExcessDamage ?? 0;
}

export const unleashedModule: ExpansionModule = {
  might(s, unit, value) {
    if (
      unit.cardId === unl(154) &&
      s.combat?.attacker === unit.owner &&
      s.combat.fieldId === unit.location &&
      s.units.some(
        (u) =>
          u.id !== unit.id &&
          u.owner === unit.owner &&
          u.location === unit.location,
      )
    )
      value += 2;
    if (unit.cardId === unl(47) && xp(s, unit.owner) >= 3) value++;
    if (xp(s, unit.owner) >= 3) value += attached(s, unit, unl(39));
    if (s.combat?.attacker === unit.owner && s.combat.fieldId === unit.location)
      value += attached(s, unit, "sfd-009-221") * 2;
    return value;
  },
  keywords(s, unit) {
    const result: string[] = [];
    if (unit.cardId === unl(47) && xp(s, unit.owner) >= 3)
      result.push("Deflect");
    if (unit.location.startsWith("field:")) {
      const auras = s.units.filter(
        (u) =>
          u.id !== unit.id &&
          u.owner === unit.owner &&
          u.location === unit.location &&
          u.cardId === unl(41),
      ).length;
      for (let i = 0; i < auras; i++) result.push("Deflect");
    }
    if (attached(s, unit, "sfd-009-221")) result.push("Assault 2");
    return result;
  },
  cost(s, p, card) {
    if (card.id === unl(35) && s.units.some((u) => u.owner !== p && u.stunned))
      return { energy: -2 };
    if (card.type === "Spell" && s.combat) {
      const vexes = s.units.filter(
        (u) => u.cardId === "sfd-146-221" && u.location === s.combat!.fieldId,
      );
      const delta = vexes.reduce(
        (total, u) => total + (u.owner === p ? -1 : 1),
        0,
      );
      return {
        energy:
          delta < 0
            ? Math.max(
                Math.min(1, card.energy ?? 0) - (card.energy ?? 0),
                delta,
              )
            : delta,
        power: delta,
      };
    }
    return {};
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("unl:")) return false;
    const key = e.custom.slice(4);
    const unit = s.units.find((u) => u.id === (ctx.targetId ?? e.cardName));
    const source = s.units.find((u) => u.id === ctx.sourceId);
    const data = state(s);
    switch (key) {
      case "scryer-enter": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (gear) gear.ready = false;
        break;
      }
      case "predict-two": {
        const viewed = s.players[p].deck.slice(0, 2);
        const orders =
          viewed.length === 2
            ? [[0, 1], [1, 0], [0], [1], []]
            : viewed.length
              ? [[0], []]
              : [[]];
        options(
          s,
          p,
          orders.map((keep) => ({
            label: keep.length
              ? `Keep ${keep.map((index) => getCard(viewed[index]).name).join(" then ")}${keep.length < viewed.length ? "; recycle the other card" : ""}`
              : viewed.length
                ? "Recycle both revealed cards"
                : "Deck empty: continue",
            effects: [
              special("predict-two-apply", {
                cardName: JSON.stringify({ viewed, keep }),
              }),
              { type: "draw", amount: 1 },
              special("xp"),
            ],
          })),
          ctx,
          false,
        );
        break;
      }
      case "predict-two-apply": {
        const selection = JSON.parse(e.cardName ?? "{}") as {
          viewed: string[];
          keep: number[];
        };
        const deck = s.players[p].deck;
        if (
          !selection.viewed ||
          !selection.keep ||
          !selection.viewed.every((id, index) => deck[index] === id)
        )
          break;
        const original = deck.splice(0, selection.viewed.length);
        const kept = selection.keep.map((index) => original[index]);
        const recycled = original.filter(
          (_, index) => !selection.keep.includes(index),
        );
        s.players[p].deck = [...kept, ...deck, ...recycled];
        break;
      }
      case "xp":
        gainXP(s, p, e.amount ?? 1, ctx);
        break;
      case "root-xp":
        if (source?.location.startsWith("field:")) gainXP(s, p, 2, ctx);
        break;
      case "wuju-draw":
        if (xp(s, p) >= 6) ctx.draw(s, p, 1);
        break;
      case "combat-experience":
        if (unit) unit.temporaryMight += xp(s, p) >= 6 ? 3 : 1;
        break;
      case "double":
        if (source) source.temporaryMight += ctx.getMight(s, source);
        break;
      case "conquest-draw":
        ctx.draw(s, p, 1 + s.fields.filter((f) => f.controller === p).length);
        break;
      case "loyal-poro":
        if (ctx.sourceId && data.deathNotAlone[ctx.sourceId]) {
          delete data.deathNotAlone[ctx.sourceId];
          ctx.draw(s, p, 1);
        }
        break;
      case "broadmane":
        for (const u of s.units)
          if (
            u.owner === p &&
            u.id !== ctx.sourceId &&
            u.location === ctx.locationId
          )
            u.temporaryAssault++;
        break;
      case "retreat":
        if (unit)
          (
            unit as Unit & { deathReplacementTurn?: number }
          ).deathReplacementTurn = s.turn;
        break;
      case "buff-here":
        for (const u of s.units)
          if (u.location === ctx.locationId)
            ctx.runEffects(
              s,
              p,
              [{ type: "buff", target: "anyUnit" }],
              u.id,
              ctx.sourceId,
              ctx.locationId,
            );
        break;
      case "skyward-level":
        if (xp(s, p) >= 6)
          options(
            s,
            p,
            s.units
              .filter((u) => u.owner !== p)
              .map((u) => ({
                label: `Stun ${getCard(u.cardId).name}`,
                targetId: u.id,
                effects: [{ type: "stun", target: "enemyUnit" }],
              })),
            ctx,
            false,
          );
        break;
      case "dread":
        if (
          unit &&
          unit.owner !== p &&
          s.combat?.attacker === unit.owner &&
          s.combat.fieldId === unit.location
        )
          ctx.runEffects(
            s,
            p,
            [{ type: unit.stunned ? "bounce" : "stun", target: "enemyUnit" }],
            unit.id,
            ctx.sourceId,
            ctx.locationId,
          );
        break;
      case "back-off-draw":
        if (!ctx.fromHidden) ctx.draw(s, p, 1);
        break;
      case "iascylla-schedule":
        if (ctx.locationId)
          data.iascylla.push({ owner: p, location: ctx.locationId });
        break;
      case "iascylla-move":
        options(
          s,
          p,
          s.units
            .filter((u) => u.owner !== p && u.location !== ctx.locationId)
            .map((u) => ({
              label: `Move ${getCard(u.cardId).name} here`,
              targetId: u.id,
              effects: [special("move-here")],
              locationId: ctx.locationId,
            })),
          ctx,
        );
        break;
      case "move-here":
        if (unit && ctx.locationId && unit.location !== ctx.locationId)
          ctx.moveUnit(s, unit, ctx.locationId, p);
        break;
      case "mocking-move":
        if (source && ctx.locationId && source.location !== ctx.locationId)
          options(
            s,
            p,
            [
              {
                label: "Move Vex - Mocking to the stunned unit's battlefield",
                effects: [special("move-source")],
              },
            ],
            ctx,
          );
        break;
      case "move-source":
        if (source && ctx.locationId && source.location !== ctx.locationId)
          ctx.moveUnit(s, source, ctx.locationId, p);
        break;
      case "vex-hold":
        if (s.players[p].legendUsedTurn < 0)
          options(
            s,
            p,
            [
              {
                label: "Exhaust Vex - Gloomist to draw 1",
                effects: [special("vex-draw")],
              },
            ],
            ctx,
          );
        break;
      case "vex-draw":
        if (s.players[p].legendUsedTurn < 0) {
          s.players[p].legendUsedTurn = s.turn;
          ctx.draw(s, p, 1);
        }
        break;
      case "vi-conquer":
        if (s.players[p].legendUsedTurn < 0)
          options(
            s,
            p,
            s.units.map((u) => ({
              label: `Exhaust Vi to ready ${getCard(u.cardId).name}`,
              targetId: u.id,
              effects: [special("vi-ready")],
            })),
            ctx,
          );
        break;
      case "vi-ready":
        if (unit && s.players[p].legendUsedTurn < 0) {
          s.players[p].legendUsedTurn = s.turn;
          ctx.runEffects(s, p, [{ type: "ready", target: "anyUnit" }], unit.id);
        }
        break;
      case "yeti-gold":
        if (excess(s) >= 3)
          for (let i = 0; i < 2; i++)
            ctx.spawnToken(s, p, "Gold", base(p), false);
        break;
      case "bird":
        ctx.spawnToken(s, p, "Bird", base(p));
        break;
      case "gauntlets-draw":
        ctx.draw(s, p, e.amount ?? 1);
        break;
      case "apathetic":
        if (unit) {
          ctx.runEffects(
            s,
            p,
            [{ type: "stun", target: "enemyUnit" }],
            unit.id,
          );
          (unit as Unit & { moveLockedTurn?: number }).moveLockedTurn = s.turn;
        }
        break;
      case "amateur":
        options(
          s,
          p,
          s.units
            .filter((u) => u.location.startsWith("field:"))
            .map((u) => ({
              label: `Move ${getCard(u.cardId).name} to base`,
              targetId: u.id,
              effects: [special("move-base")],
            })),
          ctx,
        );
        break;
      case "move-base":
        if (unit) ctx.moveUnit(s, unit, base(unit.owner), p);
        break;
      case "star-spring":
        options(
          s,
          p,
          s.units
            .filter(
              (u) =>
                u.owner === p &&
                u.id !== ctx.sourceId &&
                u.location === ctx.locationId,
            )
            .map((u) => ({
              label: `Move ${getCard(u.cardId).name} to base`,
              targetId: u.id,
              effects: [special("move-base")],
            })),
          ctx,
        );
        break;
      case "valley":
        if (source && ctx.canPay(s, p, 1, 0))
          options(
            s,
            p,
            [
              {
                label: "Pay 1 energy to buff the played unit",
                targetId: source.id,
                effects: [special("valley-pay")],
              },
            ],
            ctx,
          );
        break;
      case "valley-pay":
        if (unit && ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.runEffects(
            s,
            p,
            [{ type: "buff", target: "friendlyUnit" }],
            unit.id,
          );
        }
        break;
      case "ripper":
        if (ctx.canPay(s, p, 1, 0))
          options(
            s,
            p,
            [
              {
                label: "Pay 1 energy to channel a rune exhausted",
                effects: [special("ripper-pay")],
              },
            ],
            ctx,
          );
        break;
      case "ripper-pay":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.channel(s, p, 1, false);
        }
        break;
      case "blast-play":
        options(
          s,
          p,
          s.units
            .filter((u) => u.owner !== p)
            .map((u) => ({
              label: `Move ${getCard(u.cardId).name}`,
              targetId: u.id,
              effects: [
                {
                  type: "moveTarget",
                  target: "enemyUnit",
                  condition: "chooseDestination",
                },
              ],
            })),
          ctx,
        );
        break;
      case "blast-cone": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (gear?.ready && unit)
          options(
            s,
            p,
            [
              {
                label: "Exhaust Blast Cone to stun the moved enemy unit",
                effects: [special("blast-stun", { cardName: unit.id })],
              },
            ],
            ctx,
          );
        break;
      }
      case "blast-stun": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (gear?.ready && unit) {
          gear.ready = false;
          ctx.runEffects(
            s,
            p,
            [{ type: "stun", target: "enemyUnit" }],
            unit.id,
          );
        }
        break;
      }
      case "evelynn":
        if (
          source?.playedFromHidden &&
          s.currentPlayer === p &&
          source?.location.startsWith("field:")
        )
          options(
            s,
            p,
            s.units
              .filter((u) => u.owner !== p && u.location !== source.location)
              .map((u) => ({
                label: `Move ${getCard(u.cardId).name} to Evelynn's battlefield`,
                targetId: u.id,
                locationId: source.location,
                effects: [special("move-here")],
              })),
            ctx,
          );
        break;
      case "nami-play":
        if (source?.additionalCostPaid)
          options(
            s,
            p,
            s.units
              .filter((u) => u.owner !== p)
              .map((u) => ({
                label: `Stun ${getCard(u.cardId).name}`,
                targetId: u.id,
                effects: [{ type: "stun", target: "enemyUnit" }],
              })),
            ctx,
            false,
          );
        break;
      case "nami-hold":
        data.nami[p] = s.turn;
        break;
      default:
        return false;
    }
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const data = state(s);
    const unit = s.units.find((u) => u.id === sourceId);
    if (event === "death" && unit) {
      data.diedTurn = s.turn;
      data.deathNotAlone[unit.id] = s.units.some(
        (u) =>
          u.id !== unit.id &&
          u.owner === unit.owner &&
          u.location === unit.location,
      );
    }
    if (event === "unitPlayed" && unit) {
      if (
        (unit.cardId === unl(35) &&
          s.units.some((u) => u.owner !== p && u.stunned)) ||
        (unit.cardId === unl(8) && data.diedTurn === s.turn) ||
        (unit.cardId === unl(194) && unit.location.startsWith("field:"))
      )
        unit.ready = true;
      if (data.nami[p] === s.turn) {
        delete data.nami[p];
        unit.ready = true;
        ctx.runEffects(
          s,
          p,
          [{ type: "buff", target: "friendlyUnit" }],
          unit.id,
        );
      }
      for (const vex of s.units.filter(
        (u) =>
          u.owner !== p &&
          u.cardId === unl(150) &&
          u.location.startsWith("field:"),
      ))
        ctx.trigger(
          s,
          vex.owner,
          vex.cardId,
          vex.id,
          [special("apathetic", { cardName: unit.id })],
          unit.location,
        );
      const field = s.fields.find((f) => f.id === unit.location);
      if (field?.cardId === unl(215) && !unit.token) {
        const key = `${p}:${field.id}`;
        if (data.firstPlay[key] !== s.turn) {
          data.firstPlay[key] = s.turn;
          trigger(
            s,
            p,
            field.cardId,
            unit.id,
            "star-spring",
            ctx,
            unit.location,
          );
        }
      }
      if (field?.cardId === unl(218))
        trigger(s, p, field.cardId, unit.id, "valley", ctx, unit.location);
    }
    if (event === "play" && cardId === unl(136)) {
      const gear = s.gears.find((g) => g.id === sourceId);
      if (gear) gear.ready = false;
    }
    if (event === "hold") {
      if (s.players[p].legendId === unl(193) && s.players[p].legendUsedTurn < 0)
        trigger(s, p, unl(193), `legend:${p}`, "vex-hold", ctx, locationId);
      if (s.fields.find((f) => f.id === locationId)?.cardId === unl(207))
        trigger(s, p, unl(207), locationId!, "amateur", ctx, locationId);
      if (
        s.units.some(
          (u) =>
            u.owner === p && u.cardId === unl(52) && u.location === locationId,
        )
      )
        data.nami[p] = s.turn;
    }
    if (event === "conquer" && excess(s) >= 3) {
      if (s.players[p].legendId === unl(187))
        trigger(s, p, unl(187), `legend:${p}`, "vi-conquer", ctx, locationId);
      if (s.fields.find((f) => f.id === locationId)?.cardId === unl(217))
        trigger(s, p, unl(217), locationId!, "bird", ctx, locationId);
      for (const u of s.units.filter(
        (u) => u.owner === p && u.location === locationId,
      )) {
        const count = attached(s, u, unl(188));
        if (count)
          trigger(s, p, unl(188), u.id, "gauntlets-draw", ctx, locationId, {
            amount: count,
          });
      }
    }
    if (
      event === "stun" &&
      unit &&
      unit.owner !== p &&
      unit.location.startsWith("field:")
    )
      for (const vex of s.units.filter(
        (u) =>
          u.owner === p && u.cardId === unl(55) && u.location !== unit.location,
      ))
        trigger(s, p, vex.cardId, vex.id, "mocking-move", ctx, unit.location);
    if (event === "move" && unit && unit.owner !== p)
      for (const gear of s.gears.filter(
        (g) => g.owner === p && g.cardId === unl(133) && g.ready,
      ))
        ctx.trigger(
          s,
          p,
          gear.cardId,
          gear.id,
          [special("blast-cone", { cardName: unit.id })],
          unit.location,
        );
    if (
      (event as string) === "bounce" &&
      s.fields.find((f) => f.id === locationId)?.cardId === unl(214)
    )
      trigger(
        s,
        p,
        unl(214),
        sourceId ?? locationId!,
        "ripper",
        ctx,
        locationId,
      );
    if (event === "main") {
      const pending = data.iascylla.filter((item) => item.owner === p);
      data.iascylla = data.iascylla.filter((item) => item.owner !== p);
      for (const item of pending)
        trigger(
          s,
          p,
          unl(50),
          `iascylla:${item.location}`,
          "iascylla-move",
          ctx,
          item.location,
        );
    }
  },
  actions(s, p, ctx) {
    const out: GameAction[] = [];
    const main = s.phase === "main" && s.currentPlayer === p && !s.stack.length;
    const action = main || (s.phase === "showdown" && !s.stack.length);
    const add = (
      key: string,
      sourceId: string,
      label: string,
      targetId?: string,
    ) =>
      out.push({
        id: `unl:${key}:${sourceId}:${targetId ?? ""}`,
        label,
        category: "ability",
        player: p,
        sourceId,
        targetId,
        abilityKey: key,
      });
    for (const u of s.units.filter((u) => u.owner === p)) {
      if (main && u.cardId === unl(126) && xp(s, p) >= 3)
        add("megatusk", u.id, "Spend 3 XP: friendly units here gain Ganking");
      if (
        main &&
        u.ready &&
        s.fields.find((f) => f.id === u.location)?.cardId === unl(213)
      )
        add("garden", u.id, "Exhaust to gain 1 XP");
      if (
        main &&
        u.ready &&
        u.cardId === unl(26) &&
        u.location.startsWith("field:")
      )
        for (const target of s.units) {
          const tax = ctx.targetTax?.(s, p, target.id) ?? 0;
          if (
            (target.owner !== p && target.untargetableByEnemy) ||
            !ctx.canPay(s, p, 0, 1, ["Fury"], tax)
          )
            continue;
          add(
            "xerath",
            u.id,
            `Deal 3 to ${getCard(target.cardId).name}`,
            target.id,
          );
        }
      if (action && u.ready && u.cardId === unl(194))
        for (const target of s.units.filter(
          (t) =>
            t.owner !== p &&
            !t.untargetableByEnemy &&
            t.location === u.location &&
            s.combat?.attacker === t.owner &&
            s.combat.fieldId === t.location,
        )) {
          const tax = ctx.targetTax?.(s, p, target.id) ?? 0;
          if (ctx.canPay(s, p, 1, 0, [], 1 + tax))
            add(
              "shadow",
              u.id,
              `Stun attacking ${getCard(target.cardId).name}`,
              target.id,
            );
        }
    }
    for (const gear of s.gears.filter((g) => g.owner === p && g.ready)) {
      if (action && gear.cardId === unl(161))
        for (const target of s.units) {
          const tax = ctx.targetTax?.(s, p, target.id) ?? 0;
          if (
            (target.owner !== p && target.untargetableByEnemy) ||
            !ctx.canPay(s, p, 0, 0, [], tax)
          )
            continue;
          add(
            "shells",
            gear.id,
            `Kill Divining Shells: +2 Might to ${getCard(target.cardId).name}`,
            target.id,
          );
        }
      if (main && gear.cardId === unl(136) && ctx.canPay(s, p, 1, 0))
        add(
          "scryer",
          gear.id,
          "Kill Scryer's Bloom: Predict 2, draw 1, gain 1 XP",
        );
    }
    return out;
  },
  apply(s, action, ctx) {
    if (!action.id.startsWith("unl:")) return false;
    const p = action.player,
      source = s.units.find((u) => u.id === action.sourceId),
      gear = s.gears.find((g) => g.id === action.sourceId),
      target = s.units.find((u) => u.id === action.targetId),
      tax = ctx.targetTax?.(s, p, action.targetId) ?? 0;
    const canChoose =
      target && (target.owner === p || !target.untargetableByEnemy);
    const chosen = () => {
      if (target)
        ctx.cardEvent(
          s,
          "target",
          p,
          target.cardId,
          target.id,
          target.location,
        );
    };
    switch (action.abilityKey) {
      case "garden":
        if (source?.ready) {
          source.ready = false;
          gainXP(s, p, 1, ctx);
        }
        break;
      case "megatusk":
        if (source && xp(s, p) >= 3) {
          gainXP(s, p, -3, ctx);
          for (const u of s.units)
            if (u.owner === p && u.location === source.location)
              u.temporaryKeywords = [
                ...new Set([...(u.temporaryKeywords ?? []), "Ganking"]),
              ];
        }
        break;
      case "xerath":
        if (
          source?.ready &&
          canChoose &&
          ctx.canPay(s, p, 0, 1, ["Fury"], tax)
        ) {
          source.ready = false;
          ctx.pay(s, p, 0, 1, ["Fury"], tax);
          ctx.pushStack(s, {
            player: p,
            cardId: source.cardId,
            sourceId: source.id,
            targetId: action.targetId,
            kind: "ability",
            effects: [{ type: "damage", amount: 3, target: "anyUnit" }],
          });
          chosen();
        }
        break;
      case "shadow":
        if (source?.ready && canChoose && ctx.canPay(s, p, 1, 0, [], 1 + tax)) {
          source.ready = false;
          ctx.pay(s, p, 1, 0, [], 1 + tax);
          ctx.pushStack(s, {
            player: p,
            cardId: source.cardId,
            sourceId: source.id,
            targetId: action.targetId,
            kind: "ability",
            effects: [{ type: "stun", target: "enemyUnit" }],
          });
          chosen();
        }
        break;
      case "shells":
        if (gear?.ready && canChoose && ctx.canPay(s, p, 0, 0, [], tax)) {
          ctx.pay(s, p, 0, 0, [], tax);
          ctx.killGear(s, gear.id);
          ctx.pushStack(s, {
            player: p,
            cardId: gear.cardId,
            sourceId: gear.id,
            targetId: action.targetId,
            kind: "ability",
            effects: [{ type: "might", amount: 2, target: "anyUnit" }],
          });
          chosen();
        }
        break;
      case "scryer":
        if (gear?.ready) {
          ctx.pay(s, p, 1, 0);
          ctx.killGear(s, gear.id);
          ctx.pushStack(s, {
            player: p,
            cardId: gear.cardId,
            sourceId: gear.id,
            kind: "ability",
            effects: [special("predict-two")],
          });
        }
        break;
    }
    return true;
  },
};
