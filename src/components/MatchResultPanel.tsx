import { useEffect, useRef, type ReactNode } from "react";
import "./AppDialog.css";

export function MatchResultPanel({
  children,
  won = true,
}: {
  children: ReactNode;
  /** Whether the viewing player won: tints the panel. */
  won?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={panel}
      className={`result-banner match-result-panel ${won ? "is-victory" : "is-defeat"}`}
      role="region"
      aria-labelledby="match-result-title"
      tabIndex={-1}
    >
      {children}
    </section>
  );
}
