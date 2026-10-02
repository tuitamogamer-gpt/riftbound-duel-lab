import { LanguageSelector, useI18n } from "./i18n";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleHelp,
  Pause,
  Play,
  Flag,
  History,
  Layers3,
  RotateCcw,
  Search,
  Shield,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { catalog, findCard, domainColors } from "./catalog";
import type { CatalogCard } from "./catalog";
import { parseSession, SAVE_KEY } from "./persistence";
import { cardArtUrl } from "./data/art";
import { type StarterDeck } from "./data/decks";
import { DeckImport } from "./components/DeckImport";
import { Lobby } from "./components/Lobby";
import {
  exportDeckText,
  getDeckScriptCoverage,
  loadImportedDecks,
  saveImportedDecks,
} from "./game/deck-import";
import { Card, CardDetail } from "./components/Card";
import { RuneCard } from "./components/RuneCard";
import { GearChip } from "./components/GearChip";
import { CombatPanel } from "./components/CombatPanel";
import { ChampionZone } from "./components/ChampionZone";
import {
  createGame,
  getLegalActions,
  applyActionStepped,
  getMight,
} from "./game/engine";
import { getAutomaticAction, sourceActions } from "./game/flow";
import { MatchControls } from "./components/MatchControls";
import { decks } from "./data/decks";
import {
  HighlightContext,
  getHighlights,
  useHighlights,
} from "./components/StepFlow";
import type { Review } from "./components/StepFlow";
import { scripts } from "./game/scripts";
import type { GameAction, GameState, LocationId, Unit } from "./game/types";
import "./interaction.css";

const BoardInteraction = createContext<{
  game: GameState | null;
  legal: GameAction[];
  actions: GameAction[];
  choose: (id: string) => void;
}>({ game: null, legal: [], actions: [], choose: () => {} });

const freshRead = () => {
  try {
    return parseSession(localStorage.getItem(SAVE_KEY));
  } catch {
    return { match: null, review: null };
  }
};
const supported = (c: CatalogCard) =>
  Boolean(scripts[c.id]) || c.type === "Rune";
const uniqueCards = catalog.filter((c) => !c.variant);
const locationName = (l?: string) =>
  l === "base:0"
    ? "Tvoja baza"
    : l === "base:1"
      ? "Protivnička baza"
      : l === "field:0"
        ? "Lijevo bojište"
        : l === "field:1"
          ? "Desno bojište"
          : "Igra";
function sound() {
  try {
    const a = new AudioContext();
    const o = a.createOscillator(),
      g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.frequency.setValueAtTime(430, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, a.currentTime + 0.12);
    g.gain.setValueAtTime(0.045, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.18);
    o.start();
    o.stop(a.currentTime + 0.18);
    o.onended = () => void a.close();
  } catch {}
}

