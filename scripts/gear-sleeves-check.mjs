// Uses a separate QA origin so the user's saved match is never overwritten.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/gear-sleeves-check.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
const screenshotDirectory = new URL(
  "../test-results/base-hand-layout/",
  import.meta.url,
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const fixture = async (query = "") => {
  await page.goto(`${origin}/tests/gear-sleeves-preview.html${query}`);
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator('[data-unit-id="own-base"] > .game-card').waitFor();
};
const tableGeometry = () =>
  page.evaluate(() => {
    const rect = (node) => node.getBoundingClientRect().toJSON();
    const hand = document.querySelector(".hand");
    const piles = document.querySelector(".card-piles");
    return {
      page: [
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight,
      ],
      bases: [...document.querySelectorAll(".base-zone")].map((base) => ({
        location: base.dataset.location,
        units: rect(base.querySelector(".base-units")),
        cards: [...base.querySelectorAll(".unit-wrap > .game-card")].map(rect),
        gear: base.querySelector(".gear-zone")
          ? rect(base.querySelector(".gear-zone"))
          : null,
      })),
      slots: [...document.querySelectorAll(".gear-slot")].map((node) => {
        const card = rect(node.querySelector(".game-card"));
        const row = rect(node.closest(".gear-slots"));
        return {
          height: card.height,
          inside: card.top >= row.top - 1 && card.bottom <= row.bottom + 1,
        };
      }),
      hand: rect(hand),
      handCards: [...hand.querySelectorAll(".game-card")].map(rect),
      piles: rect(piles),
      pileCards: [...piles.querySelectorAll(".pile-art")].map(rect),
      pilesInHand: piles.parentElement.matches(".hand-section"),
    };
  });
const checkHandPiles = (geometry, width, height, context) => {
  assert.ok(
    geometry.pilesInHand,
    `${context}: deck and trash belong to the hand area`,
  );
  assert.ok(
    geometry.piles.left >= geometry.hand.right - 1,
    `${context}: piles sit to the right of the hand`,
  );
  assert.equal(
    geometry.pileCards.length,
    2,
    `${context}: both piles remain visible`,
  );
  for (const pile of geometry.pileCards) {
    assert.ok(
      pile.height >= (width > 800 && height > 500 ? 60 : 38),
      `${context}: useful pile height ${pile.height}`,
    );
    assert.ok(
      pile.left >= geometry.piles.left - 1 &&
        pile.right <= geometry.piles.right + 1,
      `${context}: pile stays within its area`,
    );
    if (geometry.handCards.length) {
      const card = geometry.handCards[0];
      assert.ok(
        pile.height >= card.height * 0.8 && pile.height <= card.height * 1.1,
        `${context}: pile height ${pile.height} matches hand height ${card.height}`,
      );
      assert.ok(
        Math.abs(pile.bottom - card.bottom) <= 10,
        `${context}: pile and hand card share a baseline`,
      );
    }
  }
};
try {
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
    await fixture("?no-gear");
    const withoutGear = await tableGeometry();
    await fixture();
    const geometry = await tableGeometry();
    const context = `${width}x${height}`;
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
    for (const base of geometry.bases) {
      const previous = withoutGear.bases.find(
        (candidate) => candidate.location === base.location,
      );
      assert.ok(
        base.cards[0].height >= previous.cards[0].height * 0.95,
        `${context} ${base.location}: adding gear preserves unit height (${previous.cards[0].height} → ${base.cards[0].height})`,
      );
      assert.ok(
        base.gear.left >= base.units.right - 1,
        `${context} ${base.location}: units and gear have separate side-by-side lanes`,
      );
      assert.ok(
        Math.abs(base.gear.top - base.units.top) <= 1,
        `${context} ${base.location}: lanes start at the same height`,
      );
      for (const card of base.cards)
        assert.ok(
          card.left >= base.units.left - 1 &&
            card.right <= base.units.right + 1 &&
            card.top >= base.units.top - 1 &&
            card.bottom <= base.units.bottom + 1,
          `${context} ${base.location}: unit stays within its lane`,
        );
    }
    checkHandPiles(geometry, width, height, context);
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
  const ownBase = page.locator('[data-location="base:0"]');
  const gearRow = ownBase.locator(".gear-slots");
  const moreGear = ownBase.getByRole("button", {
    name: "More gear",
    exact: true,
  });
  const previousGear = ownBase.getByRole("button", {
    name: "Previous gear",
    exact: true,
  });
  await moreGear.waitFor();
  assert.ok(
    await previousGear.isDisabled(),
    "Previous gear is disabled at the start",
  );
  const scrollWithButton = async (button, direction) => {
    for (let clicks = 0; clicks < 100; clicks++) {
      const position = await gearRow.evaluate((row) => ({
        current: row.scrollLeft,
        maximum: row.scrollWidth - row.clientWidth,
      }));
      if (
        direction > 0
          ? position.current >= position.maximum - 1
          : position.current <= 1
      )
        return;
      await button.click();
      await page.waitForFunction((previous) => {
        const row = document.querySelector(
          '[data-location="base:0"] .gear-slots',
        );
        return Math.abs(row.scrollLeft - previous) > 0.5;
      }, position.current);
    }
    assert.fail("Gear navigation must reach the end of the row");
  };
  await scrollWithButton(moreGear, 1);
  const overflow = await page
    .locator('[data-location="base:0"] .gear-slots')
    .evaluate((row) => {
      const last = row.lastElementChild.getBoundingClientRect();
      const bounds = row.getBoundingClientRect();
      return (
        row.scrollWidth > row.clientWidth && last.right <= bounds.right + 1
      );
    });
  assert.ok(overflow, "More gear reaches the last card in a crowded row");
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-location="base:0"] [aria-label="More gear"]',
      ).disabled,
  );
  await scrollWithButton(previousGear, -1);
  const atStart = await gearRow.evaluate((row) => {
    const first = row.firstElementChild.getBoundingClientRect();
    return (
      row.scrollLeft <= 1 && first.left >= row.getBoundingClientRect().left - 1
    );
  });
  assert.ok(atStart, "Previous gear returns to the first card");
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-location="base:0"] [aria-label="Previous gear"]',
      ).disabled,
  );
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await fixture("?units=8&hand=12&crowded=12");
    const crowded = await tableGeometry();
    const context = `${width}x${height}, crowded table`;
    assert.deepEqual(
      crowded.page,
      [width, height],
      `${context}: no page overflow`,
    );
    assert.equal(crowded.handCards.length, 12, `${context}: complete hand`);
    for (const base of crowded.bases) {
      assert.equal(base.cards.length, 8, `${context}: complete base`);
      for (const card of base.cards)
        assert.ok(
          card.left >= base.units.left - 1 &&
            card.right <= base.units.right + 1,
          `${context}: crowded units remain within their lane`,
        );
    }
    checkHandPiles(crowded, width, height, context);
  }
  await mkdir(screenshotDirectory, { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await fixture();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete),
    );
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}.png`, screenshotDirectory)),
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
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
    `PASS: 7 viewports, stable unit sizes with gear, side-by-side lanes, hand/pile alignment, crowded units/hand/gear, mouse gear navigation, real gear activation and equip, inspection, attached-unit link, private piles; ${coverage.decks} decks / 13 signatures. Screenshots: ${fileURLToPath(screenshotDirectory)}`,
  );
} finally {
  await browser.close();
}
