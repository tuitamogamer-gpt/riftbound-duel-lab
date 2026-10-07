import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { isCardType } from "../data/cards";
import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import type { ExpansionModule } from "./later-precon-engine";
import type { CardScript, Effect, LocationId } from "./types";
const plain: CardScript = { implemented: true };
const fx = (key: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave6:${key}`,
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
const weaponmaster: Effect = {
  type: "special",
  custom: "sfd:weaponmaster",
  target: "friendlyEquipment",
  optional: true,
};
const empower = (energy: number, power = 0, domain?: string): CardScript => ({
  ...plain,
  abilities: [
    {
      label: "Empower",
      energy,
      power,
      domain,
      condition: "sourceNotEmpowered",
      effects: [fx("empower")],
    },
  ],
});
const exact: Record<string, CardScript> = {
  "ogn-026-298": { ...plain, onPlay: [fx("deny-plays")] },
  "ogn-067-298": {
    ...plain,
    keywords: ["Tank"],
    onPlay: [
      fx("blitz", {
        target: "enemyUnit",
        targetDifferentLocationFromSource: true,
        optional: true,
        condition: "atBattlefield",
      }),
    ],
    onHold: [{ type: "bounce", condition: "self" }],
  },
  "ogn-236-298": plain,
  "ogn-250-298": spell([
    fx("stormbringer", { target: "friendlyBaseAndBattlefield" }),
  ]),
  "ogn-259-298": {
    ...plain,
    abilities: [
      {
        label: "Move to or from base",
        energy: 2,
        exhaust: true,
        effects: [fx("yasuo", { target: "friendlyUnitAndBaseMove" })],
      },
    ],
  },
  "ogn-270-298": spell([
    fx("showstopper", { target: "friendlyBaseAndBattlefield" }),
  ]),
  "ogn-276-298": plain,
  "sfd-023-221": {
    ...spell([
      fx("piercing-light", { target: "battlefieldUnitAndOptionalOther" }),
    ]),
    repeat: { energy: 2, power: 1, domain: "Fury" },
  },
  "sfd-080-221": {
    ...spell(
      [fx("bellows", { target: "upToThreeUnitsSameLocation" })],
      "action",
    ),
    repeat: { energy: 1, power: 1, domain: "Mind" },
  },
  "sfd-101-221": {
    ...plain,
    onPlay: [fx("fae-buff", { target: "upToFourFriendlyUnits" })],
  },
  "sfd-129-221": {
    ...spell([fx("temptation", { target: "enemyUnitAndOccupiedLocation" })]),
    repeat: { energy: 2 },
  },
  "sfd-132-221": {
    ...plain,
    onPlay: [fx("beast", { target: "duel", excludeSource: true })],
  },
  "sfd-209-221": plain,
  "sfd-211-221": plain,
  "sfd-216-221": plain,
  "unl-105-219": {
    ...plain,
    onMove: [
      fx("challenger", {
        target: "enemyHereAndDifferentBattlefield",
        optional: true,
      }),
    ],
  },
  "unl-107-219": spell([
    fx("stare-down", { target: "friendlyUnitAndBattlefield" }),
    fx("xp"),
  ]),
  "unl-198-219": spell(
    [fx("moonfall", { target: "friendlyBattlefieldAndOptionalEnemy" })],
    "action",
  ),
};
const ven: Record<number, CardScript> = {
  29: plain,
  40: spell(
    [{ type: "might", amount: 4, target: "friendlyUnitThreatenedByFury" }],
    "reaction",
  ),
  154: {
    ...spell([fx("execution", { target: "friendlyAndWeakerEnemy" })]),
    flow: { energy: 5, power: 2, banishAfter: true },
  },
  36: plain,
  41: {
    ...plain,
    onPlay: [weaponmaster],
    keywords: ["Weaponmaster"],
    onAttack: [fx("riven", { target: "enemyUnitHere" })],
  },
  45: empower(4, 1, "Calm"),
  55: empower(3),
  98: plain,
  158: plain,
  160: plain,
  164: plain,
};
export const cardWave6Scripts: Record<string, CardScript> = {
  ...exact,
  ...Object.fromEntries(
    cards
      .filter((c) => c.set === "VEN" && ven[c.collectorNumber])
      .map((c) => [c.id, ven[c.collectorNumber]]),
  ),
};
export const cardWave6Module: ExpansionModule = {
  event(s, event, p, _cardId, _sourceId, _locationId, ctx) {
    if (event === "spendBuff")
      for (const u of textUnits(s).filter(
        (u) => u.owner === p && isFace(u.cardId, "SFD", 101),
      ))
        ctx.trigger(
          s,
          p,
          u.cardId,
          u.id,
          textEffects(u, [fx("gold")]),
          u.location,
        );
  },
  cost(s, p, c, ctx) {
    if (!isCardType(c, "Spell")) return {};
    const researchers = textUnits(s).filter(
      (u) => u.owner === p && u.empowered && isFace(u.cardId, "VEN", 55),
    ).length;
    const fields = s.fields.filter(
      (f) =>
        isFace(f.cardId, "VEN", 164) &&
        (ctx?.targetId ?? "")
          .split("~")
          .some((id) =>
            s.units.some(
              (u) => u.id === id && u.owner === p && u.location === f.id,
            ),
          ),
    ).length;
    return {
      power: -researchers - fields,
    };
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave6:")) return false;
    const key = e.custom.slice(6),
      ids = (ctx.targetId ?? "").split("~");
    const a = s.units.find((u) => u.id === ids[0]),
      b = s.units.find((u) => u.id === ids[1]);
    const source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance);
    const run = (effects: Effect[], id = ctx.targetId) =>
      ctx.runEffects(s, p, effects, id, ctx.sourceId, ctx.locationId);
    switch (key) {
      case "gold":
        ctx.spawnToken(s, p, "Gold", `base:${p}`);
        break;
      case "fae-buff":
        for (const id of ids)
          run([{ type: "buff", target: "friendlyUnit" }], id);
        break;
      case "bellows": {
        const remaining = ids.flatMap((id) =>
          s.units.filter(
            (u) => u.id === id && ctx.canTargetUnit?.(s, p, u) !== false,
          ),
        );
        if (new Set(remaining.map((u) => u.location)).size > 1) {
          const subsets = Array.from(
            { length: 2 ** remaining.length },
            (_, mask) => remaining.filter((_, i) => mask & (1 << i)),
          ).filter((group) => new Set(group.map((u) => u.location)).size <= 1);
          ctx.openChoice(s, p, {
            sourceId: ctx.sourceId,
            locationId: ctx.locationId,
            targetId: ctx.targetId,
            options: subsets.map((group, i) => ({
              id: `choose-custom:bellows:${i}`,
              label: group.length
                ? `Affect ${group.map((u) => getCard(u.cardId).name).join(" + ")}`
                : "Affect no units",
              category: "ability",
              player: p,
              targetId: group.map((u) => u.id).join("~"),
              effects: [fx("bellows")],
            })),
          });
          break;
        }
        run(
          [{ type: "damage", amount: 1, target: "upToThreeUnitsSameLocation" }],
          remaining.map((u) => u.id).join("~"),
        );
        break;
      }
      case "execution":
        if (
          a?.owner === p &&
          b &&
          b.owner !== p &&
          ctx.getMight(s, b) < ctx.getMight(s, a)
        )
          run([{ type: "kill", target: "enemyUnit" }], b.id);
        break;
      case "deny-plays":
        s.players[1 - p].cannotPlayCardsTurn = s.turn;
        break;
      case "empower":
        if (ctx.sourceId) ctx.empower!(s, p, ctx.sourceId);
        break;
      case "blitz":
        if (source?.location.startsWith("field:") && a)
          ctx.moveUnit(s, a, source.location, p);
        break;
      case "beast":
        for (const u of [a, b])
          if (
            u &&
            u.id !== ctx.sourceId &&
            (u === a ? u.owner === p : u.owner !== p)
          )
            run(
              [
                {
                  type: "bounce",
                  target: u.owner === p ? "friendlyUnit" : "enemyUnit",
                },
              ],
              u.id,
            );
        break;
      case "piercing-light":
        if (a)
          run(
            [{ type: "damage", amount: 2, target: "unitAtBattlefield" }],
            a.id,
          );
        if (b) run([{ type: "damage", amount: 2, target: "anyUnit" }], b.id);
        break;
      case "riven":
        if (source)
          run([
            {
              type: "damage",
              amount: 2 * source.gear.length,
              target: "enemyUnitHere",
            },
          ]);
        break;
      case "stormbringer":
        if (
          a?.owner === p &&
          a.location === `base:${p}` &&
          s.fields.some((f) => f.id === ids[1])
        ) {
          const amount = ctx.getMight(s, a);
          run([{ type: "damageAll", amount, who: "opponent" }], ids[1]);
          if (s.units.some((u) => u.id === a.id))
            ctx.moveUnit(s, a, ids[1] as LocationId, p);
        }
        break;
      case "showstopper":
        if (
          a?.owner === p &&
          a.location === `base:${p}` &&
          s.fields.some((f) => f.id === ids[1])
        ) {
          run([{ type: "buff", target: "friendlyUnit" }], a.id);
          ctx.moveUnit(s, a, ids[1] as LocationId, p);
        }
        break;
      case "yasuo":
        if (
          a?.owner === p &&
          (a.location === `base:${p}`
            ? ids[1].startsWith("field:")
            : ids[1] === `base:${p}`)
        )
          ctx.moveUnit(s, a, ids[1] as LocationId, p);
        break;
      case "temptation":
        if (
          a?.owner !== p &&
          a &&
          s.units.some((u) => u.owner === a.owner && u.location === ids[1])
        )
          run(
            [fx("move-declared", { target: "enemyUnit", cardName: ids[1] })],
            a.id,
          );
        break;
      case "challenger":
        if (
          a &&
          source &&
          a.owner !== p &&
          a.location === source.location &&
          ctx.getMight(s, a) < ctx.getMight(s, source) &&
          ids[1] !== a.location
        )
          run(
            [fx("move-declared", { target: "enemyUnit", cardName: ids[1] })],
            a.id,
          );
        break;
      case "move-declared":
        if (a) ctx.moveUnit(s, a, e.cardName as LocationId, p);
        break;
      case "stare-down":
        if (a?.owner === p) {
          const might = ctx.getMight(s, a);
          for (const u of s.units.filter(
            (u) =>
              u.owner !== p &&
              u.location === ids[1] &&
              ctx.getMight(s, u) < might,
          ))
            ctx.moveUnit(s, u, `base:${u.owner}`, p);
        }
        break;
      case "xp":
        s.players[p].xp = (s.players[p].xp ?? 0) + 1;
        break;
      case "moonfall": {
        const field = ids[0] as LocationId;
        if (!s.units.some((u) => u.owner === p && u.location === field)) break;
        if (b)
          run(
            [fx("move-declared", { target: "enemyUnit", cardName: field })],
            b.id,
          );
        for (const u of s.units.filter(
          (u) => u.owner !== p && u.location === field,
        ))
          u.temporaryMight -= 2;
        break;
      }
    }
    return true;
  },
};
