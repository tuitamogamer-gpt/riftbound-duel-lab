import { getCard, isCardType } from "../data/cards";
import { banishCard, banishedCards, takeBanished } from "./banishment";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import { queueCardPlay } from "./card-play";
import { syncHybridObjects } from "./card-wave19";
import { deployedGear } from "./deploy";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import { detach, physicalCard, physicalOwner } from "./objects";
import { takeTrash, trashCards } from "./trash";
import type {
  CardScript,
  Effect,
  GameState,
  Gear,
  LocationId,
  PlayerId,
  Unit,
} from "./types";
import { exhaustLegend, findLegend, legendReady, legendRefs } from "./legends";

/**
 * Radiance wave 7: the last cards, built on new shared rules — a gear that
 * becomes a unit, Power restricted to units and gear, "pay any amount of
 * Power", movement taxes and Mordekaiser's death replacement.
 */
const plain: CardScript = { implemented: true };
const rd7 = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `radiance7:${custom}`,
  ...extra,
});
const cardName = (id: string) => getCard(id).name;
/** The Ball: "When you play or move this, choose one" (chosen as it triggers). */
export const ballTrigger: Effect = rd7("modal", {
  modes: [
    { label: "Draw 1", effects: [{ type: "draw", amount: 1 }] },
    { label: "Deal 2 to enemy units here", effects: [rd7("ball-damage")] },
  ],
});
const isUnitObject = (s: GameState, id: string) =>
  s.units.some((u) => u.id === id);

export const radianceWave7Scripts: Record<string, CardScript> = {
  // Mordekaiser, Twice Slain: death replacement in death-replacements.ts.
  "rad-020-167": {
    ...plain,
    accelerating: true,
    assault: 3,
    keywords: ["Accelerate", "Assault 3"],
  },
  // Gravity Field: movement tax (engine), Deathknell: draw 1.
  "rad-062-167": {
    ...plain,
    keywords: ["Deploy", "Deathknell"],
    onDeath: [{ type: "draw", amount: 1 }],
  },
  // Dockside Lock-Up.
  "rad-136-167": { ...plain, keywords: ["Deploy"], onPlay: [rd7("lockup")] },
  // Chronobreak: pay any amount of Power as it is played.
  "rad-140-167": { ...plain, xPower: true, spell: [rd7("chronobreak")] },
  // Iron Revenant: legend [Add] ability (module).
  "rad-143-167": plain,
  // Lady of Clockwork: Main Phase trigger (module).
  "rad-145-167": plain,
  // The Ball.
  // Neeko, Blending In: adds one of the deck's chosen legends while on the board.
  "rad-167-167": { ...plain, onPlay: [rd7("neeko")] },
  "rad-146-167": {
    ...plain,
    keywords: ["Deploy", "Ganking"],
    onPlay: [ballTrigger],
  },
};

/** Gravity Field: opponents pay 1 Energy and 1 Power per move to its battlefield. */
export function gravityMoveTax(s: GameState, p: PlayerId, to: LocationId) {
  if (!to.startsWith("field:")) return 0;
  return deployedGear(s, to).filter(
    (g) => g.owner !== p && isFace(g.cardId, "RAD", 62),
  ).length;
}

/** Remove a unit from the board into its owner's banishment (tokens cease to exist). */
function banishUnit(s: GameState, u: Unit, ctx: PreconContext) {
  const owner = physicalOwner(u);
  const card = physicalCard(u);
  for (const g of s.gears.filter((g) => g.attachedTo === u.id)) detach(s, g);
  s.units = s.units.filter((v) => v.id !== u.id);
  s.gears = s.gears.filter((g) => g.id !== u.id);
  ctx.cardEvent(s, "banish", u.owner, u.cardId, u.id, u.location);
  ctx.log?.(s, `${cardName(card)} is banished.`, "info", owner);
  return u.token ? undefined : banishCard(s, owner, card);
}
/** Play a card from banishment by its entry id, if it is still there. */
function playBanished(
  s: GameState,
  p: PlayerId,
  owner: PlayerId,
  entryId: string,
  ctx: PreconContext,
  extra: Partial<NonNullable<Effect["play"]>> = {},
) {
  const index = banishedCards(s, owner).findIndex((c) => c.id === entryId);
  if (index < 0) return;
  ctx.runEffects(s, p, [
    {
      type: "playCard",
      play: {
        zone: "banished",
        zoneOwner: owner,
        sourceRef: `banished:${index}`,
        ignoreCost: true,
        controller: p,
        ...extra,
      },
    },
  ]);
}

