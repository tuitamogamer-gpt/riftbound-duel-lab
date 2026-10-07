import { isCardType } from "../data/cards";
import { getCard } from "../data/cards";
import {
  applyAction,
  getLegalActions,
  getMight,
  getKeywords,
  otherPlayer,
} from "./engine";
import { getScript } from "./scripts";
import { battleBalance, damageScores, planAttack } from "./bot-tactics";
import type { Effect, GameAction, GameState, PlayerId, Unit } from "./types";
/** Uses public board state, own hand, and only the top card explicitly revealed by a Predict choice. */
export function getReferenceAction(
  s: GameState,
  player: PlayerId = s.priorityPlayer,
  suppliedActions?: GameAction[],
): GameAction | null {
  const actions = suppliedActions ?? getLegalActions(s, player);
  if (!actions.length) return null;
  const opponent = otherPlayer(player);
  const own = s.units.filter((u) => u.owner === player);
  const enemies = s.units.filter((u) => u.owner === opponent);
  const value = (u: Unit) =>
    getMight(s, u) +
    (getCard(u.cardId).energy ?? 0) * 0.25 +
    (u.cardId.startsWith("ogs-00") ? 1 : 0);
  const cardValue = (id: string): number => {
    const c = getCard(id),
      sc = getScript(id);
    const resources = s.players[player].energy + s.players[player].runes.length;
    const unreachable = Math.max(0, (c.energy ?? 0) - resources - 2) * 2;
    return (
      (isCardType(c, "Unit")
        ? 12 + (c.might ?? 0) * 2
        : isCardType(c, "Gear")
          ? 9
          : 7) +
      (sc?.spell?.some((e) =>
        ["draw", "channel", "token"].some((type) => isCardType(e, type)),
      )
        ? 6
        : 0) -
      unreachable
    );
  };
  const effectValue = (effect: Effect | undefined, target?: Unit): number => {
    if (!effect) return 0;
    const custom = effect.custom ?? "";
    if (
      effect.type === "ready" ||
      /(?:vi-ready|fiora-ready|ready-unit)/.test(custom)
    )
      return target?.owner === player && !target.ready
        ? 16 + value(target)
        : -20;
    if (effect.type === "buff" || /(?:valley-pay|buff-unit)/.test(custom))
      return target?.owner === player && !target.buff
        ? 12 + value(target)
        : -20;
    if (effect.type === "stun" || /(?:blast-stun|dread)/.test(custom))
      return target?.owner === opponent && !target.stunned
        ? 18 + value(target)
        : -25;
    if (
      ["damage", "kill", "bounce"].some((type) => isCardType(effect, type)) ||
      /(?:banish|wind-ghosts|lacerate|morgana)/.test(custom)
    )
      return target?.owner === opponent ? 15 + value(target) : -35;
    if (
      ["might", "assault", "keyword"].some((type) =>
        isCardType(effect, type),
      ) ||
      /(?:combat-experience|barrier|shroud|retreat)/.test(custom)
    )
      return target?.owner === player
        ? s.combat?.fieldId === target.location
          ? 20
          : target.ready
            ? 8
            : 1
        : -35;
    if (custom.endsWith("move-base") || effect.type === "moveTarget")
      return target?.owner === opponent
        ? 15 + value(target)
        : target && enemies.some((u) => u.location === target.location)
          ? 8
          : -10;
    if (
      ["draw", "channel", "token", "score"].some((type) =>
        isCardType(effect, type),
      ) ||
      /(?:vex-draw|ripper-pay|treasure|pay-mighty|play-mech|draw)/.test(custom)
    )
      return 15;
    if (effect.type === "heal")
      return target?.owner === player && target.damage ? 8 : -5;
    return 3;
  };
  const damage = s.phase === "damage" ? damageScores(s, player, actions) : null;
  const plans = new Map(
    s.fields.map((field) => {
      const ids = new Set(
        actions
          .filter(
            (a) =>
              a.category === "move" && a.locationId === field.id && a.sourceId,
          )
          .map((a) => a.sourceId),
      );
      return [
        field.id,
        field.controller === player
          ? null
          : planAttack(
              s,
              player,
              field.id,
              own.filter((u) => ids.has(u.id)),
            ),
      ];
    }),
  );
  const rate = (a: GameAction): number => {
    const selected = s.units.find((u) => u.id === a.targetId);
    if (s.phase === "choice") {
      const choice = s.pendingChoice!;
      if (choice.kind === "boardTargets") {
        if (a.id === "choose-board:done") return 0;
        if (a.id.startsWith("choose-board:destination:"))
          return choice.boardSelection?.destination ? -100 : 5;
        if ((a.amount ?? 0) < 0) return -100;
        const object = selected ?? s.gears.find((g) => g.id === a.targetId);
        const runeOwner = s.players.find((p) =>
          p.runes.some((r) => r.id === a.targetId),
        );
        const owner = object?.owner ?? runeOwner?.id;
        if (choice.effect?.type === "ready") {
          const ready =
            object?.ready ??
            runeOwner?.runes.find((r) => r.id === a.targetId)?.ready;
          return owner === player && !ready ? 30 : -10;
        }
        return owner !== player || choice.effect?.type === "moveTarget"
          ? 20
          : -10;
      }
      if (choice.kind === "trashTargets") {
        if (a.id === "choose-trash:done") return 0;
        if ((a.amount ?? 0) < 0) return -100;
        const ownTrash = a.targetId?.startsWith(`trash:${player}:`);
        const returning = choice.effect?.custom === "wave7:return-trash";
        if (choice.effect?.upTo && (returning ? !ownTrash : ownTrash))
          return -10;
        return 40 + (a.cardId ? (returning ? 1 : -1) * cardValue(a.cardId) : 0);
      }
      if (a.id.endsWith(":skip") || a.id === "choose-optional:no") return 0;
      if (a.id.startsWith("choose-rune:"))
        return s.players[player].runes.find((rune) => rune.id === a.sourceId)
          ?.ready
          ? -1
          : 5;
      if (a.id.startsWith("choose-card:")) {
        if (!a.cardId) return -5;
        const amount = cardValue(a.cardId);
        if (choice.kind === "retrieve") return 10 + amount;
        const discardBonus =
          choice.kind === "discard" && getScript(a.cardId)?.onDiscard ? 20 : 0;
        return 40 - amount + discardBonus;
      }
      if (a.id.startsWith("choose-unit:")) {
        if (!selected) return -10;
        return (
          40 -
          value(selected) +
          (selected.token ? 10 : 0) +
          (choice.kind === "sacrifice" && getScript(selected.cardId)?.onDeath
            ? 8
            : 0)
        );
      }
      if (a.id.startsWith("choose-predict:")) {
        // This one card is information the active Predict effect explicitly reveals.
        const revealed = s.players[player].deck[0];
        if (!revealed) return a.id.endsWith(":keep") ? 1 : -1;
        const c = getCard(revealed);
        const tooExpensive =
          (c.energy ?? 0) > s.players[player].runes.length + 3;
        const lacksUnits = own.length < 2 && isCardType(c, "Unit");
        return a.id.endsWith(":recycle")
          ? tooExpensive && !lacksUnits
            ? 10
            : -5
          : 1;
      }
      if (a.id.startsWith("choose-destination:")) {
        const moved = s.units.find((u) => u.id === choice.targetId);
        if (!moved) return 0;
        if (moved.owner === opponent)
          return a.locationId === `base:${opponent}` ? 30 : -10;
        const defenders = enemies.filter((u) => u.location === a.locationId);
        return a.locationId?.startsWith("field:") && !defenders.length
          ? 20
          : a.locationId === `base:${player}`
            ? 5
            : -5;
      }
      if (a.id.startsWith("choose-custom:")) {
        const effects = a.effects ?? [];
        if (!effects.length) return 0;
        return effects.reduce((sum, e) => sum + effectValue(e, selected), 0);
      }
      if (a.id === "choose-optional:yes")
        return (choice.effect?.effects ?? [choice.effect]).reduce(
          (sum, e) => sum + effectValue(e, selected),
          0,
        );
    }
    if (a.id.startsWith("hide:"))
      return own.some((u) => u.location.startsWith("field:")) ? 3 : -5;
    if (a.id.startsWith("equip:")) {
      const gear = s.gears.find((g) => g.id === a.sourceId);
      if (
        !selected ||
        selected.owner !== player ||
        gear?.attachedTo === selected.id
      )
        return -20;
      const previous = s.units.find((u) => u.id === gear?.attachedTo);
      return previous
        ? value(selected) > value(previous) + 4 && selected.ready
          ? 4
          : -10
        : 10 + value(selected) * 0.2;
    }
    if (a.abilityKey === "megatusk") {
      const source = own.find((u) => u.id === a.sourceId);
      return source &&
        own.some(
          (u) =>
            u.location === source.location &&
            u.ready &&
            !getKeywords(s, u).includes("Ganking"),
        )
        ? 8
        : -10;
    }
    if (a.abilityKey === "garden") return 8;
    if (["xerath", "shadow"].includes(a.abilityKey ?? ""))
      return selected?.owner === opponent ? 20 + value(selected) : -30;
    if (a.abilityKey === "shells")
      return selected?.owner === player &&
        selected.location === s.combat?.fieldId
        ? 20
        : -5;
    if (a.abilityKey === "scryer") return 15;
    if (
      /gold/i.test(a.id) ||
      (a.category === "resource" && /gold/i.test(a.label))
    )
      return s.players[player].hand.length &&
        !actions.some(
          (other) => other.category === "play" && !other.id.startsWith("hide:"),
        )
        ? 4
        : -5;

    if (a.category === "mulligan") {
      const indices = a.cardIndices ?? [];
      return (
        indices.reduce(
          (score, i) =>
            score +
            ((getCard(s.players[player].hand[i]).energy ?? 0) >= 5 ? 5 : -3),
          0,
        ) -
        indices.length * 0.01
      );
    }
    if (damage) return damage.get(a.id) ?? 0;
    if (a.id.startsWith("choose-token:")) {
      const f = s.fields.find((f) => f.id === a.locationId);
      if (!f) return 10;
      return 20 - own.filter((u) => u.location === f.id).length * 2;
    }
    if (a.id.startsWith("choose-trigger:")) {
      if (a.id === "choose-trigger:skip") return 0;
      const effects = a.effects ?? s.pendingChoice?.effects ?? [];
      const e = effects.find((e) => e.target);
      const u = s.units.find((u) => u.id === a.targetId);
      if (!u)
        return effects.reduce(
          (score, effect) =>
            score +
            (effect.type === "draw"
              ? 7 * (effect.amount ?? 1) * (effect.who === "opponent" ? -1 : 1)
              : ["channel", "token", "score"].some((type) =>
                    isCardType(effect, type),
                  )
                ? 9 * (effect.amount ?? 1)
                : 1),
          1,
        );
      if (e?.type === "might")
        return (u.owner === player ? 1 : -1) * (e.amount ?? 1) * 10;
      if (e?.type === "ready")
        return u.owner === player && !u.ready ? 20 + value(u) : -30;
      if (e?.type === "buff")
        return u.owner === player ? 20 + (u.buff ? 0 : 5) + value(u) : -50;
      if (e?.type === "stun")
        return u.owner === opponent
          ? 20 + value(u) + (u.stunned ? -30 : 0)
          : -50;
      if (e?.type === "damage")
        return u.owner === opponent
          ? 20 +
              value(u) +
              (u.damage + (e.amount ?? 1) >= getMight(s, u) ? 10 : 0)
          : -50;
      if (e?.type === "moveTarget")
        return u.owner === opponent ? 20 + value(u) : -20;
      return 1;
    }
    if (s.phase === "move") {
      const move = s.pendingMove!;
      const selected = own.filter((u) => move.unitIds.includes(u.id));
      if (
        !actions.some((next) => next.id === "move-confirm") &&
        move.unitIds.length
      ) {
        const removable = selected.find((u) => u.id === a.sourceId);
        if (removable) return 40 - value(removable);
      }
      const plan = plans.get(move.to);
      if (a.id === "move-confirm") {
        // An already-selected legal force can still be completed after a taxed removal.
        return battleBalance(s, player, move.to, selected).wins ? 80 : 1;
      }
      if (a.id === "move-cancel") return -20;
      const u = own.find((unit) => unit.id === a.sourceId);
      if (!u) return -30;
      const included = move.unitIds.includes(u.id);
      if (plan) {
        if (!included && plan.ids.includes(u.id)) return 100;
        if (included && !plan.ids.includes(u.id)) return 90;
      }
      return -30;
    }
    if (a.id === "end-turn" || a.id === "pass") return 0;
    if (a.category === "move") {
      const plan = a.locationId ? plans.get(a.locationId) : null;
      if (!plan || !plan.ids.includes(a.sourceId ?? "")) return -20;
      return plan.score;
    }
    if (a.category === "play") {
      const c = getCard(a.cardId!);
      if (isCardType(c, "Unit")) {
        const here = own.filter((u) => u.location === a.locationId).length;
        const f = s.fields.find((f) => f.id === a.locationId);
        return (
          25 +
          (c.might ?? 0) * 1.5 +
          (getScript(c.id)?.onPlay ? 2 : 0) +
          (f ? 8 - here * 2 : 0) +
          (a.id.endsWith("accelerate") ? 6 : 0)
        );
      }
      const effects = a.effects ?? getScript(c.id)?.spell ?? [];
      const effect = effects[0];
      const target = s.units.find((u) => u.id === a.targetId);
      const during = s.phase === "showdown" || s.stack.length > 0;
      if (effect?.type === "counter") {
        const spell = s.stack.find((item) => item.id === a.targetId);
        return spell?.player === opponent ? 40 : -100;
      }
      if (effect?.type === "damage" || effect?.type === "kill") {
        if (!target || target.owner !== opponent) return -50;
        const pendingDamage = s.stack
          .filter(
            (item) => item.player === player && item.targetId === target.id,
          )
          .flatMap((item) => item.effects)
          .filter((effect) => effect.type === "damage")
          .reduce((sum, effect) => sum + (effect.amount ?? 0), 0);
        const health =
          getMight(s, target) - target.damage + (target.preventDamage ?? 0);
        if (pendingDamage >= health) return -20;
        const kills =
          effect.type === "kill" ||
          pendingDamage + (effect.amount ?? 0) >= health;
        // Damage wears off: conserve removal unless it kills or helps this combat.
        if (!kills && (!during || target.location !== s.combat?.fieldId))
          return -8;
        return 20 + value(target) + (kills ? 18 : 0) + (during ? 12 : 0);
      }
      if (effect?.type === "duel") {
        const [first, second] = (a.targetId ?? "")
          .split("~")
          .map((id) => s.units.find((u) => u.id === id));
        if (!first || !second) return -30;
        if (first.owner === second.owner)
          return first.owner === opponent
            ? 30 + value(first) + value(second)
            : -50;
        const friend = first.owner === player ? first : second;
        const enemy = first.owner === opponent ? first : second;
        return getMight(s, friend) > getMight(s, enemy)
          ? 40 + value(enemy)
          : -10;
      }
      if (effect?.type === "damageAll") {
        const targetPlayer = effect.who === "opponent" ? opponent : player;
        const scope = s.units.filter(
          (u) =>
            (effect.who === "all" || u.owner === targetPlayer) &&
            (effect.condition === "allBattlefields"
              ? u.location.startsWith("field:")
              : effect.condition === "combat"
                ? !!s.combat?.engaged && u.location === s.combat.fieldId
                : u.location === a.targetId),
        );
        const victims = scope.filter((u) => u.owner === opponent);
        const net = scope.reduce(
          (sum, u) =>
            sum +
            (u.owner === player ? -1 : 1) *
              value(u) *
              (u.damage + (effect.amount ?? 0) >=
              getMight(s, u) + (u.preventDamage ?? 0)
                ? 2
                : 0.15),
          0,
        );
        return victims.length && net > 0 ? 15 + net : -30;
      }
      if (effect?.type === "stun") {
        return target?.owner === opponent && during && !target.stunned
          ? 30 + value(target)
          : -10;
      }
      if (["might", "assault"].includes(effect?.type ?? "")) {
        if (target?.owner !== player) return -50;
        if (!s.combat || target.location !== s.combat.fieldId) return -5;
        const before = battleBalance(s, player, s.combat.fieldId);
        const changed = {
          ...s,
          units: s.units.map((u) =>
            u.id === target.id
              ? {
                  ...u,
                  temporaryMight:
                    u.temporaryMight +
                    (effect.type === "might" ? (effect.amount ?? 1) : 0),
                  temporaryAssault:
                    u.temporaryAssault +
                    (effect.type === "assault" ? (effect.amount ?? 1) : 0),
                }
              : u,
          ),
        };
        const after = battleBalance(changed, player, s.combat.fieldId);
        const incoming = s.stack
          .filter(
            (item) => item.player === opponent && item.targetId === target.id,
          )
          .flatMap((item) => item.effects)
          .filter((e) => e.type === "damage")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const health =
          getMight(s, target) - target.damage + (target.preventDamage ?? 0);
        const improved = changed.units.find((u) => u.id === target.id)!;
        const saved =
          incoming >= health &&
          incoming <
            getMight(changed, improved) -
              improved.damage +
              (improved.preventDamage ?? 0);
        if (before.wins && !saved) return -8;
        return (!before.wins && after.wins) || saved ? 48 : -5;
      }
      if (effect?.type === "mightAll")
        return own.length >= 2 && (during || own.some((u) => u.ready))
          ? 30
          : -10;
      if (effect?.type === "draw") return 23;
      if (effect?.type === "channel") return 30;
      if (effect?.type === "token") return 29;
      return 2;
    }
    if (a.category === "ability") {
      const script = a.cardId ? getScript(a.cardId) : undefined;
      const index = Number(a.id.split("|")[2]);
      const ability = Number.isInteger(index)
        ? script?.abilities?.[index]
        : undefined;
      if (ability?.effects.length) {
        const source = s.units.find((u) => u.id === a.sourceId);
        return ability.effects.reduce(
          (n, e) => n + effectValue(e, selected ?? source),
          0,
        );
      }
      if (a.id.includes("empower")) return 6;
    }
    return 1;
  };
  return actions
    .map((a, i) => ({ a, score: rate(a), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)[0].a;
}
export function runReferenceUntilHuman(
  state: GameState,
  maxSteps = 256,
): GameState {
  let s = state;
  for (
    let i = 0;
    i < maxSteps && s.priorityPlayer === 1 && s.winner === null;
    i++
  ) {
    const action = getReferenceAction(s, 1);
    if (!action) break;
    s = applyAction(s, action);
  }
  return s;
}
