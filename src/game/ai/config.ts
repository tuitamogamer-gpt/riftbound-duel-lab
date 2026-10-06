import { getCard } from "../../data/cards";
import { getScript } from "../scripts";

export type Difficulty = "beginner" | "normal" | "hard" | "expert";
export type Profile =
  "aggressive" | "tempo" | "control" | "combo" | "big-units";
export const BOT_VERSION = "battlefield-planner-1";
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
export function inferProfile(list: string[]): Profile {
  let cheap = 0,
    big = 0,
    removal = 0,
    synergy = 0,
    tricks = 0;
  for (const id of list) {
    const c = getCard(id),
      sc = getScript(id);
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
