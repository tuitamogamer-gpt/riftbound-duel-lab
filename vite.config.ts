import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "duel-loopback-rooms",
      apply: "serve",
      configureServer(server) {
        if (process.env.DUEL_DEV_ROOMS !== "1") return;
        let handler: Promise<any> | undefined;
        server.middlewares.use("/api/duel", async (req, res) => {
          handler ??= Promise.all([
            server.ssrLoadModule("/src/server/duel-api.ts"),
            server.ssrLoadModule("/src/server/rooms.ts"),
          ]).then(([api, rooms]) =>
            api.createDuelHandler(new rooms.MemoryRoomStorage()),
          );
          const response = Object.assign(res, {
            status(code: number) {
              res.statusCode = code;
              return response;
            },
            json(value: unknown) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(value));
              return response;
            },
          });
          try {
            await (
              await handler
            )(req, response);
          } catch {
            response.status(503).json({ error: "storage-unavailable" });
          }
        });
      },
    },
    {
      name: "duel-offline-assets",
      apply: "build",
      generateBundle(_options, bundle) {
        const assets = Object.keys(bundle).filter((name) =>
          /\.(?:js|css|woff2?)$/.test(name),
        );
        const artRoot = new URL("./public/art/", import.meta.url);
        const nativeArt = readdirSync(artRoot, { recursive: true })
          .map((name) => String(name))
          .filter(
            (name) =>
              /\.(?:jpg|png|svg|webp)$/.test(name) &&
              !["tokens/exhausted.png", "tokens/exhausted-comic.png"].includes(
                name,
              ),
          );
        const hash = createHash("sha256").update(assets.sort().join("|"));
        for (const name of nativeArt.sort())
          hash.update(name).update(readFileSync(new URL(name, artRoot)));
        hash.update(
          readFileSync(
            new URL("./scripts/service-worker.template.js", import.meta.url),
          ),
        );
        hash.update(readFileSync(new URL("./index.html", import.meta.url)));
        for (const name of [
          "manifest.webmanifest",
          "favicon.svg",
          "app-icon.svg",
          "app-icon-192.png",
          "app-icon-512.png",
        ]) {
          hash.update(
            readFileSync(new URL(`./public/${name}`, import.meta.url)),
          );
        }
        const buildId = hash.digest("hex").slice(0, 12);
        this.emitFile({
          type: "asset",
          fileName: "offline-assets.json",
          source: JSON.stringify({
            buildId,
            assets: [
              "/",
              "/index.html",
              "/favicon.svg",
              "/app-icon.svg",
              "/app-icon-192.png",
              "/app-icon-512.png",
              "/manifest.webmanifest",
              ...nativeArt.map((name) => `/art/${name}`),
              ...assets.map((name) => `/${name}`),
            ],
          }),
        });
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: readFileSync(
            new URL("./scripts/service-worker.template.js", import.meta.url),
            "utf8",
          ).replaceAll("__BUILD_ID__", buildId),
        });
      },
    },
  ],
  server: { host: "127.0.0.1" },
  test: { environment: "node", setupFiles: ["tests/setup.ts"], maxWorkers: 4 },
});
