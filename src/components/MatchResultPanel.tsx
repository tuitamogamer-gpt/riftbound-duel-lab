import { useEffect, useRef, type ReactNode } from "react";

export function MatchResultPanel({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      ref={panel}
      className="result-banner"
      role="region"
      aria-labelledby="match-result-title"
      tabIndex={-1}
    >
      {children}
    </section>
  );
}
