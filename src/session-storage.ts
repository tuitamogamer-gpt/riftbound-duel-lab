import { catalogMeta } from "./data/cards";
import { parseSession, SAVE_KEY, type SavedSession } from "./persistence";

export const SESSION_BACKUP_KEY = "riftbound-duel-backups-v1";
export const MAX_SESSION_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SESSION_BACKUPS = 3;
export const CURRENT_SESSION_RULES = "core-2026-07-16+vendetta-faq-2026-08-14";
const EXPORT_FORMAT = "riftbound-duel-session";
const EXPORT_VERSION = 1;
const emptySession = (): SavedSession => ({ match: null, review: null });

export type SessionStorage = Pick<Storage, "getItem" | "setItem">;
export type SaveStatus = "empty" | "saved" | "failed" | "unavailable";
export interface SessionCompatibility {
  legacy: boolean;
  rulesChanged: boolean;
  catalogChanged: boolean;
}
export interface SessionSnapshot {
  id: string;
  savedAt: number;
  session: SavedSession;
}
export interface StoredSessionRead {
  session: SavedSession;
  source: "current" | "backup" | "empty";
  status: SaveStatus;
  backups: SessionSnapshot[];
  compatibility: SessionCompatibility;
  damagedSave: boolean;
}
export interface SaveSessionResult {
  status: SaveStatus;
  savedAt?: number;
  backupFailed: boolean;
  backups: SessionSnapshot[];
}
/** The hook retains parsed data so playback frames never revalidate every backup. */
export interface SessionStorageCache {
  session: SavedSession;
  backups: SessionSnapshot[];
}
export type ImportSessionResult =
  | {
      ok: true;
      session: SavedSession;
      compatibility: SessionCompatibility;
    }
  | { ok: false; error: "too-large" | "invalid" | "version" };

export function browserSessionStorage(): SessionStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function sessionCompatibility(
  session: SavedSession,
): SessionCompatibility {
  const config = session.match?.matchConfig;
  return {
    legacy: Boolean(session.match && !config),
    rulesChanged: Boolean(
      config && config.rulesVersion !== CURRENT_SESSION_RULES,
    ),
    catalogChanged: Boolean(
      config && config.cardDataVersion !== catalogMeta.cardDataSha256,
    ),
  };
}

const fitsLimit = (raw: string) =>
  raw.length <= MAX_SESSION_FILE_BYTES &&
  new TextEncoder().encode(raw).byteLength <= MAX_SESSION_FILE_BYTES;

/** Reviews can be large; recovery retains the previous actionable position. */
function recoverySession(session: SavedSession): SavedSession {
  return { match: session.match, review: null, paused: true };
}

