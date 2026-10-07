import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { banishCard, banishedCards, takeBanished } from "./banishment";
import { trashCards, takeTrash, addToTrash } from "./trash";
import { queueCardPlay } from "./card-play";
import { instructedPlay } from "./card-wave13";
import { choices, option } from "./card-wave16";
import type { CardScript, Effect, GameState, PlayerId } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
const fx = (key: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave21:${key}`,
  ...rest,
});
export const cardWave21Scripts: Record<string, CardScript> = {
  "ogn-235-298": { ...plain, onPlay: [{ type: "predict" }] },
  "sfd-203-221": plain,
  "unl-148-219": {
    ...plain,
    onPlay: [fx("sarcophagus-banish")],
    abilities: [
      {
        label: "Play a linked unit",
        exhaust: true,
        effects: [fx("linked-play")],
      },
    ],
  },
  "unl-181-219": plain,
  "sfd-090-221": {
    ...plain,
    equipEnergy: 1,
    equipCost: 1,
    gearMight: 2,
    equipment: {
      text: "Deathknell: Banish me with this Equipment.",
      onDeath: [fx("zero-banish")],
    },
    abilities: [
      {
        label: "Banish this and play its linked units",
        condition: "unattached",
        energy: 3,
        power: 1,
        domain: "Mind",
        banishSelf: true,
        effects: [fx("zero-play")],
      },
    ],
  },
  "sfd-150-221": {
    ...plain,
    equipCost: 1,
    equipRecycle: 2,
    gearMight: 2,
    equipment: {
      text: "Conquer / Hold: You may play a unit from your trash.",
      onHold: [
        instructedPlay({ zone: "trash", cardTypes: ["Unit"], optional: true }),
      ],
      onConquer: [
        instructedPlay({ zone: "trash", cardTypes: ["Unit"], optional: true }),
      ],
    },
  },
  "sfd-178-221": {
    ...plain,
    equipCost: 1,
    equipKillUnit: true,
    gearMight: 4,
    equipment: { text: "+4 Might." },
  },
};
function linked(s: GameState, sourceId: string) {
  return (s.linkedBanishments ?? []).filter(
    (e) =>
      e.sourceId === sourceId &&
      banishedCards(s, e.owner).some((c) => c.id === e.ref),
  );
}
function link(s: GameState, sourceId: string, owner: PlayerId, cardId: string) {
  (s.linkedBanishments ??= []).push({
    sourceId,
    owner,
    ref: banishCard(s, owner, cardId),
  });
}
export const cardWave21Module: ExpansionModule = {
  event(s, name, p, cardId, sourceId, _location, ctx) {
    if (name === "recycleCards")
      for (const u of textUnits(s).filter(
        (u) => u.owner === p && isFace(u.cardId, "OGN", 235),
      ))
        ctx.trigger(
          s,
          p,
          u.cardId,
          u.id,
          textEffects(u, [{ type: "buff", target: "friendlyUnit" }]),
          u.location,
        );
    if (name === "recycleRunes" && isFace(s.players[p].legendId, "SFD", 203))
      for (let i = 0; i < (ctx.amount ?? 1); i++)
        ctx.trigger(s, p, s.players[p].legendId, "legend", [
          {
            type: "token",
            cardName: "Gold",
            optional: true,
            triggerCost: { exhaust: true },
          },
        ]);
    if (name === "death" && s.units.some((u) => u.id === sourceId)) {
      const enemy = (1 - p) as PlayerId;
      if (isFace(s.players[enemy].legendId, "SFD", 203))
        s.players[enemy].legendUsedTurn = -1;
    }
    if (
      name === "spellResolved" &&
      isFace(s.players[p].legendId, "UNL", 181) &&
      (ctx.resolvedSpell?.energySpent ?? 0) >= 4 &&
      ctx.spellTrashId
    )
      ctx.trigger(s, p, s.players[p].legendId, `legend:${p}`, [
        fx("jhin", {
          optional: true,
          cardName: ctx.spellTrashId,
          amount: ctx.resolvedSpell!.originalOwner ?? p,
        }),
      ]);
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave21:")) return false;
    switch (e.custom.slice(7)) {
      case "sarcophagus-banish":
        for (const c of trashCards(s, p).filter((c) =>
          isCardType(getCard(c.cardId), "Unit"),
        )) {
          takeTrash(s, p, c.id);
          link(s, ctx.sourceId!, p, c.cardId);
          ctx.cardEvent(s, "banish", p, c.cardId);
        }
        break;
      case "linked-play":
        choices(
          s,
          p,
          ctx,
          linked(s, ctx.sourceId!).map((entry) => {
            const c = banishedCards(s, entry.owner).find(
              (c) => c.id === entry.ref,
            )!;
            return option(
              p,
              `linked:${entry.ref}`,
              `Play ${getCard(c.cardId).name}`,
              [fx("play-one", { cardName: entry.ref, amount: entry.owner })],
              c.cardId,
            );
          }),
        );
        break;
      case "play-one": {
        const owner = e.amount as PlayerId,
          id = takeBanished(s, owner, e.cardName!);
        if (id)
          queueCardPlay(
            s,
            p,
            id,
            { zone: "banished", zoneOwner: owner },
            "banished",
            s.players[owner].banished.length,
          );
        break;
      }
      case "zero-banish": {
        const u = ctx.lastUnit;
        if (u?.deathTrashId) {
          const owner = u.originalOwner ?? u.owner,
            id = takeTrash(s, owner, u.deathTrashId);
          if (id) {
            link(s, e.cardName!, owner, id);
            ctx.cardEvent(s, "banish", p, id);
          }
        }
        break;
      }
      case "zero-play":
        for (const entry of linked(s, ctx.sourceId!)) {
          const id = takeBanished(s, entry.owner, entry.ref);
          if (id)
            queueCardPlay(
              s,
              p,
              id,
              {
                zone: "banished",
                zoneOwner: entry.owner,
                ignoreCost: true,
                orderGroup: ctx.sourceId,
              },
              "banished",
              s.players[entry.owner].banished.length,
            );
        }
        break;
      case "jhin": {
        const owner = e.amount as PlayerId,
          id = takeTrash(s, owner, e.cardName!);
        if (!id) break;
        const source = `legend:${p}`;
        link(s, source, owner, id);
        ctx.cardEvent(s, "banish", p, id);
        const all = linked(s, source);
        if (all.length === 4) {
          for (const item of all) {
            const c = takeBanished(s, item.owner, item.ref);
            if (c) addToTrash(s, item.owner, c);
          }
          s.linkedBanishments = s.linkedBanishments!.filter(
            (item) => !all.includes(item),
          );
          ctx.channel(s, p, 4);
          ctx.draw(s, p, 1);
        }
        break;
      }
    }
    return true;
  },
};
