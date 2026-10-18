import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { catalog, type CatalogCard } from "../catalog";
import { catalogMeta, isCardType } from "../data/cards";
import { scripts } from "../game/scripts";
import { canonicalBuilderId } from "../game/deck-builder";
import {
  createCardSearchIndex,
  matchesCardSearch,
  sortCatalogCards,
  type CatalogSort,
} from "../catalog-query";
import { Card } from "./Card";
import "./CardLibrary.css";

const supported = (card: CatalogCard) =>
  Boolean(scripts[card.id]) || card.type === "Rune";
const catalogSets = [
  ...new Map(catalog.map((card) => [card.set, card.setName])).entries(),
];
const printingSearch = createCardSearchIndex(catalog);
const faceSearch = createCardSearchIndex(catalog, canonicalBuilderId);

export function CardLibrary({
  inspect,
}: {
  inspect: (c: CatalogCard) => void;
}) {
  const { t, locale } = useI18n();
  const searchInput = useRef<HTMLInputElement>(null);
  const toolbar = useRef<HTMLElement>(null);
  const refinement = useRef<HTMLDetailsElement>(null);
  const refinementPanel = useRef<HTMLDivElement>(null);
  const filterChips = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | "search" | "filters" | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(""),
    [domain, setDomain] = useState("Sve domene"),
    [type, setType] = useState("Sve vrste"),
    [set, setSet] = useState("all"),
    [baseOnly, setBaseOnly] = useState(false),
    [onlyScripted, setOnlyScripted] = useState(false),
    [sort, setSort] = useState<CatalogSort>("name"),
    [limit, setLimit] = useState(60);

  const closeFilters = useCallback(() => {
    // Native details toggle events are queued; close the disclosure immediately.
    if (refinement.current) refinement.current.open = false;
    setFiltersOpen(false);
  }, []);

  useEffect(() => {
    if (!filtersOpen) return;
    const position = () => {
      if (!toolbar.current || !refinementPanel.current) return;
      const viewport = window.visualViewport;
      const bottom = toolbar.current.getBoundingClientRect().bottom;
      const available =
        (viewport?.height || window.innerHeight) +
        (viewport?.offsetTop || 0) -
        bottom -
        16;
      refinementPanel.current.style.maxHeight = `${Math.max(80, available)}px`;
    };
    if (
      toolbar.current &&
      toolbar.current.getBoundingClientRect().bottom > window.innerHeight - 210
    )
      toolbar.current.scrollIntoView({ block: "start" });
    position();
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !refinement.current?.contains(event.target)
      )
        closeFilters();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeFilters();
      refinement.current?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [filtersOpen, closeFilters]);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const chips = filterChips.current?.querySelectorAll("button");
    const nextChip =
      typeof target === "number" && chips?.length
        ? chips[Math.min(target, chips.length - 1)]
        : null;
    const fallback =
      target === "search"
        ? searchInput.current
        : refinement.current?.querySelector("summary");
    (nextChip || fallback)?.focus({ preventScroll: true });
  }, [search, domain, type, set, baseOnly, onlyScripted, sort]);

  const clearSearch = () => {
    setSearch("");
    setLimit(60);
    searchInput.current?.focus();
  };
  const resetFilters = () => {
    pendingFocus.current = filtersOpen ? "filters" : "search";
    setSearch("");
    setDomain("Sve domene");
    setType("Sve vrste");
    setSet("all");
    setBaseOnly(false);
    setOnlyScripted(false);
    setSort("name");
    setLimit(60);
  };
  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (domain !== "Sve domene")
    activeFilters.push({
      key: "domain",
      label: t(domain),
      clear: () => setDomain("Sve domene"),
    });
  if (type !== "Sve vrste")
    activeFilters.push({
      key: "type",
      label: t(type),
      clear: () => setType("Sve vrste"),
    });
  if (set !== "all")
    activeFilters.push({
      key: "set",
      label:
        set === "TOKEN"
          ? t("Rules tokens")
          : (catalogSets.find(([id]) => id === set)?.[1] ?? set),
      clear: () => setSet("all"),
    });
  if (baseOnly)
    activeFilters.push({
      key: "base",
      label: t("Base printings only"),
      clear: () => setBaseOnly(false),
    });
  if (onlyScripted)
    activeFilters.push({
      key: "supported",
      label: t("Samo podržane za igranje"),
      clear: () => setOnlyScripted(false),
    });
  const hasFilters = Boolean(search || activeFilters.length || sort !== "name");
  const filtered = useMemo(
    () =>
      sortCatalogCards(
        catalog.filter(
          (c) =>
            (!baseOnly || !c.variant) &&
            (set === "all" ||
              (baseOnly
                ? faceSearch.get(canonicalBuilderId(c.id))?.sets.includes(set)
                : c.set === set)) &&
            matchesCardSearch(
              baseOnly
                ? faceSearch.get(canonicalBuilderId(c.id))
                : printingSearch.get(c.id),
              search,
            ) &&
            (domain === "Sve domene" || c.domains.includes(domain)) &&
            (type === "Sve vrste" || isCardType(c, type)) &&
            (!onlyScripted || supported(c)),
        ),
        sort,
      ),
    [search, domain, type, set, baseOnly, onlyScripted, sort],
  );

  return (
    <main className="library card-library" id="main-content" tabIndex={-1}>
      <header className="library-header">
        <div>
          <h1>{t("Card library")}</h1>
          <p>{t("Explore cards, rules and alternate printings.")}</p>
        </div>
        <p className="catalog-snapshot">
          {t(
            "{printings} printings · {tokens} rules tokens · Snapshot {date}",
            {
              printings: catalogMeta.count,
              tokens: catalog.length - catalogMeta.count,
              date: new Date(catalogMeta.fetchedAt).toLocaleDateString(
                locale === "sr" ? "sr-Latn" : locale,
                {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                },
              ),
            },
          )}
        </p>
      </header>

      <section
        className="library-toolbar"
        ref={toolbar}
        aria-label={t("Pretraži karte")}
      >
        <div className="search-input">
          <Search size={19} aria-hidden="true" />
          <input
            ref={searchInput}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            aria-label={t("Pretraži karte")}
            placeholder={t("Pretraži ime ili tekst karte…")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setLimit(60);
            }}
          />
          {search && (
            <button
              className="icon-button"
              aria-label={t("Clear card search")}
              onClick={clearSearch}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        <details
          ref={refinement}
          className="library-refinement"
          open={filtersOpen}
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              closeFilters();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeFilters();
            refinement.current?.querySelector("summary")?.focus();
          }}
        >
          <summary>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t("Filters")}
            {activeFilters.length > 0 && (
              <span
                className="library-filter-count"
                aria-label={t("{count} active filters", {
                  count: activeFilters.length,
                })}
              >
                {activeFilters.length}
              </span>
            )}
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <div className="library-refinement-panel" ref={refinementPanel}>
            <div className="library-refinement-grid">
              <label className="library-filter-field">
                <span>{t("Domena")}</span>
                <select
                  aria-label={t("Domena")}
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setLimit(60);
                  }}
                >
                  {[
                    "Sve domene",
                    "Fury",
                    "Calm",
                    "Mind",
                    "Body",
                    "Chaos",
                    "Order",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="library-filter-field">
                <span>{t("Vrsta karte")}</span>
                <select
                  aria-label={t("Vrsta karte")}
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setLimit(60);
                  }}
                >
                  {[
                    "Sve vrste",
                    "Unit",
                    "Spell",
                    "Gear",
                    "Legend",
                    "Battlefield",
                    "Rune",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="library-filter-field library-filter-set">
                <span>{t("Card set")}</span>
                <select
                  aria-label={t("Card set")}
                  value={set}
                  onChange={(event) => {
                    setSet(event.target.value);
                    setLimit(60);
                  }}
                >
                  <option value="all">{t("All sets")}</option>
                  {catalogSets.map(([id, name]) => (
                    <option key={id} value={id}>
                      {id === "TOKEN" ? t("Rules tokens") : name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="library-filter-options">
              <label
                className={`scripted-filter ${baseOnly ? "is-active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={baseOnly}
                  onChange={(event) => {
                    setBaseOnly(event.target.checked);
                    setLimit(60);
                  }}
                />
                {t("Base printings only")}
              </label>
              <label
                className={`scripted-filter ${onlyScripted ? "is-active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={onlyScripted}
                  onChange={(event) => {
                    setOnlyScripted(event.target.checked);
                    setLimit(60);
                  }}
                />
                {t("Samo podržane za igranje")}
              </label>
            </div>
            <div className="library-refinement-footer">
              <button
                className="text-button"
                onClick={resetFilters}
                disabled={!hasFilters}
              >
                {t("Reset filters")}
              </button>
              <button
                className="library-apply-filters"
                onClick={() => {
                  closeFilters();
                  refinement.current?.querySelector("summary")?.focus();
                }}
              >
                {t("Show matching cards")}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </details>
        <select
          className="library-sort"
          aria-label={t("Sort cards")}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as CatalogSort);
            setLimit(60);
          }}
        >
          <option value="name">{t("Name · A–Z")}</option>
          <option value="energy-asc">{t("Energy · low to high")}</option>
          <option value="energy-desc">{t("Energy · high to low")}</option>
          <option value="might-desc">{t("Might · high to low")}</option>
        </select>
      </section>

      <div className="library-results">
        <p
          className="catalog-count"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {t("{shown} of {count} matching entries", {
            shown: Math.min(limit, filtered.length),
            count: filtered.length,
          })}
        </p>
        {hasFilters && (
          <button
            className="text-button library-reset-all"
            onClick={resetFilters}
          >
            {t("Reset filters")}
          </button>
        )}
      </div>
      {activeFilters.length > 0 && (
        <div
          className="library-active-filters"
          ref={filterChips}
          aria-label={t("Filters")}
        >
          {activeFilters.map((filter, index) => (
            <button
              key={filter.key}
              className="library-filter-chip"
              aria-label={t("Remove filter: {filter}", {
                filter: filter.label,
              })}
              onClick={() => {
                pendingFocus.current = index;
                filter.clear();
                setLimit(60);
              }}
            >
              <span>{filter.label}</span>
              <X size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      <div className="catalog-grid">
        {filtered.slice(0, limit).map((card) => (
          <div className="catalog-entry" key={card.id}>
            <Card card={card} onClick={() => inspect(card)} />
            <div className="catalog-card-name">
              <strong title={card.name}>{card.name}</strong>
              <span className="catalog-card-type">
                {t(card.type)}
                {card.domains.length
                  ? ` · ${card.domains.map((value) => t(value)).join(" / ")}`
                  : ""}
              </span>
              <small className="catalog-printing-id">
                {card.set} · {card.collectorNumber}
              </small>
              <span
                className={supported(card) ? "scripted-badge" : "catalog-badge"}
              >
                {supported(card) && <Check size={12} aria-hidden="true" />}
                {supported(card)
                  ? t("● Podržana").replace(/^●\s*/, "")
                  : card.set}
              </span>
            </div>
          </div>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-search">
          <Search size={28} aria-hidden="true" />
          <h2>
            {search.trim()
              ? t("No cards match “{query}”.", { query: search.trim() })
              : t("Nema pronađenih karata")}
          </h2>
          <p>{t("Try a shorter search or remove a filter.")}</p>
          <div className="library-empty-actions">
            {search && (
              <button className="outline-button" onClick={clearSearch}>
                {t("Clear card search")}
              </button>
            )}
            <button className="outline-button" onClick={resetFilters}>
              {t("Reset filters")}
            </button>
          </div>
        </div>
      )}
      {filtered.length > limit && (
        <button
          className="outline-button load-more"
          onClick={() => setLimit((value) => value + 60)}
        >
          {t("Prikaži još karata")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      )}
    </main>
  );
}
