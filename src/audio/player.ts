import type { AudioCueKind, AudioVoice, GameAudioCue } from "./events";

export type AudioPreferences = {
  enabled: boolean;
  volume: number;
  announcerEnabled: boolean;
};

type Channel = "game" | "preview";
type SoundSource = AudioScheduledSourceNode;
const voices: Record<AudioVoice, string> = {
  champion: "/audio/champion.mp3",
  battle: "/audio/battle.mp3",
  victory: "/audio/victory.mp3",
  defeat: "/audio/defeat.mp3",
};
const clampVolume = (volume: number) =>
  Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;

/** One mixer for the whole app. Failed audio never changes a duel's state. */
export class GameAudioPlayer {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private preferences: AudioPreferences = {
    enabled: false,
    volume: 0.55,
    announcerEnabled: true,
  };
  private buffers = new Map<AudioVoice, Promise<AudioBuffer | null>>();
  private versions: Record<Channel, number> = { game: 0, preview: 0 };
  private sources: Record<Channel, Set<SoundSource>> = {
    game: new Set(),
    preview: new Set(),
  };
  private frame: string | null = null;

  constructor(
    private readonly createContext = () => {
      const Constructor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      return Constructor ? new Constructor() : undefined;
    },
    private readonly fetchAudio: typeof fetch = (...args) => fetch(...args),
  ) {}

  configure(preferences: AudioPreferences) {
    const previous = this.preferences;
    this.preferences = {
      ...preferences,
      volume: clampVolume(preferences.volume),
    };
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(
        this.preferences.enabled ? this.preferences.volume : 0,
        this.context.currentTime,
        0.015,
      );
    }
    if (
      !this.preferences.enabled ||
      !this.preferences.volume ||
      (previous.announcerEnabled && !preferences.announcerEnabled)
    )
      this.stop();
  }

  /** Called directly by a pointer/keyboard gesture, before awaiting anything. */
  async unlock(): Promise<boolean> {
    if (!this.preferences.enabled || !this.preferences.volume) return false;
    try {
      this.context ??= this.createContext();
      if (!this.context) return false;
      if (!this.master) {
        this.master = this.context.createGain();
        this.master.gain.value = this.preferences.volume;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  /** A changed frame invalidates pending decodes as well as currently playing audio. */
  setFrame(frame: string | null) {
    if (frame === this.frame) return;
    this.frame = frame;
    this.stopChannel("game");
  }

  stopGame() {
    this.stopChannel("game");
  }

  stop() {
    this.stopChannel("game");
    this.stopChannel("preview");
  }

  private stopChannel(channel: Channel) {
    this.versions[channel] += 1;
    for (const source of this.sources[channel]) {
      try {
        source.stop();
      } catch {
        // A source may already have ended while the page was backgrounded.
      }
      source.disconnect();
    }
    this.sources[channel].clear();
  }

  private track(source: SoundSource, channel: Channel) {
    this.sources[channel].add(source);
    source.onended = () => {
      this.sources[channel].delete(source);
      source.disconnect();
    };
  }

  private canPlay(channel: Channel, version: number) {
    return (
      this.context?.state === "running" &&
      this.preferences.enabled &&
      this.preferences.volume > 0 &&
      this.versions[channel] === version &&
      (typeof document === "undefined" || document.visibilityState !== "hidden")
    );
  }

  private voiceBuffer(voice: AudioVoice): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(voice);
    if (existing) return existing;
    const pending = this.fetchAudio(voices[voice], { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Audio unavailable");
        return response.arrayBuffer();
      })
      .then((bytes) => this.context!.decodeAudioData(bytes))
      .catch(() => {
        this.buffers.delete(voice);
        return null;
      });
    this.buffers.set(voice, pending);
    return pending;
  }

  async play(cue: GameAudioCue, channel: Channel = "game"): Promise<boolean> {
    this.stopChannel(channel);
    this.stopChannel(channel === "game" ? "preview" : "game");
    const version = this.versions[channel];
    if (!this.canPlay(channel, version)) return false;
    try {
      this.synthesise(cue.kind, channel);
      if (cue.voice && this.preferences.announcerEnabled) {
        const buffer = await this.voiceBuffer(cue.voice);
        if (
          !buffer ||
          !this.canPlay(channel, version) ||
          !this.preferences.announcerEnabled
        )
          return false;
        const source = this.context!.createBufferSource();
        source.buffer = buffer;
        source.connect(this.master!);
        this.track(source, channel);
        source.start();
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Short, quiet accents sit underneath the Fish Audio event announcements. */
  private synthesise(kind: AudioCueKind, channel: Channel) {
    const context = this.context!,
      output = this.master!,
      time = context.currentTime;
    const tone = (
      frequency: number,
      end: number,
      offset: number,
      duration: number,
      level = 0.055,
      type: OscillatorType = "sine",
    ) => {
      const source = context.createOscillator();
      const gain = context.createGain();
      source.type = type;
      source.frequency.setValueAtTime(frequency, time + offset);
      source.frequency.exponentialRampToValueAtTime(
        end,
        time + offset + duration,
      );
      gain.gain.setValueAtTime(0.0001, time + offset);
      gain.gain.exponentialRampToValueAtTime(level, time + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + offset + duration);
      source.connect(gain);
      gain.connect(output);
      this.track(source, channel);
      source.onended = () => {
        this.sources[channel].delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start(time + offset);
      source.stop(time + offset + duration + 0.02);
    };
    if (kind === "impact") {
      const noise = context.createBuffer(
        1,
        context.sampleRate * 0.16,
        context.sampleRate,
      );
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      this.track(source, channel);
      source.onended = () => {
        this.sources[channel].delete(source);
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      source.start();
      tone(100, 42, 0, 0.2, 0.12);
    } else if (kind === "counter") {
      tone(1100, 350, 0, 0.19, 0.065);
      tone(480, 210, 0.035, 0.22, 0.04, "triangle");
    } else if (kind === "battle") {
      tone(130, 75, 0, 0.25, 0.09, "triangle");
    } else {
      const notes =
        kind === "score"
          ? [660, 880, 1108]
          : kind === "defeat"
            ? [330, 247, 165]
            : kind === "victory"
              ? [440, 554, 660, 880]
              : [220, 330, 440];
      notes.forEach((note, index) =>
        tone(note, note, index * 0.09, 0.25, 0.045, "sine"),
      );
    }
  }
}

let player: GameAudioPlayer | undefined;
export function getGameAudioPlayer() {
  return (player ??= new GameAudioPlayer());
}

/** Let an enable-sound click unlock using its new preference immediately. */
export function unlockGameAudio(preferences: AudioPreferences) {
  const current = getGameAudioPlayer();
  current.configure(preferences);
  return current.unlock();
}

/** Explicit settings preview; it works while the gameplay panel is paused. */
export async function previewGameAudio(preferences: AudioPreferences) {
  const current = getGameAudioPlayer();
  current.configure(preferences);
  const unlocked = await current.unlock();
  if (!unlocked) return false;
  return current.play(
    { key: "settings-preview", kind: "champion", voice: "champion" },
    "preview",
  );
}
