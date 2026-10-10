// Creates isolated, temporary QA rooms only in the loopback development adapter.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const origin = process.env.QA_ORIGIN || "http://127.0.0.1:5194";
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname),
);
const browser = await chromium.launch({ headless: true });
const errors = [];
const contexts = [];
async function roomRequest(page, body = { op: "poll" }) {
  return page.evaluate(async (request) => {
    const access = JSON.parse(localStorage.getItem("riftbound-online-seat-v1"));
    const response = await fetch("/api/duel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: access.roomId,
        seatToken: access.seatToken,
        ...request,
      }),
    });
    return { status: response.status, body: await response.json() };
  }, body);
}
async function refresh(page) {
  const response = page.waitForResponse((response) => {
    const request = response.request();
    return (
      response.url().endsWith("/api/duel") &&
      request.postDataJSON()?.op === "poll"
    );
  });
  await page.getByRole("button", { name: "Refresh room", exact: true }).click();
  assert.equal((await response).status(), 200);
}
async function confirm(page, actionId) {
  await page.locator(`[data-action-id=${JSON.stringify(actionId)}]`).click();
  const before = await roomRequest(page);
  assert.equal(before.status, 200);
  await page
    .getByRole("button", { name: "Confirm move", exact: true })
    .waitFor();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/duel") &&
      response.request().postDataJSON()?.op === "act",
  );
  await page.getByRole("button", { name: "Confirm move", exact: true }).click();
  const result = await (await response).json();
  assert.equal(result.room.revision, before.body.room.revision + 1);
  await page.locator(".online-confirm").waitFor({ state: "hidden" });
  return result.room;
}
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width === 390,
      hasTouch: viewport.width === 390,
    });
    contexts.push(context);
    await context.addInitScript(() =>
      localStorage.setItem("riftbound-duel-language", "en"),
    );
  }
  const host = await contexts[0].newPage();
  const guest = await contexts[1].newPage();
  for (const page of [host, guest])
    page.on("pageerror", (error) => errors.push(error.message));
  await host.goto(origin);
  await host.getByRole("button", { name: "Private duel", exact: true }).click();
  await host
    .getByRole("combobox", { name: "First player", exact: true })
    .selectOption("host");
  await host.getByRole("button", { name: "Create room", exact: true }).click();
  const invitation = await host
    .getByRole("textbox", { name: "Room invitation", exact: true })
    .inputValue();
  assert.ok(new URL(invitation).hash.startsWith("#duel="));
  assert.equal(new URL(invitation).search, "");
  await guest.goto(invitation);
  await guest.getByRole("button", { name: "Join room", exact: true }).click();
  await guest.locator(".online-match-status").waitFor();
  await refresh(host);
  await host.locator('[data-action-id="mulligan:"]').waitFor();
  let state = (await roomRequest(host)).body.room;
  assert.equal(state.seat, 0);
  assert.equal(state.observation.state.phase, "mulligan");
  const revision = state.revision;
  await host.locator(".online-hand .game-card").first().click();
  await host
    .getByRole("button", { name: "Confirm move", exact: true })
    .waitFor();
  assert.equal(
    (await roomRequest(host)).body.room.revision,
    revision,
    "Selecting a mulligan must not commit it",
  );
  await host.getByRole("button", { name: "Cancel move", exact: true }).click();
  assert.equal((await roomRequest(host)).body.room.revision, revision);
  await confirm(host, "mulligan:");
  await refresh(guest);
  await guest.locator('[data-action-id="mulligan:"]').waitFor();
  await confirm(guest, "mulligan:");
  await refresh(host);
  state = (await roomRequest(host)).body.room;
  assert.equal(state.observation.state.phase, "main");
  for (const [seat, page] of [host, guest].entries()) {
    const view = (await roomRequest(page)).body.room;
    assert.equal(view.seat, seat);
    assert.equal(view.observation.state.players[1 - seat].hand.length, 0);
    assert.ok(!("rng" in view.observation.state));
    assert.ok(!("game" in view));
    await page.reload();
    if (seat === 0)
      await page
        .getByRole("button", { name: "Private duel", exact: true })
        .click();
    await page.locator(".online-match-status").waitFor();
    const resumed = (await roomRequest(page)).body.room;
    assert.equal(resumed.id, state.id);
    assert.equal(resumed.seat, seat);
  }
  await host
    .getByRole("searchbox", { name: "Find a move", exact: true })
    .fill("nonexistent-qa-move");
  await host
    .getByText("No moves match this filter. Show all moves to continue.", {
      exact: true,
    })
    .waitFor();
  await host.getByRole("button", { name: "All moves", exact: true }).click();
  await host.locator('[data-action-id="end-turn"]').waitFor();
  await confirm(host, "end-turn");
  // End-of-turn triggers retain the old turn until both players pass and
  // any required choices resolve; exercise these through the real controls.
  for (let decisions = 0; decisions < 12; decisions++) {
    const current = (await roomRequest(host)).body.room;
    if (
      current.observation.state.currentPlayer === 1 &&
      current.observation.state.phase === "main" &&
      !current.observation.state.stack.length
    )
      break;
    const actor = current.observation.state.priorityPlayer === 0 ? host : guest;
    await refresh(actor);
    const offered = (await roomRequest(actor)).body.room;
    const choice =
      offered.actions.find((entry) => entry.category === "pass") ??
      offered.actions[0];
    assert.ok(
      choice,
      "A pending end-of-turn decision must have a legal option",
    );
    await confirm(actor, choice.id);
  }
  await refresh(guest);
  state = (await roomRequest(guest)).body.room;
  assert.equal(state.observation.state.currentPlayer, 1);
  assert.equal(state.observation.state.priorityPlayer, 1);
  const action =
    state.actions.find((entry) => entry.category === "play") ??
    state.actions.find((entry) => entry.category === "end");
  assert.ok(action);
  const request = {
    op: "act",
    revision: state.revision,
    requestId: randomBytes(32).toString("hex"),
    actionId: action.id,
  };
  const first = await roomRequest(guest, request);
  assert.equal(first.status, 200);
  const retried = await roomRequest(guest, request);
  assert.equal(retried.status, 200);
  assert.equal(
    retried.body.room.revision,
    first.body.room.revision,
    "Retry must not commit twice",
  );
  const stale = await roomRequest(guest, {
    ...request,
    requestId: randomBytes(32).toString("hex"),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, "stale");
  await refresh(host);
  await refresh(guest);
  const beforeLeave = (await roomRequest(host)).body.room;
  const left = await roomRequest(host, {
    op: "depart",
    revision: beforeLeave.revision,
  });
  assert.equal(left.status, 200);
  await refresh(guest);
  await guest
    .getByText("Your opponent left the room", { exact: true })
    .waitFor();
  assert.equal((await roomRequest(guest)).body.room.status, "departed");
  assert.deepEqual(errors, []);
  console.log(
    "PASS local Chromium: two isolated clients, create/join, explicit mulligan confirmation/cancel, privacy, reload/resume, filtering, turn handoff, accepted move, idempotent retry, stale rejection, departure.",
  );
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
