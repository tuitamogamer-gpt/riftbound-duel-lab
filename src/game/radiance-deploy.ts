import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import { deployedGear, hasDeploy } from "./deploy";
import type { ExpansionModule } from "./later-precon-engine";
import { physicalOwner, returnBoardCardsToHand } from "./objects";
import type { CardScript, Effect, GameState, Unit } from "./types";
import {
  exhaustLegend,
  findLegend,
  hasLegend,
  legendCardOf,
  legendKeyFor,
  legendReady,
} from "./legends";

/**
 * Radiance wave 2: [Deploy] gear, Bomb tokens and the cards built around
 * them. Rules sources: Core Rules 830 (Deploy) and 187.12 (Bomb token),
 * Radiance core rules patch notes of 16 October 2026.
 */
const plain: CardScript = { implemented: true };
const deploy: CardScript = { implemented: true, keywords: ["Deploy"] };
const rd = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `radiance:${custom}`,
  ...extra,
});
const bomb: Effect = { type: "token", cardName: "Bomb" };
const ziggsExplosive: CardScript = {
  ...plain,
  abilities: [
    {
      label: "Play a Bomb gear token to a battlefield",
      energy: 1,
      exhaust: true,
      effects: [bomb],
    },
  ],
  onDefend: [rd("ziggs-defend")],
};
const hexplosivesExpert: CardScript = {
  ...plain,
  abilities: [
    {
      label: "Play a Bomb gear token to a battlefield",
      energy: 1,
      power: 1,
      exhaust: true,
      effects: [bomb],
    },
  ],
};
const martialParagon: CardScript = {
  ...plain,
  notes: "Your gear with [Deploy] have [Action].",
  onConquer: [rd("paragon-channel")],
};

export const radianceDeployScripts: Record<string, CardScript> = {
  // Core Rules 187.12: [Deploy]; [Deathknell] Deal 2 to an enemy unit here
  // and kill all other Bombs you control here.
  "token-bomb": {
    ...plain,
    keywords: ["Deploy", "Deathknell"],
    onDeath: [
      {
        type: "damage",
        amount: 2,
        target: "enemyUnitHere",
        condition: "deathLocation",
      },
      rd("bombs-here"),
    ],
  },
  // Amateur Demolitionist: When you play me, play a Bomb to a battlefield.
  "rad-001-167": { ...plain, onPlay: [bomb] },
  // Banner of Conquest: Friendly units here have [Assault].
  "rad-002-167": deploy,
  // Hunting Blind: you may move an enemy unit here; friendly units here have [Shield 2].
  "rad-044-167": { ...deploy, onPlay: [rd("blind-move")] },
  // Resource Extractor: end of your turn, if you control here, exhausted Gold.
  "rad-052-167": { ...deploy, onEnd: [rd("extractor")] },
  // Overloaded Traveler: +1 Might while a friendly [Deploy] gear is at my battlefield.
  "rad-072-167": plain,
  // Pillaged Armory: when you play this or conquer here, [Buff] a friendly unit.
  "rad-073-167": {
    ...deploy,
    onPlay: [{ type: "buff", target: "friendlyUnit" }],
    onConquer: [{ type: "buff", target: "friendlyUnit" }],
  },
  // Portable Portal: you may pay Body Power to ready a unit here; units here have [Ganking].
  "rad-087-167": { ...deploy, onPlay: [rd("portal-ready")] },
  // Jarvan IV, Martial Paragon.
  "rad-091-167": martialParagon,
  "rad-091a-167": martialParagon,
  // Explosimian: When I hold, play three Bombs to a single battlefield.
  "rad-094-167": {
    ...plain,
    onHold: [{ ...bomb, amount: 3, condition: "singleLocation" }],
  },
  // Satchel Charge: [Action] Move a friendly unit, then play a Bomb to a battlefield.
  "rad-096-167": {
    ...plain,
    action: true,
    spell: [
      {
        type: "moveTarget",
        target: "friendlyUnit",
        condition: "chooseDestination",
      },
      bomb,
    ],
  },
  // The Good Stuff: discard 1, then draw 3; when you hold here, return this to hand.
  "rad-106-167": {
    ...deploy,
    onPlay: [
      { type: "discard", amount: 1 },
      { type: "draw", amount: 3 },
    ],
    onHold: [rd("return-self")],
  },
  // Bushwhack Trap: its controller may hide an additional card here.
  "rad-108-167": deploy,
  // Ziggs, Explosive and its alternate art.
  "rad-112-167": ziggsExplosive,
  "rad-112a-167": ziggsExplosive,
  // Concert Poster: when you play this or conquer here, you may pay 1 for a Recruit.
  "rad-116-167": {
    ...deploy,
    onPlay: [rd("poster")],
    onConquer: [rd("poster")],
  },
  // Hexplosives Expert legend and its alternate art.
  "rad-141-167": hexplosivesExpert,
  "rad-169-167": hexplosivesExpert,
  // Exemplar of Demacia legend and its alternate art: handled by the play event.
  "rad-155-167": plain,
  "rad-176-167": plain,
  // Demacian Standard: +2 to one friendly attacker here; may return on hold.
  "rad-156-167": { ...deploy, onHold: [rd("standard-return")] },
};

