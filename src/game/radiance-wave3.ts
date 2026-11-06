import { getCard, isCardType } from "../data/cards";
import { isFace } from "./board-rules";
import { choices, option } from "./card-wave16";
import type { ExpansionModule } from "./later-precon-engine";
import { detach, physicalCard, physicalOwner } from "./objects";
import { useOncePerTurn } from "./radiance-rules";
import { textSources } from "./text-sources";
import type { CardScript, Effect, GameState, PlayerId, Unit } from "./types";
import { findLegend } from "./legends";

/**
 * Radiance wave 3: the Evelynn Showdown list and other face-down cards.
 * Sources: card text (Hextech, official gallery), Radiance errata and FAQ.
 */
const plain: CardScript = { implemented: true };
const rd = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `radiance3:${custom}`,
  ...extra,
});
const disarm: Effect = { type: "might", amount: -1, target: "enemyUnitHere" };
const gold: Effect = { type: "token", cardName: "Gold", location: "base" };

export const radianceWave3Scripts: Record<string, CardScript> = {
  // Elnuk Herd: +3 to a friendly unit; recycle me if played from face down.
  "rad-081-167": {
    ...plain,
    hidden: true,
    onPlay: [
      { type: "might", amount: 3, target: "friendlyUnit" },
      rd("recycle-if-hidden"),
    ],
  },
  // Evelynn, Consuming: [Ambush]; face-down plays ready her and give +1.
  "rad-090-167": { ...plain, ambush: true, keywords: ["Ambush"] },
  // Momentary Companion: gains [Temporary] if played on an opponent's turn.
  "rad-095-167": { ...plain, hidden: true, onPlay: [rd("companion")] },
  // Siren's Song: move an enemy unit that moved this turn.
  "rad-098-167": {
    ...plain,
    reaction: true,
    spell: [
      {
        type: "moveTarget",
        target: "enemyUnit",
        condition: "chooseDestination",
        movedThisTurn: true,
      },
    ],
  },
  // The Waters' Wage: one exhausted Gold, or three ready Gold from face down on your turn.
  "rad-100-167": { ...plain, hidden: true, spell: [rd("waters-wage")] },
  // Demon Shade: move a friendly unit to an open battlefield, or Ganking if none.
  "rad-102-167": {
    ...plain,
    hidden: true,
    spellModes: [
      {
        label: "Move it to an open battlefield",
        effects: [rd("shade-move", { target: "friendlyUnit" })],
      },
      {
        label: "Give it [Ganking] this turn if there are no open battlefields",
        effects: [rd("shade-ganking", { target: "friendlyUnit" })],
      },
    ],
  },
  // Gutter Guardian: [Hidden]; [Show Off] a card with [Hidden] to add 1 Power.
  "rad-103-167": {
    ...plain,
    hidden: true,
    showOff: { kind: "hidden" },
    onPlay: [rd("guardian-add")],
  },
  // Reckless Innovator: [Accelerate]; when exhausted, Gold or pay Chaos to draw.
  "rad-105-167": { ...plain, accelerating: true },
  // Evelynn, In Control: [Disarm]; on hold, score 1 with a facedown card here.
  "rad-109-167": {
    ...plain,
    keywords: ["Disarm"],
    onAttack: [disarm],
    onHold: [rd("evelynn-hold")],
  },
  // Hold 'Em: [Action]; costs 2 less after you play a unit or gear to a battlefield.
  "rad-070-167": {
    ...plain,
    action: true,
    spell: [{ type: "might", amount: 3, target: "anyUnit" }],
  },
  // Agony's Embrace: once each turn, draw on a face-down play (discard off-turn).
  "rad-153-167": plain,
  // Last Caress: the next unit you play this turn may go to any battlefield and is buffed.
  "rad-154-167": { ...plain, reaction: true, spell: [rd("last-caress")] },
  // Bandle Scouts' Academy: hiding a card here makes an exhausted Gold.
  "rad-157-167": plain,
  // Rakelstake: the first unit or gear each player plays here each turn: [Predict].
  "rad-165-167": plain,
};

type State = GameState & { radianceFieldPlays?: Record<string, number> };

function recycleUnit(s: GameState, unit: Unit) {
  for (const gearId of unit.gear) {
    const gear = s.gears.find((g) => g.id === gearId);
    if (gear) detach(s, gear);
  }
  s.units = s.units.filter((u) => u.id !== unit.id);
  s.gears = s.gears.filter((g) => g.id !== unit.id);
  if (!unit.token) s.players[physicalOwner(unit)].deck.push(physicalCard(unit));
}
const openFields = (s: GameState) =>
  s.fields.filter(
    (f) => f.controller === null && !s.units.some((u) => u.location === f.id),
  );
const own = (s: GameState, p: PlayerId) => s.units.filter((u) => u.owner === p);

