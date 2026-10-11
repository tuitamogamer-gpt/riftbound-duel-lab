// Isolated browser checks for the in-game design changes; no production saves.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const output = process.env.QA_OUTPUT || "test-results/match-clarity";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match,
  );
async function fixture(page, scenario) {
  await page.goto(
    `${origin}/tests/interaction-audit-preview.html?scenario=${scenario}`,
  );
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator(".visual-controls").waitFor();
  await page.mouse.move(0, 0);
  await page.locator(".card-preview").waitFor({ state: "hidden" });
}
async function fits(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "no horizontal page overflow",
  );
  const viewport = page.viewportSize();
  const dock = await page.locator(".visual-controls").boundingBox();
  assert.ok(
    dock.y >= 0 && dock.y + dock.height <= viewport.height + 1,
    "decisions fit the viewport",
  );
  for (const selector of [
    ".context-action",
    ".end-turn",
    ".confirm-decision",
    ".reaction-response",
  ]) {
    for (const button of await page.locator(selector).all()) {
      if (!(await button.isVisible())) continue;
      const bounds = await button.boundingBox();
      assert.ok(
        bounds.y >= dock.y - 1 &&
          bounds.y + bounds.height <= dock.y + dock.height + 1,
        `${selector} is not clipped by the dock`,
      );
    }
  }
}
try {
  for (const [width, height] of [
    [1366, 768],
    [1440, 900],
    [1280, 600],
    [390, 844],
    [320, 640],
    [844, 390],
  ]) {
    if (process.env.QA_WIDTH && width !== Number(process.env.QA_WIDTH))
      continue;
    for (const scenario of ["opening", "reaction", "damage"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: width <= 1000,
        isMobile: width <= 1000,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const id = `${scenario}-${width}x${height}`;
      try {
        if (scenario === "opening") {
          await page.goto(origin);
          await page
            .getByRole("combobox", { name: "Starting player", exact: true })
            .selectOption("you");
          await page
            .getByRole("button", { name: "START DUEL", exact: true })
            .click();
          const hand = page.locator(".hand-tray.is-opening");
          await hand.waitFor();
          const cards = hand.locator(".hand .game-card");
          assert.equal(await cards.count(), 4);
          const before = await saved(page);
          await cards.nth(0).click();
          await cards.nth(1).click();
          await page
            .getByRole("button", { name: "Replace 2 cards", exact: true })
            .waitFor();
          assert.deepEqual(
            await saved(page),
            before,
            "mulligan selection does not commit early",
          );
          const card = await cards.first().boundingBox();
          if (width >= 1001)
            assert.ok(card.height >= 230, "large desktop opening cards");
          if (width <= 800 && height >= 600)
            assert.ok(card.height >= 140, "readable portrait opening cards");
        } else if (scenario === "reaction") {
          await fixture(page, scenario);
          const before = await saved(page);
          assert.match(
            await page.locator(".reaction-threat").innerText(),
            /Hextech Ray.*Playful Phantom/s,
          );
          assert.match(
            await page.locator(".end-turn").getAttribute("class"),
            /secondary-ending/,
          );
          await fits(page);
          await page
            .getByRole("button", {
              name: "Select Wind Wall to respond",
              exact: true,
            })
            .click();
          assert.deepEqual(
            await saved(page),
            before,
            "response shortcut only selects the source",
          );
          assert.match(
            await page.locator(".decision-payment").innerText(),
            /Pay 3 Energy · 2 Power.*After payment: 10 ready \/ 10 runes/s,
          );
        } else {
          await fixture(page, scenario);
          if (height > 500)
            assert.ok(
              (await page.locator(".hand-tray").boundingBox()).height <= 56,
              "empty hand gives space back to the board",
            );
          assert.equal(
            await page
              .getByRole("button", { name: "Browse hand", exact: true })
              .count(),
            0,
          );
          if (width <= 800) {
            assert.equal(
              await page.locator(".context-action.has-target").count(),
              2,
              "both damage targets are visible",
            );
            assert.equal(
              await page
                .getByRole("button", { name: "More options", exact: true })
                .count(),
              0,
            );
          }
          const target = page.locator(
            '[data-unit-id="practice-shielded"] .unit-assignment',
          );
          assert.match(
            await target.innerText(),
            /Assigned 0 \/ 6.*Prevents 2/s,
          );
          await page
            .locator('.context-action[data-target-id="practice-shielded"]')
            .click();
          await page.mouse.move(0, 0);
          await page.waitForFunction(() =>
            document
              .querySelector(
                '[data-unit-id="practice-shielded"] .unit-assignment',
              )
              ?.textContent.includes("Assigned 6 / 6"),
          );
          assert.equal((await saved(page)).combat.remaining[0], 2);
          await page.locator(".playing-indicator").waitFor({ state: "hidden" });
        }
        await page.mouse.move(0, 0);
        await fits(page);
        assert.deepEqual(errors, [], "no browser runtime errors");
        await page.screenshot({
          path: `${output}/${id}.png`,
          animations: "disabled",
        });
        reports.push({ id, status: "passed" });
        console.log(`PASS ${id}`);
      } catch (error) {
        await page
          .screenshot({ path: `${output}/${id}-failed.png` })
          .catch(() => {});
        reports.push({ id, status: "failed", error: error.message, errors });
        console.error(`FAIL ${id}: ${error.message}`);
      } finally {
        await context.close();
        await writeFile(
          `${output}/results.json`,
          JSON.stringify(reports, null, 2),
        );
      }
    }
  }
} finally {
  await browser.close();
}
if (reports.some((entry) => entry.status === "failed")) process.exitCode = 1;
