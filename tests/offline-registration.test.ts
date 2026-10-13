import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOfflineWhenIdle } from "../src/offline-registration";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("offline setup scheduling", () => {
  it("waits for visible resources and an idle window before precaching", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const addEventListener = vi.fn();
    const requestIdleCallback = vi.fn();
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    vi.stubGlobal("document", { readyState: "interactive" });
    vi.stubGlobal("window", { addEventListener, requestIdleCallback });
    registerOfflineWhenIdle();
    expect(register).not.toHaveBeenCalled();
    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
      { once: true },
    );
    addEventListener.mock.calls[0][1]();
    expect(register).not.toHaveBeenCalled();
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 3000,
    });
    requestIdleCallback.mock.calls[0][0]();
    expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js");
  });
  it("works after load without the idle API and absorbs registration failure", async () => {
    vi.useFakeTimers();
    const register = vi
      .fn()
      .mockRejectedValue(new Error("Storage unavailable"));
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    vi.stubGlobal("document", { readyState: "complete" });
    vi.stubGlobal("window", {});
    registerOfflineWhenIdle();
    expect(register).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js");
  });
  it("does not schedule unsupported browsers", () => {
    vi.stubGlobal("navigator", {});
    expect(() => registerOfflineWhenIdle()).not.toThrow();
  });
});
