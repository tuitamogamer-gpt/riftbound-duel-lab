// Run with Playwright available, or set PLAYWRIGHT_MODULE to its module path.
// Real browser geometry is necessary here: WebKit previously gave a 744px
// intrinsic-image width to a wrapper around a card rendered only ~60px wide.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const { chromium, webkit } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const styles = await Promise.all(
  [
    "styles.css",
    "marvel-theme.css",
    "game-theme.css",
    "components/ExhaustedToken.css",
    "match-layout.css",
    "battlefield-layout.css",
  ].map((name) => readFile(resolve(root, "src", name), "utf8")),
);
const image =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='744' height='1039'%3E%3Crect width='744' height='1039' fill='%234f8a75'/%3E%3C/svg%3E";
const unit = (id) => `
  <div class="unit-wrap" data-unit-id="${id}">
    <button class="game-card small exhausted" aria-label="Unit ${id}">
      <img src="${image}" alt="Unit ${id}">
      <span class="exhausted-token" aria-label="Exhausted"></span>
    </button>
    <span class="move-selection-badge">✓</span>
    <div class="unit-power">5</div>
    <button class="unit-info" aria-label="Details ${id}">ⓘ</button>
  </div>`;
const row = (count, prefix) =>
  Array.from({ length: count }, (_, i) => unit(`${prefix}-${i}`)).join("");
const field = (count, index) => `
  <section class="battlefield owned" data-field-id="field:${index}">
    <div class="field-art"></div>
    <div class="field-heading"><div><button>Battlefield ${index}</button></div></div>
    <span class="movement-destination">Movement destination</span>
    <div class="field-half enemy-side">${row(count, `enemy-${index}`)}</div>
    <div class="field-divider"><span></span>⚑<span></span></div>
    <div class="field-half">${row(count, `player-${index}`)}</div>
  </section>`;

