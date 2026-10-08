import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../scripts/service-worker.template.js", import.meta.url),
  "utf8",
);
function worker() {
  const listeners = new Map<string, (event: any) => void>();
  const cache = {
    put: vi.fn(async () => {}),
    addAll: vi.fn(async (_urls: string[]) => {}),
  };
  const caches = {
    match: vi.fn(
      async (_request: Request | string, _options?: unknown) =>
        undefined as Response | undefined,
    ),
    open: vi.fn(async (_name: string) => cache),
    keys: vi.fn(async () => [] as string[]),
    delete: vi.fn(async (_name: string) => true),
  };
  const fetcher = vi.fn(
    async (_request: Request | string) =>
      new Response("downloaded chunk", { status: 200 }),
  );
  const claim = vi.fn(async () => {});
  const skipWaiting = vi.fn();
  runInNewContext(source, {
    URL,
    Request,
    Response,
    AbortSignal,
    self: {
      location: { origin: "https://game.test" },
      addEventListener: (type: string, listener: (event: any) => void) =>
        listeners.set(type, listener),
      clients: { claim },
      skipWaiting,
    },
    caches,
    fetch: fetcher,
  });
  const request = (url: string, navigation = false) => {
    const input = new Request(url);
    if (navigation) Object.defineProperty(input, "mode", { value: "navigate" });
    let result: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: input,
      respondWith: (response: Promise<Response>) => (result = response),
    });
    return result;
  };
  const lifecycle = (type: "install" | "activate") => {
    let result: Promise<void> | undefined;
    listeners.get(type)!({
      waitUntil: (promise: Promise<void>) => (result = promise),
    });
    return result!;
  };
  return { cache, caches, fetcher, request, lifecycle, claim, skipWaiting };
}

describe("offline service-worker failures", () => {
  it("serves precached chunks across Origin-header variations without a download", async () => {
    const sw = worker();
    sw.caches.match.mockResolvedValue(new Response("cached chunk"));
    expect(
      await (await sw.request("https://game.test/assets/app.js"))!.text(),
    ).toBe("cached chunk");
    expect(sw.caches.match.mock.calls[0]?.[1]).toEqual({ ignoreVary: true });
    expect(sw.fetcher).not.toHaveBeenCalled();
  });
  it.each(["match", "open", "put"] as const)(
    "returns the successful network chunk when cache.%s fails",
    async (failure) => {
      const sw = worker();
      const error = new DOMException("Storage full", "QuotaExceededError");
      if (failure === "put") sw.cache.put.mockRejectedValue(error);
      else sw.caches[failure].mockRejectedValue(error);
      const response = (await sw.request("https://game.test/assets/new.js"))!;
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("downloaded chunk");
    },
  );
  it("preserves unsuccessful HTTP status instead of caching it as an app chunk", async () => {
    const sw = worker();
    sw.fetcher.mockResolvedValue(new Response("missing", { status: 404 }));
    const response = (await sw.request("https://game.test/assets/missing.js"))!;
    expect(response.status).toBe(404);
    expect(sw.cache.put).not.toHaveBeenCalled();
  });
  it("preserves a real network failure when the asset is unavailable offline", async () => {
    const sw = worker();
    sw.fetcher.mockRejectedValue(new TypeError("Network unavailable"));
    await expect(
      sw.request("https://game.test/assets/missing.js"),
    ).rejects.toThrow("Network unavailable");
  });
  it("uses the cached install shell for offline navigation", async () => {
    const sw = worker();
    sw.fetcher.mockRejectedValue(new TypeError("Offline"));
    sw.caches.match.mockResolvedValue(new Response("cached shell"));
    const response = (await sw.request("https://game.test/", true))!;
    expect(await response.text()).toBe("cached shell");
    expect(sw.caches.match).toHaveBeenCalledWith("/index.html");
  });
  it("returns a navigation error without another rejected promise when both network and storage are unavailable", async () => {
    const sw = worker();
    sw.fetcher.mockRejectedValue(new TypeError("Offline"));
    sw.caches.match.mockRejectedValue(new Error("Storage disabled"));
    const response = (await sw.request("https://game.test/", true))!;
    expect(response.type).toBe("error");
    expect(response.status).toBe(0);
  });
  it("leaves private-room requests outside every cache handler", () => {
    const sw = worker();
    expect(sw.request("https://game.test/api/duel")).toBeUndefined();
    expect(sw.fetcher).not.toHaveBeenCalled();
    expect(sw.caches.match).not.toHaveBeenCalled();
  });
  it("keeps installation atomic and does not activate an incomplete update", async () => {
    const sw = worker();
    sw.fetcher.mockResolvedValue(
      Response.json({ assets: ["/", "/assets/a.js"] }),
    );
    sw.cache.addAll.mockRejectedValue(new Error("An asset was unavailable"));
    await expect(sw.lifecycle("install")).rejects.toThrow(
      "An asset was unavailable",
    );
    expect(sw.cache.addAll).toHaveBeenCalledWith(["/", "/assets/a.js"]);
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    expect(sw.claim).not.toHaveBeenCalled();
  });
  it("retains deck art and unrelated caches when a completed update activates", async () => {
    const sw = worker();
    sw.caches.keys.mockResolvedValue([
      "riftbound-app-old",
      "riftbound-app-__BUILD_ID__",
      "riftbound-deck-art-v1",
      "other-app",
    ]);
    await sw.lifecycle("activate");
    expect(sw.caches.delete.mock.calls.map(([name]) => name)).toEqual([
      "riftbound-app-old",
    ]);
    expect(sw.claim).toHaveBeenCalledOnce();
    expect(sw.skipWaiting).not.toHaveBeenCalled();
  });
});
