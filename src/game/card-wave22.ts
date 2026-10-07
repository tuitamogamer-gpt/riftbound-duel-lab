import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { getCard } from "../data/cards";
import { isFace } from "./board-rules";
import { addToTrash, emptyTrash, takeTrash, trashCards } from "./trash";
import { banishCard } from "./banishment";
import { queueCardPlay } from "./card-play";
import type { CardScript, Effect } from "./types";
import type { ExpansionModule } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
const fx = (key: string, rest: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `wave22:${key}`,
  ...rest,
});
export const cardWave22Scripts: Record<string, CardScript> = {
  "ogn-037-298": { ...plain, assault: 2, keywords: ["Assault"] },
  "unl-020-219": { ...plain, spell: [fx("grenade", { target: "anyUnit" })] },
  "unl-186-219": {
    ...plain,
    spell: [fx("death-below", { target: "unitAtBattlefield" })],
  },
  "ven-022-166": {
    ...plain,
    onPlay: [fx("riches"), { type: "mill", amount: 7 }],
  },
};
export const cardWave22Module: ExpansionModule = {
  event(s, name, p, _cardId, _sourceId, _location, ctx) {
    if (name !== "spellResolved" && name !== "spellKill") return;
    const kills = ctx.resolvedSpell?.killedUnits ?? ctx.amount ?? 0;
    if (kills)
      for (let n = 0; n < kills; n++)
        for (const c of trashCards(s, p).filter((c) =>
          isFace(c.cardId, "OGN", 37),
        ))
          ctx.trigger(
            s,
            p,
            c.cardId,
            c.id,
            textEffects(c, [
              {
                type: "playCard",
                optional: true,
                triggerCost: { energy: 1, power: 1, domain: "Fury" },
                play: { zone: "trash", sourceRef: c.id, ignoreCost: true },
              },
            ]),
          );
    const item = ctx.resolvedSpell;
    if (!item) return;
    // Replays use this exact physical visit, after all parent instructions finish.
    if (ctx.spellTrashId && item.replayRequests?.length) {
      const request = item.replayRequests.at(-1)!,
        owner = item.originalOwner ?? p,
        id = takeTrash(s, owner, ctx.spellTrashId);
      if (id)
        queueCardPlay(
          s,
          request.player,
          id,
          {
            zone: "trash",
            optional: true,
            zoneOwner: owner,
            ignoreEnergy: true,
            powerOverride: 1,
            grenadeHits: request.grenade ? item.grenadeHits : undefined,
          },
          "trash",
          s.players[owner].discard.length,
        );
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("wave22:")) return false;
    const item = s.resolving?.at(-1),
      u = s.units.find((u) => u.id === ctx.targetId);
    switch (e.custom.slice(7)) {
      case "riches": {
        const ids = [...s.players[p].hand, ...emptyTrash(s, p)];
        s.players[p].hand = [];
        for (const id of ids) {
          banishCard(s, p, id);
          ctx.cardEvent(s, "banish", p, id);
        }
        break;
      }
      case "grenade":
        if (u && item) {
          const controller = u.owner,
            old = u.damage;
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: 2, chosenTargetId: u.id }],
            undefined,
            ctx.sourceId,
            ctx.locationId,
          );
          if (u.damage > old) item.grenadeHits = (item.grenadeHits ?? 0) + 1;
          (item.replayRequests ??= []).push({
            player: controller,
            grenade: true,
          });
        }
        break;
      case "death-below":
        if (u && item) {
          const might = ctx.getMight(s, u);
          ctx.killUnits(s, [u.id]);
          if (might <= 3) (item.replayRequests ??= []).push({ player: p });
        }
        break;
    }
    return true;
  },
};
