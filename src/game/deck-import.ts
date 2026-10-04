import { cards, cardsById, type Card } from "../data/cards";
import {
  canonicalCardName,
  type DeckEntry,
  type StarterDeck,
} from "../data/decks";
import { isImplemented } from "./scripts";
import { gameplayFingerprint, hasUnlimitedCopies } from "../data/card-identity";

export const IMPORTED_DECKS_KEY = "riftbound-imported-decks-v1";
const MAX_TEXT_LENGTH = 100_000;
const MAX_DECKS = 50;
type Section =
  "legend" | "champion" | "main" | "runes" | "battlefields" | "sideboard";
export interface DeckIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  line?: number;
  cardId?: string;
}
export interface DeckScriptCoverage {
  total: number;
  implemented: number;
  missing: { cardId: string; name: string }[];
  complete: boolean;
}
export interface DeckImportOptions {
  name?: string;
  championId?: string;
  format?: "standard" | "historical-precon";
}
export interface DeckImportResult {
  deck: StarterDeck | null;
  issues: DeckIssue[];
  coverage: DeckScriptCoverage | null;
  playable: boolean;
}
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\s*[-,]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const sum = (entries: DeckEntry[]) =>
  entries.reduce((n, entry) => n + entry.count, 0);
const issue = (
  code: string,
  message: string,
  extra: Partial<DeckIssue> = {},
): DeckIssue => ({ code, message, severity: "error", ...extra });
const compatible = (card: Card, domains: string[]) =>
  card.domains.every(
    (domain) => domain === "Colorless" || domains.includes(domain),
  );
const fieldIds = (deck: StarterDeck) =>
  deck.battlefieldIds?.length ? deck.battlefieldIds : [deck.battlefieldId];
const sectionType = (section: Section | null, card: Card) => {
  if (section === "legend") return card.type === "Legend";
  if (section === "champion")
    return card.type === "Unit" && card.supertype === "Champion";
  if (section === "runes") return card.type === "Rune";
  if (section === "battlefields") return card.type === "Battlefield";
  if (section === "main" || section === "sideboard")
    return ["Unit", "Gear", "Spell"].includes(card.type);
  return true;
};

