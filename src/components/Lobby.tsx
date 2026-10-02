import { useRef } from "react";
import { useI18n } from "../i18n";
import {
  ArrowRight,
  BookOpen,
  Check,
  Crosshair,
  Download,
  Flag,
  Layers3,
  Shield,
  Swords,
  Trophy,
  Upload,
  Zap,
} from "lucide-react";
import { findCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { championArt } from "../data/champion-art";
import { decks, type StarterDeck } from "../data/decks";
import { getDeckScriptCoverage } from "../game/deck-import";
import "./LobbyStartingPair.css";

type Props = {
  allDecks: StarterDeck[];
  visibleDecks: StarterDeck[];
  playerDeck?: StarterDeck;
  botDeck?: StarterDeck;
  deckGroup: string;
  difficulty: string;
  importedCount: number;
  ready: boolean;
  hasMatch: boolean;
  matchEnded: boolean;
  onGroup: (group: string) => void;
  onPlayer: (id: string) => void;
  onBot: (id: string) => void;
  onDifficulty: (style: string) => void;
  onStart: () => void;
  onResume: () => void;
  onImport: () => void;
  onDetails: (deck: StarterDeck) => void;
  onExport: (deck: StarterDeck) => void;
  onHelp: () => void;
  onLibrary: () => void;
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
  const setup = useRef<HTMLElement>(null);
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
  const scrollToSetup = () => {
    setup.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
    setup.current?.focus({ preventScroll: true });
  };
  return (
    <main className="rift-lobby" id="main-content">
      <div className="rift-kicker">
        <span>
          <i /> {t("NOVI DUEL. NOVA LEGENDA.")}
        </span>
        <span>{t("LEAGUE OF LEGENDS · THE CARD GAME")}</span>
      </div>
      <section className="rift-hero" aria-labelledby="hero-title">
        <img
          className="rift-hero-image"
          src={championArt("Jinx")}
          alt={t("Jinx iz League of Legends, spremna za sljedeći duel")}
          fetchPriority="high"
        />
        <div className="rift-hero-wash" />
        <div className="rift-hero-copy">
          <span className="rift-sticker">
            {t("TVOJA LEGENDA POČINJE OVDJE")}
          </span>
          <h1 id="hero-title">
            {t("RIFT TE")}
            <br />
            <em>{t("ČEKA.")}</em>
          </h1>
          <p>
            {t("Veliki šampioni. Još veće odluke.")}
            <br />
            {t("Izaberi svoj špil. Zauzmi bojišta. Odigraj svoje.")}
          </p>
          <div className="rift-hero-actions">
            <button className="rift-primary" onClick={scrollToSetup}>
              {t("Izaberi svoj špil")}
              <ArrowRight size={20} />
            </button>
            <button
              className="rift-link"
              onClick={p.hasMatch ? p.onResume : p.onHelp}
            >
              {p.hasMatch ? <Swords size={17} /> : <BookOpen size={17} />}
              {p.hasMatch
                ? p.matchEnded
                  ? t("Pregledaj meč")
                  : t("Nastavi duel")
                : t("Tvoj prvi duel")}
            </button>
          </div>
          <div className="rift-hero-facts">
            <span>
              <Swords size={15} /> {t("Ti protiv AI bota")}
            </span>
            <span>
              <Shield size={15} />{" "}
              {t("{count} šampiona", {
                count: new Set(decks.map((d) => d.champion)).size,
              })}
            </span>
            <span>
              <Flag size={15} /> {t("Dva bojišta. Jedan pobjednik.")}
            </span>
          </div>
        </div>
        <span className="rift-hero-stamp">
          {t("MALA KARTA.")}
          <br />
          <strong>{t("VELIKI POTEZ.")}</strong>
        </span>
        <span className="rift-hero-index">{t("01 / DOBRO DOŠAO U RIFT")}</span>
      </section>

      <section
        ref={setup}
        tabIndex={-1}
        className="rift-setup"
        aria-labelledby="setup-title"
      >
        <div className="rift-section-heading">
          <div>
            <span className="rift-eyebrow">{t("PRIPREMI SE ZA DUEL")}</span>
            <h2 id="setup-title">{t("SASTAVI SVOJU PRIČU.")}</h2>
          </div>
          <p>{t("Tvoj šampion. Tvoj stil. Tvoj potez.")}</p>
        </div>
        <div className="rift-mission-strip">
          <div className="rift-mission-icon">
            <Swords size={23} />
          </div>
          <div>
            <strong>{t("JEDAN NA JEDAN. SVE JE NA TEBI.")}</strong>
            <p>{t("Pravi špilovi. Protivnik spreman. Igraj svojim tempom.")}</p>
          </div>
          <span className="rift-mode-badge">{t("1 IGRAČ + AI")}</span>
        </div>
        <div className="rift-setup-grid">
          <div className="rift-champion-column">
            <div className="rift-step-heading">
              <span>01</span>
              <h3>{t("IZABERI ŠAMPIONA")}</h3>
              <small>{t("Pronađi svoju prednost.")}</small>
            </div>
            <label className="rift-player-select">
              <span>{t("Tvoj špil")}</span>
              <select
                aria-label={t("Tvoj špil")}
                value={p.playerDeck?.id || ""}
                onChange={(event) => p.onPlayer(event.target.value)}
              >
                <DeckOptions choices={p.allDecks} />
              </select>
            </label>
            <p className="rift-deck-selection-note">
              {t(
                "{count} precona iz svih izdanja. Izaberi špil iz liste ili karticu ispod.",
                {
                  count: p.allDecks.filter(
                    (deck) => deck.source === "Official preconstructed deck",
                  ).length,
                },
              )}
            </p>
            <div
              className="rift-collections"
              aria-label={t("Kolekcija špilova")}
            >
              {groups.map((group) => (
                <button
                  key={group}
                  aria-pressed={p.deckGroup === group}
                  onClick={() => p.onGroup(group)}
                >
                  {group === "Precon"
                    ? t("Svi preconi")
                    : group === "Moji"
                      ? t("Moji ({count})", { count: p.importedCount })
                      : t(group)}
                </button>
              ))}
            </div>
            <div className="rift-champions">
              {p.visibleDecks.map((deck) => (
                <button
                  key={deck.id}
                  aria-pressed={p.playerDeck?.id === deck.id}
                  aria-label={t("Odaberi {name}", { name: t(deck.name) })}
                  data-card-preview={deck.championId}
                  className={`rift-champion ${p.playerDeck?.id === deck.id ? "is-selected" : ""}`}
                  onClick={() => p.onPlayer(deck.id)}
                >
                  <img src={deckArt(deck)} alt="" loading="lazy" />
                  <span className="rift-selection-check">
                    <Check size={15} />
                  </span>
                  <div className="rift-champion-label">
                    <h4>{deck.champion}</h4>
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
                  </div>
                </button>
              ))}
            </div>
            {!p.visibleDecks.length && (
              <div className="rift-empty">
                <Layers3 size={28} />
                <p>{t("Ovdje počinje tvoja kolekcija.")}</p>
                <button className="rift-secondary" onClick={p.onImport}>
                  {t("Uvezi prvi špil")}
                  <Upload size={16} />
                </button>
              </div>
            )}
            {p.playerDeck && (
              <div className="rift-champion-detail">
                <div>
                  <span className="rift-eyebrow">{t("TVOJ IZBOR")}</span>
                  <h3 data-card-preview={p.playerDeck.championId} tabIndex={0}>
                    {p.playerDeck.champion}
                  </h3>
                  <p>
                    {p.playerDeck.source === "Official preconstructed deck"
                      ? t("Originalni špil · {product}", {
                          product: t(p.playerDeck.product || ""),
                        })
                      : t(p.playerDeck.archetype)}
                  </p>
                  <span className="rift-domain-list">
                    {p.playerDeck.domains.map((domain) => (
                      <span key={domain}>{t(domain)}</span>
                    ))}
                  </span>
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
                    <b>40</b>
                    {t("KARATA")}
                  </span>
                </div>
              </div>
            )}
            {p.playerDeck && (
              <StartingCardPair deck={p.playerDeck} onDetails={p.onDetails} />
            )}
            <div className="rift-step-heading rift-deck-heading">
              <span>02</span>
              <h3>{t("TVOJ ŠPIL. TVOJ STIL.")}</h3>
            </div>
            <div className="rift-deck-panel">
              <div className="rift-deck-panel-title">
                <Layers3 size={24} />
                <div>
                  <strong>
                    {t(p.playerDeck?.name || "Izaberi svoj špil")}
                  </strong>
                  <p>
                    {p.playerDeck?.source === "Official preconstructed deck"
                      ? t("Originalni precon, spreman za tvoj sljedeći duel.")
                      : t(p.playerDeck?.description || "")}
                  </p>
                </div>
              </div>
              <div className="rift-deck-panel-actions">
                <div>
                  <span>
                    <Check size={14} /> {t("40 karata")}
                  </span>
                  <span>
                    <Zap size={14} /> {t("12 runa")}
                  </span>
                  <span>
                    <Shield size={14} /> {t("1 Legend")}
                  </span>
                </div>
                {p.playerDeck && (
                  <button
                    className="rift-link"
                    onClick={() => p.onDetails(p.playerDeck!)}
                  >
                    {t("Pogledaj sastav")}
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <div className="rift-deck-utilities">
                <button onClick={p.onImport}>
                  <Upload size={15} /> {t("Uvezi špil")}
                </button>
                {p.playerDeck && (
                  <button onClick={() => p.onExport(p.playerDeck!)}>
                    <Download size={15} /> {t("Izvezi .txt")}
                  </button>
                )}
                <span>{t("Sačuvano na tvom uređaju")}</span>
              </div>
            </div>
            <p className="rift-precon-note">
              {t(
                "Precon špilovi zadržavaju originalni sastav izdanja. Turnirske zabrane prikazuju se pri uvozu špila.",
              )}
            </p>
          </div>
          <aside className="rift-opponent" aria-label={t("Postavke duela")}>
            <div className="rift-step-heading">
              <span>03</span>
              <h3>{t("TVOG RIVALA BIRAŠ TI.")}</h3>
            </div>
            <label className="rift-opponent-select">
              {t("ŠPIL PROTIVNIKA")}
              <select
                aria-label={t("Špil protivnika")}
                value={p.botDeck?.id || ""}
                onChange={(e) => p.onBot(e.target.value)}
              >
                <DeckOptions choices={available} />
              </select>
            </label>
            <div
              className="rift-rival-art"
              data-card-preview={p.botDeck?.championId}
              tabIndex={0}
              aria-label={t("Karta protivničkog šampiona: {champion}", {
                champion: p.botDeck?.champion || t("Protivnik"),
              })}
            >
              <img
                src={deckArt(p.botDeck)}
                alt={p.botDeck?.champion || t("Protivnik")}
              />
              <div>
                <span>{t("TAKTIČKI PROTIVNIK")}</span>
                <h4>{p.botDeck?.champion}</h4>
                <p>
                  {p.botDeck?.domains.map((domain) => t(domain)).join(" · ")}
                </p>
              </div>
              <span className="rift-rival-tag">
                <Crosshair size={13} /> {t("AI")}
              </span>
            </div>
            {p.botDeck && (
              <StartingCardPair deck={p.botDeck} onDetails={p.onDetails} />
            )}
            <fieldset className="rift-difficulty">
              <legend>{t("TEMPO TVOG IZAZOVA")}</legend>
              <div>
                {["Taktički", "Trening"].map((style) => (
                  <label key={style}>
                    <input
                      type="radio"
                      name="difficulty"
                      value={style}
                      checked={p.difficulty === style}
                      onChange={() => p.onDifficulty(style)}
                    />
                    <span>
                      {style === "Taktički" ? (
                        <Swords size={15} />
                      ) : (
                        <Shield size={15} />
                      )}
                      {t(style)}
                    </span>
                  </label>
                ))}
              </div>
              <p>
                {p.difficulty === "Taktički"
                  ? t(
                      "Protivnik procjenjuje poteze i bori se za svako bojište.",
                    )
                  : t(
                      "Jednostavniji prioriteti protivnika za upoznavanje karata.",
                    )}
              </p>
            </fieldset>
            <div className="rift-match-preview">
              <span>{t("TVOJ SLJEDEĆI DUEL")}</span>
              <div>
                <strong>{p.playerDeck?.champion || t("Tvoj šampion")}</strong>
                <i>{t("VS.")}</i>
                <strong>{p.botDeck?.champion}</strong>
              </div>
              <p>
                <Flag size={13} /> {t("2 bojišta")}
                <span /> <Trophy size={13} /> {t("Prvi do 8 bodova")}
              </p>
            </div>
            <button
              className="rift-primary rift-start"
              disabled={!p.ready}
              onClick={p.onStart}
            >
              <Swords size={18} /> {t("ZAPOČNI DUEL")}
              <ArrowRight size={18} />
            </button>
            {!p.ready && (
              <p className="rift-not-ready">
                {t(
                  "Izabrani špil još nije spreman za igru. Otvori sastav za detalje.",
                )}
              </p>
            )}
            <p className="rift-save-note">
              <Shield size={13} /> {t("Tvoj napredak se automatski čuva.")}
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
            <Flag size={28} />
            <h3>{t("OSVOJI BOJIŠTE.")}</h3>
            <p>
              {t(
                "Pošalji jedinice, probij odbranu i zadrži kontrolu. Svako bojište vodi te bliže pobjedi.",
              )}
            </p>
          </article>
          <article>
            <Zap size={28} />
            <h3>{t("ODIGRAJ PRAVI TRENUTAK.")}</h3>
            <p>
              {t(
                "Čuvaj rune za odgovor. Jedna dobro tempirana čarolija može promijeniti cijeli duel.",
              )}
            </p>
          </article>
          <article>
            <Layers3 size={28} />
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
    </main>
  );
}