const count = (s: GameState, u: Unit, set: string, number: number): number =>
  u.location.startsWith("field:")
    ? deployedGear(s, u.location, u.owner).filter((g) =>
        isFace(g.cardId, set, number),
      ).length
    : 0;
const combatAt = (s: GameState, u: Unit) =>
  Boolean(
    s.combat && (s.combat.engaged ?? true) && s.combat.fieldId === u.location,
  );

export const radianceDeployModule: ExpansionModule = {
  might(s, u, value) {
    let bonus = 0;
    if (combatAt(s, u))
      bonus +=
        s.combat!.attacker === u.owner
          ? count(s, u, "RAD", 2) // Banner of Conquest: [Assault]
          : 2 * count(s, u, "RAD", 44); // Hunting Blind: [Shield 2]
    if (
      isFace(u.cardId, "RAD", 72) &&
      u.location.startsWith("field:") &&
      deployedGear(s, u.location, u.owner).some((g) => hasDeploy(g.cardId))
    )
      bonus += 1;
    return value + bonus;
  },
  keywords(s, u) {
    return [
      ...Array(count(s, u, "RAD", 2)).fill("Assault"),
      ...Array(count(s, u, "RAD", 44)).fill("Shield 2"),
      ...(count(s, u, "RAD", 87) ? ["Ganking"] : []),
    ];
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    // Demacian Standard: one trigger when friendly units attack here.
    if (name === "combatStart" && locationId && s.combat)
      for (const gear of deployedGear(s, locationId, s.combat.attacker))
        if (isFace(gear.cardId, "RAD", 156))
          ctx.trigger(
            s,
            gear.owner,
            gear.cardId,
            gear.id,
            [{ type: "might", amount: 2, target: "friendlyUnitHere" }],
            locationId,
          );
    // Exemplar of Demacia: When you play a gear with [Deploy] ...
    if (
      name === "play" &&
      locationId?.startsWith("field:") &&
      isCardType(getCard(cardId), "Gear") &&
      hasDeploy(cardId) &&
      hasLegend(s, p, (id) => isFace(id, "RAD", 155))
    )
      ctx.trigger(
        s,
        p,
        findLegend(s, p, (id) => isFace(id, "RAD", 155))!.cardId,
        legendKeyFor(s, p, undefined, (id) => isFace(id, "RAD", 155)),
        [rd("exemplar")],
        locationId,
      );
    // Bomb: "...and kill all other Bombs you control here" does not depend on
    // the damage. When no enemy unit here can be chosen, the targeted
    // Deathknell never reaches the chain, so that part triggers on its own.
    if (
      name === "death" &&
      cardId === "token-bomb" &&
      sourceId &&
      locationId &&
      deployedGear(s, locationId, p).some(
        (g) => g.cardId === "token-bomb" && g.id !== sourceId,
      ) &&
      !s.units.some(
        (u) =>
          u.owner !== p &&
          u.location === locationId &&
          (ctx.canTargetUnit?.(s, p, u) ?? true) &&
          ctx.canPay(s, p, 0, 0, [], ctx.targetTax?.(s, p, u.id) ?? 0),
      )
    )
      ctx.trigger(s, p, cardId, sourceId, [rd("bombs-here")], locationId);
  },
  effect(s, p, e, ctx) {
    // CR 830.1.b: "When an opponent holds here, kill this."
    if (e.custom === "deploy:opponent-held") {
      const gear = s.gears.find(
        (g) => g.id === ctx.sourceId && g.deployedAt === ctx.locationId,
      );
      if (gear) ctx.killGear(s, gear.id);
      return true;
    }
    if (!e.custom?.startsWith("radiance:")) return false;
    const here = ctx.locationId;
    const x = s.players[p];
    switch (e.custom.slice("radiance:".length)) {
      case "bombs-here":
        if (here)
          for (const gear of deployedGear(s, here, p).filter(
            (g) => g.cardId === "token-bomb" && g.id !== ctx.sourceId,
          ))
            ctx.killGear(s, gear.id);
        return true;
      case "return-self": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (gear && gear.deployedAt === here)
          returnBoardCardsToHand(s, [gear.id], (object) =>
            ctx.cardEvent(
              s,
              "bounce",
              physicalOwner(object),
              object.cardId,
              object.id,
              here,
            ),
          );
        return true;
      }
      case "standard-return":
        if (s.gears.some((g) => g.id === ctx.sourceId && g.deployedAt === here))
          choices(s, p, ctx, [
            option(p, "standard:return", "Return Demacian Standard to hand", [
              rd("return-self"),
            ]),
            option(p, "standard:keep", "Keep Demacian Standard here", []),
          ]);
        return true;
      case "extractor": {
        const field = s.fields.find((f) => f.id === here);
        if (field?.controller === p)
          ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
        return true;
      }
      case "poster":
        if (ctx.canPay(s, p, 1, 0))
          choices(s, p, ctx, [
            option(p, "poster:pay", "Pay 1 Energy: Recruit to your base", [
              rd("poster-pay"),
            ]),
            option(p, "poster:decline", "Decline", []),
          ]);
        return true;
      case "poster-pay":
        if (ctx.canPay(s, p, 1, 0)) {
          ctx.pay(s, p, 1, 0);
          ctx.spawnToken(s, p, "Recruit", `base:${p}`, false);
        }
        return true;
      case "portal-ready": {
        const units = s.units.filter((u) => u.location === here && !u.ready);
        if (units.length && ctx.canPay(s, p, 0, 1, ["Body"]))
          choices(s, p, ctx, [
            ...units.map((u) => ({
              ...option(
                p,
                `portal:${u.id}`,
                `Pay Body Power: ready ${getCard(u.cardId).name}`,
                [rd("portal-pay")],
              ),
              targetId: u.id,
            })),
            option(p, "portal:decline", "Decline", []),
          ]);
        return true;
      }
      case "portal-pay": {
        const unit = s.units.find(
          (u) => u.id === ctx.targetId && u.location === here,
        );
        if (unit && ctx.canPay(s, p, 0, 1, ["Body"])) {
          ctx.pay(s, p, 0, 1, ["Body"]);
          ctx.runEffects(s, p, [{ type: "ready" }], unit.id);
        }
        return true;
      }
      case "blind-move": {
        const enemies = s.units.filter(
          (u) =>
            u.owner !== p &&
            u.location !== here &&
            (ctx.canTargetUnit?.(s, p, u) ?? true),
        );
        if (here && enemies.length)
          choices(s, p, ctx, [
            ...enemies.map((u) => ({
              ...option(
                p,
                `blind:${u.id}`,
                `Move ${getCard(u.cardId).name} to this battlefield`,
                [rd("blind-move-unit")],
              ),
              targetId: u.id,
            })),
            option(p, "blind:decline", "Do not move an enemy unit", []),
          ]);
        return true;
      }
      case "blind-move-unit": {
        const unit = s.units.find((u) => u.id === ctx.targetId);
        if (unit && here && unit.location !== here)
          ctx.moveUnit(s, unit, here, p);
        return true;
      }
      case "ziggs-defend": {
        const ziggs = s.units.find((u) => u.id === ctx.sourceId);
        const gear = s.gears.filter(
          (g) => g.owner === p && !s.units.some((u) => u.id === g.id),
        );
        if (ziggs && gear.length)
          choices(s, p, ctx, [
            ...gear.map((g) =>
              option(
                p,
                `ziggs:${g.id}`,
                `Kill ${getCard(g.cardId).name}: Ziggs gets +2 Might`,
                [rd("ziggs-kill", { cardName: g.id })],
              ),
            ),
            option(p, "ziggs:decline", "Do not kill a gear", []),
          ]);
        return true;
      }
      case "ziggs-kill": {
        const gear = s.gears.find((g) => g.id === e.cardName && g.owner === p);
        const ziggs = s.units.find((u) => u.id === ctx.sourceId);
        if (gear) {
          ctx.killGear(s, gear.id);
          if (ziggs) ziggs.temporaryMight += 2;
        }
        return true;
      }
      case "paragon-channel":
        if (here && deployedGear(s, here, p).some((g) => hasDeploy(g.cardId)))
          ctx.channel(s, p, 1, false);
        return true;
      case "exemplar": {
        const units = s.units.filter(
          (u) => u.owner === p && u.location !== here,
        );
        const exemplar = legendKeyFor(s, p, ctx.sourceId, (id) =>
          isFace(id, "RAD", 155),
        );
        if (
          here &&
          legendReady(s, p, exemplar) &&
          isFace(legendCardOf(s, p, exemplar) ?? "", "RAD", 155) &&
          units.length &&
          ctx.canPay(s, p, 0, 1)
        )
          choices(s, p, ctx, [
            ...units.map((u) => ({
              ...option(
                p,
                `exemplar:${u.id}`,
                `Exhaust Exemplar and pay 1 Power: move ${getCard(u.cardId).name}`,
                [rd("exemplar-move")],
              ),
              targetId: u.id,
            })),
            option(p, "exemplar:decline", "Decline", []),
          ]);
        return true;
      }
      case "exemplar-move": {
        const unit = s.units.find(
          (u) => u.id === ctx.targetId && u.owner === p,
        );
        const exemplar = legendKeyFor(s, p, ctx.sourceId, (id) =>
          isFace(id, "RAD", 155),
        );
        if (
          unit &&
          here &&
          legendReady(s, p, exemplar) &&
          unit.location !== here &&
          ctx.canPay(s, p, 0, 1)
        ) {
          exhaustLegend(s, p, exemplar);
          ctx.pay(s, p, 0, 1);
          ctx.moveUnit(s, unit, here, p);
        }
        return true;
      }
    }
    return false;
  },
};

/** Exact printing IDs reviewed in this wave. */
export const reviewedRadianceDeployPrintings: readonly string[] = Object.keys(
  radianceDeployScripts,
)
  .filter((id) => id.startsWith("rad-"))
  .sort();
