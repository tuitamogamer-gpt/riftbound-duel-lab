import { Swords } from "lucide-react";
import { getMight } from "../game/engine";
import type { GameState } from "../game/types";
import { useI18n } from "../i18n";

/** Read the displayed frame so totals also follow paused effect playback. */
export function BattlefieldMight({
  game,
  fieldId,
}: {
  game: GameState;
  fieldId: string;
}) {
  const { t } = useI18n();
  const totals = [0, 0];
  for (const unit of game.units) {
    if (unit.location === fieldId) totals[unit.owner] += getMight(game, unit);
  }
  return (
    <div
      className="battlefield-might"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={t("Battlefield Might")}
    >
      {([1, 0] as const).map((player) => (
        <div
          key={player}
          className={`field-might-side player-${player}`}
          data-might-player={player}
          data-might-total={totals[player]}
          aria-label={t("{player}: {total} total Might", {
            player: t(player === 0 ? "Ti" : "AI"),
            total: totals[player],
          })}
          title={t(
            "Total current Might of this side’s units, including bonuses.",
          )}
        >
          <small>{t(player === 0 ? "Ti" : "AI")}</small>
          <b key={totals[player]}>{totals[player]}</b>
        </div>
      ))}
      <div className="field-might-label" aria-hidden="true">
        <Swords size={12} />
        <small>{t("Might")}</small>
      </div>
    </div>
  );
}
