import { beforeAll, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import {
  applyAction,
  applyActionStepped,
  createGame,
  getLegalActions,
} from "../src/game/engine";
import { parseSession, SAVE_KEY, type SavedSession } from "../src/persistence";
import {
  exportSessionText,
  importSessionText,
  MAX_SESSION_BACKUPS,
  MAX_SESSION_FILE_BYTES,
  readStoredSession,
  saveStoredSession,
  SESSION_BACKUP_KEY,
  sessionCompatibility,
  type SessionStorageCache,
} from "../src/session-storage";
import { useSessionStorage } from "../src/hooks/useSessionStorage";
import { SessionManager } from "../src/components/SessionManager";
import type { GameState } from "../src/game/types";

class MemoryStorage {
  values = new Map<string, string>();
  rejected = new Set<string>();
  reads = 0;
  writes: string[] = [];
  getItem(key: string) {
    this.reads++;
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.rejected.has(key)) throw new Error("QuotaExceededError");
    this.writes.push(key);
    this.values.set(key, value);
  }
}

let positions: GameState[];
beforeAll(() => {
  positions = [createGame({ seed: 4271 })];
  for (let index = 0; index < 6; index++) {
    const match = positions.at(-1)!;
    positions.push(
      applyAction(match, getLegalActions(match, match.priorityPlayer)[0]),
    );
  }
});
const session = (index = 0): SavedSession => ({
  match: structuredClone(positions[index]),
  review: null,
  paused: true,
});

