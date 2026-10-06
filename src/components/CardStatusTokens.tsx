import {
  ArrowUp,
  Ban,
  Droplet,
  Hourglass,
  Orbit,
  Shield,
  Sparkles,
  Swords,
} from "lucide-react";
import type { CardStatus } from "../game/status-presentation";
import { useI18n } from "../i18n";
import "./CardStatusTokens.css";

/** Public, current-frame effects only; readiness keeps its existing Exhausted token. */
export function CardStatusTokens({
  statuses,
  expanded = false,
}: {
  statuses: CardStatus[];
  expanded?: boolean;
}) {
  const { t } = useI18n();
  if (!statuses.length) return null;
  const shown = expanded ? statuses : statuses.slice(0, 2);
  return (
    <span className={`card-status-tokens${expanded ? " is-expanded" : ""}`}>
      {shown.map((status) => {
        const label = t(status.label, status.values);
        const detail = status.detail ? t(status.detail, status.values) : "";
        const Icon =
          status.id === "stunned"
            ? Orbit
            : status.id === "damage"
              ? Droplet
              : status.id === "temporary"
                ? Hourglass
                : status.id === "move-locked" || status.id === "untargetable"
                  ? Ban
                  : status.id === "buff" || status.id === "might"
                    ? ArrowUp
                    : status.id === "assault"
                      ? Swords
                      : /shield|prevent|ward|vulnerable/.test(status.id)
                        ? Shield
                        : Sparkles;
        return (
          <span className="card-status-entry" key={status.id}>
            <span
              className={`card-status-token tone-${status.tone}`}
              data-status-id={status.id}
              role="img"
              aria-label={detail ? `${label} · ${detail}` : label}
              title={detail ? `${label} · ${detail}` : label}
            >
              <Icon aria-hidden="true" />
              <span className="status-token-mark" aria-hidden="true">
                {status.id === "stunned" ? "STUNNED" : status.mark}
              </span>
            </span>
            {expanded && (
              <span className="status-token-copy">
                <strong>{label}</strong>
                {detail && <small>{detail}</small>}
              </span>
            )}
          </span>
        );
      })}
      {!expanded && statuses.length > shown.length && (
        <span
          className="status-token-overflow"
          aria-label={t("{count} more active effects", {
            count: statuses.length - shown.length,
          })}
        >
          +{statuses.length - shown.length}
        </span>
      )}
    </span>
  );
}

export function readCardStatuses(value?: string): CardStatus[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (status): status is CardStatus =>
        status &&
        typeof status.id === "string" &&
        typeof status.label === "string" &&
        typeof status.mark === "string" &&
        ["stun", "positive", "negative", "neutral"].includes(status.tone),
    );
  } catch {
    return [];
  }
}
