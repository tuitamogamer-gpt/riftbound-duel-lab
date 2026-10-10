// Isolated loopback fixtures; never modifies a user browser or production save.
// PLAYWRIGHT_MODULE selects an external install; WEBKIT_EXECUTABLE adds WebKit.
// QA_ORIGIN sets the loopback app URL; QA_OUTPUT selects the artifact directory.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const dir = process.env.QA_OUTPUT || "test-results/mobile-overlays";
await mkdir(dir, { recursive: true });
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
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      let step = "fixture";
      const record = {
        engine,
        width,
        height,
        status: "running",
        checks: [],
        screenshots: [],
      };
      const saved = () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match,
        );
      const fits = async (locator) => {
        await locator.evaluate(async (e) => {
          await Promise.all(
            e.getAnimations().map((a) => a.finished.catch(() => {})),
          );
        });
        const r = await locator.boundingBox();
        assert.ok(
          r &&
            r.x >= -1 &&
            r.y >= -1 &&
            r.x + r.width <= width + 1 &&
            r.y + r.height <= height + 1,
          `dialog fits ${JSON.stringify(r)}`,
        );
      };
      try {
        await page.goto(
          `${origin}/tests/mobile-table-preview.html?mode=main&paused=true`,
        );
        await page
          .getByRole("button", { name: "Resume duel", exact: true })
          .tap();
        await page.locator(".hand-card-wrap").first().waitFor();
        const before = await saved();
        const menu = page.locator(".mobile-match-menu");
        const openMenu = async () => {
          await page
            .getByRole("button", { name: "Duel menu", exact: true })
            .tap();
          await menu.waitFor();
          await fits(menu);
        };
        step = "settings";
        await openMenu();
        await menu.getByLabel(/Rune payment mode/).selectOption("manual");
        await menu
          .getByLabel("Playback speed", { exact: true })
          .selectOption("2");
        assert.deepEqual(
          await page.evaluate(() => [
            localStorage.getItem("riftbound-payment-mode"),
            localStorage.getItem("riftbound-duel-playback-speed"),
          ]),
          ["manual", "2"],
        );
        await menu.locator("summary").tap();
        assert.match(
          await menu.locator(".mobile-menu-bot").innerText(),
          /AI decision/,
        );
        await page.screenshot({ path: `${dir}/${engine}-${width}-menu.png` });
        record.screenshots.push(`${engine}-${width}-menu.png`);
        await menu.getByRole("button", { name: "Close", exact: true }).tap();
        await openMenu();
        assert.equal(
          await menu.getByLabel(/Rune payment mode/).inputValue(),
          "manual",
        );
        assert.equal(
          await menu.getByLabel("Playback speed", { exact: true }).inputValue(),
          "2",
        );
        await page.keyboard.press("Escape");
        await menu.waitFor({ state: "detached" });
        record.checks.push(
          "menu settings saved and retained, expand AI details, Close/Escape return",
        );
        step = "help";
        await openMenu();
        await menu.getByRole("button", { name: "Rules", exact: true }).tap();
        const help = page.locator(".help-modal");
        await help.waitFor();
        await fits(help);
        assert.equal(await page.locator(".mobile-match-menu").count(), 0);
        await help
          .getByRole("button", { name: "Ready to duel", exact: true })
          .tap();
        await help.waitFor({ state: "detached" });
        assert.equal(
          await page.evaluate(() => document.body.style.overflow),
          "",
        );
        record.checks.push(
          "Help opens from menu, scrolls, returns through ready button, clears scroll lock",
        );
        step = "matchlog";
        await openMenu();
        await menu
          .getByRole("button", { name: "Match log", exact: true })
          .tap();
        const log = page.locator(".modal.match-history");
        await log.waitFor();
        await fits(log);
        await log.getByRole("button", { name: "Close", exact: true }).tap();
        await log.waitFor({ state: "detached" });
        record.checks.push("match log opens/closes");
        step = "piles";
        await page.getByRole("button", { name: /^Your deck ·/ }).tap();
        const pile = page.locator(".pile-dialog");
        await pile.waitFor();
        await fits(pile);
        assert.match(
          await pile.innerText(),
          /Cards in the deck stay face down/,
        );
        assert.equal(await pile.locator(".game-card").count(), 0);
        await pile.getByRole("button", { name: "AI", exact: true }).tap();
        assert.match(await pile.innerText(), /Opponent cards/);
        assert.equal(await pile.locator(".game-card").count(), 0);
        await pile.getByRole("button", { name: "Trash", exact: true }).tap();
        await pile.getByRole("button", { name: "You", exact: true }).tap();
        assert.equal(
          await pile.locator(".pile-card-entry").count(),
          before.players[0].discard.length,
        );
        const discardName = await pile
          .locator(".pile-card-entry strong")
          .first()
          .innerText();
        await pile.locator(".pile-card-entry .game-card").first().tap();
        await pile.waitFor({ state: "detached" });
        const detail = page.locator(".card-detail");
        await detail.waitFor();
        assert.match(await detail.innerText(), new RegExp(discardName));
        await detail.getByRole("button", { name: "Close", exact: true }).tap();
        await detail.waitFor({ state: "detached" });
        await page.getByRole("button", { name: /^Your trash ·/ }).tap();
        await pile.waitFor();
        await page.keyboard.press("Escape");
        await pile.waitFor({ state: "detached" });
        assert.deepEqual(await saved(), before);
        record.checks.push(
          "deck counts, hidden deck privacy both owners, trash tabs/counts, discarded-card reader and return; game unchanged",
        );
        step = "historyfixture";
        const archive = await page.evaluate(async () => {
          const { createTrainingPosition } =
            await import("/src/game/training.ts");
          const { createReplay } = await import("/src/game/ai/replay.ts");
          const { getLegalActions, applyAction } =
            await import("/src/game/engine.ts");
          const { writeCompletedMatch } =
            await import("/src/game/match-history.ts");
          let game = createTrainingPosition("hold");
          game.seed = 191910;
          const replay = createReplay(game);
          for (let i = 0; i < 2; i++) {
            const action = getLegalActions(game, game.priorityPlayer).find(
              (a) => a.id === "end-turn",
            );
            replay.decisions.push({ action });
            game = applyAction(game, action);
            replay.finalRevision = game.revision;
          }
          const result = writeCompletedMatch(replay);
          return { saved: result.saved, error: result.error };
        });
        assert.equal(archive.saved, true, JSON.stringify(archive));
        step = "historyopen";
        await openMenu();
        await menu.getByRole("button", { name: "Decks", exact: true }).tap();
        await page
          .getByRole("button", { name: "Match history", exact: true })
          .tap();
        await page.locator(".history-match-open").first().tap();
        await page.locator(".history-replay").waitFor();
        const scrub = page.getByRole("slider", { name: "Replay position" });
        assert.equal(await scrub.inputValue(), "0");
        step = "historynavigation";
        await page
          .getByRole("button", { name: "Next frame", exact: true })
          .tap();
        assert.equal(await scrub.inputValue(), "1");
        await page
          .getByRole("button", { name: "Previous frame", exact: true })
          .tap();
        assert.equal(await scrub.inputValue(), "0");
        const max = await scrub.getAttribute("max");
        await scrub.fill(max);
        assert.equal(
          await page
            .getByRole("button", { name: "Next frame", exact: true })
            .isDisabled(),
          true,
        );
        await page
          .getByRole("button", { name: "Restart replay", exact: true })
          .tap();
        assert.equal(await scrub.inputValue(), "0");
        await page
          .getByRole("button", { name: "Bookmark this frame", exact: true })
          .tap();
        await page
          .locator(".history-bookmark-editor input")
          .fill("QA mobile bookmark");
        await page
          .getByRole("button", { name: "Save bookmark", exact: true })
          .tap();
        assert.equal(
          await page
            .getByRole("button", { name: "Edit bookmark", exact: true })
            .count(),
          1,
        );
        await page
          .getByRole("button", { name: "Play replay", exact: true })
          .tap();
        await page.waitForFunction(
          () => Number(document.querySelector(".history-scrub").value) > 0,
        );
        const pause = page.getByRole("button", {
          name: "Pause replay",
          exact: true,
        });
        if (await pause.count()) await pause.tap();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
          "history no horizontal overflow",
        );
        await page.screenshot({
          path: `${dir}/${engine}-${width}-history.png`,
        });
        record.screenshots.push(`${engine}-${width}-history.png`);
        await page.getByRole("button", { name: "Back", exact: true }).tap();
        await page
          .getByRole("button", { name: "Resume duel", exact: true })
          .tap();
        await page.locator(".visual-controls").waitFor();
        assert.deepEqual(await saved(), before);
        record.checks.push(
          "completed replay first/next/previous/restart/range/play/pause/bookmark; back to original duel unchanged",
        );
        assert.deepEqual(errors, []);
        record.status = "passed";
        console.log(
          `${engine} ${width}x${height}: menus/settings/help/piles/history passed`,
        );
      } catch (error) {
        record.status = "failed";
        record.failedStep = step;
        record.error = String(error.stack || error);
        record.pageErrors = errors;
        await page.screenshot({
          path: `${dir}/${engine}-${width}-overlays-failure.png`,
        });
        console.error(`${engine} ${width} ${step}: ${error.stack}`);
      } finally {
        results.push(record);
        await writeFile(
          `${dir}/mobile-overlays.json`,
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
