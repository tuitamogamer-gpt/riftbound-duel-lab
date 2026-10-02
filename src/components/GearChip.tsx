import { Shield } from "lucide-react";
import type { CatalogCard } from "../catalog";
import { useI18n } from "../i18n";
import { ExhaustedToken } from "./ExhaustedToken";
import "./GearChip.css";

/** The gear's visible frame supplies readiness; selection stays available. */
export function GearChip({
  card,
  ready,
  onClick,
}: {
  card: CatalogCard;
  ready: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const status = t(ready ? "Ready" : "Exhausted");
  return (
    <button
      className={`gear-chip ${ready ? "is-ready" : "is-exhausted"}`}
      data-card-preview={card.id}
      data-card-ready={ready}
      aria-label={`${card.name}: ${status}`}
      title={`${card.name}: ${status}`}
      onClick={onClick}
    >
      <Shield size={13} aria-hidden="true" />
      <span>{card.name}</span>
      <ExhaustedToken ready={ready} compact />
    </button>
  );
}
