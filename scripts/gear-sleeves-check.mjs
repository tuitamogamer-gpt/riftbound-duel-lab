// Uses a separate QA origin so the user's saved match is never overwritten.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/gear-sleeves-check.mjs
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const fixture = async (query = "") => {
  await page.goto(`${origin}/tests/gear-sleeves-preview.html${query}`);
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator(".gear-slot").first().waitFor();
};
try {
  await fixture();
  for (const [width, height] of [
    [2048, 1181],
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [390, 844],
    [375, 667],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => ({
      page: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      slots: [...document.querySelectorAll(".gear-slot")].map((node) => {
        const card = node.querySelector(".game-card").getBoundingClientRect();
        const row = node.closest(".gear-slots").getBoundingClientRect();
        return {
          height: card.height,
          inside: card.top >= row.top - 1 && card.bottom <= row.bottom + 1,
        };
      }),
    }));
    assert.deepEqual(
      geometry.page,
      [width, height],
      `No page overflow at ${width}x${height}`,
    );
    assert.equal(geometry.slots.length, 5);
    for (const slot of geometry.slots) {
      assert.ok(
        slot.height >= 43,
        `Visible gear at ${width}x${height}: ${slot.height}`,
      );
      assert.ok(slot.inside, `Contained gear at ${width}x${height}`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".gear-slot .game-card > img")].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.locator('[data-gear-id="equipment"] .gear-inspect').click();
  assert.equal(
    await page
      .getByRole("dialog", { name: "Warmog's Armor", exact: true })
      .count(),
    1,
  );
  await page.locator(".card-detail .close-button").click();
  await page.locator('[data-gear-id="equipment"] .gear-attachment').click();
  assert.match(
    await page.locator(".decision-copy").innerText(),
    /Playful Phantom/,
  );
  await page.locator('[data-gear-id="equipment"] .game-card').click();
  await page.locator('[data-unit-id="own-base"] > .game-card').click();
  const equipTarget = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("riftbound-duel-save-v1"));
    return (save.review?.final ?? save.match).stack.find(
      (item) => item.sourceId === "equipment",
    ).targetId;
  });
  assert.equal(
    equipTarget,
    "own-base",
    "Equipment selection enters the real chain with the chosen unit",
  );
  await fixture();
  await page.locator('[data-gear-id="ballista"] .game-card').click();
  await page.locator('[data-unit-id="enemy-field"] > .game-card').click();
  const activated = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem("riftbound-duel-save-v1"));
    const game = save.review?.final ?? save.match;
    return {
      ready: game.gears.find((gear) => gear.id === "ballista").ready,
      stack: game.stack.map((item) => item.cardId),
    };
  });
  assert.equal(activated.ready, false);
  assert.ok(
    activated.stack.includes("ogn-017-298"),
    "Gear activates from its physical slot",
  );
  await fixture("?crowded=12");
  const overflow = await page
    .locator('[data-location="base:0"] .gear-slots')
    .evaluate((row) => {
      row.scrollLeft = row.scrollWidth;
      const last = row.lastElementChild.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      return (
        row.scrollWidth > row.clientWidth && last.right <= bounds.right + 1
      );
    });
  assert.ok(overflow, "Every gear remains reachable when the row is crowded");
  await fixture();
  await page.locator(".deck-pile").click();
  assert.equal(
    await page.locator(".deck-summary [data-sleeve=annie]").count(),
    1,
  );
  await page.getByRole("button", { name: "AI", exact: true }).click();
  assert.equal(
    await page.locator(".deck-summary [data-sleeve=lux]").count(),
    1,
  );
  assert.equal(
    await page.locator(".deck-summary [data-card-preview]").count(),
    0,
    "Deck order and card faces stay private",
  );
  const coverage = await page.evaluate(async () => {
    const { decks } = await import("/src/data/decks.ts");
    const { getSignatureSleeve } = await import("/src/data/sleeves.ts");
    const sleeves = decks.map(getSignatureSleeve);
    return {
      decks: sleeves.length,
      known: sleeves.every((s) => s.key !== "riftbound"),
      signatures: new Set(sleeves.map((s) => s.key)).size,
    };
  });
  assert.equal(coverage.known, true);
  assert.equal(coverage.signatures, 13);
  assert.deepEqual(errors, []);
  console.log(
    `PASS: 7 viewports, real gear activation and equip, inspection, attached-unit link, crowded row, private piles; ${coverage.decks} decks / 13 signatures.`,
  );
} finally {
  await browser.close();
}
