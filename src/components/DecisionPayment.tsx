import type { CSSProperties } from "react";
import { Gem, Zap } from "lucide-react";
import { domainColors } from "../catalog";
import {
  getPaymentPreview,
  paymentPoolLabel,
  type PaymentPreview,
} from "../game/payment-presentation";
import type { GameAction, GameState } from "../game/types";
import { useI18n } from "../i18n";

const previews = new WeakMap<GameState, Map<string, PaymentPreview | null>>();

/** The receipt of an action in a game state; computed once per state. */
function paymentPreviewFor(game: GameState, action: GameAction) {
  let known = previews.get(game);
  if (!known) previews.set(game, (known = new Map()));
  if (!known.has(action.id))
    known.set(
      action.id,
      ["play", "ability", "move", "resource"].includes(action.category) &&
        !action.id.startsWith("move-start:") &&
        !action.id.startsWith("move-toggle:")
        ? getPaymentPreview(game, action)
        : null,
    );
  return known.get(action.id) ?? null;
}

/**
 * Identifies everything a receipt shows. Options whose receipts are equal can
 * show the receipt once instead of repeating it in every option.
 */
export function paymentSignature(game: GameState, action: GameAction) {
  const preview = paymentPreviewFor(game, action);
  return preview
    ? JSON.stringify([
        preview.energy,
        preview.power,
        preview.runes.map((rune) => rune.status),
        preview.retained.map((rune) => rune.ready),
        preview.pools,
      ])
    : null;
}

/** What an action's receipt charges, or null when it has no receipt. */
export function paymentCost(game: GameState, action: GameAction) {
  const preview = paymentPreviewFor(game, action);
  return preview ? { energy: preview.energy, power: preview.power } : null;
}

/**
 * A cost as chips: the same lightning bolt and diamond that the cards carry.
 * Decorative; the sentence beside it is what assistive technology reads.
 */
export function CostChips({
  energy,
  power,
  caption,
  showZero = false,
}: {
  energy: number | null;
  power: number | null;
  caption?: string;
  /** Zero is left out; "energy" keeps a single ⚡0 for a cost of nothing. */
  showZero?: false | "energy";
}) {
  return (
    <span className="payment-chips is-cost" aria-hidden="true">
      {caption && <span className="payment-caption">{caption}</span>}
      {energy !== null && (energy > 0 || showZero === "energy") && (
        <span className="payment-chip is-energy">
          <Zap size={11} />
          {energy}
        </span>
      )}
      {power !== null && power > 0 && (
        <span className="payment-chip is-power">
          <i>◈</i>
          {power}
        </span>
      )}
    </span>
  );
}

/**
 * Only the receipt at payment time is shown, never the outcome of the effect.
 * It is drawn as chips (what is paid, then what is left); each chip group has
 * its sentence beside it as text that is read but not drawn.
 */
export function DecisionPayment({
  game,
  action,
}: {
  game: GameState;
  action: GameAction;
}) {
  const { t } = useI18n();
  const preview = paymentPreviewFor(game, action);
  if (!preview) return null;
  const exhausted = preview.runes.filter(
    (rune) => rune.status === "exhausted",
  ).length;
  const recycled = preview.runes.filter(
    (rune) => rune.status === "recycled",
  ).length;
  const poolName = (key: string) =>
    key.startsWith("typed:")
      ? t("{domain} Power", { domain: t(key.slice(6)) })
      : t(paymentPoolLabel(key as never));
  const details = [
    t("{exhausted} runes exhausted · {recycled} recycled", {
      exhausted,
      recycled,
    }),
    ...preview.pools.map(
      (pool) => `${poolName(pool.key)}: ${pool.before} → ${pool.after}`,
    ),
  ].join(" · ");
  const ready = preview.retained.filter((rune) => rune.ready).length;
  return (
    <span className="decision-payment" title={details}>
      <span className="decision-payment-cost">
        <span className="read-text">
          {t("Pay {energy} Energy · {power} Power", {
            energy: preview.energy,
            power: preview.power,
          })}
        </span>
        <CostChips
          energy={preview.energy}
          power={preview.power}
          caption={t("Pay")}
        />
      </span>
      <span className="decision-payment-after">
        <span className="read-text">
          {t("After payment: {ready} ready / {total} runes", {
            ready,
            total: preview.retained.length,
          })}
        </span>
        <span className="payment-chips is-left" aria-hidden="true">
          <span className="payment-caption">{t("Left")}</span>
          <span className="payment-chip is-runes">
            <Gem size={11} />
            {ready}/{preview.retained.length}
          </span>
          {preview.pools.map((pool) => (
            <span
              className={`payment-chip ${pool.key.endsWith("nergy") ? "is-energy" : "is-power"}`}
              data-pool={pool.key}
              style={
                pool.key.startsWith("typed:")
                  ? ({
                      "--chip-color": domainColors[pool.key.slice(6)],
                    } as CSSProperties)
                  : undefined
              }
              key={pool.key}
            >
              {pool.key.endsWith("nergy") ? <Zap size={11} /> : <i>◈</i>}
              {!["energy", "power"].includes(pool.key) && (
                <small>{poolName(pool.key)}</small>
              )}
              {pool.after}
            </span>
          ))}
        </span>
      </span>
      {preview.pools.map((pool) => (
        <span className="decision-payment-pool read-text" key={pool.key}>
          {poolName(pool.key)}: {pool.before} → {pool.after}
        </span>
      ))}
    </span>
  );
}
