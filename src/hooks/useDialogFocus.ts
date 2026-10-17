import { useEffect, useRef } from "react";
import { useBodyScrollLock } from "./useBodyScrollLock";

const modalSelector = "[aria-modal='true']";
const controlSelector =
  "button, select, input:not([type='hidden']), textarea, a[href], summary, [contenteditable='true'], [tabindex]";
let pendingReturn: { target: HTMLElement | null } | undefined;

function visible(element: HTMLElement) {
  return (
    element.isConnected &&
    element.getClientRects().length > 0 &&
    !element.closest("[hidden], [inert], [aria-hidden='true']") &&
    getComputedStyle(element).visibility !== "hidden"
  );
}

function controls(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(controlSelector))
    .filter(
      (item) =>
        item.tabIndex >= 0 && !item.matches(":disabled") && visible(item),
    )
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}

function topDialog() {
  // Card inspection is portaled above its parent; DOM order alone is insufficient.
  return Array.from(document.querySelectorAll<HTMLElement>(modalSelector))
    .filter(visible)
    .map((element, order) => ({
      element,
      order,
      layer:
        Number.parseInt(
          getComputedStyle(
            element.closest<HTMLElement>(
              ".modal-backdrop, .hand-sheet-backdrop, .mobile-menu-backdrop",
            ) ?? element,
          ).zIndex,
          10,
        ) || 0,
    }))
    .sort((a, b) => a.layer - b.layer || a.order - b.order)
    .at(-1)?.element;
}

/** The top dialog owns focus, including when inspection opens above another dialog. */
export function useDialogFocus(close: () => void, active = true) {
  useBodyScrollLock(active);
  const panel = useRef<HTMLElement>(null);
  const returnTarget = useRef<HTMLElement | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!active) return;
    const element = panel.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    if (
      previous &&
      previous !== document.body &&
      previous !== document.documentElement &&
      !element.contains(previous) &&
      visible(previous)
    )
      returnTarget.current = previous;
    else if (pendingReturn?.target && visible(pendingReturn.target))
      returnTarget.current = pendingReturn.target;
    // StrictMode replays this effect while focus is already inside the dialog.
    // Keep the original invoker instead of replacing it with the dialog itself.
    const previousTabIndex = element.getAttribute("tabindex");
    if (previousTabIndex === null) element.tabIndex = -1;
    let lastFocus: HTMLElement = element;
    const initial = element.querySelector<HTMLElement>(
      "[data-dialog-initial-focus]",
    );
    // Start at the heading/content instead of preselecting a destructive action.
    (initial && visible(initial) ? initial : element).focus({
      preventScroll: true,
    });

    const onFocus = (event: FocusEvent) => {
      if (topDialog() !== element) return;
      if (
        event.target instanceof HTMLElement &&
        element.contains(event.target)
      ) {
        lastFocus = event.target;
      } else {
        (visible(lastFocus) ? lastFocus : element).focus({
          preventScroll: true,
        });
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || topDialog() !== element) return;
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = controls(element);
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        element.focus({ preventScroll: true });
        return;
      }
      if (
        !items.includes(document.activeElement as HTMLElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      if (previousTabIndex === null) element.removeAttribute("tabindex");
      const returning = { target: returnTarget.current };
      pendingReturn = returning;
      // A dialog may be replaced in the same update. Let the replacement keep focus.
      queueMicrotask(() => {
        if (pendingReturn === returning) pendingReturn = undefined;
        const previous = returning.target;
        const top = topDialog();
        if (previous && visible(previous) && (!top || top.contains(previous)))
          previous.focus({ preventScroll: true });
        else if (top && !top.contains(document.activeElement))
          (controls(top)[0] ?? top).focus({ preventScroll: true });
      });
    };
  }, [active]);
  return panel;
}
