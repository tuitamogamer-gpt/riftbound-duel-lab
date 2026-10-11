# In-game design improvements — 11 October 2026

Implements the six areas identified in the design review of `8629d2b`.

- Opening hands occupy the table before battlefield play begins. Desktop cards have separate name and cost labels; portrait phones show the four opening cards in a two-column grid. At 1366×768, opening card faces measure about 205×287 px. Regular hands retain horizontal browsing and card inspection.
- Paid action options show the actual Energy/Power cost and ready/total runes retained. Changed resource pools are named separately. Receipts come from the existing payment inspection API, before later effects; the UI does not predict draws or hidden outcomes. Manual payment remains available.
- Card readers insert missing spaces between timing reminders and effect text. Spells that require a battlefield unit explain when all battlefields are empty.
- Reaction windows name the pending card and its public targets, and offer shortcuts to legal response sources. A shortcut only selects a source. The action button still commits the play. Passing priority is secondary when a response is available.
- Combatants show assigned damage against their current lethal assignment threshold, including damage prevention. These are assignment values, not a promise that a unit will be defeated. Exhausted art retains enough colour to distinguish cards and legal targets.
- Empty hands collapse, retaining deck/trash access. Two damage targets fit together when the compact table has an empty hand. Short desktop windows use a hand/decision rail; short portrait phones keep hand browsing accessible while giving repeated chain space back to the battlefield during a selected reaction.

Player score displays retain the victory goal after removing the duplicate desktop score rail. New copy is available in English, Serbian and Italian. Selection, saves, hidden information and rules resolution keep their existing contracts.

## Validation

- Required-check regression suites plus design/presentation coverage: **964 passed across 76 files**.
- Required saved-session patterns: **14 passed**, with the other 7 tests intentionally outside that CI pattern.
- `npm run cards:check`: all **1459** registered cards playable; **13/13** retail precons covered.
- Regression-report guards: **15 passed**.
- `npm run build`: TypeScript, Vite production bundle and duel server build passed.
- Chromium: **18** opening/reaction/damage cases at 1366×768, 1440×900, 1280×600, 390×844, 320×640 and 844×390. Checks cover selection without commitment, payment summaries, per-unit assignments, empty-hand geometry, viewport fit and runtime errors.
- Existing Chromium interaction checks: **18 passed**, covering mulligan, grouped movement, assignment/confirmation, countering/passing, manual payment, save/reload and training on desktop and mobile.
- Existing target dock geometry: **10 passed**, including long card names and landscape.
- Existing Hidden payment checks passed at **320×568, 390×844 and 844×390**, including hiding, normal play, paging, payment and later free reveal.

Browser checks use isolated synthetic saves on loopback. They do not modify player saves or production rooms. This release was checked in Chromium; no new Safari/device certification or full precon pairing matrix is claimed.

## Repeat the browser checks

Start `npm run dev -- --port 5199`, then use an available Playwright installation:

```sh
node scripts/match-clarity-check.mjs
node scripts/interaction-audit-check.mjs
node scripts/target-dock-audit-check.mjs
node scripts/hidden-payment-check.mjs
```

`PLAYWRIGHT_MODULE` can point to the environment's Playwright module. Screenshots and JSON results are written under ignored `test-results/`. `QA_WIDTH` limits the new clarity check to one viewport width.
