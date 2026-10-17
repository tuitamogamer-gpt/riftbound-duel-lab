import { useState } from "react";
import {
  Check,
  Eye,
  Keyboard,
  Palette,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import {
  setInterfacePreferences,
  useInterfacePreferences,
} from "../interface-preferences";
import { AppDialog } from "./AppDialog";
import { CardBackPicker } from "./CardBackPicker";
import type { SleevePlayer } from "../data/cardbacks";
import "./AppearanceDialog.css";

export function AppearanceDialog({
  close,
  player,
}: {
  close: () => void;
  player?: SleevePlayer;
}) {
  const { t } = useI18n();
  const preferences = useInterfacePreferences();
  const [saved, setSaved] = useState(true);
  return (
    <AppDialog
      className="appearance-dialog"
      label={t("Appearance")}
      close={close}
    >
      <header className="appearance-heading">
        <div>
          <span className="appearance-eyebrow">
            <Palette size={14} />
            {t("Make it yours")}
          </span>
          <h2>{t("Appearance")}</h2>
          <p>{t("Your cards. Your table. Your pace.")}</p>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label={t("Zatvori")}
        >
          <X size={21} />
        </button>
      </header>
      <div className="appearance-body">
        <CardBackPicker player={player} />
        <section
          className="appearance-options"
          aria-label={t("Display preferences")}
        >
          <label className="appearance-option">
            <Eye size={21} aria-hidden="true" />
            <span>
              <strong>{t("Clearer table")}</strong>
              <small>
                {t("Dim battlefield art and strengthen zone borders.")}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={preferences.boardContrast === "high"}
              onChange={(event) =>
                setSaved(
                  setInterfacePreferences({
                    boardContrast: event.target.checked ? "high" : "standard",
                  }),
                )
              }
            />
          </label>
          <label className="appearance-option">
            <Sparkles size={21} aria-hidden="true" />
            <span>
              <strong>{t("Reduce effects")}</strong>
              <small>
                {t("Keep game feedback, with less movement and flashing.")}
              </small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={preferences.reducedEffects}
              onChange={(event) =>
                setSaved(
                  setInterfacePreferences({
                    reducedEffects: event.target.checked,
                  }),
                )
              }
            />
          </label>
          <p className="appearance-system-note">
            {t("Your device's reduced-motion preference is always respected.")}
          </p>
          <label className="appearance-option">
            <Volume2 size={21} aria-hidden="true" />
            <span>
              <strong>{t("Game sound")}</strong>
              <small>{t("Play a short cue when an action resolves.")}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={preferences.soundEnabled}
              onChange={(event) =>
                setSaved(
                  setInterfacePreferences({
                    soundEnabled: event.target.checked,
                  }),
                )
              }
            />
          </label>
        </section>
        <details className="appearance-shortcuts">
          <summary>
            <Keyboard size={17} />
            {t("Keyboard controls")}
          </summary>
          <dl>
            <div>
              <dt>
                <kbd>Tab</kbd>
              </dt>
              <dd>{t("Move between controls and preview cards")}</dd>
            </div>
            <div>
              <dt>
                <kbd>Enter</kbd>
              </dt>
              <dd>{t("Activate the focused control")}</dd>
            </div>
            <div>
              <dt>
                <kbd>P</kbd>
              </dt>
              <dd>{t("Pause or resume the duel")}</dd>
            </div>
            <div>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>{t("Close a preview or dialog; clear a selection")}</dd>
            </div>
          </dl>
        </details>
      </div>
      <footer className="appearance-footer">
        <span role="status">
          {saved ? (
            <>
              <Check size={15} />
              {t("Changes apply instantly")}
            </>
          ) : (
            t("Preferences work until you close this page.")
          )}
        </span>
        <button className="gold-button" onClick={close}>
          {t("Done")}
        </button>
      </footer>
    </AppDialog>
  );
}
