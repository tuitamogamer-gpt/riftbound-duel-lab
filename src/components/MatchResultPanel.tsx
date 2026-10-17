import { useEffect, useRef, type ReactNode } from "react";
import "./AppDialog.css";

export function MatchResultPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={panel}
      className="result-banner match-result-panel"
      role="region"
      aria-labelledby="match-result-title"
      tabIndex={-1}
    >
      {children}
    </section>
  );
}
