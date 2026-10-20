import { DIFFICULTIES, type Difficulty } from "../game/ai/config";
import { useId, useRef, useState } from "react";
import { useI18n } from "../i18n";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Flag,
  Layers3,
  Shield,
  Swords,
  Trophy,
  Search,
  X,
  SlidersHorizontal,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { findCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { championArt } from "../data/champion-art";
import { decks, type StarterDeck } from "../data/decks";
import { getDeckScriptCoverage } from "../game/deck-import";
import "./LobbyStartingPair.css";
import "./LobbyChampionPicker.css";
import "./LobbyResume.css";
import "./LobbyUpgrade.css";
import { useCompactTable } from "../hooks/useCompactTable";
import { useReducedMotion } from "../motion/useReducedMotion";
import { BattlefieldPicker } from "./BattlefieldPicker";
import { defaultBattlefield } from "../game/battlefield-selection";
import type { CatalogCard } from "../catalog";

type Props = {
  allDecks: StarterDeck[];
  visibleDecks: StarterDeck[];
  playerDeck?: StarterDeck;
  botDeck?: StarterDeck;
  deckGroup: string;
  difficulty: string;
  firstPlayerChoice?: "random" | "you" | "bot";
  onFirstPlayerChoice?: (choice: "random" | "you" | "bot") => void;
  importedCount: number;
  ready: boolean;
  hasMatch: boolean;
  matchEnded: boolean;
  onGroup: (group: string) => void;
  onPlayer: (id: string) => void;
  onBot: (id: string) => void;
  onDifficulty: (style: string) => void;
  onStart: () => void;
  onGuidedStart?: () => void;
  setupSaved?: boolean;
  resumeSummary?: {
    player: string;
    opponent: string;
    turn: number;
    points: [number, number];
    status: string;
  };
  onResume: () => void;
  onImport: () => void;
  onDetails: (deck: StarterDeck) => void;
  onExport: (deck: StarterDeck) => void;
  onHelp: () => void;
  onLibrary: () => void;
  onBuildDeck?: () => void;
  onTraining?: () => void;
  onOnline?: () => void;
  matchFormat?: "single" | "bo3";
  onMatchFormat?: (format: "single" | "bo3") => void;
  playerBattlefield?: string;
  botBattlefield?: string;
  onPlayerBattlefield?: (id: string) => void;
  onBotBattlefield?: (id: string) => void;
  onInspect?: (card: CatalogCard) => void;
};

function deckArt(deck?: StarterDeck) {
  if (!deck) return undefined;
  const card = findCard(deck.championId);
  return championArt(deck.champion) || (card ? cardArtUrl(card) : undefined);
}

function DeckOptions({ choices }: { choices: StarterDeck[] }) {
  const { t } = useI18n();
  const collections = new Map<string, StarterDeck[]>();
  for (const deck of choices) {
    const group =
      deck.source === "Imported deck"
        ? "Moji"
        : deck.source === "Curated practice deck"
          ? "Trening"
          : deck.product || "Precon";
    collections.set(group, [...(collections.get(group) || []), deck]);
  }
  return [...collections].map(([group, options]) => (
    <optgroup key={group} label={t(group)}>
      {options.map((deck) => (
        <option value={deck.id} key={deck.id}>
          {t(deck.name)}
        </option>
      ))}
    </optgroup>
  ));
}

function StartingCardPair({
  deck,
  onDetails,
}: {
  deck: StarterDeck;
  onDetails: (deck: StarterDeck) => void;
}) {
  const { t } = useI18n();
  const startingCards = [
    {
      card: findCard(deck.championId),
      role: "Chosen Champion",
      zone: "Starts in Champion Zone",
      kind: "hero",
    },
    {
      card: findCard(deck.legendId),
      role: "Legend · Effects",
      zone: "Starts in Legend Zone",
      kind: "legend",
    },
  ];
  return (
    <section className="rift-starting-pair" aria-label={t("Starting cards")}>
      <span className="rift-starting-pair-heading">{t("Starting cards")}</span>
      <div className="rift-starting-pair-cards">
        {startingCards.map(({ card, role, zone, kind }) =>
          card ? (
            <button
              key={card.id}
              className={`rift-starting-card rift-starting-card-${kind}`}
              data-card-preview={card.id}
              onClick={() => onDetails(deck)}
              aria-label={t("View {role}: {name}", {
                role: t(role),
                name: card.name,
              })}
            >
              <img src={cardArtUrl(card)} alt="" loading="lazy" />
              <span className="rift-starting-card-copy">
                <span className="rift-starting-card-role">{t(role)}</span>
                <strong>{card.name}</strong>
                <small>{t(zone)}</small>
              </span>
            </button>
          ) : null,
        )}
      </div>
    </section>
  );
}

export function Lobby(p: Props) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const setup = useRef<HTMLElement>(null);
  const championsId = useId();
  const compact = useCompactTable();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const query = normalize(search.trim());
  const filteredDecks = p.visibleDecks.filter((deck) =>
    normalize(
      [
        deck.name,
        deck.champion,
        deck.product,
        t(deck.archetype),
        ...deck.domains.map((domain) => t(domain)),
      ].join(" "),
    ).includes(query),
  );
  const limit = compact ? 4 : 6;
  const canExpand = !query && filteredDecks.length > limit;
  const championChoices = filteredDecks.slice(0, limit);
  if (
    p.playerDeck &&
    filteredDecks.some((deck) => deck.id === p.playerDeck?.id) &&
    !championChoices.some((deck) => deck.id === p.playerDeck?.id)
  ) {
    championChoices[championChoices.length - 1] = p.playerDeck;
  }
  const shownDecks = canExpand && !expanded ? championChoices : filteredDecks;
  const champion = p.playerDeck && findCard(p.playerDeck.championId);
  const available = p.allDecks.filter(
    (deck) => getDeckScriptCoverage(deck).complete,
  );
  const groups = [
    "Precon",
    ...new Set(
      decks.map((d) => d.product).filter((s): s is string => Boolean(s)),
    ),
    "Trening",
    "Moji",
    "Sve",
  ];
  const targetPoints =
    8 +
    [
      p.playerBattlefield ?? defaultBattlefield(p.playerDeck),
      p.botBattlefield ?? defaultBattlefield(p.botDeck),
    ].filter((id) => id === "ogn-276-298").length;
  const selectedDifficulty = DIFFICULTIES[p.difficulty as Difficulty];
  const scrollToSetup = () => {
    setup.current?.scrollIntoView({
      behavior: reducedMotion ? "instant" : "smooth",
      block: "start",
    });
    setup.current?.focus({ preventScroll: true });
  };
  return (
    <main className="rift-lobby rift-lobby-upgrade" id="main-content">
      <section
        className={`rift-hero ${p.hasMatch ? "has-saved-duel" : ""}`}
        aria-labelledby="hero-title"
      >
        <img
          className="rift-hero-image"
          src={deckArt(p.playerDeck) || championArt("Jinx")}
          alt=""
          fetchPriority="high"
        />
        <div className="rift-hero-wash" />
        <div className="rift-hero-copy">
          <span className="rift-eyebrow rift-arena-status">
            <i aria-hidden="true" /> {t("Ti protiv AI bota")}
          </span>
          <h1 id="hero-title">{t("Your next move.")}</h1>
          <p>{t("Izaberi svoj špil. Zauzmi bojišta. Odigraj svoje.")}</p>
          <div className="rift-hero-actions">
            <button
              className="rift-link rift-choose-deck"
              onClick={scrollToSetup}
            >
              {t("Izaberi svoj špil")}
              <ArrowRight size={18} />
            </button>
            {p.onOnline && (
              <button
                className="rift-link rift-online-link"
                onClick={p.onOnline}
              >
                <Users size={18} />
                {t("Play a friend · 1v1")}
              </button>
            )}
            {!p.hasMatch && (
              <button className="rift-link" onClick={p.onHelp}>
                <BookOpen size={17} />
                {t("Tvoj prvi duel")}
              </button>
            )}
          </div>
        </div>
        {p.playerDeck && (
          <span className="rift-hero-selection">
            <small>{t("TVOJ IZBOR")}</small>
            <strong>{p.playerDeck.champion}</strong>
            <span>
              {p.playerDeck.domains.map((domain) => t(domain)).join(" · ")}
            </span>
          </span>
        )}
      </section>
      {p.hasMatch && (
        <button
          className="rift-return-card rift-resume-link"
          onClick={p.onResume}
          aria-label={t(p.matchEnded ? "Pregledaj meč" : "Nastavi duel")}
        >
          <span className="rift-return-icon">
            <Swords size={21} />
          </span>
          <span className="rift-resume-copy">
            <strong>
              {t(p.matchEnded ? "Pregledaj meč" : "Nastavi duel")}
            </strong>
            {p.resumeSummary && (
              <span className="rift-resume-matchup">
                {t(p.resumeSummary.player)} <i>vs</i>{" "}
                {t(p.resumeSummary.opponent)}
              </span>
            )}
          </span>
          {p.resumeSummary && (
            <span className="rift-resume-state">
              {p.resumeSummary.turn > 0 && (
                <>{t("Turn {turn}", { turn: p.resumeSummary.turn })} · </>
              )}
              {p.resumeSummary.points.join("–")} · {t(p.resumeSummary.status)}
            </span>
          )}
          <ArrowRight size={19} />
        </button>
      )}
      <section
        ref={setup}
        tabIndex={-1}
        className="rift-setup"
        aria-labelledby="setup-title"
      >
        <div className="rift-section-heading">
          <div>
            <h2 id="setup-title">{t("Set up your duel")}</h2>
          </div>
          <p>{t("Choose a deck, tune your challenge, and enter the Rift.")}</p>
        </div>
        <div className="rift-setup-grid">
          <div className="rift-champion-column">
            <div className="rift-step-heading">
              <span>01</span>
              <h3>{t("Izaberi svoj špil")}</h3>
              <small>
                {t("{count} of {total} decks", {
                  count: shownDecks.length,
                  total: filteredDecks.length,
                })}
              </small>
            </div>
            <div className="rift-deck-browser">
              <div className="rift-deck-search" role="search">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setExpanded(false);
                  }}
                  placeholder={t("Search champions or decks")}
                  aria-label={t("Search champions or decks")}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t("Clear search")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <label className="rift-collection-select">
                <span className="rift-visually-hidden">
                  {t("Kolekcija špilova")}
                </span>
                <select
                  aria-label={t("Kolekcija špilova")}
                  value={p.deckGroup}
                  onChange={(event) => {
                    setExpanded(false);
                    p.onGroup(event.target.value);
                  }}
                >
                  {groups.map((group) => (
                    <option value={group} key={group}>
                      {group === "Precon"
                        ? t("Svi preconi")
                        : group === "Moji"
                          ? t("Moji ({count})", { count: p.importedCount })
                          : t(group)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className="rift-champions"
              id={championsId}
              role="group"
              aria-label={t("Deck selection")}
            >
              {shownDecks.map((deck) => (
                <button
                  key={deck.id}
                  aria-pressed={p.playerDeck?.id === deck.id}
                  aria-label={t("Odaberi {name}", { name: t(deck.name) })}
                  className={`rift-champion ${p.playerDeck?.id === deck.id ? "is-selected" : ""}`}
                  onClick={() => p.onPlayer(deck.id)}
                >
                  <img src={deckArt(deck)} alt="" loading="lazy" />
                  <span className="rift-selection-check">
                    <Check size={14} />
                  </span>
                  <span className="rift-champion-label">
                    <strong>{deck.champion}</strong>
                    <span>
                      {t(
                        deck.product ||
                          (deck.source === "Imported deck"
                            ? deck.name
                            : deck.title),
                      )}
                    </span>
                    <small>
                      {deck.domains.map((domain) => t(domain)).join(" · ")}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {query && (
              <span className="rift-visually-hidden" role="status">
                {t("{count} of {total} decks", {
                  count: shownDecks.length,
                  total: p.visibleDecks.length,
                })}
              </span>
            )}
            {canExpand && (
              <div className="rift-champion-disclosure">
                <span>
                  {t("{count} of {total} decks", {
                    count: shownDecks.length,
                    total: filteredDecks.length,
                  })}
                </span>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={championsId}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded
                    ? t("Show fewer decks")
                    : t("Show all {count} decks", {
                        count: filteredDecks.length,
                      })}
                  {expanded ? (
                    <ChevronUp size={16} />
                  ) : (
                    <ChevronDown size={16} />
                  )}
                </button>
              </div>
            )}
            {!filteredDecks.length && (
              <div className="rift-empty">
                <Layers3 size={27} />
                <p>
                  {t(
                    query
                      ? "No decks match your search."
                      : "Ovdje počinje tvoja kolekcija.",
                  )}
                </p>
                <button
                  className="rift-secondary"
                  onClick={query ? () => setSearch("") : p.onImport}
                >
                  {t(query ? "Clear search" : "Uvezi prvi špil")}
                  {query ? <X size={16} /> : <Upload size={16} />}
                </button>
              </div>
            )}
            <div className="rift-selected-deck">
              <label className="rift-player-select">
                <span>
                  <Check size={14} />
                  {t("Tvoj špil")}
                </span>
                <select
                  aria-label={t("Tvoj špil")}
                  value={p.playerDeck?.id || ""}
                  onChange={(event) => p.onPlayer(event.target.value)}
                >
                  <DeckOptions choices={p.allDecks} />
                </select>
              </label>
              {p.playerDeck && (
                <div className="rift-selected-meta">
                  <span>
                    {p.playerDeck.domains
                      .map((domain) => t(domain))
                      .join(" · ")}
                  </span>
                  <button
                    className="rift-link"
                    onClick={() => p.onDetails(p.playerDeck!)}
                  >
                    {t("Pogledaj sastav")}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
            </div>
            <BattlefieldPicker
              deck={p.playerDeck}
              value={p.playerBattlefield ?? defaultBattlefield(p.playerDeck)}
              onChange={p.onPlayerBattlefield ?? (() => {})}
              inspect={p.onInspect ?? (() => {})}
            />
            <details className="rift-setup-disclosure rift-deck-disclosure">
              <summary>
                <Layers3 size={18} />
                <span>{t("Deck & starting cards")}</span>
                <ChevronDown size={17} />
              </summary>
              <div className="rift-disclosure-body">
                {p.playerDeck && (
                  <>
                    <div className="rift-champion-detail">
                      <div>
                        <span className="rift-eyebrow">{t("TVOJ IZBOR")}</span>
                        <h3>{p.playerDeck.champion}</h3>
                        <p>{t(p.playerDeck.archetype)}</p>
                      </div>
                      <div className="rift-champion-stats">
                        <span>
                          <b>{champion?.energy ?? "—"}</b>
                          {t("ENERGIJA")}
                        </span>
                        <span>
                          <b>{champion?.might ?? "—"}</b>
                          {t("SNAGA")}
                        </span>
                        <span>
                          <b>
                            {1 +
                              p.playerDeck.main.reduce(
                                (n, entry) => n + entry.count,
                                0,
                              )}
                          </b>
                          {t("KARATA")}
                        </span>
                      </div>
                    </div>
                    <StartingCardPair
                      deck={p.playerDeck}
                      onDetails={p.onDetails}
                    />
                  </>
                )}
                <div className="rift-deck-panel">
                  <div className="rift-deck-panel-title">
                    <Layers3 size={21} />
                    <div>
                      <strong>
                        {t(p.playerDeck?.name || "Izaberi svoj špil")}
                      </strong>
                      <p>
                        {p.playerDeck?.source === "Official preconstructed deck"
                          ? t(
                              "Originalni precon, spreman za tvoj sljedeći duel.",
                            )
                          : t(p.playerDeck?.description || "")}
                      </p>
                    </div>
                  </div>
                  <div className="rift-deck-panel-actions">
                    <div>
                      <span>
                        <Check size={14} />
                        {t("{count} cards", {
                          count:
                            1 +
                            (p.playerDeck?.main.reduce(
                              (n, entry) => n + entry.count,
                              0,
                            ) ?? 39),
                        })}
                      </span>
                      <span>
                        <Zap size={14} />
                        {t("12 runa")}
                      </span>
                      <span>
                        <Shield size={14} />
                        {t("1 Legend")}
                      </span>
                    </div>
                  </div>
                  <div className="rift-deck-utilities">
                    {p.onBuildDeck && (
                      <button onClick={p.onBuildDeck}>
                        <Layers3 size={15} />
                        {t("Build a deck")}
                      </button>
                    )}
                    <button onClick={p.onImport}>
                      <Upload size={15} />
                      {t("Uvezi špil")}
                    </button>
                    {p.playerDeck && (
                      <button onClick={() => p.onExport(p.playerDeck!)}>
                        <Download size={15} />
                        {t("Izvezi .txt")}
                      </button>
                    )}
                  </div>
                </div>
                <p className="rift-precon-note">
                  {t(
                    "Precon špilovi zadržavaju originalni sastav izdanja. Turnirske zabrane prikazuju se pri uvozu špila.",
                  )}
                </p>
              </div>
            </details>
          </div>
          <aside className="rift-opponent" aria-label={t("Postavke duela")}>
            <div className="rift-step-heading">
              <span>02</span>
              <h3>{t("Choose your opponent")}</h3>
            </div>
            <div
              className="rift-duel-preview"
              aria-label={t("TVOJ SLJEDEĆI DUEL")}
            >
              <div className="rift-duelist is-player">
                <img src={deckArt(p.playerDeck)} alt="" />
                <span>
                  <small>{t("Ti")}</small>
                  <strong>{p.playerDeck?.champion || t("Tvoj šampion")}</strong>
                </span>
              </div>
              <span className="rift-versus">VS</span>
              <div className="rift-duelist is-rival">
                <img src={deckArt(p.botDeck)} alt="" />
                <span>
                  <small>{t("AI")}</small>
                  <strong>{p.botDeck?.champion || t("Protivnik")}</strong>
                </span>
              </div>
            </div>
            <label className="rift-opponent-select">
              {t("Špil protivnika")}
              <select
                aria-label={t("Špil protivnika")}
                value={p.botDeck?.id || ""}
                onChange={(event) => p.onBot(event.target.value)}
              >
                <DeckOptions choices={available} />
              </select>
            </label>
            <fieldset className="rift-difficulty">
              <legend>{t("TEMPO TVOG IZAZOVA")}</legend>
              <div>
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map(
                  (style, index) => (
                    <label key={style}>
                      <input
                        type="radio"
                        name="difficulty"
                        value={style}
                        checked={p.difficulty === style}
                        onChange={() => p.onDifficulty(style)}
                      />
                      <span>
                        <span
                          className="rift-difficulty-level"
                          aria-hidden="true"
                        >
                          {[0, 1, 2, 3].map((level) => (
                            <i
                              key={level}
                              className={level <= index ? "is-active" : ""}
                            />
                          ))}
                        </span>
                        {t(DIFFICULTIES[style].label)}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </fieldset>
            <div className="rift-duel-summary">
              <span>
                <Flag size={14} />
                {t("2 bojišta")}
              </span>
              <span>
                <Trophy size={14} />
                {t("First to {count} points", { count: targetPoints })}
              </span>
              <span>
                {t(p.matchFormat === "bo3" ? "Best of three" : "Single duel")}
              </span>
            </div>
            <button
              className="rift-primary rift-start"
              disabled={!p.ready}
              onClick={p.onStart}
            >
              <Swords size={18} />
              {t("ZAPOČNI DUEL")}
              <ArrowRight size={18} />
            </button>
            {!p.ready && (
              <p className="rift-not-ready">
                {t(
                  "Izabrani špil još nije spreman za igru. Otvori sastav za detalje.",
                )}
              </p>
            )}
            {p.onGuidedStart && (
              <div className="rift-guided-start">
                <button
                  className="rift-link"
                  disabled={!p.ready}
                  onClick={p.onGuidedStart}
                >
                  <BookOpen size={16} />
                  {t("Play with a guide")}
                </button>
                <small>
                  {t(
                    "A single duel with your selected decks. You start against Beginner AI, with tips as you play.",
                  )}
                </small>
              </div>
            )}
            <div className="rift-opponent-settings">
              <BattlefieldPicker
                opponent
                deck={p.botDeck}
                value={p.botBattlefield ?? defaultBattlefield(p.botDeck)}
                onChange={p.onBotBattlefield ?? (() => {})}
                inspect={p.onInspect ?? (() => {})}
              />
              <details className="rift-setup-disclosure">
                <summary>
                  <SlidersHorizontal size={17} />
                  <span>{t("Duel rules")}</span>
                  <ChevronDown size={17} />
                </summary>
                <div className="rift-disclosure-body">
                  <label className="rift-first-player">
                    <span>{t("Match format")}</span>
                    <select
                      value={p.matchFormat ?? "single"}
                      onChange={(event) =>
                        p.onMatchFormat?.(
                          event.target.value as "single" | "bo3",
                        )
                      }
                    >
                      <option value="single">{t("Single duel")}</option>
                      <option value="bo3">{t("Best of three")}</option>
                    </select>
                  </label>
                  <label className="rift-first-player">
                    <span>{t("Starting player")}</span>
                    <select
                      value={p.firstPlayerChoice ?? "random"}
                      onChange={(event) =>
                        p.onFirstPlayerChoice?.(
                          event.target.value as "random" | "you" | "bot",
                        )
                      }
                    >
                      <option value="random">
                        {t("Random starting player")}
                      </option>
                      <option value="you">{t("You start")}</option>
                      <option value="bot">{t("Opponent starts")}</option>
                    </select>
                  </label>
                  <p className="rift-rules-note">
                    {t(
                      "Four difficulty levels. The same rules and hidden-information limits.",
                    )}
                  </p>
                </div>
              </details>
              {p.botDeck && (
                <details className="rift-setup-disclosure">
                  <summary>
                    <Layers3 size={17} />
                    <span>{t("Starting cards")}</span>
                    <ChevronDown size={17} />
                  </summary>
                  <div className="rift-disclosure-body">
                    <StartingCardPair
                      deck={p.botDeck}
                      onDetails={p.onDetails}
                    />
                    <button
                      className="rift-link"
                      onClick={() => p.onDetails(p.botDeck!)}
                    >
                      {t("Pogledaj sastav")}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </details>
              )}
            </div>
            <p
              className={`rift-setup-memory ${p.setupSaved === false ? "is-error" : ""}`}
              role={p.setupSaved === false ? "status" : undefined}
            >
              <Shield size={13} />
              {t(
                p.setupSaved === false
                  ? "Setup could not be saved. Your choices work until you close this page."
                  : "Your decks and duel settings are remembered in this browser.",
              )}
            </p>
          </aside>
        </div>
      </section>
      <section className="rift-field-guide" aria-labelledby="guide-title">
        <div className="rift-section-heading">
          <div>
            <span className="rift-eyebrow">
              {t("MALA ŠKOLA VELIKIH POTEZA")}
            </span>
            <h2 id="guide-title">{t("MOĆ JE U TVOJIM RUKAMA.")}</h2>
          </div>
          <button className="rift-link" onClick={p.onHelp}>
            {t("Pročitaj vodič")}
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="rift-guide-grid">
          <article>
            <Flag size={24} />
            <h3>{t("OSVOJI BOJIŠTE.")}</h3>
            <p>
              {t(
                "Pošalji jedinice, probij odbranu i zadrži kontrolu. Svako bojište vodi te bliže pobjedi.",
              )}
            </p>
          </article>
          <article>
            <BookOpen size={24} />
            <h3>{t("Training lab")}</h3>
            <p>
              {t(
                "Čuvaj rune za odgovor. Jedna dobro tempirana čarolija može promijeniti cijeli duel.",
              )}
            </p>
            {p.onTraining && (
              <button className="rift-link" onClick={p.onTraining}>
                {t("Training lab")}
                <ArrowRight size={15} />
              </button>
            )}
          </article>
          <article>
            <Layers3 size={24} />
            <h3>{t("UPOZNAJ SVOJE KARTE.")}</h3>
            <p>
              {t(
                "Istraži šampione i njihove efekte. Tvoja sljedeća dobra ideja možda je u biblioteci.",
              )}
            </p>
            <button className="rift-link" onClick={p.onLibrary}>
              {t("Otvori biblioteku")}
              <ArrowRight size={15} />
            </button>
          </article>
        </div>
      </section>
      <div className="rift-mobile-launch">
        <span>
          <small>
            {t(selectedDifficulty?.label || "Normal")} ·{" "}
            {t(p.matchFormat === "bo3" ? "Best of three" : "Single duel")}
          </small>
          <strong>
            {p.playerDeck?.champion} <i>vs</i> {p.botDeck?.champion}
          </strong>
        </span>
        <button
          className="rift-primary"
          disabled={!p.ready}
          onClick={p.onStart}
        >
          {t("ZAPOČNI DUEL")}
          <ArrowRight size={17} />
        </button>
      </div>
    </main>
  );
}
