import { cards, getCard, type Card } from "../data/cards";
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
import { getScript } from "./scripts";

const plain: CardScript = { implemented: true };
const sf = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `sfd:${custom}`,
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
const weaponmaster = {
  ...plain,
  onPlay: [sf("weaponmaster", { target: "friendlyEquipment", optional: true })],
  keywords: ["Weaponmaster"],
};
/** Gear Might and inherited effects checked against Riot's card images; see PRECON-SOURCES.md. */
export const spiritforgedScripts: Record<string, CardScript> = {
  "sfd-205-221": plain,
  "sfd-180-221": plain,
  "sfd-110-221": plain,
  "sfd-103-221": { ...plain, accelerating: true },
  "sfd-156-221": { ...plain, assault: 2, keywords: ["Assault 2"] },
  "sfd-113-221": { ...weaponmaster, onConquer: [sf("lucian-ready")] },
  "sfd-099-221": weaponmaster,
  "sfd-093-221": {
    ...plain,
    notes: "May be played to an occupied enemy battlefield.",
  },
  "sfd-167-221": plain,
  "sfd-157-221": {
    ...plain,
    onPlay: [
      { type: "token", cardName: "Sand Soldier", location: "here", amount: 1 },
    ],
  },
  "sfd-116-221": weaponmaster,
  "sfd-097-221": spell(
    [{ type: "might", amount: 5, target: "anyUnit" }],
    "action",
  ),
  "sfd-107-221": spell([sf("strike-down", { target: "duel" })]),
  "ogn-229-298": spell([{ type: "kill", target: "anyUnit" }]),
  "sfd-206-221": spell([sf("riposte", { target: "unitAndSpell" })], "reaction"),
  "sfd-106-221": spell([sf("show-strength")], "reaction"),
  "sfd-161-221": { ...plain, gearMight: 3, equipCost: 1 },
  "sfd-108-221": { ...plain, gearMight: 1, equipCost: 1 },
  "sfd-172-221": { ...plain, gearMight: 1, equipCost: 1 },
  "sfd-095-221": { ...plain, gearMight: 2, equipCost: 1 },
  "sfd-022-221": {
    ...plain,
    reaction: true,
    gearMight: 2,
    equipCost: 1,
    onPlay: [sf("quick-draw")],
  },
  "sfd-213-221": plain,
  "sfd-221-221": plain,
  "sfd-218-221": plain,
  "sfd-181-221": plain,
  "sfd-089-221": {
    ...plain,
    onHold: [{ type: "token", cardName: "Mech", amount: 1 }],
  },
  "sfd-021-221": {
    ...plain,
    onDeath: [{ type: "token", cardName: "Mech", amount: 2 }],
  },
  "sfd-026-221": { ...plain, onConquer: [sf("rumble-recycle")] },
  "sfd-007-221": {
    ...plain,
    onPlay: [{ type: "keyword", keyword: "Ganking", target: "anyUnit" }],
  },
  "ogn-016-298": {
    ...plain,
    onPlay: [
      { type: "might", amount: 2, target: "anyUnit", condition: "legion" },
    ],
  },
  "sfd-065-221": plain,
  "sfd-062-221": { ...plain, onPlay: [sf("bubble-ready")] },
  "sfd-069-221": { ...plain, onConquer: [sf("gold")] },
  "sfd-071-221": plain,
  "sfd-070-221": {
    ...spell(
      [{ type: "damage", amount: 3, target: "unitAtBattlefield" }, sf("gold")],
      "action",
    ),
    hidden: true,
  },
  "sfd-066-221": {
    ...spell([{ type: "might", amount: -2, target: "anyUnit" }], "reaction"),
    repeat: { energy: 2 },
  },
  "sfd-076-221": spell([
    { type: "token", cardName: "Mech", amount: 1 },
    { type: "draw", amount: 1 },
  ]),
  "sfd-182-221": {
    ...spell([sf("danger-zone")], "reaction"),
    repeat: { energy: 1, power: 1 },
  },
  "sfd-019-221": {
    ...plain,
    notes:
      "Pay one energy, Fury power, exhaust and recycle a unit from trash to make a Mech.",
  },
  "sfd-212-221": plain,
  "sfd-215-221": plain,
  "sfd-220-221": plain,
};
for (const token of cards.filter(
  (c) =>
    c.set === "SFD" &&
    ["Mech", "Sand Soldier", "Gold"].some(
      (name) => c.name === name || c.name.startsWith(name + " //"),
    ),
))
  spiritforgedScripts[token.id] = plain;

