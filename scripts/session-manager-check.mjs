// Isolated loopback fixtures; never modifies a user browser or production save.
// PLAYWRIGHT_MODULE selects an external install; WEBKIT_EXECUTABLE adds WebKit.
// QA_ORIGIN sets the loopback app URL; QA_OUTPUT selects the artifact directory.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const dir = process.env.QA_OUTPUT || "test-results/session-manager";
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
  "Mobile interaction checks must run against loopback",
);
const engines = [["chromium", chromium, {}]];
if (process.env.WEBKIT_EXECUTABLE)
  engines.push([
    "webkit",
    webkit,
    { executablePath: process.env.WEBKIT_EXECUTABLE },
  ]);
await mkdir(dir, { recursive: true });
const results = [];
for (const [engine, type, options] of engines) {
  const browser = await type.launch({ headless: true, ...options });
  try {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
        acceptDownloads: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const record = { engine, width, height, status: "running" };
      let step = "fixture";
      const saved = () =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem("riftbound-duel-save-v1")),
        );
      try {
        await page.goto(
          `${origin}/tests/mobile-table-preview.html?mode=main&paused=true`,
        );
        await page
          .getByRole("button", { name: "Resume duel", exact: true })
          .tap();
        await page.locator(".hand-card-wrap").first().waitFor();
        const before = await saved();
        const open = async () => {
          await page
            .getByRole("button", { name: "Duel menu", exact: true })
            .tap();
          await page
            .locator(".mobile-match-menu")
            .getByRole("button", { name: "Saved duels", exact: true })
            .tap();
          await page.locator(".session-manager").waitFor();
        };
        await open();
        const manager = page.locator(".session-manager");
        await manager.evaluate(async (e) => {
          await Promise.all(
            e.getAnimations().map((a) => a.finished.catch(() => {})),
          );
        });
        const bounds = await manager.boundingBox();
        assert.ok(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y + bounds.height <= height + 1,
          "savedduels dialog fits",
        );
        step = "export";
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          manager
            .getByRole("button", { name: "Export duel", exact: true })
            .tap(),
        ]);
        const exported = JSON.parse(
          await readFile(await download.path(), "utf8"),
        );
        assert.deepEqual(exported.session.match, before.match);
        assert.match(download.suggestedFilename(), /^riftbound-duel-.*\.json$/);
        step = "invalidimport";
        await manager.getByLabel("Select a saved duel file").setInputFiles({
          name: "invalid.json",
          mimeType: "application/json",
          buffer: Buffer.from('{"bad":"save"}'),
        });
        await manager.getByRole("alert").waitFor();
        assert.match(
          await manager.getByRole("alert").innerText(),
          /does not contain a valid Riftbound duel/,
        );
        assert.deepEqual((await saved()).match, before.match);
        step = "validimport";
        const imported = await page.evaluate(async () => {
          const { createMobileDuelSession } =
            await import("/tests/fixtures/mobile-duel.ts");
          const { exportSessionText } = await import("/src/session-storage.ts");
          const session = createMobileDuelSession("hidden");
          session.paused = false;
          return {
            raw: exportSessionText(session),
            hidden: session.match.hidden,
          };
        });
        assert.equal(before.match.hidden.length, 0);
        assert.ok(imported.hidden.length > 0);
        await manager.getByLabel("Select a saved duel file").setInputFiles({
          name: "hidden-duel.json",
          mimeType: "application/json",
          buffer: Buffer.from(imported.raw),
        });
        await manager.locator(".session-import-preview").waitFor();
        assert.equal(await manager.getByRole("alert").count(), 0);
        assert.deepEqual((await saved()).match, before.match);
        await page.screenshot({
          path: `${dir}/${engine}-${width}-session-import.png`,
        });
        await manager
          .getByRole("button", { name: "Resume imported duel", exact: true })
          .tap();
        await manager.waitFor({ state: "detached" });
        await page.waitForFunction(
          () =>
            JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match
              .hidden.length > 0,
        );
        const restored = await saved();
        assert.deepEqual(restored.match.hidden, imported.hidden);
        assert.equal(restored.paused, true);
        assert.equal(await page.locator(".app.is-game").count(), 1);
        step = "close";
        await open();
        await manager.getByRole("button", { name: "Close", exact: true }).tap();
        await manager.waitFor({ state: "detached" });
        assert.equal(
          await page.evaluate(() => document.body.style.overflow),
          "",
        );
        assert.deepEqual(errors, []);
        record.status = "passed";
        record.checks = [
          "menu opens savedduels manager withinviewport",
          "exports valid currentmatch JSON",
          "rejects invalid import without changingmatch",
          "valid file preview preservescurrentmatch untilconfirmation",
          "confirmed import restoresdifferentposition paused",
          "close clears scrolllock",
        ];
        console.log(
          `${engine} ${width}x${height}: savedduels/export/invalidimport/preview/pausedrestore passed`,
        );
      } catch (error) {
        record.status = "failed";
        record.failedStep = step;
        record.error = String(error.stack || error);
        record.pageErrors = errors;
        await page.screenshot({
          path: `${dir}/${engine}-${width}-session-failure.png`,
        });
        console.error(`${engine} ${width} ${step}: ${error.stack}`);
      } finally {
        results.push(record);
        await writeFile(
          `${dir}/mobile-session-manager.json`,
          JSON.stringify(
            {
              status: results.some((r) => r.status === "failed")
                ? "failed"
                : "passed",
              results,
            },
            null,
            2,
          ) + "\n",
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
if (results.some((r) => r.status === "failed")) process.exitCode = 1;
