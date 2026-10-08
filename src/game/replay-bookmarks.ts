export const REPLAY_BOOKMARKS_KEY = "riftbound-replay-bookmarks-v1";
export const MAX_BOOKMARK_MATCHES = 20;
export const MAX_MATCH_BOOKMARKS = 10;
// Covers 200 records even when every note code unit needs six-byte JSON escaping.
const MAX_BOOKMARK_BYTES = 256 * 1024;
const matchIdPattern = /^match-[a-f\d]+-[a-f\d]+-\d+$/;
type BookmarkStorage = Pick<Storage, "getItem" | "setItem">;
class BookmarkValidationError extends Error {}

export interface ReplayBookmark {
  matchId: string;
  frameIndex: number;
  note: string;
}
export interface BookmarkResult {
  bookmarks: ReplayBookmark[];
  saved?: boolean;
  error?: string;
}

function read(storage: Pick<Storage, "getItem">): ReplayBookmark[] {
  const raw = storage.getItem(REPLAY_BOOKMARKS_KEY);
  if (!raw) return [];
  if (new TextEncoder().encode(raw).length > MAX_BOOKMARK_BYTES)
    throw new Error();
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("bookmarks" in value) ||
    !Array.isArray(value.bookmarks) ||
    value.bookmarks.length > MAX_BOOKMARK_MATCHES * MAX_MATCH_BOOKMARKS
  )
    throw new Error();
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  return value.bookmarks.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("matchId" in entry) ||
      typeof entry.matchId !== "string" ||
      !matchIdPattern.test(entry.matchId) ||
      entry.matchId.length > 120 ||
      !("frameIndex" in entry) ||
      !Number.isSafeInteger(entry.frameIndex) ||
      (entry.frameIndex as number) < 0 ||
      (entry.frameIndex as number) > 100000 ||
      !("note" in entry) ||
      typeof entry.note !== "string" ||
      entry.note.length > 160
    )
      throw new Error();
    const key = `${entry.matchId}:${entry.frameIndex}`;
    if (seen.has(key)) throw new Error();
    seen.add(key);
    const count = (counts.get(entry.matchId) ?? 0) + 1;
    if (count > MAX_MATCH_BOOKMARKS) throw new Error();
    counts.set(entry.matchId, count);
    if (counts.size > MAX_BOOKMARK_MATCHES) throw new Error();
    return {
      matchId: entry.matchId,
      frameIndex: entry.frameIndex as number,
      note: entry.note,
    };
  });
}

export function readReplayBookmarks(
  storage?: Pick<Storage, "getItem">,
): BookmarkResult {
  try {
    return { bookmarks: read(storage ?? globalThis.localStorage) };
  } catch {
    return {
      bookmarks: [],
      error: "Saved bookmarks could not be read. Their stored data was kept.",
    };
  }
}

function change(
  update: (bookmarks: ReplayBookmark[]) => ReplayBookmark[],
  storage?: BookmarkStorage,
): BookmarkResult {
  try {
    const target = storage ?? globalThis.localStorage;
    const previous = read(target);
    const bookmarks = update(previous);
    if (JSON.stringify(bookmarks) === JSON.stringify(previous))
      return { saved: true, bookmarks };
    target.setItem(
      REPLAY_BOOKMARKS_KEY,
      JSON.stringify({ version: 1, bookmarks }),
    );
    return { saved: true, bookmarks };
  } catch (cause) {
    return {
      saved: false,
      bookmarks: readReplayBookmarks(storage).bookmarks,
      error:
        cause instanceof BookmarkValidationError
          ? cause.message
          : "Bookmarks could not be saved. Previous bookmarks were kept.",
    };
  }
}

export function saveReplayBookmark(
  matchId: string,
  frameIndex: number,
  frameCount: number,
  note: string,
  storage?: BookmarkStorage,
): BookmarkResult {
  return change((previous) => {
    if (
      !matchIdPattern.test(matchId) ||
      matchId.length > 120 ||
      !Number.isSafeInteger(frameCount) ||
      frameCount < 1 ||
      frameCount > 100001 ||
      !Number.isSafeInteger(frameIndex) ||
      frameIndex < 0 ||
      frameIndex >= frameCount ||
      typeof note !== "string" ||
      note.length > 160
    )
      throw new BookmarkValidationError("This replay bookmark is invalid.");
    const current = previous.filter((bookmark) => bookmark.matchId === matchId);
    const exists = current.some(
      (bookmark) => bookmark.frameIndex === frameIndex,
    );
    if (!exists && current.length >= MAX_MATCH_BOOKMARKS)
      throw new BookmarkValidationError(
        "This replay already has 10 bookmarks. Remove one before adding another.",
      );
    const matches = new Set(previous.map((bookmark) => bookmark.matchId));
    if (!matches.has(matchId) && matches.size >= MAX_BOOKMARK_MATCHES)
      throw new BookmarkValidationError(
        "Bookmarks already cover 20 matches. Remove an older bookmark first.",
      );
    return [
      ...previous.filter(
        (bookmark) =>
          bookmark.matchId !== matchId || bookmark.frameIndex !== frameIndex,
      ),
      { matchId, frameIndex, note: note.trim() },
    ];
  }, storage);
}

export function deleteReplayBookmark(
  matchId: string,
  frameIndex: number,
  storage?: BookmarkStorage,
): BookmarkResult {
  return change(
    (bookmarks) =>
      bookmarks.filter(
        (bookmark) =>
          bookmark.matchId !== matchId || bookmark.frameIndex !== frameIndex,
      ),
    storage,
  );
}

export function removeMatchBookmarks(
  matchId: string,
  storage?: BookmarkStorage,
): BookmarkResult {
  return change(
    (bookmarks) => bookmarks.filter((bookmark) => bookmark.matchId !== matchId),
    storage,
  );
}

/** An evicted replay cannot be opened; remove its notes only after a valid archive load. */
export function retainArchivedBookmarks(
  matchIds: string[],
  storage?: BookmarkStorage,
): BookmarkResult {
  const known = new Set(matchIds);
  return change(
    (bookmarks) => bookmarks.filter((bookmark) => known.has(bookmark.matchId)),
    storage,
  );
}

/** Called only after an explicit successful clear-history action. */
export function clearReplayBookmarks(
  storage?: Pick<Storage, "setItem">,
): BookmarkResult {
  try {
    (storage ?? globalThis.localStorage).setItem(
      REPLAY_BOOKMARKS_KEY,
      JSON.stringify({ version: 1, bookmarks: [] }),
    );
    return { saved: true, bookmarks: [] };
  } catch {
    return {
      saved: false,
      bookmarks: [],
      error: "Bookmarks could not be saved. Previous bookmarks were kept.",
    };
  }
}