export default function App() {
  const { t } = useI18n();
  const [screen, setScreen] = useState<"lobby" | "game" | "library">("lobby");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);
  const [saved] = useState(freshRead);
  const [match, setGame] = useState<GameState | null>(saved.match);
  const [review, setReview] = useState<Review | null>(saved.review);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [mulligan, setMulligan] = useState<number[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const game = review?.frames[review.index]?.state || match;
  const highlights = useMemo(() => getHighlights(review), [review]);
  const [importedDecks, setImportedDecks] = useState<StarterDeck[]>(() =>
    loadImportedDecks(),
  );
  const allDecks = useMemo(() => [...decks, ...importedDecks], [importedDecks]);
  const [deckGroup, setDeckGroup] = useState(decks[0]?.product || "Precon");
  const [importOpen, setImportOpen] = useState(false);
  const [deckDetails, setDeckDetails] = useState<StarterDeck | null>(null);
  const [playerDeck, setPlayerDeck] = useState(decks[0]?.id || "");
  const [botDeck, setBotDeck] = useState(decks[1]?.id || decks[0]?.id || "");
  const [inspected, setInspected] = useState<CatalogCard | null>(null);
  const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(true);
  const botActions = useMemo(
    () =>
      match && !review && match.winner === null
        ? getLegalActions(match, 1)
        : [],
    [match, review],
  );
  const thinking = botActions.length > 0;
  const [logOpen, setLogOpen] = useState(false);
  const [difficulty, setDifficulty] = useState("Taktički");
  const [confirmNew, setConfirmNew] = useState(false);
  const legal = useMemo(
    () => (match && !review && !paused ? getLegalActions(match, 0) : []),
    [match, review, paused],
  );
  useEffect(() => {
    if (match)
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ match, review }));
      } catch {}
  }, [match, review]);
  const doAction = useCallback(
    (action: GameAction) => {
      if (!match || review) return;
      try {
        const result = applyActionStepped(match, action.id);
        setTarget(null);
        setMulligan([]);
        const frames = result.frames.length
          ? result.frames
          : [{ state: result.state, label: action.label }];
        setGame(result.state);
        setReview({
          before: match,
          final: result.state,
          frames,
          index: 0,
          action,
        });
        setError("");
        if (!muted) sound();
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nevažeći potez");
        setPaused(true);
      }
    },
    [match, review, muted],
  );

  // Animate recorded effects, then hand control back only for a real decision.
  // Human mulligans, reactions, optional effects and end-turn are never chosen here.
  useEffect(() => {
    if (
      !match ||
      screen !== "game" ||
      paused ||
      !visible ||
      help ||
      inspected ||
      confirmNew ||
      logOpen
    )
      return;
    if (review) {
      const frame = review.frames[review.index];
      const delay = frame?.combat ? 1050 : 550;
      const timer = window.setTimeout(
        () =>
          setReview((current) =>
            current && current.index + 1 < current.frames.length
              ? { ...current, index: current.index + 1 }
              : null,
          ),
        delay,
      );
      return () => window.clearTimeout(timer);
    }
    const next = getAutomaticAction(match, difficulty === "Trening");
    if (!next) return;
    const timer = window.setTimeout(
      () => doAction(next),
      next.player === 1 ? 750 : 300,
    );
    return () => window.clearTimeout(timer);
  }, [
    match,
    review,
    screen,
    paused,
    visible,
    help,
    inspected,
    confirmNew,
    logOpen,
    difficulty,
    doAction,
  ]);

  const currentActions = game ? sourceActions(game, legal, selected) : [];
  const chooseTarget = (id: string) => {
    const candidates = currentActions.filter(
      (action) =>
        action.targetId === id ||
        (!action.targetId && action.locationId === id),
    );
    if (candidates.length === 1) doAction(candidates[0]);
    else if (candidates.length) setTarget(id);
  };
  const selectCard = (source: string) => {
    if (!game || review || thinking || paused) return;
    if (game.phase === "mulligan") {
      if (source.startsWith("hand:") && !game.players[0].mulliganDone) {
        const index = Number(source.slice(5));
        setMulligan((current) =>
          current.includes(index)
            ? current.filter((i) => i !== index)
            : current.length < 2
              ? [...current, index]
              : current,
        );
      }
      return;
    }
    if (currentActions.some((action) => action.targetId === source)) {
      chooseTarget(source);
      return;
    }
    if (game.phase === "move") {
      const toggle = legal.find(
        (action) => action.id === `move-toggle:${source}`,
      );
      if (toggle) {
        doAction(toggle);
        return;
      }
    }
    setTarget(null);
    setSelected((current) => (current === source ? null : source));
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setTarget(null);
        setLogOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const selectedPlayerDeck = allDecks.find((d) => d.id === playerDeck);
  const selectedBotDeck = allDecks.find((d) => d.id === botDeck);
  const matchReady = Boolean(
    selectedPlayerDeck &&
    selectedBotDeck &&
    getDeckScriptCoverage(selectedPlayerDeck).complete &&
    getDeckScriptCoverage(selectedBotDeck).complete,
  );
  const visibleDecks = allDecks.filter(
    (d) =>
      deckGroup === "Sve" ||
      (deckGroup === "Precon"
        ? d.source === "Official preconstructed deck"
        : deckGroup === "Trening"
          ? d.source === "Curated practice deck"
          : deckGroup === "Moji"
            ? d.source === "Imported deck"
            : d.product === deckGroup),
  );
  const importDeck = (deck: StarterDeck) => {
    const next = [...importedDecks.filter((d) => d.id !== deck.id), deck];
    try {
      saveImportedDecks(next);
      setImportedDecks(next);
      setPlayerDeck(deck.id);
      setDeckGroup("Moji");
      setImportOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Špil nije sačuvan.");
    }
  };
  const exportDeck = (deck: StarterDeck) => {
    const url = URL.createObjectURL(
      new Blob([exportDeckText(deck)], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${deck.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const start = () => {
    try {
      if (!matchReady)
        throw new Error(
          "Nisu sve karte izabranog špila podržane za igranje. Pogledaj sastav špila.",
        );
      setGame(
        createGame({
          playerDeckId: playerDeck,
          playerDeck: selectedPlayerDeck,
          botDeck: selectedBotDeck,
          botDeckId: botDeck,
          seed: Math.floor(Math.random() * 2147483646) + 1,
        }),
      );
      setReview(null);
      setPaused(false);
      setMulligan([]);
      setTarget(null);
      setSelected(null);
      setError("");
      setScreen("game");
      setConfirmNew(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const chooseDeck = (id: string) => setPlayerDeck(id);
  const header = (
    <header className="topbar">
      <button
        className="brand"
        onClick={() => setScreen("lobby")}
        aria-label={t("Riftbound početna")}
      >
        <span className="brand-symbol">
          <Swords size={28} strokeWidth={2} />
        </span>
        <span>
          RIFTBOUND<small>LEAGUE OF LEGENDS · DUEL LAB</small>
        </span>
      </button>
      <nav aria-label={t("Glavna navigacija")}>
        <button
          className={screen === "lobby" ? "active" : ""}
          onClick={() => setScreen("lobby")}
        >
          <Swords size={16} />
          {t("Arena")}{" "}
        </button>
        <button
          className={screen === "library" ? "active" : ""}
          onClick={() => setScreen("library")}
        >
          <Layers3 size={16} />
          {t("Karte")} <span className="nav-count">{uniqueCards.length}</span>
        </button>
        <button onClick={() => setHelp(true)}>
          <BookOpen size={16} />
          {t("Kako igrati")}{" "}
        </button>
      </nav>
      <div className="header-right">
        <LanguageSelector />
        <span className="local-ai-label">
          <span className="status-dot" /> {t("LOKALNI AI")}
        </span>
        <button
          className="icon-button"
          title={muted ? t("Uključi zvuk") : t("Isključi zvuk")}
          aria-label={muted ? t("Uključi zvuk") : t("Isključi zvuk")}
          onClick={() => setMuted(!muted)}
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
      </div>
    </header>
  );
  return (
    <HighlightContext.Provider
      value={{ ...highlights, game: game || undefined }}
    >
      <div className={`app ${screen === "game" ? "is-game" : ""}`}>
        <a className="skip-link" href="#main-content">
          {t("Preskoči na sadržaj")}{" "}
        </a>
        {screen !== "game" && header}
        {screen === "lobby" && (
          <Lobby
            allDecks={allDecks}
            visibleDecks={visibleDecks}
            playerDeck={selectedPlayerDeck}
            botDeck={selectedBotDeck}
            deckGroup={deckGroup}
            difficulty={difficulty}
            importedCount={importedDecks.length}
            ready={matchReady}
            hasMatch={Boolean(match)}
            matchEnded={Boolean(match && match.winner !== null && !review)}
            onGroup={setDeckGroup}
            onPlayer={chooseDeck}
            onBot={setBotDeck}
            onDifficulty={setDifficulty}
            onStart={() =>
              match && (review || match.winner === null)
                ? setConfirmNew(true)
                : start()
            }
            onResume={() => setScreen("game")}
            onImport={() => setImportOpen(true)}
            onDetails={setDeckDetails}
            onExport={exportDeck}
            onHelp={() => setHelp(true)}
            onLibrary={() => setScreen("library")}
          />
        )}
        {screen === "library" && <Library inspect={setInspected} />}
        {screen === "game" && game && (
          <main className="game-layout" id="main-content">
            <div className="match-toolbar">
              <button
                className="text-button"
                onClick={() => setScreen("lobby")}
              >
                <ArrowLeft size={15} />
                {t("Arena")}{" "}
              </button>
              <strong className="match-brand">
                RIFTBOUND <small>DUEL LAB</small>
              </strong>
              <div className="turn-indicator">
                {t(
                  game.winner !== null
                    ? "Meč završen"
                    : review
                      ? "Resolving effects"
                      : thinking
                        ? "Opponent is playing"
                        : "Your turn",
                )}
              </div>
              <span>
                {" "}
                {t("POTEZ")} {game.turn}
              </span>
              <LanguageSelector />
              <button
                className="icon-button"
                onClick={() => setPaused((value) => !value)}
                aria-label={t(paused ? "Resume game" : "Pause game")}
                title={t(paused ? "Resume game" : "Pause game")}
              >
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button
                className="icon-button"
                onClick={() => setLogOpen(!logOpen)}
                title={t("Dnevnik meča")}
              >
                <History size={18} />
              </button>
              <button
                className="icon-button"
                title={t("Pravila")}
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={18} />
              </button>
            </div>
            <BoardInteraction.Provider
              value={{
                game,
                legal,
                actions: currentActions,
                choose: chooseTarget,
              }}
            >
              <div className="match-content">
                <div className="playmat">
                  <PlayerBar game={game} player={1} inspect={setInspected} />
                  <div className="player-cards opponent-cards">
                    <div className="opponent-hand-section">
                      <div
                        className={`enemy-hand ${highlights.players.has(1) ? "event-highlight" : ""}`}
                        aria-label={t("{count} skrivenih karata protivnika", {
                          count: game.players[1].hand.length,
                        })}
                      >
                        {game.players[1].hand.slice(0, 12).map((_, i) => (
                          <div className="card-back" key={i}>
                            <span>ϟ</span>
                          </div>
                        ))}
                        <span>
                          {game.players[1].hand.length} {t("u ruci ·")}{" "}
                          {game.players[1].deck.length} {t("u špilu")}{" "}
                        </span>
                      </div>
                      <RuneZone game={game} player={1} inspect={setInspected} />
                    </div>
                    <ChampionZone
                      game={game}
                      player={1}
                      legal={legal}
                      selected={selected}
                      select={selectCard}
                      inspect={setInspected}
                    />
                  </div>
                  <BoardZone
                    game={game}
                    location="base:1"
                    title={t("PROTIVNIČKA BAZA")}
                    select={selectCard}
                    selected={selected}
                    inspect={setInspected}
                  />
                  <div className="battlefields">
                    {game.fields.map((field, i) => {
                      const c = findCard(field.cardId);
                      return (
                        <section
                          className={`battlefield ${highlights.fields.has(field.id) ? "event-highlight" : ""} ${field.controller === 0 ? "owned" : field.controller === 1 ? "enemy-owned" : ""} ${game.combat?.fieldId === field.id ? "in-combat" : ""}`}
                          key={field.id}
                        >
                          <div
                            className="field-art"
                            style={{
                              backgroundImage: `url(/art/${i === 0 ? "ancient-altar" : "moonlit-willow"}.webp)`,
                            }}
                          />
                          <div className="field-heading">
                            <div>
                              <span className="eyebrow">
                                {" "}
                                {t("Battlefield {number}", {
                                  number: String(i + 1).padStart(2, "0"),
                                })}
                              </span>
                              <button
                                data-card-preview={c?.id}
                                onClick={() => c && setInspected(c)}
                              >
                                {c?.name || t(locationName(field.id))}
                              </button>
                            </div>
                            <span className="control-badge">
                              {field.controller === null
                                ? t("NEUTRALNO")
                                : field.controller === 0
                                  ? t("TVOJA KONTROLA")
                                  : t("AI KONTROLA")}
                            </span>
                          </div>
                          <Destination location={field.id} />
                          <div className="field-half enemy-side">
                            <UnitRow
                              units={game.units.filter(
                                (u) => u.location === field.id && u.owner === 1,
                              )}
                              select={selectCard}
                              selected={selected}
                              inspect={setInspected}
                            />
                          </div>
                          {(game.hidden ?? []).some(
                            (h) => h.location === field.id,
                          ) && (
                            <div className="hidden-zone">
                              {(game.hidden ?? [])
                                .filter((h) => h.location === field.id)
                                .map((h) => (
                                  <button
                                    key={h.id}
                                    className="hidden-card"
                                    data-card-preview={
                                      h.owner === 0 ? h.cardId : undefined
                                    }
                                    onClick={() =>
                                      h.owner === 0 &&
                                      selectCard(`hidden:${h.id}`)
                                    }
                                    disabled={h.owner !== 0}
                                  >
                                    {h.owner === 0
                                      ? t("Tvoja Hidden: {card}", {
                                          card: findCard(h.cardId)?.name ?? "",
                                        })
                                      : t("AI · Hidden karta")}
                                  </button>
                                ))}
                            </div>
                          )}
                          <div className="field-divider">
                            <span />
                            {game.combat?.fieldId === field.id ? (
                              <Swords size={18} />
                            ) : (
                              <Flag size={16} />
                            )}
                            <span />
                          </div>
                          <div className="field-half">
                            <UnitRow
                              units={game.units.filter(
                                (u) => u.location === field.id && u.owner === 0,
                              )}
                              select={selectCard}
                              selected={selected}
                              inspect={setInspected}
                            />
                            {!game.units.some(
                              (u) => u.location === field.id,
                            ) && (
                              <span className="empty-field">
                                {t("Zauzmi bojište za bod")}{" "}
                              </span>
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <BoardZone
                    game={game}
                    location="base:0"
                    title={t("TVOJA BAZA")}
                    select={selectCard}
                    selected={selected}
                    inspect={setInspected}
                  />
                  <PlayerBar game={game} player={0} inspect={setInspected} />
                  <div className="player-cards">
                    <section className="hand-section">
                      <div className="hand-title">
                        <span>
                          {t("TVOJA RUKA")} <b>{game.players[0].hand.length}</b>
                        </span>
                        <span>{t("Click a card · choose a move below")} </span>
                      </div>
                      <div
                        className="hand"
                        style={
                          {
                            "--hand-count": Math.max(
                              1,
                              game.players[0].hand.length,
                            ),
                          } as React.CSSProperties
                        }
                      >
                        {game.players[0].hand.map((id, i) => {
                          const c = findCard(id);
                          return c ? (
                            <div className="hand-card-wrap" key={`${id}-${i}`}>
                              <Card
                                card={c}
                                selected={
                                  selected === `hand:${i}` ||
                                  mulligan.includes(i) ||
                                  highlights.newCards.has(id)
                                }
                                onClick={() => selectCard(`hand:${i}`)}
                                playable={
                                  game.phase === "mulligan"
                                    ? !game.players[0].mulliganDone
                                    : legal.some(
                                        (a) => a.sourceId === `hand:${i}`,
                                      )
                                }
                                disabled={
                                  game.phase !== "mulligan" &&
                                  !legal.some((a) => a.sourceId === `hand:${i}`)
                                }
                              />
                              <button
                                className="card-info-button"
                                aria-label={t("Detalji {card}", {
                                  card: c.name,
                                })}
                                onClick={() => setInspected(c)}
                              >
                                ⓘ
                              </button>
                            </div>
                          ) : null;
                        })}
                      </div>
                      <RuneZone game={game} player={0} inspect={setInspected} />
                    </section>
                    <ChampionZone
                      game={game}
                      player={0}
                      legal={legal}
                      selected={selected}
                      select={selectCard}
                      inspect={setInspected}
                    />
                  </div>
                </div>
              </div>
              <MatchControls
                game={game}
                legal={legal}
                selected={selected}
                target={target}
                clear={() => {
                  setSelected(null);
                  setTarget(null);
                }}
                act={doAction}
                review={review}
                busy={thinking}
                paused={paused}
                resume={() => setPaused(false)}
                mulligan={mulligan}
              />
            </BoardInteraction.Provider>
            {logOpen && (
              <div className="modal-backdrop" onClick={() => setLogOpen(false)}>
                <section
                  className="modal match-history"
                  role="dialog"
                  aria-modal="true"
                  aria-label={t("Dnevnik meča")}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className="close-button"
                    onClick={() => setLogOpen(false)}
                    aria-label={t("Zatvori")}
                  >
                    ×
                  </button>
                  <h2>{t("Dnevnik meča")}</h2>
                  <CombatPanel
                    game={game}
                    review={review}
                    legal={[]}
                    onAction={doAction}
                    inspect={setInspected}
                  />
                  {[...game.log].reverse().map((entry) => (
                    <p key={entry.id}>
                      <b>{entry.turn}</b> {t(entry.text)}
                    </p>
                  ))}
                </section>
              </div>
            )}
            {!review && game.winner !== null && (
              <div className="result-banner">
                <Trophy size={40} />
                <span className="eyebrow"> {t("DUEL JE ZAVRŠEN")} </span>
                <h2>
                  {game.winner === 0
                    ? t("Pobjeda je tvoja.")
                    : t("Rift pripada protivniku.")}
                </h2>
                <p>
                  {game.players[0].points} : {game.players[1].points} ·{" "}
                  {game.turn} {t("poteza")}{" "}
                </p>
                <button className="gold-button" onClick={start}>
                  {t("Novi duel")} <RotateCcw size={17} />
                </button>
                <button
                  className="text-button"
                  onClick={() => setScreen("lobby")}
                >
                  {t("Promijeni špil")}{" "}
                </button>
              </div>
            )}
          </main>
        )}
        {importOpen && (
          <DeckImport
            onImport={importDeck}
            onClose={() => setImportOpen(false)}
            exampleDeck={selectedPlayerDeck}
          />
        )}
        {deckDetails && (
          <div className="modal-backdrop" onClick={() => setDeckDetails(null)}>
            <section
              className="modal deck-list-modal"
              role="dialog"
              aria-modal="true"
              aria-label={t("Sastav: {deck}", { deck: t(deckDetails.name) })}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="close-button"
                onClick={() => setDeckDetails(null)}
                aria-label={t("Zatvori sastav")}
              >
                ×
              </button>
              <div className="eyebrow">
                {t(deckDetails.product ?? "LOKALNI ŠPIL")}
              </div>
              <h2>{t(deckDetails.name)}</h2>
              <p>
                {t("40 karata · 12 runa ·")}{" "}
                {
                  (deckDetails.battlefieldIds ?? [deckDetails.battlefieldId])
                    .length
                }{" "}
                {t("bojišta")}{" "}
              </p>
              <p>
                {getDeckScriptCoverage(deckDetails).complete
                  ? t("Sve karte su podržane za igranje.")
                  : t(
                      `Još nisu podržane: ${getDeckScriptCoverage(deckDetails)
                        .missing.map((c) => c.name)
                        .join(", ")}`,
                    )}
              </p>
              <div className="deck-preview-list">
                {[
                  {
                    title: "Legenda",
                    entries: [{ cardId: deckDetails.legendId, count: 1 }],
                  },
                  {
                    title: "Izabrani champion",
                    entries: [{ cardId: deckDetails.championId, count: 1 }],
                  },
                  { title: "Glavni špil", entries: deckDetails.main },
                  { title: "Runes", entries: deckDetails.runes },
                  {
                    title: "Bojišta",
                    entries: (
                      deckDetails.battlefieldIds ?? [deckDetails.battlefieldId]
                    ).map((cardId) => ({ cardId, count: 1 })),
                  },
                ].map((group) => (
                  <section key={group.title}>
                    <h3>{t(group.title)}</h3>
                    {group.entries.map((entry, i) => (
                      <button
                        key={`${entry.cardId}-${i}`}
                        data-card-preview={entry.cardId}
                        onClick={() => {
                          const card = findCard(entry.cardId);
                          if (card) setInspected(card);
                        }}
                      >
                        <span>{entry.count}×</span>{" "}
                        {findCard(entry.cardId)?.name ?? entry.cardId}
                        <Search size={13} />
                      </button>
                    ))}
                  </section>
                ))}
              </div>
              <div className="deck-source-links">
                {(
                  deckDetails.sourceUrls ??
                  (deckDetails.sourceUrl ? [deckDetails.sourceUrl] : [])
                ).map((url, i) => (
                  <a href={url} key={url} target="_blank" rel="noreferrer">
                    {t("Izvor liste")} {i + 1} ↗
                  </a>
                ))}
              </div>
              {deckDetails.importNotes?.map((note) => (
                <small key={note}>{t(note)}</small>
              ))}
              <button
                className="gold-button"
                onClick={() => exportDeck(deckDetails)}
              >
                {t("Izvezi .txt")}{" "}
              </button>
            </section>
          </div>
        )}
        {error && (
          <div className="error-toast" role="alert">
            {t(error)}
            <button
              onClick={() => setError("")}
              aria-label={t("Zatvori grešku")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <footer className="footer">
          <span>
            <span className="brand-small">ϟ</span> RIFTBOUND DUEL LAB{" "}
            <span className="footer-dot">·</span>{" "}
            {t("NEZAVISNI FAN PROJEKT")}{" "}
          </span>
          <div>
            <a
              href="https://riftcodex.com/docs/"
              target="_blank"
              rel="noreferrer"
            >
              Riftcodex API ↗
            </a>
            <a
              href="https://playriftbound.com/en-us/rules-hub/"
              target="_blank"
              rel="noreferrer"
            >
              {t("Službena pravila ↗")}{" "}
            </a>
            <button onClick={() => setHelp(true)}> {t("O projektu")} </button>
          </div>
          <p>
            {t(
              "Riftbound Duel Lab isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
            )}{" "}
          </p>
        </footer>
        {inspected && (
          <CardDetail
            card={inspected}
            scripted={supported(inspected)}
            onClose={() => setInspected(null)}
          />
        )}
        {help && <Help close={() => setHelp(false)} />}
        {confirmNew && (
          <div className="modal-backdrop">
            <section className="modal small-modal">
              <h2> {t("Započni novi duel?")} </h2>
              <p> {t("Trenutni sačuvani meč bit će zamijenjen novim.")} </p>
              <button className="gold-button" onClick={start}>
                {t("Započni novi duel")}{" "}
              </button>
              <button
                className="outline-button"
                onClick={() => {
                  setConfirmNew(false);
                  setScreen("game");
                }}
              >
                {t("Nastavi trenutni")}{" "}
              </button>
            </section>
          </div>
        )}
      </div>
    </HighlightContext.Provider>
  );
}

function PlayerBar({
  game,
  player,
  inspect,
}: {
  game: GameState;
  player: 0 | 1;
  inspect: (c: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const h = useHighlights();
  const p = game.players[player],
    legend = findCard(p.legendId);
  return (
    <div
      className={`player-bar player-${player} ${h.players.has(player) ? "event-highlight" : ""}`}
    >
      <button
        className="legend-portrait"
        data-card-preview={legend?.id}
        data-card-ready={p.legendUsedTurn < 0}
        onClick={() => legend && inspect(legend)}
        title={legend?.name}
      >
        {legend && <img src={cardArtUrl(legend)} alt={legend.name} />}
      </button>
      <div className="player-name">
        <strong>{player === 0 ? t("Ti") : t("Sparring AI")}</strong>
        <small>{legend?.name}</small>
      </div>
      <div className="score">
        <span>{p.points}</span>
        <small>/ 8</small>
        <div className="score-pips">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} className={i < p.points ? "filled" : ""} />
          ))}
        </div>
      </div>
    </div>
  );
}
function RuneZone({
  game,
  player,
  inspect,
}: {
  game: GameState;
  player: 0 | 1;
  inspect: (c: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const h = useHighlights();
  const p = game.players[player];
  return (
    <section
      className={`rune-area rune-zone ${h.players.has(player) ? "event-highlight" : ""}`}
      aria-label={t(player === 0 ? "Your runes" : "Opponent runes")}
    >
      <div className="rune-zone-heading">
        <span>{t("Runes")}</span>
        <small>
          {p.runes.filter((r) => r.ready).length} {t("spremnih ·")} {p.energy}{" "}
          {t("energije ·")} {p.runeDeck.length} {t("u špilu")}{" "}
          {p.power ? t(" · {count} univerzalne moći", { count: p.power }) : ""}
          {p.xp ? ` · ${p.xp} XP` : ""}
        </small>
      </div>
      <div className="rune-orbs">
        {p.runes.map((r) => (
          <RuneCard key={r.id} rune={r} inspect={inspect} />
        ))}
      </div>
    </section>
  );
}
function UnitRow({
  units,
  select,
  selected,
  inspect,
}: {
  units: Unit[];
  select: (id: string) => void;
  selected: string | null;
  inspect: (c: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const h = useHighlights();
  const interaction = useContext(BoardInteraction);
  return (
    <>
      {units.map((u) => {
        const c = findCard(u.cardId);
        return c ? (
          <div
            className={`unit-wrap ${h.units.has(u.id) ? "event-highlight" : ""}`}
            key={u.id}
          >
            <Card
              card={c}
              small
              ready={u.ready}
              damage={u.damage}
              might={
                interaction.game
                  ? getMight(interaction.game, u)
                  : (c.might || 0) + u.buff + u.temporaryMight
              }
              selected={
                selected === u.id ||
                interaction.actions.some((a) => a.targetId === u.id) ||
                !!interaction.game?.pendingMove?.unitIds.includes(u.id)
              }
              playable={
                interaction.legal.some((a) => a.sourceId === u.id) ||
                interaction.actions.some((a) => a.targetId === u.id)
              }
              onClick={() => select(u.id)}
            />
            <div className="unit-power">
              <Shield size={10} />
              {interaction.game
                ? getMight(interaction.game, u)
                : (c.might || 0) + u.buff + u.temporaryMight}
              {u.buff > 0 && <span> +</span>}
              {u.empowered && <span title={t("Empowered")}> ✦</span>}
            </div>
            <button
              className="unit-info"
              onClick={() => inspect(c)}
              aria-label={t("Detalji {card}", { card: c.name })}
            >
              ⓘ
            </button>
          </div>
        ) : null;
      })}
    </>
  );
}
function Destination({ location }: { location: LocationId }) {
  const { t } = useI18n();
  const { actions, choose } = useContext(BoardInteraction);
  const options = actions.filter(
    (action) =>
      action.locationId === location &&
      !action.targetId &&
      !action.id.startsWith("move-toggle:"),
  );
  if (
    !options.length ||
    options.every((action) => action.id === "move-confirm")
  )
    return null;
  return (
    <button className="destination-button" onClick={() => choose(location)}>
      {t(
        options.every((action) => action.category === "move")
          ? "Move here"
          : "Play here",
      )}{" "}
      <ArrowRight size={13} />
    </button>
  );
}
function BoardZone({
  game,
  location,
  title,
  select,
  selected,
  inspect,
}: {
  game: GameState;
  location: LocationId;
  title: string;
  select: (id: string) => void;
  selected: string | null;
  inspect: (c: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const h = useHighlights();
  const units = game.units.filter((u) => u.location === location);
  return (
    <section
      className={`base-zone ${h.fields.has(location) ? "event-highlight" : ""}`}
    >
      <span className="zone-label">{t(title)}</span>
      <Destination location={location} />
      <div className="base-units">
        <UnitRow
          units={units}
          select={select}
          selected={selected}
          inspect={inspect}
        />
        {!units.length && (
          <span className="empty-base">
            {t(
              "Jedinice ulaze iscrpljene. Pripremi ih za sljedeći potez.",
            )}{" "}
          </span>
        )}
        {game.gears
          .filter((g) => g.owner === (location === "base:0" ? 0 : 1))
          .map((g) => {
            const c = findCard(g.cardId);
            return c ? (
              <GearChip
                card={c}
                ready={g.ready}
                key={g.id}
                onClick={() => select(g.id)}
              />
            ) : null;
          })}
      </div>
    </section>
  );
}
function Library({ inspect }: { inspect: (c: CatalogCard) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState(""),
    [domain, setDomain] = useState("Sve domene"),
    [type, setType] = useState("Sve vrste"),
    [onlyScripted, setOnlyScripted] = useState(false),
    [limit, setLimit] = useState(60);
  const filtered = useMemo(
    () =>
      uniqueCards.filter(
        (c) =>
          (!search ||
            `${c.name} ${c.text}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (domain === "Sve domene" || c.domains.includes(domain)) &&
          (type === "Sve vrste" || c.type === type) &&
          (!onlyScripted || supported(c)),
      ),
    [search, domain, type, onlyScripted],
  );
  return (
    <main className="library" id="main-content">
      <div className="eyebrow"> {t("RIFTCODEX · KATALOG KARATA")} </div>
      <h1>
        {t("Znanje je prednost")}
        <span>.</span>
      </h1>
      <p>
        {t(
          "Originalne karte i tekstovi efekata. Oznaka „Podržana” znači da je karta podržana u meču.",
        )}{" "}
      </p>
      <div className="library-filters">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label={t("Pretraži karte")}
            placeholder={t("Pretraži ime ili tekst karte…")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(60);
            }}
          />
        </div>
        <select
          aria-label={t("Domena")}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          {["Sve domene", "Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map(
            (d) => (
              <option key={d} value={d}>
                {t(d)}
              </option>
            ),
          )}
        </select>
        <select
          aria-label={t("Vrsta karte")}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {[
            "Sve vrste",
            "Unit",
            "Spell",
            "Gear",
            "Legend",
            "Battlefield",
            "Rune",
          ].map((d) => (
            <option key={d} value={d}>
              {t(d)}
            </option>
          ))}
        </select>
        <label className="scripted-filter">
          <input
            type="checkbox"
            checked={onlyScripted}
            onChange={(e) => setOnlyScripted(e.target.checked)}
          />
          {t("Samo podržane za igranje")}{" "}
        </label>
      </div>
      <div className="catalog-count">
        {filtered.length} {t("KARATA")}{" "}
        <span> {t("Podaci su spremljeni lokalno uz aplikaciju")} </span>
      </div>
      <div className="catalog-grid">
        {filtered.slice(0, limit).map((c) => (
          <div key={c.id}>
            <Card card={c} onClick={() => inspect(c)} />
            <div className="catalog-card-name">
              <strong>{c.name}</strong>
              <span
                className={supported(c) ? "scripted-badge" : "catalog-badge"}
              >
                {supported(c) ? t("● Podržana") : c.set}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-search">
          <Search size={32} />
          <h3> {t("Nema pronađenih karata")} </h3>
          <p> {t("Pokušaj s drugim imenom ili filterima.")} </p>
        </div>
      )}
      {filtered.length > limit && (
        <button
          className="outline-button load-more"
          onClick={() => setLimit((l) => l + 60)}
        >
          {t("Prikaži još karata")} <ArrowRight size={16} />
        </button>
      )}
    </main>
  );
}
function Help({ close }: { close: () => void }) {
  const { t } = useI18n();
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("Kako igrati")}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close-button"
          onClick={close}
          aria-label={t("Zatvori")}
        >
          ×
        </button>
        <div className="eyebrow"> {t("TVOJ PRVI DUEL")} </div>
        <h2>
          {t("Osvoji bojišta.")} <br />
          <em> {t("Zadrži prednost.")} </em>
        </h2>
        <div className="help-grid">
          {[
            [
              "01",
              "Pripremi ruku",
              "Start with 4 cards and replace up to 2 once. Your Legend starts in its zone with its effects. Your chosen champion starts in a separate zone; pay its cost to play it.",
            ],
            [
              "02",
              "Upravljaj runama",
              "Na početku poteza pripremaš karte i dobijaš 2 rune. Iscrpi runu za energiju; recikliraj je za power njene domene. Plaćanje karata radi automatski.",
            ],
            [
              "03",
              "Pošalji jedinice",
              "Select a ready unit, then a highlighted battlefield. Add other units if you want, then confirm the move below.",
            ],
            [
              "04",
              "Odgovori na protivnika",
              "Showdown daje objema stranama priliku za Action i Reaction karte. Lanac efekata rješava se od posljednjeg odigranog.",
            ],
            [
              "05",
              "Riješi borbu",
              "Click highlighted enemies to assign combat damage. Both sides deal damage simultaneously. Open the match log for combat details.",
            ],
            [
              "06",
              "Stigni do 8",
              "Bod dobijaš osvajanjem ili držanjem bojišta na početku poteza. Za osmi bod osvajanjem moraš bodovati oba bojišta u tom potezu.",
            ],
          ].map(([n, heading, p]) => (
            <div key={n}>
              <span>{n}</span>
              <h3>{t(heading)}</h3>
              <p>{t(p)}</p>
            </div>
          ))}
        </div>
        <div className="scope-note">
          <h3> {t("One place for every decision")} </h3>
          <p>
            {t(
              "Select a card on the board and choose its move in the bottom bar. The opponent and effects advance automatically. The game waits whenever you have a real choice. Pause at any time or open the log to review what happened.",
            )}{" "}
          </p>
          <h3> {t("Podrška i izvori")} </h3>
          <p>
            {t(
              "Ovo je nezavisni eksperimentalni simulator. Dostupni špilovi sadrže karte podržane za igranje; puni katalog sadrži i karte koje još nisu podržane. Nije potpuna digitalna implementacija svih objavljenih Riftbound setova.",
            )}{" "}
          </p>
          <p>
            {t(
              "Riotova Digital Tools Policy ne odobrava automatizovane Riftbound simulatore. Ovaj projekt nema Riot odobrenje.",
            )}{" "}
          </p>
          <a
            href="https://developer.riotgames.com/docs/riftbound"
            target="_blank"
            rel="noreferrer"
          >
            Riot Digital Tools Policy ↗
          </a>{" "}
          ·{" "}
          <a
            href="https://playriftbound.com/en-us/rules-hub/"
            target="_blank"
            rel="noreferrer"
          >
            {t("Službena pravila ↗")}{" "}
          </a>
        </div>
        <button className="gold-button" onClick={close}>
          {t("Spreman za duel")} <Swords size={17} />
        </button>
      </section>
    </div>
  );
}
