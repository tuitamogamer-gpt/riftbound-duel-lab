import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Shield, Zap } from "lucide-react";
import { domainColors, findCard } from "../catalog";
import type { CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import { readableText } from "../data/cards";
import "./CardPreview.css";
import { useI18n } from "../i18n";
import { CardStatusTokens, readCardStatuses } from "./CardStatusTokens";
import { ExhaustedToken } from "./ExhaustedToken";
import { RulesErrata } from "./RulesErrata";
import { EquipmentRules } from "./EquipmentRules";

type Preview = { card: CatalogCard; anchor: HTMLElement };
const triggerSelector = "[data-card-preview]";
const CardPreviewActive = createContext(false);
export const useCardPreviewActive = () => useContext(CardPreviewActive);

function isAvailable(anchor: HTMLElement) {
  if (!anchor.isConnected || !anchor.getClientRects().length) return false;
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".modal-backdrop, [aria-modal='true'], .result-banner",
    ),
  ).filter((dialog) => dialog.getClientRects().length);
  const topDialog = dialogs.at(-1);
  return !topDialog || topDialog.contains(anchor);
}

/** Only explicitly marked, visible cards can open a preview. Hidden hands never opt in. */
export function CardPreviewProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const active = useRef<Preview | null>(null);
  const tooltipId = useId();

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let touched = false;
    let suppressed: HTMLElement | null = null;
    let hovered: HTMLElement | null = null;
    const trigger = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>(triggerSelector)
        : null;
    const inPreview = (target: EventTarget | null) =>
      target instanceof Element && Boolean(target.closest(".card-preview"));
    const cancelTimers = () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
    const close = () => {
      cancelTimers();
      active.current = null;
      setPreview(null);
    };
    const open = (anchor: HTMLElement, immediate: boolean) => {
      cancelTimers();
      if (suppressed === anchor) return;
      const show = () => {
        if (!isAvailable(anchor)) return;
        const card = findCard(anchor.dataset.cardPreview);
        if (!card) return;
        active.current = { card, anchor };
        setPreview(active.current);
      };
      if (immediate) show();
      else showTimer = setTimeout(show, 160);
    };
    const scheduleClose = () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(close, 150);
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      touched = false;
      if (inPreview(event.target)) {
        clearTimeout(hideTimer);
        return;
      }
      const anchor = trigger(event.target);
      if (!anchor || anchor === trigger(event.relatedTarget)) return;
      hovered = anchor;
      suppressed = null;
      open(anchor, false);
    };
    const onPointerOut = (event: PointerEvent) => {
      const from = trigger(event.target);
      const to = trigger(event.relatedTarget);
      if (from && from === to) return;
      if (inPreview(event.relatedTarget)) return;
      if (from || inPreview(event.target)) {
        hovered = to;
        if (to) open(to, false);
        else if (document.activeElement !== active.current?.anchor)
          scheduleClose();
      }
    };
    const onFocus = (event: FocusEvent) => {
      const anchor = trigger(event.target);
      if (anchor && !touched) open(anchor, true);
    };
    const onBlur = (event: FocusEvent) => {
      if (trigger(event.target) && hovered !== active.current?.anchor)
        scheduleClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      touched = event.pointerType === "touch";
      if (!inPreview(event.target)) {
        suppressed = trigger(event.target);
        close();
      }
    };
    const onClick = (event: MouseEvent) => {
      if (!inPreview(event.target)) {
        suppressed = trigger(event.target);
        close();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        suppressed = active.current?.anchor || null;
        close();
      } else if (event.key === "Tab") {
        touched = false;
        suppressed = null;
      }
    };
    // A card may disappear during a turn, or a dialog can replace its surface.
    const observer = new MutationObserver(() => {
      if (!active.current) return;
      const { anchor } = active.current;
      const card = findCard(anchor.dataset.cardPreview);
      if (!card || !isAvailable(anchor)) {
        close();
        return;
      }
      // Keep live damage, strength and placement synchronized with playback.
      active.current = { card, anchor };
      setPreview(active.current);
    });
    observer.observe(document.getElementById("root") || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-card-preview",
        "data-card-ready",
        "data-card-damage",
        "data-card-might",
        "data-card-footer",
        "data-card-statuses",
      ],
    });
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      cancelTimers();
      observer.disconnect();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, []);

  useEffect(() => {
    if (!preview) return;
    const { anchor } = preview;
    const previous = anchor.getAttribute("aria-describedby");
    anchor.setAttribute(
      "aria-describedby",
      [previous, tooltipId].filter(Boolean).join(" "),
    );
    return () => {
      if (previous) anchor.setAttribute("aria-describedby", previous);
      else anchor.removeAttribute("aria-describedby");
    };
  }, [preview?.anchor, tooltipId]);

  useEffect(() => {
    if (!preview) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && active.current?.anchor === entry.target) {
        active.current = null;
        setPreview(null);
      }
    });
    observer.observe(preview.anchor);
    return () => observer.disconnect();
  }, [preview?.anchor]);

  return (
    <CardPreviewActive.Provider value={Boolean(preview)}>
      {children}
      {preview &&
        createPortal(
          <PreviewPanel
            key={preview.card.id}
            preview={preview}
            id={tooltipId}
          />,
          document.body,
        )}
    </CardPreviewActive.Provider>
  );
}