describe("reliable device saves", () => {
  it("keeps the existing save key and parser-compatible payload", () => {
    const storage = new MemoryStorage();
    expect(saveStoredSession(session(), storage, 1000).status).toBe("saved");
    expect(parseSession(storage.getItem(SAVE_KEY))).toEqual(session());
    expect(readStoredSession(storage).source).toBe("current");
    expect(readStoredSession(storage).compatibility).toEqual({
      legacy: false,
      rulesChanged: false,
      catalogChanged: false,
    });
  });
  it("preserves the previous save when primary writing fails", () => {
    const storage = new MemoryStorage();
    saveStoredSession(session(), storage, 1000);
    const previous = storage.getItem(SAVE_KEY);
    storage.rejected.add(SAVE_KEY);
    const result = saveStoredSession(session(1), storage, 2000);
    expect(result.status).toBe("failed");
    expect(storage.getItem(SAVE_KEY)).toBe(previous);
    expect(storage.getItem(SESSION_BACKUP_KEY)).toBeNull();
  });
  it("reports backup failure separately after the current duel is saved", () => {
    const storage = new MemoryStorage();
    saveStoredSession(session(), storage, 1000);
    storage.rejected.add(SESSION_BACKUP_KEY);
    const result = saveStoredSession(session(1), storage, 2000);
    expect(result.status).toBe("saved");
    expect(result.backupFailed).toBe(true);
    expect(parseSession(storage.getItem(SAVE_KEY)).match).toEqual(positions[1]);
  });
  it("rotates only 3 prior action positions and preserves the latest current position", () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < positions.length; index++)
      saveStoredSession(session(index), storage, 1000 + index);
    const read = readStoredSession(storage);
    expect(read.backups).toHaveLength(MAX_SESSION_BACKUPS);
    expect(read.backups.map((item) => item.session.match?.revision)).toEqual([
      5, 4, 3,
    ]);
    expect(
      read.backups.every(
        (item) => item.session.review === null && item.session.paused === true,
      ),
    ).toBe(true);
    expect(read.session.match?.revision).toBe(6);
  });
  it("does not rotate recovery positions as review playback advances or pause changes", () => {
    const storage = new MemoryStorage();
    const before = positions[2];
    const action = getLegalActions(before, before.priorityPlayer)[0];
    const result = applyActionStepped(before, action);
    saveStoredSession({ match: before, review: null }, storage, 1000);
    const value: SavedSession = {
      match: result.state,
      review: {
        before,
        action,
        final: result.state,
        frames: result.frames,
        index: 0,
      },
    };
    saveStoredSession(value, storage, 2000);
    const backups = storage.getItem(SESSION_BACKUP_KEY);
    for (let index = 0; index < result.frames.length; index++)
      saveStoredSession(
        {
          ...value,
          paused: index % 2 === 0,
          review: { ...value.review!, index },
        },
        storage,
        3000 + index,
      );
    expect(storage.getItem(SESSION_BACKUP_KEY)).toBe(backups);
    expect(parseSession(storage.getItem(SAVE_KEY)).review?.index).toBe(
      result.frames.length - 1,
    );
  });
  it("recovers a damaged current save from the newest validated backup", () => {
    const storage = new MemoryStorage();
    saveStoredSession(session(), storage, 1000);
    saveStoredSession(session(1), storage, 2000);
    storage.setItem(SAVE_KEY, "{broken");
    const read = readStoredSession(storage);
    expect(read.source).toBe("backup");
    expect(read.damagedSave).toBe(true);
    expect(read.session).toEqual(session());
  });
  it("ignores corrupt snapshot records rather than exposing them to the renderer", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_BACKUP_KEY,
      JSON.stringify([
        { savedAt: 10, session: { match: { version: 2 } } },
        { savedAt: "today", session: session(1) },
        { savedAt: 20, session: session() },
      ]),
    );
    const read = readStoredSession(storage);
    expect(read.backups).toHaveLength(1);
    expect(read.session).toEqual(session());
  });
  it("can fall back to a backup if reading the primary key alone fails", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SESSION_BACKUP_KEY,
      JSON.stringify([{ savedAt: 20, session: session() }]),
    );
    const read = readStoredSession({
      setItem: storage.setItem.bind(storage),
      getItem: (key) => {
        if (key === SAVE_KEY) throw new Error("Denied");
        return storage.getItem(key);
      },
    });
    expect(read.source).toBe("backup");
    expect(read.status).toBe("unavailable");
    expect(read.session.match).toEqual(positions[0]);
  });
  it("keeps a single recovery position when browser quota cannot fit 3", () => {
    const storage = new MemoryStorage();
    const limited = {
      getItem: storage.getItem.bind(storage),
      setItem: (key: string, value: string) => {
        if (key === SESSION_BACKUP_KEY && JSON.parse(value).length > 1)
          throw new Error("QuotaExceededError");
        storage.setItem(key, value);
      },
    };
    for (let index = 0; index < 4; index++)
      expect(
        saveStoredSession(session(index), limited, 1000 + index).backupFailed,
      ).toBe(false);
    expect(readStoredSession(limited).backups).toHaveLength(1);
    expect(readStoredSession(limited).backups[0].session.match?.revision).toBe(
      2,
    );
  });
  it("does not read or revalidate stored backups for cached playback writes", () => {
    const storage = new MemoryStorage();
    const cache: SessionStorageCache = {
      session: { match: null, review: null },
      backups: [],
    };
    saveStoredSession(session(), storage, 1000, cache);
    saveStoredSession(session(1), storage, 2000, cache);
    for (let index = 0; index < 5; index++)
      saveStoredSession(session(1), storage, 3000 + index, cache);
    expect(storage.reads).toBe(0);
    expect(cache.backups).toHaveLength(1);
    expect(
      storage.writes.filter((key) => key === SESSION_BACKUP_KEY),
    ).toHaveLength(1);
  });
  it("retains current save when the lobby has no active match", () => {
    const storage = new MemoryStorage();
    saveStoredSession(session(), storage);
    const raw = storage.getItem(SAVE_KEY);
    expect(
      saveStoredSession({ match: null, review: null }, storage).status,
    ).toBe("empty");
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });
  it("handles missing storage during server rendering without throwing", () => {
    expect(readStoredSession().status).toBe("unavailable");
    expect(saveStoredSession(session()).status).toBe("unavailable");
    function Probe() {
      const value = session();
      const controller = useSessionStorage(value);
      return createElement(SessionManager, {
        session: value,
        controller,
        onRestore: () => {},
      });
    }
    expect(renderToString(createElement(Probe))).toContain(
      "Saving unavailable",
    );
  });
});

