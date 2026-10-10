// Isolated support-screen interactions on loopback; never user browser data.
// Set PLAYWRIGHT_MODULE for an external install; WEBKIT_EXECUTABLE adds WebKit.
// QA_MOBILE_ONLY=1 runs touch cases and writes support-touch.json.
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
  "Support interaction checks must run against loopback",
);
const out = process.env.QA_OUTPUT || "test-results/support-interactions";
await mkdir(out, { recursive: true });
const mobileOnly = process.env.QA_MOBILE_ONLY === "1";
const prefix = mobileOnly ? "support-touch" : "support";
const report = { date: new Date().toISOString(), base: origin, runs: [] };
const persist = () =>
  writeFile(`${out}/${prefix}.json`, JSON.stringify(report, null, 2));
const cases = [
  ["chromium", 1440, 900],
  ["chromium", 390, 844],
];
if (process.env.WEBKIT_EXECUTABLE) cases.push(["webkit", 390, 844]);
for (const [engine, width, height] of cases.filter(
  ([, width]) => !mobileOnly || width < 500,
)) {
  const mobile = width < 500;
  const run = {
    engine,
    width,
    height,
    input: mobile ? "touch" : "mouse",
    actions: [],
    checks: [],
    errors: [],
  };
  report.runs.push(run);
  const browser = await { chromium, webkit }[engine].launch({
    headless: true,
    ...(engine === "webkit"
      ? { executablePath: process.env.WEBKIT_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: mobile,
    isMobile: mobile,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", (error) => run.errors.push(error.message));
  const act = async (locator) => {
    const control =
      (await locator.getAttribute("aria-label")) ||
      (await locator.innerText()).trim();
    if (mobile) await locator.tap();
    else await locator.click();
    run.actions.push({ control, method: mobile ? "tap" : "click" });
  };
  const check = async (name, f) => {
    try {
      const data = await f();
      run.checks.push({ name, status: "passed", ...(data ? { data } : {}) });
      console.log(engine, width, "PASS", name);
    } catch (error) {
      run.checks.push({ name, status: "failed", error: error.stack });
      await page.screenshot({
        path: `${out}/${prefix}-${engine}-${width}-failure.png`,
        fullPage: true,
      });
      console.log(engine, width, "FAIL", name, error.message);
      throw error;
    } finally {
      await persist();
    }
  };
  const screenshot = (name) =>
    page.screenshot({
      path: `${out}/${prefix}-${engine}-${width}-${name}.png`,
      fullPage: true,
    });
  const noOverflow = async () =>
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "horizontal document overflow",
    );
  let exported;
  try {
    await page.goto(report.base);
    await page.locator(".language-selector select").selectOption("en");
    await check(
      "Catalog search, filters, detail, no results, reset, pagination",
      async () => {
        await act(page.getByRole("button", { name: /^Cards\b/ }));
        await page
          .locator('.library input[type="text"], .library input:not([type])')
          .fill("Discipline");
        assert(
          (
            await page.locator(".catalog-card-name strong").allTextContents()
          ).every((name) => name === "Discipline"),
        );
        await page
          .getByRole("combobox", { name: "Domain", exact: true })
          .selectOption("Calm");
        await page
          .getByRole("combobox", { name: "Card type", exact: true })
          .selectOption("Spell");
        await act(page.getByLabel("Base printings only", { exact: true }));
        assert(
          await page
            .getByLabel("Base printings only", { exact: true })
            .isChecked(),
        );
        const count = await page.locator(".catalog-grid > div").count();
        assert(count > 0);
        await act(page.locator(".catalog-grid .game-card").first());
        await page.getByRole("dialog").waitFor();
        assert.match(await page.getByRole("dialog").innerText(), /Discipline/);
        await act(
          page
            .getByRole("dialog")
            .getByRole("button", { name: "Close", exact: true }),
        );
        assert.equal(await page.getByRole("dialog").count(), 0);
        await page
          .locator(".library .search-input input")
          .fill("no-card-with-this-name-1234");
        assert.equal(await page.locator(".catalog-grid > div").count(), 0);
        await act(
          page
            .locator(".empty-search")
            .getByRole("button", { name: "Reset filters" }),
        );
        assert.equal(await page.locator(".catalog-grid > div").count(), 60);
        await act(page.locator(".load-more"));
        assert.equal(await page.locator(".catalog-grid > div").count(), 120);
        await noOverflow();
        await screenshot("catalog");
        return { filteredDisciplineCount: count, afterLoadMore: 120 };
      },
    );
    await check(
      "Language changes preserve catalog filters and persist after reload",
      async () => {
        await page.locator(".library .search-input input").fill("Wind Wall");
        await page.locator(".language-selector select").selectOption("sr");
        assert.equal(
          await page.locator(".library .search-input input").inputValue(),
          "Wind Wall",
        );
        await page.locator(".language-selector select").selectOption("it");
        assert.equal(
          await page.locator(".library .search-input input").inputValue(),
          "Wind Wall",
        );
        assert.equal(await page.locator("html").getAttribute("lang"), "it");
        await page.reload();
        assert.equal(
          await page.locator(".language-selector select").inputValue(),
          "it",
        );
        await page.locator(".language-selector select").selectOption("en");
      },
    );
    await check(
      "Deck builder quantity edit, undo, redo, identity state and export download",
      async () => {
        await act(
          page.getByRole("button", { name: "Build a deck", exact: true }),
        );
        await page
          .getByRole("heading", { name: "Deck builder", exact: true })
          .waitFor();
        await page
          .getByRole("textbox", { name: "Deck name", exact: true })
          .fill(`Audit ${engine} ${width}`);
        await act(
          page.getByRole("button", { name: "Export text", exact: true }),
        );
        const before = await page.locator("#builder-export-text").inputValue();
        if (width < 500)
          await act(page.locator(".builder-mobile-views button").last());
        const remove = page
          .locator('.builder-deck button[aria-label^="Remove one"]')
          .first();
        const removedName = await remove.getAttribute("aria-label");
        await act(remove);
        const edited = await page.locator("#builder-export-text").inputValue();
        assert.notEqual(edited, before);
        await act(page.getByRole("button", { name: "Undo edit", exact: true }));
        assert.equal(
          await page.locator("#builder-export-text").inputValue(),
          before,
        );
        await act(page.getByRole("button", { name: "Redo edit", exact: true }));
        assert.equal(
          await page.locator("#builder-export-text").inputValue(),
          edited,
        );
        await act(page.getByRole("button", { name: "Undo edit", exact: true }));
        await page.locator(".language-selector select").selectOption("sr");
        assert.equal(
          await page.locator("#builder-export-text").inputValue(),
          before,
        );
        await page.locator(".language-selector select").selectOption("en");
        exported = await page.locator("#builder-export-text").inputValue();
        const downloadPromise = page.waitForEvent("download");
        await act(
          page.getByRole("button", { name: "Download .txt", exact: true }),
        );
        const download = await downloadPromise;
        assert.equal(await readFile(await download.path(), "utf8"), exported);
        assert(
          await page
            .getByRole("button", { name: "Save deck", exact: true })
            .isEnabled(),
        );
        await noOverflow();
        await screenshot("builder");
        return {
          removedName,
          exportLength: exported.length,
          download: download.suggestedFilename(),
        };
      },
    );
    await check("Deck save, reload, export/import round trip", async () => {
      await act(page.getByRole("button", { name: "Save deck", exact: true }));
      await page
        .getByRole("button", { name: "Build a deck", exact: true })
        .waitFor();
      const before = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("riftbound-imported-decks-v1")),
      );
      assert.match(JSON.stringify(before), /Audit /);
      await page.reload();
      const after = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("riftbound-imported-decks-v1")),
      );
      assert.deepEqual(after, before);
      await act(page.getByRole("button", { name: "Import deck", exact: true }));
      await page.locator("#deck-import-text").fill(exported);
      await page
        .locator("#deck-import-name")
        .fill(`Roundtrip ${engine} ${width}`);
      const historical = page
        .locator(".deck-import-historical")
        .filter({ hasText: /Historical precon/ })
        .locator("input");
      if (await page.locator(".deck-import-errors").count())
        await act(historical);
      assert.equal(await page.locator(".deck-import-errors").count(), 0);
      await act(page.locator(".deck-import-footer button"));
      await page.waitForFunction(() =>
        JSON.stringify(
          localStorage.getItem("riftbound-imported-decks-v1"),
        ).includes("Roundtrip"),
      );
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("riftbound-imported-decks-v1")),
      );
      const entries = Array.isArray(saved) ? saved : saved.decks;
      const clone = entries.find((d) =>
        d.includes(`Name: Roundtrip ${engine} ${width}`),
      );
      assert(clone);
      assert.equal(
        clone.replace(/^Name:.*$/m, ""),
        exported.replace(/^Name:.*$/m, ""),
      );
      return { savedDecks: entries.length };
    });
    await check(
      "All six training lessons complete with Undo, Retry and stored progress",
      async () => {
        await act(
          page.getByRole("button", { name: "Training lab", exact: true }),
        );
        const titles = [
          "Deploy your first unit",
          "Move together and conquer",
          "Answer a spell",
          "Reveal a Hidden threat",
          "Assign lethal damage",
          "Hold for the winning point",
        ];
        const results = [];
        for (const title of titles) {
          await act(
            page.locator(".training-lessons button").filter({ hasText: title }),
          );
          assert(
            await page
              .getByRole("button", { name: "Undo practice move", exact: true })
              .isDisabled(),
          );
          const initial = await page
            .locator(".training-actions button")
            .allTextContents();
          await act(page.locator(".training-actions button").first());
          assert(
            await page
              .getByRole("button", { name: "Undo practice move", exact: true })
              .isEnabled(),
          );
          await act(
            page.getByRole("button", {
              name: "Undo practice move",
              exact: true,
            }),
          );
          assert.deepEqual(
            await page.locator(".training-actions button").allTextContents(),
            initial,
          );
          const steps = [];
          for (
            let i = 0;
            i < 15 && !(await page.locator(".training-success").count());
            i++
          ) {
            const names = await page
              .locator(".training-actions button")
              .allTextContents();
            assert(names.length, `No actions while incomplete: ${title}`);
            const pick =
              names.find((n) => n.startsWith("Move 2 units")) ||
              names.find((n) => n.startsWith("Add Shipyard")) ||
              names[0];
            steps.push(pick);
            await act(
              page
                .locator(".training-actions button")
                .filter({ hasText: pick })
                .first(),
            );
          }
          assert.equal(
            await page.locator(".training-success").count(),
            1,
            title,
          );
          assert.equal(await page.locator(".training-error").count(), 0);
          await act(
            page.getByRole("button", { name: "Retry exercise", exact: true }),
          );
          assert.equal(await page.locator(".training-success").count(), 0);
          assert.deepEqual(
            await page.locator(".training-actions button").allTextContents(),
            initial,
          );
          results.push({ title, steps });
        }
        const progress = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("riftbound-duel-training-v1")),
        );
        assert.equal(progress.completed.length, 6);
        await noOverflow();
        await screenshot("training");
        await page.reload();
        await act(
          page.getByRole("button", { name: "Training lab", exact: true }),
        );
        assert.match(
          await page.locator(".training-progress").innerText(),
          /6 of 6/,
        );
        return { lessons: results, progress };
      },
    );
    assert.equal(run.errors.length, 0, "Browser JS errors");
    run.status = "passed";
  } catch (error) {
    run.status = "failed";
    run.failure = error.message;
  } finally {
    await persist();
    await browser.close();
  }
}
console.log(
  JSON.stringify(
    report.runs.map((r) => ({
      engine: r.engine,
      width: r.width,
      status: r.status,
      checks: r.checks.length,
      errors: r.errors,
    })),
    null,
    2,
  ),
);
if (report.runs.some((r) => r.status !== "passed")) process.exitCode = 1;
