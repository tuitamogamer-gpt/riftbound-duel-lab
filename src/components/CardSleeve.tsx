import type { PlayerState } from "../game/types";
import { useCardSleeve } from "./cardback-preference";

/** Only a local cosmetic choice and public setup identity determine the back. */
export function CardSleeve({
  player,
}: {
  player: Pick<PlayerState, "championId" | "legendId">;
}) {
  const sleeve = useCardSleeve(player);
  return (
    <img
      className="signature-sleeve"
      src={sleeve.src}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={744}
      height={1039}
      decoding="async"
      data-sleeve={sleeve.key}
      onError={(event) => {
        const image = event.currentTarget;
        if (!image.src.endsWith("/art/sleeves/riftbound.svg")) {
          image.src = "/art/sleeves/riftbound.svg";
        }
      }}
    />
  );
}
