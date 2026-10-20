// Fresh loopback sessions: dialog navigation, narrow layouts and training resume.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5173";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const out = process.env.QA_OUTPUT || "test-results/support-polish";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const focused = (locator) =>
  locator.evaluate((element) => element === document.activeElement);
const ready = (page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
async function reachable(locator) {
  assert.ok(
    await locator.evaluate((element) => {
      const r = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return (
        r.top >= 0 &&
        r.bottom <= innerHeight + 1 &&
        hit &&
        element.contains(hit)
      );
    }),
    "Persistent dialog control is covered or outside the viewport",
  );
}
try {
  for (const [width, height] of [
    [1440, 900],
    [900, 650],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 600 || height < 500,
      isMobile: width < 600 || height < 500,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const name = `${width}x${height}`;
    try {
      await page.goto(origin);
      const helpTrigger = page
        .locator(".topbar nav")
        .getByRole("button", { name: "How to play", exact: true });
      await helpTrigger.click();
      const help = page.locator(".help-dialog");
      await help.waitFor();
      await ready(page);
      assert.ok(await focused(help), "Dialog starts at its accessible heading");
      const close = help.getByRole("button", { name: "Close", exact: true });
      const done = help.getByRole("button", {
        name: "Ready to duel",
        exact: true,
      });
      const quick = help.getByRole("tab", { name: "Quick start", exact: true });
      const controls = help.getByRole("tab", { name: "Controls", exact: true });
      const sources = help.getByRole("tab", {
        name: "About & rules",
        exact: true,
      });
      await reachable(close);
      await reachable(done);
      await quick.focus();
      await page.keyboard.press("ArrowRight");
      assert.ok(await focused(controls));
      assert.equal(await controls.getAttribute("aria-selected"), "true");
      assert.equal(await help.getByRole("tabpanel").count(), 1);
      await page.keyboard.press("Tab");
      assert.ok(
        await focused(help.getByRole("tabpanel")),
        "Tab enters the active panel",
      );
      await page.keyboard.press("Tab");
      assert.ok(await focused(done), "Hidden panels cannot receive focus");
      await page.keyboard.press("Tab");
      assert.ok(await focused(close), "Focus wraps inside the dialog");
      await controls.focus();
      await page.keyboard.press("End");
      assert.ok(await focused(sources));
      assert.equal(
        await help.getByRole("tabpanel").getByRole("link").count(),
        2,
      );
      await page.keyboard.press("ArrowRight");
      assert.ok(await focused(quick), "Arrow keys wrap at the last tab");
      await page.keyboard.press("ArrowLeft");
      assert.ok(await focused(sources));
      await page.keyboard.press("Home");
      assert.ok(await focused(quick));
      // Exercise native disclosure state, then scroll without losing close/CTA.
      await help.locator(".help-steps details").evaluateAll((items) =>
        items.forEach((item) => {
          item.open = true;
        }),
      );
      await help.locator(".help-body").evaluate((body) => {
        body.scrollTop = body.scrollHeight;
      });
      await reachable(close);
      await reachable(done);
      await controls.click();
      assert.equal(
        await help.locator(".help-body").evaluate((body) => body.scrollTop),
        0,
      );
      await page.screenshot({ path: `${out}/${name}-controls.png` });
      await page.keyboard.press("Escape");
      await help.waitFor({ state: "detached" });
      assert.ok(
        await focused(helpTrigger),
        "Closing Help restores the invoker",
      );
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");

      const appearanceTrigger = page.getByRole("button", {
        name: "Appearance",
        exact: true,
      });
      await appearanceTrigger.click();
      const appearance = page.locator(".appearance-dialog");
      const backs = appearance.getByRole("tab", {
        name: "Card backs",
        exact: true,
      });
      await backs.focus();
      await page.keyboard.press("ArrowRight");
      const display = appearance.getByRole("tab", {
        name: "Display & sound",
        exact: true,
      });
      assert.ok(await focused(display));
      assert.equal(
        await appearance.getByRole("radio").count(),
        0,
        "Hidden card-back choices leave the focus order",
      );
      assert.equal(await appearance.getByRole("switch").count(), 3);
      await ready(page);
      await reachable(
        appearance.getByRole("button", { name: "Close", exact: true }),
      );
      await reachable(
        appearance.getByRole("button", { name: "Done", exact: true }),
      );
      await appearance.getByRole("switch", { name: /Game sound/ }).check();
      await page.keyboard.press("Escape");
      assert.ok(await focused(appearanceTrigger));

      await page.evaluate(() =>
        localStorage.setItem(
          "riftbound-duel-training-v1",
          JSON.stringify({ version: 1, completed: ["deploy", "movement"] }),
        ),
      );
      await page
        .locator(".topbar nav")
        .getByRole("button", { name: "Practice", exact: true })
        .click();
      await page.locator(".training-instruction h2").waitFor();
      assert.equal(
        await page.locator(".training-instruction h2").innerText(),
        "Answer a spell",
        "Practice resumes at the first incomplete exercise",
      );
      if (width <= 800) {
        const lessons = page.getByRole("combobox", {
          name: "Training exercises",
        });
        assert.equal(await lessons.inputValue(), "reaction");
        await lessons.selectOption("deploy");
        assert.equal(
          await page.locator(".training-instruction h2").innerText(),
          "Deploy your first unit",
        );
        assert.ok(
          await page
            .getByRole("button", { name: "Undo practice move", exact: true })
            .isDisabled(),
        );
      }
      await page.screenshot({ path: `${out}/${name}-practice.png` });
      for (const locale of ["en", "sr", "it"]) {
        await page.locator(".language-selector select").selectOption(locale);
        await page.locator(".topbar nav button").last().click();
        await help.waitFor();
        await ready(page);
        for (const tab of await help.getByRole("tab").all()) {
          await tab.click();
          assert.ok(
            await help.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
            `${locale} help fits`,
          );
        }
        await page.screenshot({ path: `${out}/${name}-help-${locale}.png` });
        await page.keyboard.press("Escape");
        await page.locator(".topbar .appearance-trigger").click();
        await appearance.waitFor();
        await appearance.getByRole("tab").last().click();
        assert.ok(
          await appearance.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
          `${locale} appearance fits`,
        );
        await page.keyboard.press("Escape");
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${locale} page fits`,
        );
      }
      assert.deepEqual(errors, []);
      results.push({ name, passed: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
      await page.screenshot({ path: `${out}/${name}-failure.png` });
      console.log(`FAIL ${name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(`${out}/report.json`, JSON.stringify(results, null, 2));
assert.ok(
  results.every((result) => result.passed),
  "Support polish checks failed",
);