/** Resolve IDs exactly and names only when they identify one gameplay card. */
function uniqueRulesFaces(matches: Card[]): Card[] {
  const unique = new Map<string, Card>();
  for (const card of matches) {
    const signature = gameplayFingerprint(card);
    const previous = unique.get(signature);
    if (
      !previous ||
      (!isImplemented(previous.id) && isImplemented(card.id)) ||
      (isImplemented(previous.id) === isImplemented(card.id) &&
        previous.variant &&
        !card.variant)
    )
      unique.set(signature, card);
  }
  return [...unique.values()];
}
export function resolveImportCard(
  value: string,
  section: Section | null = null,
): Card[] {
  const lower = value.trim().toLowerCase().replace(/\//g, "-");
  const exact = cardsById[lower];
  if (exact) return [exact];
  const sameId = cards.filter((card) => card.riftboundId === lower);
  if (sameId.length) return uniqueRulesFaces(sameId);
  if (/^[a-z]{3,5}-(?:r|sp)?\d{1,4}[a-z*]?$/.test(lower)) {
    const [set, number] = lower.split("-");
    return uniqueRulesFaces(
      cards.filter(
        (card) =>
          card.set.toLowerCase() === set &&
          card.id.split("-")[1] === number.replace(/s$/, "*"),
      ),
    );
  }
  const annotated = value.match(
    /^(.+?)\s+[[(]([a-z]{3,5}-(?:r|sp)?\d{1,4}[a-z*]?(?:-[\w-]+)?)[\])]$/i,
  );
  if (annotated)
    return resolveImportCard(annotated[2], section).filter(
      (card) =>
        canonicalCardName(card.name) === canonicalCardName(annotated[1]),
    );
  const setSuffix = value.match(/^(.+?)\s+\(([a-z]{3,5})\)\s+(\d{1,4})$/i);
  if (setSuffix)
    return uniqueRulesFaces(
      cards.filter(
        (card) =>
          !card.variant &&
          card.set.toLowerCase() === setSuffix[2].toLowerCase() &&
          card.collectorNumber === Number(setSuffix[3]) &&
          normalize(card.name) === normalize(setSuffix[1]),
      ),
    );
  const name = normalize(value);
  let matches = cards.filter((card) => normalize(card.name) === name);
  if (!matches.length)
    matches = cards.filter(
      (card) => canonicalCardName(card.name) === canonicalCardName(value),
    );
  if (!matches.length && section === "runes")
    matches = cards.filter((card) => normalize(card.name) === `${name} rune`);
  if (!matches.length)
    matches = cards.filter(
      (card) => normalize(card.name.replace(/\s*\(Starter\)$/i, "")) === name,
    );
  if (!matches.length && (section === "legend" || section === "champion")) {
    matches = cards.filter(
      (card) => normalize(card.name.split(" - ")[0]) === name,
    );
  }
  // A section can disambiguate a Legend and Champion Unit with the same name.
  const typed = matches.filter((card) => sectionType(section, card));
  if (typed.length) matches = typed;
  const canonical = matches.filter((card) => !card.variant);
  return uniqueRulesFaces(canonical.length ? canonical : matches);
}
function sectionHeader(line: string): Section | null {
  const header = normalize(
    line
      .replace(/^#{1,6}\s*/, "")
      .replace(/^\[|\]$/g, "")
      .replace(/\s*\(\d+\)\s*:?$/, "")
      .replace(/:\s*$/, ""),
  );
  const aliases: Record<string, Section> = {
    legend: "legend",
    legends: "legend",
    legenda: "legend",
    champion: "champion",
    "chosen champion": "champion",
    "champion legend": "legend",
    "champion unit": "champion",
    šampion: "champion",
    main: "main",
    "main deck": "main",
    deck: "main",
    "glavni špil": "main",
    units: "main",
    spells: "main",
    gear: "main",
    rune: "runes",
    runes: "runes",
    "rune deck": "runes",
    "rune pool": "runes",
    runešpil: "runes",
    battlefield: "battlefields",
    battlefields: "battlefields",
    bojišta: "battlefields",
    bojište: "battlefields",
    sideboard: "sideboard",
    "side board": "sideboard",
  };
  return aliases[header] ?? null;
}
function aggregate(entries: DeckEntry[]): DeckEntry[] {
  const counts = new Map<string, number>();
  for (const entry of entries)
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  return [...counts].map(([cardId, count]) => ({ cardId, count }));
}
function stableId(
  deck: Pick<
    StarterDeck,
    | "legendId"
    | "championId"
    | "main"
    | "runes"
    | "battlefieldId"
    | "battlefieldIds"
    | "format"
    | "sideboard"
  >,
) {
  const content = JSON.stringify([
    deck.legendId,
    deck.championId,
    deck.battlefieldId,
    deck.battlefieldIds,
    deck.format ?? "standard",
    [...deck.main].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    [...deck.runes].sort((a, b) => a.cardId.localeCompare(b.cardId)),
    ...(deck.sideboard?.length
      ? [[...deck.sideboard].sort((a, b) => a.cardId.localeCompare(b.cardId))]
      : []),
  ]);
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++)
    hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
  return `import-${(hash >>> 0).toString(36)}`;
}

/** Structural legality is intentionally independent from effect-script coverage. */
export function validateImportedDeck(deck: StarterDeck): DeckIssue[] {
  const issues: DeckIssue[] = [];
  const legend = cardsById[deck.legendId],
    champion = cardsById[deck.championId];
  const entries = [...deck.main, ...deck.runes, ...(deck.sideboard ?? [])];
  const allIds = [
    deck.legendId,
    deck.championId,
    ...fieldIds(deck),
    ...entries.map((entry) => entry.cardId),
  ];
  for (const cardId of new Set(allIds)) {
    const card = cardsById[cardId];
    if (!card)
      issues.push(
        issue("unknown-card", `Nepoznat ID karte: ${cardId}`, { cardId }),
      );
    else if (card.bannedInDuel)
      issues.push(
        issue(
          "banned-card",
          `Karta je zabranjena u standardnom Duelu: ${card.name}`,
          {
            cardId,
            severity: deck.format === "historical-precon" ? "warning" : "error",
          },
        ),
      );
  }
  for (const entry of entries)
    if (
      !Number.isSafeInteger(entry.count) ||
      entry.count <= 0 ||
      entry.count > 40
    )
      issues.push(
        issue(
          "invalid-quantity",
          `Nevažeća količina za ${cardsById[entry.cardId]?.name ?? entry.cardId}: ${entry.count}`,
          { cardId: entry.cardId },
        ),
      );
  if (sum(deck.main) !== 39)
    issues.push(
      issue(
        "main-count",
        `Glavni špil mora imati 39 karata uz 1 odabranog championa; trenutno ${sum(deck.main)}.`,
      ),
    );
  if (sum(deck.runes) !== 12)
    issues.push(
      issue(
        "rune-count",
        `Rune deck mora imati 12 runa; trenutno ${sum(deck.runes)}.`,
      ),
    );
  if (sum(deck.sideboard ?? []) > 10)
    issues.push(
      issue("sideboard-count", "Sideboard može imati najviše 10 karata."),
    );
  if (legend?.type !== "Legend")
    issues.push(issue("legend-type", "Potrebna je tačno jedna Legend karta."));
  if (champion?.type !== "Unit" || champion.supertype !== "Champion")
    issues.push(
      issue("champion-type", "Odabrani champion mora biti Champion Unit."),
    );
  if (
    legend &&
    champion &&
    (!legend.tags.length ||
      !legend.tags.some((tag) => champion.tags.includes(tag)))
  )
    issues.push(
      issue(
        "champion-identity",
        "Odabrani champion mora dijeliti champion tag s legendom.",
      ),
    );
  if (legend && champion && !compatible(champion, legend.domains))
    issues.push(
      issue(
        "champion-domain",
        "Domene odabranog championa ne odgovaraju legendi.",
      ),
    );
  if (
    legend &&
    (deck.domains.length !== legend.domains.length ||
      !deck.domains.every((domain) => legend.domains.includes(domain)))
  )
    issues.push(
      issue("deck-domains", "Domene špila moraju odgovarati legendi."),
    );
  const fields = fieldIds(deck);
  if (![1, 3].includes(fields.length))
    issues.push(
      issue(
        "battlefield-count",
        "Navedi 1 bojište za ovaj Duel ili komplet od 3 različita bojišta.",
      ),
    );
  if (!fields.includes(deck.battlefieldId))
    issues.push(
      issue("selected-battlefield", "Odabrano bojište mora pripadati špilu."),
    );
  if (new Set(fields).size !== fields.length)
    issues.push(
      issue("duplicate-battlefield", "Bojišta moraju biti različita."),
    );
  const battlefieldNames = fields
    .map((id) => cardsById[id]?.name)
    .filter(Boolean);
  if (
    new Set(battlefieldNames).size !== battlefieldNames.length &&
    new Set(fields).size === fields.length
  )
    issues.push(
      issue(
        "duplicate-battlefield",
        "Različita izdanja istog bojišta nisu različita bojišta.",
      ),
    );
  for (const id of fields) {
    const card = cardsById[id];
    if (card && card.type !== "Battlefield")
      issues.push(
        issue("battlefield-type", `Karta nije Battlefield: ${card.name}`, {
          cardId: id,
        }),
      );
    if (card && legend && !compatible(card, legend.domains))
      issues.push(
        issue("domain", `Domene ne odgovaraju legendi: ${card.name}`, {
          cardId: id,
        }),
      );
  }
  const copies = new Map<string, number>(
    champion ? [[canonicalCardName(champion.name), 1]] : [],
  );
  const unlimited = new Set<string>();
  for (const entry of [...deck.main, ...(deck.sideboard ?? [])]) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    if (
      !["Unit", "Spell", "Gear"].includes(card.type) ||
      card.supertype === "Token"
    )
      issues.push(
        issue("main-type", `Karta ne pripada glavnom špilu: ${card.name}`, {
          cardId: card.id,
        }),
      );
    if (legend && !compatible(card, legend.domains))
      issues.push(
        issue("domain", `Domene ne odgovaraju legendi: ${card.name}`, {
          cardId: card.id,
        }),
      );
    copies.set(
      canonicalCardName(card.name),
      (copies.get(canonicalCardName(card.name)) ?? 0) + entry.count,
    );
    if (hasUnlimitedCopies(card)) unlimited.add(canonicalCardName(card.name));
  }
  for (const [name, count] of copies)
    if (count > 3 && !unlimited.has(name))
      issues.push(
        issue(
          "copy-limit",
          `Najviše 3 kopije iste karte, uključujući odabranog championa: ${name} (${count}).`,
        ),
      );
  let signatures = 0;
  for (const entry of [
    { cardId: deck.championId, count: 1 },
    ...deck.main,
    ...(deck.sideboard ?? []),
  ]) {
    const card = cardsById[entry.cardId];
    if (!card) continue;
    if (
      (card.keywords.includes("Unique") || /\[Unique\]/i.test(card.text)) &&
      (copies.get(canonicalCardName(card.name)) ?? 0) > 1
    )
      issues.push(
        issue(
          "unique-limit",
          `Dozvoljena je samo 1 Unique karta: ${card.name}`,
          { cardId: card.id },
        ),
      );
    if (card.supertype === "Signature") {
      signatures += entry.count;
      if (legend && !card.tags.some((tag) => legend.tags.includes(tag)))
        issues.push(
          issue(
            "signature-identity",
            `Signature karta ne odgovara legendi: ${card.name}`,
            { cardId: card.id },
          ),
        );
    }
  }
  if (signatures > 3)
    issues.push(
      issue(
        "signature-limit",
        "Špil može sadržati najviše 3 Signature karte ukupno.",
      ),
    );
  for (const entry of deck.runes) {
    const card = cardsById[entry.cardId];
    if (
      card &&
      (card.type !== "Rune" || !legend || !compatible(card, legend.domains))
    )
      issues.push(
        issue("invalid-rune", `Nevažeća runa za ovu legendu: ${card.name}`, {
          cardId: entry.cardId,
        }),
      );
  }
  return issues;
}

