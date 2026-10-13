import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, BookOpen, History, Settings2, X } from "lucide-react";
import { LanguageSelector, useI18n } from "../i18n";
import { useDialogFocus } from "../hooks/useDialogFocus";
import type { PlaybackSpeed as Speed } from "../game/playback";
import { PlaybackSpeed } from "./PlaybackSpeed";
import "./MobileMatchMenu.css";

export function MobileMatchMenu({
  open,
  close,
  speed,
  setSpeed,
  showHistory,
  showHelp,
  leave,
  botReason,
  showSaved,
  saveStatus,
  manualPayment,
  onManualPaymentChange,
}: {
  open: boolean;
  close: () => void;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  showHistory: () => void;
  showHelp: () => void;
  leave: () => void;
  botReason: string;
  showSaved?: () => void;
  saveStatus?: ReactNode;
  manualPayment?: boolean;
  onManualPaymentChange?: (manual: boolean) => void;
}) {
  const { t } = useI18n();
  const dialog = useDialogFocus(close, open);
  if (!open) return null;
  const navigate = (action: () => void) => {
    close();
    action();
  };
  return createPortal(
    <div className="mobile-menu-backdrop" onClick={close}>
      <section
        className="mobile-match-menu"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("Duel menu")}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <Settings2 size={19} />
            <h2>{t("Duel menu")}</h2>
          </div>
          <button aria-label={t("Zatvori")} onClick={close}>
            <X size={20} />
          </button>
        </header>
        <div className="mobile-menu-settings">
          <LanguageSelector />
          {onManualPaymentChange && (
            <label className="mobile-menu-setting">
              <span>{t("Rune payment mode")}</span>
              <select
                value={manualPayment ? "manual" : "auto"}
                onChange={(event) =>
                  onManualPaymentChange(event.target.value === "manual")
                }
              >
                <option value="auto">{t("Automatic payment")}</option>
                <option value="manual">{t("Choose runes")}</option>
              </select>
            </label>
          )}
          <div className="mobile-menu-setting">
            <span>{t("Playback speed")}</span>
            <PlaybackSpeed speed={speed} onChange={setSpeed} />
          </div>
        </div>
        <div className="mobile-menu-links">
          {showSaved && (
            <button onClick={() => navigate(showSaved)}>
              <History size={19} />
              {t("Saved duels")}
            </button>
          )}
          <button onClick={() => navigate(showHistory)}>
            <History size={19} />
            {t("Dnevnik meča")}
          </button>
          <button onClick={() => navigate(showHelp)}>
            <BookOpen size={19} />
            {t("Pravila")}
          </button>
          <button onClick={() => navigate(leave)}>
            <ArrowLeft size={19} />
            {t("Špilovi")}
          </button>
        </div>
        {saveStatus}
        <details className="mobile-menu-bot">
          <summary>{t("AI decision")}</summary>
          <p>{t(botReason || "The bot explains its last decision here.")}</p>
        </details>
        <p className="mobile-menu-note">
          {t("The duel waits while this menu is open.")}
        </p>
      </section>
    </div>,
    document.body,
  );
}
