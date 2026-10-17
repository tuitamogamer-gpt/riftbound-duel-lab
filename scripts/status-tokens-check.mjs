// Uses the synthetic fixture on a separate origin from the user's saved match.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/status-tokens-check.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
const fixtureOrigin = process.env.FIXTURE_ORIGIN || origin;
for (const url of [origin, fixtureOrigin])
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  );
const screenshots = new URL("../test-results/status-tokens/", import.meta.url);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const showZone = async (location) => {
  const tab = page.locator(`[data-mobile-location="${location}"]`);
  if (await tab.isVisible()) {
    await tab.click();
    await page.mouse.move(0, 0);
  }
};
const fixture = async (query = "") => {
  await page.goto(`${fixtureOrigin}/tests/status-tokens-preview.html${query}`);
  await page
    .getByRole("button", { name: "Resume duel", exact: true })
    .waitFor();
  if (new URL(fixtureOrigin).origin !== new URL(origin).origin) {
    const entries = await page.evaluate(() => Object.entries(localStorage));
    await page.goto(origin);
    await page.evaluate((items) => {
      localStorage.clear();
      for (const [key, value] of items) localStorage.setItem(key, value);
    }, entries);
    await page.reload();
  }
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator(".playmat").waitFor();
  await showZone("base:0");
  await page.locator('[data-unit-id="ready-stunned"] > .game-card').waitFor();
};
const unitCard = (id) => page.locator(`[data-unit-id="${id}"] > .game-card`);
const readStatuses = async (card) =>
  JSON.parse((await card.getAttribute("data-card-statuses")) || "[]");
const statusLabel = (status) =>
  status.label.replace(/\{([^}]+)\}/g, (match, key) =>
    String(status.values?.[key] ?? match),
  );
