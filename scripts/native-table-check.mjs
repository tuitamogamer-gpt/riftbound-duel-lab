// Run against a local Vite server. Synthetic fixtures use fresh browser contexts.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await (process.env.PLAYWRIGHT_MODULE
  ? import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : import("playwright"));
const origin = process.env.BASE_URL || "http://127.0.0.1:5173";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
  "Synthetic fixtures must run on a loopback origin",
);
const out = path.resolve(process.env.QA_OUTPUT || "test-results/native-table");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports = [];
const failures = [];
const viewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1100, height: 650 },
];

async function open(page, fixture) {
  await page.goto(`${origin}/tests/${fixture}`);
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator(".app.is-game .playmat").waitFor();
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
}

async function fit(page) {
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    "Table causes viewport overflow",
  );
}

async function reachable(button) {
  await button.scrollIntoViewIfNeeded();
  assert.ok(
    await button.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return r.width > 0 && r.height > 0 && hit && element.contains(hit);
    }),
    `Control is covered or clipped: ${(await button.getAttribute("aria-label")) || (await button.innerText())}`,
  );
}

async function dock(page) {
  const result = await page.locator(".visual-controls").evaluate((element) => {
    const r = element.getBoundingClientRect();
    const targets = element.querySelector(".context-actions");
    return {
      fits: r.top >= 0 && r.bottom <= innerHeight + 1,
      overflow: targets ? targets.scrollWidth - targets.clientWidth : 0,
    };
  });
  assert.ok(result.fits, "Decision dock extends beyond the viewport");
  assert.ok(
    result.overflow <= 1,
    "Target actions require horizontal scrolling",
  );
  for (const button of await page
    .locator(".visual-controls button:visible:enabled")
    .all())
    await reachable(button);
}

async function savedMatch(page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match,
  );
}

async function check(viewport, name, work) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const label = `${viewport.width}x${viewport.height}-${name}`;
  try {
    await work(page);
    await fit(page);
    assert.deepEqual(errors, [], "Browser errors");
    reports.push({ name: label, passed: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    await page.screenshot({ path: path.join(out, `${label}-failure.png`) });
    failures.push({ name: label, error: error.message });
    console.log(`FAIL ${label}: ${error.message}`);
  } finally {
    await context.close();
  }
}

try {
  for (const viewport of viewports) {
    await check(viewport, "crowded-table-and-hover", async (page) => {
      await open(page, "native-flow-preview.html?crowded");
      const hand = page.locator(".player-cards > .hand-tray");
      const runes = await page
        .locator(".player-cards > .rune-zone")
        .boundingBox();
      const before = await hand.boundingBox();
      const controls = await page.locator(".visual-controls").boundingBox();
      assert.ok(
        Math.abs(runes.y - before.y) <= 1,
        "Runes must align with the hand",
      );
      assert.ok(
        runes.x + runes.width <= before.x,
        "Runes must sit left of the hand",
      );
      assert.ok(runes.y > viewport.height / 2, "Runes must stay at the bottom");
      assert.ok(
        before.x + before.width <= controls.x,
        "Hand overlaps decision dock",
      );
      const minHeight = viewport.height <= 650 ? 95 : 150;
      for (const base of await page.locator(".base-units").all()) {
        const cards = base.locator(".unit-wrap > .game-card");
        const size = await cards.first().boundingBox();
        assert.ok(
          size.height >= minHeight,
          `Base card is ${size.height.toFixed(1)}px; expected at least ${minHeight}px`,
        );
        await reachable(cards.last());
      }
      const unit = page
        .locator('.base-zone[data-location="base:0"] .unit-wrap > .game-card')
        .first();
      await unit.scrollIntoViewIfNeeded();
      await unit.hover();
      const preview = page.locator(".card-preview");
      await preview.waitFor();
      const hover = await preview.boundingBox();
      assert.ok(hover.width <= 420, `Hover preview is ${hover.width}px wide`);
      assert.ok(
        hover.x >= 0 &&
          hover.y >= 0 &&
          hover.x + hover.width <= viewport.width + 1 &&
          hover.y + hover.height <= viewport.height + 1,
        "Hover preview escapes viewport",
      );
      await page.keyboard.press("Escape");
      await unit.click({ position: { x: 16, y: 16 } });
      assert.match(await unit.getAttribute("class"), /\bselected\b/);
      const after = await hand.boundingBox();
      for (const key of ["x", "y", "width", "height"])
        assert.ok(
          Math.abs(before[key] - after[key]) <= 1,
          `Board selection changes hand ${key}`,
        );
      assert.equal(await hand.locator(".hand-card-wrap").count(), 12);
      await dock(page);
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: path.join(out, `${viewport.width}x${viewport.height}-table.png`),
      });
    });

    await check(viewport, "movement-and-empty-hand", async (page) => {
      await open(page, "movement-preview.html");
      assert.match(
        await page.locator(".hand-tray").innerText(),
        /No cards in hand/,
      );
      await dock(page);
      await page
        .getByRole("button", { name: "Move 1 unit", exact: true })
        .click();
      await page.waitForFunction(() => {
        const match = JSON.parse(
          localStorage.getItem("riftbound-duel-save-v1"),
        ).match;
        return (
          match.units.find((unit) => unit.id === "unit-0")?.location ===
          "field:1"
        );
      });
    });

    await check(viewport, "combat-target", async (page) => {
      await open(page, "combat-preview.html");
      await dock(page);
      await page
        .locator('.context-action[data-target-id="defender-front"]')
        .click();
      const match = await savedMatch(page);
      assert.equal(match.combat.assignments[0]["defender-front"], 3);
    });

    await check(viewport, "spell-reaction-target", async (page) => {
      await open(page, "action-stack-preview.html?mode=reaction&bases");
      await page.locator(".hand-card-wrap .game-card").first().click();
      assert.equal(await page.locator(".context-action").count(), 3);
      await dock(page);
      await page.locator('.context-action[data-target-id="base-ally"]').click();
      const match = await savedMatch(page);
      assert.ok(
        match.stack.some(
          (spell) =>
            spell.cardId === "ogn-046-298" && spell.targetId === "base-ally",
        ),
      );
    });

    await check(viewport, "hidden-play-modes", async (page) => {
      await open(page, "hidden-payment-preview.html");
      await page.locator(".hand-card-wrap .game-card").first().click();
      await dock(page);
      await page.locator('[data-hidden-mode="play"]').click();
      assert.equal(
        await page
          .locator('[data-hidden-mode="play"]')
          .getAttribute("aria-pressed"),
        "true",
      );
      assert.equal(
        await page.locator(".context-action[data-target-id]").count(),
        2,
      );
      await dock(page);
      await page.locator('[data-hidden-mode="hide"]').click();
      await page.locator('.context-action[data-action-id^="hide:"]').click();
      const match = await savedMatch(page);
      assert.ok(match.hidden.some((card) => card.cardId === "ogn-057-298"));
      assert.equal(
        match.players[0].energy,
        4,
        "Hide must not spend normal play Energy",
      );
    });
  }
} finally {
  await browser.close();
}

await writeFile(
  path.join(out, "report.json"),
  JSON.stringify({ reports, failures }, null, 2),
);
assert.deepEqual(failures, [], "Desktop table checks failed");
