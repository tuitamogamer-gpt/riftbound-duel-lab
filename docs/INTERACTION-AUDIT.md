# Interaction audit — 10 October 2026

The audit exercised the application in Chromium and WebKit, with isolated synthetic saves and browser contexts. It found and repaired two presentation defects:

- A selected unit on the third battlefield had its name and owner shown but no location. The decision bar now includes the third battlefield in English, Serbian and Italian, with a regression checking the selected target and the resulting stack entry.
- Desktop targeted actions clipped long action names and payment details. The target buttons and their decision row now use the content's height. Other desktop rows retain their previous sizing.

## Rules and build

All **2,764 unique tests in 125 files** passed: 2,541 ordinary cases and 223 unique precon cases, including all **169 ordered pairs** of the 13 published precons. The ordinary process and three complementary matrix shards each exited with code 0. The strict matrix verifier and collected-test summarizer report no missing, failed, skipped or unmatched cases. Repeated focused cases in the matrix shards count once.

Rules and JavaScript/TypeScript sources remained unchanged throughout the partitioned regression. The desktop CSS repair was integrated during simulations and then passed the 14 browser layout checks, 33 focused tests and the final production build. An earlier unpartitioned attempt was stopped to run the same scope in parallel; none of its partial results are counted.

Catalog consistency also passed: 1,459 registered playable cards, no unsupported registered cards and 13 validated precons. The report utilities passed their 15 guard checks. [The machine-readable record](interaction-audit-2026-10-10.json) preserves source/report hashes, actual process exits, coverage and browser evidence.

## Browser coverage

| Area                          | Executed coverage                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core duel                     | 27 runs: fresh mulligan selection/deselection, grouped movement and cancellation, combat assignment/confirmation, counter-spell resolution, priority pass, manual rune payment and cancellation, reload/resume, training undo/retry. Chromium desktop and phone; WebKit phone.                                                                            |
| Mobile interaction suites     | 30 browser/viewport suite runs across Chromium and WebKit at 320×568, 390×844 and 844×390. Card inspection, long press/swipe/multitouch handling, compact signature zones, buff identity and friendly targets, Exhausted placement, Hidden payment and later free play, menu/settings, help, piles, history/replay/bookmarks and duel export/import.      |
| Target-button layout          | 14 checks covering ordinary and long spell names, desktop heights down to 600px, phone portrait and landscape. Text and payment details fit inside the button; the button fits inside the decision row; the hand remains accessible.                                                                                                                      |
| Catalog, builder and training | 15 grouped checks across desktop Chromium and phone Chromium/WebKit. Search/filter/detail/reset/pagination; EN/SR/IT state preservation; deck edit/undo/redo/save/reload/export/import; all six training lessons with undo, retry and persisted completion. The two phone runs were repeated using actual taps: 112 successful taps, with no page errors. |
| Local private duel            | Two isolated Chromium clients with a loopback memory store: create/join, explicit mulligan confirmation/cancellation, hand privacy, reload/resume, filtering, triggered responses, turn handoff, idempotent retry, stale-action rejection and departure. This uses clicks in desktop and mobile layouts.                                                  |
| Hosted offline play           | Both production aliases: all 84 application assets cached, no API responses cached, offline reload, exact save restoration and a mulligan/bot transition without a network connection. Checked against the pre-audit production commit `1e92d7f`.                                                                                                         |

The mobile suites also verify that selecting a buff target does not cast before confirmation, an enemy is not offered for supported beneficial effects, an exhausted rune can pay the Hidden setup cost, and a previously Hidden card can be played later with zero resources.

## Hosted online-room limitation

Both production aliases return HTTP **503**, `{"error":"storage-unavailable"}`, from `/api/duel` when polling with a random nonexistent room and seat. Responses retain `private, no-store` caching headers. No production room was created or changed during this check. The result confirms unavailable hosted storage; it does not identify the underlying provisioning/configuration cause.

Passing the local room lifecycle does not establish working hosted multiplayer. The production storage issue remains unresolved.

## Reproduction

Start the ordinary local app with `npm run dev -- --port 5199`. Run these browser scripts against `QA_ORIGIN=http://127.0.0.1:5199`:

```sh
node scripts/interaction-audit-check.mjs
node scripts/mobile-card-inspection-check.mjs
node scripts/buff-targeting-check.mjs
node scripts/hidden-payment-check.mjs
node scripts/target-dock-audit-check.mjs
node scripts/mobile-overlays-check.mjs
node scripts/session-manager-check.mjs
node scripts/support-interactions-check.mjs
```

The scripts accept `PLAYWRIGHT_MODULE` when Playwright is installed outside the repository and `WEBKIT_EXECUTABLE` for the WebKit launcher. Supplemental scripts accept `QA_OUTPUT`. Use `QA_MOBILE_ONLY=1` for the support script's two touch runs. The loopback guards prevent these fixture-based checks from running against a remote user session.

For the local online check, start a separate development server with `DUEL_DEV_ROOMS=1 npm run dev -- --port 5194`, then run `QA_ORIGIN=http://127.0.0.1:5194 node scripts/online-interaction-check.mjs`.

Raw execution logs, screenshots and browser reports are in the ignored `test-results/audit-2026-10-10/` directory. Long-press, swipe and multitouch gesture sequences were exercised in Chromium; card-reader and other mobile layouts also ran in WebKit. Browser emulation is not a physical-device test, and passing deterministic examples does not prove every possible card combination.
