import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

// Uses an existing Playwright install; no browser or dependency installation.
const playwright = await (
  process.env.PLAYWRIGHT_MODULE
    ? import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
    : import("playwright")
).catch(() => {
  throw new Error(
    "Playwright is unavailable. Set PLAYWRIGHT_MODULE to an existing Playwright index.mjs.",
  );
});
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5176";
const out = path.resolve(process.env.QA_OUTPUT || "test-results/action-stack");
await mkdir(out, { recursive: true });
const browsers = (process.env.QA_BROWSERS || "chromium,webkit").split(",");
const filter = process.env.QA_FILTER ? new RegExp(process.env.QA_FILTER) : null;
const viewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
];
const failures = [];
const reports = [];
const errors = [];
const saveKey = "riftbound-duel-save-v1";
const session = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), saveKey);
async function settleImages(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(
        document.querySelectorAll(
          ".action-stack img, .card-preview img, .unit-wrap img",
        ),
      ).map(async (img) => {
        if (!img.complete)
          await new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
      }),
    );
  });
}
async function resume(page, pause = true) {
  await page.getByRole("button", { name: "Resume duel", exact: true }).click();
  if (pause)
    await page.getByRole("button", { name: "Pause game", exact: true }).click();
}
async function fixture(browser, name, viewport = viewports[0], options = {}) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: options.reducedMotion || "no-preference",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => errors.push({ name, error: error.message }));
  await page.clock.install({ time: new Date("2026-10-02T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-02T12:00:01Z"));
  await page.goto(`${baseUrl}/tests/action-stack-preview.html?mode=${name}`);
  await resume(page, options.pause !== false);
  await settleImages(page);
  return { context, page };
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const fields = document.querySelector(".battlefields");
    const stack = document.querySelector(".action-stack");
    const rows = Array.from(
      document.querySelectorAll(".battlefield .field-half"),
    ).map((row) => {
      const cards = Array.from(row.querySelectorAll(".game-card"));
      const boxes = cards.map(rect);
      const half = rect(row);
      const rowStyle = getComputedStyle(row);
      const contentCenter =
        half.x +
        (half.width +
          parseFloat(rowStyle.paddingLeft) -
          parseFloat(rowStyle.paddingRight)) /
          2;
      const start = Math.min(...boxes.map((b) => b.x));
      const end = Math.max(...boxes.map((b) => b.x + b.width));
      return {
        half,
        boxes,
        centerOffset: Math.abs((start + end) / 2 - contentCenter),
        wrapperWidths: Array.from(row.querySelectorAll(".unit-wrap")).map(
          (wrap) => rect(wrap).width,
        ),
        powerOffsets: Array.from(row.querySelectorAll(".unit-wrap")).map(
          (wrap) => {
            const card = rect(wrap.querySelector(".game-card"));
            const badge = rect(wrap.querySelector(".unit-power"));
            return Math.abs(
              badge.x + badge.width / 2 - (card.x + card.width / 2),
            );
          },
        ),
      };
    });
    const controls = rect(document.querySelector(".match-controls"));
    const clickTargets = Array.from(
      document.querySelectorAll(
        ".action-stack-card, .match-toolbar button, .decision-actions button",
      ),
    )
      .filter((button) => !button.disabled)
      .map((button) => {
        const b = rect(button);
        const centerX = b.x + b.width / 2;
        const centerY = b.y + b.height / 2;
        const rail = button.closest(".action-stack-cards");
        const railBox = rail?.getBoundingClientRect();
        const clipped = railBox && (centerX < railBox.left || centerX > railBox.right);
        const hit = document.elementFromPoint(centerX, centerY);
        return {
          clipped,
          label: button.getAttribute("aria-label") || button.textContent.trim(),
          blocked: !hit || !button.contains(hit),
          rect: b,
        };
      });
    return {
      fields: rect(fields),
      stack: stack ? rect(stack) : null,
      rows,
      controls,
      clickTargets,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}
function checkGeometry(result, crowded = false) {
  assert.ok(
    result.horizontalOverflow <= 1,
    `horizontal page overflow: ${result.horizontalOverflow}px`,
  );
  for (const row of result.rows) {
    assert.ok(
      row.boxes.length,
      "Fixture must populate both owners at both fields",
    );
    assert.ok(
      row.centerOffset <= 3,
      `Battlefield row offset ${row.centerOffset.toFixed(1)}px`,
    );
    for (const offset of row.powerOffsets)
      assert.ok(offset <= 1.5, `Power badge offset ${offset.toFixed(1)}px`);
    if (!crowded)
      assert.ok(
        row.wrapperWidths.every(
          (width, i) => Math.abs(width - row.boxes[i].width) <= 2,
        ),
        "Card wrapper has intrinsic image width",
      );
    for (const box of row.boxes)
      assert.ok(
        box.x >= row.half.x - 2 &&
          box.x + box.width <= row.half.x + row.half.width + 2,
        "Card escapes its battlefield half",
      );
  }
  if (result.stack) {
    assert.ok(
      Math.abs(
        result.stack.x +
          result.stack.width / 2 -
          result.fields.x -
          result.fields.width / 2,
      ) < 2,
      "Stack is not horizontally centered in battlefields",
    );
    assert.ok(
      Math.abs(
        result.stack.y +
          result.stack.height / 2 -
          result.fields.y -
          result.fields.height / 2,
      ) <= 12,
      "Stack is not vertically centered in battlefields",
    );
    assert.ok(
      result.stack.y >= result.fields.y - 1 &&
        result.stack.y + result.stack.height <= result.fields.y + result.fields.height + 1,
      "Stack escapes battlefield track and covers base units",
    );
    assert.ok(
      result.stack.y + result.stack.height < result.controls.y,
      "Stack intersects bottom decision controls",
    );
  }
  assert.deepEqual(
    result.clickTargets.filter((target) => !target.clipped && target.blocked),
    [],
    "Critical control covered by another element",
  );
}
async function check(name, work) {
  if (filter && !filter.test(name)) return;
  try {
    await work();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
for (const browserName of browsers) {
  const browser = await playwright[browserName].launch({ headless: true });
  try {
    for (const viewport of [viewports[0], viewports[2], viewports[3]]) {
      await check(
        `${browserName} crowded chain ${viewport.width}x${viewport.height}`,
        async () => {
          const { context, page } = await fixture(
            browser,
            "chain&crowded",
            viewport,
          );
          try {
            const result = await geometry(page);
            checkGeometry(result, true);
            for (const info of await page
              .locator(".battlefield .unit-info")
              .all()) {
              await info.focus();
              assert.ok(
                await info.evaluate((button) => {
                  const b = button.getBoundingClientRect();
                  return button.contains(
                    document.elementFromPoint(
                      b.x + b.width / 2,
                      b.y + b.height / 2,
                    ),
                  );
                }),
                "Focused unit details blocked by central action chain",
              );
            }
            await page.screenshot({
              path: path.join(
                out,
                `${browserName}-crowded-chain-${viewport.width}x${viewport.height}.png`,
              ),
              animations: "disabled",
              fullPage: true,
            });
            reports.push({
              browser: browserName,
              mode: "crowded-chain",
              viewport,
              geometry: result,
            });
          } finally {
            await context.close();
          }
        },
      );
    }
    for (const viewport of [viewports[0], viewports[2], viewports[3]]) {
      for (const crowded of [false, true]) {
        await check(`${browserName} triple legal targets ${crowded ? "crowded " : ""}${viewport.width}x${viewport.height}`, async () => {
          const { context, page } = await fixture(browser, `triple${crowded ? "&crowded" : ""}&bases`, viewport, { pause: false });
          try {
            assert.equal(await page.locator(".action-stack-entry").count(), 3);
            checkGeometry(await geometry(page), crowded);
            for (const card of await page.locator(".action-stack-card").all()) {
              await card.scrollIntoViewIfNeeded();
              assert.ok(await card.evaluate((button) => {
                const b = button.getBoundingClientRect();
                return button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
              }), "A queued card cannot be reached through the center lane");
            }
            await page.locator('.hand [data-card-preview="ogn-046-298"]').click();
            const targetIds = await page.evaluate(() => window.actionStackFixture.targetIds);
            assert.ok(targetIds.includes("ally") && targetIds.includes("ally-right") && targetIds.includes("base-ally"));
            for (const id of targetIds) {
              const target = page.locator(`[data-unit-id="${id}"] .game-card`);
              assert.equal(await target.getAttribute("aria-pressed"), "true", `${id} is not highlighted as a legal target`);
              if (crowded && !id.startsWith("base-")) await target.focus();
              else await page.mouse.click(0, 0);
              assert.ok(await target.evaluate((button) => {
                const b = button.getBoundingClientRect();
                return button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
              }), `Legal target ${id} is blocked by a queued card`);
            }
            const chosenTarget = page.locator('[data-unit-id="ally-right"] .game-card');
            if (crowded) await chosenTarget.focus();
            const chosenBox = await chosenTarget.boundingBox();
            await page.mouse.click(chosenBox.x + chosenBox.width / 2, chosenBox.y + chosenBox.height / 2);
            const saved = await session(page);
            assert.equal(saved.match.stack.length, 4, "Clicking the battlefield target did not queue the reaction");
            assert.equal(saved.match.stack.at(-1).targetId, "ally-right");
            await page.getByRole("button", { name: "Pause game", exact: true }).click();
            await settleImages(page);
            await page.screenshot({ path: path.join(out, `${browserName}-triple-targets-${crowded ? "crowded-" : ""}${viewport.width}x${viewport.height}.png`), animations: "disabled", fullPage: true });
            reports.push({ browser: browserName, mode: crowded ? "triple-targets-crowded" : "triple-targets", viewport, geometry: await geometry(page), targetIds });
          } finally {
            await context.close();
          }
        });
      }
    }
    for (const viewport of viewports) {
      for (const mode of ["chain", "crowded"]) {
        await check(
          `${browserName} ${mode} ${viewport.width}x${viewport.height}`,
          async () => {
            const { context, page } = await fixture(browser, mode, viewport);
            try {
              if (mode === "chain") {
                assert.deepEqual(
                  await page
                    .locator(".action-stack-entry")
                    .evaluateAll((entries) =>
                      entries.map((entry) => [
                        entry.dataset.stackCard,
                        entry.dataset.stackStatus,
                      ]),
                    ),
                  [
                    ["ogn-058-298", "next"],
                    ["ogn-009-298", "waiting"],
                  ],
                );
              }
              const result = await geometry(page);
              reports.push({
                browser: browserName,
                mode,
                viewport,
                geometry: result,
              });
              await page.screenshot({
                path: path.join(
                  out,
                  `${browserName}-${mode}-${viewport.width}x${viewport.height}.png`,
                ),
                animations: "disabled",
                fullPage: true,
              });
              checkGeometry(result, mode === "crowded");
              if (mode === "chain") {
                await page.mouse.move(0, 0);
                await page
                  .locator(
                    '.action-stack-entry[data-stack-card="ogn-058-298"] .action-stack-card',
                  )
                  .hover();
                await page.clock.runFor(350);
                await settleImages(page);
                const preview = await page
                  .locator(".card-preview")
                  .boundingBox();
                assert.ok(
                  preview &&
                    preview.x >= 0 &&
                    preview.y >= 0 &&
                    preview.x + preview.width <= viewport.width + 1 &&
                    preview.y + preview.height <= viewport.height + 1,
                  "Hovered spell preview escapes viewport",
                );
                assert.match(
                  await page.locator(".card-preview-rules").innerText(),
                  /Give a unit/,
                );
                await page.screenshot({
                  path: path.join(
                    out,
                    `${browserName}-rules-preview-${viewport.width}x${viewport.height}.png`,
                  ),
                  animations: "disabled",
                  fullPage: true,
                });
                await page.keyboard.press("Escape");
                assert.equal(await page.locator(".card-preview").count(), 0);
              } else {
                // Crowded rows overlap; keyboard focus must expose each detail control.
                for (const info of await page
                  .locator(".battlefield .unit-info")
                  .all()) {
                  await info.focus();
                  assert.ok(
                    await info.evaluate((button) => {
                      const b = button.getBoundingClientRect();
                      return button.contains(
                        document.elementFromPoint(
                          b.x + b.width / 2,
                          b.y + b.height / 2,
                        ),
                      );
                    }),
                    "Focused unit details button remains covered in crowded row",
                  );
                }
              }
            } finally {
              await context.close();
            }
          },
        );
      }
    }
    for (const mode of ["human-play", "ai-play", "effect", "hidden"]) {
      await check(`${browserName} ${mode} public presentation`, async () => {
        const publicPlay = mode === "human-play" || mode === "ai-play";
        const { context, page } = await fixture(browser, mode, viewports[0], {
          pause: !publicPlay,
        });
        try {
          if (publicPlay) {
            const flight = page.locator(".action-stack-flight");
            assert.equal(
              await flight.count(),
              1,
              "Public play has no flight animation layer",
            );
            assert.equal(
              await flight.evaluate((el) => getComputedStyle(el).animationName),
              mode === "ai-play" ? "stack-play-from-ai" : "stack-play-from-you",
              "Flight does not enter from its player's side",
            );
            assert.equal(await flight.getAttribute("aria-hidden"), "true");
            assert.equal(
              await flight.evaluate((el) => getComputedStyle(el).pointerEvents),
              "none",
              "Animated card blocks real card controls",
            );
            await page
              .getByRole("button", { name: "Pause game", exact: true })
              .click();
          }
          if (mode === "hidden") {
            assert.equal(await page.locator(".action-stack").count(), 0);
            assert.equal(
              await page
                .locator(
                  '[data-card-preview="ogn-083-298"], img[alt="Consult the Past"]',
                )
                .count(),
              0,
            );
            assert.ok(
              !(await page.locator("body").innerText()).includes(
                "Consult the Past",
              ),
              "AI hidden name leaked into visible text",
            );
          } else {
            assert.equal(await page.locator(".action-stack-entry").count(), 1);
            assert.equal(
              await page
                .locator(".action-stack-entry")
                .getAttribute("data-stack-status"),
              mode === "effect" ? "resolving" : "playing",
            );
            assert.equal(
              await page
                .locator(".action-stack-entry")
                .getAttribute("data-stack-player"),
              mode === "ai-play" || mode === "effect" ? "1" : "0",
            );
            checkGeometry(await geometry(page));
            if (mode === "effect")
              assert.match(
                await page.locator(".action-stack-outcomes").innerText(),
                /health/,
              );
            await page.screenshot({
              path: path.join(out, `${browserName}-${mode}.png`),
              animations: "disabled",
              fullPage: true,
            });
            const before = await session(page);
            await page.goto(baseUrl);
            await resume(page);
            assert.deepEqual(
              await session(page),
              before,
              "Reload altered the saved review",
            );
            assert.equal(
              await page
                .locator(".action-stack-entry")
                .getAttribute("data-stack-status"),
              mode === "effect" ? "resolving" : "playing",
            );
          }
        } finally {
          await context.close();
        }
      });
    }
    await check(
      `${browserName} actual human reaction and resolution`,
      async () => {
        const { context, page } = await fixture(
          browser,
          "reaction",
          viewports[0],
          { pause: false },
        );
        try {
          await page.locator('.hand [data-card-preview="ogn-046-298"]').click();
          await page.locator('[data-unit-id="ally"] .game-card').click();
          let saved = await session(page);
          assert.equal(
            saved.match.stack.length,
            2,
            "Playing reaction did not push onto engine chain",
          );
          assert.equal(saved.match.stack.at(-1).cardId, "ogn-046-298");
          // Advance only already recorded presentation; freeze as soon as both cards appear.
          for (
            let step = 0;
            step < 20 &&
            (await page
              .locator(
                '.action-stack-entry[data-stack-card="ogn-046-298"][data-stack-status="next"]',
              )
              .count()) === 0;
            step++
          )
            await page.clock.runFor(150);
          assert.equal(
            await page
              .locator(".action-stack-entry")
              .first()
              .getAttribute("data-stack-card"),
            "ogn-046-298",
            "Human reaction is not presented first",
          );
          await page
            .getByRole("button", { name: "Pause game", exact: true })
            .click();
          await settleImages(page);
          await page.screenshot({
            path: path.join(out, `${browserName}-actual-reaction.png`),
            animations: "disabled",
            fullPage: true,
          });
          saved = await session(page);
          await page.goto(baseUrl);
          await resume(page, false);
          assert.deepEqual(
            await session(page),
            saved,
            "Reload changed pending reaction",
          );
          // AI passes; the human explicitly chooses to continue without a reaction.
          for (let step = 0; step < 100; step++) {
            await page.mouse.move(0, 0);
            await page.clock.runFor(300);
            const current = await session(page);
            if (
              !current.review &&
              current.match.priorityPlayer === 0 &&
              current.match.stack.length
            ) {
              const button = page.getByRole("button", {
                name: "Continue without reacting",
                exact: true,
              });
              if (await button.count()) await button.click();
            }
            if (!current.review && current.match.stack.length === 0) break;
          }
          saved = await session(page);
          assert.equal(
            saved.match.stack.length,
            0,
            "Reaction chain failed to resolve",
          );
          const ally = saved.match.units.find((unit) => unit.id === "ally");
          assert.ok(
            ally && ally.damage === 3,
            "Incoming action did not apply after reaction",
          );
          assert.ok(
            ally.temporaryMight >= 1,
            "Reaction did not apply Might before incoming damage",
          );
        } finally {
          await context.close();
        }
      },
    );
    await check(
      `${browserName} large preview focus hover Escape and playback pause`,
      async () => {
        const { context, page } = await fixture(
          browser,
          "ai-play",
          viewports[0],
          { pause: false },
        );
        try {
          const card = page.locator(".action-stack-card");
          await card.focus();
          await page.locator(".card-preview").waitFor({ state: "visible" });
          await page.clock.runFor(250);
          await settleImages(page);
          const before = await session(page);
          await page.clock.runFor(5000);
          assert.deepEqual(
            await session(page),
            before,
            "Playback advanced while reading card preview",
          );
          const preview = await page.locator(".card-preview").boundingBox();
          assert.ok(
            preview.width >= 700 &&
              preview.x >= 0 &&
              preview.y >= 0 &&
              preview.x + preview.width <= 1441 &&
              preview.y + preview.height <= 901,
            "Large art/rules preview escapes viewport or is too small",
          );
          await page.screenshot({
            path: path.join(out, `${browserName}-large-preview.png`),
            animations: "disabled",
            fullPage: true,
          });
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator(".card-preview").count(),
            0,
            "Escape did not close focused preview",
          );
          await page
            .getByRole("button", { name: "Pause game", exact: true })
            .click();
          await page.mouse.move(0, 0);
          await card.hover();
          await page.clock.runFor(350);
          assert.equal(
            await page.locator(".card-preview").count(),
            1,
            "Hover did not show full card preview",
          );
          await page.keyboard.press("Escape");
          assert.equal(await page.locator(".card-preview").count(), 0);
        } finally {
          await context.close();
        }
      },
    );
    await check(`${browserName} reduced motion`, async () => {
      const { context, page } = await fixture(
        browser,
        "human-play",
        viewports[0],
        { pause: false, reducedMotion: "reduce" },
      );
      try {
        const animations = await page
          .locator(".action-stack-card, .action-stack-flight")
          .evaluateAll((cards) =>
            cards.flatMap((card) =>
              card
                .getAnimations()
                .filter((animation) => animation.playState === "running")
                .map((animation) => animation.animationName),
            ),
          );
        assert.deepEqual(
          animations,
          [],
          "Reduced motion left running card flight animations",
        );
        assert.equal(
          await page
            .locator(".action-stack-entry")
            .getAttribute("data-stack-status"),
          "playing",
        );
      } finally {
        await context.close();
      }
    });
  } finally {
    await browser.close();
  }
}
if (errors.length)
  failures.push({ name: "browser page errors", error: JSON.stringify(errors) });
await writeFile(
  path.join(out, "report.json"),
  JSON.stringify({ baseUrl, reports, errors, failures }, null, 2),
);
console.log(`Screenshots and report: ${out}`);
assert.deepEqual(failures, [], "Central stack browser checks failed");
