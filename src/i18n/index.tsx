import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { isLocale, LANGUAGE_KEY, readLanguage, translate } from "./core";
import type { Locale, Values } from "./core";
export * from "./core";

type LanguageContext = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string | undefined | null, values?: Values) => string;
};
const Context = createContext<LanguageContext>({
  locale: "en",
  setLocale: () => {},
  t: (text, values) => translate(text, "en", values),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(readLanguage);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    updateLocale(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* Works without storage. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "sr" ? "sr-Latn" : locale;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute(
      "content",
      translate(
        "Independent Riftbound lab for 1v1 duels, learning the rules and exploring cards.",
        locale,
      ),
    );
  }, [locale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === LANGUAGE_KEY || event.key === null)
        updateLocale(readLanguage());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const t = useCallback(
    (text: string | undefined | null, values?: Values) =>
      translate(text, locale, values),
    [locale],
  );
  return (
    <Context.Provider value={{ locale, setLocale, t }}>
      {children}
    </Context.Provider>
  );
}
export const useI18n = () => useContext(Context);

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="language-selector">
      <span className="language-label">{t("Language")}</span>
      <select
        aria-label={t("Language")}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="en" lang="en">
          ENG · English
        </option>
        <option value="sr" lang="sr-Latn">
          SRB · Srpski
        </option>
        <option value="it" lang="it">
          ITA · Italiano
        </option>
      </select>
    </label>
  );
}
