import { useEffect, useRef } from "react";
import { useBodyScrollLock } from "./useBodyScrollLock";

/** Only the top modal handles keyboard navigation; nested inspection preserves its parent. */
export function useDialogFocus(close: () => void, active = true) {
  useBodyScrollLock(active);
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    if (!element) return;
    const items = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          "button:not(:disabled), select:not(:disabled), input:not(:disabled):not([type='hidden']), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((item) => item.tabIndex >= 0 && item.getClientRects().length);
    (items()[0] ?? element).focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      const top = Array.from(
        document.querySelectorAll<HTMLElement>("[aria-modal='true']"),
      )
        .filter((item) => item.getClientRects().length)
        .at(-1);
      // Portals can precede the nested modal in DOM order; z-index determines the top surface.
      const otherAbove = Array.from(
        document.querySelectorAll<HTMLElement>("[aria-modal='true']"),
      ).some(
        (item) =>
          item !== element &&
          item.getClientRects().length &&
          Number(
            getComputedStyle(
              item.closest<HTMLElement>(
                ".modal-backdrop, .hand-sheet-backdrop, .mobile-menu-backdrop",
              ) ?? item,
            ).zIndex,
          ) >
            Number(
              getComputedStyle(
                element.closest<HTMLElement>(".modal-backdrop") ?? element,
              ).zIndex,
            ),
      );
      if (
        otherAbove ||
        (top !== element && !element.contains(document.activeElement))
      )
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const controls = items();
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          element.focus({ preventScroll: true });
          return;
        }
        if (
          !element.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [active]);
  return panel;
}
