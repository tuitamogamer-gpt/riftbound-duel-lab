import {
  textSources,
  textUnits,
  textEffects,
  abilityUnit,
} from "./text-sources";
import { getCard } from "../data/cards";
import { isFace } from "./board-rules";
import { physicalOwner, physicalCard, detach } from "./objects";
import { banishCard } from "./banishment";
import { option } from "./card-wave16";
import type { GameState, PlayerId, Unit } from "./types";
import type { PreconContext } from "./later-precon-engine";
type Batch = NonNullable<GameState["deathBatches"]>[number];
type Replacement = {
  id: string;
  kind:
    | "soraka"
    | "guardian"
    | "zhonya"
    | "sett"
    | "altar"
    | "armory"
    | "smite"
    | "highlander";
  player: PlayerId;
  ids: string[];
  source?: string;
  optional?: boolean;
};
function replacements(
  s: GameState,
  b: Batch,
  ctx: PreconContext,
): Replacement[] {
  const dying = s.units.filter((u) => b.ids.includes(u.id));
  const out: Replacement[] = [];
  const add = (r: Replacement) => {
    if (
      !b.used.includes(r.id) &&
      (!r.optional || !b.declined.includes(String(r.player)))
    )
      out.push(r);
  };
  for (const source of textUnits(s).filter((u) =>
    isFace(u.cardId, "SFD", 173),
  )) {
    const saved = dying.filter(
      (u) =>
        u.owner === source.owner &&
        u.id !== source.id &&
        u.location === source.location &&
        ctx.getMight(s, u, false) < ctx.getMight(s, source, false),
    );
    if (saved.length)
      add({
        id: `soraka:${source.abilityInstance ?? source.id}`,
        kind: "soraka",
        player: source.owner,
        ids: saved.map((u) => u.id),
        source: source.id,
      });
  }
  for (const u of dying) {
    const player = s.players[u.owner];
    if (u.deathReplacementTurn === s.turn)
      add({
        id: `highlander:${u.id}`,
        kind: "highlander",
        player: u.owner,
        ids: [u.id],
      });
    if (u.banishOnDeathTurn === s.turn)
      add({ id: `smite:${u.id}`, kind: "smite", player: u.owner, ids: [u.id] });
    if (u.armoryTurn === s.turn && ctx.canPay(s, u.owner, 0, 1, ["Fury"]))
      add({
        id: `armory:${u.id}`,
        kind: "armory",
        player: u.owner,
        ids: [u.id],
        optional: true,
      });
    if (
      isFace(player.legendId, "OGN", 269) &&
      u.buff &&
      player.legendUsedTurn < 0 &&
      ctx.canPay(s, u.owner, 0, 1)
    )
      add({
        id: `sett:${u.id}`,
        kind: "sett",
        player: u.owner,
        ids: [u.id],
        optional: true,
      });
    if (
      b.combat &&
      s.fields.some(
        (f) => f.id === u.location && isFace(f.cardId, "UNL", 206),
      ) &&
      ctx.canPay(s, u.owner, 0, 3)
    )
      add({
        id: `altar:${u.id}`,
        kind: "altar",
        player: u.owner,
        ids: [u.id],
        optional: true,
      });
    for (const gear of s.gears) {
      if (
        gear.owner === u.owner &&
        !gear.attachedTo &&
        isFace(gear.cardId, "OGN", 77)
      )
        add({
          id: `zhonya:${gear.id}:${u.id}`,
          kind: "zhonya",
          source: gear.id,
          player: u.owner,
          ids: [u.id],
        });
      if (gear.attachedTo === u.id && isFace(gear.cardId, "SFD", 51))
        add({
          id: `guardian:${gear.id}`,
          kind: "guardian",
          source: gear.id,
          player: u.owner,
          ids: [u.id],
        });
    }
  }
  return out;
}
function replace(s: GameState, b: Batch, r: Replacement, ctx: PreconContext) {
  b.used.push(r.id);
  if (r.kind === "guardian" || r.kind === "zhonya") ctx.killGear(s, r.source!);
  if (r.kind === "sett") {
    ctx.pay(s, r.player, 0, 1);
    s.players[r.player].legendUsedTurn = s.turn;
  }
  if (r.kind === "altar") ctx.pay(s, r.player, 0, 3);
  if (r.kind === "armory") ctx.pay(s, r.player, 0, 1, ["Fury"]);
  for (const u of s.units.filter((u) => r.ids.includes(u.id))) {
    if (r.kind === "smite") {
      if (!u.token) banishCard(s, physicalOwner(u), physicalCard(u));
      for (const g of s.gears.filter((g) => g.attachedTo === u.id))
        detach(s, g);
      s.units = s.units.filter((v) => v.id !== u.id);
      ctx.cardEvent(s, "banish", u.owner, u.cardId, u.id, u.location);
    } else {
      if (r.kind === "sett") {
        u.buff--;
        ctx.cardEvent(s, "spendBuff", u.owner, u.cardId, u.id, u.location);
      }
      delete u.armoryTurn;
      delete u.deathReplacementTurn;
      u.damage = 0;
      u.damageByPlayer = [0, 0];
      u.ready = false;
      u.location = `base:${u.owner}`;
    }
  }
  b.ids = b.ids.filter((id) => !r.ids.includes(id));
}
export function advanceDeaths(
  s: GameState,
  ctx: PreconContext,
  selected?: string,
) {
  if (s.pendingChoice) return;
  const b = s.deathBatches?.[0];
  if (!b) return;
  if (selected?.startsWith("decline:")) b.declined.push(selected.split(":")[1]);
  else if (selected) {
    const r = replacements(s, b, ctx).find((r) => r.id === selected);
    if (r) replace(s, b, r, ctx);
  }
  for (;;) {
    const available = replacements(s, b, ctx);
    if (!available.length) {
      s.deathBatches!.shift();
      ctx.commitDeaths!(
        s,
        b.ids,
        b.actor,
        b.spellId,
        b.credited,
        b.delayedSpell,
      );
      advanceDeaths(s, ctx);
      return;
    }
    const player = available.some((r) => r.player === s.currentPlayer)
      ? s.currentPlayer
      : ((1 - s.currentPlayer) as PlayerId);
    const options = available.filter((r) => r.player === player);
    if (options.length === 1 && !options[0].optional) {
      replace(s, b, options[0], ctx);
      continue;
    }
    const actions = options.map((r) =>
      option(
        player,
        `death:${r.id}`,
        `${r.kind}: ${r.ids.map((id) => getCard(s.units.find((u) => u.id === id)!.cardId).name).join(", ")}`,
        [{ type: "special", custom: "death-replacement", cardName: r.id }],
      ),
    );
    if (options.every((r) => r.optional))
      actions.push(
        option(player, "death:decline", "Let the units die", [
          {
            type: "special",
            custom: "death-replacement",
            cardName: `decline:${player}`,
          },
        ]),
      );
    ctx.openChoice(s, player, { options: actions });
    return;
  }
}
