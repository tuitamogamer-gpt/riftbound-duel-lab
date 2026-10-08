import { Component, useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useI18n } from "../i18n";
import "./RouteBoundary.css";

function RouteRecovery({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <main className="route-recovery" id="main-content" tabIndex={-1}>
      <h1 ref={heading} tabIndex={-1}>
        {t("This screen could not be opened.")}
      </h1>
      <p>
        {t(
          "Return to the arena, or reload the page to try again when your connection is available.",
        )}
      </p>
      <div className="route-recovery-actions">
        <button className="gold-button" onClick={onBack}>
          <ArrowLeft size={18} />
          {t("Return to arena")}
        </button>
        <button
          className="outline-button"
          onClick={() => window.location.reload()}
        >
          <RotateCcw size={18} />
          {t("Reload page")}
        </button>
      </div>
    </main>
  );
}

/** A rejected lazy import stays rejected until reload; navigation still remains usable. */
export class RouteBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <RouteRecovery onBack={this.props.onBack} />
    ) : (
      this.props.children
    );
  }
}
