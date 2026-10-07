import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Minus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  cardsById,
  getCardTypes,
  isCardType,
  readableText,
  type Domain,
} from "../data/cards";
import { cardArtUrl } from "../data/art";
import {
  decks,
  MAX_MAIN_DECK_SIZE,
  type DeckEntry,
  type StarterDeck,
} from "../data/decks";
import { findCard } from "../catalog";
import { exportDeckText } from "../game/deck-import";
import { isImplemented } from "../game/scripts";
import {
  balancedBuilderRunes,
  builderAddIssue,
  builderCards,
  builderChampions,
  builderCompatible,
  builderCount,
  builderCurve,
  changeBuilderQuantity,
  cloneDeckForBuilder,
  finalizeBuilderDeck,
  type BuilderAddIssue,
  type BuilderSection,
} from "../game/deck-builder";
import { useI18n } from "../i18n";
import { CardDetail } from "./Card";
import "./DeckBuilder.css";

export interface DeckBuilderProps {
  initialDeck?: StarterDeck;
  availableDecks?: StarterDeck[];
  /** A changed list receives a new stable ID. Replace previousId when updating. */
  onSave: (deck: StarterDeck, previousId?: string) => boolean | void;
  onClose?: () => void;
  onDelete?: (id: string) => boolean | void;
}

const domains: Domain[] = [
  "Fury",
  "Calm",
  "Mind",
  "Body",
  "Chaos",
  "Order",
  "Colorless",
];
const addMessages: Record<BuilderAddIssue, string> = {
  type: "Choose a card for this section.",
  domain: "This card does not match your legend's domains.",
  banned: "This card is banned in standard Duel.",
  copies: "Three copies total, including champion and sideboard.",
  unique: "Only one copy of a Unique card is allowed.",
  signature: "Three Signature cards total, including sideboard.",
  "signature-tag": "This Signature card belongs to another legend.",
  runes: "The rune deck already contains 12 runes.",
  sideboard: "The sideboard already contains 10 cards.",
  quantity: "The main deck reached the app limit of {count} cards.",
};