type SpiritState = GameState & {
  spiritMighty?: Record<string, boolean>;
  spiritGearTurn?: Record<string, number>;
  spiritUncontrolled?: Record<string, boolean>;
  spiritPeerlessBonus?: Record<string, number>;
};
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const mech = (u: Unit) => getCard(u.cardId).tags.includes("Mech");
const mighty = (s: GameState, p: PlayerId, ctx: PreconContext) =>
  own(s, p).filter((u) => ctx.getMight(s, u) >= 5);
const base = (p: PlayerId): LocationId => `base:${p}`;
const option = (
  p: PlayerId,
  key: string,
  label: string,
  effects: Effect[],
  extra: Partial<GameAction> = {},
): GameAction => ({
  id: `choose-custom:sfd:${key}`,
  player: p,
  label,
  category: "ability",
  effects,
  ...extra,
});
function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: GameAction[],
  optional = true,
) {
  if (!options.length) return;
  ctx.openChoice(s, p, {
    options: [
      ...options,
      ...(optional
        ? [option(p, "decline", "Decline optional ability", [])]
        : []),
    ],
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
  });
}
function attach(
  s: GameState,
  gearId: string,
  unitId: string,
  ctx: PreconContext,
) {
  const g = s.gears.find((g) => g.id === gearId),
    u = s.units.find((u) => u.id === unitId);
  if (!g || !u || g.owner !== u.owner) return;
  for (const other of s.units)
    other.gear = other.gear.filter((id) => id !== g.id);
  g.attachedTo = u.id;
  u.gear.push(g.id);
  ctx.cardEvent(s, "attach", u.owner, g.cardId, g.id, u.location);
}
function detach(s: GameState, gearId: string) {
  const g = s.gears.find((g) => g.id === gearId);
  if (!g) return;
  for (const u of s.units) u.gear = u.gear.filter((id) => id !== gearId);
  delete g.attachedTo;
}
function hasEquip(c: Card) {
  return c.tags.includes("Equipment");
}
function weaponmasterCost(
  s: GameState,
  cardId: string,
  unit: Unit,
  ctx: PreconContext,
) {
  const script = getScript(cardId);
  if (script?.equipCost === undefined) return null;
  return {
    energy: Math.max(
      0,
      (script.equipEnergy ?? 0) -
        (cardId === "unl-188-219" ? ctx.getMight(s, unit) : 0),
    ),
    power: Math.max(0, script.equipCost - 1),
  };
}
function printedMight(s: GameState, u: Unit) {
  let n =
    (getCard(u.cardId).might ?? 0) +
    u.buff * (1 + (s.players[u.owner].buffBonus ?? 0)) +
    u.temporaryMight;
  for (const id of u.gear)
    n +=
      spiritforgedScripts[s.gears.find((g) => g.id === id)?.cardId ?? ""]
        ?.gearMight ?? 0;
  if (mech(u))
    n += own(s, u.owner).filter((x) => x.cardId === "sfd-089-221").length;
  return n;
}
function detectMighty(s: SpiritState, ctx: PreconContext) {
  const old = s.spiritMighty ?? {};
  const next: Record<string, boolean> = {};
  for (const u of s.units) {
    const now = ctx.getMight(s, u) >= 5;
    next[u.id] = now;
    if (!now || old[u.id]) continue;
    const p = u.owner;
    if (
      s.players[p].legendId === "sfd-205-221" &&
      s.players[p].legendUsedTurn < 0
    )
      ctx.trigger(
        s,
        p,
        "sfd-205-221",
        "legend",
        [sf("fiora-channel", { cardName: u.id })],
        u.location,
      );
    for (const f of own(s, p).filter((x) => x.cardId === "sfd-180-221"))
      ctx.trigger(
        s,
        p,
        f.cardId,
        f.id,
        [sf("worthy-ready", { cardName: u.id })],
        u.location,
      );
  }
  s.spiritMighty = next;
}

