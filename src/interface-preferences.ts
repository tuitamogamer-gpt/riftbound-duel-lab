import { useSyncExternalStore } from "react";

export type InterfacePreferences = {
  reducedEffects: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  announcerEnabled: boolean;
  boardContrast: "standard" | "high";
};

export const INTERFACE_PREFERENCES_KEY = "riftbound-interface-v1";
const changed = "riftbound:interface-change";
const defaults: InterfacePreferences = {
  reducedEffects: false,
  soundEnabled: false,
  soundVolume: 0.55,
  announcerEnabled: true,
  boardContrast: "standard",
};
let cachedRaw: string | null | undefined;
let cached = defaults;
let inMemory: InterfacePreferences | undefined;

export function parseInterfacePreferences(
  raw: string | null,
): InterfacePreferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return defaults;
    const record = value as Record<string, unknown>;
    return {
      reducedEffects: record.reducedEffects === true,
      soundEnabled: record.soundEnabled === true,
      soundVolume:
        typeof record.soundVolume === "number" &&
        Number.isFinite(record.soundVolume)
          ? Math.max(0, Math.min(1, record.soundVolume))
          : defaults.soundVolume,
      announcerEnabled: record.announcerEnabled !== false,
      boardContrast: record.boardContrast === "high" ? "high" : "standard",
    };
  } catch {
    return defaults;
  }
}

function read() {
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(INTERFACE_PREFERENCES_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = parseInterfacePreferences(raw);
    }
    return cached;
  } catch {
    return cached;
  }
}

function subscribe(callback: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === INTERFACE_PREFERENCES_KEY || event.key === null) {
      inMemory = undefined;
      callback();
    }
  };
  window.addEventListener(changed, callback);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(changed, callback);
    window.removeEventListener("storage", sync);
  };
}

export function setInterfacePreferences(update: Partial<InterfacePreferences>) {
  const next = { ...read(), ...update };
  let saved = true;
  try {
    localStorage.setItem(INTERFACE_PREFERENCES_KEY, JSON.stringify(next));
    inMemory = undefined;
  } catch {
    inMemory = next;
    saved = false;
  }
  window.dispatchEvent(new Event(changed));
  return saved;
}

export function useInterfacePreferences() {
  return useSyncExternalStore(subscribe, read, () => defaults);
}
