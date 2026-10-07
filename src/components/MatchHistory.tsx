import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
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
  MAX_REPLAY_BYTES,
  readMatchHistory,
} from "../game/match-history";
import type { CompletedMatch } from "../game/match-history";
import type { LocationId, PlayerId } from "../game/types";
import "./MatchHistory.css";

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
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
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
      900,
    );
    return () => window.clearInterval(timer);
  }, [playing, timeline.frames.length]);

  const choose = (entry: CompletedMatch) => {
    setPlaying(false);
    setIndex(0);
    setViewer(0);
    setSelectedId(entry.id);
    setMessage("");
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
    setSelectedId(null);
    setConfirmClear(false);
    setPlaying(false);
  };
  const importFile = async (chosen?: File) => {
    if (!chosen) return;
    setBusy(true);
    setPlaying(false);
    setMessage("");
    try {
      if (chosen.size > MAX_REPLAY_BYTES)
        throw new Error("Replay file is too large (maximum 8 MB).");
      const result = importCompletedMatch(await chosen.text());
      if (!result.saved) throw new Error(result.error);
      setArchive({ entries: result.entries ?? [] });
      if (result.entry) choose(result.entry);
      setMessage("Completed replay imported.");
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
          hidden
        />
        <button
          className="history-button"
          onClick={exportArchive}
          disabled={!archive.entries.length && !archive.error}
        >
          <Download size={17} />
          {t("Export history backup")}
        </button>
        <button
          className="history-button"
          onClick={() => setConfirmClear(true)}
          disabled={!archive.entries.length && !archive.error}
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
          <button className="history-button danger" onClick={clear}>
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
          {t(message || archive.error)}
        </p>
      )}
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
                      setIndex(0);
                      setPlaying(false);
                    }}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="history-button"
                    aria-label={t("Previous frame")}
                    disabled={!index}
                    onClick={() => {
                      setIndex(index - 1);
                      setPlaying(false);
                    }}
                  >
                    <ArrowLeft size={17} />
                  </button>
                  <button
                    className="history-button primary"
                    disabled={index >= timeline.frames.length - 1}
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
                      setIndex(index + 1);
                      setPlaying(false);
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
                </div>
                <input
                  className="history-scrub"
                  type="range"
                  min={0}
                  max={timeline.frames.length - 1}
                  value={index}
                  aria-label={t("Replay position")}
                  onChange={(event) => {
                    setIndex(Number(event.target.value));
                    setPlaying(false);
                  }}
                />
                <div className="history-caption" aria-live="polite">
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
                          setIndex(index);
                          setPlaying(false);
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
