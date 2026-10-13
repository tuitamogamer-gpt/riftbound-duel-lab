// Real UI, fresh local sessions. Never writes to production or a user profile.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const output = process.env.QA_OUTPUT || "test-results/duel-experience";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match,
  );
const quiet = async (page) => {
  await page.mouse.move(0, 0);
  await page.locator(".card-preview").waitFor({ state: "hidden" });
};
async function fits(page, locator) {
  const box = await locator.boundingBox();
  const { width, height } = page.viewportSize();
  assert.ok(
    box &&
      box.x >= -1 &&
      box.y >= -1 &&
      box.x + box.width <= width + 1 &&
      box.y + box.height <= height + 1,
    `surface fits ${JSON.stringify(box)}`,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "no horizontal overflow",
  );
}
async function fixture(page, scenario) {
  await page.goto(
    `${origin}/tests/duel-experience-preview.html?scenario=${scenario}`,
  );
  await page.locator(".rift-hero .rift-link").click();
  await quiet(page);
}
try {
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    if (process.env.QA_WIDTH && width !== Number(process.env.QA_WIDTH))
      continue;
    for (const scenario of [
      "guided-start",
      "guided-deploy",
      "reaction",
      "debrief",
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width < 1000,
        isMobile: width < 1000,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const id = `${scenario}-${width}`;
      try {
        if (scenario === "guided-start") {
          await page.goto(origin);
          await page
            .getByRole("combobox", { name: "Starting player", exact: true })
            .selectOption("bot");
          await page
            .getByRole("button", { name: "Play with a guide", exact: true })
            .click();
          const guide = page.getByRole("dialog", {
            name: "Duel guide",
            exact: true,
          });
          await guide.waitFor();
          const before = await saved(page);
          assert.equal(before.currentPlayer, 0);
          assert.equal(before.botSettings.difficulty, "beginner");
          assert.equal(before.phase, "mulligan");
          await fits(page, guide);
          await page.waitForTimeout(400);
          assert.deepEqual(
            await saved(page),
            before,
            "guide never commits a move",
          );
          await guide
            .getByRole("button", { name: "Got it · keep playing", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Duel guide", exact: true })
            .click();
          await guide
            .getByRole("button", { name: "Turn off guide", exact: true })
            .click();
          await guide.waitFor({ state: "hidden" });
          assert.deepEqual(await saved(page), before);
          await page.reload();
          await page
            .getByRole("button", { name: "Resume duel", exact: true })
            .click();
          assert.equal(
            await page.locator(".duel-guide").count(),
            0,
            "guide disable survives reload",
          );
          assert.equal((await saved(page)).phase, "mulligan");
        } else if (scenario === "guided-deploy") {
          await fixture(page, "deploy");
          const guide = page.getByRole("dialog", {
            name: "Duel guide",
            exact: true,
          });
          await guide.waitFor();
          const before = await saved(page);
          await fits(page, guide);
          await page.screenshot({ path: `${output}/${id}-guide.png` });
          await guide
            .getByRole("button", {
              name: "Select Playful Phantom",
              exact: true,
            })
            .click();
          await quiet(page);
          assert.deepEqual(
            await saved(page),
            before,
            "guide source selection does not play the card",
          );
          assert.equal(
            await page.locator(".playmat").getAttribute("data-table-focus"),
            "board",
          );
          await fits(page, page.locator(".visual-controls"));
          if (height > 500) {
            assert.equal(
              await page.locator(".hand-tray .hand").isVisible(),
              false,
            );
            await page
              .getByRole("button", { name: "Browse hand", exact: true })
              .click();
            const sheet = page.locator(".hand-sheet");
            await sheet.waitFor();
            await sheet
              .getByRole("button", { name: "Close", exact: true })
              .click();
            assert.deepEqual(
              await saved(page),
              before,
              "collapsed hand remains inspectable",
            );
          }
          await page.screenshot({ path: `${output}/${id}-board.png` });
          await page.locator(".cancel-selection").click();
          assert.equal(
            await page.locator(".playmat").getAttribute("data-table-focus"),
            "hand",
          );
          assert.equal(
            await page.locator(".hand-tray .hand").isVisible(),
            true,
          );
          await fits(page, page.locator(".visual-controls"));
          // A normal click after the guide still selects first, then the decision commits.
          await page.locator(".hand-tray .game-card").first().click();
          await quiet(page);
          await page.locator(".context-action").first().click();
          await quiet(page);
          assert.ok((await saved(page)).revision > before.revision);
          assert.equal((await saved(page)).players[0].hand.length, 0);
        } else if (scenario === "reaction") {
          await fixture(page, "reaction");
          const guide = page.getByRole("dialog", {
            name: "Duel guide",
            exact: true,
          });
          await guide.waitFor();
          const before = await saved(page);
          assert.match(
            await guide.innerText(),
            /Respond before the chain resolves/,
          );
          await page.waitForTimeout(400);
          assert.deepEqual(
            await saved(page),
            before,
            "opponent effect does not resolve behind guide",
          );
          await guide
            .getByRole("button", { name: "Got it · keep playing", exact: true })
            .click();
          await page
            .getByRole("button", {
              name: "Select Wind Wall to respond",
              exact: true,
            })
            .click();
          assert.deepEqual(await saved(page), before);
          await fits(page, page.locator(".visual-controls"));
          await page.screenshot({ path: `${output}/${id}.png` });
        } else {
          await fixture(page, "result");
          const before = await saved(page);
          await page
            .getByRole("button", { name: "Review key moments", exact: true })
            .click();
          const recap = page.locator(".match-debrief");
          await recap.waitFor();
          assert.equal(
            await recap.locator(".debrief-scoring strong").first().innerText(),
            "1",
          );
          assert.match(await recap.innerText(), /7–0 → 8–0/);
          await recap.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${output}/${id}.png` });
          await recap
            .getByRole("button", { name: /Review turn.*The deciding moment/ })
            .click();
          const slider = page.getByRole("slider");
          assert.equal(
            await slider.inputValue(),
            await slider.getAttribute("max"),
          );
          assert.equal(
            await page
              .locator(".history-board")
              .evaluate((element) => element === document.activeElement),
            true,
          );
          assert.deepEqual(
            await saved(page),
            before,
            "recap does not modify the saved duel",
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
          );
        }
        assert.deepEqual(errors, []);
        reports.push({ id, status: "passed" });
        console.log(`PASS ${id}`);
      } catch (error) {
        await page.screenshot({ path: `${output}/${id}-failure.png` });
        reports.push({ id, status: "failed", error: String(error), errors });
        console.error(`FAIL ${id}: ${error}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(reports, null, 2));
}
assert.ok(reports.every((report) => report.status === "passed"));
