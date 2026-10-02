import type { Card } from "../data/cards";
import type {
  ActivatedAbility,
  CardScript,
  Effect,
  TargetFilter,
} from "./types";

/**
 * A deliberately closed grammar for rules already represented by the engine.
 * Returning undefined is significant: a recognizable prefix is never enough to
 * advertise a card as playable. Handwritten scripts take precedence over this.
 */
export function compileCardScript(card: Card): CardScript | undefined {
  const original = card.text.trim();
  if (card.type === "Rune")
    return !original || original === "[NO TEXT]"
      ? { implemented: true }
      : undefined;
  // Equipment effects are printed in a separate panel missing from the feed.
  if (
    card.type === "Legend" ||
    (card.type === "Gear" &&
      (card.supertype === "Equipment" ||
        card.tags.includes("Equipment") ||
        /\[(?:Equip|Quick-Draw)\]/i.test(original)))
  )
    return undefined;
  if (!original || original === "[NO TEXT]")
    return card.type === "Unit" || card.type === "Battlefield"
      ? { implemented: true }
      : undefined;

  let text = normalize(original);
  if (!text || /[()]/.test(text)) return undefined;
  const script: CardScript = { implemented: true };
  const keyword = (name: string) => {
    (script.keywords ??= []).push(name);
  };

  // Flow is a suffix on spell text; it is not a second spell instruction.
  const flow = text.match(
    /\s*\[Flow\]\s*((?::rb_(?:energy_\d+|rune_\w+):\s*)+)\.?$/,
  );
  if (flow) {
    if (card.type !== "Spell") return undefined;
    const cost = parseCost(flow[1]);
    if (!cost) return undefined;
    script.flow = cost;
    text = text.slice(0, flow.index).trim();
  }

  while (true) {
    const match = text.match(
      /^\[(Action|Reaction|Hidden|Accelerate|Assault|Shield|Deflect|Tank|Ganking|Vision|Ambush|Temporary)(?: (\d+))?\]\s*,?\s*/,
    );
    if (!match) break;
    const name = match[1];
    const amount = Number(match[2] ?? 1);
    if (!Number.isSafeInteger(amount) || amount < 1) return undefined;
    if (match[2] && !["Assault", "Shield", "Deflect"].includes(name))
      return undefined;
    const unitOnly = !["Action", "Reaction", "Hidden"].includes(name);
    if (unitOnly && card.type !== "Unit") return undefined;
    switch (name) {
      case "Action":
        script.action = true;
        break;
      case "Reaction":
        script.reaction = true;
        break;
      case "Hidden":
        script.hidden = true;
        break;
      case "Accelerate":
        // Generic acceleration pays a power of one of the card's domains.
        if (card.domains.length !== 1 || card.domains[0] === "Colorless")
          return undefined;
        script.accelerating = true;
        break;
      case "Ambush":
        script.ambush = true;
        break;
      case "Assault":
        script.assault = (script.assault ?? 0) + amount;
        keyword(`${name} ${amount}`);
        break;
      case "Shield":
        script.shield = (script.shield ?? 0) + amount;
        keyword(`${name} ${amount}`);
        break;
      case "Deflect":
        script.deflect = (script.deflect ?? 0) + amount;
        keyword(`${name} ${amount}`);
        break;
      case "Vision":
        keyword(name);
        (script.onPlay ??= []).push({ type: "predict" });
        break;
      default:
        keyword(name);
    }
    text = text.slice(match[0].length).trim();
  }

  const repeat = text.match(
    /^\[Repeat\]\s*((?::rb_(?:energy_\d+|rune_\w+):\s*)+)/,
  );
  if (repeat) {
    const cost = parseCost(repeat[1]);
    if (card.type !== "Spell" || !cost) return undefined;
    script.repeat = {
      energy: cost.energy,
      power: cost.power,
      ...(cost.domain ? { domain: cost.domain } : {}),
    };
    text = text.slice(repeat[0].length).trim();
  }

  if (card.type === "Spell") {
    const effects = compileEffects(text, false);
    if (!effects?.length || effects.some((effect) => effect.chooseRunes))
      return undefined;
    script.spell = effects;
    return script;
  }

  if (card.type === "Unit" && /^I enter ready\./.test(text)) {
    keyword("Enters ready");
    text = text.replace(/^I enter ready\.\s*/, "");
  }
  if (card.type === "Unit" && /^Ganking\.?$/.test(text)) {
    keyword("Ganking");
    text = "";
  }
  if (!text) return card.type === "Gear" ? undefined : script;

  const clauses = text.split(
    /(?<=\.)\s*(?=When\b|At the (?:start|end)\b|\[Deathknell\]|:rb_exhaust:|:rb_energy_\d+:|Recycle \d+ from your trash:|Spend my buff:)/,
  );
  for (const clause of clauses) {
    const trigger = parseTrigger(clause, card.type);
    if (trigger) {
      const effects = compileEffects(trigger.body, card.type === "Unit");
      if (!effects?.length) return undefined;
      if (trigger.condition) {
        // The primitive has one condition slot; never overwrite a different
        // condition such as self-reference, combat, or a Might restriction.
        if (effects.some((e) => e.condition)) return undefined;
        for (const effect of effects) effect.condition = trigger.condition;
      }
      if (
        trigger.hooks.some(
          (hook) => hook === "onDeath" || hook === "onDiscard",
        ) &&
        effects.some((e) => e.condition === "self")
      )
        return undefined;
      if (
        card.type === "Gear" &&
        trigger.hooks.some(
          (hook) => !["onPlay", "onDeath", "onBegin", "onEnd"].includes(hook),
        )
      )
        return undefined;
      if (
        card.type === "Battlefield" &&
        effects.some((e) => e.target || e.location === "here")
      )
        return undefined;
      for (const hook of trigger.hooks) {
        const combined = [...(script[hook] ?? []), ...effects];
        if (combined.filter((e) => e.target).length > 1) return undefined;
        if (
          combined.some((e) => e.chooseRunes) &&
          combined.filter((e) => e.chooseRunes || e.target).length > 1
        )
          return undefined;
        script[hook] = combined;
      }
      continue;
    }
    if (card.type === "Battlefield") return undefined;
    const ability = compileAbility(clause, card.type === "Unit");
    if (!ability || ability.effects.some((effect) => effect.chooseRunes))
      return undefined;
    (script.abilities ??= []).push(ability);
  }
  return script;
}

