import { getKeywords } from "./engine";
import { getScript } from "./scripts";
import type { GameState, Gear, Unit } from "./types";

export interface CardStatus {
  id: string;
  label: string;
  mark: string;
  tone: "stun" | "positive" | "negative" | "neutral";
  detail?: string;
  values?: Record<string, string | number>;
}

const signed = (amount: number) =>
  amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`;

/** Read public state from the displayed frame, never the outcome of a review. */
export function unitStatuses(game: GameState, unit: Unit): CardStatus[] {
  const statuses: CardStatus[] = [];
  const add = (
    id: string,
    label: string,
    mark: string,
    tone: CardStatus["tone"],
    detail: string,
    values?: CardStatus["values"],
  ) => {
    if (!statuses.some((status) => status.id === id))
      statuses.push({
        id,
        label,
        mark,
        tone,
        detail,
        ...(values ? { values } : {}),
      });
  };
  const keywords = getKeywords(game, unit);
  // Catalog keywords also include text behind Empowered/Level conditions. Only
  // the script's unconditional keywords are inherent for this comparison.
  const printed = new Set(getScript(unit.cardId)?.keywords ?? []);

  if (unit.stunned)
    add(
      "stunned",
      "Stunned",
      "STUN",
      "stun",
      "Deals no combat damage this turn.",
    );
  if (unit.damage > 0)
    add(
      "damage",
      "Damage {count}",
      `−${unit.damage}`,
      "negative",
      "Marked damage clears at the end of the turn.",
      { count: unit.damage },
    );
  if (unit.buff > 0)
    add(
      "buff",
      "Buff {count}",
      `+${unit.buff}`,
      "positive",
      "Buff remains until it is spent or removed.",
      { count: unit.buff },
    );
  if (unit.temporaryMight)
    add(
      "might",
      "Might {amount}",
      signed(unit.temporaryMight),
      unit.temporaryMight > 0 ? "positive" : "negative",
      "Might modifier lasts until the end of the turn.",
      { amount: signed(unit.temporaryMight) },
    );
  if (unit.temporaryAssault)
    add(
      "assault",
      "Assault {amount}",
      `A${signed(unit.temporaryAssault)}`,
      unit.temporaryAssault > 0 ? "positive" : "negative",
      "Extra Might while attacking this turn.",
      { amount: signed(unit.temporaryAssault) },
    );
  const blockShield =
    (unit.temporaryKeywords ?? []).filter(
      (keyword) => keyword === "OGN Block Shield 3",
    ).length * 3;
  if (unit.combatShield)
    add(
      "shield",
      "Shield {amount}",
      `S${signed(unit.combatShield)}`,
      "positive",
      "Extra Might while defending this combat.",
      { amount: signed(unit.combatShield) },
    );
  if (blockShield)
    add(
      "block-shield",
      "Shield {amount}",
      `S${signed(blockShield)}`,
      "positive",
      "Extra Might while defending this turn.",
      { amount: signed(blockShield) },
    );
  if (unit.empowered)
    add(
      "empowered",
      "Empowered",
      "EMP",
      "positive",
      "Empowered abilities are active.",
    );
  if ((unit.preventDamage ?? 0) > 0)
    add(
      "prevent-damage",
      "Prevent {count}",
      `${unit.preventDamage}`,
      "positive",
      "Prevents this much damage; unused protection expires at the end of the turn.",
      { count: unit.preventDamage! },
    );
  if (unit.preventNextDamageTurn === game.turn)
    add(
      "prevent-next-damage",
      "Guarded",
      "GUARD",
      "positive",
      "Prevents the next damage dealt to this unit this turn.",
    );
  if (unit.doubleDamageTurn === game.turn) {
    const multiplier = 2 ** (unit.damageDoublings ?? 1);
    if (multiplier > 1)
      add(
        "vulnerable",
        "Vulnerable ×{count}",
        `×${multiplier}`,
        "negative",
        "Incoming damage is multiplied this turn.",
        { count: multiplier },
      );
  }
  if (unit.untargetableByEnemy || keywords.includes("Untargetable"))
    add(
      "untargetable",
      "Untargetable",
      "WARD",
      "positive",
      unit.untargetableByEnemy
        ? "Enemy spells and abilities cannot choose this unit this turn."
        : "Enemy spells and abilities cannot choose this unit while this effect is active.",
    );
  if (unit.baseMightOverride !== undefined)
    add(
      "base-might",
      "Base Might {count}",
      `=${unit.baseMightOverride}`,
      "neutral",
      "Base Might is replaced until the end of the turn; other modifiers still apply.",
      { count: unit.baseMightOverride },
    );
  if (unit.moveLockedTurn === game.turn)
    add(
      "move-locked",
      "Move locked",
      "LOCK",
      "negative",
      "Cannot move this turn.",
    );
  if (unit.deathReplacementTurn === game.turn)
    add(
      "death-ward",
      "Death ward",
      "SAVE",
      "positive",
      "The next time this unit would die this turn, recall it exhausted instead.",
    );
  if (unit.temporary) {
    const suppressed =
      unit.location.startsWith("field:") &&
      game.units.some(
        (ally) =>
          ally.owner === unit.owner &&
          ally.location === unit.location &&
          getKeywords(game, ally).includes("Suppress friendly Temporary"),
      );
    add(
      "temporary",
      "Temporary",
      "TEMP",
      "neutral",
      suppressed
        ? "Temporary removal is suppressed while the protecting effect remains at this battlefield."
        : "Dies at the beginning of its controller's next turn.",
    );
  }
  if (game.preventEffectDamageTurn === game.turn)
    add(
      "effect-shield",
      "Effect shield",
      "WARD",
      "positive",
      "Prevents damage from spells and abilities this turn.",
    );

  // Mechanical state restrictions deserve a marker even when printed on the card.
  // Everything else here is a granted keyword, rather than repeated card rules.
  const specialKeywords: Record<string, Omit<CardStatus, "id">> = {
    "Prevent all damage": {
      label: "Invulnerable",
      mark: "SAFE",
      tone: "positive",
      detail: "Prevents all damage while this effect is active.",
    },
    "No combat damage": {
      label: "No combat damage",
      mark: "0 DMG",
      tone: "negative",
      detail:
        "This unit contributes no combat damage while this effect is active.",
    },
    "Cannot ready": {
      label: "Cannot ready",
      mark: "LOCK",
      tone: "negative",
      detail: "This unit cannot ready while this effect is active.",
    },
    "Cannot move to base": {
      label: "No recall move",
      mark: "LOCK",
      tone: "negative",
      detail: "This unit cannot move to base while this effect is active.",
    },
    "Cannot be moved by enemies": {
      label: "Anchored",
      mark: "HOLD",
      tone: "positive",
      detail: "Enemies cannot move this unit while this effect is active.",
    },
    "Prevent damage while not in combat": {
      label: "Out-of-combat guard",
      mark: "GUARD",
      tone: "positive",
      detail: "Prevents damage while this unit is outside combat.",
    },
  };
  for (const keyword of new Set(keywords)) {
    if (keyword === "Untargetable" || keyword === "OGN Block Shield 3")
      continue;
    const special = specialKeywords[keyword];
    if (special) {
      if (
        keyword === "Prevent damage while not in combat" &&
        game.combat?.engaged &&
        game.combat.fieldId === unit.location &&
        (!game.combat.designatedUnits ||
          game.combat.designatedUnits.includes(unit.id))
      )
        continue;
      statuses.push({
        id: `keyword:${keyword.toLowerCase().replaceAll(" ", "-")}`,
        ...special,
      });
    } else if (
      !printed.has(keyword) &&
      /^(?:Assault|Shield|Deflect|Ganking|Tank|Backline|Vision|Weaponmaster|Hunt|Deathknell|Temporary)(?: \d+)?$/.test(
        keyword,
      )
    ) {
      if (keyword === "Temporary" && unit.temporary) continue;
      const temporary = unit.temporaryKeywords?.includes(keyword);
      add(
        `keyword:${keyword.toLowerCase().replaceAll(" ", "-")}`,
        keyword,
        keyword.match(/ \d+$/)?.[0].trim() ?? keyword.slice(0, 4).toUpperCase(),
        "positive",
        temporary
          ? "Granted until the end of the turn."
          : "Active while the granting effect remains.",
      );
    }
  }
  return statuses;
}

export function gearStatuses(_game: GameState, gear: Gear): CardStatus[] {
  const statuses: CardStatus[] = [];
  if (gear.empowered)
    statuses.push({
      id: "empowered",
      label: "Empowered",
      mark: "EMP",
      tone: "positive",
      detail: "Empowered abilities are active.",
    });
  if (gear.temporary)
    statuses.push({
      id: "temporary",
      label: "Temporary",
      mark: "TEMP",
      tone: "neutral",
      detail: "Destroyed at the beginning of its controller's next turn.",
    });
  return statuses;
}
