// Targeted action geometry on isolated local fixtures, including long spell names.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const out = process.env.QA_OUTPUT || "test-results/target-dock-audit";
const stage = process.env.QA_STAGE || "after";
await mkdir(out, { recursive: true });
const reports = [];
const engines = [["chromium", chromium, {}]];
if (process.env.WEBKIT_EXECUTABLE)
  engines.push([
    "webkit",
    webkit,
    { executablePath: process.env.WEBKIT_EXECUTABLE },
  ]);
for (const [engine, type, options] of engines) {
  const browser = await type.launch({ headless: true, ...options });
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 600],
      [1024, 768],
      [390, 844],
      [844, 390],
    ]) {
      if (engine === "webkit" && width > 1000) continue;
      for (const long of [false, true]) {
        const context = await browser.newContext({
          viewport: { width, height },
          isMobile: width < 1000,
          hasTouch: width < 1000,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        try {
          await page.goto(
            `${origin}/tests/interaction-audit-preview.html?scenario=reaction${long ? "&long=1" : ""}`,
          );
          await page
            .getByRole("button", { name: "Resume duel", exact: true })
            .click();
          await page
            .locator(".hand-card-wrap .game-card")
            .first()
            .click({ position: { x: 4, y: 4 } });
          await page.locator(".context-action.has-target").waitFor();
          const geometry = await page.evaluate(() => {
            const bounds = (element) => {
              const b = element.getBoundingClientRect();
              return {
                left: b.left,
                right: b.right,
                top: b.top,
                bottom: b.bottom,
                width: b.width,
                height: b.height,
              };
            };
            const button = document.querySelector(".context-action.has-target");
            const within = (inner, outer) =>
              inner.top >= outer.top - 1 &&
              inner.bottom <= outer.bottom + 1 &&
              inner.left >= outer.left - 1 &&
              inner.right <= outer.right + 1;
            const b = bounds(button);
            const parts = [
              ...button.querySelectorAll(
                ".decision-action-label,.decision-target strong,.decision-target-location,button>span>small",
              ),
            ]
              .filter((el) => el.getClientRects().length)
              .map((el) => ({
                text: el.textContent,
                bounds: bounds(el),
                inside: within(bounds(el), b),
              }));
            const dock = bounds(document.querySelector(".visual-controls"));
            const hand = bounds(document.querySelector(".hand-section"));
            return {
              button: b,
              dock,
              hand,
              parts,
              buttonFitsDock: within(b, dock),
              horizontalOverflow:
                document.documentElement.scrollWidth - innerWidth,
              viewportHeight: innerHeight,
            };
          });
          const id = `target-dock-${stage}-${engine}-${width}x${height}-${long ? "long" : "normal"}`;
          await page.screenshot({ path: `${out}/${id}.png` });
          reports.push({ engine, width, height, long, geometry });
          console.log(JSON.stringify({ id, ...geometry }));
          if (stage !== "before") {
            assert.ok(
              geometry.parts.every((part) => part.inside),
              "action text remains inside target button",
            );
            assert.ok(
              geometry.buttonFitsDock,
              "target button remains inside action dock",
            );
            assert.ok(
              geometry.horizontalOverflow <= 1,
              "no horizontal page overflow",
            );
            assert.ok(
              geometry.dock.bottom <= height + 1,
              "dock remains in viewport",
            );
            assert.ok(
              geometry.hand.top >= 0 && geometry.hand.bottom <= height + 1,
              "hand remains in viewport",
            );
          }
        } finally {
          await context.close();
          await writeFile(
            `${out}/target-dock-${stage}.json`,
            JSON.stringify(reports, null, 2),
          );
        }
      }
    }
  } finally {
    await browser.close();
  }
}
