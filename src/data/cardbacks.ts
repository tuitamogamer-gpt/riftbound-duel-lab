import type { PlayerState } from "../game/types";
import { getSignatureSleeve } from "./sleeves";

/** Cosmetic identifiers are independent of any cards in a hidden zone. */
export const CARD_BACKS = [
  {
    key: "riftglass",
    name: "Riftglass",
    title: "The arcane collection",
    description: "A crystalline rift in obsidian and gold.",
    src: "/art/cardbacks/riftglass.webp",
    accent: "#64dcc8",
  },
  {
    key: "moonveil",
    name: "Moonveil",
    title: "The arcane collection",
    description: "Violet moonlight, held in a celestial seal.",
    src: "/art/cardbacks/moonveil.webp",
    accent: "#c5acf3",
  },
  {
    key: "sunforge",
    name: "Sunforge",
    title: "The arcane collection",
    description: "An amber ember at the heart of a golden sun.",
    src: "/art/cardbacks/sunforge.webp",
    accent: "#efb66c",
  },
] as const;

export type CardBackId = (typeof CARD_BACKS)[number]["key"] | "signature";
export type SleevePlayer = Pick<PlayerState, "championId" | "legendId">;

export const DEFAULT_CARD_BACK: CardBackId = "riftglass";
export const CARD_BACK_STORAGE_KEY = "riftbound-card-back-v1";

export function isCardBackId(value: unknown): value is CardBackId {
  return value === "signature" || CARD_BACKS.some((back) => back.key === value);
}

export function readCardBackPreference(
  storage?: Pick<Storage, "getItem">,
): CardBackId {
  try {
    const value = (storage ?? globalThis.localStorage).getItem(
      CARD_BACK_STORAGE_KEY,
    );
    return isCardBackId(value) ? value : DEFAULT_CARD_BACK;
  } catch {
    return DEFAULT_CARD_BACK;
  }
}

export function saveCardBackPreference(
  value: CardBackId,
  storage?: Pick<Storage, "setItem">,
): boolean {
  if (!isCardBackId(value)) return false;
  try {
    (storage ?? globalThis.localStorage).setItem(CARD_BACK_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function resolveCardBack(id: CardBackId, player?: SleevePlayer) {
  if (id === "signature") {
    return getSignatureSleeve(player ?? { championId: "", legendId: "" });
  }
  return CARD_BACKS.find((back) => back.key === id) ?? CARD_BACKS[0];
}
