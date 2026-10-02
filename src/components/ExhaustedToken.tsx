import { useI18n } from "../i18n";
import "./ExhaustedToken.css";

/** A visible game-state marker, never a disabled/unaffordable-card indicator. */
export function ExhaustedToken({
  ready,
  compact = false,
}: {
  ready?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  if (ready !== false) return null;
  const label = t("Exhausted");
  return (
    <span
      className={`exhausted-token${compact ? " is-compact" : ""}`}
      role="img"
      aria-label={label}
      title={label}
    >
      <img
        className="exhausted-token-art"
        src="/art/tokens/exhausted-square.png"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="exhausted-token-label" aria-hidden="true">
        EXHAUSTED
      </span>
    </span>
  );
}
