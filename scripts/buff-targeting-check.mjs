// Loopback-only fixture; user production saves are never modified.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
await mkdir("test-results/buff-targeting", { recursive: true });
const engines = [["chromium", chromium, {}]];
if (process.env.WEBKIT_EXECUTABLE)
  engines.push([
    "webkit",
    webkit,
    { executablePath: process.env.WEBKIT_EXECUTABLE },
  ]);
for (const [name, type, options] of engines) {
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
      await page.goto(
        `${origin}/tests/mobile-table-preview.html?mode=main&paused=false`,
      );
      await page
        .getByRole("button", { name: "Resume duel", exact: true })
        .tap();
      await page.locator(".hand-card-wrap .game-card").nth(2).tap();
      const bar = page.locator(".visual-controls");
      assert.match(await bar.innerText(), /Discipline/);
      assert.match(await bar.innerText(), /\+2/);
      assert.equal(
        await bar
          .locator('.context-action[data-target-id="mobile-own-base-0"]')
          .count(),
        1,
      );
      assert.match(
        await bar.locator(".decision-target-location").innerText(),
        /You.*Your base/,
      );
      await page
        .getByRole("button", { name: "More options", exact: true })
        .tap();
      assert.equal(
        await bar
          .locator('.context-action[data-target-id="mobile-own-field-0"]')
          .count(),
        1,
      );
      assert.match(
        await bar.locator(".decision-target-location").innerText(),
        /You.*Left battlefield/,
      );
      assert.equal(
        await page
          .locator('[data-unit-id="mobile-enemy-field-0"] > .game-card')
          .getAttribute("aria-pressed"),
        "false",
      );
      assert.equal(
        await page
          .locator('[data-unit-id="mobile-enemy-base-0"] > .game-card')
          .getAttribute("aria-pressed"),
        "false",
      );
      await page.locator('[data-mobile-location="field:1"]').tap();
      const enemy = page.locator(
        '[data-unit-id="mobile-enemy-field-0"] > .game-card',
      );
      const face = await enemy.boundingBox(),
        token = await enemy.locator(".exhausted-token").boundingBox();
      assert.ok(
        token.x > face.x + face.width / 2 && token.y > face.y + face.height / 2,
        "Exhausted lower-right",
      );
      assert.ok(
        token.x + token.width <= face.x + face.width &&
          token.y + token.height <= face.y + face.height,
        "Exhausted inside card",
      );
      await page.locator('[data-mobile-location="field:0"]').tap();
      await page
        .locator('[data-unit-id="mobile-own-field-0"] > .game-card')
        .tap();
      assert.match(
        await bar.locator(".decision-target-summary").innerText(),
        /Playful Phantom/,
      );
      assert.equal(
        await page.locator(".hand-card-wrap").count(),
        12,
        "board tap selects a buff target without casting",
      );
      const chosen = bar.locator(
        '.context-action[data-target-id="mobile-own-field-0"]',
      );
      assert.equal(await chosen.count(), 1);
      const nameBox = await chosen
        .locator(".decision-target strong")
        .boundingBox();
      const meta = await chosen
        .locator(".decision-target-location")
        .boundingBox();
      assert.ok(
        nameBox.width > 80 && nameBox.height > 0 && meta.height > 0,
        "target name and owner/location are readable",
      );
      const controls = await bar.boundingBox();
      assert.ok(
        controls.y >= 0 && controls.y + controls.height <= height + 1,
        "all controls fit viewport",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.screenshot({
        path: `test-results/buff-targeting/${name}-${width}x${height}.png`,
      });
      await chosen.tap();
      await page.waitForFunction(() => {
        const saved = JSON.parse(
          localStorage.getItem("riftbound-duel-save-v1") || "{}",
        );
        return (
          saved.match?.stack.some(
            (item) =>
              item.cardId === "ogn-058-298" &&
              item.targetId === "mobile-own-field-0",
          ) ||
          saved.match?.units.some(
            (unit) =>
              unit.id === "mobile-own-field-0" && unit.temporaryMight === 2,
          )
        );
      });
      assert.deepEqual(errors, []);
      console.log(
        `${name} ${width}x${height}: friendly options, readable target/effect, board confirmation, correct cast, lower-right Exhausted`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
