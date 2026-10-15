// Fresh local browser profiles and synthetic archives; never user data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const output = process.env.QA_OUTPUT || "test-results/returning-player";
await mkdir(output, { recursive: true });
const reports = [];
const browser = await chromium.launch({ headless: true });
const save = (page) =>
  page.evaluate(() => localStorage.getItem("riftbound-duel-save-v1"));
const archive = (page) =>
  page.evaluate(() => localStorage.getItem("riftbound-duel-history-v1"));
const guideState = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("riftbound-duel-guide-v1")),
  );
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "no horizontal overflow",
  );
}
try {
  for (const [width, height] of [
    [1366, 768],
    [390, 844],
    [320, 640],
  ]) {
    if (process.env.QA_WIDTH && width !== Number(process.env.QA_WIDTH))
      continue;
    for (const scenario of ["setup", "guide", "history"]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: width < 800,
        hasTouch: width < 800,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const id = `${scenario}-${width}`;
      try {
        if (scenario === "setup") {
          await page.goto(origin);
          const player = page.getByRole("combobox", {
            name: "Your deck",
            exact: true,
          });
          const opponent = page.getByRole("combobox", {
            name: "Opponent’s deck",
            exact: true,
          });
          const options = await player
            .locator("option")
            .evaluateAll((options) =>
              options.map((o) => ({ id: o.value, label: o.textContent })),
            );
          const own = options[4],
            other = options[7];
          await player.selectOption(own.id);
          await opponent.selectOption(other.id);
          const field = page.getByRole("combobox", {
            name: "Your battlefield",
            exact: true,
          });
          const fieldId = await field
            .locator("option")
            .nth(3)
            .getAttribute("value");
          await field.selectOption(fieldId);
          await page
            .getByRole("combobox", { name: "Match format", exact: true })
            .selectOption("bo3");
          await page
            .getByRole("combobox", { name: "Starting player", exact: true })
            .selectOption("bot");
          await page
            .locator('input[name="difficulty"][value="expert"]')
            .check();
          assert.equal(
            await save(page),
            null,
            "setup does not create or mutate a duel",
          );
          await page.reload();
          assert.equal(await player.inputValue(), own.id);
          assert.equal(await opponent.inputValue(), other.id);
          assert.equal(await field.inputValue(), fieldId);
          assert.equal(
            await page
              .getByRole("combobox", { name: "Match format", exact: true })
              .inputValue(),
            "bo3",
          );
          assert.equal(
            await page
              .getByRole("combobox", { name: "Starting player", exact: true })
              .inputValue(),
            "bot",
          );
          assert.ok(
            await page
              .locator('input[name="difficulty"][value="expert"]')
              .isChecked(),
          );
          await page
            .getByRole("combobox", { name: "Match format", exact: true })
            .selectOption("single");
          await page
            .getByRole("combobox", { name: "Starting player", exact: true })
            .selectOption("you");
          await page.locator(".rift-start").click();
          await page.locator(".visual-controls").waitFor();
          const before = await save(page);
          const match = JSON.parse(before).match;
          assert.equal(match.players[0].deckId, own.id);
          assert.equal(match.players[1].deckId, other.id);
          assert.equal(match.fields[0].cardId, fieldId);
          assert.equal(match.botSettings.difficulty, "expert");
          await page.reload();
          const resume = page.getByRole("button", {
            name: "Resume duel",
            exact: true,
          });
          await resume.waitFor();
          assert.ok((await resume.innerText()).includes(own.label));
          assert.ok((await resume.innerText()).includes(other.label));
          assert.match(
            await resume.innerText(),
            /0–0.*Choose your opening hand/,
          );
          if (width <= 600) {
            const box = await resume.boundingBox();
            assert.ok(
              box.y >= 0 && box.y + box.height <= height,
              "resume is visible without scrolling",
            );
          }
          await noOverflow(page);
          await page.screenshot({ path: `${output}/${id}.png` });
          await player.selectOption(options[8].id);
          await page.reload();
          assert.equal(await player.inputValue(), options[8].id);
          assert.ok(
            (await resume.innerText()).includes(own.label),
            "resume describes the saved duel, not the next setup",
          );
          await resume.click();
          assert.equal(
            await save(page),
            before,
            "resume keeps the same opening",
          );
          await page
            .getByRole("button", { name: "Duel guide", exact: true })
            .click();
          await page.locator(".duel-guide").waitFor();
          assert.match(
            await page.locator(".duel-guide").innerText(),
            /Prepare your opening hand/,
          );
          assert.equal(
            await save(page),
            before,
            "manual guide does not commit a move",
          );
        } else if (scenario === "guide") {
          await page.goto(
            `${origin}/tests/returning-player-preview.html?mode=overview`,
          );
          await page
            .getByRole("button", { name: "Resume duel", exact: true })
            .click();
          const before = await save(page);
          const trigger = page.getByRole("button", {
            name: "Duel guide",
            exact: true,
          });
          await trigger.click();
          await page.locator(".duel-guide").waitFor();
          assert.match(
            await page.locator(".duel-guide").innerText(),
            /Your next decision/,
          );
          await page.locator(".duel-guide .gold-button").click();
          assert.deepEqual(
            (await guideState(page)).seen,
            ["opening"],
            "generic help never completes the scoring topic",
          );
          await trigger.click();
          await page
            .getByRole("button", { name: "Turn off guide", exact: true })
            .click();
          assert.equal((await guideState(page)).enabled, false);
          assert.ok(
            await trigger.isVisible(),
            "guide can be reopened after it is disabled",
          );
          await page.reload();
          await page
            .getByRole("button", { name: "Resume duel", exact: true })
            .click();
          assert.equal(await page.locator(".duel-guide").count(), 0);
          await trigger.click();
          await page.locator(".duel-guide").waitFor();
          assert.equal((await guideState(page)).enabled, true);
          assert.deepEqual((await guideState(page)).seen, ["opening"]);
          assert.equal(await save(page), before);
          await noOverflow(page);
          await page.screenshot({ path: `${output}/${id}.png` });
        } else {
          await page.goto(`${origin}/tests/returning-player-preview.html`);
          const before = await save(page),
            beforeArchive = await archive(page);
          await page
            .getByRole("button", { name: "Match history", exact: true })
            .click();
          const cards = page.locator(".history-match-open");
          await cards.first().waitFor();
          assert.equal(await cards.count(), 3);
          const search = page.getByRole("searchbox", {
            name: "Search matches",
            exact: true,
          });
          await search.fill("VI");
          assert.equal(await cards.count(), 2);
          await page
            .getByRole("combobox", { name: "Match result", exact: true })
            .selectOption("wins");
          assert.equal(await cards.count(), 1);
          assert.match(await cards.first().innerText(), /Viktor/);
          await page
            .getByRole("button", { name: "Reset filters", exact: true })
            .click();
          await page
            .getByRole("combobox", { name: "Sort matches", exact: true })
            .selectOption("oldest");
          assert.match(await cards.first().innerText(), /Viktor/);
          await page
            .getByRole("combobox", { name: "Sort matches", exact: true })
            .selectOption("newest");
          assert.match(await cards.first().innerText(), /Lux/);
          await cards.first().click();
          await page.waitForFunction(() =>
            document.activeElement?.classList.contains("history-replay"),
          );
          const panel = page.locator(".history-replay");
          assert.ok(
            (await panel.boundingBox()).y < height / 2,
            "selecting a match brings its replay into view",
          );
          await page.screenshot({ path: `${output}/${id}-replay.png` });
          await search.fill("no-such-match");
          assert.equal(await cards.count(), 0);
          assert.match(await panel.innerText(), /outside the current filters/);
          await page
            .getByRole("button", { name: "Back to saved matches", exact: true })
            .click();
          assert.ok(await search.evaluate((e) => document.activeElement === e));
          await page
            .getByRole("button", { name: "Reset filters", exact: true })
            .click();
          assert.equal(await cards.count(), 3);
          await page
            .getByRole("combobox", { name: "Match result", exact: true })
            .selectOption("losses");
          assert.equal(await cards.count(), 2);
          await noOverflow(page);
          await page.screenshot({ path: `${output}/${id}-filters.png` });
          assert.equal(
            await archive(page),
            beforeArchive,
            "searching and viewing do not rewrite the archive",
          );
          assert.equal(
            await save(page),
            before,
            "history preserves the unfinished duel",
          );
        }
        assert.deepEqual(errors, []);
        reports.push({ id, status: "passed" });
        console.log(`PASS ${id}`);
      } catch (error) {
        reports.push({ id, status: "failed", error: String(error), errors });
        await page.screenshot({ path: `${output}/${id}-failure.png` });
        console.error(`FAIL ${id}: ${error}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(reports, null, 2));
}
assert.ok(reports.every((r) => r.status === "passed"));