function boundary(session: SavedSession): string {
  const match = session.match;
  if (!match) return "empty";
  if (match.revision !== undefined) return `${match.seed}:${match.revision}`;
  let hash = 2166136261;
  for (const char of JSON.stringify(match))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${match.seed}:legacy:${hash >>> 0}`;
}

function readBackups(storage: SessionStorage): SessionSnapshot[] {
  try {
    const raw = storage.getItem(SESSION_BACKUP_KEY);
    if (!raw || !fitsLimit(raw)) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.slice(0, MAX_SESSION_BACKUPS).flatMap((value: unknown) => {
      if (
        !value ||
        typeof value !== "object" ||
        !("savedAt" in value) ||
        typeof value.savedAt !== "number" ||
        !Number.isFinite(value.savedAt) ||
        value.savedAt < 0 ||
        !("session" in value)
      )
        return [];
      const session = parseSession(JSON.stringify(value.session));
      return session.match
        ? [
            {
              id: `${boundary(session)}:${value.savedAt}`,
              savedAt: value.savedAt,
              session: recoverySession(session),
            },
          ]
        : [];
    });
  } catch {
    return [];
  }
}

/** A corrupt primary save never hides a valid recovery position. */
export function readStoredSession(
  storage = browserSessionStorage(),
): StoredSessionRead {
  const empty: StoredSessionRead = {
    session: emptySession(),
    source: "empty",
    status: storage ? "empty" : "unavailable",
    backups: [],
    compatibility: sessionCompatibility(emptySession()),
    damagedSave: false,
  };
  if (!storage) return empty;
  const backups = readBackups(storage);
  try {
    const raw = storage.getItem(SAVE_KEY);
    const session = raw && fitsLimit(raw) ? parseSession(raw) : emptySession();
    if (session.match)
      return {
        session,
        source: "current",
        status: "saved",
        backups,
        compatibility: sessionCompatibility(session),
        damagedSave: false,
      };
    if (backups[0])
      return {
        session: backups[0].session,
        source: "backup",
        status: "saved",
        backups,
        compatibility: sessionCompatibility(backups[0].session),
        damagedSave: Boolean(raw),
      };
    return { ...empty, backups, damagedSave: Boolean(raw) };
  } catch {
    return backups[0]
      ? {
          session: backups[0].session,
          source: "backup",
          status: "unavailable",
          backups,
          compatibility: sessionCompatibility(backups[0].session),
          damagedSave: true,
        }
      : { ...empty, status: "unavailable", backups };
  }
}

/** setItem is atomic: failed writes leave the last primary save intact. */
export function saveStoredSession(
  session: SavedSession,
  storage = browserSessionStorage(),
  now = Date.now(),
  cache?: SessionStorageCache,
): SaveSessionResult {
  if (!storage)
    return { status: "unavailable", backupFailed: false, backups: [] };
  const backups = cache?.backups ?? readBackups(storage);
  if (!session.match) return { status: "empty", backupFailed: false, backups };
  let previous: SavedSession;
  try {
    const raw = JSON.stringify(session);
    if (!fitsLimit(raw))
      return { status: "failed", backupFailed: false, backups };
    if (cache) previous = cache.session;
    else {
      const old = storage.getItem(SAVE_KEY);
      previous = old && fitsLimit(old) ? parseSession(old) : emptySession();
    }
    // Store the original compatible wrapper, not an export envelope.
    storage.setItem(SAVE_KEY, raw);
    if (cache) cache.session = session;
  } catch {
    return { status: "failed", backupFailed: false, backups };
  }
  if (!previous.match || boundary(previous) === boundary(session))
    return { status: "saved", savedAt: now, backupFailed: false, backups };
  const snapshot: SessionSnapshot = {
    id: `${boundary(previous)}:${now}`,
    savedAt: now,
    session: recoverySession(previous),
  };
  const next = [
    snapshot,
    ...backups.filter((item) => boundary(item.session) !== boundary(previous)),
  ].slice(0, MAX_SESSION_BACKUPS);
  // Bound aggregate storage and discard older snapshots before giving up.
  while (next.length) {
    const raw = JSON.stringify(next);
    if (fitsLimit(raw)) {
      try {
        storage.setItem(SESSION_BACKUP_KEY, raw);
        if (cache) cache.backups = next;
        return {
          status: "saved",
          savedAt: now,
          backupFailed: false,
          backups: next,
        };
      } catch {
        // A nearly full browser can still fit a single compact recovery state.
      }
    }
    next.pop();
  }
  return { status: "saved", savedAt: now, backupFailed: true, backups };
}

export function importSessionText(raw: string): ImportSessionResult {
  if (!fitsLimit(raw)) return { ok: false, error: "too-large" };
  try {
    const value: unknown = JSON.parse(raw);
    let payload = raw;
    if (value && typeof value === "object" && "format" in value) {
      if (value.format !== EXPORT_FORMAT)
        return { ok: false, error: "invalid" };
      if (!("version" in value) || value.version !== EXPORT_VERSION)
        return { ok: false, error: "version" };
      if (!("session" in value)) return { ok: false, error: "invalid" };
      payload = JSON.stringify(value.session);
    }
    const session = parseSession(payload);
    if (!session.match) return { ok: false, error: "invalid" };
    return { ok: true, session, compatibility: sessionCompatibility(session) };
  } catch {
    return { ok: false, error: "invalid" };
  }
}

export function exportSessionText(
  session: SavedSession,
  now = Date.now(),
): string {
  const parsed = parseSession(JSON.stringify(session));
  if (!parsed.match) throw new Error("A valid duel is required for export.");
  const envelope = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    session: parsed,
  };
  const pretty = JSON.stringify(envelope, null, 2);
  // Large reviews remain portable when indentation alone exceeds the bound.
  const raw = fitsLimit(pretty) ? pretty : JSON.stringify(envelope);
  if (!fitsLimit(raw))
    throw new Error("The duel exceeds the export size limit.");
  return raw;
}
