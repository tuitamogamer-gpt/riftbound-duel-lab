// Browser interactions against synthetic saves on loopback; never user data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5199";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const output = process.env.QA_OUTPUT || "test-results/interaction-audit";
await mkdir(output, { recursive: true });
const reports = [];
const save = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("riftbound-duel-save-v1")),
  );
const match = async (page) => (await save(page)).match;
const act = (page, locator) =>
  page.viewportSize().width < 600 ? locator.tap() : locator.click();
async function resume(page) {
  await act(
    page,
    page.getByRole("button", { name: "Resume duel", exact: true }),
  );
  await page.locator(".visual-controls").waitFor();
}
async function fixture(page, scenario) {
  await page.goto(
    `${origin}/tests/interaction-audit-preview.html?scenario=${scenario}`,
  );
  await resume(page);
}
async function idle(page) {
  await page.waitForFunction(
    () =>
      !JSON.parse(localStorage.getItem("riftbound-duel-save-v1") || "{}")
        .review,
    undefined,
    { timeout: 15000 },
  );
  await page
    .locator(".playing-indicator")
    .waitFor({ state: "hidden", timeout: 15000 });
}
async function unit(page, id) {
  const location = (await match(page)).units.find((u) => u.id === id)?.location;
  const tab = page.locator(`[data-mobile-location="${location}"]`);
  if (await tab.isVisible()) await act(page, tab);
  await act(page, page.locator(`[data-unit-id="${id}"] > .game-card`));
}
async function hand(page) {
  await act(page, page.locator(".hand-card-wrap .game-card").first());
}
async function fits(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    "no horizontal page overflow",
  );
  const bar = await page.locator(".visual-controls").boundingBox();
  assert.ok(
    bar && bar.y >= 0 && bar.y + bar.height <= page.viewportSize().height + 1,
    "action controls fit viewport",
  );
}
const scenarios = {
  async fresh_mulligan(page) {
    await page.goto(origin);
    await act(page, page.locator(".rift-start"));
    await page.locator(".visual-controls").waitFor();
    await page.waitForFunction(
      () => {
        const session = JSON.parse(
          localStorage.getItem("riftbound-duel-save-v1") || "{}",
        );
        return session.match?.priorityPlayer === 0 && !session.review;
      },
      undefined,
      { timeout: 15000 },
    );
    const before = await match(page);
    assert.equal(before.phase, "mulligan");
    const cards = page.locator(".hand-card-wrap .game-card");
    await act(page, cards.nth(0));
    await act(page, cards.nth(1));
    await page
      .getByRole("button", { name: "Replace 2 cards", exact: true })
      .waitFor();
    await act(page, cards.nth(1));
    await act(
      page,
      page.getByRole("button", { name: "Replace 1 card", exact: true }),
    );
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("riftbound-duel-save-v1") || "{}").match
          ?.players[0].mulliganDone,
    );
    assert.equal(
      (await match(page)).players[0].hand.length,
      before.players[0].hand.length,
    );
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("riftbound-duel-save-v1") || "{}").match
          ?.phase !== "mulligan",
      undefined,
      { timeout: 15000 },
    );
    await fits(page);
    return "Fresh duel, two-card selection, deselection, one-card replacement, opponent mulligan and main phase";
  },
  async grouped_movement(page) {
    await page.goto(`${origin}/tests/movement-preview.html`);
    await resume(page);
    const before = await match(page);
    await unit(page, "unit-1");
    assert.deepEqual((await match(page)).pendingMove.unitIds, [
      "unit-0",
      "unit-1",
    ]);
    await unit(page, "unit-1");
    await unit(page, "unit-0");
    assert.equal(await page.locator(".confirm-decision").isDisabled(), true);
    assert.deepEqual((await match(page)).units, before.units);
    await act(
      page,
      page.getByRole("button", { name: "Cancel movement", exact: true }),
    );
    assert.equal((await match(page)).pendingMove, null);
    assert.deepEqual((await match(page)).units, before.units);
    await unit(page, "unit-0");
    await act(
      page,
      page.locator('[data-action-id="move-start:unit-0:field:1"]'),
    );
    await unit(page, "unit-1");
    await fits(page);
    await act(
      page,
      page.getByRole("button", { name: "Move 2 units", exact: true }),
    );
    const moved = await match(page);
    for (const id of ["unit-0", "unit-1"]) {
      assert.equal(moved.units.find((u) => u.id === id).location, "field:1");
      assert.equal(moved.units.find((u) => u.id === id).ready, false);
    }
    return "Group add/remove, empty disabled confirm, cancel without mutations, restart and two-unit move";
  },
  async combat_assignment(page) {
    await fixture(page, "damage");
    await unit(page, "practice-shielded");
    assert.equal(
      (await match(page)).combat.assignments[0]["practice-shielded"],
      6,
    );
    await idle(page);
    await unit(page, "practice-defender");
    await page.waitForFunction(
      () => {
        const m = JSON.parse(
          localStorage.getItem("riftbound-duel-save-v1") || "{}",
        ).match;
        return m && !m.combat;
      },
      undefined,
      { timeout: 20000 },
    );
    const result = await match(page);
    assert.ok(result.units.some((u) => u.id === "practice-attacker"));
    assert.ok(
      !result.units.some((u) =>
        ["practice-shielded", "practice-defender"].includes(u.id),
      ),
    );
    return "Assign lethal through prevention, assign remainder, opponent assignment, simultaneous damage and surviving attacker";
  },
  async combat_confirm(page) {
    await fixture(page, "combat-confirm");
    await act(
      page,
      page
        .getByRole("button", { name: "Confirm damage assignment", exact: true })
        .first(),
    );
    assert.notEqual((await match(page)).combat?.assigningPlayer, 0);
    return "Explicit damage confirmation advances to opponent assignment";
  },
  async reaction_chain(page) {
    await fixture(page, "reaction");
    assert.equal((await match(page)).stack.length, 1);
    await hand(page);
    await act(page, page.locator(".context-action").first());
    const cast = await match(page);
    assert.equal(cast.stack.length, 2);
    assert.equal(cast.stack.at(-1).cardId, "ogn-064-298");
    await page.waitForFunction(
      () => {
        const m = JSON.parse(
          localStorage.getItem("riftbound-duel-save-v1") || "{}",
        ).match;
        return m && !m.stack.length;
      },
      undefined,
      { timeout: 20000 },
    );
    assert.equal(
      (await match(page)).units.find((u) => u.id === "practice-protected")
        .damage,
      0,
    );
    return "Reaction targets incoming spell, joins stack, priority pass resolves counter without damage";
  },
  async reaction_pass(page) {
    await fixture(page, "reaction");
    await act(
      page,
      page.getByRole("button", {
        name: "Continue without reacting",
        exact: true,
      }),
    );
    await page.waitForFunction(
      () => {
        const m = JSON.parse(
          localStorage.getItem("riftbound-duel-save-v1") || "{}",
        ).match;
        return m && !m.stack.length;
      },
      undefined,
      { timeout: 20000 },
    );
    const after = await match(page);
    assert.equal(
      after.units.find((u) => u.id === "practice-protected").damage,
      3,
    );
    assert.equal(after.players[0].hand[0], "ogn-064-298");
    return "Explicit reaction pass resolves incoming damage without spending the available counterspell";
  },
  async manual_payment(page) {
    await fixture(page, "payment");
    const before = await match(page);
    await hand(page);
    await act(page, page.locator(".context-action").first());
    await page.locator(".payment-picker").waitFor();
    await act(
      page,
      page.getByRole("button", { name: "Choose rune order", exact: true }),
    );
    await act(
      page,
      page.locator('[data-payment-rune="audit-calm-0"] button').last(),
    );
    assert.equal(
      await page
        .locator("[data-payment-rune]")
        .first()
        .getAttribute("data-payment-rune"),
      "audit-calm-1",
    );
    await act(
      page,
      page.getByRole("button", { name: "Back to table", exact: true }),
    );
    assert.deepEqual((await match(page)).players, before.players);
    assert.deepEqual((await match(page)).units, before.units);
    await act(page, page.locator(".context-action").first());
    await act(
      page,
      page.getByRole("button", { name: "Choose rune order", exact: true }),
    );
    await act(
      page,
      page.locator('[data-payment-rune="audit-calm-0"] button').last(),
    );
    const preview = await page
      .locator("[data-payment-rune]")
      .evaluateAll((rows) =>
        rows.map((row) => ({
          id: row.dataset.paymentRune,
          status: row.dataset.paymentStatus,
        })),
      );
    await act(
      page,
      page.getByRole("button", { name: "Pay and confirm", exact: true }),
    );
    const after = await match(page);
    assert.equal(after.players[0].hand.length, 0);
    for (const rune of preview) {
      const paid = after.players[0].runes.find((r) => r.id === rune.id);
      if (rune.status === "recycled") assert.equal(paid, undefined);
      if (rune.status === "exhausted") assert.equal(paid.ready, false);
      if (rune.status === "retained") assert.equal(paid.ready, true);
    }
    return "Manual rune reorder previews exact payment; cancel preserves state; confirm matches every rune outcome";
  },
  async save_reload_resume(page) {
    await fixture(page, "payment");
    await hand(page);
    await act(page, page.locator(".context-action").first());
    await act(
      page,
      page.getByRole("button", { name: "Pay and confirm", exact: true }),
    );
    const before = await match(page);
    await page.goto(origin);
    await resume(page);
    assert.deepEqual(
      await match(page),
      before,
      "reload cannot replay or duplicate committed payment",
    );
    await idle(page);
    const after = await match(page);
    assert.equal(
      after.units.filter((u) => u.cardId === "ogn-049-298" && u.owner === 0)
        .length,
      1,
    );
    assert.equal(after.players[0].cardsPlayedThisTurn, 1);
    return "Reload resumes committed action and presentation without duplicate unit or payment";
  },
  async training(page) {
    await page.goto(origin);
    await act(
      page,
      page.getByRole("button", { name: "Training lab", exact: true }),
    );
    await page.locator(".training-lab").waitFor();
    await act(page, page.locator(".training-hand-card .game-card"));
    await act(page, page.locator(".training-actions button").first());
    await page.locator(".training-success").waitFor();
    await act(
      page,
      page.getByRole("button", { name: "Undo practice move", exact: true }),
    );
    assert.equal(await page.locator(".training-success").count(), 0);
    assert.equal(await page.locator(".training-hand-card").count(), 1);
    await act(page, page.locator(".training-actions button").first());
    await act(
      page,
      page.getByRole("button", { name: "Next exercise", exact: true }),
    );
    assert.equal(
      await page.locator("#training-goal").innerText(),
      "Move together and conquer",
    );
    await act(page, page.locator(".training-actions button").first());
    await act(
      page,
      page.getByRole("button", { name: "Retry exercise", exact: true }),
    );
    assert.equal(await page.locator(".training-selection").count(), 0);
    return "Training deploy, completion, undo, next lesson and retry remain interactive";
  },
};
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
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      if (engine === "webkit" && viewport.width > 600) continue;
      for (const [scenario, check] of Object.entries(scenarios)) {
        if (
          process.env.QA_FILTER &&
          !new RegExp(process.env.QA_FILTER).test(
            `${engine}-${viewport.width}-${scenario}`,
          )
        )
          continue;
        const context = await browser.newContext({
          viewport,
          isMobile: viewport.width < 600,
          hasTouch: viewport.width < 600,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(8000);
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const key = `${engine}-${viewport.width}-${scenario}`;
        try {
          const evidence = await check(page);
          assert.deepEqual(errors, [], "no browser runtime errors");
          await page.screenshot({ path: `${output}/${key}.png` });
          reports.push({
            engine,
            viewport,
            scenario,
            status: "passed",
            evidence,
          });
          console.log(`PASS ${key}: ${evidence}`);
        } catch (error) {
          await page
            .screenshot({ path: `${output}/${key}-failed.png` })
            .catch(() => {});
          reports.push({
            engine,
            viewport,
            scenario,
            status: "failed",
            error: error.message,
            browserErrors: errors,
          });
          console.error(`FAIL ${key}: ${error.message}`);
        } finally {
          await context.close();
          await writeFile(
            `${output}/flows.json`,
            JSON.stringify(
              { generatedAt: new Date().toISOString(), reports },
              null,
              2,
            ),
          );
        }
      }
    }
  } finally {
    await browser.close();
  }
}
if (reports.some((report) => report.status === "failed")) process.exitCode = 1;
