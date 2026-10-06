// Uses an existing Playwright installation and an isolated, synthetic dev save.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:5178";
const out = resolve(process.env.QA_OUTPUT || "test-results/playback");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(10_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const session = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("riftbound-duel-save-v1")),
  );
const enter = async (path) => {
  await page.goto(`${base}${path}`);
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  await page.locator(".match-controls").waitFor();
};
const checks = [];
try {
  await enter("/tests/playback-preview.html");
  const original = JSON.stringify((await session()).match);
  await page.getByLabel("Playback speed", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Next effect", exact: true }).click();
  await page
    .getByRole("button", { name: "Previous effect", exact: true })
    .click();
  assert.equal((await session()).review.index, 0);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Next effect", exact: true })
      .click();
  assert.equal(JSON.stringify((await session()).match), original);
  assert.equal(
    await page
      .locator(".moment-title")
      .evaluate((e) => getComputedStyle(e).opacity),
    "1",
  );
  checks.push(
    "Forward/backward steps preserve the match and show a readable paused phase",
  );

  await enter("/");
  assert.equal((await session()).paused, true);
  assert.equal((await session()).review.index, 3);
  assert.equal(
    await page.getByLabel("Playback speed", { exact: true }).inputValue(),
    "2",
  );
  checks.push("Reload restores pause, frame and speed");

  for (const [width, height] of [
    [1280, 720],
    [390, 844],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    for (const locale of ["en", "sr", "it"]) {
      await page.locator(".language-selector select").selectOption(locale);
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.evaluate(() => ({
        overflow: [
          document.documentElement.scrollWidth - innerWidth,
          document.documentElement.scrollHeight - innerHeight,
        ],
        outside: Array.from(
          document.querySelectorAll(
            ".match-toolbar button, .match-toolbar select, .review-navigation button, .decision-actions > button",
          ),
        )
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width &&
              (r.left < -1 ||
                r.right > innerWidth + 1 ||
                r.bottom > innerHeight + 1)
            );
          })
          .map((e) => e.getAttribute("aria-label") || e.textContent),
        overlaps: [".match-toolbar", ".decision-actions"].flatMap(
          (selector) => {
            const controls = [
              ...document
                .querySelector(selector)
                .querySelectorAll("button, select"),
            ]
              .map((e) => ({
                label: e.getAttribute("aria-label") || e.textContent,
                rect: e.getBoundingClientRect(),
              }))
              .filter(({ rect }) => rect.width && rect.height);
            return controls.flatMap((a, i) =>
              controls
                .slice(i + 1)
                .filter(
                  (b) =>
                    a.rect.right > b.rect.left + 1 &&
                    b.rect.right > a.rect.left + 1 &&
                    a.rect.bottom > b.rect.top + 1 &&
                    b.rect.bottom > a.rect.top + 1,
                )
                .map((b) => [a.label, b.label]),
            );
          },
        ),
      }));
      assert.deepEqual(
        geometry,
        { overflow: [0, 0], outside: [], overlaps: [] },
        `${width} ${locale}`,
      );
      assert.equal(JSON.stringify((await session()).match), original);
      await page.screenshot({
        path: resolve(out, `paused-${width}-${locale}.png`),
      });
    }
  }
  checks.push(
    "All controls fit desktop, 390px and 320px in English, Serbian and Italian",
  );

  await page.locator(".language-selector select").selectOption("en");
  while (
    (await session()).review.index <
    (await session()).review.frames.length - 1
  )
    await page
      .getByRole("button", { name: "Next effect", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  assert.equal((await session()).review, null);
  assert.equal((await session()).paused, true);
  assert.equal(JSON.stringify((await session()).match), original);
  await page
    .getByRole("button", { name: "Resume game", exact: true })
    .last()
    .click();
  await page.locator(".end-turn").waitFor();
  assert.equal((await session()).paused, false);
  checks.push(
    "Finishing review remains paused; resuming restores the human decision",
  );

  await page.setViewportSize({ width: 1280, height: 720 });
  await enter("/tests/playback-preview.html?mode=reaction");
  assert.equal(
    await page.locator(".turn-indicator").textContent(),
    "Your reaction",
  );
  assert.equal(
    await page.locator(".turn-owner").textContent(),
    "Opponent turn",
  );
  const reaction = JSON.stringify(await session());
  // This is a negative timer assertion: a playable response must wait indefinitely.
  await page.waitForTimeout(3500);
  assert.equal(JSON.stringify(await session()), reaction);
  await page.screenshot({ path: resolve(out, "reaction-desktop.png") });
  await page.locator(".hand .playable").click();
  await page.locator(".context-action").first().waitFor();
  assert.equal(
    await page.locator(".decision-kicker").textContent(),
    "Your reaction",
  );
  checks.push(
    "2x playback waits for a playable reaction during the opponent turn",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(out, "report.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
}
