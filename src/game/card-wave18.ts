import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { cards, getCard } from "../data/cards";
import { isFace, getUnitTags } from "./board-rules";
import { copyUnit, detach } from "./objects";
import { choices, option } from "./card-wave16";
import type { CardScript, Effect } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
const fx = (custom: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave18:${custom}`,
  ...rest,
});
export const cardWave18Scripts: Record<string, CardScript> = {
  "token-reflection": plain,
  "token-baron-pit": plain,
  "token-brush": {
    ...plain,
    onHold: [fx("restore", { optional: true })],
    onConquer: [fx("restore", { optional: true })],
  },
  "sfd-030-221": {
    ...plain,
    equipCost: 1,
    equipEnergy: 1,
    gearMight: 2,
    equipment: {
      text: "My hold effects are also conquer effects, and vice versa.",
    },
  },
  "sfd-073-221": {
    ...plain,
    equipCost: 1,
    gearMight: 1,
    equipment: { text: "I am a Mech." },
  },
  "sfd-191-221": {
    ...plain,
    equipCost: 1,
    equipAnyPower: true,
    gearMight: 3,
    equipment: {
      text: "Your spells and abilities deal 3 Bonus Damage (while this is attached).",
    },
  },
  "unl-019-219": {
    ...plain,
    equipCost: 1,
    equipEnergy: 1,
    gearMight: 4,
    equipment: {
      text: "At the end of your turn, if I didn't conquer this turn, unattach this and deal 4 to me.",
    },
  },
  "unl-081-219": {
    ...plain,
    hidden: true,
    keywords: ["Temporary"],
    onPlay: [fx("keeper")],
  },
  "unl-147-219": { ...plain, keywords: ["Untargetable"] },
  "unl-195-219": plain,
  "unl-199-219": plain,
  "unl-200-219": { ...plain, spell: [fx("mirror", { target: "anyUnit" })] },
};
for (const c of cards.filter(
  (c) => c.set === "VEN" && c.collectorNumber === 137,
))
  cardWave18Scripts[c.id] = {
    ...plain,
    equipCost: 1,
    equipEnergy: 1,
    equipment: {
      text: "The equipped unit becomes a copy of the chosen friendly unit while this remains attached.",
    },
  };
export const cardWave18Module: ExpansionModule = {
  might(s, u, n) {
    n +=
      textUnits(s).filter(
        (source) =>
          source.owner === u.owner &&
          source.id !== u.id &&
          isFace(source.cardId, "UNL", 147),
      ).length * 2;
    if (
      s.fields.some((f) => f.id === u.location && f.cardId === "token-brush") &&
      getUnitTags(u).some((t) =>
        ["Bird", "Cat", "Dog", "Poro", "Ivern"].includes(t),
      )
    )
      n++;
    return n;
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    if (name === "conquer" || name === "hold") {
      if (name === "conquer")
        for (const u of s.units.filter(
          (u) => u.owner === p && u.location === locationId,
        ))
          u.conqueredTurn = s.turn;
      const legend = s.players[p].legendId;
      if (isFace(legend, "UNL", 195))
        ctx.trigger(
          s,
          p,
          legend,
          "legend",
          [fx("brush", { optional: true, triggerCost: { exhaust: true } })],
          locationId,
        );
      if (isFace(legend, "UNL", 199))
        ctx.trigger(
          s,
          p,
          legend,
          "legend",
          [
            fx("leblanc", {
              optional: true,
              triggerCost: { exhaust: true, discard: 1 },
            }),
          ],
          locationId,
        );
    }
    if (name === "attach") {
      const g = s.gears.find((g) => g.id === sourceId),
        u = s.units.find((u) => u.id === g?.attachedTo);
      if (!g || !u) return;
      if (isFace(g.cardId, "SFD", 73))
        (u.grantedTags ??= []).push({ sourceId: g.id, tag: "Mech" });
      if (isFace(g.cardId, "VEN", 137))
        choices(
          s,
          p,
          ctx,
          s.units
            .filter((v) => v.owner === p && v.id !== u.id)
            .map((v) =>
              option(
                p,
                `spectacles:${v.id}`,
                `Copy ${getCard(v.cardId).name}`,
                [fx("spectacles", { cardName: v.cardId, keyword: g.id })],
                v.cardId,
              ),
            ),
        );
    }
    if (name === "stateChanged")
      for (const u of s.units) {
        for (const copy of [...(u.copyEffects ?? [])]) {
          if (
            !copy.sourceId.startsWith("token:") &&
            !s.gears.some(
              (g) => g.id === copy.sourceId && g.attachedTo === u.id,
            )
          ) {
            u.copyEffects = u.copyEffects!.filter((c) => c !== copy);
            u.cardId = u.copyEffects.at(-1)?.cardId ?? u.originalCardId!;
            u.usedAbilities = [];
          }
        }
        u.grantedTags = u.grantedTags?.filter((t) =>
          s.gears.some((g) => g.id === t.sourceId && g.attachedTo === u.id),
        );
      }
    if (name === "end")
      for (const g of s.gears.filter(
        (g) => isFace(g.cardId, "UNL", 19) && g.attachedTo,
      )) {
        const u = s.units.find((u) => u.id === g.attachedTo);
        if (u?.owner === p && u.conqueredTurn !== s.turn)
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            textEffects(u, [fx("battleaxe", { cardName: g.id })]),
            u.location,
          );
      }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave18:")) return false;
    const target = s.units.find((u) => u.id === ctx.targetId),
      source = abilityUnit(s, ctx.sourceId, ctx.abilityInstance);
    switch (e.custom.slice(7)) {
      case "keeper": {
        if (!source) break;
        for (let i = 0; i < 2; i++) {
          const token = ctx.spawnToken(s, p, "Reflection", source.location);
          if (token) {
            copyUnit(token, source.cardId, `token:${token.id}`);
            token.temporary = true;
          }
        }
        break;
      }
      case "leblanc": {
        const token = ctx.spawnToken(s, p, "Reflection", ctx.locationId!, true);
        if (token)
          ctx.trigger(
            s,
            p,
            s.players[p].legendId,
            "legend",
            [fx("reflection-copy", { target: "unitHere", cardName: token.id })],
            ctx.locationId,
          );
        break;
      }
      case "reflection-copy": {
        if (!target) break;
        const ids = new Set([e.cardName!]);
        for (let n = 0; n < (s.tokenCopyLinks?.length ?? 0) + 1; n++)
          for (const link of s.tokenCopyLinks ?? [])
            if (ids.has(link.original)) ids.add(link.copy);
        for (const token of s.units.filter((u) => ids.has(u.id))) {
          copyUnit(token, target.cardId, `token:${token.id}`);
          token.temporary = true;
        }
        break;
      }
      case "mirror": {
        if (!target) break;
        const token = ctx.spawnToken(
          s,
          p,
          "Reflection",
          e.custom.endsWith("leblanc") ? ctx.locationId! : `base:${p}`,
          true,
        );
        if (token) {
          copyUnit(token, target.cardId, `token:${token.id}`);
          token.temporary = true;
        }
        break;
      }
      case "spectacles": {
        const g = s.gears.find((g) => g.id === e.keyword),
          u = s.units.find((u) => u.id === g?.attachedTo);
        if (u && g) copyUnit(u, e.cardName!, g.id);
        break;
      }
      case "brush": {
        const field = s.fields.find((f) => f.id === ctx.locationId);
        if (field && field.cardId !== "token-brush") {
          field.replacedCardId = field.cardId;
          field.cardId = "token-brush";
        }
        break;
      }
      case "restore": {
        const field = s.fields.find((f) => f.id === ctx.locationId);
        if (field?.replacedCardId) {
          field.cardId = field.replacedCardId;
          delete field.replacedCardId;
        }
        break;
      }
      case "battleaxe": {
        const gear = s.gears.find((g) => g.id === e.cardName);
        if (gear) detach(s, gear);
        if (source)
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: 4, chosenTargetId: source.id }],
            undefined,
            source.id,
            source.location,
          );
        break;
      }
    }
    return true;
  },
};
