// Synthetic loopback sessions only; verifies presentation preferences and input safety.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await (process.env.PLAYWRIGHT_MODULE
  ? import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : import("playwright"));
const origin = process.env.BASE_URL || "http://127.0.0.1:5173";
const fixtureOrigin = process.env.FIXTURE_ORIGIN || origin;
for (const url of [origin, fixtureOrigin])
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
  );
const out = path.resolve(process.env.QA_OUTPUT || "test-results/appearance");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const failures = [];
const reports = [];
const state = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("riftbound-duel-save-v1")),
  );
const fingerprint = async (page) => JSON.stringify(await state(page));
async function seed(page, fixture) {
  await page.goto(`${fixtureOrigin}/tests/${fixture}`);
  await page
    .getByRole("button", { name: "Resume duel", exact: true })
    .waitFor();
  if (new URL(fixtureOrigin).origin !== new URL(origin).origin) {
    // Only this new browser context's synthetic test state crosses origins.
    // The preview server serves built UI; source-only fixtures stay on Vite.
    const entries = await page.evaluate(() => Object.entries(localStorage));
    await page.goto(origin);
    await page.evaluate((items) => {
      localStorage.clear();
      for (const [key, value] of items) localStorage.setItem(key, value);
    }, entries);
    await page.reload();
  }
}
async function open(page, fixture = "native-flow-preview.html?crowded") {
  await seed(page, fixture);
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator(".app.is-game .playmat").waitFor();
  await page.mouse.move(0, 0);
}
async function appearance(page, mobile) {
  if (mobile)
    await page.getByRole("button", { name: "Duel menu", exact: true }).click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("dialog", { name: "Appearance", exact: true }).waitFor();
}
async function geometry(page) {
  return page.evaluate(() => {
    const selectors = [
      ".playmat",
      ".battlefields",
      ".base-zone",
      ".player-cards > .rune-zone",
      ".player-cards > .hand-tray",
      ".visual-controls",
    ];
    return Object.fromEntries(
      selectors.map((selector) => [
        selector,
        [...document.querySelectorAll(selector)].map((node) => {
          const r = node.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height];
        }),
      ]),
    );
  });
}
function sameGeometry(a, b) {
  for (const selector of Object.keys(a)) {
    assert.equal(a[selector].length, b[selector].length);
    a[selector].forEach((rect, i) =>
      rect.forEach((value, axis) =>
        assert.ok(
          Math.abs(value - b[selector][i][axis]) <= 1,
          `${selector} geometry changed at ${i}/${axis}`,
        ),
      ),
    );
  }
}
async function fit(page) {
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth + 1 &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
    "Viewport overflow",
  );
}
async function check(name, viewport, run, extra = {}) {
  const mobile = viewport.width < 600;
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    ...extra,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await run(page, mobile);
    assert.deepEqual(errors, [], "Browser error");
    reports.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    await page.screenshot({ path: path.join(out, `${name}-failure.png`) });
    console.log(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}
try {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
    [1100, 650],
    [390, 844],
    [320, 568],
  ]) {
    await check(
      `appearance-${width}x${height}`,
      { width, height },
      async (page, mobile) => {
        await open(page);
        const before = await geometry(page);
        const style = await page
          .locator(".battlefield .field-art")
          .first()
          .evaluate((e) => getComputedStyle(e).filter);
        await appearance(page, mobile);
        const dialog = page.getByRole("dialog", {
          name: "Appearance",
          exact: true,
        });
        const bounds = await dialog.boundingBox();
        assert.ok(
          bounds.x >= 0 &&
            bounds.y >= 0 &&
            bounds.x + bounds.width <= width + 1 &&
            bounds.y + bounds.height <= height + 1,
          "Appearance fits viewport",
        );
        assert.ok(
          await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          "Appearance horizontal overflow",
        );
        const paused = (await state(page)).paused;
        await page.keyboard.press("p");
        assert.equal(
          (await state(page)).paused,
          paused,
          "P must not toggle pause behind a dialog",
        );
        await page.getByRole("switch", { name: /Clearer table/ }).check();
        await page.waitForFunction(
          () => document.documentElement.dataset.boardContrast === "high",
        );
        sameGeometry(before, await geometry(page));
        assert.notEqual(
          await page
            .locator(".battlefield .field-art")
            .first()
            .evaluate((e) => getComputedStyle(e).filter),
          style,
          "Contrast changes battlefield artwork",
        );
        await page.getByRole("switch", { name: /Reduce effects/ }).check();
        await page.waitForFunction(
          () => document.documentElement.dataset.effects === "reduced",
        );
        assert.ok(
          await page
            .locator(".appearance-option input")
            .first()
            .evaluate(
              (e) =>
                parseFloat(getComputedStyle(e, "::after").transitionDuration) <=
                0.00002,
            ),
          "Reduced effects suppress transitions",
        );
        await page.getByRole("switch", { name: /Game sound/ }).check();
        assert.equal(
          await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("riftbound-interface-v1"))
                .soundEnabled,
          ),
          true,
          "Sound preference is saved from Appearance",
        );
        await page
          .locator('.card-back-option:has(input[value="moonveil"])')
          .click();
        assert.equal(
          await page.evaluate(() =>
            localStorage.getItem("riftbound-card-back-v1"),
          ),
          "moonveil",
        );
        assert.ok(
          await page
            .locator(".signature-sleeve")
            .evaluateAll(
              (images) =>
                images.length > 0 &&
                images.every((image) => image.dataset.sleeve === "moonveil"),
            ),
          "Face-down cards immediately use the selected back",
        );
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: path.join(out, `${width}x${height}.png`),
        });
        const done = page.getByRole("button", { name: "Done", exact: true });
        const doneBounds = await done.boundingBox();
        assert.ok(
          doneBounds.y >= 0 && doneBounds.y + doneBounds.height <= height + 1,
          "Done stays visible while preferences scroll",
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
        const expected = mobile ? "Duel menu" : "Appearance";
        assert.equal(
          await page.evaluate(() =>
            document.activeElement?.getAttribute("aria-label"),
          ),
          expected,
          "Escape restores focus to the table invoker",
        );
        sameGeometry(before, await geometry(page));
        await fit(page);
        await page.reload();
        await page
          .getByRole("button", { name: "Resume duel", exact: true })
          .click();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.dataset.boardContrast,
          ),
          "high",
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.effects),
          "reduced",
        );
        await appearance(page, mobile);
        assert.ok(
          await page.getByRole("switch", { name: /Game sound/ }).isChecked(),
          "Sound preference persists after reload",
        );
        assert.ok(
          await page
            .getByRole("radio", { name: "Moonveil", exact: true })
            .isChecked(),
          "Card back choice persists",
        );
        if (!mobile) {
          await page.keyboard.press("Escape");
          await page.goto(origin);
          await page
            .getByRole("button", { name: "Mute sound", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Enable sound", exact: true })
            .waitFor();
          assert.equal(
            await page.evaluate(
              () =>
                JSON.parse(localStorage.getItem("riftbound-interface-v1"))
                  .soundEnabled,
            ),
            false,
            "Header sound action shares the same preference",
          );
        }
      },
    );
  }
  await check("keyboard-p", { width: 1440, height: 900 }, async (page) => {
    await open(page);
    await page.keyboard.press("p");
    await page
      .getByRole("button", { name: "Resume game", exact: true })
      .first()
      .waitFor();
    assert.equal((await state(page)).paused, true);
    await page.keyboard.press("p");
    await page
      .getByRole("button", { name: "Pause game", exact: true })
      .waitFor();
    assert.equal((await state(page)).paused, false);
    await page.locator(".match-toolbar select").first().focus();
    await page.keyboard.press("p");
    assert.equal(
      (await state(page)).paused,
      false,
      "P inside a select does not pause",
    );
  });
  await check(
    "appearance-pauses-review",
    { width: 1440, height: 900 },
    async (page) => {
      await open(page, "action-stack-preview.html?mode=human-play");
      await appearance(page, false);
      const before = await fingerprint(page);
      assert.ok(
        (await state(page)).review,
        "Fixture contains an active review",
      );
      await page.waitForTimeout(1800);
      assert.equal(
        await fingerprint(page),
        before,
        "Review cannot advance while Appearance is open",
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        (old) => localStorage.getItem("riftbound-duel-save-v1") !== old,
        JSON.stringify(JSON.parse(before)),
      );
    },
  );
  await check(
    "appearance-pauses-bot",
    { width: 1440, height: 900 },
    async (page) => {
      await seed(page, "native-flow-preview.html?crowded");
      await page.evaluate(() => {
        const key = "riftbound-duel-save-v1",
          saved = JSON.parse(localStorage.getItem(key));
        Object.assign(saved.match, {
          currentPlayer: 1,
          priorityPlayer: 1,
          focusPlayer: 1,
          phase: "main",
          combat: null,
        });
        saved.match.players[1].hand = [];
        saved.paused = false;
        localStorage.setItem(key, JSON.stringify(saved));
      });
      await page.goto(origin);
      await page
        .getByRole("button", { name: "Resume duel", exact: true })
        .click();
      await appearance(page, false);
      const before = await fingerprint(page);
      await page.waitForTimeout(1800);
      assert.equal(
        await fingerprint(page),
        before,
        "Bot cannot advance while Appearance is open",
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        (old) => localStorage.getItem("riftbound-duel-save-v1") !== old,
        JSON.stringify(JSON.parse(before)),
      );
    },
  );
  await check(
    "reduced-effects-lobby-scroll",
    { width: 1440, height: 900 },
    async (page) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          "riftbound-interface-v1",
          JSON.stringify({ reducedEffects: true, boardContrast: "standard" }),
        );
      });
      await page.goto(origin);
      await page.evaluate(() => {
        window.__qaScrollCalls = [];
        const scroll = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (options) {
          window.__qaScrollCalls.push(options);
          return scroll.call(this, options);
        };
      });
      await page
        .getByRole("button", { name: "Choose your deck", exact: true })
        .click();
      const calls = await page.evaluate(() => window.__qaScrollCalls);
      assert.ok(
        calls.some((options) =>
          ["instant", "auto"].includes(options?.behavior),
        ),
        "Reduced effects makes setup navigation instant",
      );
      assert.ok(
        !calls.some((options) => options?.behavior === "smooth"),
        "App preference suppresses JavaScript smooth scrolling",
      );
    },
    { reducedMotion: "no-preference" },
  );
  await check(
    "system-reduced-motion",
    { width: 1440, height: 900 },
    async (page) => {
      await open(page);
      await appearance(page, false);
      assert.equal(
        await page.getByRole("switch", { name: /Reduce effects/ }).isChecked(),
        false,
      );
      assert.ok(
        await page
          .locator(".appearance-option input")
          .first()
          .evaluate(
            (e) =>
              parseFloat(getComputedStyle(e, "::after").transitionDuration) <=
              0.00002,
          ),
        "Operating-system preference wins even with the app switch off",
      );
    },
    { reducedMotion: "reduce" },
  );
} finally {
  await browser.close();
}
await writeFile(
  path.join(out, "report.json"),
  JSON.stringify({ reports, failures }, null, 2),
);
assert.deepEqual(failures, [], "Appearance checks failed");
