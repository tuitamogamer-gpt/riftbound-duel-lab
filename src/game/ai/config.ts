import { getCard } from "../../data/cards";
import { getScript } from "../scripts";
import type { CardScript, Effect } from "../types";

export type Difficulty = "beginner" | "normal" | "hard" | "expert";
export type Profile =
  | "aggressive"
  | "tempo"
  | "control"
  | "combo"
  | "big-units"
  | "equipment"
  | "xp"
  | "tokens"
  | "recursion";
export const BOT_VERSION = "battlefield-planner-2";
/** Initial measured/tunable limits, not claims of optimal strength. */
export const DIFFICULTIES = {
  beginner: {
    label: "Beginner",
    nodes: 180,
    milliseconds: 180,
    width: 5,
    depth: 1,
    samples: 1,
    replies: 1,
  },
  normal: {
    label: "Normal",
    nodes: 480,
    milliseconds: 400,
    width: 8,
    depth: 2,
    samples: 1,
    replies: 2,
  },
  hard: {
    label: "Hard",
    nodes: 1100,
    milliseconds: 750,
    width: 10,
    depth: 3,
    samples: 2,
    replies: 3,
  },
  expert: {
    label: "Expert",
    nodes: 2200,
    milliseconds: 1000,
    width: 14,
    depth: 4,
    samples: 3,
    replies: 4,
  },
} as const;
export interface CardStrategy {
  equipment: boolean;
  xp: boolean;
  tokens: boolean;
  recursion: boolean;
}
const strategies = new Map<string, Readonly<CardStrategy>>();
/** Printed rules and explicit scripts only; no live or hidden game state. */
export function cardStrategy(id: string): Readonly<CardStrategy> {
  const cached = strategies.get(id);
  if (cached) return cached;
  const card = getCard(id),
    script = getScript(id);
  const flattened: Effect[] = [];
  const collect = (effects: Effect[] = []) => {
    for (const effect of effects) {
      flattened.push(effect);
      collect(effect.effects);
    }
  };
  const hooks: (keyof CardScript)[] = [
    "spell",
    "onPlay",
    "onDeath",
    "onAttack",
    "onDefend",
    "onMove",
    "onHold",
    "onConquer",
    "onBegin",
    "onEnd",
    "onDiscard",
  ];
  for (const hook of hooks) collect(script?.[hook] as Effect[] | undefined);
  for (const ability of script?.abilities ?? []) collect(ability.effects);
  for (const mode of script?.spellModes ?? []) collect(mode.effects);
  for (const effects of Object.values(script?.equipment ?? {}))
    if (
      Array.isArray(effects) &&
      effects.some((value) => typeof value === "object")
    )
      collect(effects as Effect[]);
  const strategy = Object.freeze({
    equipment:
      card.type === "Gear" || /\bequip(?:ped|ment)?\b/i.test(card.text),
    xp:
      /\bXP\b|\bHunt\b|\bexperience\b/i.test(card.text) ||
      flattened.some((effect) => /(?:^|:)xp$/.test(effect.custom ?? "")),
    tokens:
      flattened.some((effect) => effect.type === "token") ||
      /create[^.]*token|token[^.]*create/i.test(card.text),
    recursion:
      flattened.some(
        (effect) =>
          effect.type === "retrieve" ||
          (effect.type === "playCard" && effect.play?.zone === "trash"),
      ) || /(?:play|return|retrieve)[^.]*\btrash\b/i.test(card.text),
  });
  strategies.set(id, strategy);
  return strategy;
}

/** Identity-blind profile inference from an unordered, legitimately known list. */
export function inferProfile(list: string[]): Profile {
  let cheap = 0,
    big = 0,
    removal = 0,
    synergy = 0,
    tricks = 0;
  const themes = { equipment: 0, xp: 0, tokens: 0, recursion: 0 };
  for (const id of list) {
    if (id === "unknown") continue;
    const c = getCard(id),
      sc = getScript(id);
    const strategy = cardStrategy(id);
    for (const key of Object.keys(themes) as (keyof typeof themes)[])
      if (strategy[key]) themes[key]++;
    if (c.type === "Unit") {
      if ((c.energy ?? 0) <= 3) cheap++;
      if ((c.energy ?? 0) >= 5) big++;
    }
    if (sc?.abilities?.length || sc?.onMove || sc?.onDiscard) synergy++;
    for (const e of sc?.spell ?? []) {
      if (
        [
          "damage",
          "kill",
          "stun",
          "recall",
          "bounce",
          "counter",
          "damageAll",
        ].includes(e.type)
      )
        removal++;
      if (["ready", "might", "buff", "keyword"].includes(e.type)) tricks++;
    }
  }
  const themed = (
    Object.entries(themes) as [keyof typeof themes, number][]
  ).sort((a, b) => b[1] - a[1])[0];
  // Density scales with larger imported decks; a small splash is not a profile.
  if (themed[1] >= Math.max(4, Math.ceil(list.length * 0.15))) return themed[0];
  return synergy > 9
    ? "combo"
    : removal > cheap
      ? "control"
      : big > cheap
        ? "big-units"
        : tricks > 5
          ? "tempo"
          : "aggressive";
}
export class SearchBudget {
  readonly started = performance.now();
  nodes = 0;
  generated = 0;
  exhausted = false;
  constructor(
    readonly maxNodes: number,
    readonly milliseconds: number,
    readonly deterministic = false,
  ) {}
  available() {
    return (
      this.nodes < this.maxNodes &&
      (this.deterministic ||
        performance.now() - this.started < this.milliseconds)
    );
  }
  take(generated = false) {
    if (!this.available()) {
      this.exhausted = true;
      return false;
    }
    this.nodes++;
    if (generated) this.generated++;
    return true;
  }
}
export function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function botRandom(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
