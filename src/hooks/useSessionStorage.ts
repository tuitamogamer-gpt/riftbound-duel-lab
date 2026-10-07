import { useCallback, useEffect, useRef, useState } from "react";
import type { SavedSession } from "../persistence";
import {
  browserSessionStorage,
  readStoredSession,
  saveStoredSession,
  sessionCompatibility,
  type SaveSessionResult,
  type SessionStorage,
  type SessionStorageCache,
  type StoredSessionRead,
} from "../session-storage";

export interface SessionStorageOptions {
  initialRead?: StoredSessionRead;
  storage?: SessionStorage;
}

export function useSessionStorage(
  session: SavedSession,
  options: SessionStorageOptions = {},
) {
  const storage = useRef(options.storage ?? browserSessionStorage());
  const [initial] = useState(
    () => options.initialRead ?? readStoredSession(storage.current),
  );
  const [save, setSave] = useState<SaveSessionResult>(() => ({
    status: initial.status,
    backupFailed: false,
    backups: initial.backups,
  }));
  const cache = useRef<SessionStorageCache>({
    session: initial.session,
    backups: initial.backups,
  });
  const latest = useRef(session);
  latest.current = session;
  const retry = useCallback(() => {
    const next = saveStoredSession(
      latest.current,
      storage.current,
      Date.now(),
      cache.current,
    );
    setSave(next);
    return next;
  }, []);
  useEffect(() => {
    // Leaving the table keeps the last duel available from the lobby.
    if (session.match) retry();
  }, [session.match, session.review, session.paused, retry]);
  return {
    ...save,
    initialRead: initial,
    compatibility: sessionCompatibility(
      session.match ? session : initial.session,
    ),
    retry,
  };
}

export type SessionStorageController = ReturnType<typeof useSessionStorage>;