export function DeckBuilder({
  initialDeck,
  availableDecks = decks,
  onSave,
  onClose,
  onDelete,
}: DeckBuilderProps) {
  const { t } = useI18n();
  const addReason = (issue: BuilderAddIssue) =>
    t(addMessages[issue], { count: MAX_MAIN_DECK_SIZE });
  const initial = initialDeck ?? availableDecks[0] ?? decks[0];
  const [draft, setDraft] = useState(() => cloneDeckForBuilder(initial));
  const [previousId, setPreviousId] = useState(
    initialDeck?.source === "Imported deck" ? initialDeck.id : undefined,
  );
  const [sourceId, setSourceId] = useState(initial.id);
  const [section, setSection] = useState<BuilderSection>("main");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<Domain | "">("");
  const [type, setType] = useState("");
  const [cost, setCost] = useState("");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [visibleCount, setVisibleCount] = useState(36);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"cards" | "deck">("cards");

  useEffect(() => {
    if (!initialDeck) return;
    setDraft(cloneDeckForBuilder(initialDeck));
    setPreviousId(
      initialDeck.source === "Imported deck" ? initialDeck.id : undefined,
    );
    setSourceId(initialDeck.id);
    setStatus("");
  }, [initialDeck?.id]);
  useEffect(
    () => setVisibleCount(36),
    [search, domain, type, cost, compatibleOnly, section, draft.legendId],
  );

  const result = useMemo(() => finalizeBuilderDeck(draft), [draft]);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter(
    (issue) => issue.severity === "warning",
  );
  const champions = useMemo(
    () => builderChampions(draft.legendId),
    [draft.legendId],
  );
  const legends = builderCards.filter((card) => isCardType(card, "Legend"));
  const fields = draft.battlefieldIds ?? [draft.battlefieldId];
  const fieldCards = builderCards.filter(
    (card) =>
      isCardType(card, "Battlefield") &&
      builderCompatible(card, draft.domains) &&
      (draft.format === "historical-precon" || !card.bannedInDuel),
  );
  const runeCards = builderCards.filter(
    (card) =>
      isCardType(card, "Rune") &&
      (builderCompatible(card, draft.domains) ||
        draft.runes.some((entry) => entry.cardId === card.id)),
  );
  const curve = useMemo(() => builderCurve(draft), [draft]);
  const maximumCurve = Math.max(1, ...curve);
  const mainCount = builderCount(draft.main) + 1;
  const runeCount = builderCount(draft.runes);
  const sideCount = builderCount(draft.sideboard ?? []);
  const typeCounts = ["Unit", "Spell", "Gear"].map((kind) => ({
    kind,
    count: [{ cardId: draft.championId, count: 1 }, ...draft.main].reduce(
      (count, entry) =>
        count + (isCardType(cardsById[entry.cardId], kind) ? entry.count : 0),
      0,
    ),
  }));
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return builderCards.filter((card) => {
      if (
        section === "runes"
          ? !isCardType(card, "Rune")
          : !["Unit", "Spell", "Gear"].some((kind) => isCardType(card, kind))
      )
        return false;
      if (compatibleOnly && !builderCompatible(card, draft.domains))
        return false;
      if (domain && !card.domains.includes(domain)) return false;
      if (type && !isCardType(card, type)) return false;
      if (
        cost &&
        (cost === "9+"
          ? (card.energy ?? 0) < 9
          : (card.energy ?? 0) !== Number(cost))
      )
        return false;
      return (
        !query ||
        `${card.name} ${card.id} ${readableText(card.text)} ${card.tags.join(" ")}`
          .toLocaleLowerCase()
          .includes(query)
      );
    });
  }, [search, section, compatibleOnly, draft.domains, domain, type, cost]);

  const update = (next: StarterDeck | ((deck: StarterDeck) => StarterDeck)) => {
    setDraft(next);
    setStatus("");
  };
  const quantity = (
    cardId: string,
    destination: BuilderSection,
    delta: 1 | -1,
  ) =>
    update((deck) => changeBuilderQuantity(deck, cardId, destination, delta));
  const cardDetails = (cardId: string) => setDetailId(cardId);
  const cloneSource = () => {
    const source = availableDecks.find((deck) => deck.id === sourceId);
    if (!source) return;
    const copy = cloneDeckForBuilder(source);
    copy.name = `${source.name} · ${t("Copy")}`.slice(0, 120);
    update(copy);
    setPreviousId(undefined);
  };
  const save = () => {
    if (!result.deck || !draft.name.trim()) return;
    try {
      const saved = onSave(result.deck, previousId);
      if (saved === false)
        setStatus(
          "The deck could not be saved. Export the list to keep a copy.",
        );
      else {
        setPreviousId(result.deck.id);
        setStatus("Deck saved in this browser.");
      }
    } catch {
      setStatus("The deck could not be saved. Export the list to keep a copy.");
    }
  };
  const download = () => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([exportDeckText(draft)], { type: "text/plain;charset=utf-8" }),
    );
    link.href = url;
    link.download = `${draft.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "riftbound-deck"}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const chooseLegend = (id: string) => {
    const nextLegend = cardsById[id];
    const choices = builderChampions(id).filter(
      (card) => draft.format === "historical-precon" || !card.bannedInDuel,
    );
    update({
      ...draft,
      legendId: id,
      domains: [...nextLegend.domains],
      champion: nextLegend.tags[0] ?? nextLegend.name,
      championId: choices.some((card) => card.id === draft.championId)
        ? draft.championId
        : (choices[0]?.id ?? ""),
      runes: balancedBuilderRunes(nextLegend.domains),
    });
  };
  const entryRow = (entry: DeckEntry, destination: BuilderSection) => {
    const card = cardsById[entry.cardId];
    const block = builderAddIssue(draft, entry.cardId, destination);
    return (
      <div className="builder-deck-row" key={entry.cardId}>
        <button
          className="builder-entry-name"
          data-card-preview={card?.id}
          onClick={() => cardDetails(entry.cardId)}
        >
          <span className="builder-entry-cost">{card?.energy ?? "◈"}</span>
          <span>
            {card?.name ?? entry.cardId}
            <small>
              {card
                ? getCardTypes(card)
                    .map((kind) => t(kind))
                    .join(" / ")
                : ""}
            </small>
          </span>
        </button>
        <div className="builder-stepper">
          <button
            disabled={!entry.count}
            onClick={() => quantity(entry.cardId, destination, -1)}
            aria-label={t("Remove one {name}", {
              name: card?.name ?? entry.cardId,
            })}
          >
            <Minus size={15} />
          </button>
          <strong aria-label={t("{count} copies", { count: entry.count })}>
            {entry.count}
          </strong>
          <button
            disabled={Boolean(block)}
            title={block ? addReason(block) : undefined}
            onClick={() => quantity(entry.cardId, destination, 1)}
            aria-label={t("Add one {name}", {
              name: card?.name ?? entry.cardId,
            })}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
    );
  };
  const detail = findCard(detailId ?? undefined);

  return (
    <section className="deck-builder" aria-labelledby="deck-builder-title">
      <header className="builder-header">
        <div>
          <span className="builder-eyebrow">
            {t("YOUR CARDS · YOUR STRATEGY")}
          </span>
          <h1 id="deck-builder-title">{t("Deck builder")}</h1>
          <p>
            {t(
              "Build from a precon, tune your list, and play it against the AI.",
            )}
          </p>
        </div>
        {onClose && (
          <button className="builder-button secondary" onClick={onClose}>
            <ArrowLeft size={17} />
            {t("Back to decks")}
          </button>
        )}
      </header>

      <div className="builder-start">
        <label htmlFor="builder-source">{t("Start from a deck")}</label>
        <select
          id="builder-source"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
        >
          {availableDecks.map((deck) => (
            <option value={deck.id} key={deck.id}>
              {deck.name} ·{" "}
              {t(
                deck.source === "Imported deck"
                  ? "My decks"
                  : deck.source === "Official preconstructed deck"
                    ? "Precons"
                    : "Practice",
              )}
            </option>
          ))}
        </select>
        <button className="builder-button secondary" onClick={cloneSource}>
          <Copy size={16} />
          {t("Load as a copy")}
        </button>
        <button
          className="builder-button secondary"
          onClick={() => {
            update({
              ...draft,
              name: t("New deck"),
              main: [],
              sideboard: [],
              runes: balancedBuilderRunes(draft.domains),
            });
            setPreviousId(undefined);
          }}
        >
          {t("New deck")}
        </button>
      </div>

      <div className="builder-identity">
        <label>
          {t("Deck name")}
          <input
            value={draft.name}
            maxLength={120}
            onChange={(event) => update({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          {t("Legend")}
          <select
            value={draft.legendId}
            onChange={(event) => chooseLegend(event.target.value)}
          >
            {legends.map((card) => (
              <option
                key={card.id}
                value={card.id}
                disabled={
                  card.bannedInDuel && draft.format !== "historical-precon"
                }
              >
                {card.name} ·{" "}
                {card.domains.map((value) => t(value)).join(" / ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Chosen champion")}
          <select
            value={draft.championId}
            onChange={(event) =>
              update({ ...draft, championId: event.target.value })
            }
          >
            {!champions.length && (
              <option value="">{t("No compatible champion")}</option>
            )}
            {champions.map((card) => (
              <option
                key={card.id}
                value={card.id}
                disabled={
                  card.bannedInDuel && draft.format !== "historical-precon"
                }
              >
                {card.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Format")}
          <select
            value={draft.format ?? "standard"}
            onChange={(event) =>
              update({
                ...draft,
                format: event.target.value as "standard" | "historical-precon",
              })
            }
          >
            <option value="standard">{t("Standard Duel")}</option>
            <option value="historical-precon">{t("Historical precon")}</option>
          </select>
        </label>
      </div>
      <p className="builder-identity-note">
        {t(
          "Changing the legend keeps your main cards for review and balances its runes.",
        )}{" "}
        {draft.format === "historical-precon" &&
          t("Historical format preserves cards banned in current Standard.")}
      </p>

      <div className="builder-mobile-summary">
        <div className="builder-counts">
          <span>
            <strong>{mainCount}</strong>
            {t("Main · minimum 40")}
          </span>
          <span>
            <strong>{runeCount}/12</strong>
            {t("Runes")}
          </span>
          <span>
            <strong>{fields.length}/3</strong>
            {t("Battlefields")}
          </span>
          <span>
            <strong>{sideCount}/10</strong>
            {t("Sideboard")}
          </span>
        </div>
        <div className="builder-mobile-views">
          <button
            aria-pressed={mobileView === "cards"}
            onClick={() => setMobileView("cards")}
          >
            {t("Add cards")}
          </button>
          <button
            aria-pressed={mobileView === "deck"}
            onClick={() => setMobileView("deck")}
          >
            {t("Deck list & legality")}
            {errors.length > 0 && <span>{errors.length}</span>}
          </button>
        </div>
      </div>
      <div className={`builder-layout builder-show-${mobileView}`}>
        <main className="builder-catalog">
          <div
            className="builder-section-tabs"
            role="tablist"
            aria-label={t("Add cards to")}
          >
            {(["main", "sideboard", "runes"] as BuilderSection[]).map(
              (value) => (
                <button
                  role="tab"
                  aria-selected={section === value}
                  className={section === value ? "active" : ""}
                  key={value}
                  onClick={() => {
                    setSection(value);
                    setType("");
                    setCost("");
                  }}
                >
                  {t(
                    value === "main"
                      ? "Main deck"
                      : value === "sideboard"
                        ? "Sideboard"
                        : "Runes",
                  )}
                </button>
              ),
            )}
          </div>
          <div className="builder-filters">
            <label className="builder-search">
              <Search size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search name, rules or tag…")}
                aria-label={t("Search cards")}
              />
            </label>
            <select
              aria-label={t("Filter by domain")}
              value={domain}
              onChange={(event) => setDomain(event.target.value as Domain | "")}
            >
              <option value="">{t("All domains")}</option>
              {domains.map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Filter by type")}
              value={type}
              disabled={section === "runes"}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">{t("All types")}</option>
              {["Unit", "Spell", "Gear"].map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Filter by energy cost")}
              value={cost}
              disabled={section === "runes"}
              onChange={(event) => setCost(event.target.value)}
            >
              <option value="">{t("Any cost")}</option>
              {Array.from({ length: 10 }, (_, index) =>
                index === 9 ? "9+" : String(index),
              ).map((value) => (
                <option value={value} key={value}>
                  {value} {t("Energy")}
                </option>
              ))}
            </select>
            <label className="builder-checkbox">
              <input
                type="checkbox"
                checked={compatibleOnly}
                onChange={(event) => setCompatibleOnly(event.target.checked)}
              />
              {t("Legend domains only")}
            </label>
          </div>
          <div className="builder-results-heading">
            <strong>
              {t("{count} different rules cards", { count: filtered.length })}
            </strong>
            <span>
              {t("Adding to: {section}", {
                section: t(
                  section === "main"
                    ? "Main deck"
                    : section === "sideboard"
                      ? "Sideboard"
                      : "Runes",
                ),
              })}
            </span>
          </div>
          <div className="builder-card-list">
            {filtered.slice(0, visibleCount).map((card) => {
              const count =
                (draft[section] ?? []).find((entry) => entry.cardId === card.id)
                  ?.count ?? 0;
              const block = builderAddIssue(draft, card.id, section);
              return (
                <article className="builder-card" key={card.id}>
                  <button
                    className="builder-card-art"
                    aria-label={t("Read {name}", { name: card.name })}
                    onClick={() => cardDetails(card.id)}
                    data-card-preview={card.id}
                  >
                    <img src={cardArtUrl(card)} alt="" loading="lazy" />
                    <span>{card.energy ?? "◈"}</span>
                  </button>
                  <div className="builder-card-copy">
                    <button
                      className="builder-card-name"
                      onClick={() => cardDetails(card.id)}
                      data-card-preview={card.id}
                    >
                      {card.name}
                    </button>
                    <small>
                      {[
                        card.supertype,
                        getCardTypes(card)
                          .map((kind) => t(kind))
                          .join(" / "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}{" "}
                      · {card.domains.map((value) => t(value)).join(" / ")}
                    </small>
                    <p>
                      {readableText(card.text) ||
                        t("No additional rules text.")}
                    </p>
                    <div className="builder-card-action">
                      <div className="builder-stepper">
                        <button
                          disabled={!count}
                          onClick={() => quantity(card.id, section, -1)}
                          aria-label={t("Remove one {name}", {
                            name: card.name,
                          })}
                        >
                          <Minus size={15} />
                        </button>
                        <strong>{count}</strong>
                        <button
                          disabled={Boolean(block)}
                          onClick={() => quantity(card.id, section, 1)}
                          title={block ? addReason(block) : undefined}
                          aria-label={t("Add one {name}", { name: card.name })}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      {block && (
                        <span className="builder-add-reason">
                          {addReason(block)}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {!filtered.length && (
            <p className="builder-empty">
              {t("No cards match these filters.")}
            </p>
          )}
          {visibleCount < filtered.length && (
            <button
              className="builder-button secondary builder-show-more"
              onClick={() => setVisibleCount((value) => value + 36)}
            >
              {t("Show more cards ({count} remaining)", {
                count: filtered.length - visibleCount,
              })}
            </button>
          )}
        </main>

        <aside className="builder-deck" aria-label={t("Your deck list")}>
          <div className="builder-counts">
            <span className={mainCount >= 40 ? "complete" : ""}>
              <strong>{mainCount}</strong>
              {t("Main · minimum 40")}
            </span>
            <span className={runeCount === 12 ? "complete" : ""}>
              <strong>{runeCount}/12</strong>
              {t("Runes")}
            </span>
            <span
              className={
                fields.length === 1 || fields.length === 3 ? "complete" : ""
              }
            >
              <strong>{fields.length}/3</strong>
              {t("Battlefields")}
            </span>
            <span>
              <strong>{sideCount}/10</strong>
              {t("Sideboard")}
            </span>
          </div>
          <section className="builder-curve">
            <h2>{t("Energy curve")}</h2>
            <div
              className="builder-curve-bars"
              role="img"
              aria-label={t("Energy curve: {curve}", {
                curve: curve
                  .map(
                    (count, index) => `${index === 9 ? "9+" : index}: ${count}`,
                  )
                  .join(", "),
              })}
            >
              {curve.map((count, index) => (
                <div key={index}>
                  <strong>{count || ""}</strong>
                  <span
                    style={{
                      height: `${Math.max(3, (count / maximumCurve) * 72)}px`,
                    }}
                  />
                  <small>{index === 9 ? "9+" : index}</small>
                </div>
              ))}
            </div>
            <p>
              {typeCounts
                .map(({ kind, count }) => `${t(kind)} ${count}`)
                .join(" · ")}
            </p>
          </section>
          <section>
            <h2>
              {t("Chosen champion")}{" "}
              <small>{t("Included in main count")}</small>
            </h2>
            <button
              className="builder-champion"
              onClick={() => cardDetails(draft.championId)}
              data-card-preview={draft.championId}
            >
              {cardsById[draft.championId]?.name ?? t("No compatible champion")}
            </button>
          </section>
          <section>
            <h2>
              {t("Main deck")}{" "}
              <small>
                {t("{count} cards + champion", {
                  count: builderCount(draft.main),
                })}
              </small>
            </h2>
            {draft.main.map((entry) => entryRow(entry, "main"))}
            {!draft.main.length && (
              <p className="builder-empty">
                {t("Add cards from the catalog.")}
              </p>
            )}
          </section>
          <section className="builder-runes">
            <h2>
              {t("Runes")} <small>{runeCount}/12</small>
            </h2>
            {runeCards.map((card) =>
              entryRow(
                {
                  cardId: card.id,
                  count:
                    draft.runes.find((entry) => entry.cardId === card.id)
                      ?.count ?? 0,
                },
                "runes",
              ),
            )}
            <button
              className="builder-button secondary"
              onClick={() =>
                update({ ...draft, runes: balancedBuilderRunes(draft.domains) })
              }
            >
              {t("Balance 12 runes")}
            </button>
          </section>
          <section className="builder-fields">
            <h2>{t("Battlefields")}</h2>
            <p>
              {t(
                "Choose one for practice or three different battlefields. The first is your default.",
              )}
            </p>
            {fields.map((id) => (
              <div className="builder-field-row" key={id}>
                <button
                  className={`builder-field-default ${draft.battlefieldId === id ? "active" : ""}`}
                  aria-label={t("Use {name} as default battlefield", {
                    name: cardsById[id]?.name ?? id,
                  })}
                  aria-pressed={draft.battlefieldId === id}
                  onClick={() =>
                    update({
                      ...draft,
                      battlefieldId: id,
                      battlefieldIds: [
                        id,
                        ...fields.filter((value) => value !== id),
                      ],
                    })
                  }
                >
                  {draft.battlefieldId === id ? <Check size={16} /> : "○"}
                </button>
                <button
                  className="builder-field-name"
                  onClick={() => cardDetails(id)}
                  data-card-preview={id}
                >
                  {cardsById[id]?.name ?? id}
                </button>
                <button
                  className="builder-field-remove"
                  aria-label={t("Remove {name}", {
                    name: cardsById[id]?.name ?? id,
                  })}
                  onClick={() => {
                    const remaining = fields.filter((value) => value !== id);
                    update({
                      ...draft,
                      battlefieldIds: remaining,
                      battlefieldId:
                        draft.battlefieldId === id
                          ? (remaining[0] ?? "")
                          : draft.battlefieldId,
                    });
                  }}
                >
                  <Minus size={16} />
                </button>
              </div>
            ))}
            <select
              aria-label={t("Add a battlefield")}
              value=""
              disabled={fields.length >= 3}
              onChange={(event) => {
                const id = event.target.value;
                update({
                  ...draft,
                  battlefieldIds: [...fields, id],
                  battlefieldId: fields.length ? draft.battlefieldId : id,
                });
              }}
            >
              <option value="">{t("Add a battlefield…")}</option>
              {fieldCards
                .filter(
                  (card) =>
                    !fields.some((id) => cardsById[id]?.name === card.name),
                )
                .map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
            </select>
          </section>
          <section>
            <h2>
              {t("Sideboard")} <small>{sideCount}/10</small>
            </h2>
            <p>
              {t(
                "Sideboard cards share copy limits with your main deck and chosen champion.",
              )}
            </p>
            {(draft.sideboard ?? []).map((entry) =>
              entryRow(entry, "sideboard"),
            )}
            {!sideCount && (
              <p className="builder-empty">
                {t("Optional · saved for export and match preparation.")}
              </p>
            )}
          </section>
          <section
            className={`builder-validation ${errors.length ? "has-errors" : "complete"}`}
            aria-live="polite"
          >
            <h2>
              {errors.length
                ? t("Fix {count} deck issues", { count: errors.length })
                : t("Deck is legal")}
            </h2>
            {errors.length > 0 && (
              <ul>
                {errors.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{t(issue.message)}</li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <details>
                <summary>
                  {t("{count} notes", { count: warnings.length })}
                </summary>
                <ul>
                  {warnings.map((issue, index) => (
                    <li key={`${issue.code}-${index}`}>{t(issue.message)}</li>
                  ))}
                </ul>
              </details>
            )}
            {result.coverage && (
              <p>
                {t("{implemented}/{total} rules cards supported for play", {
                  implemented: result.coverage.implemented,
                  total: result.coverage.total,
                })}
              </p>
            )}
          </section>
        </aside>
      </div>

      <footer className="builder-footer">
        <div>
          <strong>{draft.name || t("Name your deck")}</strong>
          <span>{t("Saved locally in this browser.")}</span>
        </div>
        <button
          className="builder-button secondary"
          onClick={() => setExportOpen((value) => !value)}
          aria-expanded={exportOpen}
        >
          <Copy size={16} />
          {t("Export text")}
        </button>
        <button className="builder-button secondary" onClick={download}>
          <Download size={16} />
          {t("Download .txt")}
        </button>
        {previousId && onDelete && (
          <button
            className="builder-button danger"
            onClick={() => {
              try {
                if (onDelete(previousId) === false)
                  setStatus("The deck could not be deleted.");
                else {
                  setPreviousId(undefined);
                  setStatus(
                    "Saved deck deleted. Your draft remains available.",
                  );
                }
              } catch {
                setStatus("The deck could not be deleted.");
              }
            }}
          >
            <Trash2 size={16} />
            {t("Delete saved deck")}
          </button>
        )}
        <button
          className="builder-button primary"
          disabled={!result.deck || !draft.name.trim()}
          onClick={save}
        >
          <Check size={17} />
          {t(previousId ? "Update deck" : "Save deck")}
        </button>
      </footer>
      {status && (
        <p className="builder-status" role="status">
          {t(status)}
        </p>
      )}
      {exportOpen && (
        <section className="builder-export">
          <label htmlFor="builder-export-text">
            {t("Copy this text to exchange or back up your deck.")}
          </label>
          <textarea
            id="builder-export-text"
            readOnly
            value={exportDeckText(draft)}
            onFocus={(event) => event.target.select()}
          />
          <p>
            {errors.length
              ? t(
                  "This draft still has deck issues. Fix them before importing or playing.",
                )
              : t("This export preserves your exact cards and quantities.")}
          </p>
        </section>
      )}
      {detail && (
        <CardDetail
          card={detail}
          scripted={isImplemented(detail.id)}
          onClose={() => setDetailId(null)}
        />
      )}
    </section>
  );
}
