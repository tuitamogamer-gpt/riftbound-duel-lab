import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import { deployedGear, hasDeploy } from "./deploy";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import { useOncePerTurn, usedThisTurn } from "./radiance-rules";
import { shieldValue } from "./radiance-wave5";
import { ballTrigger } from "./radiance-wave7";
import { textSources } from "./text-sources";
import { takeTrash, trashCards } from "./trash";
import type {
  ActivatedAbility,
  CardScript,
  Effect,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";

/**
 * Radiance wave 6: the remaining cards that build on existing rules, plus
 * shared hooks for gear exhaustion, Might reductions, banished-card play
 * permissions, extra Deathknell triggers and legend ability grants.
 */
const plain: CardScript = { implemented: true };
const rd6 = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `radiance6:${custom}`,
  ...extra,
});
const bomb: Effect = { type: "token", cardName: "Bomb" };
const gold: Effect = { type: "token", cardName: "Gold", location: "base" };
const other = (p: PlayerId) => (p === 0 ? 1 : 0) as PlayerId;
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);
const has = (s: GameState, u: Unit, n: number) =>
  textSources(s, u).some((t) => isFace(t.cardId, "RAD", n));
const isUnitObject = (s: GameState, id: string) =>
  s.units.some((u) => u.id === id);
const plainGear = (s: GameState, p: PlayerId) =>
  s.gears.filter((g) => g.owner === p && !isUnitObject(s, g.id));
const cardName = (id: string) => getCard(id).name;
const both = (effects: Effect[]) => ({ onAttack: effects, onDefend: effects });

