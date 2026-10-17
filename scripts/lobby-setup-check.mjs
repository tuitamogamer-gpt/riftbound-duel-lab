// The compact deck gallery must shorten setup without hiding a chosen deck.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const out = process.env.QA_OUTPUT || "test-results/lobby-setup";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const reports = [];
try {
  for (const [width, height, locale] of [
    [320, 640, "en"],
    [390, 844, "en"],
    [844, 390, "en"],
    [1366, 768, "en"],
    [390, 844, "sr"],
    [390, 844, "it"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 1000,
      hasTouch: width < 1000,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((language) => {
      localStorage.clear();
      localStorage.setItem("riftbound-duel-language", language);
    }, locale);
    try {
      await page.goto(origin);
      await page.locator(".rift-champion").first().waitFor();
      const cards = page.locator(".rift-champion");
      const disclosure = page.locator(".rift-champion-disclosure > button");
      const compact = width <= 800 || (width <= 1000 && height <= 500);
      const collapsedCount = compact ? 4 : 6;
      const initialCount = await cards.count();
      {
        assert.equal(initialCount, collapsedCount);
        const search = page.locator(".rift-deck-search input");
        await search.fill("jinx");
        assert.ok((await cards.count()) > 0);
        assert.ok(
          (await cards.allTextContents()).every((text) => /jinx/i.test(text)),
        );
        await search.fill("no-matching-champion");
        assert.equal(await cards.count(), 0);
        await page.locator(".rift-empty button").click();
        assert.equal(await search.inputValue(), "");
        assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
        await disclosure.click();
        assert.equal(await disclosure.getAttribute("aria-expanded"), "true");
        const fullCount = await cards.count();
        assert.ok(fullCount > collapsedCount);
        // Select the final card, collapse, then select it through the dropdown.
        // Both paths must retain one visible selected card in the summary.
        await cards.last().click();
        const select = page.locator(".rift-player-select select");
        const lateChoice = await select.inputValue();
        await page.mouse.move(0, 0);
        await disclosure.click();
        assert.equal(await cards.count(), collapsedCount);
        assert.equal(
          await cards.locator(".rift-selection-check").count(),
          collapsedCount,
        );
        assert.equal(
          await page.locator(".rift-champion.is-selected").count(),
          1,
        );
        const firstChoice = await select
          .locator("option")
          .first()
          .getAttribute("value");
        await select.selectOption(firstChoice);
        await select.selectOption(lateChoice);
        assert.equal(await cards.count(), collapsedCount);
        assert.equal(
          await page.locator(".rift-champion.is-selected").count(),
          1,
        );

        await disclosure.click();
        await page
          .locator(".rift-collection-select select")
          .selectOption({ index: 1 });
        assert.ok(
          (await cards.count()) <= collapsedCount,
          "Changing groups collapses the gallery",
        );
        // The empty imported collection must still offer its original import action.
        await page
          .locator(".rift-collection-select select")
          .selectOption("Moji");
        assert.equal(await cards.count(), 0);
        assert.equal(await page.locator(".rift-empty button").count(), 1);
        assert.equal(await disclosure.count(), 0);
        await page
          .locator(".rift-collection-select select")
          .selectOption("Precon");
        assert.equal(await cards.count(), collapsedCount);
        assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
      }
      await page.mouse.move(0, 0);
      await page.locator(".rift-deck-browser").scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const grid = document
          .querySelector(".rift-champions")
          .getBoundingClientRect();
        return {
          gridHeight: grid.height,
          gridWidth: grid.width,
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      assert.ok(geometry.overflow <= 1, "Lobby fits the viewport");
      if (width <= 390)
        assert.ok(geometry.gridHeight < 500, "Four cards fit in two rows");
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${out}/lobby-${width}-${locale}.png`,
        fullPage: true,
      });
      reports.push({
        width,
        height,
        locale,
        initialCount,
        ...geometry,
        errors,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(reports, null, 2));
}
console.log(JSON.stringify(reports, null, 2));