export function PreviewPanel({
  preview,
  id,
}: {
  preview: Preview;
  id: string;
}) {
  const { card, anchor } = preview;
  const { t } = useI18n();
  const panel = useRef<HTMLElement>(null);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    const place = () => {
      if (!panel.current) return;
      const rect = anchor.getBoundingClientRect();
      const { width, height } = panel.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width || window.innerWidth;
      const viewportHeight = viewport?.height || window.innerHeight;
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const topEdge = (viewport?.offsetTop || 0) + 12;
      const rightEdge = leftEdge + viewportWidth - 24;
      const bottomEdge = topEdge + viewportHeight - 24;
      const gap = 14;
      let left: number;
      let top: number;
      if (rect.right + gap + width <= rightEdge) {
        left = rect.right + gap;
        top = rect.top + (rect.height - height) / 2;
      } else if (rect.left - gap - width >= leftEdge) {
        left = rect.left - gap - width;
        top = rect.top + (rect.height - height) / 2;
      } else {
        left = rect.left + (rect.width - width) / 2;
        top = rect.top - height - gap;
        if (top < topEdge && rect.bottom + gap + height <= bottomEdge)
          top = rect.bottom + gap;
      }
      setPosition({
        left: Math.max(leftEdge, Math.min(left, rightEdge - width)),
        top: Math.max(topEdge, Math.min(top, bottomEdge - height)),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    observer.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [preview, anchor]);

  const ready = anchor.dataset.cardReady;
  const previewReady =
    ready === "true" ? true : ready === "false" ? false : undefined;
  const damage = Number(anchor.dataset.cardDamage || 0);
  const might = anchor.dataset.cardMight;
  const footer = anchor.dataset.cardFooter;
  const statuses = readCardStatuses(anchor.dataset.cardStatuses);
  return (
    <aside
      id={id}
      ref={panel}
      role="tooltip"
      className="card-preview"
      style={
        {
          ...position,
          "--preview-accent": domainColors[card.domains[0]] || "#ddb979",
        } as CSSProperties
      }
    >
      <div
        className={`card-preview-art ${previewReady === false ? "is-exhausted" : ""}`}
      >
        {!failed && card.image ? (
          <img src={cardArtUrl(card)} alt="" onError={() => setFailed(true)} />
        ) : (
          <div className="card-preview-fallback">
            <Zap size={36} />
            <strong>{card.name}</strong>
            <span>{t(card.type)}</span>
          </div>
        )}
        <ExhaustedToken ready={previewReady} />
        <CardStatusTokens statuses={statuses} />
        <span className="card-preview-set">
          {card.set} · {card.collectorNumber}
        </span>
      </div>
      <div className="card-preview-copy">
        <span className="card-preview-eyebrow">
          {[card.supertype, card.type]
            .filter((value): value is string => Boolean(value))
            .map((value) => t(value))
            .join(" · ")}
        </span>
        <h3>{card.name}</h3>
        <div className="card-preview-domains">
          {card.domains.map((domain) => (
            <span key={domain} style={{ color: domainColors[domain] }}>
              {t(domain)}
            </span>
          ))}
        </div>
        <div className="card-preview-stats">
          {card.energy !== null && (
            <span>
              <Zap size={14} /> {card.energy} {t("energije")}
            </span>
          )}
          {card.power !== null && (
            <span>
              ◈ {card.power} {t("moći")}
            </span>
          )}
          {(might !== undefined || card.might !== null) && (
            <span>
              <Shield size={14} /> {might ?? card.might} {t("snage")}
            </span>
          )}
        </div>
        <p className="card-preview-rules">
          {readableText(card.text) || t("Ova karta nema dodatni tekst efekta.")}
        </p>
        <RulesErrata name={card.name} />
        <EquipmentRules cardId={card.id} />
        {statuses.length > 0 && (
          <section
            className="card-preview-effects"
            aria-label={t("Active effects")}
          >
            <CardStatusTokens statuses={statuses} expanded />
          </section>
        )}
        {(ready || damage > 0 || footer) && (
          <div className="card-preview-state">
            {ready && (
              <span>{t(ready === "true" ? "Spremna" : "Iscrpljena")}</span>
            )}
            {damage > 0 && (
              <span className="card-preview-damage">
                {t("{count} primljene štete", { count: damage })}
              </span>
            )}
            {footer && <span>{t(footer)}</span>}
          </div>
        )}
        <small className="card-preview-hint">
          {t("Esc zatvara pregled · klik zadržava radnju karte")}
        </small>
      </div>
    </aside>
  );
}
