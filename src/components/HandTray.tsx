import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, Info, X, Zap } from "lucide-react";
import { findCard, type CatalogCard } from "../catalog";
import { readableText } from "../data/cards";
import type { GameAction, GameState } from "../game/types";
import type { PlaybackSpeed } from "../game/playback";
import { reviewDelay } from "../game/presentation";
import { useI18n } from "../i18n";
import { Card } from "./Card";
import { CardPiles, type PileView } from "./CardPiles";
import { EquipmentRules } from "./EquipmentRules";
import { RulesErrata } from "./RulesErrata";
import type { Review } from "./StepFlow";
import "./HandTray.css";

type HandTrayProps = {
  game: GameState;
  legal: GameAction[];
  selected: string | null;
  mulligan: number[];
  select: (source: string) => void;
  inspect: (card: CatalogCard) => void;
  openPile: (view: PileView) => void;
  review: Review | null;
  playbackSpeed: PlaybackSpeed;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  interactive: boolean;
};

/** Selection stays separate from committing a move in the decision bar. */
export function HandTray({
  game,
  legal,
  selected,
  mulligan,
  select,
  inspect,
  openPile,
  review,
  playbackSpeed,
  expanded,
  onExpandedChange,
  interactive,
}: HandTrayProps) {
  const { t } = useI18n();
  const titleId = useId();
  const handId = useId();
  const scroll = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const [range, setRange] = useState({
    first: 0,
    last: 0,
    previous: false,
    next: false,
  });
  const hand = game.players[0].hand;
  const opening = game.phase === "mulligan" && !game.players[0].mulliganDone;
  const draw = review?.frames[review.index]?.draw;
  const close = () => onExpandedChange(false);
  const isPlayable = (index: number) =>
    opening ||
    legal.some(
      (action) =>
        action.sourceId === `hand:${index}` ||
        action.sourceId?.startsWith(`hand:${index}:jayce:`),
    );
  const canSelect = (index: number) =>
    interactive &&
    isPlayable(index) &&
    (!opening || mulligan.includes(index) || mulligan.length < 2);

  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      const cards = [
        ...element.querySelectorAll<HTMLElement>(".hand-card-wrap"),
      ];
      const visible = cards
        .map((card, index) => ({ bounds: card.getBoundingClientRect(), index }))
        .filter(
          (card) =>
            card.bounds.right > bounds.left + 2 &&
            card.bounds.left < bounds.right - 2,
        );
      setRange({
        first: visible.length ? visible[0].index + 1 : 0,
        last: visible.length ? visible[visible.length - 1].index + 1 : 0,
        previous: element.scrollLeft > 2,
        next:
          element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
      });
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [hand.length]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
      else openButton.current?.focus();
    };
  }, [expanded]);

  const scrollHand = (direction: number) => {
    const element = scroll.current;
    if (!element) return;
    element.scrollBy({
      left: direction * Math.max(100, element.clientWidth * 0.75),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const selectFromSheet = (index: number) => {
    if (!canSelect(index)) return;
    select(`hand:${index}`);
    if (!opening) close();
  };

  return (
    <section className="hand-section hand-tray">
      <div className="hand-title">
        <span className="hand-title-name">
          {t("TVOJA RUKA")} <b>{hand.length}</b>
        </span>
        <span className="hand-desktop-hint">
          {t("Click a card · choose a move in the center")}
        </span>
        <div className="hand-mobile-tools">
          <button
            type="button"
            className="hand-scroll-button"
            aria-label={t("Previous hand cards")}
            aria-controls={handId}
            disabled={!range.previous}
            onClick={() => scrollHand(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span
            className="hand-visible-range"
            aria-label={t("Cards {first}–{last} of {count}", {
              first: range.first,
              last: range.last,
              count: hand.length,
            })}
          >
            {range.first}–{range.last}
          </span>
          <button
            type="button"
            className="hand-scroll-button"
            aria-label={t("Next hand cards")}
            aria-controls={handId}
            disabled={!range.next}
            onClick={() => scrollHand(1)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            ref={openButton}
            type="button"
            className="hand-expand-button"
            onClick={() => onExpandedChange(true)}
            aria-label={t("Browse hand")}
            aria-haspopup="dialog"
            aria-expanded={expanded}
          >
            <Expand size={18} />
          </button>
        </div>
      </div>
      <div
        ref={scroll}
        id={handId}
        className="hand"
        style={{ "--hand-count": Math.max(1, hand.length) } as CSSProperties}
      >
        {hand.map((id, index) => {
          const card = findCard(id);
          if (!card) return null;
          const replacing = opening && mulligan.includes(index);
          return (
            <div
              key={`${id}-${index}`}
              className={`hand-card-wrap ${draw?.player === 0 && index >= hand.length - draw.count ? "hand-draw-arrival" : ""}`}
              style={
                review
                  ? ({
                      "--draw-duration": `${reviewDelay(review, playbackSpeed)}ms`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <Card
                card={card}
                selected={selected === `hand:${index}` || replacing}
                onClick={() => interactive && select(`hand:${index}`)}
                playable={interactive && isPlayable(index)}
                disabled={!canSelect(index)}
              />
              <div className="hand-mobile-cost" aria-hidden="true">
                {card.energy !== null && (
                  <span>
                    <Zap size={11} />
                    {card.energy}
                  </span>
                )}
                {card.power !== null && (
                  <span className="hand-power">◈ {card.power}</span>
                )}
              </div>
              <div className="hand-mobile-name" aria-hidden="true">
                {replacing && (
                  <span className="hand-replace-badge">{t("Replace")}</span>
                )}
                <strong>{card.name}</strong>
              </div>
              <button
                type="button"
                className="card-info-button"
                aria-label={t("Detalji {card}", { card: card.name })}
                onClick={() => inspect(card)}
              >
                <Info size={17} />
              </button>
            </div>
          );
        })}
      </div>
      <CardPiles game={game} open={openPile} />
      {expanded &&
        createPortal(
          <div className="hand-sheet-backdrop" onClick={close}>
            <section
              ref={dialog}
              className="hand-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                // Inspecting a card opens a separate dialog above this sheet.
                // Let its Escape handler and focus order take precedence even
                // when the inspecting button still holds keyboard focus.
                const detailAbove = [
                  ...document.querySelectorAll<HTMLElement>(
                    ".modal-backdrop [role='dialog']",
                  ),
                ].some((element) => element.getClientRects().length > 0);
                if (detailAbove) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
                if (event.key !== "Tab") return;
                const elements = [
                  ...(dialog.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), a[href], [tabindex='0']",
                  ) ?? []),
                ];
                const first = elements[0];
                const last = elements.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }}
            >
              <header className="hand-sheet-header">
                <div>
                  <h2 id={titleId}>
                    {t("Your hand")} <span>{hand.length}</span>
                  </h2>
                  <p>
                    {opening
                      ? t(
                          "Choose up to 2 cards to replace, then return to confirm.",
                        )
                      : t(
                          "Read a card, select it, then choose a move on the table.",
                        )}
                  </p>
                </div>
                <button
                  type="button"
                  className="hand-sheet-close"
                  aria-label={t("Zatvori")}
                  onClick={close}
                >
                  <X size={22} />
                </button>
              </header>
              <div className="hand-sheet-cards">
                {!hand.length && (
                  <p className="hand-sheet-empty">{t("Your hand is empty.")}</p>
                )}
                {hand.map((id, index) => {
                  const card = findCard(id);
                  if (!card) return null;
                  const replacing = opening && mulligan.includes(index);
                  const isSelected = selected === `hand:${index}` || replacing;
                  return (
                    <article
                      key={`${id}-${index}`}
                      className={`hand-sheet-card ${isSelected ? "is-selected" : ""}`}
                    >
                      <div className="hand-sheet-art">
                        <Card
                          card={card}
                          preview={false}
                          onClick={() => inspect(card)}
                          selected={isSelected}
                        />
                      </div>
                      <div className="hand-sheet-card-body">
                        <h3>{card.name}</h3>
                        <div className="hand-sheet-stats">
                          <span>{t(card.type)}</span>
                          {card.energy !== null && (
                            <span>
                              <Zap size={13} />
                              {card.energy} {t("ENERGY")}
                            </span>
                          )}
                          {card.power !== null && (
                            <span>
                              ◈ {card.power} {t("power")}
                            </span>
                          )}
                          {card.might !== null && (
                            <span>
                              {card.might} {t("MIGHT")}
                            </span>
                          )}
                        </div>
                        <p className="hand-sheet-rules">
                          {readableText(card.text) ||
                            t("Ova karta nema dodatni tekst efekta.")}
                        </p>
                        <RulesErrata name={card.name} />
                        <EquipmentRules cardId={card.id} />
                        <div className="hand-sheet-actions">
                          <button
                            type="button"
                            className="hand-sheet-select"
                            disabled={!canSelect(index)}
                            aria-pressed={isSelected}
                            onClick={() => selectFromSheet(index)}
                          >
                            {t(
                              opening
                                ? replacing
                                  ? "Keep this card"
                                  : "Replace this card"
                                : "Select card",
                            )}
                          </button>
                          <button
                            type="button"
                            className="hand-sheet-inspect"
                            onClick={() => inspect(card)}
                            aria-label={t("Detalji {card}", {
                              card: card.name,
                            })}
                          >
                            <Info size={17} />
                            {t("Details")}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              <footer className="hand-sheet-footer">
                <span>
                  {opening
                    ? t("{count}/2 cards selected", { count: mulligan.length })
                    : t("Selecting a card does not play it.")}
                </span>
                <button type="button" onClick={close}>
                  {t("Back to table")}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </section>
  );
}