// Only known explanatory reminders are removed. Unknown parenthetical text
// remains visible to the grammar and rejects the entire card.
function normalize(text: string): string {
  return text
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|[’‘]/g, "'")
    .replace(
      /\((?:Play on your turn or in showdowns\.|Play any time, even before spells and abilities resolve\.|Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:\.|(?:I|It) can move from battlefield to battlefield\.|I must be assigned combat damage first\.|When you play me, look at the top card of your Main Deck\. You may recycle it\.|Look at the top card of your Main Deck\. You may recycle it\.|When I die, get the effect\.|It doesn't deal combat damage this turn\.|You may play me as a \[Reaction\] to a battlefield where you have units\.|You may play this from your trash for its Flow cost\. Then banish it\.|You may pay the additional cost to repeat this spell's effect\.)\)/g,
      " ",
    )
    .replace(
      /\(\+\d+ :rb_might: while (?:I'm|it's) an? (?:attacker|defender|attacker or defender)\.\)/g,
      " ",
    )
    .replace(
      /\(Opponents must pay (?::rb_rune_rainbow:)+ to choose me with a spell or ability\.\)/g,
      " ",
    )
    .replace(
      /\(You may pay :rb_energy_1::rb_rune_(?:fury|calm|mind|body|chaos|order): as an additional cost to have me enter ready\.\)/g,
      " ",
    )
    .replace(
      /\((?:If (?:I don't|it doesn't) have a buff, (?:I get|it gets) a \+1 :rb_might: buff\.|To buff a unit, give it a \+1 :rb_might: buff if it doesn't already have one\.)\)/g,
      " ",
    )
    .replace(
      /\(Kill it at the start of its controller's (?:next )?Beginning Phase, before scoring\.\)/g,
      " ",
    )
    .replace(
      /\(Kill me at the start of your Beginning Phase, before scoring\.\)/g,
      " ",
    )
    .replace(
      /\(You may pay (?::rb_energy_\d+:|:rb_rune_rainbow:)+ as an additional cost to repeat this spell\.\)/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function parseCost(text: string): NonNullable<CardScript["flow"]> | undefined {
  const parts = [...text.matchAll(/:rb_(energy_(\d+)|rune_(\w+)):/g)];
  if (!parts.length || text.replace(/:rb_(?:energy_\d+|rune_\w+):/g, "").trim())
    return undefined;
  const domains = new Set(
    parts.flatMap((m) => (m[3] && m[3] !== "rainbow" ? [m[3]] : [])),
  );
  if (
    domains.size > 1 ||
    (domains.size && parts.some((m) => m[3] === "rainbow"))
  )
    return undefined;
  const domain = [...domains][0];
  if (
    domain &&
    !["fury", "calm", "mind", "body", "chaos", "order"].includes(domain)
  )
    return undefined;
  return {
    energy: parts.reduce((n, m) => n + Number(m[2] ?? 0), 0),
    power: parts.filter((m) => m[3]).length,
    ...(domain ? { domain: domain[0].toUpperCase() + domain.slice(1) } : {}),
  };
}

type Hook =
  | "onPlay"
  | "onAttack"
  | "onDefend"
  | "onConquer"
  | "onHold"
  | "onMove"
  | "onDeath"
  | "onBegin"
  | "onEnd"
  | "onDiscard";
function parseTrigger(
  text: string,
  type: Card["type"],
):
  | { hooks: Hook[]; body: string; condition?: "sourceAtBattlefield" }
  | undefined {
  const whileAtBattlefield = text.match(
    /^While I'm at a battlefield, ready (\d+) friendly runes at the end of your turn\.$/i,
  );
  if (type === "Unit" && whileAtBattlefield)
    return {
      hooks: ["onEnd"],
      body: `Ready ${whileAtBattlefield[1]} friendly runes.`,
      condition: "sourceAtBattlefield",
    };
  const headers: [RegExp, Hook[]][] =
    type === "Battlefield"
      ? [
          [/^When you hold here, /i, ["onHold"]],
          [/^When you conquer here, /i, ["onConquer"]],
        ]
      : [
          [/^When you play (?:me|this), /i, ["onPlay"]],
          [/^When I attack or defend, /i, ["onAttack", "onDefend"]],
          [/^When I attack, /i, ["onAttack"]],
          [/^When I defend, /i, ["onDefend"]],
          [/^When I conquer, /i, ["onConquer"]],
          [/^When I hold, /i, ["onHold"]],
          [/^When I move, /i, ["onMove"]],
          [/^When you discard me, /i, ["onDiscard"]],
          [/^At the start of your Beginning Phase, /i, ["onBegin"]],
          [/^At the end of your turn, /i, ["onEnd"]],
          [/^\[Deathknell\]\s*(?:—|\[>\])\s*/i, ["onDeath"]],
        ];
  for (const [pattern, hooks] of headers) {
    const match = text.match(pattern);
    if (match) {
      const body = text.slice(match[0].length);
      if (type === "Unit" && /^if I'm at a battlefield, /i.test(body))
        return {
          hooks,
          body: body.replace(/^if I'm at a battlefield, /i, ""),
          condition: "sourceAtBattlefield",
        };
      return { hooks, body };
    }
  }
  return undefined;
}

const targets: Record<string, TargetFilter> = {
  "a unit": "anyUnit",
  "an enemy unit": "enemyUnit",
  "a friendly unit": "friendlyUnit",
  "a unit at a battlefield": "unitAtBattlefield",
  "an enemy unit at a battlefield": "enemyUnitAtBattlefield",
  "a friendly unit at a battlefield": "friendlyUnitAtBattlefield",
  "an enemy unit here": "enemyUnitHere",
  "a friendly unit here": "friendlyUnitHere",
  "an exhausted friendly unit": "friendlyExhaustedUnit",
};
function unitTarget(
  text: string,
  self: boolean,
): Pick<Effect, "target" | "condition" | "maxMight"> | undefined {
  if (text.toLowerCase() === "me")
    return self ? { condition: "self" } : undefined;
  if (!self && /\bhere\b/i.test(text)) return undefined;
  const match = text
    .toLowerCase()
    .match(/^(.*?)(?: with (\d+) :rb_might: or less)?$/)!;
  const target = targets[match[1]];
  return target
    ? { target, ...(match[2] ? { maxMight: Number(match[2]) } : {}) }
    : undefined;
}

function compileEffects(text: string, self: boolean): Effect[] | undefined {
  const parts = text.split(/\.\s*/).filter(Boolean);
  if (!parts.length || !text.endsWith(".")) return undefined;
  const result: Effect[] = [];
  for (const part of parts) {
    // Compositions without target ambiguity, including discard/draw sequencing.
    const pieces = part.split(
      /,? (?:then |and )(?=(?:draw|channel|discard)\b)/i,
    );
    for (const piece of pieces) {
      const effect = compileEffect(piece, self);
      if (!effect) return undefined;
      result.push(...effect);
    }
  }
  // The engine's primitive target slot represents only one independently
  // selected object. Two sentences that say "a unit" require two choices.
  if (result.filter((e) => e.target).length > 1) return undefined;
  return result;
}

function compileEffect(text: string, self: boolean): Effect[] | undefined {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/^(Draw|Discard) (\d+)$/i)))
    return [
      { type: m[1].toLowerCase() as "draw" | "discard", amount: Number(m[2]) },
    ];
  if ((m = text.match(/^Channel (\d+) runes? exhausted$/i)))
    return [{ type: "channel", amount: Number(m[1]) }];
  if ((m = text.match(/^Ready (up to )?(\d+) friendly runes?$/i)))
    return [
      {
        type: "readyRunes",
        amount: Number(m[2]),
        chooseRunes: true,
        ...(m[1] ? { optional: true } : {}),
      },
    ];
  if (/^\[Predict(?: 1)?\]$/i.test(text)) return [{ type: "predict" }];
  if ((m = text.match(/^\[Burn (\d+)\]$/i)))
    return [{ type: "mill", amount: Number(m[1]) }];
  if (/^You score 1 point$/i.test(text)) return [{ type: "score" }];
  if ((m = text.match(/^Deal (\d+) to (.+)$/i))) {
    const target = unitTarget(m[2], self);
    if (target) return [{ type: "damage", amount: Number(m[1]), ...target }];
    if (/^all enemy units in combat$/i.test(m[2]))
      return [
        {
          type: "damageAll",
          amount: Number(m[1]),
          who: "opponent",
          condition: "combat",
        },
      ];
    if (/^all (?:enemy )?units at battlefields$/i.test(m[2]))
      return [
        {
          type: "damageAll",
          amount: Number(m[1]),
          who: /enemy/i.test(m[2]) ? "opponent" : "all",
          condition: "allBattlefields",
        },
      ];
    if (/^all (?:enemy )?units at a battlefield$/i.test(m[2]))
      return [
        {
          type: "damageAll",
          amount: Number(m[1]),
          who: /enemy/i.test(m[2]) ? "opponent" : "all",
          target: "battlefield",
        },
      ];
  }
  if ((m = text.match(/^(?:\[Stun\]|Stun|Ready|Exhaust|Kill|Buff) (.+)$/i))) {
    const target = unitTarget(m[1], self);
    const type = text
      .split(" ")[0]
      .replace(/[\[\]]/g, "")
      .toLowerCase() as Effect["type"];
    if (target) return [{ type, ...target }];
  }
  if (
    (m = text.match(
      /^Give (.+) ([+-]\d+) :rb_might: this turn(?:, to a minimum of (\d+) :rb_might:)?$/i,
    ))
  ) {
    const target = unitTarget(m[1], self);
    const amount = Number(m[2]);
    if (target && (!m[3] || amount < 0))
      return [
        {
          type: "might",
          amount,
          ...target,
          ...(m[3] ? { minMight: Number(m[3]) } : {}),
        },
      ];
    if (/^friendly units$/i.test(m[1]) && !m[3])
      return [{ type: "mightAll", amount, who: "self" }];
  }
  if (
    (m = text.match(
      /^Give (.+) \[(Assault(?: \d+)?|Ganking|Tank|Deflect(?: \d+)?)\] this turn$/i,
    ))
  ) {
    const target = unitTarget(m[1], self);
    if (!target) return undefined;
    if (m[2].startsWith("Assault"))
      return [
        { type: "assault", amount: Number(m[2].split(" ")[1] ?? 1), ...target },
      ];
    return [{ type: "keyword", keyword: m[2], ...target }];
  }
  if ((m = text.match(/^Return (.+) to its owner's hand$/i))) {
    const target = unitTarget(m[1], self);
    if (target) return [{ type: "bounce", ...target }];
  }
  if (
    (m = text.match(
      /^Move (a unit|an enemy unit|a friendly unit) from a battlefield to its base$/i,
    ))
  ) {
    const target = unitTarget(`${m[1]} at a battlefield`, self);
    if (target) return [{ type: "moveTarget", ...target }];
  }
  if ((m = text.match(/^Move (a unit|an enemy unit|a friendly unit)$/i))) {
    const target = unitTarget(m[1], self);
    if (target)
      return [
        { type: "moveTarget", condition: "chooseDestination", ...target },
      ];
  }
  if (
    (m = text.match(
      /^[Pp]lay (a|\d+|two|three|four) (ready )?(1|2|3) :rb_might: (Recruit|Mech|Sand Soldier|Sprite) unit tokens?( with \[Temporary\])?( here| (?:to|in) your base)?$/,
    ))
  ) {
    const might: Record<string, number> = {
      Recruit: 1,
      Mech: 3,
      "Sand Soldier": 2,
      Sprite: 3,
    };
    if (might[m[4]] !== Number(m[3]) || (m[4] === "Sprite") !== Boolean(m[5]))
      return undefined;
    if (m[6] === " here" && !self) return undefined;
    const count: Record<string, number> = { a: 1, two: 2, three: 3, four: 4 };
    return [
      {
        type: "token",
        amount: count[m[1]] ?? Number(m[1]),
        cardName: m[4],
        ...(m[2] ? { ready: true } : {}),
        ...(m[6] ? { location: m[6] === " here" ? "here" : "base" } : {}),
      },
    ];
  }
  return undefined;
}

function compileAbility(
  text: string,
  self: boolean,
): ActivatedAbility | undefined {
  let match = text.match(/^:rb_exhaust::\s*(.+)$/);
  if (match) {
    const effects = compileEffects(match[1], self);
    return effects ? { label: match[1], exhaust: true, effects } : undefined;
  }
  match = text.match(/^Recycle (\d+) from your trash:\s*(.+)$/);
  if (match) {
    if (Number(match[1]) !== 1) return undefined;
    const effects = compileEffects(match[2], self);
    return effects
      ? { label: match[2], recycleCost: Number(match[1]), effects }
      : undefined;
  }
  match = text.match(/^Spend my buff:\s*(.+)$/);
  if (match && self) {
    const effects = compileEffects(match[1], self);
    return effects ? { label: match[1], spendBuff: true, effects } : undefined;
  }
  return undefined;
}
