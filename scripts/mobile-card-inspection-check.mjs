// Isolated loopback fixtures: never replace the user's production save.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/mobile-card-inspection-check.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname),
);
const results = [];
await mkdir("test-results/mobile-card-inspection", { recursive: true });
const browsers = [["chromium", chromium, {}]];
if (process.env.WEBKIT_EXECUTABLE)
  browsers.push([
    "webkit",
    webkit,
    { executablePath: process.env.WEBKIT_EXECUTABLE },
  ]);
for (const [name, type, options] of browsers) {
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
      const fixture = async (mode = "main", paused = true) => {
        await page.goto(
          `${origin}/tests/mobile-table-preview.html?mode=${mode}&paused=${paused}`,
        );
        await page
          .getByRole("button", { name: "Resume duel", exact: true })
          .tap();
        await page.locator(".hand-card-wrap").first().waitFor();
      };
      const detail = page.locator(".card-detail");
      const close = async () => {
        await detail.locator(".close-button").tap();
        await detail.waitFor({ state: "detached" });
      };
      const assertReader = async () => {
        await detail.waitFor();
        const bounds = await detail.boundingBox();
        assert.ok(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.width <= width + 1 &&
            bounds.height <= height + 1,
        );
        assert.equal(
          await detail
            .locator(".card-detail-body")
            .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          true,
        );
        const art = await detail.locator(".game-card").boundingBox();
        if (width < height)
          assert.ok(
            art.width >= width - 48,
            "portrait art fills available width",
          );
        await detail.locator(".card-detail-body").evaluate((e) => {
          e.scrollTop = e.scrollHeight;
        });
        const button = await detail.locator(".close-button").boundingBox();
        assert.ok(
          button.y >= 0 &&
            button.y + button.height <= height &&
            button.width >= 44 &&
            button.height >= 44,
          "close stays visible after scrolling",
        );
        await detail.locator(".card-detail-body").evaluate((e) => {
          e.scrollTop = 0;
        });
      };
      await fixture();
      await page.locator(".hand-card-wrap .card-info-button").first().tap();
      await assertReader();
      await page.screenshot({
        path: `test-results/mobile-card-inspection/${name}-${width}x${height}-reader.png`,
      });
      await close();
      await page.locator('[data-mobile-location="base:0"]').tap();
      const setup = page.locator(".own-base-panel .champion-zone");
      assert.equal(
        await setup.locator(".setup-card-copy").first().isVisible(),
        false,
      );
      assert.ok(
        (await setup.locator(".setup-card").first().boundingBox()).width <= 96,
      );
      await setup.locator(".setup-mobile-inspect").first().tap();
      assert.equal(
        await detail.locator(".card-detail-state").innerText(),
        "Ready",
      );
      await close();
      await page.locator(".own-base-panel .unit-info").first().tap();
      await assertReader();
      await close();
      assert.equal(
        await page
          .locator(".own-base-panel .unit-info")
          .first()
          .evaluate((e) => getComputedStyle(e).opacity),
        "1",
      );
      await page.screenshot({
        path: `test-results/mobile-card-inspection/${name}-${width}x${height}-base.png`,
      });
      await page
        .getByRole("button", { name: "Browse hand", exact: true })
        .tap();
      await page.locator(".hand-sheet-inspect").first().tap();
      await assertReader();
      await page.keyboard.press("Escape");
      await detail.waitFor({ state: "detached" });
      assert.equal(
        await page.locator(".hand-sheet").isVisible(),
        true,
        "closing nested details preserves hand sheet",
      );
      assert.equal(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
      await page.locator(".hand-sheet-close").tap();
      assert.equal(await page.locator(".hand-sheet").count(), 0);
      await fixture("hidden");
      await page.locator('[data-mobile-location="field:0"]').tap();
      await page.locator(".hidden-card-inspect").first().tap();
      await assertReader();
      await close();
      assert.equal(
        await page.locator(".hidden-card:disabled[data-card-preview]").count(),
        0,
        "private enemy Hidden has no readable identity",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      assert.equal(
        await page.locator(".card-preview").count(),
        0,
        "touch never leaves a hover window over the table",
      );
      assert.deepEqual(errors, []);
      results.push(
        `${name} ${width}x${height}: inspection, nested close, compact setup, Hidden privacy, no overflow`,
      );
      console.log(`${name} ${width}x${height} passed`);
      await context.close();
    }
    // Real touch input verifies that reading cannot commit a legal hand selection.
    if (name === "chromium") {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.goto(
        `${origin}/tests/mobile-table-preview.html?mode=main&paused=false`,
      );
      await page
        .getByRole("button", { name: "Resume duel", exact: true })
        .tap();
      const card = page.locator(".hand-card-wrap .game-card").first();
      await card.waitFor();
      const cdp = await context.newCDPSession(page);
      const rect = await card.boundingBox();
      const point = { x: rect.x + rect.width / 2, y: rect.y + 16, id: 1 };
      const touch = (type, touchPoints) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
      const selectedBefore = await card.getAttribute("aria-pressed");
      await touch("touchStart", [point]);
      await page.locator(".card-detail").waitFor();
      await touch("touchEnd", []);
      await page.waitForTimeout(100);
      assert.equal(
        await page.locator(".card-detail").count(),
        1,
        "hold release keeps reader open",
      );
      assert.equal(
        await card.getAttribute("aria-pressed"),
        selectedBefore,
        "hold release did not select card",
      );
      await page.locator(".card-detail .close-button").tap();
      // A swipe cancels the hold and remains a hand scroll.
      await touch("touchStart", [point]);
      await touch("touchMove", [{ ...point, x: point.x + 36 }]);
      await page.waitForTimeout(500);
      await touch("touchEnd", []);
      assert.equal(await page.locator(".card-detail").count(), 0);
      // Multi-touch before a hold also cancels reading.
      await touch("touchStart", [point]);
      await touch("touchStart", [point, { ...point, id: 2, x: point.x + 40 }]);
      await page.waitForTimeout(500);
      await touch("touchEnd", []);
      assert.equal(await page.locator(".card-detail").count(), 0);
      // A second finger after opening must not re-enable the held card's click.
      await touch("touchStart", [point]);
      await page.locator(".card-detail").waitFor();
      await touch("touchStart", [point, { ...point, id: 2, x: point.x + 40 }]);
      await touch("touchEnd", []);
      assert.equal(await card.getAttribute("aria-pressed"), selectedBefore);
      assert.equal(await page.locator(".card-detail").count(), 1);
      await page.locator(".card-detail .close-button").tap();
      // An ordinary tap still selects and never plays the card directly.
      await card.tap();
      assert.equal(await card.getAttribute("aria-pressed"), "true");
      assert.equal(await page.locator(".hand-card-wrap").count(), 12);
      results.push(
        "Chromium real touch: hold, release, swipe, multi-touch, ordinary selection",
      );
      console.log("Chromium touch gestures passed");
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
console.log(results.join("\n"));
