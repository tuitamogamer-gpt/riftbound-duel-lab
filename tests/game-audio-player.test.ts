import { describe, expect, it, vi } from "vitest";
import { GameAudioPlayer } from "../src/audio/player";

function audioHarness() {
  const parameter = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  });
  const node = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
    frequency: parameter(),
    gain: parameter(),
  });
  const voices: ReturnType<typeof node>[] = [];
  const tones: ReturnType<typeof node>[] = [];
  const gains: ReturnType<typeof node>[] = [];
  const context = {
    state: "suspended",
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    createGain: vi.fn(() => {
      const gain = node();
      gains.push(gain);
      return gain;
    }),
    createOscillator: vi.fn(() => {
      const source = node();
      tones.push(source);
      return source;
    }),
    createBufferSource: vi.fn(() => {
      const source = node();
      voices.push(source);
      return source;
    }),
    createBuffer: vi.fn(() => ({
      getChannelData: () => new Float32Array(7680),
    })),
    createBiquadFilter: vi.fn(node),
    decodeAudioData: vi.fn(async () => ({ duration: 0.8 })),
  };
  const factory = vi.fn(() => context as unknown as AudioContext);
  const fetchAudio = vi.fn(
    async () =>
      ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as Response,
  );
  const player = new GameAudioPlayer(factory, fetchAudio);
  const preferences = { enabled: true, volume: 0.55, announcerEnabled: true };
  player.configure(preferences);
  return {
    player,
    preferences,
    context,
    factory,
    fetchAudio,
    voices,
    tones,
    gains,
  };
}

const champion = {
  kind: "champion",
  voice: "champion",
  key: "arrival",
} as const;

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return {
    promise,
    finish: () =>
      resolve({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response),
  };
}

describe("game audio mixer lifecycle", () => {
  it("requires gesture unlock and reuses one context and one cached voice across events", async () => {
    const h = audioHarness();
    expect(await h.player.play(champion)).toBe(false);
    expect(h.factory).not.toHaveBeenCalled();
    expect(h.fetchAudio).not.toHaveBeenCalled();
    expect(await h.player.unlock()).toBe(true);
    expect(await h.player.play(champion)).toBe(true);
    await h.player.unlock();
    await h.player.play({ ...champion, key: "another-arrival" });
    expect(h.factory).toHaveBeenCalledTimes(1);
    expect(h.context.resume).toHaveBeenCalledTimes(1);
    expect(h.fetchAudio).toHaveBeenCalledExactlyOnceWith(
      "/audio/champion.mp3",
      { cache: "force-cache" },
    );
    expect(h.context.decodeAudioData).toHaveBeenCalledTimes(1);
    expect(h.voices[0].stop).toHaveBeenCalledOnce();
    expect(h.voices[1].start).toHaveBeenCalledOnce();
  });

  it("mute stops playing sources and invalidates a voice still downloading", async () => {
    const h = audioHarness();
    await h.player.unlock();
    const pending = deferredResponse();
    h.fetchAudio.mockImplementationOnce(() => pending.promise);
    const play = h.player.play(champion);
    expect(h.tones).toHaveLength(3);
    h.player.configure({ ...h.preferences, enabled: false });
    expect(h.tones.every((tone) => tone.stop.mock.calls.length >= 2)).toBe(
      true,
    );
    pending.finish();
    expect(await play).toBe(false);
    expect(h.voices).toHaveLength(0);
    expect(await h.player.unlock()).toBe(false);
    expect(h.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(
      0,
      0,
      0.015,
    );
  });

  it("frame changes drop old async speech without replaying it when audio becomes available", async () => {
    const h = audioHarness();
    await h.player.unlock();
    h.player.setFrame("session:arrival");
    const pending = deferredResponse();
    h.fetchAudio.mockImplementationOnce(() => pending.promise);
    const play = h.player.play(champion);
    h.player.setFrame("session:cleanup");
    pending.finish();
    expect(await play).toBe(false);
    expect(h.voices).toHaveLength(0);
    await h.player.play({ kind: "score", key: "score" });
    expect(h.fetchAudio).toHaveBeenCalledTimes(1);
  });

  it("allows explicit preview while gameplay is stopped and still stops preview on mute", async () => {
    const h = audioHarness();
    await h.player.unlock();
    h.player.stopGame();
    expect(await h.player.play(champion, "preview")).toBe(true);
    h.player.stopGame();
    expect(h.voices[0].stop).not.toHaveBeenCalled();
    h.player.configure({ ...h.preferences, volume: 0 });
    expect(h.voices[0].stop).toHaveBeenCalledOnce();
    expect(await h.player.play(champion, "preview")).toBe(false);
  });

  it("keeps effects available with narration off and handles unavailable voice assets", async () => {
    const h = audioHarness();
    await h.player.unlock();
    h.fetchAudio.mockRejectedValueOnce(new Error("offline asset missing"));
    await expect(h.player.play(champion)).resolves.toBe(false);
    h.player.configure({ ...h.preferences, announcerEnabled: false });
    await expect(h.player.play(champion)).resolves.toBe(true);
    await expect(
      h.player.play({ kind: "impact", key: "combat" }),
    ).resolves.toBe(true);
    expect(h.fetchAudio).toHaveBeenCalledTimes(1);
    expect(h.context.createBuffer).toHaveBeenCalledOnce();
  });

  it("only starts the newest voice when overlapping requests finish in the opposite order", async () => {
    const h = audioHarness();
    await h.player.unlock();
    const first = deferredResponse();
    h.fetchAudio.mockImplementationOnce(() => first.promise);
    const old = h.player.play(champion);
    const latest = h.player.play({
      kind: "battle",
      voice: "battle",
      key: "battle",
    });
    expect(await latest).toBe(true);
    first.finish();
    expect(await old).toBe(false);
    expect(h.voices).toHaveLength(1);
    expect(h.voices[0].start).toHaveBeenCalledOnce();
  });
});
