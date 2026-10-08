import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronFirst,
  ChevronLast,
  Download,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { findCard } from "../catalog";
import { useI18n } from "../i18n";
import { Card } from "./Card";
import {
  buildMatchTimeline,
  clearMatchHistory,
  deleteCompletedMatch,
  historyCompatibility,
  historyDeckStats,
  importCompletedMatch,
  MATCH_HISTORY_KEY,
  MAX_HISTORY_MATCHES,
  MAX_REPLAY_BYTES,
  readMatchHistory,
} from "../game/match-history";
import type { CompletedMatch } from "../game/match-history";
import {
  adjacentMoment,
  replayMoves,
  replayTurns,
} from "../game/replay-navigation";
import {
  clearReplayBookmarks,
  deleteReplayBookmark,
  readReplayBookmarks,
  REPLAY_BOOKMARKS_KEY,
  removeMatchBookmarks,
  retainArchivedBookmarks,
  saveReplayBookmark,
} from "../game/replay-bookmarks";
import type { LocationId, PlayerId } from "../game/types";
import "./MatchHistory.css";
const MOVES_PER_PAGE = 40;

function download(value: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MatchHistory({ onBack }: { onBack: () => void }) {
  const { t, locale } = useI18n();
  const [archive, setArchive] = useState(readMatchHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<PlayerId>(0);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("");
  const [messageValues, setMessageValues] = useState<
    Record<string, string | number>
  >({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [actorFilter, setActorFilter] = useState("all");
  const [momentsOnly, setMomentsOnly] = useState(false);
  const [movePage, setMovePage] = useState(0);
  const [bookmarkState, setBookmarkState] = useState(readReplayBookmarks);
  const [bookmarkDraft, setBookmarkDraft] = useState<string | null>(null);
  const [bookmarkFrame, setBookmarkFrame] = useState(0);
  const [bookmarkMessage, setBookmarkMessage] = useState("");
  const [confirmBookmarkReset, setConfirmBookmarkReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const selected = archive.entries.find((entry) => entry.id === selectedId);
  const timeline = useMemo(() => {
    if (!selected) return { frames: [] };
    try {
      return { frames: buildMatchTimeline(selected) };
    } catch (cause) {
      return {
        frames: [],
        error:
          cause instanceof Error
            ? cause.message
            : "This replay could not be reconstructed.",
      };
    }
  }, [selected]);
  const frame = timeline.frames[index];
  const view = frame?.views[viewer];
  const turns = useMemo(() => replayTurns(timeline.frames), [timeline.frames]);
  const moves = useMemo(() => replayMoves(timeline.frames), [timeline.frames]);
  const visibleMoves = useMemo(
    () =>
      moves.filter(
        (move) =>
          (!momentsOnly || move.moments.length) &&
          (actorFilter === "all" ||
            move.actor === (actorFilter === "you" ? viewer : 1 - viewer)),
      ),
    [moves, momentsOnly, actorFilter, viewer],
  );
  const movePageCount = Math.max(
    1,
    Math.ceil(visibleMoves.length / MOVES_PER_PAGE),
  );
  const currentMovePage = Math.min(movePage, movePageCount - 1);
  const pageMoves = visibleMoves.slice(
    currentMovePage * MOVES_PER_PAGE,
    (currentMovePage + 1) * MOVES_PER_PAGE,
  );
  const previousMoment = adjacentMoment(timeline.frames, index, -1);
  const nextMoment = adjacentMoment(timeline.frames, index, 1);
  const bookmarks = bookmarkState.bookmarks
    .filter((bookmark) => bookmark.matchId === selectedId)
    .sort((a, b) => a.frameIndex - b.frameIndex);
  const stats = useMemo(
    () => historyDeckStats(archive.entries),
    [archive.entries],
  );

  useEffect(() => {
    if (!playing || !timeline.frames.length) return;
    const timer = window.setInterval(
      () =>
        setIndex((previous) => {
          if (previous >= timeline.frames.length - 1) {
            setPlaying(false);
            return previous;
          }
          return previous + 1;
        }),
      900 / speed,
    );
    return () => window.clearInterval(timer);
  }, [playing, timeline.frames.length, speed]);

  useEffect(() => {
    if (archive.error) return;
    const result = retainArchivedBookmarks(
      archive.entries.map((entry) => entry.id),
    );
    if (result.saved) setBookmarkState(result);
    else
      setBookmarkMessage(
        result.error ??
          "Bookmarks could not be saved. Previous bookmarks were kept.",
      );
  }, [archive.entries, archive.error]);

  useEffect(() => {
    const active = visibleMoves.findIndex(
      (move) => index >= move.firstFrame && index <= move.lastFrame,
    );
    if (active >= 0) setMovePage(Math.floor(active / MOVES_PER_PAGE));
  }, [index, visibleMoves]);

  const seek = (next: number) => {
    const clamped = Math.max(0, Math.min(next, timeline.frames.length - 1));
    setIndex(clamped);
    if (clamped === 0) setMovePage(0);
    setPlaying(false);
    setBookmarkDraft(null);
  };

  const choose = (entry: CompletedMatch) => {
    setPlaying(false);
    setIndex(0);
    setViewer(0);
    setSelectedId(entry.id);
    setActorFilter("all");
    setMomentsOnly(false);
    setMovePage(0);
    setBookmarkDraft(null);
    setBookmarkMessage("");
    setMessage("");
    setMessageValues({});
  };
  const remove = (id: string) => {
    const result = deleteCompletedMatch(id);
    if (!result.saved) {
      setMessage(
        result.error ??
          "Match history could not be saved. Previous entries were kept.",
      );
      return;
    }
    setArchive({ entries: result.entries ?? [] });
    setMessage("");
    setMessageValues({});
    const cleaned = removeMatchBookmarks(id);
    if (cleaned.saved) setBookmarkState(cleaned);
    else
      setBookmarkMessage(
        cleaned.error ??
          "Bookmarks could not be saved. Previous bookmarks were kept.",
      );
    if (id === selectedId) {
      setSelectedId(null);
      setPlaying(false);
    }
  };
  const clear = () => {
    const result = clearMatchHistory();
    if (!result.saved) {
      setMessage(
        result.error ??
          "Match history could not be saved. Previous entries were kept.",
      );
      return;
    }
    setArchive({ entries: [] });
    setMessage("Match history cleared.");
    setMessageValues({});
    const cleaned = clearReplayBookmarks();
    if (cleaned.saved) setBookmarkState(cleaned);
    else
      setBookmarkMessage(
        cleaned.error ??
          "Bookmarks could not be saved. Previous bookmarks were kept.",
      );
    setSelectedId(null);
    setConfirmClear(false);
    setPlaying(false);
  };
  const importFile = async (chosen?: File) => {
    if (!chosen) return;
    setBusy(true);
    setPlaying(false);
    setMessage("");
    setMessageValues({});
    try {
      if (chosen.size > MAX_REPLAY_BYTES)
        throw new Error("Replay file is too large (maximum 8 MB).");
      const raw = await chosen.text();
      const previous = readMatchHistory();
      const result = importCompletedMatch(raw);
      if (!result.saved) throw new Error(result.error);
      const retained = result.entries ?? [];
      setArchive({ entries: retained });
      const requested = retained.find((entry) => entry.id === result.entry?.id);
      const newlyRetained = retained.find(
        (entry) =>
          !previous.entries.some((existing) => existing.id === entry.id),
      );
      if (requested || newlyRetained) {
        choose((requested || newlyRetained)!);
        setMessage(
          "Replay import checked. History keeps up to {count} newest matches.",
        );
        setMessageValues({ count: MAX_HISTORY_MATCHES });
      } else {
        setMessage(
          result.entry
            ? "This replay is valid, but it falls outside the history size or match limits. Export and remove saved matches, then import it again to keep it."
            : "Import checked. No additional matches were retained.",
        );
        setMessageValues({ count: MAX_HISTORY_MATCHES });
      }
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Replay import failed.",
      );
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const exportArchive = () => {
    try {
      const raw = localStorage.getItem(MATCH_HISTORY_KEY);
      if (raw) download(raw, "riftbound-match-history-backup.json");
    } catch {
      setMessage("Browser storage is unavailable.");
    }
  };
  const saveBookmark = () => {
    if (!selected || bookmarkDraft === null) return;
    const result = saveReplayBookmark(
      selected.id,
      bookmarkFrame,
      timeline.frames.length,
      bookmarkDraft,
    );
    if (result.saved) {
      setBookmarkState(result);
      setBookmarkDraft(null);
      setBookmarkMessage("Replay bookmark saved.");
    } else
      setBookmarkMessage(
        result.error ??
          "Bookmarks could not be saved. Previous bookmarks were kept.",
      );
  };
  const removeBookmark = (frameIndex: number) => {
    if (!selected) return;
    const result = deleteReplayBookmark(selected.id, frameIndex);
    if (result.saved) {
      setBookmarkState(result);
      setBookmarkMessage("");
    } else
      setBookmarkMessage(
        result.error ??
          "Bookmarks could not be saved. Previous bookmarks were kept.",
      );
  };
  const exportBookmarkData = () => {
    try {
      const raw = localStorage.getItem(REPLAY_BOOKMARKS_KEY);
      if (raw) download(raw, "riftbound-replay-bookmarks-backup.json");
      else setBookmarkState(readReplayBookmarks());
    } catch {
      setBookmarkMessage("Browser storage is unavailable.");
    }
  };
  const resetBookmarkData = () => {
    const result = clearReplayBookmarks();
    if (result.saved) {
      setBookmarkState(result);
      setConfirmBookmarkReset(false);
      setBookmarkMessage("Replay bookmarks cleared.");
    } else
      setBookmarkMessage(
        result.error ??
          "Bookmarks could not be saved. Previous bookmarks were kept.",
      );
  };
  const bookmarkRecovery = bookmarkState.error && (
    <div className="history-bookmark-recovery">
      <button className="history-button" onClick={exportBookmarkData}>
        <Download size={15} />
        {t("Export bookmark data")}
      </button>
      <button
        className="history-button"
        onClick={() => setConfirmBookmarkReset(true)}
      >
        {t("Reset unreadable bookmarks")}
      </button>
      {confirmBookmarkReset && (
        <div className="history-confirm" role="alert">
          <p>
            {t(
              "Reset all replay bookmarks? This removes saved notes from this browser and keeps the matches.",
            )}
          </p>
          <button className="history-button danger" onClick={resetBookmarkData}>
            {t("Reset bookmarks")}
          </button>
          <button
            className="history-button"
            onClick={() => setConfirmBookmarkReset(false)}
          >
            {t("Cancel")}
          </button>
        </div>
      )}
    </div>
  );
  const momentIndices = timeline.frames.flatMap((frame, index) =>
    frame.moments.length ? [{ index, frame }] : [],
  );
  const zones: { id: LocationId; label: string }[] = [
    { id: "base:1", label: viewer === 1 ? "Your base" : "Opponent base" },
    ...(view?.fields.map((field, index) => ({
      id: field.id,
      label: `Battlefield ${index + 1}`,
    })) ?? []),
    { id: "base:0", label: viewer === 0 ? "Your base" : "Opponent base" },
  ];

  return (
    <main className="match-history">
      <header className="history-header">
        <button className="history-button" onClick={onBack}>
          <ArrowLeft size={18} />
          {t("Back")}
        </button>
        <div>
          <span className="history-eyebrow">
            {t("Completed match analysis")}
          </span>
          <h1>{t("Match history")}</h1>
          <p>
            {t(
              "Review actual moves, public turning points and your results by deck.",
            )}
          </p>
        </div>
      </header>
      <div className="history-tools">
        <button
          className="history-button primary"
          onClick={() => file.current?.click()}
          disabled={busy}
        >
          <Upload size={17} />
          {t(busy ? "Checking replay…" : "Import completed replay")}
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importFile(event.target.files?.[0])}
          disabled={busy}
          hidden
        />
        <button
          className="history-button"
          onClick={exportArchive}
          disabled={busy || (!archive.entries.length && !archive.error)}
        >
          <Download size={17} />
          {t("Export history backup")}
        </button>
        <button
          className="history-button"
          onClick={() => setConfirmClear(true)}
          disabled={busy || (!archive.entries.length && !archive.error)}
        >
          <Trash2 size={17} />
          {t("Clear history")}
        </button>
      </div>
      {confirmClear && (
        <section className="history-confirm" role="alert">
          <p>
            {t(
              "Delete all match history from this browser? Export a backup first if you want to keep it.",
            )}
          </p>
          <p>
            {t(
              "Replay bookmarks are also removed. Notes are not included in replay backups.",
            )}
          </p>
          <button
            className="history-button danger"
            onClick={clear}
            disabled={busy}
          >
            {t("Delete all matches")}
          </button>
          <button
            className="history-button"
            onClick={() => setConfirmClear(false)}
          >
            {t("Cancel")}
          </button>
        </section>
      )}
      {(archive.error || message) && (
        <p className="history-notice" role="status">
          {t(message || archive.error, messageValues)}
        </p>
      )}
      {!selected && (bookmarkState.error || bookmarkMessage) && (
        <p className="history-notice" role="status">
          {t(bookmarkMessage || bookmarkState.error)}
        </p>
      )}
      {!selected && bookmarkRecovery}
      {stats.length > 0 && (
        <section className="history-stats" aria-label={t("Results by deck")}>
          <h2>{t("Results by deck")}</h2>
          <div className="history-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Deck")}</th>
                  <th>{t("Matches")}</th>
                  <th>{t("Wins")}</th>
                  <th>{t("Win rate")}</th>
                  <th>{t("Average turns")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{row.deck}</th>
                    <td>{row.matches}</td>
                    <td>{row.wins}</td>
                    <td>{Math.round((row.wins / row.matches) * 100)}%</td>
                    <td>{(row.turns / row.matches).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {t("These figures describe your saved matches in this browser.")}
          </p>
        </section>
      )}
      {!archive.entries.length && !archive.error && (
        <section className="history-empty">
          <h2>{t("Your first finished duel starts the story.")}</h2>
          <p>
            {t(
              "Completed matches are saved here automatically. You can also import a downloaded completed replay.",
            )}
          </p>
        </section>
      )}
      <div className="history-layout">
        <section className="history-list" aria-label={t("Saved matches")}>
          {archive.entries.map((entry) => (
            <article
              key={entry.id}
              className={selectedId === entry.id ? "selected" : ""}
            >
              <button
                className="history-match-open"
                onClick={() => choose(entry)}
                aria-pressed={selectedId === entry.id}
              >
                <span
                  className={
                    entry.winner === 0 ? "history-win" : "history-loss"
                  }
                >
                  {t(entry.winner === 0 ? "Victory" : "Defeat")} ·{" "}
                  {entry.points.join(" : ")}
                </span>
                <strong>
                  {entry.playerDeckName} <small>vs</small>{" "}
                  {entry.opponentDeckName}
                </strong>
                <span>
                  {new Date(entry.endedAt).toLocaleDateString(
                    locale === "sr" ? "sr-Latn" : locale,
                  )}{" "}
                  · {t(entry.difficulty)} ·{" "}
                  {t("{count} turns", { count: entry.turns })}
                </span>
              </button>
              <div className="history-entry-tools">
                <button
                  className="history-button"
                  onClick={() =>
                    download(
                      JSON.stringify(entry),
                      `riftbound-replay-${entry.id}.json`,
                    )
                  }
                >
                  <Download size={14} />
                  {t("Export replay")}
                </button>
                <button
                  className="history-button"
                  onClick={() => remove(entry.id)}
                  aria-label={t("Delete this match")}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </section>
        {selected && (
          <section className="history-replay" aria-label={t("Visual replay")}>
            <div className="history-replay-title">
              <div>
                <span className="history-eyebrow">
                  {t("Completed match analysis")}
                </span>
                <h2>
                  {selected.playerDeckName} <small>vs</small>{" "}
                  {selected.opponentDeckName}
                </h2>
              </div>
              <label>
                {t("Perspective")}
                <select
                  value={viewer}
                  onChange={(event) =>
                    setViewer(Number(event.target.value) as PlayerId)
                  }
                >
                  <option value={0}>{t("Your perspective")}</option>
                  <option value={1}>{t("AI perspective")}</option>
                </select>
              </label>
            </div>
            <p>
              {t(
                "Each frame shows information available to the selected player at that moment.",
              )}
            </p>
            {historyCompatibility(selected).map((warning) => (
              <p className="history-notice" key={warning}>
                {t(warning)}
              </p>
            ))}
            {timeline.error && (
              <p className="history-notice" role="alert">
                {t(timeline.error)}
              </p>
            )}
            {frame && view && (
              <>
                <div className="history-playback">
                  <button
                    className="history-button"
                    aria-label={t("Restart replay")}
                    onClick={() => {
                      seek(0);
                    }}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="history-button"
                    aria-label={t("Previous frame")}
                    disabled={!index}
                    onClick={() => {
                      seek(index - 1);
                    }}
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <button
                    className="history-button primary"
                    disabled={
                      bookmarkDraft !== null ||
                      (!playing && index >= timeline.frames.length - 1)
                    }
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? <Pause size={17} /> : <Play size={17} />}
                    {t(playing ? "Pause replay" : "Play replay")}
                  </button>
                  <button
                    className="history-button"
                    aria-label={t("Next frame")}
                    disabled={index >= timeline.frames.length - 1}
                    onClick={() => {
                      seek(index + 1);
                    }}
                  >
                    <ArrowRight size={17} />
                  </button>
                  <span>
                    {t("Frame {current} of {total}", {
                      current: index + 1,
                      total: timeline.frames.length,
                    })}
                  </span>
                  <label className="history-speed">
                    {t("Playback speed")}
                    <select
                      value={speed}
                      onChange={(event) => setSpeed(Number(event.target.value))}
                    >
                      <option value={0.5}>0.5×</option>
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                    </select>
                  </label>
                </div>
                <div className="history-navigation">
                  <label>
                    {t("Jump to turn")}
                    <select
                      value={
                        turns.find(
                          (turn) =>
                            index >= turn.firstFrame && index <= turn.lastFrame,
                        )?.firstFrame ?? 0
                      }
                      onChange={(event) => seek(Number(event.target.value))}
                    >
                      {turns.map((turn) => (
                        <option key={turn.firstFrame} value={turn.firstFrame}>
                          {t("Turn")} {turn.turn} ·{" "}
                          {t(turn.player === viewer ? "You" : "Opponent")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="history-button"
                    disabled={previousMoment === undefined}
                    onClick={() =>
                      previousMoment !== undefined && seek(previousMoment)
                    }
                  >
                    <ChevronFirst size={16} />
                    {t("Previous key moment")}
                  </button>
                  <button
                    className="history-button"
                    disabled={nextMoment === undefined}
                    onClick={() => nextMoment !== undefined && seek(nextMoment)}
                  >
                    {t("Next key moment")}
                    <ChevronLast size={16} />
                  </button>
                  <button
                    className="history-button"
                    onClick={() => {
                      setPlaying(false);
                      setBookmarkFrame(index);
                      setBookmarkDraft(
                        bookmarks.find(
                          (bookmark) => bookmark.frameIndex === index,
                        )?.note ?? "",
                      );
                      setBookmarkMessage("");
                    }}
                  >
                    <Bookmark size={16} />
                    {t(
                      bookmarks.some(
                        (bookmark) => bookmark.frameIndex === index,
                      )
                        ? "Edit bookmark"
                        : "Bookmark this frame",
                    )}
                  </button>
                </div>
                {bookmarkDraft !== null && (
                  <form
                    className="history-bookmark-editor"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveBookmark();
                    }}
                  >
                    <label>
                      {t("Bookmark note (optional)")}
                      <span>
                        {t("Bookmarking frame {frame}", {
                          frame: bookmarkFrame + 1,
                        })}
                      </span>
                      <input
                        value={bookmarkDraft}
                        maxLength={160}
                        onChange={(event) =>
                          setBookmarkDraft(event.target.value)
                        }
                      />
                    </label>
                    <button className="history-button primary" type="submit">
                      {t("Save bookmark")}
                    </button>
                    <button
                      className="history-button"
                      type="button"
                      onClick={() => setBookmarkDraft(null)}
                    >
                      {t("Cancel")}
                    </button>
                  </form>
                )}
                {(bookmarkState.error || bookmarkMessage) && (
                  <p className="history-notice" role="status">
                    {t(bookmarkMessage || bookmarkState.error)}
                  </p>
                )}
                {bookmarkRecovery}
                <input
                  className="history-scrub"
                  type="range"
                  min={0}
                  max={timeline.frames.length - 1}
                  value={index}
                  aria-label={t("Replay position")}
                  onChange={(event) => {
                    seek(Number(event.target.value));
                  }}
                />
                <div
                  className="history-caption"
                  aria-live="polite"
                  tabIndex={0}
                  aria-label={t(
                    "Replay frame. Use arrow keys to step, Home or End to jump, and Space to play or pause.",
                  )}
                  onKeyDown={(event) => {
                    if (event.altKey || event.ctrlKey || event.metaKey) return;
                    if (event.key === "ArrowLeft") seek(index - 1);
                    else if (event.key === "ArrowRight") seek(index + 1);
                    else if (event.key === "Home") seek(0);
                    else if (event.key === "End")
                      seek(timeline.frames.length - 1);
                    else if (event.key === " ") {
                      if (
                        bookmarkDraft === null &&
                        (playing || index < timeline.frames.length - 1)
                      )
                        setPlaying((previous) => !previous);
                    } else return;
                    event.preventDefault();
                  }}
                >
                  <span>
                    {t("Turn")} {view.turn} ·{" "}
                    {view.players.map((player) => player.points).join(" : ")}
                  </span>
                  <strong>{t(frame.labels[viewer])}</strong>
                  {frame.moments.map((moment, index) => (
                    <span className="history-moment" key={index}>
                      {moment.player !== undefined &&
                        `${t(moment.player === viewer ? "You" : "Opponent")} · `}
                      {t(moment.label, moment.values)}
                    </span>
                  ))}
                </div>
                <details className="history-move-list" open>
                  <summary>
                    {t("Move list")} · {moves.length}
                  </summary>
                  <div className="history-move-filters">
                    <label>
                      {t("Show moves by")}
                      <select
                        value={actorFilter}
                        onChange={(event) => {
                          setActorFilter(event.target.value);
                          setMovePage(0);
                        }}
                      >
                        <option value="all">{t("Both players")}</option>
                        <option value="you">{t("You")}</option>
                        <option value="opponent">{t("Opponent")}</option>
                      </select>
                    </label>
                    <label className="history-moments-filter">
                      <input
                        type="checkbox"
                        checked={momentsOnly}
                        onChange={(event) => {
                          setMomentsOnly(event.target.checked);
                          setMovePage(0);
                        }}
                      />
                      {t("Key moments only")}
                    </label>
                  </div>
                  <ol className="history-moves">
                    {pageMoves.map((move) => (
                      <li key={move.decisionIndex}>
                        <button
                          onClick={() => seek(move.firstFrame)}
                          aria-current={
                            index >= move.firstFrame && index <= move.lastFrame
                              ? "step"
                              : undefined
                          }
                        >
                          <span>
                            {move.decisionIndex + 1} · {t("Turn")} {move.turn} ·{" "}
                            {t(move.actor === viewer ? "You" : "Opponent")}
                          </span>
                          <strong>{t(move.labels[viewer])}</strong>
                          {move.moments.length > 0 && (
                            <small>
                              {move.moments
                                .map((moment) => t(moment.label, moment.values))
                                .join(" / ")}
                            </small>
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                  {movePageCount > 1 && (
                    <div className="history-move-pages">
                      <button
                        className="history-button"
                        disabled={currentMovePage === 0}
                        onClick={() => setMovePage(currentMovePage - 1)}
                      >
                        <ArrowLeft size={15} />
                        {t("Previous moves")}
                      </button>
                      <span>
                        {t("Moves {first}–{last} of {total}", {
                          first: currentMovePage * MOVES_PER_PAGE + 1,
                          last: Math.min(
                            (currentMovePage + 1) * MOVES_PER_PAGE,
                            visibleMoves.length,
                          ),
                          total: visibleMoves.length,
                        })}
                      </span>
                      <button
                        className="history-button"
                        disabled={currentMovePage >= movePageCount - 1}
                        onClick={() => setMovePage(currentMovePage + 1)}
                      >
                        {t("Next moves")}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                  {!visibleMoves.length && (
                    <p>{t("No moves match these filters.")}</p>
                  )}
                </details>
                {bookmarks.length > 0 && (
                  <details className="history-bookmarks" open>
                    <summary>
                      {t("Replay bookmarks")} · {bookmarks.length}/10
                    </summary>
                    <p>
                      {t(
                        "Bookmarks and notes stay in this browser; replay exports contain the original match only.",
                      )}
                    </p>
                    <ul>
                      {bookmarks.map((bookmark) => (
                        <li key={bookmark.frameIndex}>
                          <button
                            className="history-button"
                            onClick={() => seek(bookmark.frameIndex)}
                          >
                            {t("Frame {current} of {total}", {
                              current: Math.min(
                                bookmark.frameIndex + 1,
                                timeline.frames.length,
                              ),
                              total: timeline.frames.length,
                            })}
                            {bookmark.note && <span>{bookmark.note}</span>}
                            {bookmark.frameIndex >= timeline.frames.length && (
                              <span>
                                {t(
                                  "This replay now has fewer frames; the bookmark opens the nearest available frame.",
                                )}
                              </span>
                            )}
                          </button>
                          <button
                            className="history-button"
                            aria-label={t("Remove bookmark at frame {frame}", {
                              frame: bookmark.frameIndex + 1,
                            })}
                            onClick={() => removeBookmark(bookmark.frameIndex)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div
                  className="history-public-status"
                  aria-label={t("Public position")}
                >
                  {view.players.map((player) => (
                    <div key={player.id}>
                      <strong>
                        {t(player.id === viewer ? "You" : "Opponent")} ·{" "}
                        {player.points} {t("points")}
                      </strong>
                      <span>
                        {t("Ready runes")}:{" "}
                        {player.runes.filter((rune) => rune.ready).length}/
                        {player.runes.length}
                      </span>
                      <span>
                        {t("Floating energy")}: {player.energy}
                      </span>
                      <span>
                        {t("{count} units", {
                          count: view.units.filter(
                            (unit) => unit.owner === player.id,
                          ).length,
                        })}{" "}
                        ·{" "}
                        {t("{count} gear", {
                          count: view.gears.filter(
                            (gear) => gear.owner === player.id,
                          ).length,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
                {view.stack.length > 0 && (
                  <div className="history-chain">
                    <strong>{t("Pending chain")}</strong>
                    {[...view.stack].reverse().map((item) => (
                      <span key={item.id}>{findCard(item.cardId)?.name}</span>
                    ))}
                  </div>
                )}
                <div className="history-board">
                  {zones.map((zone) => (
                    <section key={zone.id} className="history-zone">
                      <h3>
                        {zone.id.startsWith("field:")
                          ? findCard(
                              view.fields.find((field) => field.id === zone.id)
                                ?.cardId,
                            )?.name
                          : t(zone.label)}
                      </h3>
                      <div className="history-cards">
                        {view.units
                          .filter((unit) => unit.location === zone.id)
                          .map((unit) => {
                            const card = findCard(unit.cardId);
                            return (
                              card && (
                                <div
                                  className={`history-unit ${unit.owner === viewer ? "own" : "enemy"}`}
                                  key={unit.id}
                                >
                                  <Card
                                    card={card}
                                    small
                                    ready={unit.ready}
                                    damage={unit.damage}
                                    might={frame.might[unit.id]}
                                    footer={
                                      unit.owner === viewer
                                        ? "Your unit"
                                        : "Opponent unit"
                                    }
                                  />
                                  <strong>
                                    {frame.might[unit.id]} {t("Might")}
                                  </strong>
                                  <span>{card.name}</span>
                                </div>
                              )
                            );
                          })}
                      </div>
                      {!view.units.some(
                        (unit) => unit.location === zone.id,
                      ) && <p>{t("No units here")}</p>}
                      <div className="history-cards history-gears">
                        {view.gears
                          .filter(
                            (gear) =>
                              (gear.attachedTo
                                ? view.units.find(
                                    (unit) => unit.id === gear.attachedTo,
                                  )?.location
                                : `base:${gear.owner}`) === zone.id,
                          )
                          .map((gear) => {
                            const card = findCard(gear.cardId);
                            const bearer = view.units.find(
                              (unit) => unit.id === gear.attachedTo,
                            );
                            return (
                              card && (
                                <div className="history-unit" key={gear.id}>
                                  <Card card={card} small ready={gear.ready} />
                                  <span>{card.name}</span>
                                  {bearer && (
                                    <span>
                                      {t("Attached to {card}", {
                                        card:
                                          findCard(bearer.cardId)?.name ??
                                          bearer.cardId,
                                      })}
                                    </span>
                                  )}
                                </div>
                              )
                            );
                          })}
                      </div>
                      {view.hidden
                        ?.filter((hidden) => hidden.location === zone.id)
                        .map((hidden) => (
                          <p className="history-hidden" key={hidden.id}>
                            {findCard(hidden.cardId)
                              ? `${t("Known Hidden card")}: ${findCard(hidden.cardId)?.name}`
                              : t("Private Hidden card")}
                          </p>
                        ))}
                    </section>
                  ))}
                </div>
                <section className="history-hand">
                  <h3>{t("Selected player's hand")}</h3>
                  <div className="history-cards">
                    {view.players[viewer].hand.map((cardId, position) => {
                      const card = findCard(cardId);
                      return (
                        card && (
                          <div
                            className="history-unit"
                            key={`${position}-${cardId}`}
                          >
                            <Card card={card} small />
                            <span>{card.name}</span>
                          </div>
                        )
                      );
                    })}
                  </div>
                  <p>
                    {t("Other player's hand: {count} private cards", {
                      count: view.players[(1 - viewer) as PlayerId].handCount,
                    })}
                  </p>
                </section>
                {frame.trace && frame.actor === viewer && (
                  <details className="history-search">
                    <summary>
                      {t("AI search estimates at this decision")}
                    </summary>
                    <p>
                      {t(
                        "Search estimates describe the bot's evaluated options, not a guaranteed best move.",
                      )}
                    </p>
                    <p>{frame.trace.reason}</p>
                    {frame.trace.incomplete && (
                      <p>{t("The search reached its time or node limit.")}</p>
                    )}
                    <ul>
                      {frame.trace.alternatives.map((alternative, index) => (
                        <li key={index}>
                          {t(alternative.label)}{" "}
                          <strong>{alternative.utility.toFixed(1)}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <details className="history-key-moments">
                  <summary>{t("Key moments")}</summary>
                  <div>
                    {momentIndices.map(({ index, frame }) => (
                      <button
                        className="history-button"
                        key={index}
                        onClick={() => {
                          seek(index);
                        }}
                      >
                        {t("Turn")} {frame.views[viewer].turn} ·{" "}
                        {frame.moments
                          .map((moment) => t(moment.label, moment.values))
                          .join(" / ")}
                      </button>
                    ))}
                  </div>
                </details>
              </>
            )}
            <details className="history-versions">
              <summary>{t("Replay versions")}</summary>
              <p>
                {t("Rules")}: {selected.rulesVersion}
              </p>
              <p>
                {t("Catalog")}: {selected.cardDataVersion}
              </p>
              <p>
                {t("AI")}: {selected.botVersion}
              </p>
              <p>
                {t("Engine")}: {selected.engineVersion} ·{" "}
                {t("{count} decisions", { count: selected.decisionCount })}
              </p>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
