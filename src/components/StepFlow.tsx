import { createContext, useContext } from "react";
import { ArrowRight, Check, Clock3, Crosshair } from "lucide-react";
import { getMight } from "../game/engine";
import type { GameAction, GameState, Unit } from "../game/types";
export interface StepFrame {
  state: GameState;
  label: string;
}
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
    if (
      a.points !== b.points ||
      a.energy !== b.energy ||
      runesChanged ||
      handChanged ||
      a.championAvailable !== b.championAvailable
    )
      h.players.add(p);
    if (a.points !== b.points)
      h.changes.push(`${name}: ${a.points} → ${b.points} bodova.`);
    if (runesChanged || a.energy !== b.energy)
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
  return h;
}
export function StepFlow({
  review,
  botPending,
  onProceed,
}: {
  review: Review | null;
  botPending: boolean;
  onProceed: () => void;
}) {
  if (!review && !botPending)
    return (
      <div className="step-flow idle">
        <span className="step-symbol">
          <Clock3 size={17} />
        </span>
        <div>
          <strong>TI KONTROLIŠEŠ TEMPO</strong>
          <p>Odaberi potez. Svaki naredni korak čeka tvoj Proceed.</p>
        </div>
        <span className="manual-badge">RUČNO NAPREDOVANJE</span>
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
            ? `${review.action.player === 0 ? "TVOJA AKCIJA" : "AI AKCIJA"} · KORAK ${review.index + 1} / ${review.frames.length}`
            : "AI ČEKA TVOJ PROCEED"}
        </span>
        <strong>
          {review
            ? (frame?.label ??
              "Pregled koraka nije dostupan. Nastavi do trenutnog stanja.")
            : "Protivnik je spreman za sljedeći potez."}
        </strong>
        <p>
          {review
            ? highlights.changes.length
              ? highlights.changes.slice(0, 3).join(" ")
              : "Istaknute karte i područja pokazuju izvor ili cilj akcije."
            : "Ništa se neće odigrati dok ne nastaviš."}
        </p>
      </div>
      <button
        className="gold-button proceed-button"
        onClick={onProceed}
        aria-label="Proceed"
      >
        Proceed <ArrowRight size={18} />
        <small>
          {review
            ? last
              ? "Potvrdi korak"
              : "Sljedeći efekat"
            : "Prikaži AI potez"}
        </small>
      </button>
    </div>
  );
}
