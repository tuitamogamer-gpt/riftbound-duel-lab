import { getKeywords } from "./engine";
import { getScript } from "./scripts";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  PlayerId,
} from "./types";

const plain: CardScript = { implemented: true };
const fx = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave5:${custom}`,
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
const weaponmaster: CardScript = {
  ...plain,
  keywords: ["Weaponmaster"],
  onPlay: [
    {
      type: "special",
      custom: "sfd:weaponmaster",
      target: "friendlyEquipment",
      optional: true,
    },
  ],
};

export const cardWave5Scripts: Record<string, CardScript> = {
  "ogn-018-298": plain,
  "ogn-029-298": spell([fx("falling-star", { target: "twoUnitChoices" })]),
  "ogn-145-298": spell([fx("prevent-effects")], "reaction"),
  "ogn-161-298": {
    ...plain,
    deflect: 1,
    keywords: ["Play to enemy battlefields"],
  },
  "ogn-189-298": { ...plain, keywords: ["Ganking"] },
  "ogn-193-298": { ...plain, keywords: ["Play to open battlefields"] },
  "ogn-220-298": {
    ...spell([fx("facebreaker", { target: "duelSameBattlefield" })], "action"),
    hidden: true,
  },
  "ogn-260-298": spell(
    [fx("last-breath", { target: "duelEnemyAtBattlefield" })],
    "action",
  ),
  "ogn-261-298": plain,
  "ogn-278-298": plain,
  "ogn-286-298": plain,
  "ogn-287-298": { ...plain, onConquer: [fx("recycle-rune")] },
  "sfd-002-221": { ...weaponmaster, accelerating: true },
  "sfd-008-221": weaponmaster,
  "sfd-025-221": {
    ...plain,
    reaction: true,
    assault: 2,
    keywords: ["Assault 2", "Play to attacking battlefield"],
  },
  "sfd-053-221": {
    ...plain,
    reaction: true,
    onPlay: [fx("janna", { target: "upToOneEnemyUnitHere" })],
  },
  "sfd-085-221": { ...weaponmaster, deflect: 2 },
  "sfd-092-221": weaponmaster,
  "sfd-119-221": weaponmaster,
  "sfd-127-221": weaponmaster,
  "sfd-145-221": {
    ...spell(
      [fx("swap-might", { target: "twoUnitsSameBattlefield" })],
      "action",
    ),
    hidden: true,
  },
  "sfd-194-221": spell(
    [fx("prevent-next", { target: "anyUnit" }), { type: "draw" }],
    "reaction",
  ),
  "unl-013-219": {
    ...spell([fx("double-damage", { target: "anyUnit" })], "reaction"),
    hidden: true,
  },
  "unl-083-219": {
    ...spell(
      [
        fx("smoke-mirrors", { target: "twoFriendlyDifferentLocations" }),
        { type: "draw" },
      ],
      "action",
    ),
    hidden: true,
  },
  "unl-112-219": {
    ...plain,
    onMove: [
      fx("faefolk", {
        target: "enemyUnit",
        condition: "atBattlefield",
        optional: true,
      }),
    ],
  },
};

function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: { label: string; effects: Effect[] }[],
) {
  if (!options.length) return;
  ctx.openChoice(s, p, {
    sourceId: ctx.sourceId,
    targetId: ctx.targetId,
    locationId: ctx.locationId,
    options: options.map((o, i): GameAction => ({
      ...o,
      id: `choose-custom:wave5:${s.nextId++}:${i}`,
      category: "ability",
      player: p,
    })),
  });
}

export const cardWave5Module: ExpansionModule = {
  might(s, u, value) {
    if (u.cardId === "sfd-085-221")
      return value + s.gears.filter((g) => g.owner === u.owner).length;
    return value;
  },
  keywords(s, u) {
    return u.cardId === "ogn-189-298" &&
      u.movesTurn === s.turn &&
      (u.movesThisTurn ?? 0) >= 2
      ? ["Prevent all damage"]
      : [];
  },
  event(s, event, p, _cardId, sourceId, locationId, ctx) {
    const source = s.units.find((u) => u.id === sourceId);
    if (
      event === "stun" &&
      source &&
      source.owner !== p &&
      s.players[p].legendId === "ogn-261-298"
    )
      ctx.trigger(s, p, "ogn-261-298", "legend", [
        { type: "buff", target: "friendlyUnit" },
      ]);
    if (event === "attach") {
      const gear = s.gears.find((g) => g.id === sourceId);
      const unit = s.units.find((u) => u.id === gear?.attachedTo);
      if (unit?.cardId === "sfd-119-221")
        ctx.trigger(
          s,
          unit.owner,
          unit.cardId,
          unit.id,
          [{ type: "draw", optional: true, triggerCost: { energy: 1 } }],
          unit.location,
        );
    }
    if (
      event === "hold" &&
      s.fields.find((f) => f.id === locationId)?.cardId === "ogn-286-298"
    ) {
      for (const unit of s.units.filter(
        (u) => u.owner === p && u.location === locationId,
      )) {
        const effects = getScript(unit.cardId)?.onConquer;
        if (effects)
          ctx.trigger(s, p, unit.cardId, unit.id, effects, locationId);
      }
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave5:")) return false;
    const key = e.custom.slice(6);
    const target = s.units.find(
      (u) =>
        u.id === ctx.targetId &&
        (!e.fromHidden || u.location === ctx.locationId),
    );
    const source = s.units.find((u) => u.id === ctx.sourceId);
    const run = (effects: Effect[], targetId = ctx.targetId) =>
      ctx.runEffects(s, p, effects, targetId, ctx.sourceId, ctx.locationId);
    switch (key) {
      case "falling-star":
        run(
          (ctx.targetId ?? "").split("~").map((id) => ({
            type: "damage",
            amount: 3,
            target: "anyUnit",
            chosenTargetId: id,
          })),
        );
        break;
      case "prevent-effects":
        s.preventEffectDamageTurn = s.turn;
        break;
      case "prevent-next":
        if (target) target.preventNextDamageTurn = s.turn;
        break;
      case "double-damage":
        if (target) {
          if (target.doubleDamageTurn !== s.turn) target.damageDoublings = 0;
          target.doubleDamageTurn = s.turn;
          target.damageDoublings = (target.damageDoublings ?? 0) + 1;
        }
        break;
      case "facebreaker":
      case "last-breath": {
        const [aId, bId] = (ctx.targetId ?? "").split("~");
        const a = s.units.find((u) => u.id === aId && u.owner === p);
        const b = s.units.find(
          (u) =>
            u.id === bId && u.owner !== p && u.location.startsWith("field:"),
        );
        if (key === "last-breath") {
          if (a) run([{ type: "ready", target: "friendlyUnit" }], a.id);
          if (a && b)
            run(
              [
                {
                  type: "damage",
                  amount: ctx.getMight(s, a),
                  damageSource: "unit",
                  target: "enemyUnitAtBattlefield",
                },
              ],
              b.id,
            );
        } else {
          // Targets were at the same battlefield when declared. Resolve each
          // still-legal target independently if its partner left the board.
          const remaining = [a, b].filter(
            (u) =>
              u &&
              u.location.startsWith("field:") &&
              (!e.fromHidden || u.location === ctx.locationId),
          );
          if (remaining.length === 2 && a!.location !== b!.location) break;
          for (const u of remaining)
            run([{ type: "stun", target: "unitAtBattlefield" }], u!.id);
        }
        break;
      }
      case "swap-might": {
        const pair = (ctx.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        const [a, b] = pair;
        if (
          !a ||
          !b ||
          a.location !== b.location ||
          !a.location.startsWith("field:") ||
          pair.some((u) => e.fromHidden && u!.location !== ctx.locationId) ||
          pair.some(
            (u) =>
              u!.owner !== p &&
              (u!.untargetableByEnemy ||
                getKeywords(s, u!).includes("Untargetable")),
          )
        )
          break;
        const aMight = ctx.getMight(s, a, false),
          bMight = ctx.getMight(s, b, false);
        a.temporaryMight += bMight - ctx.getMight(s, a, false);
        b.temporaryMight += aMight - ctx.getMight(s, b, false);
        break;
      }
      case "smoke-mirrors": {
        const [a, b] = (ctx.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id && u.owner === p));
        if (
          a &&
          b &&
          (!e.fromHidden || a.location === ctx.locationId) &&
          a.location !== b.location &&
          [a, b].some(
            (u) => u.temporary || getKeywords(s, u).includes("Temporary"),
          )
        ) {
          const location = a.location;
          ctx.moveUnit(s, a, b.location, p);
          ctx.moveUnit(s, b, location, p);
        }
        break;
      }
      case "janna":
        if (source)
          for (const u of s.units.filter(
            (u) => u.owner === p && u.location === source.location,
          ))
            u.damage = 0;
        if (target && source && target.location === source.location)
          run([{ type: "moveTarget", target: "enemyUnitHere" }]);
        break;
      case "faefolk":
        if (ctx.locationId?.startsWith("field:") && target)
          ctx.moveUnit(s, target, ctx.locationId, p);
        break;
      case "recycle-rune":
        choose(
          s,
          p,
          ctx,
          s.players[p].runes.map((r) => ({
            label: `Recycle ${r.domain} rune`,
            effects: [fx("recycle-selected-rune", { cardName: r.id })],
          })),
        );
        break;
      case "recycle-selected-rune": {
        const index = s.players[p].runes.findIndex((r) => r.id === e.cardName);
        if (index >= 0)
          s.players[p].runeDeck.push(
            s.players[p].runes.splice(index, 1)[0].domain,
          );
        break;
      }
    }
    return true;
  },
};
