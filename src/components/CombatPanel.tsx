import {
  ArrowRight,
  Crosshair,
  Flag,
  Shield,
  Skull,
  Swords,
  Zap,
} from "lucide-react";
import { findCard, type CatalogCard } from "../catalog";
import {
  getCombatPreview,
  type CombatHit,
  type CombatPreview,
  type CombatStep,
} from "../game/engine";
import type { GameAction, GameState, PlayerId, Unit } from "../game/types";
import { Card } from "./Card";
import type { Review } from "./StepFlow";
import "./CombatPanel.css";
import { useI18n } from "../i18n";

type CombatUnit = CombatPreview["units"][number] & {
  current?: Unit;
  status: "present" | "defeated" | "recalled" | "moved" | "removed";
  hit?: CombatHit;
};

export interface CombatView {
  preview: CombatPreview;
  stage: CombatStep["stage"];
  units: CombatUnit[];
  controller: PlayerId | null | undefined;
}

/** Only the current frame and its history are visible. Never consult review.final. */
export function getCombatView(
  game: GameState,
  review: Review | null,
): CombatView | null {
  const visibleFrames =
    review?.frames.slice(0, Math.max(0, review.index + 1)) ?? [];
  const live = getCombatPreview(game);
  const step = [...visibleFrames]
    .reverse()
    .find(
      (frame) =>
        frame.combat &&
        (!live || frame.combat.preview.fieldId === live.fieldId),
    )?.combat;
  const priorStates = review
    ? [review.before, ...visibleFrames.map((frame) => frame.state)]
    : [];
  const historical =
    !live && !step
      ? [...priorStates].reverse().map(getCombatPreview).find(Boolean)
      : null;
  const resolving = step?.stage === "impact" || step?.stage === "result";
  const preview = resolving
    ? step.preview
    : (live ?? step?.preview ?? historical);
  if (!preview) return null;

  const stage: CombatStep["stage"] = resolving
    ? step.stage
    : live
      ? live.stage === "assign"
        ? "assign"
        : "start"
      : (step?.stage ?? "result");
  const roster = new Map<string, CombatPreview["units"][number]>();
  for (const state of priorStates) {
    const previous = getCombatPreview(state);
    if (previous?.fieldId === preview.fieldId)
      for (const participant of previous.units)
        roster.set(participant.unit.id, participant);
  }
  for (const participant of preview.units)
    roster.set(participant.unit.id, participant);
  const units: CombatUnit[] = [...roster.values()].map((participant) => {
    const current = game.units.find((unit) => unit.id === participant.unit.id);
    const hit = step?.hits?.find(
      (entry) => entry.unitId === participant.unit.id,
    );
    return {
      ...participant,
      current,
      hit,
      status: step?.defeatedIds?.includes(participant.unit.id)
        ? "defeated"
        : !current
          ? "removed"
          : step?.recalledIds?.includes(participant.unit.id) ||
              (current.location !== preview.fieldId &&
                current.location.startsWith("base:"))
            ? "recalled"
            : current.location !== preview.fieldId
              ? "moved"
              : "present",
    };
  });
  return {
    preview,
    stage,
    units,
    controller:
      stage === "result"
        ? step
          ? step.controller
          : game.fields.find((field) => field.id === preview.fieldId)
              ?.controller
        : undefined,
  };
}

const stages = [
  { id: "start", label: "Reakcije" },
  { id: "assign", label: "Dodjela" },
  { id: "impact", label: "Udar" },
  { id: "result", label: "Ishod" },
] as const;
const playerName = (player: PlayerId) => (player === 0 ? "TI" : "AI");

