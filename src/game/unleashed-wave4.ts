import { getCard } from "../data/cards";
import { getKeywords } from "./engine";
import type { ExpansionModule, PreconContext } from "./later-precon-engine";
import type {
  CardScript,
  Effect,
  GameAction,
  GameState,
  LocationId,
  PlayerId,
  Unit,
} from "./types";
const id = (n: number) => `unl-${String(n).padStart(3, "0")}-219`;
const plain: CardScript = { implemented: true };
const fx = (custom: string, extra: Partial<Effect> = {}): Effect => ({
  type: "special",
  custom: `unl-wave4:${custom}`,
  ...extra,
});
const opponent = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const hunt: Effect[] = [fx("xp", { amount: 2 })];
export const unleashedWave4Scripts: Record<string, CardScript> = {
  [id(25)]: {
    ...plain,
    flow: {
      energy: 3,
      power: 1,
      domain: "Fury",
      condition: "legion",
      banishAfter: false,
    },
  },
  [id(53)]: { ...plain, onPlay: [{ type: "draw" }], onDeath: [fx("scuttle")] },
  [id(72)]: {
    ...plain,
    action: true,
    spell: [fx("crescent", { target: "enemyUnitAndBattlefield" })],
  },
  [id(90)]: { ...plain, keywords: ["Backline", "Suppress friendly Temporary"] },
  [id(117)]: {
    ...plain,
    keywords: [
      "Hunt 2",
      "Play against lone enemy",
      "Friendly units play against lone enemy",
    ],
    onConquer: hunt,
    onHold: hunt,
  },
  [id(122)]: {
    ...plain,
    additionalCost: {
      power: 1,
      domain: "Chaos",
      condition: "playedSpell",
      enterReady: true,
    },
  },
  [id(135)]: { ...plain, onPlay: [fx("investigator")] },
  [id(144)]: { ...plain, keywords: ["Cannot ready"] },
  [id(155)]: {
    ...plain,
    action: true,
    spell: [fx("heroic", { target: "friendlyAndEnemyHere" })],
  },
  [id(164)]: { ...plain, additionalCost: { xp: 3 }, onPlay: [fx("inspector")] },
  [id(178)]: {
    ...plain,
    ambush: true,
    keywords: ["Tank"],
    additionalCost: { xp: 3, energyReduction: 3 },
  },
  [id(197)]: {
    ...plain,
    abilities: [
      {
        label: "Add 1 Energy for showdowns",
        exhaust: true,
        timing: "reaction",
        effects: [{ type: "energy", amount: 1, condition: "showdownsOnly" }],
      },
    ],
  },
};
for (const [printing, original] of [
  ["unl-090a-219", 90],
  ["unl-178a-219", 178],
  ["unl-234-219", 197],
  ["unl-234*-219", 197],
] as const)
  unleashedWave4Scripts[printing] = unleashedWave4Scripts[id(original)];
