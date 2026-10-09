// Isolated synthetic saves on loopback only; no user match is modified.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
await mkdir("test-results/hidden-payment", { recursive: true });
const engines = [["chromium", chromium, {}]];
if (process.env.WEBKIT_EXECUTABLE)
  engines.push([
    "webkit",
    webkit,
    { executablePath: process.env.WEBKIT_EXECUTABLE },
  ]);

const savedMatch = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("riftbound-duel-save-v1")).match,
  );
async function openFixture(page, scenario) {
  await page.goto(
    `${origin}/tests/hidden-payment-preview.html?scenario=${scenario}`,
  );
  await page.getByRole("button", { name: "Resume duel", exact: true }).tap();
  await page.locator(".visual-controls").waitFor();
}
async function selectHand(page, outsideDetails = false) {
  await page
    .locator(".hand-card-wrap .game-card")
    .first()
    .tap(outsideDetails ? { position: { x: 16, y: 16 } } : {});
  assert.equal(
    await page
      .locator('[data-hidden-mode="hide"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .locator('[data-hidden-mode="play"]')
      .getAttribute("aria-pressed"),
    "false",
  );
}
async function verifyFits(page, height) {
  const controls = await page.locator(".visual-controls").boundingBox();
  assert.ok(
    controls.y >= 0 && controls.y + controls.height <= height + 1,
    "Hidden controls fit the viewport",
  );
  for (const mode of ["hide", "play"]) {
    const button = await page
      .locator(`[data-hidden-mode="${mode}"]`)
      .boundingBox();
    assert.ok(
      button.width >= 44 && button.height >= 40,
      "mode switch has a usable touch target",
    );
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  const handCard = await page
    .locator(".hand-card-wrap .game-card")
    .first()
    .evaluate((card) => {
      const bounds = card.getBoundingClientRect();
      let top = bounds.top;
      let bottom = bounds.bottom;
      for (
        let parent = card.parentElement;
        parent;
        parent = parent.parentElement
      ) {
        if (
          /(hidden|clip|scroll|auto)/.test(getComputedStyle(parent).overflowY)
        ) {
          const clip = parent.getBoundingClientRect();
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      return bottom - top;
    });
  assert.ok(
    handCard >= 40,
    `mode controls leave a visible, tappable hand card (${handCard.toFixed(1)}px visible)`,
  );
  const hint = await page
    .locator(".visual-controls .decision-copy p")
    .boundingBox();
  assert.ok(
    hint.y + hint.height <= controls.y + controls.height + 1,
    "Hidden payment explanation stays inside its bar",
  );
}
async function waitForCast(page) {
  await page.waitForFunction(() => {
    const match = JSON.parse(
      localStorage.getItem("riftbound-duel-save-v1") || "{}",
    ).match;
    return match?.players[0].cardsPlayedThisTurn === 1;
  });
  return savedMatch(page);
}
for (const [engine, type, options] of engines) {
  const browser = await type.launch({ headless: true, ...options });
  try {
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [844, 390],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      try {
        for (const scenario of ["hide", "exhausted"]) {
          await openFixture(page, scenario);
          await selectHand(page);
          const bar = page.locator(".visual-controls");
          assert.match(
            await bar.innerText(),
            /recycling a rune|recycle (?:a|any) rune/i,
          );
          assert.equal(
            await bar
              .locator('.context-action[data-action-id^="play:"]')
              .count(),
            0,
          );
          assert.equal(
            await bar
              .locator('.context-action[data-action-id^="hide:"]')
              .count(),
            1,
          );
          await verifyFits(page, height);
          const before = await savedMatch(page);
          if (scenario === "hide") {
            await page.locator('[data-mobile-location="field:0"]').tap();
            await page
              .locator('[data-unit-id="hidden-own-unit"] > .game-card')
              .tap();
            const afterUnitTap = await savedMatch(page);
            assert.deepEqual(
              afterUnitTap.players[0],
              before.players[0],
              "selecting a unit in Hide mode cannot pay the normal spell cost",
            );
            assert.equal(afterUnitTap.hidden.length, 0);
            // This 76px card has a separate 44px details button at lower right.
            await selectHand(page, true);
          }
          await page.screenshot({
            path: `test-results/hidden-payment/${engine}-${width}x${height}-${scenario}.png`,
          });
          await bar.locator('.context-action[data-action-id^="hide:"]').tap();
          await page.waitForFunction(() =>
            JSON.parse(
              localStorage.getItem("riftbound-duel-save-v1") || "{}",
            ).match?.hidden.some((card) => card.cardId === "ogn-057-298"),
          );
          const after = await savedMatch(page);
          assert.equal(
            after.players[0].energy,
            before.players[0].energy,
            "Hide spends no Energy",
          );
          assert.equal(
            after.players[0].runes.length,
            0,
            "an exhausted rune pays the one Power",
          );
          assert.equal(
            after.players[0].runeDeck.length,
            before.players[0].runeDeck.length + 1,
          );
          assert.equal(after.players[0].hand.length, 0);
          assert.equal(
            after.players[0].cardsPlayedThisTurn,
            0,
            "hiding is not playing the card",
          );
          assert.equal(after.hidden[0].hiddenTurn, before.turn);
        }

        await openFixture(page, "reveal");
        await page.locator('[data-mobile-location="field:0"]').tap();
        await page
          .locator('[data-hidden-source="hidden:hidden-free-block"]')
          .tap();
        assert.match(
          await page.locator(".visual-controls").innerText(),
          /base cost.*ignored/i,
        );
        await page
          .locator('.context-action[data-target-id="hidden-own-unit"]')
          .tap();
        const revealed = await waitForCast(page);
        assert.equal(revealed.players[0].energy, 0);
        assert.equal(revealed.players[0].power, 0);
        assert.equal(revealed.players[0].runes.length, 0);
        assert.equal(
          revealed.hidden.length,
          0,
          "a previously hidden card can be played with no resources",
        );

        await openFixture(page, "blocked");
        await selectHand(page);
        assert.match(
          await page.locator(".visual-controls").innerText(),
          /Control a battlefield/i,
        );
        assert.equal(
          await page
            .locator('.context-action[data-action-id^="hide:"]')
            .count(),
          0,
        );
        await page.locator('[data-hidden-mode="play"]').tap();
        assert.equal(
          await page
            .locator('[data-hidden-mode="play"]')
            .getAttribute("aria-pressed"),
          "true",
        );
        await verifyFits(page, height);
        const moreOptions = page.getByRole("button", {
          name: "More options",
          exact: true,
        });
        await moreOptions.tap();
        assert.equal(
          await page
            .locator('.context-action[data-target-id="hidden-second-ally"]')
            .count(),
          1,
          "the target pager reaches the second friendly unit",
        );
        assert.equal(await moreOptions.isDisabled(), true);
        await page.screenshot({
          path: `test-results/hidden-payment/${engine}-${width}x${height}-play.png`,
        });
        await page
          .getByRole("button", { name: "Previous options", exact: true })
          .tap();
        await page
          .locator('.context-action[data-target-id="hidden-own-unit"]')
          .tap();
        const played = await waitForCast(page);
        assert.equal(
          played.players[0].energy,
          2,
          "explicit normal play pays Block's 2 Energy printed cost",
        );
        assert.equal(played.players[0].runes.length, 1);
        assert.equal(played.hidden.length, 0);
        assert.deepEqual(errors, []);
        console.log(
          `${engine} ${width}x${height}: explicit Hide/Play, exhausted rune payment, no accidental cast, free later reveal, blocked explanation, normal printed cost`,
        );
      } catch (error) {
        await page.screenshot({
          path: `test-results/hidden-payment/${engine}-${width}x${height}-failure.png`,
        });
        throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