const assertFullStatuses = async (container, statuses, context) => {
  for (const status of statuses) {
    assert.equal(
      await container.locator(`[data-status-id="${status.id}"]`).count(),
      1,
      `${context}: full status ${status.id} is shown`,
    );
    assert.ok(
      (await container.innerText()).includes(statusLabel(status)),
      `${context}: full label ${statusLabel(status)} is shown`,
    );
  }
};
const assertNoOverflow = async (width, height) => {
  assert.deepEqual(
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]),
    [width, height],
    `${width}x${height}: no page overflow`,
  );
};
try {
  await mkdir(screenshots, { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await fixture();
    const ready = unitCard("ready-stunned");
    const exhausted = unitCard("exhausted-stunned");
    const stacked = unitCard("stacked-statuses");
    const gear = page.locator(
      '[data-gear-id="temporary-empowered-gear"] > .game-card',
    );
    for (const card of [ready, exhausted]) {
      await showZone(card === ready ? "base:0" : "field:0");
      const stunned = card.locator(
        '.card-status-token[data-status-id="stunned"]',
      );
      assert.ok(
        await stunned.isVisible(),
        `${name}: Stunned is a visible card token`,
      );
      assert.match(
        await card.getAttribute("aria-label"),
        /Stunned/i,
        `${name}: Stunned is included in the card's accessible name`,
      );
    }
    assert.equal(
      await ready.locator(".exhausted-token").count(),
      0,
      `${name}: a ready stunned unit does not acquire an exhausted marker`,
    );
    assert.equal(
      await exhausted.locator(".exhausted-token").count(),
      1,
      `${name}: Stunned and Exhausted remain distinct visible states`,
    );
    const effects = await readStatuses(stacked);
    await showZone("field:1");
    assert.ok(
      effects.length >= 4,
      `${name}: all stacked effects are provided to the preview`,
    );
    for (const id of ["buff", "might", "prevent-damage", "move-locked"])
      assert.ok(
        effects.some((status) => status.id === id),
        `${name}: active ${id} metadata`,
      );
    const tokens = stacked.locator(".card-status-token");
    assert.ok(
      (await tokens.count()) <= 2,
      `${name}: stacked effects have compact on-card tokens`,
    );
    assert.equal(
      await stacked.locator(".status-token-overflow").innerText(),
      `+${effects.length - 2}`,
      `${name}: additional effects are represented by an overflow count`,
    );
    for (const status of effects)
      assert.ok(
        (await stacked.getAttribute("aria-label")).includes(
          statusLabel(status),
        ),
        `${name}: full active effects remain accessible on the card`,
      );
    assert.ok(
      (await readStatuses(gear)).length >= 2,
      `${name}: temporary and empowered gear both have status metadata`,
    );
    await assertNoOverflow(width, height);
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images]
        .filter((image) => {
          const bounds = image.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.bottom > 0 &&
            bounds.top < innerHeight
          );
        })
        .every((image) => image.complete),
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}.png`, screenshots)),
      animations: "disabled",
    });

    // Keyboard focus opens the same artwork-only preview; statuses remain on the card and in its details.
    await stacked.focus();
    await page.locator(".card-preview").waitFor();
    assert.equal(await page.locator(".card-preview img").count(), 1);
    assert.equal(
      await page.locator(".card-preview").innerText(),
      "",
      `${name}: focus preview contains artwork only`,
    );
    await assertNoOverflow(width, height);
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}-preview.png`, screenshots)),
      animations: "disabled",
    });

    // Status metadata can change without duplicating game information over the artwork.
    const imageSrc = await page
      .locator(".card-preview img")
      .getAttribute("src");
    await stacked.evaluate(
      (card, statuses) => {
        card.dataset.cardStatuses = JSON.stringify(statuses);
      },
      [effects.at(-1)],
    );
    assert.equal(
      await page.locator(".card-preview img").getAttribute("src"),
      imageSrc,
    );
    assert.equal(await page.locator(".card-preview").innerText(), "");
    assert.ok(
      await stacked.evaluate((card) => document.activeElement === card),
      `${name}: updating status metadata preserves keyboard focus`,
    );
    await page.keyboard.press("Escape");
    await showZone("base:0");
    const cardBounds = await ready.boundingBox();
    const tokenBounds = await ready
      .locator('[data-status-id="stunned"]')
      .boundingBox();
    await ready.click({
      position: {
        x: tokenBounds.x - cardBounds.x + tokenBounds.width / 2,
        y: tokenBounds.y - cardBounds.y + tokenBounds.height / 2,
      },
    });
    assert.equal(
      await ready.getAttribute("aria-pressed"),
      "true",
      `${name}: visible status tokens do not block card selection`,
    );
    await page.mouse.move(0, 0);
    await page.keyboard.press("Escape");
    await showZone("field:0");
    await exhausted.hover();
    await page.locator(".card-preview").waitFor();
    assert.equal(await page.locator(".card-preview img").count(), 1);
    assert.equal(
      await page.locator(".card-preview").innerText(),
      "",
      `${name}: hover remains artwork-only even for a stunned unit`,
    );
    await page.keyboard.press("Escape");
    await showZone("field:1");
    await page.locator('[data-unit-id="stacked-statuses"] .unit-info').click();
    await page.locator(".card-detail").waitFor();
    await assertFullStatuses(
      page.locator(".card-detail .card-status-tokens.is-expanded"),
      effects,
      `${name} unit detail`,
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}-details.png`, screenshots)),
      animations: "disabled",
    });
    await page.locator(".card-detail .close-button").click();
    await showZone("base:0");
    await page
      .locator('[data-gear-id="temporary-empowered-gear"] .gear-inspect')
      .click();
    await page.locator(".card-detail").waitFor();
    await assertFullStatuses(
      page.locator(".card-detail .card-status-tokens.is-expanded"),
      await readStatuses(gear),
      `${name} gear detail`,
    );
    await page.locator(".card-detail .close-button").click();

    await fixture("?plain");
    assert.equal(
      await page
        .locator(".unit-wrap .card-status-token, .gear-slot .card-status-token")
        .count(),
      0,
      `${name}: clearing effects removes the status tokens`,
    );
    await assertNoOverflow(width, height);
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: status visibility, exhaustion distinction, compact overflow, artwork-only focus/hover previews, live status metadata, token-area card selection, unit/gear detail views, cleared effects and two viewport sizes. Screenshots: ${fileURLToPath(screenshots)}`,
  );
} finally {
  await browser.close();
}
