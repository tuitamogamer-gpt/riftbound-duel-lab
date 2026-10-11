import type { CombatPreview } from "../game/engine";
import { useI18n } from "../i18n";

export function CombatAssignment({
  entry,
}: {
  entry: CombatPreview["units"][number];
}) {
  const { t } = useI18n();
  const lethal = entry.incoming > 0 && entry.incoming >= entry.lethalAt;
  return (
    <span
      className="unit-assignment"
      data-lethal={lethal}
      title={t(
        "Lethal assignment threshold; damage resolves after confirmation.",
      )}
    >
      <span>
        {t("Assigned {incoming} / {threshold}", {
          incoming: entry.incoming,
          threshold: entry.lethalAt,
        })}
      </span>
      {entry.prevention > 0 && (
        <small>{t("Prevents {count}", { count: entry.prevention })}</small>
      )}
      <span className="sr-only">
        {t("Lethal assignment threshold; damage resolves after confirmation.")}
      </span>
    </span>
  );
}
