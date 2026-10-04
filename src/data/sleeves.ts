import { findCard } from "../catalog";
import type { PlayerState } from "../game/types";
import signatures from "./signature-sleeves.json";

export function getSignatureSleeve(
  player: Pick<PlayerState, "championId" | "legendId">,
) {
  const champion = findCard(player.championId) ?? findCard(player.legendId);
  const name = champion?.name.split(/\s[-–—]\s|,\s*/)[0] ?? "Riftbound";
  const key = name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, "-");
  const signature = Object.hasOwn(signatures, key)
    ? signatures[key as keyof typeof signatures]
    : undefined;
  return {
    key: signature ? key : "riftbound",
    name,
    title: signature?.title ?? "DUEL LAB",
    src: `/art/sleeves/${signature ? key : "riftbound"}.svg`,
  };
}
