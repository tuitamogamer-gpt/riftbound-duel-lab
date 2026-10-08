import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  Minus,
  Plus,
  Search,
  Trash2,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import {
  cardsById,
  cards,
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
import {
  createCardSearchIndex,
  matchesCardSearch,
  sortCatalogCards,
  type CatalogSort,
} from "../catalog-query";
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
  canonicalBuilderId,
  changeBuilderQuantity,
  cloneDeckForBuilder,
  finalizeBuilderDeck,
  type BuilderAddIssue,
  type BuilderSection,
} from "../game/deck-builder";
import {
  builderHistoryReducer,
  createBuilderHistory,
} from "../game/builder-history";
import {
  BUILDER_DRAFT_KEY,
  clearBuilderDraft,
  readBuilderDraft,
  writeBuilderDraft,
  type BuilderDraftRead,
} from "../game/builder-draft";
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
const searchIndex = createCardSearchIndex(cards, canonicalBuilderId);
const cardSets = [
  ...new Map(
    cards
      .filter((card) => card.supertype !== "Token")
      .map((card) => [card.set, card.setName]),
  ).entries(),
].sort(([a], [b]) => a.localeCompare(b));
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
  const [history, dispatch] = useReducer(builderHistoryReducer, undefined, () =>
    createBuilderHistory({
      draft: cloneDeckForBuilder(initial),
      previousId:
        initialDeck?.source === "Imported deck" ? initialDeck.id : undefined,
      sourceId: initial.id,
    }),
  );
  const { draft, previousId, sourceId } = history.present;
  const [storedDraft, setStoredDraft] = useState<BuilderDraftRead>(() =>
    readBuilderDraft(),
  );
  const draftRaw = useRef(storedDraft.raw);
  const [dirty, setDirty] = useState(false);
  const [backupStatus, setBackupStatus] = useState<"idle" | "saved" | "error">(
    storedDraft.status === "unavailable" ? "error" : "idle",
  );
  const [section, setSection] = useState<BuilderSection>("main");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<Domain | "">("");
  const [type, setType] = useState("");
  const [cost, setCost] = useState("");
  const [set, setSet] = useState("");
  const [sort, setSort] = useState<CatalogSort>("name");
  const [addableOnly, setAddableOnly] = useState(false);
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [visibleCount, setVisibleCount] = useState(36);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"cards" | "deck">("cards");

  useEffect(() => {
    if (!initialDeck) return;
    dispatch({
      type: "reset",
      next: {
        draft: cloneDeckForBuilder(initialDeck),
        previousId:
          initialDeck.source === "Imported deck" ? initialDeck.id : undefined,
        sourceId: initialDeck.id,
      },
    });
    setDirty(false);
    setBackupStatus(storedDraft.status === "unavailable" ? "error" : "idle");
    setStatus("");
  }, [initialDeck?.id]);
  useEffect(
    () => setVisibleCount(36),
    [
      search,
      domain,
      type,
      cost,
      set,
      sort,
      addableOnly,
      compatibleOnly,
      section,
      draft.legendId,
    ],
  );
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== BUILDER_DRAFT_KEY && event.key !== null) return;
      const current = readBuilderDraft();
      if (current.raw === draftRaw.current) return;
      draftRaw.current = current.raw;
      setStoredDraft(current);
      setBackupStatus(current.status === "unavailable" ? "error" : "idle");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (
      !dirty ||
      storedDraft.status === "ready" ||
      storedDraft.status === "invalid"
    )
      return;
    const result = writeBuilderDraft(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        deck: draft,
        previousId,
        sourceId,
      },
      undefined,
      draftRaw.current,
    );
    if (result.ok) {
      draftRaw.current = result.raw;
      setBackupStatus("saved");
    } else {
      setBackupStatus("error");
      if (result.reason === "conflict" || result.reason === "invalid") {
        const current = readBuilderDraft();
        draftRaw.current = current.raw;
        setStoredDraft(current);
      }
    }
  }, [draft, previousId, sourceId, dirty, storedDraft]);
  useEffect(() => {
    if (
      !dirty ||
      (backupStatus !== "error" &&
        storedDraft.status !== "ready" &&
        storedDraft.status !== "invalid")
    )
      return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, backupStatus, storedDraft.status]);
  useEffect(() => {
    if (detailId) return;
    const shortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.isComposing
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='dialog'], [aria-modal='true']",
        )
      )
        return;
      const direction = key === "y" || event.shiftKey ? "redo" : "undo";
      if (!(direction === "undo" ? history.past.length : history.future.length))
        return;
      event.preventDefault();
      dispatch({ type: direction });
      setDirty(true);
      setStatus("");
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [detailId, history.past.length, history.future.length]);

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
  const mainCount = builderCount(draft.main) + (draft.championId ? 1 : 0);
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
    return sortCatalogCards(
      builderCards.filter((card) => {
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
        if (set && !searchIndex.get(card.id)?.sets.includes(set)) return false;
        if (addableOnly && builderAddIssue(draft, card.id, section))
          return false;
        if (
          cost &&
          (cost === "9+"
            ? (card.energy ?? 0) < 9
            : (card.energy ?? 0) !== Number(cost))
        )
          return false;
        return matchesCardSearch(searchIndex.get(card.id), search);
      }),
      sort,
    );
  }, [
    search,
    section,
    compatibleOnly,
    draft,
    domain,
    type,
    cost,
    set,
    addableOnly,
    sort,
  ]);

  const update = (
    next: StarterDeck | ((deck: StarterDeck) => StarterDeck),
    identity?: { previousId?: string },
  ) => {
    dispatch({
      type: "edit",
      next: {
        ...history.present,
        ...identity,
        draft: typeof next === "function" ? next(draft) : next,
      },
    });
    setDirty(true);
    setStatus("");
  };
  const undo = (direction: "undo" | "redo") => {
    dispatch({ type: direction });
    setDirty(true);
    setStatus("");
  };
  const resetFilters = () => {
    setSearch("");
    setDomain("");
    setType("");
    setCost("");
    setSet("");
    setAddableOnly(false);
    setCompatibleOnly(true);
  };
  const discardDraft = () => {
    const result = clearBuilderDraft(undefined, draftRaw.current);
    if (result.ok) {
      draftRaw.current = null;
      setStoredDraft({ status: "empty", raw: null });
      setBackupStatus("idle");
    } else setBackupStatus("error");
  };
  const restoreDraft = () => {
    if (storedDraft.status !== "ready") return;
    const recovered = storedDraft.draft;
    update(cloneDeckForBuilder(recovered.deck), {
      previousId: recovered.previousId,
    });
    dispatch({
      type: "source",
      id: availableDecks.some((deck) => deck.id === recovered.sourceId)
        ? recovered.sourceId
        : initial.id,
    });
    setStoredDraft({ status: "empty", raw: null });
    setStatus("Unfinished draft restored. Review the list before saving.");
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
    update(copy, { previousId: undefined });
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
        dispatch({ type: "saved", id: result.deck.id });
        // Saving another deck must not discard an unchosen recovery backup.
        if (
          storedDraft.status !== "ready" &&
          storedDraft.status !== "invalid"
        ) {
          const cleared = clearBuilderDraft(undefined, draftRaw.current);
          if (cleared.ok) {
            draftRaw.current = null;
            setStoredDraft({ status: "empty", raw: null });
            setBackupStatus("idle");
          } else setBackupStatus("error");
        }
        setDirty(false);
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
    <section
      className="deck-builder"
      id="main-content"
      tabIndex={-1}
      aria-labelledby="deck-builder-title"
    >
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

      {(storedDraft.status === "ready" || storedDraft.status === "invalid") && (
        <section
          className="builder-recovery"
          aria-label={t("Unfinished deck draft")}
        >
          <div>
            <strong>
              {t(
                storedDraft.status === "ready"
                  ? "An unfinished draft is available"
                  : "The stored draft could not be read",
              )}
            </strong>
            <p>
              {storedDraft.status === "ready"
                ? t(
                    "Restore {name}, or discard its backup to keep editing this deck.",
                    { name: storedDraft.draft.deck.name || t("New deck") },
                  )
                : t(
                    "The stored draft remains untouched. Export your current list, or clear the unreadable backup to enable draft saving.",
                  )}
            </p>
          </div>
          {storedDraft.status === "ready" && (
            <button className="builder-button primary" onClick={restoreDraft}>
              {t("Restore draft")}
            </button>
          )}
          <button className="builder-button secondary" onClick={discardDraft}>
            {t(
              storedDraft.status === "ready"
                ? "Discard stored draft"
                : "Clear unreadable backup",
            )}
          </button>
        </section>
      )}

      <div className="builder-start">
        <label htmlFor="builder-source">{t("Start from a deck")}</label>
        <select
          id="builder-source"
          value={sourceId}
          onChange={(event) =>
            dispatch({ type: "source", id: event.target.value })
          }
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
            update(
              {
                ...draft,
                name: t("New deck"),
                main: [],
                sideboard: [],
                runes: balancedBuilderRunes(draft.domains),
              },
              { previousId: undefined },
            );
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

      <div className="builder-edit-tools">
        <div className="builder-undo">
          <button
            className="builder-button secondary"
            disabled={!history.past.length}
            onClick={() => undo("undo")}
            aria-keyshortcuts="Control+Z Meta+Z"
            title={`${t("Undo edit")} · Ctrl/⌘ Z`}
          >
            <Undo2 size={16} />
            {t("Undo edit")}
          </button>
          <button
            className="builder-button secondary"
            disabled={!history.future.length}
            onClick={() => undo("redo")}
            aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
            title={`${t("Redo edit")} · Ctrl/⌘ Shift Z`}
          >
            <Redo2 size={16} />
            {t("Redo edit")}
          </button>
        </div>
        <p
          className={backupStatus === "error" ? "builder-backup-error" : ""}
          role="status"
        >
          {backupStatus === "error"
            ? t("Draft backup failed. Export your list to keep a copy.")
            : storedDraft.status === "ready" || storedDraft.status === "invalid"
              ? t(
                  "Choose what to do with the stored draft before automatic backup resumes.",
                )
              : backupStatus === "saved"
                ? t("Unfinished draft backed up in this browser.")
                : t("Edits are backed up here. Save a legal deck to play it.")}
        </p>
      </div>

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
                placeholder={t("Search name, rules, tag or card ID…")}
                aria-label={t("Search cards")}
              />
              {search && (
                <button
                  className="builder-clear-search"
                  onClick={() => setSearch("")}
                  aria-label={t("Clear card search")}
                >
                  <X size={16} />
                </button>
              )}
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
            <select
              aria-label={t("Filter by card set")}
              value={set}
              onChange={(event) => setSet(event.target.value)}
            >
              <option value="">{t("All sets")}</option>
              {cardSets.map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("Sort cards")}
              value={sort}
              onChange={(event) => setSort(event.target.value as CatalogSort)}
            >
              <option value="name">{t("Name · A–Z")}</option>
              <option value="energy-asc">{t("Energy · low to high")}</option>
              <option value="energy-desc">{t("Energy · high to low")}</option>
              <option value="might-desc">{t("Might · high to low")}</option>
            </select>
            <div className="builder-filter-toggles">
              <label className="builder-checkbox">
                <input
                  type="checkbox"
                  checked={compatibleOnly}
                  onChange={(event) => setCompatibleOnly(event.target.checked)}
                />
                {t("Legend domains only")}
              </label>
              <label className="builder-checkbox">
                <input
                  type="checkbox"
                  checked={addableOnly}
                  onChange={(event) => setAddableOnly(event.target.checked)}
                />
                {t("Can add to this section")}
              </label>
            </div>
          </div>
          <div className="builder-filter-tools">
            <small>
              {t(
                "Use several terms to narrow results. Card IDs include alternate printings.",
              )}
            </small>
            <button className="builder-reset-filters" onClick={resetFilters}>
              {t("Reset filters")}
            </button>
          </div>
          <div className="builder-results-heading">
            <strong>
              {t("Showing {shown} of {count} rules cards", {
                shown: Math.min(visibleCount, filtered.length),
                count: filtered.length,
              })}
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
                    <small className="builder-card-stats">
                      {[
                        card.energy === null
                          ? ""
                          : `${card.energy} ${t("Energy")}`,
                        card.power === null
                          ? ""
                          : `${card.power} ${t("Power")}`,
                        card.might === null
                          ? ""
                          : `${card.might} ${t("Might")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
            <div className="builder-empty-results">
              <p className="builder-empty">
                {t("No cards match these filters.")}
              </p>
              <button
                className="builder-button secondary"
                onClick={resetFilters}
              >
                {t("Reset filters")}
              </button>
            </div>
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
            disabled={
              storedDraft.status === "ready" || storedDraft.status === "invalid"
            }
            title={
              storedDraft.status === "ready" || storedDraft.status === "invalid"
                ? t(
                    "Choose what to do with the stored draft before automatic backup resumes.",
                  )
                : undefined
            }
            onClick={() => {
              // The host may navigate away immediately after deletion. Retain
              // the exact editable list before removing its saved counterpart.
              const backup = writeBuilderDraft(
                {
                  version: 1,
                  savedAt: new Date().toISOString(),
                  deck: draft,
                  sourceId,
                },
                undefined,
                draftRaw.current,
              );
              if (!backup.ok) {
                setBackupStatus("error");
                setStatus(
                  "Draft backup failed. Export your list to keep a copy.",
                );
                if (
                  backup.reason === "conflict" ||
                  backup.reason === "invalid"
                ) {
                  const current = readBuilderDraft();
                  draftRaw.current = current.raw;
                  setStoredDraft(current);
                }
                return;
              }
              draftRaw.current = backup.raw;
              setBackupStatus("saved");
              try {
                if (onDelete(previousId) === false)
                  setStatus("The deck could not be deleted.");
                else {
                  dispatch({ type: "saved", id: undefined });
                  setDirty(true);
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