export function getDeckScriptCoverage(deck: StarterDeck): DeckScriptCoverage {
  // Basic runes use the engine resource rules, not per-card effect scripts.
  const ids = [
    ...new Set([
      deck.legendId,
      deck.championId,
      ...fieldIds(deck),
      ...deck.main.map((entry) => entry.cardId),
    ]),
  ];
  const missing = ids
    .filter((id) => !isImplemented(id))
    .map((cardId) => ({ cardId, name: cardsById[cardId]?.name ?? cardId }));
  return {
    total: ids.length,
    implemented: ids.length - missing.length,
    missing,
    complete: missing.length === 0,
  };
}

export function parseDeckText(
  text: string,
  options: DeckImportOptions = {},
): DeckImportResult {
  const issues: DeckIssue[] = [];
  const sections: Record<Section, DeckEntry[]> = {
    legend: [],
    champion: [],
    main: [],
    runes: [],
    battlefields: [],
    sideboard: [],
  };
  let section: Section | null = null;
  let name = options.name?.trim() || "";
  let format = options.format ?? "standard";
  if (text.length > MAX_TEXT_LENGTH)
    return {
      deck: null,
      issues: [
        issue("text-size", "Lista je prevelika (najviše 100.000 znakova)."),
      ],
      coverage: null,
      playable: false,
    };
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const raw = lines[index].trim();
    if (!raw) continue;
    const header = sectionHeader(raw);
    if (header) {
      section = header;
      continue;
    }
    if (/^(#|\/\/)/.test(raw)) continue;
    const metadata = raw.match(/^(name|deck name|naziv|format)\s*:\s*(.+)$/i);
    if (metadata) {
      if (metadata[1].toLowerCase() === "format") {
        const requested = metadata[2].trim().toLowerCase();
        if (requested === "standard" || requested === "historical-precon")
          format = requested;
        else
          issues.push(
            issue("unknown-format", `Nepoznat format: ${metadata[2]}`, {
              line: lineNumber,
            }),
          );
      } else if (!options.name) name = metadata[2].trim();
      continue;
    }
    const inline = raw.match(
      /^(legend|champion legend|champion|chosen champion|battlefield)\s*:\s*(.+)$/i,
    );
    const activeSection = inline ? sectionHeader(inline[1]) : section;
    let value = (inline ? inline[2] : raw)
      .replace(/\s+(?:#|\/\/).*$/, "")
      .trim();
    let count = 1;
    const prefix =
      value.match(/^([+-]?\d+(?:\.\d+)?)\s*[x×]?\s+(.+)$/i) ??
      value.match(/^([+-]?\d+(?:\.\d+)?)[x×](.+)$/i);
    const suffix = !prefix && value.match(/^(.+?)\s+[x×](\d+)$/i);
    if (prefix) {
      count = Number(prefix[1]);
      value = prefix[2].trim();
    } else if (suffix) {
      count = Number(suffix[2]);
      value = suffix[1].trim();
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 40) {
      issues.push(
        issue(
          "invalid-quantity",
          "Količina mora biti cijeli broj od 1 do 40.",
          { line: lineNumber },
        ),
      );
      continue;
    }
    const matches = resolveImportCard(value, activeSection);
    if (matches.length !== 1) {
      issues.push(
        issue(
          matches.length ? "ambiguous-card" : "unknown-card",
          matches.length
            ? `Više karata odgovara nazivu „${value}”. Koristi ID: ${matches
                .slice(0, 6)
                .map((card) => `${card.id} (${card.name})`)
                .join(", ")}.`
            : `Nepoznata karta: ${value}`,
          { line: lineNumber },
        ),
      );
      continue;
    }
    const card = matches[0];
    const destination =
      activeSection ??
      (card.type === "Legend"
        ? "legend"
        : card.type === "Battlefield"
          ? "battlefields"
          : card.type === "Rune"
            ? "runes"
            : "main");
    if (!sectionType(destination, card))
      issues.push(
        issue(
          "section-type",
          `Karta ${card.name} ne pripada sekciji ${destination}.`,
          { line: lineNumber, cardId: card.id },
        ),
      );
    sections[destination].push({ cardId: card.id, count });
  }
  for (const key of Object.keys(sections) as Section[])
    sections[key] = aggregate(sections[key]);
  if (!sections.champion.length && options.championId)
    sections.champion = [{ cardId: options.championId, count: 1 }];
  if (sum(sections.legend) !== 1)
    issues.push(
      issue("legend-count", "Navedi tačno jednu kartu u sekciji Legend."),
    );
  if (sum(sections.champion) !== 1)
    issues.push(
      issue(
        "champion-count",
        "Navedi tačno jednog odabranog championa u sekciji Champion.",
      ),
    );
  if (!sections.battlefields.length)
    issues.push(
      issue("battlefield-count", "Dodaj sekciju Battlefields s bojištem."),
    );
  const legend = cardsById[sections.legend[0]?.cardId],
    champion = cardsById[sections.champion[0]?.cardId];
  if (!legend || !champion || !sections.battlefields.length)
    return { deck: null, issues, coverage: null, playable: false };
  // Some list exporters include the chosen champion among all 40 main cards.
  if (sum(sections.main) === 40) {
    const entry =
      sections.main.find((entry) => entry.cardId === champion.id) ??
      sections.main.find(
        (entry) =>
          gameplayFingerprint(cardsById[entry.cardId]) ===
          gameplayFingerprint(champion),
      );
    if (entry) {
      entry.count--;
      sections.main = sections.main.filter((entry) => entry.count > 0);
      issues.push(
        issue(
          "champion-separated",
          "Odabrani champion izdvojen je iz liste od 40 karata; u glavnom špilu ostaje 39.",
          { severity: "warning" },
        ),
      );
    }
  }
  const battlefields = sections.battlefields.flatMap((entry) =>
    Array<string>(entry.count).fill(entry.cardId),
  );
  const draft: StarterDeck = {
    id: "",
    name: name.slice(0, 120) || `${legend.tags[0] || "Moj"} · uvezeni špil`,
    champion: legend.tags[0] || champion.name.split(" - ")[0],
    title: "Uvezeni špil",
    description: "Lokalno uvezena lista karata.",
    difficulty: "Srednje",
    archetype: "Vlastita lista",
    color: "#68cbb9",
    domains: [...legend.domains],
    legendId: legend.id,
    championId: champion.id,
    battlefieldId: battlefields[0],
    battlefieldIds: battlefields,
    main: sections.main,
    runes: sections.runes,
    ...(sections.sideboard.length ? { sideboard: sections.sideboard } : {}),
    source: "Imported deck",
    format,
  };
  draft.id = stableId(draft);
  issues.push(...validateImportedDeck(draft));
  if (draft.sideboard?.length)
    issues.push(
      issue(
        "sideboard-saved",
        "Sideboard je sačuvan za izvoz; ne koristi se u pojedinačnom Duelu.",
        { severity: "warning" },
      ),
    );
  const coverage = getDeckScriptCoverage(draft);
  const valid = !issues.some((item) => item.severity === "error");
  return {
    deck: valid ? draft : null,
    issues,
    coverage,
    playable: valid && coverage.complete,
  };
}

/** Lossless IDs make export/import stable across variants and ambiguous names. */
export function exportDeckText(deck: StarterDeck): string {
  const lines = (entries: DeckEntry[]) =>
    entries
      .map(
        (entry) =>
          `${entry.count} ${entry.cardId} # ${cardsById[entry.cardId]?.name ?? entry.cardId}`,
      )
      .join("\n");
  return `Name: ${deck.name}\nFormat: ${deck.format ?? "standard"}\n\nLegend\n${lines([{ cardId: deck.legendId, count: 1 }])}\n\nChampion\n${lines([{ cardId: deck.championId, count: 1 }])}\n\nMain Deck\n${lines(deck.main)}\n\nRunes\n${lines(deck.runes)}\n\nBattlefields\n${lines(fieldIds(deck).map((cardId) => ({ cardId, count: 1 })))}\n${deck.sideboard?.length ? `\nSideboard\n${lines(deck.sideboard)}\n` : ""}`;
}

export interface DeckStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
function browserStorage(): DeckStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
/** Load only validated text exports; malformed or old payloads fail closed. */
export function loadImportedDecks(
  storage: DeckStorage | undefined = browserStorage(),
): StarterDeck[] {
  try {
    const raw = storage?.getItem(IMPORTED_DECKS_KEY);
    if (!raw || raw.length > MAX_TEXT_LENGTH * MAX_DECKS) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > MAX_DECKS) return [];
    const decks = value
      .filter(
        (text): text is string =>
          typeof text === "string" && text.length <= MAX_TEXT_LENGTH,
      )
      .map((text) => parseDeckText(text).deck)
      .filter((deck): deck is StarterDeck => deck !== null);
    return [...new Map(decks.map((deck) => [deck.id, deck])).values()];
  } catch {
    return [];
  }
}
export function saveImportedDecks(
  decks: StarterDeck[],
  storage: DeckStorage | undefined = browserStorage(),
): boolean {
  if (
    !storage ||
    decks.length > MAX_DECKS ||
    decks.some((deck) =>
      validateImportedDeck(deck).some((item) => item.severity === "error"),
    )
  )
    return false;
  try {
    storage.setItem(
      IMPORTED_DECKS_KEY,
      JSON.stringify(decks.map(exportDeckText)),
    );
    return true;
  } catch {
    return false;
  }
}