export const radianceWave6Scripts: Record<string, CardScript> = {
  // Scorched Earth: 5 damage split among units at a single battlefield.
  "rad-006-167": {
    ...plain,
    action: true,
    spell: [
      {
        type: "special",
        custom: "draft:split",
        cardTypes: ["Unit"],
        who: "all",
        amount: 5,
        group: { atBattlefield: true, sameLocation: true },
      },
    ],
  },
  // Forbidden Technique: ready a unit; trash play after a 7+ card.
  "rad-010-167": { ...plain, spell: [{ type: "ready", target: "anyUnit" }] },
  // Runeblade Anvil.
  "rad-012-167": {
    ...plain,
    onPlay: [rd6("anvil")],
    abilities: [
      {
        label: "Kill this",
        energy: 2,
        power: 1,
        domain: "Chaos",
        exhaust: true,
        effects: [rd6("kill-self")],
      },
    ],
  },
  // Shimmering Swimmer: may kill a friendly unit or gear; if so, deal 2.
  "rad-014-167": {
    ...plain,
    additionalCost: { board: { kind: "killUnitOrGear" } },
    onPlay: [
      {
        type: "damage",
        amount: 2,
        target: "anyUnit",
        condition: "paidAdditionalCost",
      },
    ],
  },
  // Akali, Brash: first and second moves each turn (module).
  "rad-015-167": plain,
  // Detonation Amplifier.
  "rad-017-167": { ...plain, keywords: ["Deploy"], onPlay: [rd6("amplifier")] },
  // Ekko, Revolutionary.
  "rad-021-167": {
    ...plain,
    assault: 1,
    keywords: ["Enters ready", "Assault"],
    abilities: [
      {
        label: "Banish me, then play me to your base",
        discard: 1,
        energy: 1,
        power: 1,
        domain: "Fury",
        timing: "action",
        effects: [rd6("ekko-blink")],
      },
    ],
  },
  // Whirling Twirligig.
  "rad-022-167": {
    ...plain,
    abilities: [
      {
        label: "Play a Gold gear token exhausted",
        exhaust: true,
        effects: [gold],
      },
      {
        label: "Kill a friendly gear: play a Recruit",
        exhaust: true,
        condition: "radiance:friendly-gear",
        effects: [rd6("twirl-gear")],
      },
      {
        label: "Kill a friendly unit: play a 3 Might Mech",
        exhaust: true,
        condition: "radiance:friendly-unit",
        effects: [rd6("twirl-unit")],
      },
    ],
  },
  // Ziggs, Short-Fused: a Bomb on play; gear abilities deal 1 Bonus Damage.
  "rad-023-167": { ...plain, onPlay: [bomb] },
  // Blossoming Dreamroot: when you win a combat here, draw 1 (module).
  "rad-024-167": { ...plain, keywords: ["Deploy"] },
  // Command: Attack.
  "rad-033-167": {
    ...plain,
    spellModes: [
      {
        label: "Move a friendly [Deploy] gear to a battlefield",
        effects: [rd6("command-move")],
      },
      {
        label: "Look at the top 5 and draw a gear",
        effects: [rd6("command-look")],
      },
    ],
  },
  // Storm Raptor: draws when a stunned enemy unit dies here (module).
  "rad-036-167": { ...plain, deflect: 1, keywords: ["Deflect"] },
  // Ahri, Confident.
  "rad-038-167": {
    ...plain,
    keywords: ["Disarm"],
    onAttack: [{ type: "might", amount: -1, target: "enemyUnitHere" }],
  },
  // Heartening Soul.
  "rad-040-167": { ...plain, onPlay: [rd6("ready-legend")] },
  // Riven, Broken Blade: modes when she becomes exhausted (module).
  "rad-043-167": plain,
  // K'Sante, Dauntless.
  "rad-045-167": {
    ...plain,
    shield: 1,
    keywords: ["Shield"],
    ...both([rd6("ksante")]),
  },
  // Resplendent Rostrum.
  "rad-046-167": {
    ...plain,
    abilities: [
      {
        label: "Draw 1 and channel 1 rune exhausted",
        exhaust: true,
        effects: [{ type: "draw", amount: 1 }, rd6("channel-exhausted")],
      },
    ],
  },
  // Improvised Projectile.
  "rad-056-167": {
    ...plain,
    action: true,
    spell: [rd6("projectile", { target: "unitAtBattlefield" })],
  },
  // Scrutinizing Scope.
  "rad-064-167": {
    ...plain,
    abilities: [
      {
        label: "An opponent guesses the type of your top card",
        energy: 1,
        exhaust: true,
        effects: [rd6("scope")],
      },
    ],
  },
  // Orianna, Mechanical Marvel: gear discount (module).
  "rad-068-167": plain,
  // Zero Point Inflection (module).
  "rad-069-167": plain,
  // Graves, Blasting Through.
  "rad-085-167": { ...plain, ...both([rd6("graves")]) },
  // Mechanical Bandit.
  "rad-111-167": { ...plain, onBegin: [rd6("bandit")] },
  // Angler Wyrm.
  "rad-113-167": {
    ...plain,
    deflect: 1,
    keywords: ["Deflect"],
    abilities: [
      {
        label: "An opponent moves a unit to my battlefield",
        exhaust: true,
        condition: "sourceAtBattlefield",
        effects: [rd6("angler")],
      },
    ],
  },
  // Riven, Deserter.
  "rad-114-167": {
    ...plain,
    abilities: [
      {
        label: "Exhaust a friendly unit: ready a unit",
        oncePerTurn: true,
        condition: "radiance:any-ready-friendly-unit",
        effects: [rd6("deserter", { target: "anyUnit" })],
      },
    ],
  },
  // Transpositionist.
  "rad-115-167": {
    ...plain,
    abilities: [
      {
        label: "Return a friendly unit; you may play a smaller unit",
        power: 1,
        domain: "Chaos",
        exhaust: true,
        effects: [rd6("transpose", { target: "friendlyUnit" })],
      },
    ],
  },
  // Battlefield Armorer (module).
  "rad-130-167": plain,
  // Boy Who Shattered Time.
  "rad-139-167": {
    ...plain,
    abilities: [
      {
        label: "Empower",
        energy: 1,
        exhaust: true,
        condition: "sourceNotEmpowered",
        effects: [{ type: "special", custom: "wave14:empower-source" }],
      },
      {
        label: "Your next unit costs 2 Energy and 1 Power less",
        disempowerSelf: true,
        exhaust: true,
        effects: [rd6("boy")],
      },
    ],
  },
  // Hexplosive Minefield.
  "rad-142-167": { ...plain, action: true, spell: [rd6("minefield")] },
  // Blade of the Exile.
  "rad-150-167": {
    ...plain,
    equipCost: 1,
    equipAnyPower: true,
    equipExhaustUnit: true,
    gearMight: 3,
    equipment: { text: "[Ganking]", keywords: ["Ganking"] },
  },
};

/** Heartening Soul: friendly legends gain an ability. */
export function radianceLegendAbilities(
  s: GameState,
  p: PlayerId,
): ActivatedAbility[] {
  return own(s, p).some((u) => has(s, u, 40))
    ? [
        {
          label: "Heartening Soul: give a unit +3 Might this turn",
          exhaust: true,
          effects: [{ type: "might", amount: 3, target: "anyUnit" }],
        },
      ]
    : [];
}