export const spiritforgedModule: ExpansionModule = {
  might(s, u, value) {
    if (mech(u)) {
      value += own(s, u.owner).filter((x) => x.cardId === "sfd-089-221").length;
      if (s.combat?.fieldId === u.location && (s.combat.engaged ?? true)) {
        if (s.combat.attacker === u.owner)
          value += own(s, u.owner).filter(
            (x) => x.cardId === "sfd-026-221",
          ).length;
        if (
          s.combat.defender === u.owner &&
          s.players[u.owner].legendId === "sfd-181-221"
        )
          value++;
      }
    }
    return value;
  },
  keywords(s, u) {
    if (!mech(u)) return [];
    return [
      ...own(s, u.owner)
        .filter((x) => x.cardId === "sfd-071-221")
        .flatMap(() => ["Deflect", "Ganking"]),
      ...own(s, u.owner)
        .filter((x) => x.cardId === "sfd-065-221")
        .map(() => "Vision"),
      ...own(s, u.owner)
        .filter((x) => x.cardId === "sfd-026-221")
        .map(() => "Assault"),
      ...(s.players[u.owner].legendId === "sfd-181-221" ? ["Shield"] : []),
    ];
  },
  cost(s, p, c, ctx) {
    let energy = 0;
    if (c.id === "sfd-076-221" && own(s, p).some(mech)) energy -= 2;
    if (c.id === "sfd-103-221")
      energy -=
        2 *
        own(s, p).filter(
          (u) => (ctx?.getMight(s, u) ?? printedMight(s, u)) >= 5,
        ).length;
    if (
      c.type === "Gear" &&
      !c.tags.includes("Token") &&
      s.fields.some((f) => f.cardId === "sfd-213-221" && f.controller === p) &&
      (s as SpiritState).spiritGearTurn?.[p] !== s.turn
    )
      energy--;
    return { energy };
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("sfd:")) return false;
    const [key, ...arg] = e.custom.slice(4).split("|");
    const source = s.units.find((u) => u.id === ctx.sourceId);
    switch (key) {
      case "gold":
        ctx.spawnToken(s, p, "Gold", base(p), false);
        break;
      case "danger-zone":
        for (const u of own(s, p).filter(mech)) u.temporaryMight++;
        break;
      case "peerless":
        if (source && s.combat?.fieldId === source.location) {
          const bonus = ctx.getMight(s, source);
          ((s as SpiritState).spiritPeerlessBonus ??= {})[source.id] = bonus;
          source.temporaryMight += bonus;
        }
        break;
      case "show-strength":
        ctx.draw(s, p, mighty(s, p, ctx).length);
        break;
      case "bubble-ready":
        choose(
          s,
          p,
          ctx,
          own(s, p)
            .filter((u) => u.id !== ctx.sourceId && mech(u))
            .map((u) =>
              option(
                p,
                `bubble:${u.id}`,
                `Ready ${getCard(u.cardId).name}`,
                [{ type: "ready", target: "friendlyUnit" }],
                { targetId: u.id },
              ),
            ),
          false,
        );
        break;
      case "weaponmaster": {
        // Equipment is declared while the trigger is finalized. Its discounted
        // payment is an instruction on resolution, not a leading trigger cost.
        const g = s.gears.find((g) => g.id === ctx.targetId && g.owner === p);
        if (!source || !g || !hasEquip(getCard(g.cardId))) break;
        const cost = weaponmasterCost(s, g.cardId, source, ctx);
        if (
          cost &&
          ctx.canPay(s, p, cost.energy, cost.power, getCard(g.cardId).domains)
        ) {
          if (cost.energy || cost.power)
            ctx.pay(s, p, cost.energy, cost.power, getCard(g.cardId).domains);
          attach(s, g.id, source.id, ctx);
        }
        break;
      }
      case "quick-draw": {
        const g = s.gears.find((g) => g.id === ctx.sourceId);
        if (g)
          choose(
            s,
            p,
            ctx,
            own(s, p).map((u) =>
              option(
                p,
                `quick:${u.id}`,
                `Attach to ${getCard(u.cardId).name}`,
                [sf(`attach|${g.id}|${u.id}`)],
              ),
            ),
            false,
          );
        break;
      }
      case "attach":
        attach(s, arg[0], arg[1], ctx);
        break;
      case "detach":
        detach(s, arg[0]);
        break;
      case "warmog": {
        const unit = s.units.find((x) => x.id === e.cardName);
        if (unit)
          ctx.runEffects(
            s,
            p,
            [{ type: "buff", target: "friendlyUnit" }],
            unit.id,
            unit.id,
          );
        break;
      }
      case "fiora-channel":
        if (s.players[p].legendUsedTurn < 0)
          choose(s, p, ctx, [
            option(p, "channel", "Exhaust Fiora to channel a rune exhausted", [
              sf("pay-fiora"),
            ]),
          ]);
        break;
      case "pay-fiora":
        if (s.players[p].legendUsedTurn < 0) {
          s.players[p].legendUsedTurn = s.turn;
          ctx.channel(s, p, 1, false);
        }
        break;
      case "worthy-ready":
        if (
          s.units.some((u) => u.id === e.cardName) &&
          ctx.canPay(s, p, 0, 1, ["Order"])
        )
          choose(s, p, ctx, [
            option(p, "worthy", "Pay Order power to ready the Mighty unit", [
              sf(`pay-worthy|${e.cardName}`),
            ]),
          ]);
        break;
      case "pay-worthy": {
        const u = s.units.find((u) => u.id === arg[0]);
        if (u && ctx.canPay(s, p, 0, 1, ["Order"])) {
          ctx.pay(s, p, 0, 1, ["Order"]);
          ctx.runEffects(
            s,
            p,
            [{ type: "ready", chosenTargetId: u.id }],
            undefined,
            ctx.sourceId,
            u.location,
          );
        }
        break;
      }
      case "lucian-ready":
        if (source && !source.usedAbilities?.includes(`lucian:${s.turn}`)) {
          source.ready = true;
          (source.usedAbilities ??= []).push(`lucian:${s.turn}`);
        }
        break;
      case "yone-damage": {
        const u = s.units.find((u) => u.id === ctx.targetId);
        if (u?.owner !== p && u?.location.startsWith("base:"))
          ctx.runEffects(
            s,
            p,
            [
              {
                type: "damage",
                amount: source ? ctx.getMight(s, source) : e.amount,
                target: "enemyUnit",
              },
            ],
            u.id,
            ctx.sourceId,
          );
        break;
      }
      case "strike-down": {
        const [a, b] = (ctx.targetId ?? "").split("~");
        const u = s.units.find((u) => u.id === a),
          v = s.units.find((u) => u.id === b);
        if (u?.owner !== p || !v || v.owner === p || !u.gear.length) break;
        const equipment = u.gear.filter((id) =>
          hasEquip(getCard(s.gears.find((g) => g.id === id)!.cardId)),
        );
        if (!equipment.length) break;
        ctx.runEffects(
          s,
          p,
          [
            {
              type: "damage",
              amount: ctx.getMight(s, u),
              damageSource: "unit",
              target: "enemyUnit",
            },
          ],
          v.id,
          u.id,
        );
        choose(
          s,
          p,
          ctx,
          equipment.map((id) =>
            option(p, `detach:${id}`, "Detach equipment", [sf(`detach|${id}`)]),
          ),
          false,
        );
        break;
      }
      case "riposte": {
        const [unitId, spellId] = (ctx.targetId ?? "").split("~");
        const index = s.stack.findIndex(
          (x) => x.id === spellId && x.kind === "spell",
        );
        const u = s.units.find((u) => u.id === unitId && u.owner === p);
        if (index >= 0) {
          const item = s.stack[index];
          if (u) u.temporaryMight += getCard(item.cardId).energy ?? 0;
          if (getScript(item.cardId)?.uncounterable) break;
          s.stack.splice(index, 1);
          if (item.flowed) {
            s.players[item.player].banished.push(item.cardId);
            ctx.cardEvent(s, "banish", item.player, item.cardId);
          } else s.players[item.player].discard.push(item.cardId);
        }
        break;
      }
      case "sunken":
        if (ctx.canPay(s, p, 1, 0))
          choose(s, p, ctx, [
            option(p, "sunken", "Pay 1 energy to draw 1", [sf("pay-sunken")]),
          ]);
        break;
      case "pay-sunken":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.draw(s, p, 1);
        }
        break;
      case "treasure":
        if (ctx.canPay(s, p, 1, 0))
          choose(s, p, ctx, [
            option(p, "treasure", "Pay 1 energy for an exhausted Gold", [
              sf("pay-treasure"),
            ]),
          ]);
        break;
      case "pay-treasure":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.spawnToken(s, p, "Gold", base(p), false);
        }
        break;
      case "veiled":
        choose(
          s,
          p,
          ctx,
          s.gears
            .filter((g) => g.owner === p)
            .map((g) =>
              option(p, `veiled:${g.id}`, `Ready ${getCard(g.cardId).name}`, [
                sf(`veiled-ready|${g.id}`),
              ]),
            ),
        );
        break;
      case "veiled-ready": {
        const g = s.gears.find((g) => g.id === arg[0]);
        if (g) {
          g.ready = true;
          if (hasEquip(getCard(g.cardId)) && g.attachedTo)
            choose(s, p, ctx, [
              option(p, "veiled-detach", "Detach the Equipment", [
                sf(`detach|${g.id}`),
              ]),
            ]);
        }
        break;
      }
      case "conservatory": {
        const id = s.players[p].deck[0];
        if (id) {
          ctx.log?.(s, `Ravenbloom Conservatory reveals ${getCard(id).name}.`);
          if (getCard(id).type === "Spell")
            s.players[p].hand.push(s.players[p].deck.shift()!);
          else s.players[p].deck.push(s.players[p].deck.shift()!);
        }
        break;
      }
      case "rumble-recycle": {
        const options: GameAction[] = [];
        for (const u of own(s, p).filter((u) => u.id !== ctx.sourceId))
          for (const id of [...new Set(s.players[p].discard)]) {
            const c = getCard(id);
            if (c.type !== "Unit" || !c.tags.includes("Mech")) continue;
            const cost = Math.max(0, (c.energy ?? 0) - ctx.getMight(s, u));
            if (!ctx.canPay(s, p, cost, c.power ?? 0, c.domains)) continue;
            for (const loc of [
              base(p),
              ...s.fields.filter((f) => f.controller === p).map((f) => f.id),
            ])
              options.push(
                option(
                  p,
                  `rumble:${u.id}:${id}:${loc}`,
                  `Recycle ${getCard(u.cardId).name}; play ${c.name} at ${loc}`,
                  [sf(`rumble-play|${u.id}|${id}|${loc}`, { amount: cost })],
                ),
              );
          }
        choose(s, p, ctx, options);
        break;
      }
      case "rumble-play": {
        const [uid, id, loc] = arg;
        const u = s.units.find((u) => u.id === uid);
        const c = getCard(id);
        const index = s.players[p].discard.indexOf(id);
        if (
          !u ||
          u.owner !== p ||
          index < 0 ||
          !ctx.canPay(s, p, e.amount ?? 0, c.power ?? 0, c.domains)
        )
          break;
        ctx.pay(s, p, e.amount ?? 0, c.power ?? 0, c.domains);
        for (const gid of [...u.gear]) detach(s, gid);
        s.units = s.units.filter((x) => x.id !== uid);
        if (!u.token) s.players[p].deck.push(u.cardId);
        s.players[p].discard.splice(index, 1);
        ctx.playUnit(s, p, id, loc as LocationId, false);
        ctx.log?.(
          s,
          `Rumble recycles ${getCard(u.cardId).name} and plays ${c.name}.`,
          "play",
          p,
        );
        break;
      }
      case "assembly":
        ctx.spawnToken(s, p, "Mech", base(p));
        break;
      default:
        return false;
    }
    detectMighty(s, ctx);
    return true;
  },
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const u = s.units.find((u) => u.id === sourceId);
    if (
      event === "play" &&
      getCard(cardId).type === "Gear" &&
      !getCard(cardId).name.startsWith("Gold //") &&
      !s.gears.find((g) => g.id === sourceId)?.token &&
      !getCard(cardId).tags.includes("Token")
    )
      ((s as SpiritState).spiritGearTurn ??= {})[p] = s.turn;
    if (event === "unitPlayed" && u) {
      if (
        cardId === "sfd-071-221" &&
        own(s, p).some((x) => x.id !== u.id && mech(x))
      )
        u.ready = true;
      if (mech(u))
        for (const forecaster of own(s, p).filter(
          (x) => x.cardId === "sfd-065-221",
        ))
          ctx.trigger(
            s,
            p,
            forecaster.cardId,
            u.id,
            [{ type: "predict", amount: 1 }],
            u.location,
          );
    }
    if (event === "showdownStart" && locationId) {
      // January 2026 Yone erratum checks control before conquest, including surprise defense.
      ((s as SpiritState).spiritUncontrolled ??= {})[locationId] =
        s.fields.find((f) => f.id === locationId)?.controller === null;
    }
    if (event === "combatStart" && locationId) {
      const at = s.units.filter((u) => u.location === locationId);
      const foes = at.filter((u) => u.owner !== p);
      if (at.filter((x) => x.owner === p).length === 1 && foes.length === 1)
        for (const f of at.filter((x) => x.cardId === "sfd-110-221"))
          ctx.trigger(s, f.owner, f.cardId, f.id, [sf("peerless")], f.location);
      const field = s.fields.find((f) => f.id === locationId);
      if (field?.cardId === "sfd-215-221" && s.combat?.engaged)
        ctx.trigger(
          s,
          s.combat.defender,
          field.cardId,
          field.id,
          [sf("conservatory")],
          field.id,
        );
    }
    if (event === "combatEnd") {
      for (const [id, bonus] of Object.entries(
        (s as SpiritState).spiritPeerlessBonus ?? {},
      )) {
        const unit = s.units.find((u) => u.id === id);
        if (unit) unit.temporaryMight -= bonus;
      }
      (s as SpiritState).spiritPeerlessBonus = {};
    }
    if (event === "death" && u) {
      if (cardId === "sfd-167-221" && ctx.getMight(s, u) >= 5)
        ctx.trigger(
          s,
          p,
          cardId,
          u.id,
          [{ type: "draw", amount: 2 }],
          u.location,
        );
      for (const g of s.gears.filter(
        (g) => u.gear.includes(g.id) && g.cardId === "sfd-172-221",
      ))
        ctx.trigger(
          s,
          p,
          g.cardId,
          u.id,
          [{ type: "draw", amount: 1 }],
          u.location,
        );
    }
    if (event === "conquer" && u) {
      for (const g of s.gears.filter(
        (g) => u.gear.includes(g.id) && g.cardId === "sfd-108-221",
      ))
        ctx.trigger(
          s,
          p,
          g.cardId,
          u.id,
          [sf("warmog", { cardName: u.id })],
          u.location,
        );
    }
    if (event === "conquer" && locationId && !u) {
      if ((s as SpiritState).spiritUncontrolled?.[locationId])
        for (const winner of own(s, p).filter(
          (x) => x.location === locationId && x.cardId === "sfd-116-221",
        ))
          ctx.trigger(
            s,
            p,
            winner.cardId,
            winner.id,
            [
              sf("yone-damage", {
                amount: ctx.getMight(s, winner),
                target: "enemyUnitInBase",
              }),
            ],
            locationId,
          );
      for (const winner of own(s, p).filter((x) => x.location === locationId))
        for (const g of s.gears.filter(
          (g) => winner.gear.includes(g.id) && g.cardId === "sfd-108-221",
        ))
          ctx.trigger(
            s,
            p,
            g.cardId,
            winner.id,
            [sf("warmog", { cardName: winner.id })],
            locationId,
          );
      const field = s.fields.find((f) => f.id === locationId);
      if (field) {
        const effects: Record<string, Effect[]> = {
          "sfd-212-221": [{ type: "mill", amount: 2 }],
          "sfd-220-221": [sf("treasure")],
          "sfd-221-221": [sf("veiled")],
          "sfd-218-221": own(s, p).some(
            (x) => x.location === locationId && ctx.getMight(s, x) >= 5,
          )
            ? [sf("sunken")]
            : [],
        };
        if (effects[field.cardId]?.length)
          ctx.trigger(
            s,
            p,
            field.cardId,
            field.id,
            effects[field.cardId],
            locationId,
          );
      }
    }
    if (event !== "death") detectMighty(s, ctx);
  },
  actions(s, p, ctx) {
    if (
      s.priorityPlayer !== p ||
      s.phase !== "main" ||
      s.currentPlayer !== p ||
      s.stack.length
    )
      return [];
    const out: GameAction[] = [];
    for (const g of s.gears.filter(
      (g) => g.owner === p && g.ready && g.cardId === "sfd-019-221",
    ))
      if (ctx.canPay(s, p, 1, 1, ["Fury"]))
        for (const id of [...new Set(s.players[p].discard)].filter(
          (id) => getCard(id).type === "Unit",
        ))
          out.push({
            id: `sfd-assembly|${g.id}|${id}`,
            player: p,
            label: `Assembly Rig: recycle ${getCard(id).name} for a Mech`,
            category: "ability",
            sourceId: g.id,
            cardId: g.cardId,
            targetId: id,
          });
    return out;
  },
  apply(s, a, ctx) {
    if (!a.id.startsWith("sfd-assembly|")) return false;
    const g = s.gears.find((g) => g.id === a.sourceId);
    const index = s.players[a.player].discard.indexOf(a.targetId ?? "");
    if (
      !g?.ready ||
      g.owner !== a.player ||
      index < 0 ||
      getCard(a.targetId!).type !== "Unit" ||
      !ctx.canPay(s, a.player, 1, 1, ["Fury"])
    )
      return true;
    ctx.pay(s, a.player, 1, 1, ["Fury"]);
    g.ready = false;
    s.players[a.player].deck.push(
      s.players[a.player].discard.splice(index, 1)[0],
    );
    ctx.pushStack(s, {
      player: a.player,
      cardId: g.cardId,
      sourceId: g.id,
      effects: [sf("assembly")],
      kind: "ability",
    });
    return true;
  },
};
