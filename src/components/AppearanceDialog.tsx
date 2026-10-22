import { useId, useRef, useState } from "react";
import {
  Check,
  Eye,
  Keyboard,
  Mic,
  Play,
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
import { DialogTabs } from "./DialogTabs";
import { CardBackPicker } from "./CardBackPicker";
import type { SleevePlayer } from "../data/cardbacks";
import { previewGameAudio, unlockGameAudio } from "../audio/player";
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
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<"backs" | "display">("backs");
  const [saved, setSaved] = useState(true);
  const [audioPreviewFailed, setAudioPreviewFailed] = useState(false);
  return (
    <AppDialog
      className="appearance-dialog"
      label={t("Appearance")}
      close={close}
    >
      <header className="appearance-heading">
        <div>
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
      <DialogTabs
        id={id}
        label={t("Appearance sections")}
        value={section}
        onChange={(next) => {
          setSection(next);
          body.current?.scrollTo({ top: 0 });
        }}
        tabs={[
          { value: "backs", label: t("Card backs") },
          { value: "display", label: t("Display & sound") },
        ]}
      />
      <div className="appearance-body" ref={body}>
        <section
          className="dialog-tab-panel"
          id={`${id}-backs-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-backs-tab`}
          hidden={section !== "backs"}
          tabIndex={0}
        >
          <CardBackPicker player={player} />
        </section>
        <section
          className="dialog-tab-panel"
          id={`${id}-display-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-display-tab`}
          hidden={section !== "display"}
          tabIndex={0}
        >
          <div className="appearance-options">
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
              {t(
                "Your device's reduced-motion preference is always respected.",
              )}
            </p>
            <label className="appearance-option">
              <Volume2 size={21} aria-hidden="true" />
              <span>
                <strong>{t("Game sound")}</strong>
                <small>{t("Combat, scoring and decisive moments.")}</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences.soundEnabled}
                onChange={(event) => {
                  setSaved(
                    setInterfacePreferences({
                      soundEnabled: event.target.checked,
                    }),
                  );
                  void unlockGameAudio({
                    enabled: event.target.checked,
                    volume: preferences.soundVolume,
                    announcerEnabled: preferences.announcerEnabled,
                  });
                }}
              />
            </label>
            <div className="appearance-volume">
              <label htmlFor={`${id}-volume`}>
                {t("Volume")}
                <output htmlFor={`${id}-volume`}>
                  {Math.round(preferences.soundVolume * 100)}%
                </output>
              </label>
              <input
                id={`${id}-volume`}
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(preferences.soundVolume * 100)}
                disabled={!preferences.soundEnabled}
                aria-valuetext={`${Math.round(preferences.soundVolume * 100)}%`}
                onChange={(event) =>
                  setSaved(
                    setInterfacePreferences({
                      soundVolume: Number(event.target.value) / 100,
                    }),
                  )
                }
              />
            </div>
            <label className="appearance-option">
              <Mic size={21} aria-hidden="true" />
              <span>
                <strong>{t("Announcer")}</strong>
                <small>
                  {t(
                    "Short English calls for champions, battle and the result.",
                  )}
                </small>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={preferences.announcerEnabled}
                disabled={!preferences.soundEnabled}
                onChange={(event) =>
                  setSaved(
                    setInterfacePreferences({
                      announcerEnabled: event.target.checked,
                    }),
                  )
                }
              />
            </label>
            <div className="appearance-audio-preview">
              <button
                type="button"
                disabled={
                  !preferences.soundEnabled || preferences.soundVolume === 0
                }
                onClick={() => {
                  setAudioPreviewFailed(false);
                  void previewGameAudio({
                    enabled: preferences.soundEnabled,
                    volume: preferences.soundVolume,
                    announcerEnabled: preferences.announcerEnabled,
                  }).then((played) => setAudioPreviewFailed(!played));
                }}
              >
                <Play size={16} aria-hidden="true" />
                {t("Play sample")}
              </button>
              <span role="status">
                {audioPreviewFailed
                  ? t("Sound could not start. Try the sample again.")
                  : preferences.soundEnabled
                    ? t("Only important game moments make a sound.")
                    : t("Sound stays off until you enable it.")}
              </span>
            </div>
          </div>
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
        </section>
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
