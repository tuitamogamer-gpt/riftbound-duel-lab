import { useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { ArrowRight, Check, FileUp, Shield, X } from "lucide-react";
import type { StarterDeck } from "../data/decks";
import { exportDeckText } from "../game/deck-import";
import { importDeckSource } from "../game/deck-sources";
import "./DeckImport.css";

export interface DeckImportProps {
  onImport: (deck: StarterDeck) => void;
  onClose?: () => void;
  initialText?: string;
  exampleDeck?: StarterDeck;
}
export function DeckImport({
  onImport,
  onClose,
  initialText = "",
  exampleDeck,
}: DeckImportProps) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText);
  const [fileError, setFileError] = useState("");
  const [historical, setHistorical] = useState(false);
  const [name, setName] = useState("");
  const [championId, setChampionId] = useState("");
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const detected = useMemo(() => importDeckSource(text), [text]);
  const result = useMemo(
    () =>
      importDeckSource(text, {
        ...(historical ? { format: "historical-precon" as const } : {}),
        ...(name.trim() ? { name } : {}),
        ...(championId ? { championId } : {}),
      }),
    [text, historical, name, championId],
  );
  const hasText = text.trim().length > 0;
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter(
    (issue) => issue.severity === "warning",
  );
  const panel = (
    <section
      className={`deck-import ${onClose ? "modal" : ""}`}
      role={onClose ? "dialog" : undefined}
      aria-modal={onClose ? true : undefined}
      aria-labelledby="deck-import-title"
      onClick={(event) => event.stopPropagation()}
    >
      {onClose && (
        <button
          className="close-button"
          onClick={onClose}
          aria-label={t("Zatvori import")}
        >
          <X size={22} />
        </button>
      )}
      <div className="eyebrow">
        <FileUp size={14} /> {t("LOKALNI IMPORT")}
      </div>
      <h2 id="deck-import-title">{t("Tvoj špil. Tvoja strategija.")}</h2>
      <p>
        {t(
          "Zalijepi Piltover Archive deck kod ili tekstualni izvoz sa deck-building sajta. Karte se provjeravaju prije čuvanja.",
        )}
      </p>
      <div className="deck-import-sites">
        <a
          href="https://piltoverarchive.com/deckbuilder"
          target="_blank"
          rel="noreferrer"
        >
          Piltover Archive ↗
        </a>
        <a
          href="https://riftbound.gg/deckbuilder/"
          target="_blank"
          rel="noreferrer"
        >
          Riftbound.gg ↗
        </a>
        <p>
          {t(
            "Na sajtu otvori svoj špil, izaberi Export i kopiraj Deck code ili Text. Ovdje zalijepi sadržaj izvoza.",
          )}
        </p>
      </div>
      <label className="deck-import-label" htmlFor="deck-import-name">
        {t("Naziv špila (opcionalno)")}
      </label>
      <input
        id="deck-import-name"
        className="deck-import-name"
        value={name}
        maxLength={120}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("Moj špil")}
      />
      <div className="deck-import-tools">
        <button
          className="outline-button"
          disabled={reading}
          onClick={() => fileRef.current?.click()}
        >
          <FileUp size={15} /> {t(reading ? "Čitam fajl…" : "Otvori .txt")}
        </button>
        {exampleDeck && (
          <button
            className="text-button"
            onClick={() => {
              request.current++;
              setReading(false);
              setFileError("");
              setText(exportDeckText(exampleDeck));
              setChampionId("");
            }}
          >
            {t("Učitaj primjer: {name}", { name: t(exampleDeck.name) })}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.dec,.deck,text/plain"
          className="deck-import-file"
          aria-label={t("Odaberi tekstualnu listu špila")}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const version = ++request.current;
            setFileError("");
            if (file.size > 100_000) {
              setFileError("Fajl je prevelik. Maksimalna veličina je 100 KB.");
              return;
            }
            setReading(true);
            try {
              const value = await file.text();
              if (version === request.current) {
                setText(value);
                setChampionId("");
              }
            } catch {
              if (version === request.current)
                setFileError(
                  "Fajl se ne može pročitati. Pokušaj zalijepiti njegov tekst.",
                );
            } finally {
              if (version === request.current) setReading(false);
            }
          }}
        />
      </div>
      <label className="deck-import-label" htmlFor="deck-import-text">
        {t("Deck kod ili lista karata")}
      </label>
      <textarea
        id="deck-import-text"
        spellCheck={false}
        value={text}
        maxLength={100_000}
        placeholder={t(
          "Name: {name}\n\nLegend\n1 Annie - Dark Child (Starter)\n\nChampion\n1 Annie - Fiery\n\nMain Deck\n3 ogn-001-298\n…\n\nRunes\n6 Fury Rune\n6 Chaos Rune\n\nBattlefields\n1 Reaver’s Row",
          { name: t("Moj špil") },
        )}
        onChange={(event) => {
          request.current++;
          setReading(false);
          setText(event.target.value);
          setChampionId("");
          setFileError("");
        }}
      />
      {detected.championCandidates.length > 0 && (
        <div className="deck-import-champion">
          <label className="deck-import-label" htmlFor="deck-import-champion">
            {t("Odaberi championa za ovu listu")}
          </label>
          <select
            id="deck-import-champion"
            value={championId}
            onChange={(event) => setChampionId(event.target.value)}
          >
            <option value="">{t("Izaberi odabranog championa…")}</option>
            {detected.championCandidates.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasText &&
        result.sourceFormat === "piltover-code" &&
        result.normalizedText && (
          <details className="deck-import-decoded">
            <summary>
              {t("Prepoznat Piltover Archive kod · pogledaj listu")}
            </summary>
            <pre>{result.normalizedText}</pre>
          </details>
        )}
      <p className="deck-import-hint">
        {t(
          "Sekcije: Legend, Champion, Main Deck, Runes i Battlefields. Glavni špil: 39 karata + champion. Rune: 12. Bojišta: 1 za Duel ili komplet od 3.",
        )}
      </p>
      <label className="deck-import-historical">
        <input
          type="checkbox"
          checked={historical}
          onChange={(event) => setHistorical(event.target.checked)}
        />{" "}
        {t(
          "Historijski precon — dozvoli izvorne karte zabranjene u današnjem Duelu",
        )}
      </label>
      <div className="deck-import-feedback" aria-live="polite">
        {fileError && (
          <p className="deck-import-error" role="alert">
            {t(fileError)}
          </p>
        )}
        {hasText && errors.length > 0 && (
          <div className="deck-import-errors">
            <strong>
              {t("Ispravi listu ({count})", { count: errors.length })}
            </strong>
            <ul>
              {errors.slice(0, 15).map((issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  {issue.line ? t("Red {line}: ", { line: issue.line }) : ""}
                  {t(issue.message)}
                </li>
              ))}
            </ul>
            {errors.length > 15 && (
              <p>{t("Još {count} grešaka.", { count: errors.length - 15 })}</p>
            )}
          </div>
        )}
        {hasText && warnings.length > 0 && (
          <ul className="deck-import-warnings">
            {warnings.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>{t(issue.message)}</li>
            ))}
          </ul>
        )}
        {result.deck && (
          <div className="deck-import-success">
            <Check size={18} />
            <div>
              <strong>{t(result.deck.name)}</strong>
              <span>
                {t("40 karata · 12 runa · {count} bojište/a · {domains}", {
                  count: result.deck.battlefieldIds?.length ?? 1,
                  domains: result.deck.domains
                    .map((domain) => t(domain))
                    .join(" / "),
                })}
              </span>
            </div>
          </div>
        )}
        {result.deck && result.coverage && (
          <div
            className={`deck-import-coverage ${result.coverage.complete ? "complete" : ""}`}
          >
            <Shield size={17} />
            <div>
              <strong>
                {t(
                  "{implemented}/{total} različitih karata podržano za igranje",
                  {
                    implemented: result.coverage.implemented,
                    total: result.coverage.total,
                  },
                )}
              </strong>
              <p>
                {result.coverage.complete
                  ? t("Špil je spreman za meč.")
                  : t(
                      "Lista se može sačuvati. Meč će biti dostupan kada sve karte budu podržane za igranje.",
                    )}
              </p>
              {result.coverage.missing.length > 0 && (
                <details>
                  <summary>
                    {t("Pregled nepodržanih karata ({count})", {
                      count: result.coverage.missing.length,
                    })}
                  </summary>
                  <ul>
                    {result.coverage.missing.map((card) => (
                      <li
                        key={card.cardId}
                        data-card-preview={card.cardId}
                        tabIndex={0}
                      >
                        {card.name} <small>{card.cardId}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="deck-import-footer">
        <span>{t("Obrada i čuvanje u ovom pregledniku.")}</span>
        <button
          className="gold-button"
          disabled={!result.deck || reading}
          onClick={() => result.deck && onImport(result.deck)}
        >
          {t("Sačuvaj špil")}
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
  return onClose ? (
    <div className="modal-backdrop" onClick={onClose}>
      {panel}
    </div>
  ) : (
    panel
  );
}
