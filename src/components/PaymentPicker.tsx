import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check, RotateCcw, X } from "lucide-react";
import { domainColors } from "../catalog";
import {
  getPaymentPreview,
  withPaymentRuneOrder,
  type PaymentPool,
} from "../game/payment-presentation";
import type { GameAction, GameState } from "../game/types";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useI18n } from "../i18n";
import "./PaymentPicker.css";

const poolLabels: Partial<Record<PaymentPool["key"], string>> = {
  energy: "Stored Energy",
  power: "Universal Power",
  showdownEnergy: "Showdown Energy",
  unitEnergy: "Unit Energy",
  spellEnergy: "Spell Energy",
  spellPower: "Spell Power",
  gearPower: "Gear Power",
};

export function PaymentPicker({
  game,
  action,
  onConfirm,
  onClose,
}: {
  game: GameState;
  action: GameAction;
  onConfirm: (action: GameAction) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialog = useDialogFocus(onClose);
  const [order, setOrder] = useState<string[] | null>(
    action.paymentRuneOrder ?? null,
  );
  const preferred = useMemo(
    () => withPaymentRuneOrder(game, action, order),
    [game, action, order],
  );
  const preview = useMemo(
    () => getPaymentPreview(game, preferred),
    [game, preferred],
  );
  const runes = game.players[0].runes;
  const chosen = order ?? runes.map((rune) => rune.id);
  const statuses = new Map(
    preview?.runes.map((entry) => [entry.rune.id, entry]),
  );
  const move = (index: number, direction: -1 | 1) => {
    const next = [...chosen];
    const other = index + direction;
    [next[index], next[other]] = [next[other], next[index]];
    setOrder(next);
  };
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop payment-picker-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="payment-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>{t("Confirm payment")}</span>
            <h2 id="payment-title">{t(action.label)}</h2>
          </div>
          <button onClick={onClose} aria-label={t("Cancel payment")}>
            <X size={20} />
          </button>
        </header>
        {preview ? (
          <>
            <div className="payment-cost" role="status" aria-live="polite">
              <strong>
                {t("{energy} Energy · {power} Power", {
                  energy: preview.energy,
                  power: preview.power,
                })}
              </strong>
              <span>{t("Payment preview")}</span>
            </div>
            <p className="payment-guidance">
              {t(
                "Recycled runes leave the table. Exhausted runes remain for Power.",
              )}
            </p>
            <div
              className="payment-mode"
              role="group"
              aria-label={t("Rune payment mode")}
            >
              <button aria-pressed={!order} onClick={() => setOrder(null)}>
                <RotateCcw size={15} /> {t("Automatic payment")}
              </button>
              <button
                aria-pressed={!!order}
                onClick={() => setOrder([...chosen])}
              >
                {t("Choose rune order")}
              </button>
            </div>
            {order && (
              <p className="payment-guidance">
                {t(
                  "Top runes pay Energy first. Power uses exhausted runes first and respects required domains.",
                )}
              </p>
            )}
            <ol className="payment-runes">
              {chosen.map((id, index) => {
                const rune = runes.find((entry) => entry.id === id)!;
                const entry = statuses.get(id);
                const status = entry?.status ?? "retained";
                const label = t("{domain} rune {number}", {
                  domain: t(rune.domain),
                  number: index + 1,
                });
                return (
                  <li
                    key={id}
                    data-payment-rune={id}
                    data-payment-status={status}
                  >
                    <i
                      className="payment-rune-domain"
                      style={{ background: domainColors[rune.domain] }}
                      aria-hidden="true"
                    />
                    <div className="payment-rune-copy">
                      <strong>{t(rune.domain)}</strong>
                      <small>
                        {t(
                          status === "recycled"
                            ? "Recycle for Power"
                            : status === "exhausted"
                              ? "Exhaust for Energy"
                              : entry?.readyAfter
                                ? "Keep ready"
                                : "Keep exhausted",
                        )}
                      </small>
                    </div>
                    {order ? (
                      <div className="payment-rune-order">
                        <button
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          aria-label={t("Pay {rune} earlier", { rune: label })}
                        >
                          <ArrowUp size={17} />
                        </button>
                        <button
                          disabled={index + 1 === chosen.length}
                          onClick={() => move(index, 1)}
                          aria-label={t("Pay {rune} later", { rune: label })}
                        >
                          <ArrowDown size={17} />
                        </button>
                      </div>
                    ) : (
                      <span className="payment-rune-result">
                        {t(
                          status === "retained"
                            ? "Keep"
                            : status === "recycled"
                              ? "Recycle"
                              : "Exhaust",
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {!!preview.pools.length && (
              <dl className="payment-pools">
                {preview.pools.map((pool) => (
                  <div key={pool.key}>
                    <dt>
                      {pool.key.startsWith("typed:")
                        ? t("{domain} Power", { domain: t(pool.key.slice(6)) })
                        : t(poolLabels[pool.key] ?? pool.key)}
                    </dt>
                    <dd>
                      {pool.before} → {pool.after}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        ) : (
          <p role="alert">
            {t(
              "This payment is no longer available. Return to the table and choose a move.",
            )}
          </p>
        )}
        <footer>
          <button className="payment-cancel" onClick={onClose}>
            {t("Back to table")}
          </button>
          <button
            className="payment-confirm"
            disabled={!preview}
            onClick={() => onConfirm(preferred)}
          >
            <Check size={17} /> {t("Pay and confirm")}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
