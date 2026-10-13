// Synthetic loopback sessions only; selection must never spend resources early.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const output = process.env.QA_OUTPUT || "test-results/movement-payment";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match,
  );
async function clearPreview(page) {
  await page.mouse.move(0, 0);
  await page.locator(".card-preview").waitFor({ state: "hidden" });
}
try {
  for (const [width, height] of [
    [1366, 768],
    [1280, 600],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width <= 1000,
      isMobile: width <= 1000,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/tests/movement-payment-preview.html`);
      await page
        .getByRole("button", { name: "Resume duel", exact: true })
        .click();
      await clearPreview(page);
      const before = await saved(page);
      const confirm = page.getByRole("button", {
        name: "Move 2 units",
        exact: true,
      });
      await confirm.waitFor();
      assert.match(await confirm.innerText(), /Pay 0 Energy · 1 Power/);
      assert.match(
        await confirm.innerText(),
        /After payment: 0 ready \/ 1 runes/,
      );
      assert.deepEqual(await saved(page), before);
      const description = await confirm.getAttribute("aria-describedby");
      assert.match(
        await page.locator(`[id="${description}"]`).innerText(),
        /1 Power/,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const dock = await page.locator(".visual-controls").boundingBox();
      const button = await confirm.boundingBox();
      assert.ok(
        dock.y >= 0 && dock.y + dock.height <= height + 1,
        "dock fits viewport",
      );
      assert.ok(
        button.y >= dock.y &&
          button.y + button.height <= dock.y + dock.height + 1,
        "payment and confirm are not clipped",
      );
      await page.screenshot({ path: `${output}/paid-movement-${width}.png` });
      if (width <= 1000)
        await page.locator('[data-mobile-location="base:0"]').click();
      const second = page.locator('[data-unit-id="second"] > .game-card');
      await second.click();
      await clearPreview(page);
      const free = page.getByRole("button", {
        name: "Move 1 unit",
        exact: true,
      });
      await free.waitFor();
      assert.equal(
        await free.locator(".decision-payment").count(),
        0,
        "removing a unit updates the tax",
      );
      assert.deepEqual(
        (await saved(page)).players[0].runes,
        before.players[0].runes,
      );
      await second.click();
      await clearPreview(page);
      await confirm.click();
      await clearPreview(page);
      await page.waitForFunction(
        () => {
          const save = JSON.parse(
            localStorage.getItem("riftbound-duel-save-v1"),
          );
          return !save.review && save.match.phase !== "move";
        },
        null,
        { timeout: 30000 },
      );
      const after = await saved(page);
      assert.equal(
        after.players[0].runes.length,
        1,
        "confirmation pays exactly one Power",
      );
      assert.equal(
        after.units.find((unit) => unit.id === "mover").location,
        "field:0",
      );
      assert.equal(
        after.units.find((unit) => unit.id === "second").location,
        "field:0",
      );
      assert.deepEqual(errors, []);
      reports.push({ width, height, status: "passed" });
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${width}.png` });
      reports.push({
        width,
        height,
        status: "failed",
        error: String(error),
        errors,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
assert.ok(reports.every((report) => report.status === "passed"));
