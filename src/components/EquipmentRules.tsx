import { getCard } from "../data/cards";
import { getRulesCardId, getScript } from "../game/scripts";
import { useI18n } from "../i18n";
import "./RulesErrata.css";

/** The provider omits the attachment panel; show it alongside its original text. */
export function EquipmentRules({ cardId }: { cardId: string }) {
  const { t } = useI18n();
  const script = getScript(cardId);
  if (!script?.equipment) return null;
  return (
    <aside className="rules-errata">
      <strong>
        {t("Equipped unit")} · +{script.gearMight ?? 0} {t("Might")}
      </strong>
      <p>{t(script.equipment.text)}</p>
      <a
        href={getCard(getRulesCardId(cardId)).image}
        target="_blank"
        rel="noreferrer"
      >
        {t("Official card")}
      </a>
    </aside>
  );
}
