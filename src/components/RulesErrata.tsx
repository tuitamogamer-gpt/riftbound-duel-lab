import { canonicalCardName } from "../data/card-identity";
import { useI18n } from "../i18n";
import "./RulesErrata.css";

const spiritforged =
  "https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-errata/";
const unleashed =
  "https://playriftbound.com/en-us/news/rules-and-releases/unleashed-errata-updates/";
const updates: Record<string, { text: string; url: string }> = {
  tideturner: {
    text: "Tideturner's swap must choose a unit you control at a different location.",
    url: "https://playriftbound.com/en-us/news/rules-and-releases/riftbound-origins-card-errata/",
  },
  deathgrip: {
    text: "Declare both friendly targets before responses. Kill the first on resolution; only a successful kill grants its Might to the other. Then draw.",
    url: spiritforged,
  },
  "tianna crownguard": {
    text: "Opponents cannot gain points while Tianna is at a battlefield. Conquer and hold triggers still happen, including the final-point replacement draw.",
    url: spiritforged,
  },
  "guards!": {
    text: "After creating the Sand Soldier, a separate triggered ability lets you pay Order Power to ready it. Players can respond to that ability.",
    url: unleashed,
  },
  "rengar trophy hunter": {
    text: "Ambush also allows Rengar to enter a battlefield occupied by enemies, even without a friendly unit there.",
    url: unleashed,
  },
};

/** Preserve source card text while making current official corrections visible. */
export function RulesErrata({ name }: { name: string }) {
  const { t } = useI18n();
  const key = canonicalCardName(name);
  if (!Object.hasOwn(updates, key)) return null;
  const update = updates[key];
  return (
    <aside className="rules-errata">
      <strong>{t("Updated rules")}</strong>
      <p>{t(update.text)}</p>
      <a href={update.url} target="_blank" rel="noreferrer">
        {t("Official errata")}
      </a>
    </aside>
  );
}
