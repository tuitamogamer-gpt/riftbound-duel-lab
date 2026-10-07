import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { recycleCards, recycleRunes } from "./zone-events";
import { isCardType } from "../data/cards";
import { getUnitTags } from "./board-rules";
import { cards, getCard } from "../data/cards";
import { isFace } from "./board-rules";
import { getScriptKeywords } from "./engine";
import { instructedPlay } from "./card-wave13";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  ActivatedAbility,
  CardScript,
  Effect,
  GameAction,
  GameState,
  PlayerId,
  Unit,
} from "./types";
const plain: CardScript = { implemented: true };
const fx = (key: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave14:${key}`,
  ...extra,
});
const skip = (p: PlayerId): GameAction => ({
  id: "choose-custom:wave14:skip",
  player: p,
  category: "ability",
  label: "Decline",
  effects: [],
});
const ability = (
  p: PlayerId,
  id: string,
  label: string,
  effects: Effect[],
  targetId?: string,
): GameAction => ({
  id: `choose-custom:wave14:${id}`,
  player: p,
  category: "ability",
  label,
  effects,
  targetId,
});
const asChoice = (
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
const apheliosModes = [
  {
    label: "Ready 2 runes",
    effects: [{ type: "readyRunes", amount: 2, chooseRunes: true }],
  },
  {
    label: "Channel 1 rune exhausted",
    effects: [{ type: "channel", amount: 1 }],
  },
  {
    label: "Buff a friendly unit",
    effects: [{ type: "buff", target: "friendlyUnit" }],
  },
] satisfies { label: string; effects: Effect[] }[];
export const cardWave14Scripts: Record<string, CardScript> = {
  "ogn-107-298": {
    ...plain,
    onAttack: [
      instructedPlay(
        {
          zone: "hand",
          hiddenOnly: true,
          cardTypes: ["Unit"],
          ignoreCost: true,
          destination: "here",
          optional: true,
        },
        { optional: true, triggerCost: { power: 1, domain: "Mind" } },
      ),
    ],
  },
  "sfd-049-221": plain,
  "sfd-050-221": {
    ...plain,
    abilities: [
      {
        label: "Exchange locations; optionally take an Equipment",
        timing: "action",
        power: 1,
        domain: "Calm",
        oncePerTurn: true,
        effects: [
          fx("azir", { target: "unitAndEquipment", condition: "azirSwap" }),
        ],
      },
    ],
  },
  "sfd-079-221": {
    ...plain,
    additionalCost: { exhaustLegend: true },
    onPlay: [
      fx("bard", {
        condition: "paidAdditionalCost",
        group: { destination: "open" },
        target: "boardCards",
        cardTypes: ["Unit"],
        who: "self",
        upTo: true,
      }),
    ],
  },
  "sfd-084-221": {
    ...plain,
    onPlay: [
      fx("jayce", {
        target: "boardCards",
        cardTypes: ["Gear"],
        who: "self",
        targetCount: 1,
        upTo: true,
      }),
    ],
  },
  "sfd-112-221": {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    onMove: [
      fx("kato", { condition: "atBattlefield", target: "friendlyUnit" }),
    ],
  },
  "sfd-175-221": { ...plain, onPlay: [fx("undertitan")] },
  "sfd-198-221": { ...plain, spell: [fx("arise")] },
  "sfd-199-221": {
    ...plain,
    abilities: [
      {
        label: "Draw 1 after choosing enemies twice",
        timing: "reaction",
        exhaust: true,
        condition: "choseEnemiesTwice",
        effects: [{ type: "draw", amount: 1 }],
      },
    ],
  },
  "sfd-208-221": plain,
  "unl-179-219": {
    ...plain,
    onMove: [fx("herald", { condition: "atBattlefield" })],
    onDeath: [
      instructedPlay({
        zone: "hand",
        cardTypes: ["Unit"],
        ignoreEnergy: true,
        destination: "base",
      }),
    ],
  },
  "ven-104-166": {
    ...plain,
    abilities: [
      {
        label: "Empower",
        energy: 2,
        power: 1,
        domain: "Chaos",
        condition: "sourceNotEmpowered",
        effects: [fx("empower-source")],
      },
    ],
  },
};
for (const c of cards.filter(
  (c) => c.set === "VEN" && c.collectorNumber === 89,
))
  cardWave14Scripts[c.id] = {
    ...plain,
    spell: [
      instructedPlay({
        zone: "top",
        count: 5,
        cardTypes: ["Unit", "Gear"],
        optional: true,
        energyReduction: 5,
        empowerAfterPlay: true,
      }),
    ],
  };

export function grantedLegendAbilities(
  s: GameState,
  p: PlayerId,
): ActivatedAbility[] {
  return s.fields.some(
    (f) => f.controller === p && isFace(f.cardId, "SFD", 208),
  )
    ? [
        {
          label: "Forge of the Fluft: attach an Equipment",
          exhaust: true,
          effects: [
            fx("forge", {
              target: "unitAndEquipment",
              condition: "friendlyPair",
            }),
          ],
        },
      ]
    : [];
}
export function markWave14Mode(
  s: GameState,
  sourceId: string | undefined,
  effects: Effect[],
) {
  const used = effects.find((e) => e.custom === "wave14:aphelios-used");
  const source = s.units.find((u) => u.id === sourceId);
  if (used && source)
    (source.usedAbilities ??= []).push(
      `aphelios:${used.abilityInstance ? used.abilityInstance + ":" : ""}${used.amount}`,
    );
}
export function wave14ModeAvailable(
  s: GameState,
  sourceId: string,
  effects: Effect[],
) {
  const used = effects.find((e) => e.custom === "wave14:aphelios-used");
  return (
    !used ||
    !s.units
      .find((u) => u.id === sourceId)
      ?.usedAbilities?.includes(
        `aphelios:${used.abilityInstance ? used.abilityInstance + ":" : ""}${used.amount}`,
      )
  );
}
export const cardWave14Module: ExpansionModule = {
  event(s, event, p, cardId, sourceId, locationId, ctx) {
    const source = s.units.find((u) => u.id === sourceId);
    if (event === "reveal" && isFace(cardId, "SFD", 175))
      s.players[p].energy += 2;
    for (const textSource of textSources(s, source)) {
      const source = textSource;
      if (event === "empower" && source && isFace(source.cardId, "VEN", 104))
        ctx.trigger(
          s,
          p,
          source.cardId,
          source.id,
          textEffects(source, [
            instructedPlay({
              zone: "trash",
              cardTypes: ["Unit"],
              maxEnergy: 3,
              maxPower: 1,
              ignoreCost: true,
              destination: "base",
              optional: true,
            }),
          ]),
          source.location,
        );
    }
    if (event === "attach") {
      const gear = s.gears.find((g) => g.id === sourceId);
      const u = s.units.find((u) => u.id === gear?.attachedTo);
      for (const instance of textSources(s, u)) {
        const u = instance;
        if (isFace(u.cardId, "SFD", 49))
          ctx.trigger(
            s,
            u.owner,
            u.cardId,
            u.id,
            textEffects(u, [
              fx("aphelios", {
                modes: apheliosModes.map((m, i) => ({
                  ...m,
                  effects: [fx("aphelios-used", { amount: i }), ...m.effects],
                })),
              }),
            ]),
            u.location,
          );
      }
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave14:")) return false;
    const source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance);
    const target = s.units.find((u) => u.id === ctx.targetId);
    switch (e.custom.slice(7)) {
      case "aphelios-used":
        break;
      case "empower-source":
        if (ctx.sourceId) ctx.empower!(s, p, ctx.sourceId);
        break;
      case "empower-played":
        if (
          s.units.some((u) => u.id === e.cardName) ||
          s.gears.some((g) => g.id === e.cardName)
        )
          ctx.empower!(s, p, e.cardName!);
        break;
      case "undertitan":
        for (const u of own(s, p))
          if (u.id !== ctx.sourceId) u.temporaryMight += 2;
        break;
      case "kato": {
        if (source && target && target.owner === p) {
          target.temporaryMight += ctx.getMight(s, source);
          (target.temporaryKeywords ??= []).push(
            ...getScriptKeywords(s, source),
          );
        }
        break;
      }
      case "forge": {
        const [uid, gid] = (ctx.targetId ?? "").split("~");
        if (
          s.units.some((u) => u.id === uid && u.owner === p) &&
          s.gears.some((g) => g.id === gid && g.owner === p)
        )
          ctx.runEffects(s, p, [{ type: "equip" }], uid, gid);
        break;
      }
      case "azir": {
        const [unitId, gearId] = (ctx.targetId ?? "").split("~");
        const target = s.units.find((u) => u.id === unitId && u.owner === p);
        if (!source || !target) break;
        const from = source.location,
          to = target.location;
        ctx.moveUnit(s, source, to, p);
        ctx.moveUnit(s, target, from, p);
        const gear = s.gears.find(
          (g) =>
            g.id === gearId &&
            g.owner === p &&
            g.attachedTo === target.id &&
            getUnitTags(g).includes("Equipment"),
        );
        if (gear) ctx.runEffects(s, p, [{ type: "equip" }], source.id, gear.id);
        break;
      }
      case "jayce": {
        const gear = s.gears.find(
          (g) => g.id === ctx.targetId && g.owner === p,
        );
        if (!gear) break;
        ctx.killGear(s, gear.id);
        if (!s.gears.some((g) => g.id === gear.id))
          (s.players[p].gearPlayPermissions ??= []).push({
            id: `jayce:${s.nextId++}`,
            turn: s.turn,
          });
        break;
      }
      case "bard":
        if (
          ctx.locationId?.startsWith("field:") &&
          !s.units.some((u) => u.owner !== p && u.location === ctx.locationId)
        )
          for (const u of own(s, p).filter((u) =>
            (ctx.targetId ?? "").split("~").includes(u.id),
          ))
            ctx.moveUnit(s, u, ctx.locationId, p);
        break;
      case "arise": {
        const count = s.gears.filter(
          (g) => g.owner === p && getUnitTags(g).includes("Equipment"),
        ).length;
        if (count)
          ctx.runEffects(
            s,
            p,
            [
              { type: "token", cardName: "Sand Soldier", amount: count },
              fx("arise-ready", {
                cardName: s.units.map((u) => u.id).join("~"),
              }),
            ],
            undefined,
            ctx.sourceId,
            ctx.locationId,
          );
        break;
      }
      case "arise-ready": {
        const old = new Set((e.cardName ?? "").split("~"));
        const ids = s.units
          .filter(
            (u) =>
              u.owner === p &&
              !old.has(u.id) &&
              getUnitTags(u).includes("Sand Soldier"),
          )
          .map((u) => u.id);
        if (ids.length)
          ctx.runEffects(
            s,
            p,
            [
              fx("ready-tokens", {
                cardName: ids.join("~"),
                amount: Math.min(2, ids.length),
              }),
            ],
            undefined,
            ctx.sourceId,
            ctx.locationId,
          );
        break;
      }
      case "ready-tokens": {
        const choices = s.units.filter((u) =>
          e.cardName!.split("~").includes(u.id),
        );
        if (!e.amount || !choices.length) break;
        asChoice(
          s,
          p,
          ctx,
          choices.map((u) =>
            ability(p, `ready:${u.id}`, `Ready ${getCard(u.cardId).name}`, [
              { type: "ready", chosenTargetId: u.id },
              fx("ready-tokens", {
                cardName: choices
                  .filter((x) => x.id !== u.id)
                  .map((x) => x.id)
                  .join("~"),
                amount: e.amount! - 1,
              }),
            ]),
          ),
        );
        break;
      }
      case "herald": {
        const seen = s.players[p].deck.slice(0, e.lookCount ?? 3);
        asChoice(s, p, ctx, [
          ...seen.flatMap((id, i) =>
            isCardType(getCard(id), "Unit")
              ? [
                  ability(
                    p,
                    `herald:${i}`,
                    `Reveal and draw ${getCard(id).name}`,
                    [fx("herald-selected", { amount: i })],
                  ),
                ]
              : [],
          ),
          ability(p, "herald:skip", "Recycle all three", [
            fx("herald-selected", { amount: -1 }),
          ]),
        ]);
        break;
      }
      case "herald-selected": {
        const seen = s.players[p].deck.splice(0, e.lookCount ?? 3),
          selected = seen[e.amount!];
        if (selected) {
          ctx.cardEvent(s, "reveal", p, selected);
          ctx.log?.(s, `Revealed ${getCard(selected).name}.`, "info", p);
          s.players[p].deck.unshift(selected);
          ctx.draw(s, p, 1);
        }
        recycleCards(
          s,
          p,
          [
            ...(ctx.shuffle?.(
              s,
              seen.filter((_, i) => i !== e.amount),
            ) ?? []),
          ],
          p,
        );
        break;
      }
    }
    return true;
  },
};
