import { inspectActionPayment, type PaymentResources } from "./engine";
import type { GameAction, GameState, Rune } from "./types";

export type PaymentRuneStatus = "retained" | "exhausted" | "recycled";
export interface PaymentRune {
  rune: Rune;
  status: PaymentRuneStatus;
  readyAfter: boolean;
}
export interface PaymentPool {
  key: keyof Omit<PaymentResources, "runes" | "typedPower"> | `typed:${string}`;
  before: number;
  after: number;
}
export interface PaymentPreview {
  energy: number;
  power: number;
  runes: PaymentRune[];
  retained: Rune[];
  pools: PaymentPool[];
}

/** A complete permutation is a preference, never permission to bypass payment. */
export function withPaymentRuneOrder(
  game: GameState,
  action: GameAction,
  order: string[] | null,
): GameAction {
  const { paymentRuneOrder: _previous, ...automatic } = action;
  if (!order) return automatic;
  const runes = game.players[action.player].runes;
  if (
    order.length !== runes.length ||
    new Set(order).size !== order.length ||
    !order.every((id) => runes.some((rune) => rune.id === id))
  )
    throw new Error("Invalid payment preference");
  return { ...automatic, paymentRuneOrder: [...order] };
}

/** Payment receipts are captured inside pay(), before subsequent effects.
 * Only the initial own payment is shown: a later effect's grant, draw, channel or
 * optional payment must not become a prediction available before committing.
 */
export function getPaymentPreview(
  game: GameState,
  action: GameAction,
): PaymentPreview | null {
  if (action.player !== 0) return null;
  try {
    const receipt = inspectActionPayment(game, action).find(
      (entry) => entry.player === action.player,
    );
    if (!receipt || (!receipt.energy && !receipt.power)) return null;
    const after = new Map(receipt.after.runes.map((rune) => [rune.id, rune]));
    const pools: PaymentPool[] = (
      [
        "energy",
        "power",
        "showdownEnergy",
        "unitEnergy",
        "spellEnergy",
        "spellPower",
        "gearPower",
      ] as const
    ).flatMap((key) =>
      receipt.before[key] !== receipt.after[key]
        ? [{ key, before: receipt.before[key], after: receipt.after[key] }]
        : [],
    );
    for (const domain of Object.keys(receipt.before.typedPower)) {
      const before = receipt.before.typedPower[domain] ?? 0;
      const remaining = receipt.after.typedPower[domain] ?? 0;
      if (before !== remaining)
        pools.push({ key: `typed:${domain}`, before, after: remaining });
    }
    return {
      energy: receipt.energy,
      power: receipt.power,
      runes: receipt.before.runes.map((rune) => ({
        rune,
        status: !after.has(rune.id)
          ? "recycled"
          : rune.ready && !after.get(rune.id)!.ready
            ? "exhausted"
            : "retained",
        readyAfter: after.get(rune.id)?.ready ?? false,
      })),
      retained: [...receipt.after.runes],
      pools,
    };
  } catch {
    // The interface can cancel a stale decision. Confirmation still calls the
    // authoritative engine and cannot commit an illegal rune preference.
    return null;
  }
}

export function shouldOfferPayment(
  game: GameState,
  action: GameAction,
): boolean {
  if (
    action.player !== 0 ||
    game.players[0].runes.length < 2 ||
    !["play", "ability", "move", "resource"].includes(action.category) ||
    action.id.startsWith("move-start:") ||
    action.id.startsWith("move-toggle:") ||
    action.id === "move-cancel"
  )
    return false;
  const preview = getPaymentPreview(game, action);
  return !!preview?.runes.some((entry) => entry.status !== "retained");
}