export const radianceWave3Module: ExpansionModule = {
  cost(s, p, card) {
    // Hold 'Em costs 2 less after a unit or gear was played to a battlefield.
    if (
      isFace(card.id, "RAD", 70) &&
      (s as State).radianceFieldPlays?.[String(p)] === s.turn
    )
      return { energy: -2 };
    return {};
  },
  event(s, name, p, cardId, sourceId, locationId, ctx) {
    if (name === "play") {
      const card = getCard(cardId);
      const permanent = isCardType(card, "Unit") || isCardType(card, "Gear");
      if (permanent && locationId?.startsWith("field:")) {
        ((s as State).radianceFieldPlays ??= {})[String(p)] = s.turn;
        const field = s.fields.find((f) => f.id === locationId);
        if (
          field &&
          isFace(field.cardId, "RAD", 165) &&
          useOncePerTurn(s, `rakelstake:${field.id}`, p)
        )
          ctx.trigger(
            s,
            p,
            field.cardId,
            field.id,
            [{ type: "predict" }],
            field.id,
          );
      }
      // Last Caress: the first unit played after it is buffed.
      if (isCardType(card, "Unit") && sourceId) {
        const grants = (s.radiance?.lastCaress ?? []).filter(
          (g) => g.player === p && g.turn === s.turn,
        );
        if (grants.length) {
          s.radiance!.lastCaress = s.radiance!.lastCaress!.filter(
            (g) => g.player !== p,
          );
          for (const _ of grants)
            ctx.trigger(
              s,
              p,
              "rad-154-167",
              sourceId,
              [{ type: "buff", condition: "self" }],
              locationId,
            );
        }
      }
      if (ctx.fromHidden) {
        // Evelynn, Consuming: ready me and give me +1 Might this turn.
        for (const u of own(s, p).filter((u) =>
          textSources(s, u).some((t) => isFace(t.cardId, "RAD", 90)),
        ))
          ctx.trigger(
            s,
            p,
            u.cardId,
            u.id,
            [
              { type: "ready", condition: "self" },
              { type: "might", amount: 1, condition: "self" },
            ],
            u.location,
          );
        // Agony's Embrace (legend): once each turn.
        const agony = findLegend(s, p, (id) => isFace(id, "RAD", 153));
        if (agony && useOncePerTurn(s, "agony", p))
          ctx.trigger(
            s,
            p,
            agony.cardId,
            agony.key,
            [{ type: "draw", amount: 1 }, rd("agony-discard")],
            `base:${p}`,
          );
      }
    }
    // Bandle Scouts' Academy: when you hide a card here.
    if (name === "hide" && locationId) {
      const field = s.fields.find((f) => f.id === locationId);
      if (field && isFace(field.cardId, "RAD", 157))
        ctx.trigger(s, p, field.cardId, field.id, [gold], field.id);
    }
    // Reckless Innovator: when I become exhausted, choose one.
    if (name === "exhausted" && sourceId) {
      const unit = s.units.find((u) => u.id === sourceId);
      if (
        unit &&
        textSources(s, unit).some((t) => isFace(t.cardId, "RAD", 105))
      )
        ctx.trigger(
          s,
          p,
          unit.cardId,
          unit.id,
          [
            {
              type: "special",
              custom: "radiance3:modal",
              modes: [
                { label: "Play a Gold gear token exhausted", effects: [gold] },
                {
                  label: "Pay Chaos Power to draw 1",
                  effects: [rd("innovator-draw")],
                },
              ],
            },
          ],
          unit.location,
        );
    }
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("radiance3:")) return false;
    const here = ctx.locationId;
    const self = s.units.find((u) => u.id === ctx.sourceId);
    const target = s.units.find((u) => u.id === ctx.targetId);
    switch (e.custom.slice("radiance3:".length)) {
      case "modal":
        return true;
      case "recycle-if-hidden":
        if (e.fromHidden && self) recycleUnit(s, self);
        return true;
      case "companion":
        if (s.currentPlayer !== p && self) self.temporary = true;
        return true;
      case "waters-wage":
        if (e.fromHidden && s.currentPlayer === p)
          for (let i = 0; i < 3; i++)
            ctx.spawnToken(s, p, "Gold", `base:${p}`, true);
        else ctx.spawnToken(s, p, "Gold", `base:${p}`, false);
        return true;
      case "shade-move": {
        const fields = openFields(s);
        if (!target || target.owner !== p || !fields.length) return true;
        if (fields.length === 1) ctx.moveUnit(s, target, fields[0].id, p);
        else
          choices(
            s,
            p,
            ctx,
            fields.map((f) =>
              option(p, `shade:${f.id}`, `Move to ${getCard(f.cardId).name}`, [
                rd("shade-to", { cardName: f.id }),
              ]),
            ),
          );
        return true;
      }
      case "shade-to":
        if (
          target &&
          openFields(s).some((f) => f.id === e.cardName) &&
          target.owner === p
        )
          ctx.moveUnit(s, target, e.cardName as Unit["location"], p);
        return true;
      case "shade-ganking":
        if (target && !openFields(s).length)
          (target.temporaryKeywords ??= []).push("Ganking");
        return true;
      case "guardian-add":
        if (e.shown) s.players[p].power = (s.players[p].power ?? 0) + 1;
        return true;
      case "evelynn-hold":
        if ((s.hidden ?? []).some((h) => h.owner === p && h.location === here))
          ctx.runEffects(s, p, [{ type: "score", amount: 1 }]);
        return true;
      case "agony-discard":
        if (s.currentPlayer !== p)
          ctx.runEffects(s, p, [{ type: "discard", amount: 1 }]);
        return true;
      case "last-caress":
        ((s.radiance ??= {}).lastCaress ??= []).push({
          player: p,
          turn: s.turn,
        });
        return true;
      case "innovator-draw":
        if (ctx.canPay(s, p, 0, 1, ["Chaos"])) {
          ctx.pay(s, p, 0, 1, ["Chaos"]);
          ctx.draw(s, p, 1);
        }
        return true;
    }
    return false;
  },
};

export const reviewedRadianceWave3Printings: readonly string[] =
  Object.keys(radianceWave3Scripts).sort();
