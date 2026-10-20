import { useId, useRef, useState } from "react";
import { ChevronDown, Hand, Keyboard, Swords, X } from "lucide-react";
import { useI18n } from "../i18n";
import { AppDialog } from "./AppDialog";
import { DialogTabs } from "./DialogTabs";
import "./HelpDialog.css";

const steps = [
  [
    "01",
    "Pripremi ruku",
    "Start with 4 cards and replace up to 2 once. Your Legend starts in its zone with its effects. Your chosen champion starts in a separate zone; pay its cost to play it.",
  ],
  [
    "02",
    "Upravljaj runama",
    "Na početku poteza pripremaš karte i dobijaš 2 rune. Iscrpi runu za energiju; recikliraj je za power njene domene. Plaćanje karata radi automatski.",
  ],
  [
    "03",
    "Pošalji jedinice",
    "Select a ready unit, then a highlighted battlefield. Add other units if you want, then confirm the move in the center.",
  ],
  [
    "04",
    "Odgovori na protivnika",
    "Showdown daje objema stranama priliku za Action i Reaction karte. Lanac efekata rješava se od posljednjeg odigranog.",
  ],
  [
    "05",
    "Riješi borbu",
    "Click highlighted enemies to assign combat damage. Both sides deal damage simultaneously. Open the match log for combat details.",
  ],
  [
    "06",
    "Stigni do 8",
    "Bod dobijaš osvajanjem ili držanjem bojišta na početku poteza. Za osmi bod osvajanjem moraš bodovati oba bojišta u tom potezu.",
  ],
] as const;
type HelpSection = "start" | "controls" | "sources";

export function HelpDialog({ close }: { close: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [section, setSection] = useState<HelpSection>("start");
  const body = useRef<HTMLDivElement>(null);
  const panel = (value: HelpSection) => ({
    id: `${id}-${value}-panel`,
    role: "tabpanel",
    "aria-labelledby": `${id}-${value}-tab`,
    hidden: section !== value,
    tabIndex: 0,
    className: "dialog-tab-panel",
  });
  return (
    <AppDialog
      className="help-modal help-dialog"
      label={t("Kako igrati")}
      close={close}
    >
      <header className="help-heading">
        <div>
          <h2>{t("Kako igrati")}</h2>
          <p>
            {t("Osvoji bojišta.")} {t("Zadrži prednost.")}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t("Zatvori")}
          onClick={close}
        >
          <X size={21} />
        </button>
      </header>
      <DialogTabs
        id={id}
        label={t("Help topics")}
        value={section}
        onChange={(next) => {
          setSection(next);
          body.current?.scrollTo({ top: 0 });
        }}
        tabs={[
          { value: "start", label: t("Quick start") },
          { value: "controls", label: t("Controls") },
          { value: "sources", label: t("About & rules") },
        ]}
      />
      <div ref={body} className="help-body">
        <section {...panel("start")}>
          <p className="help-intro">
            {t("Six steps to your first duel. Open any step to learn more.")}
          </p>
          <div className="help-steps">
            {steps.map(([number, heading, copy], index) => (
              <details key={number} open={index === 0 ? true : undefined}>
                <summary>
                  <span className="help-step-number">{number}</span>
                  <strong>{t(heading)}</strong>
                  <ChevronDown size={17} aria-hidden="true" />
                </summary>
                <p>{t(copy)}</p>
              </details>
            ))}
          </div>
        </section>
        <section {...panel("controls")}>
          <p className="help-intro">
            {t("Select a card, then choose a move in the action bar.")}
          </p>
          <div className="help-controls">
            <section>
              <h3>
                <Hand size={18} />
                {t("Touch controls")}
              </h3>
              <dl>
                <div>
                  <dt>{t("Tap")}</dt>
                  <dd>{t("Select a card or an available action.")}</dd>
                </div>
                <div>
                  <dt>{t("Long press")}</dt>
                  <dd>
                    {t(
                      "Hold a card to read it at full size. Release without playing it.",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("Swipe")}</dt>
                  <dd>
                    {t(
                      "Browse your hand. Use the zone tabs to move around the table.",
                    )}
                  </dd>
                </div>
              </dl>
            </section>
            <section>
              <h3>
                <Keyboard size={18} />
                {t("Keyboard controls")}
              </h3>
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
            </section>
          </div>
          <p className="help-controls-note">
            {t(
              "The game waits whenever you have a choice. Open the duel menu to change playback speed or review the match log.",
            )}
          </p>
        </section>
        <section {...panel("sources")}>
          <h3> {t("Podrška i izvori")} </h3>
          <p>
            {t(
              "Ovo je nezavisni eksperimentalni simulator. Sve karte u spremljenom katalogu imaju podršku za igranje. Katalog je snimak Riftcodex podataka; podrška za karte ne potvrđuje sve moguće interakcije pravila.",
            )}{" "}
          </p>
          <p>
            {t(
              "Riotova Digital Tools Policy ne odobrava automatizovane Riftbound simulatore. Ovaj projekt nema Riot odobrenje.",
            )}{" "}
          </p>
          <a
            href="https://developer.riotgames.com/docs/riftbound"
            target="_blank"
            rel="noreferrer"
          >
            Riot Digital Tools Policy ↗
          </a>{" "}
          ·{" "}
          <a
            href="https://playriftbound.com/en-us/rules-hub/"
            target="_blank"
            rel="noreferrer"
          >
            {t("Službena pravila ↗")}{" "}
          </a>
        </section>
      </div>
      <footer className="help-footer">
        <button type="button" className="gold-button" onClick={close}>
          {t("Spreman za duel")}
          <Swords size={17} />
        </button>
      </footer>
    </AppDialog>
  );
}
