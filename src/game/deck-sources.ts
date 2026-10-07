import { isCardType } from "../data/cards";
import { getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import { cardsById, type Card } from "../data/cards";
import { gameplayFingerprint } from "../data/card-identity";
import {
  parseDeckText,
  resolveImportCard,
  type DeckImportOptions,
  type DeckImportResult,
} from "./deck-import";

export interface DeckSourceResult extends DeckImportResult {
  sourceFormat: "text" | "piltover-code";
  normalizedText: string;
  championCandidates: Card[];
}

// The upstream decoder tolerates trailing bytes and some malformed flags.
// Check the complete envelope and bound every loop before decoding pasted data.
function checkEnvelope(code: string) {
  const bytes: number[] = [];
  let buffer = 0,
    bits = 0;
  for (const char of code.toUpperCase()) {
    buffer = (buffer << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  if (bits >= 5 || (buffer & ((1 << bits) - 1)) !== 0)
    throw new Error("Invalid padding");
  let cursor = 0;
  const byte = () => {
    if (cursor >= bytes.length) throw new Error("Truncated code");
    return bytes[cursor++];
  };
  const integer = (limit = 4096): number => {
    let value = 0;
    for (let shift = 0; shift <= 21; shift += 7) {
      const b = byte();
      value += (b & 127) * 2 ** shift;
      if (value > limit) throw new Error("Invalid count");
      if (!(b & 128)) return value;
    }
    throw new Error("Invalid integer");
  };
  const header = byte(),
    version = header & 15;
  if (header >> 4 !== 1 || version < 1 || version > 6)
    throw new Error("Unsupported version");
  const flagged = version >= 5 ? byte() : Number(version === 4);
  if (flagged > 1) throw new Error("Invalid flag");
  const number = () => {
    if (flagged && byte() > (version >= 5 ? 2 : 1))
      throw new Error("Invalid prefix");
    integer();
  };
  const ref = () => {
    byte();
    byte();
    number();
  };
  const section = (max: number) => {
    const counts = version >= 5 ? integer(100) : max;
    for (let i = 0; i < counts; i++) {
      if (version >= 5 && integer(100) === 0) throw new Error("Zero count");
      const groups = integer(100);
      for (let g = 0; g < groups; g++) {
        const cards = integer(100);
        byte();
        byte();
        for (let c = 0; c < cards; c++) number();
      }
    }
  };
  section(12);
  if (version >= 2) section(3);
  if (version >= 3) {
    const champion = byte();
    if (champion > 1) throw new Error("Invalid champion flag");
    if (champion) ref();
  }
  if (version >= 6) {
    const legends = integer(10);
    for (let i = 0; i < legends; i++) ref();
  }
  if (cursor !== bytes.length) throw new Error("Trailing data");
}

/** Decode locally. A page URL is not a deck code and is never fetched implicitly. */
export function importDeckSource(
  input: string,
  options: DeckImportOptions = {},
): DeckSourceResult {
  const trimmed = input.trim();
  const fail = (
    code: string,
    message: string,
    format: DeckSourceResult["sourceFormat"] = "text",
  ): DeckSourceResult => ({
    deck: null,
    coverage: null,
    playable: false,
    sourceFormat: format,
    normalizedText: "",
    championCandidates: [],
    issues: [{ code, message, severity: "error" }],
  });
  if (input.length > 100_000)
    return fail("text-size", "Lista je prevelika (najviše 100.000 znakova).");
  if (/^https?:\/\//i.test(trimmed))
    return fail(
      "website-url",
      "Otvori špil na sajtu i kopiraj Export → Deck code ili Text. Sam link stranice nije lista karata.",
    );
  const candidate = trimmed
    .replace(/^(?:deck\s*code|piltover(?: archive)?(?: code)?)\s*:\s*/i, "")
    .replace(/\s/g, "");
  const isCode = /^[a-z2-7]{16,}$/i.test(candidate);
  let normalizedText = input;
  if (isCode) {
    if (candidate.length > 4096)
      return fail("deck-code-size", "Deck kod je predugačak.", "piltover-code");
    try {
      checkEnvelope(candidate);
      const decoded = getDeckFromCode(candidate, { signedSuffix: "*" });
      if (decoded.additionalLegends?.length)
        return fail(
          "additional-legends",
          "Ovaj špil zahtijeva dodatne legende koje Duel još ne podržava.",
          "piltover-code",
        );
      normalizedText = decoded.mainDeck
        .map((c) => `${c.count} ${c.cardCode}`)
        .join("\n");
      if (decoded.chosenChampion)
        normalizedText += `\nChampion\n1 ${decoded.chosenChampion}\n`;
      if (decoded.sideboard.length)
        normalizedText += `\nSideboard\n${decoded.sideboard.map((c) => `${c.count} ${c.cardCode}`).join("\n")}\n`;
    } catch {
      return fail(
        "deck-code-invalid",
        "Deck kod nije ispravan ili koristi nepodržanu verziju. Kopiraj cijeli kod ili koristi tekstualni izvoz.",
        "piltover-code",
      );
    }
  }
  // v1/v2 codes and sectionless site exports need an explicit chosen champion.
  // Offer only the actual Champion Units in the imported list, never guess.
  const result = parseDeckText(normalizedText, options);
  const candidates = new Map<string, Card>();
  if (result.issues.some((issue) => issue.code === "champion-count")) {
    let inSideboard = false;
    for (const line of normalizedText.split(/\r?\n/)) {
      const heading = line
        .trim()
        .replace(/[:\[\]]/g, "")
        .toLowerCase();
      if (/^side\s*board$/.test(heading)) {
        inSideboard = true;
        continue;
      }
      if (/^(main(?:\s*deck)?|deck|champion|chosen champion)$/.test(heading))
        inSideboard = false;
      if (inSideboard) continue;
      const value = line
        .trim()
        .replace(/^\d+\s*[x×]?\s*/i, "")
        .replace(/\s+(?:#|\/\/).*$/, "")
        .replace(/\s+[x×]\d+$/i, "");
      const matches = resolveImportCard(value);
      if (
        matches.length === 1 &&
        isCardType(matches[0], "Unit") &&
        matches[0].supertype === "Champion"
      ) {
        const card = cardsById[matches[0].id];
        candidates.set(gameplayFingerprint(card), card);
      }
    }
  }
  return {
    ...result,
    sourceFormat: isCode ? "piltover-code" : "text",
    normalizedText,
    championCandidates: [...candidates.values()],
  };
}
