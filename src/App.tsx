import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Flag,
  History,
  Layers3,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
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
import { practiceCardIds } from "./data/decks";
import { readableText } from "./data/cards";
import { Card, CardDetail } from "./components/Card";
import {
  createGame,
  getLegalActions,
  applyActionStepped,
  getMight,
} from "./game/engine";
import { getBotAction } from "./game/bot";
import { decks } from "./data/decks";
import {
  StepFlow,
  HighlightContext,
  getHighlights,
  useHighlights,
} from "./components/StepFlow";
import type { Review } from "./components/StepFlow";
import { scripts } from "./game/scripts";
import type { GameAction, GameState, LocationId, Unit } from "./game/types";

const freshRead = () => {
  try {
    return parseSession(localStorage.getItem(SAVE_KEY));
  } catch {
    return { match: null, review: null };
  }
};
const supported = (c: CatalogCard) =>
  Boolean(scripts[c.id]) || practiceCardIds.has(c.id);
const uniqueCards = catalog.filter((c) => !c.variant);
const phaseNames: Record<string, string> = {
  mulligan: "Početna ruka",
  main: "Glavna faza",
  showdown: "Showdown · reakcije",
  move: "Priprema pokreta",
  damage: "Dodjela štete",
  choice: "Odaberi efekat",
  ended: "Kraj meča",
};
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
  const [screen, setScreen] = useState<"lobby" | "game" | "library">("lobby");
  const [saved] = useState(freshRead);
  const [match, setGame] = useState<GameState | null>(saved.match);
  const [review, setReview] = useState<Review | null>(saved.review);
  const game = review?.frames[review.index]?.state || match;
  const highlights = useMemo(() => getHighlights(review), [review]);
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
    () => (match && !review ? getLegalActions(match, 0) : []),
    [match, review],
  );
  useEffect(() => {
    if (match)
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ match, review }));
      } catch {}
  }, [match, review]);
  const doAction = (action: GameAction) => {
    if (!match || review) return;
    try {
      const result = applyActionStepped(match, action.id);
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
      if (!["move", "resource"].includes(action.category)) setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nevažeći potez");
    }
  };
  const proceed = () => {
    if (review) {
      if (review.index < review.frames.length - 1)
        setReview({ ...review, index: review.index + 1 });
      else setReview(null);
      if (!muted) sound();
      return;
    }
    if (match && botActions.length) {
      const action =
        difficulty === "Trening" &&
        match.phase === "main" &&
        !match.stack.length
          ? botActions.find((a) => a.category === "play") || getBotAction(match)
          : getBotAction(match);
      if (action) {
        const found =
          typeof action === "string"
            ? botActions.find((a) => a.id === action)
            : action;
        if (found) doAction(found);
      }
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !e.repeat &&
        e.code === "Space" &&
        screen === "game" &&
        !help &&
        !inspected &&
        (review || thinking) &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLSelectElement) &&
        !(e.target instanceof HTMLButtonElement)
      ) {
        e.preventDefault();
        proceed();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [review, thinking, match, screen, help, inspected]);
  const start = () => {
    try {
      setGame(
        createGame({
          playerDeckId: playerDeck,
          botDeckId: botDeck,
          seed: Math.floor(Math.random() * 2147483646) + 1,
        }),
      );
      setReview(null);
      setSelected(null);
      setError("");
      setScreen("game");
      setConfirmNew(false);
    } catch (e) {
      setError(String(e));
    }
  };
  const chooseDeck = (id: string) => setPlayerDeck(id);
  const header = (
    <header className="topbar">
      <button
        className="brand"
        onClick={() => setScreen("lobby")}
        aria-label="Riftbound početna"
      >
        <span className="brand-symbol">ϟ</span>
        <span>
          RIFTBOUND<small>DUEL LAB</small>
        </span>
      </button>
      <nav>
        <button
          className={screen === "lobby" ? "active" : ""}
          onClick={() => setScreen("lobby")}
        >
          <Swords size={16} />
          Arena
        </button>
        <button
          className={screen === "library" ? "active" : ""}
          onClick={() => setScreen("library")}
        >
          <Layers3 size={16} />
          Karte <span className="nav-count">{uniqueCards.length}</span>
        </button>
        <button onClick={() => setHelp(true)}>
          <BookOpen size={16} />
          Kako igrati
        </button>
      </nav>
      <div className="header-right">
        <span className="status-dot" /> LOKALNI AI{" "}
        <button
          className="icon-button"
          title={muted ? "Uključi zvuk" : "Isključi zvuk"}
          aria-label={muted ? "Uključi zvuk" : "Isključi zvuk"}
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
        {header}
        {screen === "lobby" && (
          <main className="lobby">
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> 1V1 · TI PROTIV AI BOTA
                </div>
                <h1>
                  Svako bojište.
                  <br />
                  <em>Tvoja odluka.</em>
                </h1>
                <p>
                  Sastavi taktiku. Zauzmi bojišta. Osvoji Rift.
                  <br />
                  Karte, rune i borba — sve za tvoj sljedeći duel.
                </p>
                <div className="hero-actions">
                  <button
                    className="gold-button"
                    onClick={() =>
                      match && (review || match.winner === null)
                        ? setConfirmNew(true)
                        : start()
                    }
                  >
                    Uđi u arenu <Swords size={19} />
                  </button>
                  {match && (
                    <button
                      className="outline-button"
                      onClick={() => setScreen("game")}
                    >
                      {match.winner !== null && !review
                        ? "Pregledaj meč"
                        : "Nastavi meč"}{" "}
                      <ArrowRight size={17} />
                    </button>
                  )}
                </div>
                <div className="hero-facts">
                  <span>
                    <Shield size={15} />
                    Automatska pravila
                  </span>
                  <span>
                    <Crosshair size={15} />
                    Taktički protivnik
                  </span>
                  <span>
                    <Zap size={15} />
                    Bez API ključa
                  </span>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbital orbital-one" />
                <div className="orbital orbital-two" />
                <span className="hero-rune">ϟ</span>
                {decks.slice(0, 3).map((d, i) => {
                  const c = findCard(d.championId);
                  return c ? (
                    <div key={d.id} className={`hero-card hero-card-${i}`}>
                      <img src={cardArtUrl(c)} alt="" />
                      <div className="hero-card-glow" />
                    </div>
                  ) : null;
                })}
                <div className="hero-caption">
                  <span className="gold-line" /> TVOJ POTEZ MIJENJA SVE{" "}
                  <span className="gold-line" />
                </div>
              </div>
            </section>
            <section className="deck-section">
              <div className="section-title">
                <div>
                  <div className="eyebrow">PRIPREMI SE ZA DUEL</div>
                  <h2>
                    Izaberi svoj špil<span>.</span>
                  </h2>
                </div>
                <p>Svaki dostupan špil ima skriptovane karte i efekte.</p>
              </div>
              <div className="deck-grid">
                {decks.map((deck, i) => {
                  const c = findCard(deck.championId);
                  return (
                    <button
                      key={deck.id}
                      className={`deck-tile ${playerDeck === deck.id ? "chosen" : ""}`}
                      onClick={() => chooseDeck(deck.id)}
                      style={
                        {
                          "--deck-color":
                            domainColors[c?.domains[0] || ""] || "#e5b36a",
                        } as React.CSSProperties
                      }
                    >
                      {c && (
                        <img className="deck-art" src={cardArtUrl(c)} alt="" />
                      )}
                      <div className="deck-overlay" />
                      <div className="deck-top">
                        <span>0{i + 1}</span>
                        <span className="deck-selected">
                          {playerDeck === deck.id ? (
                            <Check size={15} />
                          ) : (
                            <ChevronRight size={15} />
                          )}
                        </span>
                      </div>
                      <div className="deck-copy">
                        <span className="deck-domains">
                          {findCard(deck.legendId)?.domains.join(" + ")}
                        </span>
                        <h3>{deck.name}</h3>
                        <p>{deck.description}</p>
                        <div className="deck-bottom">
                          <span>40 KARATA</span>
                          <span>
                            {playerDeck === deck.id
                              ? "ODABRAN"
                              : "ODABERI ŠPIL"}{" "}
                            <ArrowRight size={13} />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="match-settings">
                <div className="bot-avatar">
                  <Crosshair size={22} />
                </div>
                <div>
                  <strong>Tvoj protivnik</strong>
                  <small>
                    AI donosi odluke koristeći vidljivo stanje igre.
                  </small>
                </div>
                <label>
                  Špil protivnika
                  <select
                    aria-label="Špil protivnika"
                    value={botDeck}
                    onChange={(e) => setBotDeck(e.target.value)}
                  >
                    {decks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Stil igre
                  <select
                    aria-label="Stil AI igre"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                  >
                    <option>Taktički</option>
                    <option>Trening</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="lobby-bottom">
              <div>
                <Flag size={21} />
                <h3>Dva bojišta. Osam bodova.</h3>
                <p>
                  Osvajaj i zadrži kontrolu. Osmi bod traži dobro tempiran
                  završni potez.
                </p>
                <button className="text-button" onClick={() => setHelp(true)}>
                  Nauči osnove <ArrowRight size={14} />
                </button>
              </div>
              <div>
                <Layers3 size={21} />
                <h3>Upoznaj svaku kartu.</h3>
                <p>
                  Pretraži pravi Riftcodex katalog, tekstove efekata i podršku
                  za igranje.
                </p>
                <button
                  className="text-button"
                  onClick={() => setScreen("library")}
                >
                  Otvori biblioteku <ArrowRight size={14} />
                </button>
              </div>
              <div>
                <History size={21} />
                <h3>Vrati se svom duelu.</h3>
                <p>
                  Meč se automatski čuva u ovom browseru nakon svakog poteza.
                </p>
                <span className="local-tag">
                  <span className="status-dot" /> SAČUVANO LOKALNO
                </span>
              </div>
            </section>
          </main>
        )}
        {screen === "library" && <Library inspect={setInspected} />}
        {screen === "game" && game && (
          <main className="game-layout">
            <div className="match-toolbar">
              <button
                className="text-button"
                onClick={() => setScreen("lobby")}
              >
                <ArrowLeft size={15} />
                Arena
              </button>
              <div className="turn-indicator">
                <span className={thinking ? "pulse-dot" : "status-dot"} />
                {review
                  ? "Pregled akcije · Proceed"
                  : thinking
                    ? "AI čeka Proceed"
                    : game.winner !== null
                      ? "Meč završen"
                      : legal.length
                        ? "Ti si na potezu"
                        : "Protivnikov potez"}
              </div>
              <span>POTEZ {game.turn}</span>
              <button
                className="icon-button"
                onClick={() => setLogOpen(!logOpen)}
                title="Dnevnik meča"
              >
                <History size={18} />
              </button>
              <button
                className="icon-button"
                title="Pravila"
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={18} />
              </button>
            </div>
            <StepFlow
              review={review}
              botPending={thinking}
              onProceed={proceed}
            />
            <div className="match-content">
              <div className="playmat">
                <PlayerBar game={game} player={1} inspect={setInspected} />
                <div
                  className={`enemy-hand ${highlights.players.has(1) ? "event-highlight" : ""}`}
                  aria-label={`${game.players[1].hand.length} skrivenih karata protivnika`}
                >
                  {game.players[1].hand.slice(0, 12).map((_, i) => (
                    <div className="card-back" key={i}>
                      <span>ϟ</span>
                    </div>
                  ))}
                  <span>
                    {game.players[1].hand.length} u ruci ·{" "}
                    {game.players[1].deck.length} u špilu
                  </span>
                </div>
                <BoardZone
                  game={game}
                  location="base:1"
                  title="PROTIVNIČKA BAZA"
                  select={setSelected}
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
                            <span className="eyebrow">BOJIŠTE 0{i + 1}</span>
                            <button onClick={() => c && setInspected(c)}>
                              {c?.name || locationName(field.id)}
                            </button>
                          </div>
                          <span className="control-badge">
                            {field.controller === null
                              ? "NEUTRALNO"
                              : field.controller === 0
                                ? "TVOJA KONTROLA"
                                : "AI KONTROLA"}
                          </span>
                        </div>
                        <div className="field-half enemy-side">
                          <UnitRow
                            units={game.units.filter(
                              (u) => u.location === field.id && u.owner === 1,
                            )}
                            select={setSelected}
                            selected={selected}
                            inspect={setInspected}
                          />
                        </div>
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
                            select={setSelected}
                            selected={selected}
                            inspect={setInspected}
                          />
                          {!game.units.some((u) => u.location === field.id) && (
                            <span className="empty-field">
                              Zauzmi bojište za bod
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
                  title="TVOJA BAZA"
                  select={setSelected}
                  selected={selected}
                  inspect={setInspected}
                />
                <PlayerBar game={game} player={0} inspect={setInspected} />
                <section className="hand-section">
                  <div className="hand-title">
                    <span>
                      TVOJA RUKA <b>{game.players[0].hand.length}</b>
                    </span>
                    <span>Odaberi kartu za poteze · ⓘ za detalje</span>
                  </div>
                  <div className="hand">
                    {game.players[0].hand.map((id, i) => {
                      const c = findCard(id);
                      return c ? (
                        <div className="hand-card-wrap" key={`${id}-${i}`}>
                          <Card
                            card={c}
                            selected={
                              selected === `hand:${i}` ||
                              highlights.newCards.has(id)
                            }
                            onClick={() => setSelected(`hand:${i}`)}
                            disabled={
                              !legal.some(
                                (a) => a.cardId === id && a.category === "play",
                              )
                            }
                          />
                          <button
                            className="card-info-button"
                            aria-label={`Detalji ${c.name}`}
                            onClick={() => setInspected(c)}
                          >
                            ⓘ
                          </button>
                        </div>
                      ) : null;
                    })}
                    {game.players[0].championAvailable &&
                      (() => {
                        const c = findCard(game.players[0].championId);
                        return c ? (
                          <div className="champion-in-hand">
                            <span>CHAMPION</span>
                            <Card
                              card={c}
                              selected={selected === "champion"}
                              onClick={() => setSelected("champion")}
                            />
                          </div>
                        ) : null;
                      })()}
                  </div>
                </section>
              </div>
              <aside className="action-sidebar">
                <div className="phase-panel">
                  <span className="eyebrow">TOK MEČA</span>
                  <h3>{phaseNames[game.phase]}</h3>
                  <div className="phase-track">
                    {["Priprema", "Rune", "Karta", "Akcije"].map((p, i) => (
                      <span className={i === 3 ? "current" : ""} key={p}>
                        {i < 3 ? <Check size={11} /> : <span />}
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
                {review ? (
                  <div className="review-lock">
                    <Clock3 size={24} />
                    <h3>Pregledaj ovaj korak</h3>
                    <p>
                      Igra je zaustavljena. Pritisni <strong>Proceed</strong>{" "}
                      iznad table kada si spreman nastaviti.
                    </p>
                    {highlights.removed.map((u) => (
                      <div className="removed-unit" key={u.id}>
                        <span>✕</span>
                        {findCard(u.cardId)?.name}
                        <small>uklonjena s table</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ActionPanel
                    game={game}
                    legal={legal}
                    selected={selected}
                    clear={() => setSelected(null)}
                    doAction={doAction}
                    inspect={setInspected}
                    thinking={thinking}
                  />
                )}
                {game.stack.length > 0 && (
                  <div className="stack-panel">
                    <span className="eyebrow">
                      LANAC EFEKATA · {game.stack.length}
                    </span>
                    {[...game.stack].reverse().map((s) => (
                      <div key={s.id}>
                        <Zap size={13} />
                        <span>{findCard(s.cardId)?.name}</span>
                        <small>{s.player === 0 ? "TI" : "AI"}</small>
                      </div>
                    ))}
                    <small>Posljednji dodani efekat rješava se prvi.</small>
                  </div>
                )}
                <div className={`log-panel ${logOpen ? "expanded" : ""}`}>
                  <span className="eyebrow">
                    <History size={13} /> DNEVNIK MEČA
                  </span>
                  <div className="log-entries">
                    {game.log
                      .slice(-16)
                      .reverse()
                      .map((l) => (
                        <p className={`log-${l.kind}`} key={l.id}>
                          <span>{l.turn.toString().padStart(2, "0")}</span>
                          {l.text}
                        </p>
                      ))}
                  </div>
                </div>
                <div className="autosave">
                  <span className="status-dot" /> Meč se automatski čuva
                </div>
              </aside>
            </div>
            {!review && game.winner !== null && (
              <div className="result-banner">
                <Trophy size={40} />
                <span className="eyebrow">DUEL JE ZAVRŠEN</span>
                <h2>
                  {game.winner === 0
                    ? "Pobjeda je tvoja."
                    : "Rift pripada protivniku."}
                </h2>
                <p>
                  {game.players[0].points} : {game.players[1].points} ·{" "}
                  {game.turn} poteza
                </p>
                <button className="gold-button" onClick={start}>
                  Novi duel <RotateCcw size={17} />
                </button>
                <button
                  className="text-button"
                  onClick={() => setScreen("lobby")}
                >
                  Promijeni špil
                </button>
              </div>
            )}
          </main>
        )}
        {error && (
          <div className="error-toast" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Zatvori grešku">
              <X size={16} />
            </button>
          </div>
        )}
        <footer className="footer">
          <span>
            <span className="brand-small">ϟ</span> RIFTBOUND DUEL LAB{" "}
            <span className="footer-dot">·</span> NEZAVISNI FAN PROJEKT
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
              Službena pravila ↗
            </a>
            <button onClick={() => setHelp(true)}>O projektu</button>
          </div>
          <p>
            Riftbound Duel Lab isn't endorsed by Riot Games and doesn't reflect
            the views or opinions of Riot Games or anyone officially involved in
            producing or managing Riot Games properties. Riot Games and all
            associated properties are trademarks or registered trademarks of
            Riot Games, Inc.
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
              <h2>Započni novi duel?</h2>
              <p>Trenutni sačuvani meč bit će zamijenjen novim.</p>
              <button className="gold-button" onClick={start}>
                Započni novi duel
              </button>
              <button
                className="outline-button"
                onClick={() => {
                  setConfirmNew(false);
                  setScreen("game");
                }}
              >
                Nastavi trenutni
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
  const h = useHighlights();
  const p = game.players[player],
    legend = findCard(p.legendId);
  return (
    <div
      className={`player-bar player-${player} ${h.players.has(player) ? "event-highlight" : ""}`}
    >
      <button
        className="legend-portrait"
        onClick={() => legend && inspect(legend)}
        title={legend?.name}
      >
        {legend && <img src={cardArtUrl(legend)} alt={legend.name} />}
      </button>
      <div className="player-name">
        <strong>{player === 0 ? "Ti" : "Sparring AI"}</strong>
        <small>{legend?.name}</small>
      </div>
      <div className="rune-area">
        <div className="rune-orbs">
          {p.runes.map((r) => (
            <span
              key={r.id}
              className={`rune ${r.ready ? "ready" : "spent"}`}
              style={
                {
                  "--rune-color": domainColors[r.domain] || "#a384dd",
                } as React.CSSProperties
              }
              title={`${r.domain} · ${r.ready ? "spremna" : "iscrpljena"}`}
            >
              ◈
            </span>
          ))}
        </div>
        <small>
          {p.runes.filter((r) => r.ready).length} spremnih · {p.energy} energije
          · {p.runeDeck.length} u špilu
        </small>
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
  const h = useHighlights();
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
              selected={selected === u.id}
              onClick={() => select(u.id)}
            />
            <div className="unit-power">
              <Shield size={10} />
              {h.game
                ? getMight(h.game, u)
                : (c.might || 0) + u.buff + u.temporaryMight}
              {u.buff > 0 && <span> +</span>}
            </div>
            <button
              className="unit-info"
              onClick={() => inspect(c)}
              aria-label={`Detalji ${c.name}`}
            >
              ⓘ
            </button>
          </div>
        ) : null;
      })}
    </>
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
  const h = useHighlights();
  const units = game.units.filter((u) => u.location === location);
  return (
    <section
      className={`base-zone ${h.fields.has(location) ? "event-highlight" : ""}`}
    >
      <span className="zone-label">{title}</span>
      <div className="base-units">
        <UnitRow
          units={units}
          select={select}
          selected={selected}
          inspect={inspect}
        />
        {!units.length && (
          <span className="empty-base">
            Jedinice ulaze iscrpljene. Pripremi ih za sljedeći potez.
          </span>
        )}
        {game.gears
          .filter((g) => g.owner === (location === "base:0" ? 0 : 1))
          .map((g) => {
            const c = findCard(g.cardId);
            return c ? (
              <button
                className="gear-chip"
                key={g.id}
                onClick={() => select(g.id)}
              >
                <Shield size={13} />
                {c.name}
              </button>
            ) : null;
          })}
      </div>
    </section>
  );
}
function ActionPanel({
  game,
  legal,
  selected,
  clear,
  doAction,
  inspect,
  thinking,
}: {
  game: GameState;
  legal: GameAction[];
  selected: string | null;
  clear: () => void;
  doAction: (a: GameAction) => void;
  inspect: (c: CatalogCard) => void;
  thinking: boolean;
}) {
  const cardId = selected?.startsWith("hand:")
    ? game.players[0].hand[Number(selected.split(":")[1])]
    : selected === "champion"
      ? game.players[0].championId
      : game.units.find((u) => u.id === selected)?.cardId ||
        game.gears.find((g) => g.id === selected)?.cardId;
  const c = findCard(cardId);
  const [mulligan, setMulligan] = useState<number[]>([]);
  const mainActions = legal.filter(
    (a) => !["pass", "end"].includes(a.category),
  );
  const actions =
    selected && !["move", "choice", "damage"].includes(game.phase)
      ? mainActions.filter(
          (a) =>
            a.sourceId === selected ||
            (!selected.startsWith("hand:") &&
              selected !== "champion" &&
              (a.unitIds?.includes(selected) ||
                a.targetId?.split("~").includes(selected))),
        )
      : mainActions;
  const ending = legal.filter((a) => ["pass", "end"].includes(a.category));
  if (game.phase === "mulligan" && game.players[0].mulliganDone)
    return (
      <div className="action-panel">
        <h3>Početna ruka potvrđena</h3>
        <p>Protivnik čeka tvoj Proceed prije odabira svoje ruke.</p>
      </div>
    );
  if (game.phase === "mulligan")
    return (
      <div className="action-panel">
        <h3>Izaberi početnu ruku</h3>
        <p>
          Možeš zamijeniti najviše dvije karte. Odaberi ih ovdje, zatim potvrdi.
        </p>
        <div className="mulligan-list">
          {game.players[0].hand.map((id, i) => (
            <button
              className={mulligan.includes(i) ? "active" : ""}
              key={i}
              onClick={() =>
                setMulligan((m) =>
                  m.includes(i)
                    ? m.filter((j) => j !== i)
                    : m.length < 2
                      ? [...m, i]
                      : m,
                )
              }
            >
              <span className="check-box">
                {mulligan.includes(i) && <Check size={12} />}
              </span>
              {findCard(id)?.name}
            </button>
          ))}
        </div>
        <button
          className="gold-button full"
          disabled={!legal.some((a) => a.category === "mulligan")}
          onClick={() => {
            const a =
              legal.find(
                (a) =>
                  a.category === "mulligan" &&
                  JSON.stringify([...(a.cardIndices || [])].sort()) ===
                    JSON.stringify([...mulligan].sort()),
              ) || legal.find((a) => a.category === "mulligan");
            if (a) {
              doAction(a);
              setMulligan([]);
            }
          }}
        >
          {mulligan.length
            ? `Zamijeni ${mulligan.length} karte`
            : "Zadrži ruku"}
          <ArrowRight size={16} />
        </button>
      </div>
    );
  return (
    <div className="action-panel">
      <div className="action-panel-heading">
        <h3>
          {c?.name ||
            (game.phase === "damage" ? "Dodijeli štetu" : "Tvoji potezi")}
        </h3>
        {selected && (
          <button
            className="icon-button"
            aria-label="Poništi odabir"
            onClick={clear}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {c && (
        <>
          <p className="selected-card-text">{readableText(c.text)}</p>
          <button className="text-button small-text" onClick={() => inspect(c)}>
            Pogledaj kartu <Search size={12} />
          </button>
        </>
      )}
      {!selected && (
        <p>
          {thinking
            ? "AI čeka tvoj Proceed iznad table."
            : "Odaberi kartu ili jedinicu na stolu, ili potez s liste."}
        </p>
      )}
      <div className="action-list">
        {actions.slice(0, 70).map((a) => (
          <button
            className={`action-button action-${a.category}`}
            key={a.id}
            onClick={() => doAction(a)}
            title={a.detail}
          >
            <span className="action-icon">
              {a.category === "play" ? (
                <Zap size={14} />
              ) : a.category === "move" ? (
                <ArrowRight size={14} />
              ) : a.category === "combat" ? (
                <Swords size={14} />
              ) : (
                <Sparkles size={14} />
              )}
            </span>
            <span>
              {a.label}
              {a.detail && <small>{a.detail}</small>}
            </span>
            <ChevronRight size={13} />
          </button>
        ))}
        {actions.length === 0 && (
          <div className="no-actions">
            {selected
              ? "Nema dostupnih poteza za ovaj odabir."
              : "Pritisni Proceed za sljedeću AI akciju."}
          </div>
        )}
      </div>
      {ending.map((a) => (
        <button
          className={
            a.category === "end"
              ? "gold-button full end-turn"
              : "outline-button full"
          }
          key={a.id}
          onClick={() => doAction(a)}
        >
          {a.label}
          <ArrowRight size={17} />
        </button>
      ))}
    </div>
  );
}
function Library({ inspect }: { inspect: (c: CatalogCard) => void }) {
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
    <main className="library">
      <div className="eyebrow">RIFTCODEX · KATALOG KARATA</div>
      <h1>
        Znanje je prednost<span>.</span>
      </h1>
      <p>
        Originalne karte i tekstovi efekata. Oznaka „Skriptovana” znači da je
        karta podržana u meču.
      </p>
      <div className="library-filters">
        <div className="search-input">
          <Search size={19} />
          <input
            aria-label="Pretraži karte"
            placeholder="Pretraži ime ili tekst karte…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(60);
            }}
          />
        </div>
        <select
          aria-label="Domena"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
        >
          {["Sve domene", "Fury", "Calm", "Mind", "Body", "Chaos", "Order"].map(
            (d) => (
              <option key={d}>{d}</option>
            ),
          )}
        </select>
        <select
          aria-label="Vrsta karte"
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
            <option key={d}>{d}</option>
          ))}
        </select>
        <label className="scripted-filter">
          <input
            type="checkbox"
            checked={onlyScripted}
            onChange={(e) => setOnlyScripted(e.target.checked)}
          />
          Samo skriptovane
        </label>
      </div>
      <div className="catalog-count">
        {filtered.length} KARATA
        <span>Podaci su spremljeni lokalno uz aplikaciju</span>
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
                {supported(c) ? "● Skriptovana" : c.set}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-search">
          <Search size={32} />
          <h3>Nema pronađenih karata</h3>
          <p>Pokušaj s drugim imenom ili filterima.</p>
        </div>
      )}
      {filtered.length > limit && (
        <button
          className="outline-button load-more"
          onClick={() => setLimit((l) => l + 60)}
        >
          Prikaži još karata <ArrowRight size={16} />
        </button>
      )}
    </main>
  );
}
function Help({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Kako igrati"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-button" onClick={close} aria-label="Zatvori">
          ×
        </button>
        <div className="eyebrow">TVOJ PRVI DUEL</div>
        <h2>
          Osvoji bojišta.
          <br />
          <em>Zadrži prednost.</em>
        </h2>
        <div className="help-grid">
          {[
            [
              "01",
              "Pripremi ruku",
              "Počinješ s 4 karte. Jednom možeš zamijeniti do 2. Tvoj izabrani champion je odvojeno spreman za igranje.",
            ],
            [
              "02",
              "Upravljaj runama",
              "Na početku poteza pripremaš karte i dobijaš 2 rune. Iscrpi runu za energiju; recikliraj je za power njene domene. Plaćanje karata radi automatski.",
            ],
            [
              "03",
              "Pošalji jedinice",
              "Jedinice uglavnom ulaze iscrpljene. Spremne jedinice mogu iz baze na bojište ili nazad. Izaberi jedinicu pa legalan potez desno.",
            ],
            [
              "04",
              "Odgovori na protivnika",
              "Showdown daje objema stranama priliku za Action i Reaction karte. Lanac efekata rješava se od posljednjeg odigranog.",
            ],
            [
              "05",
              "Riješi borbu",
              "Šteta je istovremena. Dodijeli dovoljno štete jednoj jedinici prije sljedeće. Tank jedinice moraju biti prve.",
            ],
            [
              "06",
              "Stigni do 8",
              "Bod dobijaš osvajanjem ili držanjem bojišta na početku poteza. Za osmi bod osvajanjem moraš bodovati oba bojišta u tom potezu.",
            ],
          ].map(([n, t, p]) => (
            <div key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
        <div className="scope-note">
          <h3>Proceed — ti biraš tempo</h3>
          <p>
            Svaka akcija i svaki efekat se zaustavljaju radi pregleda. Istaknute
            karte, bojišta i resursi pokazuju promjene. Klikni Proceed (ili
            razmak na tastaturi) za sljedeći korak. AI se nikada ne pokreće sam.
          </p>
          <h3>Podrška i izvori</h3>
          <p>
            Ovo je nezavisni eksperimentalni simulator. Dostupni špilovi koriste
            eksplicitno skriptovane karte; puni katalog sadrži i karte koje još
            nisu podržane. Nije potpuna digitalna implementacija svih
            objavljenih Riftbound setova.
          </p>
          <p>
            Riotova Digital Tools Policy ne odobrava automatizovane Riftbound
            simulatore. Ovaj projekt nema Riot odobrenje.
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
            Službena pravila ↗
          </a>
        </div>
        <button className="gold-button" onClick={close}>
          Spreman za duel <Swords size={17} />
        </button>
      </section>
    </div>
  );
}