describe("portable validated duel files", () => {
  it("round-trips the exact current save and its pause state", () => {
    const exported = exportSessionText(session(2), 1000);
    expect(JSON.parse(exported).format).toBe("riftbound-duel-session");
    const imported = importSessionText(exported);
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.session).toEqual(session(2));
  });
  it("imports both existing wrappers and legacy raw GameState saves", () => {
    for (const raw of [
      JSON.stringify(session()),
      JSON.stringify(positions[0]),
    ]) {
      const result = importSessionText(raw);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.session.match).toEqual(positions[0]);
    }
  });
  it("preserves an exact valid pending review in export/import", () => {
    const before = positions[0];
    const action = getLegalActions(before, before.priorityPlayer)[0];
    const result = applyActionStepped(before, action);
    const value = {
      match: result.state,
      review: {
        before,
        action,
        final: result.state,
        frames: result.frames,
        index: 0,
      },
      paused: true,
    };
    const imported = importSessionText(exportSessionText(value));
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.session).toEqual(value);
  });
  it("rejects future export versions without touching a current save", () => {
    const storage = new MemoryStorage();
    saveStoredSession(session(), storage);
    const raw = storage.getItem(SAVE_KEY);
    const value = JSON.parse(exportSessionText(session(1)));
    value.version = 2;
    expect(importSessionText(JSON.stringify(value))).toEqual({
      ok: false,
      error: "version",
    });
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });
  it("rejects foreign formats, malformed state, unknown cards and invalid JSON", () => {
    const unknown = session();
    unknown.match!.players[0].hand[0] = "missing-card";
    for (const value of [
      "{",
      "null",
      '{"match":{"version":1}}',
      JSON.stringify(unknown),
      JSON.stringify({ format: "other-app", version: 1, session: session() }),
    ])
      expect(importSessionText(value)).toEqual({ ok: false, error: "invalid" });
  });
  it("bounds file size in bytes including multibyte text", () => {
    expect(importSessionText(" ".repeat(MAX_SESSION_FILE_BYTES + 1))).toEqual({
      ok: false,
      error: "too-large",
    });
    expect(
      importSessionText("ž".repeat(MAX_SESSION_FILE_BYTES / 2 + 1)),
    ).toEqual({ ok: false, error: "too-large" });
  });
  it("preserves a prior save when a new session exceeds the save limit", () => {
    const storage = new MemoryStorage();
    saveStoredSession(session(), storage);
    const raw = storage.getItem(SAVE_KEY);
    const oversized = session(1);
    oversized.match!.log.push({
      id: 100,
      turn: 0,
      kind: "info",
      text: "x".repeat(MAX_SESSION_FILE_BYTES),
    });
    expect(saveStoredSession(oversized, storage).status).toBe("failed");
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
  });
  it("flags resumable older rules and catalogs while accepting the validated state", () => {
    const value = session();
    value.match!.matchConfig!.rulesVersion = "older-rules";
    value.match!.matchConfig!.cardDataVersion = "older-catalog";
    const imported = importSessionText(JSON.stringify(value));
    expect(imported.ok).toBe(true);
    if (imported.ok)
      expect(imported.compatibility).toEqual({
        legacy: false,
        rulesChanged: true,
        catalogChanged: true,
      });
  });
  it("identifies older saves without a rules/catalog manifest", () => {
    const value = session();
    delete value.match!.matchConfig;
    expect(sessionCompatibility(value)).toEqual({
      legacy: true,
      rulesChanged: false,
      catalogChanged: false,
    });
    expect(importSessionText(JSON.stringify(value)).ok).toBe(true);
  });
  it("refuses to export empty or invalid data", () => {
    expect(() => exportSessionText({ match: null, review: null })).toThrow();
  });
  it("exports a large valid duel compactly when pretty formatting exceeds the file bound", () => {
    const value = session();
    value.match!.log = Array.from({ length: 20_000 }, (_, id) => ({
      id,
      turn: 0,
      kind: "info" as const,
      text: "Saved duel event",
    }));
    expect(JSON.stringify({ session: value }, null, 2).length).toBeGreaterThan(
      MAX_SESSION_FILE_BYTES,
    );
    const raw = exportSessionText(value);
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(
      MAX_SESSION_FILE_BYTES,
    );
    const result = importSessionText(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.match?.log).toHaveLength(20_000);
  });
});
