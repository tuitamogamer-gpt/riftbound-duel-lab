import { createContext, useContext } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Crosshair,
  Pause,
  Play,
} from "lucide-react";
import { getMight } from "../game/engine";
import type { StepFrame } from "../game/engine";
import type { GameAction, GameState, Unit } from "../game/types";
import "./StepFlow.css";
import { useI18n } from "../i18n";
import { getEffectView } from "../game/effect-presentation";
import { getRuneChanges, type RuneChange } from "../game/rune-presentation";
export type { StepFrame } from "../game/engine";
export interface Review {
  before: GameState;
  final: GameState;
  frames: StepFrame[];
  index: number;
  action: GameAction;
}
export interface Highlights {
  units: Set<string>;
  fields: Set<string>;
  players: Set<number>;
  newCards: Set<string>;
  removed: Unit[];
  changes: string[];
  runes: Set<string>;
  runeChanges: RuneChange[];
  runeEventKey?: string;
  legends: Set<number>;
  unitEvents: Map<string, string>;
  unitTones: Map<string, string>;
  playerEvents: Map<number, string>;
  action?: GameAction;
  game?: GameState;
}
const empty: Highlights = {
  units: new Set(),
  fields: new Set(),
  players: new Set(),
  newCards: new Set(),
  removed: [],
  changes: [],
  runes: new Set(),
  runeChanges: [],
  legends: new Set(),
  unitEvents: new Map(),
  unitTones: new Map(),
  playerEvents: new Map(),
};
export const HighlightContext = createContext<Highlights>(empty);
export const useHighlights = () => useContext(HighlightContext);
export function getHighlights(review: Review | null): Highlights {
  if (
    !review ||
    !Array.isArray(review.frames) ||
    !Number.isInteger(review.index) ||
    review.index < 0 ||
    review.index >= review.frames.length
  )
    return empty;
  const before =
    review.index > 0 ? review.frames[review.index - 1].state : review.before;
  const now = review.frames[review.index].state;
  const h: Highlights = {
    units: new Set(),
    fields: new Set(),
    players: new Set(),
    newCards: new Set(),
    removed: [],
    changes: [],
    runes: new Set(),
    runeChanges: getRuneChanges(review),
    runeEventKey: `${review.action.id}:${review.index}`,
    legends: new Set(),
    unitEvents: new Map(),
    unitTones: new Map(),
    playerEvents: new Map(),
    action: review.action,
    game: now,
  };
  let changedUnits = 0;
  for (const u of now.units) {
    const old = before.units.find((v) => v.id === u.id);
    if (
      !old ||
      JSON.stringify(old) !== JSON.stringify(u) ||
      getMight(before, old) !== getMight(now, u)
    ) {
      h.units.add(u.id);
      h.unitEvents.set(
        u.id,
        !old
          ? "Deployed"
          : old.location !== u.location
            ? "Moved"
            : old.damage < u.damage
              ? "Damage"
              : !old.ready && u.ready
                ? "Ready"
                : "Effect",
      );
      h.fields.add(u.location);
      if (old) h.fields.add(old.location);
      changedUnits++;
    }
  }
  if (changedUnits) h.changes.push(`Promijenjeno jedinica: ${changedUnits}.`);
  for (const u of before.units)
    if (!now.units.some((v) => u.id === v.id)) {
      h.removed.push(u);
      h.fields.add(u.location);
    }
  if (h.removed.length)
    h.changes.push(`Uklonjeno s table: ${h.removed.length}.`);
  for (const p of [0, 1] as const) {
    const a = before.players[p],
      b = now.players[p],
      name = p === 0 ? "Ti" : "AI";
    const handChanged = JSON.stringify(a.hand) !== JSON.stringify(b.hand);
    const runesChanged = JSON.stringify(a.runes) !== JSON.stringify(b.runes);
    for (const change of h.runeChanges)
      if (change.player === p) h.runes.add(change.rune.id);
    if (
      a.legendUsedTurn !== b.legendUsedTurn ||
      a.legendEmpowered !== b.legendEmpowered
    )
      h.legends.add(p);
    if (
      a.points !== b.points ||
      a.energy !== b.energy ||
      a.power !== b.power ||
      a.xp !== b.xp ||
      a.legendUsedTurn !== b.legendUsedTurn ||
      runesChanged ||
      handChanged ||
      a.championAvailable !== b.championAvailable
    )
      h.players.add(p);
    if (a.points !== b.points)
      h.changes.push(`${name}: ${a.points} → ${b.points} bodova.`);
    if (a.xp !== b.xp)
      h.changes.push(`${name}: ${a.xp ?? 0} → ${b.xp ?? 0} XP.`);
    if (runesChanged || a.energy !== b.energy || a.power !== b.power)
      h.changes.push(`${name}: promjena runa ili energije.`);
    if (handChanged)
      h.changes.push(
        `${name}: ${a.hand.length === b.hand.length ? "promjena karata u ruci" : `${a.hand.length} → ${b.hand.length} karata u ruci`}.`,
      );
    if (p === 0) {
      const remaining = [...a.hand];
      for (const id of b.hand) {
        const i = remaining.indexOf(id);
        if (i >= 0) remaining.splice(i, 1);
        else h.newCards.add(id);
      }
    }
  }
  for (const f of now.fields)
    if (before.fields.find((v) => v.id === f.id)?.controller !== f.controller) {
      h.fields.add(f.id);
      h.changes.push("Kontrola bojišta se promijenila.");
    }
  const markTarget = (target?: string) => {
    if (!target) return;
    for (const id of target.split(/[~,]/)) {
      if (id.startsWith("field:") || id.startsWith("base:")) {
        h.fields.add(id);
        continue;
      }
      const u =
        now.units.find((v) => v.id === id) ||
        before.units.find((v) => v.id === id);
      if (u) {
        h.units.add(id);
        h.fields.add(u.location);
      }
    }
  };
  markTarget(review.action.sourceId);
  markTarget(review.action.targetId);
  for (const id of review.action.unitIds ?? []) markTarget(id);
  if (
    review.action.sourceId === "champion" ||
    review.action.sourceId === "legend"
  )
    h.players.add(review.action.player);
  // Passing priority may resolve an item whose target is absent from the Pass action.
  for (const item of before.stack)
    if (!now.stack.some((next) => next.id === item.id)) {
      markTarget(item.targetId);
      markTarget(item.sourceId);
      if (item.locationId) h.fields.add(item.locationId);
    }
  if (review.action.locationId) h.fields.add(review.action.locationId);
  const feedback = getEffectView(review);
  for (const change of feedback?.changes ?? []) {
    const label = change.key
      .replace("{card} · ", "")
      .replace("{amount}", String(change.values?.amount ?? ""));
    if (change.unitId && !h.unitTones.has(change.unitId)) {
      h.units.add(change.unitId);
      h.unitEvents.set(change.unitId, label);
      h.unitTones.set(change.unitId, change.tone);
    }
    if (change.player !== undefined) h.playerEvents.set(change.player, label);
  }
  if (review.frames[review.index].effect) {
    markTarget(review.frames[review.index].effect?.sourceId);
    markTarget(review.frames[review.index].effect?.targetId);
  }
  return h;
}
export function StepFlow({
  review,
  botPending,
  onProceed,
  onPrevious,
  playing = false,
  onTogglePlayback,
  playbackMs = 1600,
  onSpeedChange,
}: {
  review: Review | null;
  botPending: boolean;
  onProceed: () => void;
  onPrevious?: () => void;
  playing?: boolean;
  onTogglePlayback?: () => void;
  playbackMs?: number;
  onSpeedChange?: (ms: number) => void;
}) {
  const { t } = useI18n();
  if (!review && !botPending)
    return (
      <div className="step-flow idle">
        <span className="step-symbol">
          <Clock3 size={17} />
        </span>
        <div>
          <strong>{t("TI KONTROLIŠEŠ TEMPO")}</strong>
          <p>{t("Odaberi potez. Svaki naredni korak čeka tvoj Proceed.")}</p>
        </div>
        <span className="manual-badge">{t("RUČNO NAPREDOVANJE")}</span>
      </div>
    );
  const last = !!review && review.index === review.frames.length - 1;
  const frame = review?.frames?.[review.index];
  const highlights = getHighlights(review);
  return (
    <div
      className={`step-flow ${review ? "reviewing" : "bot-pending"}`}
      role="status"
    >
      <span className="step-symbol">
        {botPending ? <Crosshair size={22} /> : <Check size={22} />}
      </span>
      <div className="step-description">
        <span className="eyebrow">
          {review
            ? `${t(review.action.player === 0 ? "TVOJA AKCIJA" : "AI AKCIJA")} · ${t("KORAK {current} / {total}", { current: review.index + 1, total: review.frames.length })}`
            : t("AI ČEKA TVOJ PROCEED")}
        </span>
        <strong>
          {review
            ? t(
                frame?.label ??
                  "Pregled koraka nije dostupan. Nastavi do trenutnog stanja.",
              )
            : t("Protivnik je spreman za sljedeći potez.")}
        </strong>
        <p>
          {review
            ? highlights.changes.length
              ? highlights.changes
                  .slice(0, 3)
                  .map((change) => t(change))
                  .join(" ")
              : t("Istaknute karte i područja pokazuju izvor ili cilj akcije.")
            : t("Ništa se neće odigrati dok ne nastaviš.")}
        </p>
      </div>
      <div className="step-controls">
        {review && onPrevious && (
          <div className="review-transport" aria-label={t("Kontrole pregleda")}>
            <button
              type="button"
              onClick={onPrevious}
              disabled={review.index === 0}
              aria-label={t("Prethodni korak")}
              title={t("Prethodni korak")}
            >
              <ArrowLeft size={16} />
            </button>
            {onTogglePlayback && (
              <button
                type="button"
                onClick={onTogglePlayback}
                disabled={last && !playing}
                aria-label={t(playing ? "Pauziraj pregled" : "Pusti pregled")}
                aria-pressed={playing}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {t(playing ? "Pauza" : "Pusti")}
              </button>
            )}
            {onSpeedChange && (
              <select
                aria-label={t("Brzina pregleda")}
                value={playbackMs}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
              >
                <option value={2600}>{t("Sporo")}</option>
                <option value={1600}>{t("Normalno")}</option>
                <option value={900}>{t("Brzo")}</option>
              </select>
            )}
          </div>
        )}
        <button
          className="gold-button proceed-button"
          onClick={onProceed}
          aria-label={t("Proceed")}
        >
          {t("Proceed")} <ArrowRight size={18} />
          <small>
            {review
              ? last
                ? t("Potvrdi korak")
                : t("Sljedeći efekat")
              : t("Prikaži AI potez")}
          </small>
        </button>
      </div>
    </div>
  );
}
