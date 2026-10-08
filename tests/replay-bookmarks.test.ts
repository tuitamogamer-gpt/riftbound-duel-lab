import { describe, expect, it } from "vitest";
import {
  clearReplayBookmarks,
  deleteReplayBookmark,
  readReplayBookmarks,
  REPLAY_BOOKMARKS_KEY,
  removeMatchBookmarks,
  retainArchivedBookmarks,
  saveReplayBookmark,
} from "../src/game/replay-bookmarks";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
const id = (index = 1) => `match-a-${index.toString(16)}-5`;

describe("bounded replay bookmarks", () => {
  it.each([
    ["CJK", "界".repeat(160)],
    ["control", "\u0000".repeat(160)],
    ["emoji", "🃏".repeat(80)],
    ["unpaired surrogate", "\ud800".repeat(160)],
  ])("roundtrips maximum legal capacity with %s notes", (_kind, note) => {
    const target = storage();
    for (let match = 1; match <= 20; match++) {
      const hex = match.toString(16);
      const matchId = `match-${"a".repeat(106 - hex.length)}-${hex}-100000`;
      expect(matchId).toHaveLength(120);
      for (let frame = 0; frame < 10; frame++)
        expect(
          saveReplayBookmark(matchId, 100000 - frame, 100001, note, target)
            .saved,
        ).toBe(true);
    }
    const loaded = readReplayBookmarks(target);
    expect(loaded.error).toBeUndefined();
    expect(loaded.bookmarks).toHaveLength(200);
    expect(loaded.bookmarks.every((bookmark) => bookmark.note === note)).toBe(
      true,
    );
    expect(
      new TextEncoder().encode(target.getItem(REPLAY_BOOKMARKS_KEY)!).length,
    ).toBeLessThanOrEqual(256 * 1024);
  });
  it("saves and edits one bookmark per frame without touching canonical match history", () => {
    const target = storage();
    target.setItem("riftbound-duel-history-v1", "canonical bytes");
    expect(
      saveReplayBookmark(id(), 2, 13, "  Defend the hold point  ", target)
        .saved,
    ).toBe(true);
    expect(
      saveReplayBookmark(id(), 2, 13, "Revised note", target).bookmarks,
    ).toEqual([{ matchId: id(), frameIndex: 2, note: "Revised note" }]);
    expect(readReplayBookmarks(target).bookmarks).toHaveLength(1);
    expect(target.getItem("riftbound-duel-history-v1")).toBe("canonical bytes");
  });
  it("rejects missing frames, unbounded notes and duplicate or malformed stored entries without overwriting prior bytes", () => {
    const target = storage();
    saveReplayBookmark(id(), 0, 13, "opening", target);
    const before = target.getItem(REPLAY_BOOKMARKS_KEY);
    for (const frame of [-1, 13, 1.5, NaN])
      expect(saveReplayBookmark(id(), frame, 13, "", target).saved).toBe(false);
    expect(saveReplayBookmark(id(), 1, 13, "x".repeat(161), target).saved).toBe(
      false,
    );
    expect(target.getItem(REPLAY_BOOKMARKS_KEY)).toBe(before);
    const entry = readReplayBookmarks(target).bookmarks[0];
    target.setItem(
      REPLAY_BOOKMARKS_KEY,
      JSON.stringify({ version: 1, bookmarks: [entry, entry] }),
    );
    const duplicate = target.getItem(REPLAY_BOOKMARKS_KEY);
    expect(readReplayBookmarks(target).error).toBeTruthy();
    expect(saveReplayBookmark(id(), 1, 13, "new", target).saved).toBe(false);
    expect(target.getItem(REPLAY_BOOKMARKS_KEY)).toBe(duplicate);
    target.setItem(REPLAY_BOOKMARKS_KEY, "corrupt original bytes");
    expect(removeMatchBookmarks(id(), target).saved).toBe(false);
    expect(target.getItem(REPLAY_BOOKMARKS_KEY)).toBe("corrupt original bytes");
    expect(clearReplayBookmarks(target).saved).toBe(true);
  });
  it("enforces 10 bookmarks per match and 20 matches, while allowing edits and explicit removal", () => {
    const target = storage();
    for (let frame = 0; frame < 10; frame++)
      expect(saveReplayBookmark(id(), frame, 13, "", target).saved).toBe(true);
    expect(saveReplayBookmark(id(), 10, 13, "", target).saved).toBe(false);
    expect(saveReplayBookmark(id(), 0, 13, "updated", target).saved).toBe(true);
    expect(deleteReplayBookmark(id(), 0, target).bookmarks).toHaveLength(9);
    expect(saveReplayBookmark(id(), 10, 13, "", target).saved).toBe(true);
    for (let match = 2; match <= 20; match++)
      expect(saveReplayBookmark(id(match), 0, 13, "", target).saved).toBe(true);
    expect(saveReplayBookmark(id(21), 0, 13, "", target).saved).toBe(false);
    expect(removeMatchBookmarks(id(2), target).saved).toBe(true);
    expect(saveReplayBookmark(id(21), 0, 13, "", target).saved).toBe(true);
  });
  it("keeps original bytes and returned prior bookmarks when quota blocks writes", () => {
    const target = storage();
    saveReplayBookmark(id(), 0, 13, "keep", target);
    const before = target.getItem(REPLAY_BOOKMARKS_KEY);
    const blocked = {
      getItem: target.getItem,
      setItem: () => {
        throw new DOMException(
          "Browser-specific technical quota details",
          "QuotaExceededError",
        );
      },
    };
    const result = saveReplayBookmark(id(), 1, 13, "new", blocked);
    expect(result.saved).toBe(false);
    expect(result.error).toContain("Previous bookmarks were kept");
    expect(result.error).not.toContain("technical quota");
    expect(result.bookmarks).toEqual([
      { matchId: id(), frameIndex: 0, note: "keep" },
    ]);
    expect(deleteReplayBookmark(id(), 0, blocked).saved).toBe(false);
    expect(clearReplayBookmarks(blocked).saved).toBe(false);
    expect(target.getItem(REPLAY_BOOKMARKS_KEY)).toBe(before);
  });
  it("removes evicted/deleted match notes after a valid archive read and does not write when nothing changed", () => {
    const target = storage();
    saveReplayBookmark(id(1), 0, 13, "keep", target);
    saveReplayBookmark(id(2), 1, 13, "evicted", target);
    expect(retainArchivedBookmarks([id(1)], target).bookmarks).toEqual([
      { matchId: id(1), frameIndex: 0, note: "keep" },
    ]);
    expect(
      retainArchivedBookmarks([id(1)], {
        getItem: target.getItem,
        setItem: () => {
          throw new Error();
        },
      }).saved,
    ).toBe(true);
    expect(removeMatchBookmarks(id(1), target).bookmarks).toEqual([]);
  });
});
