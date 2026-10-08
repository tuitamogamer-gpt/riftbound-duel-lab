import { useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
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
  const [search, setSearch] = useState(""),
    [domain, setDomain] = useState("Sve domene"),
    [type, setType] = useState("Sve vrste"),
    [set, setSet] = useState("all"),
    [baseOnly, setBaseOnly] = useState(false),
    [onlyScripted, setOnlyScripted] = useState(false),
    [sort, setSort] = useState<CatalogSort>("name"),
    [limit, setLimit] = useState(60);
  const resetFilters = () => {
    setSearch("");
    setDomain("Sve domene");
    setType("Sve vrste");
    setSet("all");
    setBaseOnly(false);
    setOnlyScripted(false);
    setSort("name");
    setLimit(60);
  };
  const hasFilters = Boolean(
    search ||
    domain !== "Sve domene" ||
    type !== "Sve vrste" ||
    set !== "all" ||
    baseOnly ||
    onlyScripted ||
    sort !== "name",
  );
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
    <main className="library" id="main-content" tabIndex={-1}>
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
      <p className="catalog-snapshot">
        {t("{printings} printings · {tokens} rules tokens · Snapshot {date}", {
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
        })}
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
          {search && (
            <button
              className="icon-button"
              aria-label={t("Clear card search")}
              onClick={() => {
                setSearch("");
                setLimit(60);
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
        <select
          aria-label={t("Domena")}
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setLimit(60);
          }}
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
          aria-label={t("Card set")}
          value={set}
          onChange={(e) => {
            setSet(e.target.value);
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
        <label className="scripted-filter">
          <input
            type="checkbox"
            checked={baseOnly}
            onChange={(e) => {
              setBaseOnly(e.target.checked);
              setLimit(60);
            }}
          />
          {t("Base printings only")}
        </label>
        <select
          aria-label={t("Vrsta karte")}
          value={type}
          onChange={(e) => {
            setType(e.target.value);
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
          ].map((d) => (
            <option key={d} value={d}>
              {t(d)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("Sort cards")}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as CatalogSort);
            setLimit(60);
          }}
        >
          <option value="name">{t("Name · A–Z")}</option>
          <option value="energy-asc">{t("Energy · low to high")}</option>
          <option value="energy-desc">{t("Energy · high to low")}</option>
          <option value="might-desc">{t("Might · high to low")}</option>
        </select>
        <label className="scripted-filter">
          <input
            type="checkbox"
            checked={onlyScripted}
            onChange={(e) => {
              setOnlyScripted(e.target.checked);
              setLimit(60);
            }}
          />
          {t("Samo podržane za igranje")}{" "}
        </label>
      </div>
      <div className="catalog-count">
        {t("{shown} of {count} matching entries", {
          shown: Math.min(limit, filtered.length),
          count: filtered.length,
        })}{" "}
        <span> {t("Podaci su spremljeni lokalno uz aplikaciju")} </span>
        {hasFilters && (
          <button className="text-button" onClick={resetFilters}>
            {t("Reset filters")}
          </button>
        )}
      </div>
      <div className="catalog-grid">
        {filtered.slice(0, limit).map((c) => (
          <div key={c.id}>
            <Card card={c} onClick={() => inspect(c)} />
            <div className="catalog-card-name">
              <strong>{c.name}</strong>
              <small className="catalog-printing-id">
                {c.set} · {c.id}
              </small>
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
          <button className="outline-button" onClick={resetFilters}>
            {t("Reset filters")}
          </button>
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