/** Detonation Amplifier: friendly Deathknells here trigger once more each. */
export function extraDeathknells(
  s: GameState,
  owner: PlayerId,
  location: LocationId | undefined,
) {
  if (!location?.startsWith("field:")) return 0;
  return deployedGear(s, location, owner).filter((g) =>
    isFace(g.cardId, "RAD", 17),
  ).length;
}

/** Ziggs: abilities of friendly gear deal 1 Bonus Damage per Ziggs. */
export function gearAbilityBonus(
  s: GameState,
  p: PlayerId,
  sourceCardId: string | undefined,
) {
  if (!sourceCardId || !isCardType(getCard(sourceCardId), "Gear")) return 0;
  return own(s, p).filter((u) => has(s, u, 23)).length;
}

/** Runeblade Anvil and Akali: banished cards the player may still play. */
export function banishedPlayable(s: GameState, p: PlayerId) {
  const grants = (s.radiance?.anvil ?? []).filter(
    (g) => g.player === p && s.turn <= g.until,
  );
  const left = new Map<string, number>();
  for (const g of grants) left.set(g.cardId, (left.get(g.cardId) ?? 0) + 1);
  const out: { id: string; index: number }[] = [];
  s.players[p].banished.forEach((id, index) => {
    const n = left.get(id) ?? 0;
    if (n > 0) {
      out.push({ id, index });
      left.set(id, n - 1);
    }
  });
  return out;
}
/** The banished card was played: its permission is used. */
export function useBanishedPermission(
  s: GameState,
  p: PlayerId,
  cardId: string,
) {
  const grants = s.radiance?.anvil ?? [];
  const i = grants.findIndex(
    (g) => g.player === p && g.cardId === cardId && s.turn <= g.until,
  );
  if (i >= 0) grants.splice(i, 1);
}

function banishTop(s: GameState, p: PlayerId, ctx: PreconContext) {
  const x = s.players[p];
  const top = x.deck.shift();
  if (!top) return;
  x.banished.push(top);
  ctx.cardEvent(s, "banish", p, top);
  ctx.log?.(
    s,
    `${x.name} banishes ${cardName(top)} and may play it until their next Ending Phase.`,
    "info",
    p,
  );
  ((s.radiance ??= {}).anvil ??= []).push({
    player: p,
    cardId: top,
    until: s.currentPlayer === p ? s.turn : s.turn + 1,
  });
}

function moveGear(
  s: GameState,
  p: PlayerId,
  gearId: string,
  to: LocationId,
  ctx: PreconContext,
) {
  const gear = s.gears.find((g) => g.id === gearId);
  if (!gear || gear.deployedAt === to) return;
  gear.deployedAt = to;
  ctx.log?.(s, `${cardName(gear.cardId)} moves to ${to}.`, "info", p);
  // The Ball: "When you play or move this, choose one".
  if (isFace(gear.cardId, "RAD", 146))
    ctx.trigger(s, gear.owner, gear.cardId, gear.id, [ballTrigger], to);
}

/** The battlefield's combat winner: the only player with units left there. */
function combatWinner(s: GameState, field: LocationId) {
  const sides = ([0, 1] as PlayerId[]).filter((p) =>
    s.units.some((u) => u.owner === p && u.location === field),
  );
  return sides.length === 1 ? sides[0] : undefined;
}