for (const [name, engine] of [
  ["Chromium", chromium],
  ["WebKit", webkit],
]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let scenarios = 0;
    for (const viewport of [
      { width: 2048, height: 1181 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      for (const count of [1, 3, 8, 14]) {
        await page.setContent(`
          <style>${styles.join("\n")}
            .app.is-game .battlefields { width:calc(100% - 32px); height:clamp(172px, 30vh, 360px); margin:32px 16px; }
            .app.is-game .base-zone { width:calc(100% - 32px); height:120px; margin:16px; }
          </style>
          <div class="app is-game">
            <div class="battlefields">${field(count, 0)}${field(count, 1)}</div>
            <section class="base-zone"><div class="base-units">${row(count, "base")}</div></section>
          </div>`);
        const rows = await page
          .locator(".field-half, .base-units")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const rect = (node) => {
                const r = node.getBoundingClientRect();
                return {
                  x: r.x,
                  y: r.y,
                  width: r.width,
                  height: r.height,
                  right: r.right,
                  bottom: r.bottom,
                };
              };
              return {
                row: rect(element),
                cards: [...element.querySelectorAll(".unit-wrap")].map(
                  (wrap) => ({
                    wrap: rect(wrap),
                    card: rect(wrap.querySelector(".game-card")),
                    power: rect(wrap.querySelector(".unit-power")),
                  }),
                ),
              };
            }),
          );
        const context = `${name} ${viewport.width}x${viewport.height}, ${count} units`;
        for (const { row, cards } of rows) {
          assert.equal(cards.length, count, context);
          for (const { card, power } of cards) {
            assert.ok(
              card.width > 10 && card.height > 10,
              `${context}: visible card`,
            );
            assert.ok(
              card.x >= row.x - 1 && card.right <= row.right + 1,
              `${context}: card contained horizontally`,
            );
            assert.ok(
              card.y >= row.y - 1 && card.bottom <= row.bottom + 1,
              `${context}: card contained vertically`,
            );
            assert.ok(
              Math.abs(card.x + card.width / 2 - power.x - power.width / 2) < 1,
              `${context}: power follows card`,
            );
          }
          const first = cards[0].card;
          const last = cards.at(-1).card;
          assert.ok(
            Math.abs((first.x + last.right) / 2 - row.x - row.width / 2) < 1,
            `${context}: centered group`,
          );
          if (count === 1) {
            assert.ok(
              Math.abs(cards[0].wrap.width - first.width) < 1,
              `${context}: wrapper matches rendered card`,
            );
          }
        }
        await page
          .locator(".field-half:not(.enemy-side) .game-card")
          .first()
          .focus();
        const focus = await page
          .locator(".field-half:not(.enemy-side) .unit-wrap")
          .first()
          .evaluate((wrap) => ({
            zIndex: Number(getComputedStyle(wrap).zIndex),
            exhausted: Boolean(wrap.querySelector(".exhausted-token")),
            selectedForMovement: Boolean(
              wrap.querySelector(".move-selection-badge"),
            ),
          }));
        assert.ok(
          focus.zIndex >= 8 && focus.exhausted && focus.selectedForMovement,
          `${context}: focus and status markers retained`,
        );
        const firstCard = page
          .locator(".field-half:not(.enemy-side) .game-card")
          .first();
        // In a crowded fan, hover the exposed leading edge to lift this card.
        await firstCard.hover({ position: { x: 1, y: 10 } });
        await firstCard.evaluate((card) => card.classList.add("selected"));
        // Wait for the existing hover/selection transform to reach its endpoint.
        await page.waitForTimeout(220);
        const selected = await firstCard.evaluate((card) => ({
          card: card.getBoundingClientRect().toJSON(),
          row: card.closest(".field-half").getBoundingClientRect().toJSON(),
        }));
        assert.ok(
          selected.card.y >= selected.row.y - 1 &&
            selected.card.bottom <= selected.row.bottom + 1,
          `${context}: hover/selection contained`,
        );
        scenarios++;
      }
    }
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 390, height: 400 },
    ]) {
      await page.setViewportSize(viewport);
      await page.setContent(`
        <style>${styles.join("\n")}</style>
        <div class="app is-game"><main class="game-layout">
          <div class="match-toolbar">Duel Lab</div>
          <div class="turn-flow">Action window</div>
          <div class="match-content"><div class="playmat">
            <div class="player-bar">Opponent</div>
            <div class="player-cards opponent-cards">Opponent cards</div>
            <section class="base-zone"><div class="base-units">${row(1, "enemy-base")}</div></section>
            <div class="battlefields">${field(1, 0)}${field(8, 1)}</div>
            <section class="base-zone"><div class="base-units">${row(1, "player-base")}</div></section>
            <div class="player-bar">Player</div>
            <div class="player-cards">Hand and runes</div>
          </div></div>
          <section class="match-controls"><button class="gold-button">End turn</button></section>
        </main></div>`);
      const short = await page.evaluate(() => {
        const table = document.querySelector(".match-content");
        return {
          scrollable: getComputedStyle(table).overflowY,
          scrollHeight: table.scrollHeight,
          height: table.clientHeight,
          cards: [...document.querySelectorAll(".field-half .game-card")].map(
            (card) => card.getBoundingClientRect().toJSON(),
          ),
          controls: document
            .querySelector(".match-controls .gold-button")
            .getBoundingClientRect()
            .toJSON(),
        };
      });
      const context = `${name} ${viewport.width}x${viewport.height}, short table`;
      assert.equal(short.scrollable, "auto", context);
      assert.ok(
        short.scrollHeight > short.height,
        `${context}: internal scroll`,
      );
      assert.ok(
        short.cards.every((card) => card.width >= 20 && card.height >= 30),
        `${context}: cards retain useful size`,
      );
      assert.ok(
        short.controls.y >= 0 && short.controls.bottom <= viewport.height,
        `${context}: bottom controls stay visible`,
      );
      scenarios++;
    }
    console.log(
      `${name}: ${scenarios} battlefield/base geometry scenarios passed`,
    );
  } finally {
    await browser.close();
  }
}
