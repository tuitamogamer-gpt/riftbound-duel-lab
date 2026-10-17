import { useId, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { useI18n } from "../i18n";
import {
  CARD_BACKS,
  resolveCardBack,
  type SleevePlayer,
} from "../data/cardbacks";
import { useCardBackPreference } from "./cardback-preference";
import "./CardBackPicker.css";

export function CardBackPicker({ player }: { player?: SleevePlayer }) {
  const { t } = useI18n();
  const [selected, select] = useCardBackPreference();
  const groupName = useId();
  const signature = resolveCardBack("signature", player);
  const choices = [
    ...CARD_BACKS,
    {
      key: "signature" as const,
      name: "Champion",
      description: "A signature sleeve for each champion.",
      src: signature.src,
      accent: "#e8c987",
    },
  ];

  return (
    <fieldset className="card-back-picker">
      <legend>{t("Card backs")}</legend>
      <p className="card-back-picker-intro">
        {t("Choose the finish for your table.")}
      </p>
      <div className="card-back-options">
        {choices.map((back) => (
          <label
            key={back.key}
            className={`card-back-option${selected === back.key ? " is-selected" : ""}`}
            style={{ "--card-back-accent": back.accent } as CSSProperties}
          >
            <input
              type="radio"
              name={`card-back-${groupName}`}
              value={back.key}
              checked={selected === back.key}
              onChange={() => select(back.key)}
              aria-label={t(back.name)}
            />
            <span className="card-back-option-art">
              <img
                src={back.src}
                alt=""
                width={744}
                height={1039}
                draggable={false}
                decoding="async"
              />
              <span className="card-back-selected-mark" aria-hidden="true">
                <Check size={14} strokeWidth={2.7} />
              </span>
            </span>
            <span className="card-back-option-name">{t(back.name)}</span>
          </label>
        ))}
      </div>
      <p className="card-back-picker-note">
        {t("Applies to all face-down cards on this device.")}
      </p>
    </fieldset>
  );
}
