import { Gauge } from "lucide-react";
import {
  isPlaybackSpeed,
  playbackSpeeds,
  type PlaybackSpeed as Speed,
} from "../game/playback";
import { useI18n } from "../i18n";

export function PlaybackSpeed({
  speed,
  onChange,
}: {
  speed: Speed;
  onChange: (speed: Speed) => void;
}) {
  const { t } = useI18n();
  return (
    <label className="playback-speed" title={t("Playback speed")}>
      <Gauge size={14} aria-hidden="true" />
      <select
        aria-label={t("Playback speed")}
        value={speed}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (isPlaybackSpeed(next)) onChange(next);
        }}
      >
        {playbackSpeeds.map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>
    </label>
  );
}
