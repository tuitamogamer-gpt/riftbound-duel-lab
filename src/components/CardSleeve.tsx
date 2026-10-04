import { getSignatureSleeve } from "../data/sleeves";
import type { PlayerState } from "../game/types";

/** Resolve only public setup identity, never the face-down card's identity. */
export function CardSleeve({
  player,
}: {
  player: Pick<PlayerState, "championId" | "legendId">;
}) {
  const sleeve = getSignatureSleeve(player);
  return (
    <img
      className="signature-sleeve"
      src={sleeve.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      data-sleeve={sleeve.key}
    />
  );
}