export const radianceWave6Module: ExpansionModule = {
  keywords(s, u) {
    // Graves: I don't deal combat damage.
    return has(s, u, 85) ? ["No combat damage"] : [];
  },
  cost(s, p, card) {
    let energy = 0,
      power = 0;
    // Orianna, Mechanical Marvel: once each turn, a gear costs 1 and 1 less.
    if (
      isCardType(card, "Gear") &&
      !usedThisTurn(s, "orianna-mm", p) &&
      own(s, p).some((u) => has(s, u, 68) && u.location.startsWith("field:"))
    ) {
      energy -= 1;
      power -= 1;
    }
    // Boy Who Shattered Time: the next unit this turn.
    if (
      isCardType(card, "Unit") &&
      s.radiance?.once?.[`boy-grant:${p}`] === s.turn
    ) {
      energy -= 2;
      power -= 1;
    }
    return { energy, power };
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    const card = cardId ? getCard(cardId) : undefined;
    // Tokens are played but are not cards (Core Rules: tokens aren't cards).
    const token =
      card?.supertype === "Token" ||
      Boolean(
        sourceId &&
        (s.units.find((u) => u.id === sourceId)?.token ||
          s.gears.find((g) => g.id === sourceId)?.token),
      );
    if (name === "play" && card && !token) {
      // Forbidden Technique: play me from your trash after a 7+ card.
      if ((card.energy ?? 0) >= 7)
        for (const t of trashCards(s, p).filter((t) =>
          isFace(t.cardId, "RAD", 10),
        ))
          ctx.trigger(s, p, t.cardId, t.id, [
            {
              type: "playCard",
              optional: true,
              triggerCost: { energy: 1, power: 2, domain: "Fury" },
              play: {
                zone: "trash",
                sourceRef: t.id,
                ignoreCost: true,
                banishAfter: true,
              },
            },
          ]);
      // Zero Point Inflection: when you play a card, draw 2.
      for (const g of plainGear(s, p).filter(
        (g) => isFace(g.cardId, "RAD", 69) && g.id !== sourceId,
      ))
        ctx.trigger(s, p, g.cardId, g.id, [{ type: "draw", amount: 2 }]);
      if (isCardType(card, "Gear") && !usedThisTurn(s, "orianna-mm", p)) {
        if (
          own(s, p).some(
            (u) => has(s, u, 68) && u.location.startsWith("field:"),
          )
        )
          useOncePerTurn(s, "orianna-mm", p);
      }
      if (
        isCardType(card, "Unit") &&
        s.radiance?.once?.[`boy-grant:${p}`] === s.turn
      ) {
        delete s.radiance.once[`boy-grant:${p}`];
        if (sourceId) (s.radiance.once ??= {})[`boy-kill:${sourceId}`] = s.turn;
      }
    }
    // Zero Point Inflection: drawing with 9+ other cards in hand.
    if (name === "draw") {
      const others = s.players[p].hand.length - (ctx.amount ?? 1);
      if (others >= 9)
        for (const g of plainGear(s, p).filter((g) =>
          isFace(g.cardId, "RAD", 69),
        ))
          ctx.trigger(s, p, g.cardId, g.id, [rd6("zero-point")]);
    }
    // Akali, Brash: her first and second moves each turn.
    if (name === "move" && sourceId) {
      const u = s.units.find((v) => v.id === sourceId);
      if (u && has(s, u, 15) && u.movesTurn === s.turn) {
        if (u.movesThisTurn === 1)
          ctx.trigger(s, u.owner, u.cardId, u.id, [rd6("akali-add")]);
        if (u.movesThisTurn === 2)
          ctx.trigger(s, u.owner, u.cardId, u.id, [rd6("banish-top")]);
      }
    }
    // Runeblade Anvil: when this leaves the board.
    if (
      (name === "death" || name === "bounce") &&
      sourceId &&
      card &&
      isFace(cardId, "RAD", 12) &&
      !isUnitObject(s, sourceId)
    )
      ctx.trigger(s, p, cardId, sourceId, [rd6("banish-top")]);
    if (name === "death" && sourceId && card) {
      const dying = s.units.find((u) => u.id === sourceId);
      // Storm Raptor: a stunned enemy unit dies here.
      if (dying?.stunned)
        for (const r of own(s, other(dying.owner)).filter(
          (r) => has(s, r, 36) && r.location === dying.location,
        ))
          ctx.trigger(s, r.owner, r.cardId, r.id, [
            { type: "draw", amount: 1 },
          ]);
      // Battlefield Armorer: a friendly gear at a battlefield dies.
      const gear = s.gears.find((g) => g.id === sourceId);
      const where =
        gear?.deployedAt ??
        s.units.find((u) => u.id === gear?.attachedTo)?.location;
      if (gear && !dying && !gear.token && where?.startsWith("field:"))
        for (const a of own(s, gear.owner).filter((a) => has(s, a, 130)))
          ctx.trigger(s, gear.owner, a.cardId, a.id, [
            rd6("armorer", {
              optional: true,
              triggerCost: { energy: 1 },
              cardName: gear.cardId,
            }),
          ]);
    }
    // Riven, Broken Blade / Riven, Deserter / Resplendent Rostrum.
    if (name === "exhausted" && sourceId) {
      const u = s.units.find((v) => v.id === sourceId);
      if (u && has(s, u, 43))
        ctx.trigger(s, p, u.cardId, u.id, [rd6("riven-modes")], u.location);
      if (u)
        for (const r of own(s, u.owner).filter(
          (r) => r.id !== u.id && has(s, r, 114),
        ))
          ctx.trigger(
            s,
            r.owner,
            r.cardId,
            r.id,
            [rd6("self-might", { amount: 1 })],
            r.location,
          );
      const g = s.gears.find((g) => g.id === sourceId);
      if (!u && g && isFace(g.cardId, "RAD", 46))
        ctx.trigger(s, g.owner, g.cardId, g.id, [
          { type: "might", amount: 3, target: "friendlyUnit" },
        ]);
    }
    // Ahri, Confident: you reduce an enemy unit's Might at her battlefield.
    if (name === "mightReduced" && locationId)
      for (const a of own(s, p).filter(
        (a) => has(s, a, 38) && a.location === locationId,
      ))
        ctx.trigger(
          s,
          p,
          a.cardId,
          a.id,
          [rd6("self-might", { amount: 1 })],
          a.location,
        );
    // Blossoming Dreamroot: when you win a combat here, draw 1.
    if (name === "combatEnd" && locationId) {
      const winner = combatWinner(s, locationId);
      if (winner !== undefined)
        for (const g of deployedGear(s, locationId, winner).filter((g) =>
          isFace(g.cardId, "RAD", 24),
        ))
          ctx.trigger(
            s,
            winner,
            g.cardId,
            g.id,
            [{ type: "draw", amount: 1 }],
            locationId,
          );
    }
    if (name === "end") {
      // Hexplosive Minefield: play the owed Bombs to a single battlefield.
      const owed = (s.radiance?.delayedBombs ?? []).filter(
        (d) => d.player === p && d.turn === s.turn,
      );
      if (s.radiance?.delayedBombs)
        s.radiance.delayedBombs = s.radiance.delayedBombs.filter(
          (d) => !owed.includes(d),
        );
      for (const d of owed)
        if (d.count > 0)
          ctx.trigger(s, p, "rad-142-167", "legend", [
            { ...bomb, amount: d.count, condition: "singleLocation" },
          ]);
      // Boy Who Shattered Time: "Kill me at end of turn."
      for (const u of s.units.filter(
        (u) => s.radiance?.once?.[`boy-kill:${u.id}`] === s.turn,
      ))
        ctx.trigger(s, u.owner, u.cardId, u.id, [rd6("kill-unit-self")]);
      // Expired Anvil permissions.
      if (s.radiance?.anvil)
        s.radiance.anvil = s.radiance.anvil.filter(
          (g) => !(g.player === p && g.until <= s.turn),
        );
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("radiance6:")) return false;
    const self = s.units.find((u) => u.id === ctx.sourceId);
    const target = s.units.find((u) => u.id === ctx.targetId);
    const x = s.players[p];
    switch (e.custom.slice("radiance6:".length)) {
      case "anvil":
      case "banish-top":
        banishTop(s, p, ctx);
        return true;
      case "kill-self":
        if (s.gears.some((g) => g.id === ctx.sourceId))
          ctx.killGear(s, ctx.sourceId!);
        return true;
      case "kill-unit-self":
        if (self) ctx.killUnits(s, [self.id]);
        return true;
      case "akali-add":
        x.energy += 1;
        x.power = (x.power ?? 0) + 1;
        ctx.log?.(s, `${x.name} adds 1 Energy and 1 Power.`, "info", p);
        return true;
      case "amplifier": {
        const units = own(s, p);
        const gears = plainGear(s, p).filter((g) => g.id !== ctx.sourceId);
        if (units.length + gears.length)
          choices(s, p, ctx, [
            ...units.map((u) =>
              option(p, `amp:${u.id}`, `Kill ${cardName(u.cardId)}: draw 1`, [
                rd6("kill-draw", { cardName: u.id }),
              ]),
            ),
            ...gears.map((g) =>
              option(p, `amp:${g.id}`, `Kill ${cardName(g.cardId)}: draw 1`, [
                rd6("kill-draw", { cardName: g.id }),
              ]),
            ),
            option(p, "amp:none", "Do not kill anything", []),
          ]);
        return true;
      }
      case "kill-draw": {
        const id = e.cardName!;
        if (isUnitObject(s, id)) ctx.killUnits(s, [id]);
        else if (s.gears.some((g) => g.id === id)) ctx.killGear(s, id);
        else return true;
        ctx.draw(s, p, 1);
        return true;
      }
      case "ekko-blink":
        if (self)
          ctx.runEffects(
            s,
            p,
            [
              {
                type: "playCard",
                play: { zone: "blink", destination: "base", ignoreCost: true },
              },
            ],
            self.id,
            self.id,
          );
        return true;
      case "twirl-gear": {
        const gears = plainGear(s, p).filter((g) => g.id !== ctx.sourceId);
        if (gears.length)
          choices(
            s,
            p,
            ctx,
            gears.map((g) =>
              option(
                p,
                `twirl:${g.id}`,
                `Kill ${cardName(g.cardId)}: play a Recruit`,
                [
                  rd6("kill-token", {
                    cardName: g.id,
                    keyword: "Recruit",
                  }),
                ],
              ),
            ),
          );
        return true;
      }
      case "twirl-unit": {
        const units = own(s, p);
        if (units.length)
          choices(
            s,
            p,
            ctx,
            units.map((u) =>
              option(
                p,
                `twirl:${u.id}`,
                `Kill ${cardName(u.cardId)}: play a Mech`,
                [rd6("kill-token", { cardName: u.id, keyword: "Mech" })],
              ),
            ),
          );
        return true;
      }
      case "kill-token": {
        const id = e.cardName!;
        if (isUnitObject(s, id)) ctx.killUnits(s, [id]);
        else if (s.gears.some((g) => g.id === id)) ctx.killGear(s, id);
        else return true;
        ctx.spawnToken(s, p, e.keyword ?? "Recruit", `base:${p}`, false);
        return true;
      }
      case "command-move": {
        const gears = plainGear(s, p).filter(
          (g) => hasDeploy(g.cardId) && g.deployedAt,
        );
        const opts = gears.flatMap((g) =>
          s.fields
            .filter((f) => f.id !== g.deployedAt)
            .map((f) =>
              option(
                p,
                `command:${g.id}:${f.id}`,
                `Move ${cardName(g.cardId)} to ${cardName(f.cardId)}`,
                [rd6("move-gear", { cardName: g.id, keyword: f.id })],
              ),
            ),
        );
        if (opts.length) choices(s, p, ctx, opts);
        return true;
      }
      case "move-gear":
        moveGear(s, p, e.cardName!, e.keyword as LocationId, ctx);
        return true;
      case "command-look": {
        const top = x.deck.slice(0, 5);
        choices(s, p, ctx, [
          ...top.flatMap((id, i) =>
            isCardType(getCard(id), "Gear")
              ? [
                  option(p, `look:${i}`, `Reveal and draw ${cardName(id)}`, [
                    rd6("look-take", {
                      amount: i,
                      cardName: String(top.length),
                    }),
                  ]),
                ]
              : [],
          ),
          option(p, "look:none", "Recycle all", [
            rd6("look-take", { amount: -1, cardName: String(top.length) }),
          ]),
        ]);
        return true;
      }
      case "look-take": {
        const top = x.deck.splice(0, Number(e.cardName ?? 0));
        const i = e.amount ?? -1;
        if (i >= 0 && top[i]) {
          x.hand.push(top[i]);
          ctx.cardEvent(s, "reveal", p, top[i]);
          ctx.cardEvent(s, "draw", p, top[i]);
        }
        x.deck.push(...top.filter((_, j) => j !== i));
        return true;
      }
      case "ready-legend":
        if (x.legendUsedTurn >= 0) {
          x.legendUsedTurn = -1;
          ctx.log?.(s, `${x.name} readies their legend.`, "info", p);
        }
        return true;
      case "riven-modes": {
        if (!self) return true;
        const key = (mode: string) => `riven:${self.id}:${mode}`;
        const free = (mode: string) => s.radiance?.once?.[key(mode)] !== s.turn;
        const enemies = s.units.filter(
          (u) => u.owner !== p && (ctx.canTargetUnit?.(s, p, u) ?? true),
        );
        const opts = [
          ...(free("buff")
            ? [option(p, "riven:buff", "Buff Riven", [rd6("riven-buff")])]
            : []),
          ...(free("stun") && self.buff
            ? enemies.map((u) => ({
                ...option(
                  p,
                  `riven:stun:${u.id}`,
                  `Spend her buff to stun ${cardName(u.cardId)}`,
                  [rd6("riven-stun")],
                ),
                targetId: u.id,
              }))
            : []),
          ...(free("ready") && self.buff
            ? [
                option(p, "riven:ready", "Spend her buff to ready her", [
                  rd6("riven-ready"),
                ]),
              ]
            : []),
        ];
        if (opts.length) choices(s, p, ctx, opts);
        return true;
      }
      case "riven-buff":
      case "riven-stun":
      case "riven-ready": {
        const unit = s.units.find((u) => u.id === ctx.sourceId);
        if (!unit) return true;
        const mode = e.custom.slice("radiance6:riven-".length);
        ((s.radiance ??= {}).once ??= {})[`riven:${unit.id}:${mode}`] = s.turn;
        if (mode === "buff") {
          ctx.runEffects(
            s,
            p,
            [{ type: "buff", target: "anyUnit" }],
            unit.id,
            unit.id,
          );
          return true;
        }
        if (!unit.buff) return true;
        unit.buff--;
        ctx.cardEvent(s, "spendBuff", p, unit.cardId, unit.id, unit.location);
        if (mode === "ready")
          ctx.runEffects(s, p, [{ type: "ready" }], unit.id, unit.id);
        else if (target)
          ctx.runEffects(
            s,
            p,
            [{ type: "stun", target: "anyUnit" }],
            target.id,
          );
        return true;
      }
      case "self-might":
        if (self) self.temporaryMight += e.amount ?? 1;
        return true;
      case "ksante": {
        if (!self) return true;
        const units = own(s, p).filter(
          (u) => u.location === self.location && shieldValue(s, u) > 0,
        );
        if (units.length)
          choices(
            s,
            p,
            ctx,
            units.map((u) =>
              option(
                p,
                `ksante:${u.id}`,
                `Double ${cardName(u.cardId)}'s Shield this turn`,
                [rd6("double-shield", { cardName: u.id })],
              ),
            ),
          );
        return true;
      }
      case "double-shield": {
        const unit = s.units.find((u) => u.id === e.cardName);
        const value = unit ? shieldValue(s, unit) : 0;
        if (unit && value)
          (unit.temporaryKeywords ??= []).push(`Shield ${value}`);
        return true;
      }
      case "channel-exhausted":
        ctx.channel(s, p, 1, false);
        return true;
      case "projectile": {
        if (!target) return true;
        const gears = plainGear(s, p);
        const costs = [
          ...new Set(gears.map((g) => getCard(g.cardId).energy ?? 0)),
        ].sort((a, b) => b - a);
        if (!costs.length) return true;
        choices(
          s,
          p,
          ctx,
          costs.map((n) => {
            const g = gears.find((g) => (getCard(g.cardId).energy ?? 0) === n)!;
            return option(
              p,
              `projectile:${g.id}`,
              `Choose ${cardName(g.cardId)}: deal ${n}`,
              [rd6("deal", { amount: n, cardName: target.id })],
            );
          }),
        );
        return true;
      }
      case "deal": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (unit && (e.amount ?? 0) > 0)
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount: e.amount }],
            unit.id,
            ctx.sourceId,
          );
        return true;
      }
      case "scope": {
        const opponent = other(p);
        choices(
          s,
          opponent,
          ctx,
          ["Unit", "Gear", "Spell"].map((type) =>
            option(opponent, `scope:${type}`, `Guess ${type}`, [
              rd6("scope-guess", { keyword: type, amount: p }),
            ]),
          ),
        );
        return true;
      }
      case "scope-guess": {
        const owner = (e.amount ?? 0) as PlayerId;
        const deck = s.players[owner].deck;
        const top = deck[0];
        if (!top) return true;
        ctx.cardEvent(s, "reveal", owner, top);
        const match = isCardType(getCard(top), e.keyword ?? "");
        ctx.log?.(
          s,
          `${s.players[owner].name} reveals ${cardName(top)}${match ? " and recycles it" : " and draws it"}.`,
          "info",
          owner,
        );
        if (match) deck.push(deck.shift()!);
        else ctx.draw(s, owner, 1);
        return true;
      }
      case "zero-point": {
        const gear = s.gears.find((g) => g.id === ctx.sourceId);
        if (!gear) return true;
        ctx.discardCards(s, p, x.hand.splice(0));
        ctx.killGear(s, gear.id);
        ctx.runEffects(s, other(p), [{ type: "score", amount: 1 }]);
        return true;
      }
      case "graves": {
        if (!self) return true;
        const amount = ctx.getMight(s, self);
        for (const u of s.units.filter(
          (u) => u.owner !== p && u.location === self.location,
        ))
          ctx.runEffects(
            s,
            p,
            [{ type: "damage", amount, damageSource: "unit" }],
            u.id,
            self.id,
          );
        return true;
      }
      case "bandit": {
        const tops = ([0, 1] as PlayerId[]).map((q) => s.players[q].deck[0]);
        const costs = tops
          .filter(Boolean)
          .map((id) => getCard(id!).energy ?? 0);
        if (!costs.length) return true;
        const lowest = Math.min(...costs);
        for (const q of [0, 1] as PlayerId[]) {
          const id = tops[q];
          if (!id) continue;
          ctx.cardEvent(s, "reveal", q, id);
        }
        ctx.log?.(
          s,
          `Mechanical Bandit reveals ${tops
            .filter(Boolean)
            .map((id) => cardName(id!))
            .join(" and ")}.`,
          "info",
          p,
        );
        for (const q of [0, 1] as PlayerId[]) {
          const id = tops[q];
          if (!id) continue;
          if (q === p && (getCard(id).energy ?? 0) === lowest)
            ctx.draw(s, q, 1);
          else s.players[q].deck.push(s.players[q].deck.shift()!);
        }
        return true;
      }
      case "angler": {
        if (!self?.location.startsWith("field:")) return true;
        const opponent = other(p);
        const units = own(s, opponent).filter(
          (u) => u.location !== self.location,
        );
        if (units.length)
          choices(
            s,
            opponent,
            ctx,
            units.map((u) =>
              option(
                opponent,
                `angler:${u.id}`,
                `Move ${cardName(u.cardId)} to Angler Wyrm's battlefield`,
                [
                  rd6("move-own", {
                    cardName: u.id,
                    keyword: self.location,
                  }),
                ],
              ),
            ),
          );
        return true;
      }
      case "move-own": {
        const unit = s.units.find((u) => u.id === e.cardName);
        if (unit) ctx.moveUnit(s, unit, e.keyword as LocationId, unit.owner);
        return true;
      }
      case "deserter": {
        const ready = own(s, p).filter((u) => u.ready);
        if (!ready.length || !target) return true;
        choices(
          s,
          p,
          ctx,
          ready.map((u) =>
            option(
              p,
              `deserter:${u.id}`,
              `Exhaust ${cardName(u.cardId)}, then ready ${cardName(target.cardId)}`,
              [rd6("exhaust-ready", { cardName: u.id, keyword: target.id })],
            ),
          ),
        );
        return true;
      }
      case "exhaust-ready": {
        const cost = s.units.find((u) => u.id === e.cardName);
        if (!cost?.ready) return true;
        cost.ready = false;
        ctx.runEffects(s, p, [{ type: "ready" }], e.keyword);
        return true;
      }
      case "transpose": {
        if (!target || target.owner !== p) return true;
        const might = ctx.getMight(s, target);
        ctx.runEffects(s, p, [{ type: "bounce" }], target.id);
        ctx.runEffects(s, p, [
          {
            type: "playCard",
            play: {
              zone: "hand",
              optional: true,
              ignoreCost: true,
              cardTypes: ["Unit"],
              maxMight: might - 1,
            },
          },
        ]);
        return true;
      }
      case "armorer": {
        const owner = p;
        const entry = trashCards(s, owner)
          .filter((t) => t.cardId === e.cardName)
          .at(-1);
        if (!entry) return true;
        takeTrash(s, owner, entry.id);
        s.players[owner].hand.push(entry.cardId);
        ctx.log?.(
          s,
          `${s.players[owner].name} returns ${cardName(entry.cardId)} to hand.`,
          "info",
          owner,
        );
        return true;
      }
      case "boy":
        ((s.radiance ??= {}).once ??= {})[`boy-grant:${p}`] = s.turn;
        return true;
      case "minefield": {
        const killed = e.amount ?? 0;
        const bombs = plainGear(s, p).filter((g) => g.cardId === "token-bomb");
        choices(s, p, ctx, [
          ...bombs.map((g) =>
            option(
              p,
              `minefield:${g.id}`,
              `Kill the Bomb at ${g.deployedAt ? cardName(s.fields.find((f) => f.id === g.deployedAt)?.cardId ?? "") : "base"}`,
              [rd6("minefield-kill", { cardName: g.id, amount: killed })],
            ),
          ),
          option(
            p,
            "minefield:done",
            killed
              ? `Done: ${killed} Bomb${killed === 1 ? "" : "s"} at end of turn`
              : "Kill no Bombs",
            [rd6("minefield-done", { amount: killed })],
          ),
        ]);
        return true;
      }
      case "minefield-kill": {
        const alive = s.gears.some((g) => g.id === e.cardName);
        if (alive) ctx.killGear(s, e.cardName!);
        ctx.runEffects(
          s,
          p,
          [rd6("minefield", { amount: (e.amount ?? 0) + (alive ? 1 : 0) })],
          undefined,
          ctx.sourceId,
        );
        return true;
      }
      case "minefield-done":
        if (e.amount)
          ((s.radiance ??= {}).delayedBombs ??= []).push({
            player: p,
            turn: s.turn,
            count: e.amount,
          });
        return true;
    }
    return false;
  },
};

export const reviewedRadianceWave6Printings: readonly string[] =
  Object.keys(radianceWave6Scripts).sort();