/** Lady of Clockwork: the chosen gear becomes a unit gear. */
function animate(s: GameState, p: PlayerId, gearId: string) {
  const state = (s.radiance ??= {});
  const previous = state.clockwork?.[p];
  if (previous && previous !== gearId) restore(s, previous);
  const gear = s.gears.find((g) => g.id === gearId && g.owner === p);
  if (!gear || isUnitObject(s, gear.id)) return;
  const unit: Unit & Gear = {
    ...gear,
    location: gear.deployedAt ?? `base:${p}`,
    damage: 0,
    buff: 0,
    temporaryMight: 0,
    temporaryAssault: 0,
    stunned: false,
    gear: [],
    summonedTurn: s.turn,
  };
  s.units.push(unit);
  s.gears = s.gears.map((g) => (g.id === gear.id ? unit : g));
  (state.clockwork ??= {})[p] = gear.id;
  syncHybridObjects(s);
}
/** The previously chosen gear stops being a unit. */
function restore(s: GameState, gearId: string) {
  const unit = s.units.find((u) => u.id === gearId);
  if (!unit) return;
  s.units = s.units.filter((u) => u.id !== gearId);
  const gear: Gear = {
    id: unit.id,
    cardId: unit.cardId,
    owner: unit.owner,
    ready: unit.ready,
    ...(unit.originalOwner !== undefined
      ? { originalOwner: unit.originalOwner }
      : {}),
    ...(unit.token ? { token: true } : {}),
    ...(unit.location.startsWith("field:")
      ? { deployedAt: unit.location }
      : {}),
    ...((unit as Unit & Gear).usedAbilities
      ? { usedAbilities: (unit as Unit & Gear).usedAbilities }
      : {}),
  };
  s.gears = s.gears.map((g) => (g.id === gearId ? gear : g));
  syncHybridObjects(s);
}

/** Where The Ball is: a unit's place, or the battlefield it is deployed to. */
function ballPlace(s: GameState, id: string) {
  return (
    s.units.find((u) => u.id === id)?.location ??
    s.gears.find((g) => g.id === id)?.deployedAt
  );
}