export function CombatPanel({
  game,
  review,
  legal,
  onAction,
  inspect,
}: {
  game: GameState;
  review: Review | null;
  legal: GameAction[];
  onAction: (action: GameAction) => void;
  inspect: (card: CatalogCard) => void;
}) {
  const { t } = useI18n();
  const view = getCombatView(game, review);
  if (!view) return null;
  const { preview, stage, units, controller } = view;
  const field = findCard(preview.fieldCardId);
  const stageIndex = stages.findIndex((entry) => entry.id === stage);
  const animationKey = review
    ? `${review.action.id}-${review.index}`
    : `live-${game.nextId}`;
  const animatingImpact =
    review?.frames[review.index]?.combat?.stage === "impact";
  const damageActions = !review
    ? legal.filter((action) => action.id.startsWith("damage:"))
    : [];
  const confirm = !review
    ? legal.find((action) => action.id === "damage-done")
    : undefined;
  const assigned =
    stage === "assign" || stage === "impact" || stage === "result";
  const result = stage === "result";
  const heading =
    stage === "start"
      ? "Priprema za borbu"
      : stage === "assign"
        ? "Odaberi gdje ide šteta"
        : stage === "impact"
          ? "Istovremeni udar"
          : "Pregled ishoda";
  const guidance =
    stage === "start"
      ? "Snaga se mijenja s jedinicama i efektima. Obje strane mogu reagovati prije dodjele štete."
      : stage === "assign"
        ? damageActions.length
          ? "Klikni označenu protivničku kartu za dodjelu štete. Tank ima prednost; Backline dolazi posljednji."
          : review
            ? "Pregled dodjele štete. Nastavi kroz korake iznad table."
            : confirm
              ? "Dodjela je završena. Potvrdi dodjelu da nastaviš borbu."
              : "Protivnik dodjeljuje štetu tek kada nastaviš. Obje strane udaraju istovremeno."
        : stage === "impact"
          ? "Prikazana je stvarno nanesena šteta. Obje strane udaraju prije provjere poraženih jedinica."
          : controller === undefined
            ? "Šteta je riješena. Preostali efekti mogu još promijeniti kontrolu bojišta."
            : controller === null
              ? "Bojište je ostalo bez kontrolora."
              : `${controller === 0 ? "Ti kontrolišeš" : "AI kontroliše"} bojište nakon ove borbe.`;

  return (
    <section
      className={`combat-panel combat-stage-${stage}`}
      aria-label={t("Pregled borbe")}
      data-combat-stage={stage}
    >
      <header className="combat-panel-heading">
        <div className="combat-panel-title">
          <span className="combat-emblem">
            <Swords size={21} />
          </span>
          <div>
            <span className="combat-kicker">
              {t(review ? "PREGLED BORBE" : "BORBA UŽIVO")} ·{" "}
              <button
                data-card-preview={field?.id}
                onClick={() => field && inspect(field)}
              >
                {field?.name ?? t("Bojište")}
              </button>
            </span>
            <h2>{t(heading)}</h2>
          </div>
        </div>
        <ol className="combat-stage-list" aria-label={t("Faze borbe")}>
          {stages.map((entry, index) => (
            <li
              key={entry.id}
              className={
                index === stageIndex
                  ? "current"
                  : index < stageIndex
                    ? "complete"
                    : ""
              }
              aria-current={index === stageIndex ? "step" : undefined}
            >
              <span>{index + 1}</span>
              {t(entry.label)}
            </li>
          ))}
        </ol>
      </header>
      <div className="combat-arena">
        {[preview.attacker, preview.defender].map((player, side) => {
          const team = units.filter((entry) => entry.unit.owner === player);
          const spent = preview.total[player] - preview.remaining[player];
          const defeated = team.filter(
            (entry) => entry.status === "defeated",
          ).length;
          const removed = team.filter(
            (entry) => entry.status === "removed",
          ).length;
          return (
            <div
              className={`combat-team combat-team-${side === 0 ? "attacker" : "defender"} combat-owner-${player}`}
              key={player}
            >
              <div className="combat-team-heading">
                <div>
                  <span>
                    {side === 0 ? <Swords size={14} /> : <Shield size={14} />}
                    {t(side === 0 ? "NAPADAČ" : "BRANILAC")}
                  </span>
                  <strong>{t(playerName(player))}</strong>
                </div>
                <div className="combat-total">
                  <strong>{preview.total[player]}</strong>
                  <span>{t(assigned ? "UKUPNA ŠTETA" : "TRENUTNA SNAGA")}</span>
                </div>
              </div>
              <div className="combat-assignment-status">
                {result ? (
                  <>
                    <span>
                      {t("{count} preživjelo", {
                        count: team.length - defeated - removed,
                      })}
                    </span>
                    <span>
                      {t("{count} poraženo", { count: defeated })}
                      {removed > 0
                        ? ` · ${t("{count} uklonjeno", { count: removed })}`
                        : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {assigned
                        ? t("{count} dodijeljeno", { count: spent })
                        : t("{count} jedinica", {
                            count: team.filter(
                              (entry) => entry.status === "present",
                            ).length,
                          })}
                    </span>
                    <span>
                      {assigned
                        ? t("{count} preostalo", {
                            count: preview.remaining[player],
                          })
                        : t("Ishod još nije odlučen")}
                    </span>
                  </>
                )}
              </div>
              <div className="combat-power-track" aria-hidden="true">
                <i
                  style={{
                    width: `${assigned && preview.total[player] > 0 ? Math.min(100, (spent / preview.total[player]) * 100) : 0}%`,
                  }}
                />
              </div>
              <div className="combat-roster">
                {team.map((entry) => {
                  const {
                    unit,
                    might,
                    power,
                    incoming,
                    prevention,
                    lethalAt,
                    keywords,
                    status,
                    hit,
                  } = entry;
                  const card = findCard(unit.cardId);
                  if (!card) return null;
                  const action = damageActions.find(
                    (candidate) => candidate.targetId === unit.id,
                  );
                  const damage =
                    hit && (stage === "impact" || result)
                      ? hit.damageAfter
                      : (entry.current?.damage ?? unit.damage);
                  const planned = stage === "assign" ? incoming : 0;
                  const isLethal =
                    stage === "assign" && incoming >= lethalAt && incoming > 0;
                  const actualHit =
                    animatingImpact &&
                    hit &&
                    hit.damageAfter > hit.damageBefore;
                  const statusLabel =
                    status === "defeated"
                      ? "Poražena"
                      : status === "recalled"
                        ? "Vraćena u bazu"
                        : status === "moved"
                          ? "Napustila bojište"
                          : status === "removed"
                            ? "Uklonjena s table"
                            : result
                              ? "Preživjela"
                              : isLethal
                                ? "Smrtonosna dodjela"
                                : unit.stunned
                                  ? "Omamljena · ne udara"
                                  : "";
                  return (
                    <article
                      className={`combat-unit ${action ? "combat-target" : ""} ${status !== "present" ? `combat-unit-${status}` : ""} ${isLethal ? "combat-lethal" : ""}`}
                      key={unit.id}
                      data-unit-id={unit.id}
                    >
                      <div
                        key={`${animationKey}-${unit.id}`}
                        className={`combat-unit-art ${actualHit ? "combat-unit-hit" : ""} ${animatingImpact && power > 0 ? "combat-unit-strike" : ""} ${result && status === "defeated" ? "combat-unit-fall" : ""}`}
                      >
                        <Card
                          card={card}
                          small
                          onClick={() =>
                            action ? onAction(action) : inspect(card)
                          }
                          selected={!!action}
                          might={hit?.might ?? might}
                          damage={damage}
                          ready={entry.current?.ready ?? unit.ready}
                        />
                        {stage === "impact" &&
                          hit &&
                          (hit.damageAfter > hit.damageBefore ||
                            hit.prevented > 0) && (
                            <span
                              className={`combat-hit-number ${hit.damageAfter === hit.damageBefore ? "blocked" : ""}`}
                              aria-label={t("{count} nanesene štete", {
                                count: hit.damageAfter - hit.damageBefore,
                              })}
                            >
                              {hit.damageAfter > hit.damageBefore ? (
                                `−${hit.damageAfter - hit.damageBefore}`
                              ) : (
                                <Shield size={21} />
                              )}
                            </span>
                          )}
                        {status === "defeated" && (
                          <span
                            className="combat-unit-skull"
                            aria-hidden="true"
                          >
                            <Skull size={23} />
                          </span>
                        )}
                      </div>
                      <strong className="combat-unit-name">
                        {card.name.replace(" (Starter)", "")}
                      </strong>
                      <div className="combat-unit-stats">
                        <span title={t("Might u ovoj borbi")}>
                          <Shield size={11} />
                          {hit?.might ?? might}
                          <small>{t("MIGHT")}</small>
                        </span>
                        <span title={t("Šteta koju jedinica doprinosi")}>
                          <Zap size={11} />
                          {power}
                          <small>{t("UDAR")}</small>
                        </span>
                      </div>
                      <div className="combat-health-track" aria-hidden="true">
                        <i
                          style={{
                            width: `${Math.min(100, (damage / Math.max(1, hit?.might ?? might)) * 100)}%`,
                          }}
                        />
                        <b
                          style={{
                            width: `${Math.min(100 - Math.min(100, (damage / Math.max(1, might)) * 100), (planned / Math.max(1, might)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="combat-damage-text">
                        {t("{count} štete", { count: damage })}
                        {planned > 0 && (
                          <b>
                            {" "}
                            + {t("{count} dodijeljeno", { count: planned })}
                          </b>
                        )}
                      </span>
                      {(prevention > 0 || (hit?.prevented ?? 0) > 0) && (
                        <span className="combat-prevention">
                          <Shield size={10} />
                          {(stage === "impact" || result) && hit
                            ? t("{count} spriječeno", { count: hit.prevented })
                            : t("{count} zaštite", { count: prevention })}
                        </span>
                      )}
                      {keywords.some(
                        (keyword) =>
                          keyword === "Tank" || keyword === "Backline",
                      ) && (
                        <span className="combat-keywords">
                          {keywords
                            .filter(
                              (keyword) =>
                                keyword === "Tank" || keyword === "Backline",
                            )
                            .map((keyword) => t(keyword))
                            .join(" · ")}
                        </span>
                      )}
                      {statusLabel && (
                        <span className={`combat-unit-state ${status}`}>
                          {status === "recalled" && <ArrowRight size={10} />}
                          {t(statusLabel)}
                        </span>
                      )}
                      {action && (
                        <button
                          className="combat-assign-button"
                          onClick={() => onAction(action)}
                          aria-label={t("Dodijeli {count} štete: {name}", {
                            count: action.amount ?? 0,
                            name: card.name,
                          })}
                        >
                          <Crosshair size={12} />
                          {t("Dodijeli {count}", { count: action.amount ?? 0 })}
                        </button>
                      )}
                    </article>
                  );
                })}
                {!team.length && (
                  <div className="combat-empty-team">
                    <Shield size={25} />
                    <span>{t("Nema jedinica na ovoj strani.")}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div
          key={animationKey}
          className={`combat-clash ${animatingImpact ? "combat-clash-active" : ""}`}
          aria-hidden="true"
        >
          <Swords size={22} />
        </div>
      </div>
      <footer className="combat-panel-footer">
        <span>
          {result ? <Flag size={15} /> : <Crosshair size={15} />}
          {t(guidance)}
        </span>
        {confirm && (
          <button className="combat-confirm" onClick={() => onAction(confirm)}>
            {t("Potvrdi dodjelu")} <ArrowRight size={14} />
          </button>
        )}
      </footer>
    </section>
  );
}
