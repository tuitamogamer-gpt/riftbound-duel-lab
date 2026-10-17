import { useSyncExternalStore } from "react";
import {
  CARD_BACK_STORAGE_KEY,
  DEFAULT_CARD_BACK,
  isCardBackId,
  readCardBackPreference,
  resolveCardBack,
  saveCardBackPreference,
  type CardBackId,
  type SleevePlayer,
} from "../data/cardbacks";

let current: CardBackId | undefined;
let hasUnsavedSelection = false;
const listeners = new Set<() => void>();

function snapshot(): CardBackId {
  return (current ??= readCardBackPreference());
}

function notify() {
  for (const listener of listeners) listener();
}

function syncStorage(event: StorageEvent) {
  if (event.key !== CARD_BACK_STORAGE_KEY && event.key !== null) return;
  current = readCardBackPreference();
  hasUnsavedSelection = false;
  notify();
}

function subscribe(listener: () => void) {
  if (!listeners.size && typeof window !== "undefined") {
    // The picker can be closed while another tab changes the preference.
    // Preserve an in-memory selection if browser storage rejected its write.
    if (!hasUnsavedSelection) current = readCardBackPreference();
    window.addEventListener("storage", syncStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && typeof window !== "undefined") {
      window.removeEventListener("storage", syncStorage);
    }
  };
}

export function selectCardBack(next: CardBackId) {
  if (!isCardBackId(next)) return;
  // Selection remains usable when private browsing blocks persistent storage.
  current = next;
  hasUnsavedSelection = !saveCardBackPreference(next);
  notify();
}

export function useCardBackPreference() {
  const selected = useSyncExternalStore(
    subscribe,
    snapshot,
    () => DEFAULT_CARD_BACK,
  );
  return [selected, selectCardBack] as const;
}

export function useCardSleeve(player?: SleevePlayer) {
  const [selected] = useCardBackPreference();
  return resolveCardBack(selected, player);
}