export const radianceWave7Module: ExpansionModule = {
  might(s, u, value) {
    // Lady of Clockwork: a unit gear's base Might equals its Energy cost.
    if (
      s.radiance?.clockwork?.[u.owner] === u.id &&
      u.baseMightOverride === undefined
    ) {
      const card = getCard(u.cardId);
      return value + (card.energy ?? 0) - (card.might ?? 0);
    }
    return value;
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    // Neeko leaves the board: her legend leaves the Legend Zone.
    if (
      (name === "death" || name === "bounce" || name === "banish") &&
      sourceId &&
      s.radiance?.neeko?.some((n) => n.unitId === sourceId)
    )
      s.radiance.neeko = s.radiance.neeko.filter((n) => n.unitId !== sourceId);
    // Dockside Lock-Up: when you hold here, kill this to play the banished card.
    if (name === "hold" && locationId)
      for (const g of deployedGear(s, locationId, p).filter(
        (g) => isFace(g.cardId, "RAD", 136) && s.radiance?.lockUp?.[g.id],
      ))
        ctx.trigger(
          s,
          p,
          g.cardId,
          g.id,
          [rd7("lockup-release", { optional: true })],
          locationId,
        );
    // Lady of Clockwork: at the start of your Main Phase.
    const lady = findLegend(s, p, (id) => isFace(id, "RAD", 145));
    if (
      name === "main" &&
      lady &&
      s.gears.some((g) => g.owner === p && !g.attachedTo)
    )
      ctx.trigger(s, p, lady.cardId, lady.key, [
        rd7("clockwork", { optional: true, triggerCost: { energy: 1 } }),
      ]);
    // The Ball as a unit: when it moves.
    if (name === "move" && sourceId) {
      const u = s.units.find((v) => v.id === sourceId);
      if (u && isFace(u.cardId, "RAD", 146))
        ctx.trigger(s, u.owner, u.cardId, u.id, [ballTrigger], u.location);
    }
  },
  actions(s, p) {
    // Iron Revenant: [Reaction] banish a unit or gear from your trash, exhaust: add 1.
    const revenant = findLegend(s, p, (id) => isFace(id, "RAD", 143));
    if (
      !revenant ||
      !legendReady(s, p, revenant.key) ||
      s.priorityPlayer !== p ||
      s.pendingChoice ||
      !["main", "showdown"].includes(s.phase)
    )
      return [];
    const seen = new Set<string>();
    return trashCards(s, p).flatMap((t) => {
      const card = getCard(t.cardId);
      if (
        seen.has(t.cardId) ||
        !(isCardType(card, "Unit") || isCardType(card, "Gear"))
      )
        return [];
      seen.add(t.cardId);
      return [
        {
          id: `radiance:revenant:${t.id}`,
          category: "resource" as const,
          player: p,
          sourceId: revenant.key,
          cardId: revenant.cardId,
          label: `Iron Revenant: banish ${card.name} from your trash, add 1 Power for units or gear`,
        },
      ];
    });
  },
  apply(s, action, ctx) {
    if (!action.id.startsWith("radiance:revenant:")) return false;
    const p = action.player;
    const x = s.players[p];
    const trashId = action.id.slice("radiance:revenant:".length);
    const cardId = takeTrash(s, p, trashId);
    if (!cardId) return true;
    banishCard(s, p, cardId);
    ctx.cardEvent(s, "banish", p, cardId);
    exhaustLegend(s, p, action.sourceId ?? "legend");
    x.permanentPower = (x.permanentPower ?? 0) + 1;
    ctx.log?.(
      s,
      `${x.name} banishes ${cardName(cardId)} and adds 1 Power for units or gear.`,
      "play",
      p,
    );
    return true;
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("radiance7:")) return false;
    switch (e.custom.slice("radiance7:".length)) {
      case "lockup": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        const here = gear?.deployedAt;
        if (!gear || !here) return true;
        const units = s.units.filter((u) => u.location === here);
        if (units.length)
          choices(
            s,
            p,
            ctx,
            units.map((u) =>
              option(p, `lockup:${u.id}`, `Banish ${cardName(u.cardId)}`, [
                rd7("lockup-banish", { cardName: u.id }),
              ]),
            ),
          );
        return true;
      }
      case "lockup-banish": {
        const u = s.units.find((v) => v.id === e.cardName);
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (!u || !gear) return true;
        const owner = physicalOwner(u);
        const entry = banishUnit(s, u, ctx);
        if (entry)
          ((s.radiance ??= {}).lockUp ??= {})[gear.id] = `${owner}|${entry}`;
        return true;
      }
      case "lockup-release": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        const held = gear && s.radiance?.lockUp?.[gear.id];
        if (!gear || !held) return true;
        delete s.radiance!.lockUp![gear.id];
        const [owner, entry] = held.split("|");
        ctx.killGear(s, gear.id);
        playBanished(s, p, Number(owner) as PlayerId, entry, ctx);
        return true;
      }
      case "chronobreak": {
        const picked = (e.keyword ?? "").split(",").filter(Boolean);
        const left = (e.amount ?? 0) - picked.length;
        const units = s.units.filter(
          (u) => u.owner === p && !picked.includes(u.id),
        );
        if (left > 0 && units.length) {
          choices(
            s,
            p,
            ctx,
            units.map((u) =>
              option(
                p,
                `chrono:${u.id}`,
                `Banish ${cardName(u.cardId)} and play it back (${left} left)`,
                [
                  rd7("chronobreak", {
                    amount: e.amount,
                    keyword: [...picked, u.id].join(","),
                  }),
                ],
              ),
            ),
          );
          return true;
        }
        // Banish them all, then each owner plays theirs back in the chosen order.
        const group = `chronobreak:${s.nextId++}`;
        for (const id of picked) {
          const u = s.units.find((v) => v.id === id);
          if (!u) continue;
          const owner = physicalOwner(u);
          const locationId = u.location;
          const entry = banishUnit(s, u, ctx);
          if (!entry) continue;
          const index = banishedCards(s, owner).findIndex(
            (c) => c.id === entry,
          );
          const cardId = takeBanished(s, owner, entry);
          if (!cardId) continue;
          queueCardPlay(
            s,
            owner,
            cardId,
            {
              zone: "banished",
              zoneOwner: owner,
              ignoreCost: true,
              controller: owner,
              destination: "base",
              alternativeHere: true,
              locationId,
              orderGroup: group,
            },
            "banished",
            index,
          );
        }
        return true;
      }
      case "clockwork": {
        const gears = s.gears.filter(
          (g) => g.owner === p && !g.attachedTo && !isUnitObject(s, g.id),
        );
        if (gears.length)
          choices(
            s,
            p,
            ctx,
            gears.map((g) =>
              option(
                p,
                `clockwork:${g.id}`,
                `${cardName(g.cardId)} becomes a ${getCard(g.cardId).energy ?? 0} Might unit`,
                [rd7("animate", { cardName: g.id })],
              ),
            ),
          );
        return true;
      }
      case "animate":
        animate(s, p, e.cardName!);
        return true;
      case "neeko": {
        const neeko = s.units.find((u) => u.id === ctx.sourceId);
        if (!neeko) return true;
        // "Different" legends: none may share a name with one already in play.
        const inZone = new Set(
          legendRefs(s, p).map((ref) => getCard(ref.cardId).name),
        );
        const options = (s.players[p].extraLegends ?? []).filter(
          (id) => !inZone.has(getCard(id).name),
        );
        if (options.length)
          choices(
            s,
            p,
            ctx,
            options.map((id) =>
              option(
                p,
                `neeko:${id}`,
                `Add ${cardName(id)} to your Legend Zone`,
                [rd7("neeko-add", { cardName: id })],
              ),
            ),
          );
        return true;
      }
      case "neeko-add": {
        const neeko = s.units.find((u) => u.id === ctx.sourceId);
        if (!neeko || !e.cardName) return true;
        ((s.radiance ??= {}).neeko ??= []).push({
          player: p,
          unitId: neeko.id,
          legendId: e.cardName,
          usedTurn: -1,
          empowered: false,
        });
        ctx.cardEvent(s, "reveal", p, e.cardName);
        ctx.log?.(
          s,
          `${s.players[p].name} adds ${cardName(e.cardName)} to their Legend Zone.`,
          "play",
          p,
        );
        return true;
      }
      case "modal":
        return true;
      case "ball-damage": {
        const here = ctx.sourceId ? ballPlace(s, ctx.sourceId) : undefined;
        if (!here?.startsWith("field:")) return true;
        for (const u of s.units.filter(
          (u) => u.owner !== p && u.location === here,
        ))
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: 2 }],
            u.id,
            ctx.sourceId,
          );
        return true;
      }
    }
    return false;
  },
};

export const reviewedRadianceWave7Printings: readonly string[] =
  Object.keys(radianceWave7Scripts).sort();
