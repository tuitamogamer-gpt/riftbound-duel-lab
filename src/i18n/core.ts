import { appMessages } from "./app";
import { lobbyMessages } from "./lobby";
import { componentMessages } from "./components";
import { gameMessages } from "./game";

export const locales = ["en", "sr", "it"] as const;
export type Locale = (typeof locales)[number];
export type Values = Record<string, string | number>;
export const LANGUAGE_KEY = "riftbound-duel-language";
export const messages: Record<string, [string, string, string]> = {
  ...gameMessages,
  ...componentMessages,
  ...lobbyMessages,
  ...appMessages,
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
      return render(pattern.translations[localeIndex[locale]], captured);
    }
  }
  return text;
}
