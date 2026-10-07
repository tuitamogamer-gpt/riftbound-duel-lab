import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import { copyUnit } from "./objects";
import { banishInspectedNocturne, continueSelected } from "./deck-inspection";
import type { CardScript, GameState, PlayerId, Unit } from "./types";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
const plain: CardScript = { implemented: true };
export const cardWave25Scripts: Record<string, CardScript> = {
  "ogn-194-298": { ...plain, keywords: ["Ganking"] },
  "sfd-018-221": plain,
  "unl-086-219": plain,
};
export function queueTokenReplacements(
  s: GameState,
  p: PlayerId,
  unit: Unit,
  name: string,
  ready: boolean,
) {
  const ids = textUnits(s)
    .filter(
      (u) =>
        u.owner === p &&
        isFace(u.cardId, "UNL", 86) &&
        u.location.startsWith("field:") &&
        u.tokenCopiesTurn !== s.turn,
    )
    .map((u) => u.abilityInstance ?? u.id);
  if (ids.length)
    (s.tokenCopyChoices ??= []).push({
      player: p,
      original: unit.id,
      name,
      location: unit.location,
      ready,
      sources: ids,
    });
}
export function drainTokenReplacements(s: GameState, ctx: PreconContext) {
  if (s.pendingChoice) return;
  while (s.tokenCopyChoices?.length) {
    const d = s.tokenCopyChoices[0],
      source = textUnits(s).find(
        (u) =>
          d.sources.includes(u.abilityInstance ?? u.id) &&
          u.tokenCopiesTurn !== s.turn,
      );
    if (!source) {
      s.tokenCopyChoices.shift();
      continue;
    }
    choices(s, d.player, ctx, [
      option(
        d.player,
        `zilean:${source.abilityInstance ?? source.id}:yes`,
        "Play one additional token",
        [
          {
            type: "special",
            custom: "wave25:zilean",
            cardName: source.abilityInstance ?? source.id,
            ready: true,
          },
        ],
      ),
      option(
        d.player,
        `zilean:${source.abilityInstance ?? source.id}:no`,
        "Play only the original token",
        [
          {
            type: "special",
            custom: "wave25:zilean",
            cardName: source.abilityInstance ?? source.id,
          },
        ],
      ),
    ]);
    return;
  }
}
export const cardWave25Module: ExpansionModule = {
  effect(s, p, e, ctx) {
    if (e.custom === "inspection:selected") {
      continueSelected(
        s,
        p,
        e.cardName!,
        ctx,
        e.keyword as "keep" | "banish" | undefined,
      );
      return true;
    }
    if (e.custom === "inspection:nocturne") {
      banishInspectedNocturne(s, p, e.amount!, ctx);
      return true;
    }
    if (e.custom !== "wave25:zilean") return false;
    const d = s.tokenCopyChoices?.[0];
    if (!d) return true;
    d.sources = d.sources.filter((id) => id !== e.cardName);
    const source = textUnits(s).find(
      (u) => (u.abilityInstance ?? u.id) === e.cardName,
    );
    if (e.ready && source) {
      source.tokenCopiesTurn = s.turn;
      const token = ctx.spawnToken(s, p, d.name, d.location, d.ready);
      if (token) {
        (s.tokenCopyLinks ??= []).push({
          original: d.original,
          copy: token.id,
        });
        const original = s.units.find((u) => u.id === d.original);
        if (
          original?.copyEffects?.some((c) => c.sourceId.startsWith("token:"))
        ) {
          copyUnit(token, original.cardId, `token:${token.id}`);
          token.temporary = original.temporary;
        }
      }
    }
    if (!d.sources.length) s.tokenCopyChoices?.shift();
    return true;
  },
};