function choose(
  s: GameState,
  p: PlayerId,
  ctx: PreconContext,
  options: { label: string; effects: Effect[] }[],
) {
  if (!options.length) return;
  ctx.openChoice(s, p, {
    sourceId: ctx.sourceId,
    locationId: ctx.locationId,
    options: options.map((o, i) => ({
      ...o,
      id: `choose-custom:unl-wave4:${i}`,
      player: p,
      category: "ability",
    })),
  });
}
function legalEnemy(s: GameState, u: Unit, p: PlayerId) {
  return (
    u.owner !== p &&
    !u.untargetableByEnemy &&
    !getKeywords(s, u).includes("Untargetable")
  );
}
function gateDestination(
  s: GameState,
  source: Unit,
  location: LocationId,
  ctx: PreconContext,
) {
  const enemies = s.units.filter(
    (u) => u.owner !== source.owner && u.location === location,
  );
  return (
    source.location !== location &&
    location.startsWith("field:") &&
    s.fields.find((f) => f.id === location)?.controller ===
      opponent(source.owner) &&
    enemies.length > 0 &&
    ctx.getMight(s, source) >
      enemies.reduce((sum, u) => sum + ctx.getMight(s, u), 0)
  );
}
export const unleashedWave4Module: ExpansionModule = {
  actions(s, p, ctx) {
    if (
      s.pendingChoice ||
      s.stack.length ||
      s.phase !== "main" ||
      s.currentPlayer !== p ||
      s.priorityPlayer !== p
    )
      return [];
    if (!ctx.canPay(s, p, 0, 1, ["Chaos"])) return [];
    return s.units
      .filter((u) => u.owner === p && u.cardId === id(144))
      .flatMap((source) =>
        s.fields
          .filter((f) => gateDestination(s, source, f.id, ctx))
          .map((f): GameAction => ({
            id: `unl-wave4:gate:${source.id}:${f.id}`,
            label: "Move Maduli to the enemy battlefield",
            category: "ability",
            player: p,
            sourceId: source.id,
            cardId: source.cardId,
            targetId: f.id,
            locationId: f.id,
            effects: [fx("gate", { target: "battlefield" })],
          })),
      );
  },
  apply(s, action, ctx) {
    if (!action.id.startsWith("unl-wave4:gate:")) return false;
    ctx.pay(s, action.player, 0, 1, ["Chaos"]);
    ctx.pushStack(s, {
      kind: "ability",
      player: action.player,
      cardId: action.cardId!,
      sourceId: action.sourceId,
      targetId: action.targetId,
      locationId: action.locationId,
      effects: action.effects!,
    });
    return true;
  },
  effect(s, p, e, ctx) {
    if (!e.custom?.startsWith("unl-wave4:")) return false;
    switch (e.custom.slice(10)) {
      case "xp":
        s.players[p].xp = (s.players[p].xp ?? 0) + (e.amount ?? 1);
        break;
      case "scuttle":
        ctx.log?.(
          s,
          `${s.players[opponent(p)].name} reveals: ${s.players[opponent(p)].hand.map((c) => getCard(c).name).join(", ") || "empty hand"}.`,
          "info",
          p,
        );
        s.players[p].canLookAtEnemyHiddenTurn = s.turn;
        s.players[p].xp = (s.players[p].xp ?? 0) + 1;
        break;
      case "crescent": {
        const [field, targetId] = (ctx.targetId ?? "").split("~");
        const target = s.units.find((u) => u.id === targetId);
        const effects: Effect[] =
          target && target.location === field && legalEnemy(s, target, p)
            ? [
                {
                  type: "damage",
                  target: "enemyUnit",
                  amount: 4,
                  chosenTargetId: target.id,
                },
              ]
            : [];
        for (const u of s.units.filter(
          (u) => u.owner !== p && u.location === field && u.id !== targetId,
        ))
          effects.push({ type: "damage", amount: 1, chosenTargetId: u.id });
        ctx.runEffects(s, p, effects, undefined, ctx.sourceId, ctx.locationId);
        break;
      }
      case "heroic": {
        const [first, second] = (ctx.targetId ?? "")
          .split("~")
          .map((uid) => s.units.find((u) => u.id === uid));
        if (first?.owner === p) {
          first.temporaryMight++;
          if (
            second &&
            legalEnemy(s, second, p) &&
            second.location === first.location
          ) {
            second.stunned = true;
            ctx.cardEvent(
              s,
              "stun",
              p,
              second.cardId,
              second.id,
              second.location,
            );
          }
        }
        break;
      }
      case "investigator": {
        const hand = s.players[opponent(p)].hand;
        ctx.log?.(
          s,
          `${s.players[opponent(p)].name} reveals: ${hand.map((c) => getCard(c).name).join(", ") || "empty hand"}.`,
          "info",
          p,
        );
        const options =
          (s.players[p].xp ?? 0) >= 2
            ? hand.map((cardId, index) => ({
                label: `Pay 2 XP: discard ${getCard(cardId).name}`,
                effects: [
                  fx("investigate-card", { amount: index, cardName: cardId }),
                ],
              }))
            : [];
        choose(s, p, ctx, [
          ...options,
          { label: "Decline paying XP", effects: [] },
        ]);
        break;
      }
      case "investigate-card": {
        const victim = opponent(p),
          index = e.amount!;
        if (
          (s.players[p].xp ?? 0) >= 2 &&
          s.players[victim].hand[index] === e.cardName
        ) {
          s.players[p].xp = (s.players[p].xp ?? 0) - 2;
          const card = s.players[victim].hand.splice(index, 1)[0];
          ctx.discardCards(s, victim, [card]);
          ctx.draw(s, victim, 1);
        }
        break;
      }
      case "inspector":
      case "inspect-next": {
        const selection = e.cardName
          ? (JSON.parse(e.cardName) as {
              actor: PlayerId;
              remaining: PlayerId[];
              chosen: string[];
            })
          : {
              actor: p,
              remaining: (e.additionalCostPaid
                ? [opponent(p)]
                : [p, opponent(p)]) as PlayerId[],
              chosen: [] as string[],
            };
        while (selection.remaining.length) {
          const chooser = selection.remaining.shift()!;
          const units = s.units.filter((u) => u.owner === chooser);
          if (!units.length) continue;
          choose(
            s,
            chooser,
            ctx,
            units.map((u) => ({
              label: `Kill ${getCard(u.cardId).name}`,
              effects: [
                fx("inspect-next", {
                  cardName: JSON.stringify({
                    ...selection,
                    chosen: [...selection.chosen, u.id],
                  }),
                }),
              ],
            })),
          );
          return true;
        }
        ctx.killUnits(s, selection.chosen);
        break;
      }
      case "gate": {
        const source = s.units.find((u) => u.id === ctx.sourceId);
        if (
          source &&
          gateDestination(s, source, ctx.targetId as LocationId, ctx)
        )
          ctx.moveUnit(s, source, ctx.targetId as LocationId, p);
        break;
      }
      default:
        throw new Error(`Unsupported Unleashed wave 4 effect: ${e.custom}`);
    }
    return true;
  },
};
