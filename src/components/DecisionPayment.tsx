import { useMemo } from "react";
import {
  getPaymentPreview,
  paymentPoolLabel,
} from "../game/payment-presentation";
import type { GameAction, GameState } from "../game/types";
import { useI18n } from "../i18n";

/** Only the receipt at payment time is shown, never the outcome of the effect. */
export function DecisionPayment({
  game,
  action,
}: {
  game: GameState;
  action: GameAction;
}) {
  const { t } = useI18n();
  const preview = useMemo(
    () =>
      ["play", "ability", "move", "resource"].includes(action.category) &&
      !action.id.startsWith("move-start:") &&
      !action.id.startsWith("move-toggle:")
        ? getPaymentPreview(game, action)
        : null,
    [game, action],
  );
  if (!preview) return null;
  const exhausted = preview.runes.filter(
    (rune) => rune.status === "exhausted",
  ).length;
  const recycled = preview.runes.filter(
    (rune) => rune.status === "recycled",
  ).length;
  const details = [
    t("{exhausted} runes exhausted · {recycled} recycled", {
      exhausted,
      recycled,
    }),
    ...preview.pools.map(
      (pool) =>
        `${pool.key.startsWith("typed:") ? t("{domain} Power", { domain: t(pool.key.slice(6)) }) : t(paymentPoolLabel(pool.key))}: ${pool.before} → ${pool.after}`,
    ),
  ].join(" · ");
  return (
    <span className="decision-payment" title={details}>
      <span className="decision-payment-cost">
        {t("Pay {energy} Energy · {power} Power", {
          energy: preview.energy,
          power: preview.power,
        })}
      </span>
      <span>
        {t("After payment: {ready} ready / {total} runes", {
          ready: preview.retained.filter((rune) => rune.ready).length,
          total: preview.retained.length,
        })}
      </span>
      {preview.pools.map((pool) => (
        <span className="decision-payment-pool" key={pool.key}>
          {pool.key.startsWith("typed:")
            ? t("{domain} Power", { domain: t(pool.key.slice(6)) })
            : t(paymentPoolLabel(pool.key))}
          : {pool.before} → {pool.after}
        </span>
      ))}
    </span>
  );
}
