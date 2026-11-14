import { flowMessages } from "./flow";
import { appMessages } from "./app";
import { lobbyMessages } from "./lobby";
import { componentMessages } from "./components";
import { gameMessages } from "./game";
import { tableMessages } from "./table";
import { statusMessages } from "./status";
import { mobileMessages } from "./mobile";
import { roadmapMessages } from "./roadmap";
import { recoveryMessages } from "./recovery";
import { builderMessages } from "./builder";
import { trainingMessages } from "./training";
import { decisionMessages } from "./decisions";
import { seriesMessages } from "./series";
import { historyMessages } from "./history";
import { onlineMessages } from "./online";
import { clarityMessages } from "./clarity";
import { experienceMessages } from "./experience";
import { returningMessages } from "./returning";
import { uiUpgradeMessages } from "./ui-upgrade";
import { libraryRefinementMessages } from "./library-refinement";
import { builderRefinementMessages } from "./builder-refinement";
import { uiPolishMessages } from "./ui-polish";

export const locales = ["en", "sr", "it"] as const;
export type Locale = (typeof locales)[number];
export type Values = Record<string, string | number>;
export const LANGUAGE_KEY = "riftbound-duel-language";
export const messages: Record<string, [string, string, string]> = {
  ...gameMessages,
  ...componentMessages,
  ...lobbyMessages,
  ...appMessages,
  ...flowMessages,
  ...tableMessages,
  ...statusMessages,
  ...mobileMessages,
  ...roadmapMessages,
  ...recoveryMessages,
  ...builderMessages,
  ...trainingMessages,
  ...decisionMessages,
  ...seriesMessages,
  ...historyMessages,
  ...onlineMessages,
  ...clarityMessages,
  ...experienceMessages,
  ...returningMessages,
  ...uiUpgradeMessages,
  ...libraryRefinementMessages,
  ...builderRefinementMessages,
  ...uiPolishMessages,
};
const localeIndex = { en: 0, sr: 1, it: 2 } as const;
export const isLocale = (value: unknown): value is Locale =>
  locales.includes(value as Locale);

export function readLanguage(storage?: Pick<Storage, "getItem">): Locale {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(LANGUAGE_KEY);
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
}

const placeholder = /\{([a-zA-Z]\w*)\}/g;
const numericNames = new Set([
  "count",
  "amount",
  "turn",
  "points",
  "attack",
  "defense",
  "might",
  "total",
  "energy",
  "power",
]);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(messages)
  .filter(([key]) => /\{[a-zA-Z]\w*\}/.test(key))
  .map(([key, translations]) => {
    const names: string[] = [];
    let cursor = 0;
    let regex = "^";
    for (const match of key.matchAll(placeholder)) {
      regex +=
        escapeRegex(key.slice(cursor, match.index)) +
        (numericNames.has(match[1]) ? "([+-]?\\d+(?:\\.\\d+)?)" : "(.*?)");
      names.push(match[1]);
      cursor = match.index! + match[0].length;
    }
    regex += escapeRegex(key.slice(cursor)) + "$";
    return {
      regex: new RegExp(regex, "s"),
      names,
      translations,
      specificity: key.replace(placeholder, "").length,
    };
  })
  .sort((a, b) => b.specificity - a.specificity);

function render(template: string, values: Values): string {
  return template.replace(placeholder, (original, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : original,
  );
}

/**
 * The human player is named "You" ("Ti", "Tu"), and the engine writes its log
 * in the third person ("You plays Firestorm"). The verb is agreed at display
 * time, for the verbs the log uses; saved text keeps the engine's wording.
 */
const secondPerson: Record<
  Locale,
  { subject: string; and: string; verbs: Record<string, string> }
> = {
  en: {
    subject: "You",
    and: "and",
    verbs: {
      adds: "add",
      assigns: "assign",
      banishes: "banish",
      becomes: "become",
      channels: "channel",
      conquers: "conquer",
      controls: "control",
      draws: "draw",
      ends: "end",
      exhausts: "exhaust",
      gains: "gain",
      has: "have",
      hides: "hide",
      is: "are",
      moves: "move",
      passes: "pass",
      plays: "play",
      predicts: "predict",
      readies: "ready",
      returns: "return",
      reveals: "reveal",
      shows: "show",
      spends: "spend",
      wins: "win",
    },
  },
  sr: {
    subject: "Ti",
    and: "i",
    verbs: {
      dobija: "dobijaš",
      dodaje: "dodaješ",
      dodeljuje: "dodeljuješ",
      igra: "igraš",
      ima: "imaš",
      kontroliše: "kontrolišeš",
      osvaja: "osvajaš",
      pobeđuje: "pobeđuješ",
      premešta: "premeštaš",
      prepušta: "prepuštaš",
      skriva: "skrivaš",
      troši: "trošiš",
      završava: "završavaš",
    },
  },
  it: {
    subject: "Tu",
    and: "e",
    verbs: {
      aggiunge: "aggiungi",
      assegna: "assegni",
      conquista: "conquisti",
      consuma: "consumi",
      controlla: "controlli",
      ha: "hai",
      nasconde: "nascondi",
      ottiene: "ottieni",
      passa: "passi",
      spende: "spendi",
      sposta: "sposti",
      termina: "termini",
      vince: "vinci",
    },
  },
};
function agreeWithPlayer(text: string, locale: Locale): string {
  const { subject, and, verbs } = secondPerson[locale];
  if (!text.includes(`${subject} `)) return text;
  // One sentence at a time, only where the player is its subject.
  return text.replace(
    new RegExp(`(^|[.!?] )${subject} ([^.!?]*)`, "gu"),
    (sentence, lead: string, rest: string) => {
      const [first, ...words] = rest.split(" ");
      const mark = /[:,;]$/.exec(first)?.[0] ?? "";
      const verb = mark ? first.slice(0, -1) : first;
      if (!Object.hasOwn(verbs, verb)) return sentence;
      let tail = words
        .map((word, i) =>
          words[i - 1] === and && Object.hasOwn(verbs, word)
            ? verbs[word]
            : word,
        )
        .join(" ");
      if (locale === "en") tail = tail.replace(/\btheir\b/g, "your");
      return `${lead}${subject} ${verbs[verb]}${mark}${tail ? ` ${tail}` : ""}`;
    },
  );
}
/** Untranslated engine text stays English, so English agreement always runs. */
const agree = (text: string, locale: Locale) =>
  locale === "en"
    ? agreeWithPlayer(text, "en")
    : agreeWithPlayer(agreeWithPlayer(text, "en"), locale);

/** Translate at presentation time so saves, action IDs and card identities stay stable. */
export function translate(
  text: string | undefined | null,
  locale: Locale = "en",
  values?: Values,
  depth = 0,
): string {
  if (!text) return "";
  const exact = Object.hasOwn(messages, text) ? messages[text] : undefined;
  if (exact) return render(exact[localeIndex[locale]], values ?? {});
  if (values) return render(text, values);
  if (depth < 6) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      const captured = Object.fromEntries(
        pattern.names.map((name, i) => [
          name,
          translate(match[i + 1], locale, undefined, depth + 1),
        ]),
      );
      const rendered = render(
        pattern.translations[localeIndex[locale]],
        captured,
      );
      return depth === 0 ? agree(rendered, locale) : rendered;
    }
  }
  return depth === 0 ? agree(text, locale) : text;
}
