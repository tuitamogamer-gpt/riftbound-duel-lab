# Catalog AI update — 7 October 2026

The current planner configuration is `battlefield-planner-2`. This update adds equipment, XP, token, and recursion profiles alongside the existing aggressive, tempo, control, combo, and big-unit profiles. Profiles come from an unordered list of cards legitimately known to the acting player, their printed rules, and their explicit effect scripts. Theme density scales with larger imported lists. Opponent deck identity, secret hand cards, deck order, and facedown identities do not enter profile inference.

The evaluator now gives reusable public gear its own material value. An attached gear's Might is already included by the real engine and is not added twice. Unattached gear has a small future-attachment estimate when a friendly bearer exists, and temporary gear receives a lower retention value. XP profiles value the public Level 3 and Level 6 thresholds and discount excess reserves. Unit-retrieval spells receive useful-hand credit only when public trash contains an eligible unit; a spell in trash does not make a unit-only retrieval useful. Token-producing units receive a small profile estimate. These coefficients are bounded planning heuristics, not replacement combat rules or proof of an optimal strategy.

All four existing search budgets, terminal checks, resolver-based simulations, information boundaries, and decision validation remain in place. Recorded v1 and v2 planner replays can be reapplied as stored legal actions under the current engine. Unknown planner replay versions are rejected. The planner is not rerun to reconstruct a replay.

## Worker startup and recovery

The AI worker starts when an enabled, running match needs a bot decision. Opening the lobby or a human-first mulligan creates no worker. Pausing an unfinished decision, switching matches, or returning to the lobby cancels stale jobs without starting an idle replacement. Finished workers may be reused for later bot decisions within the same match.

Worker construction errors, worker errors, and the five-second watchdog use the complete legal fallback prepared before dispatch. Recovery validates that fallback against the current decision request; it does not synchronously import or run the planner on the UI thread. Mandatory damage and movement fallbacks finish a legal decision instead of repeatedly toggling a selection. Public explanations expose a fixed reason template, difficulty, and timing, while internal error details stay in the diagnostic trace.

Search and hidden-state sampling remain in the separate worker bundle. The main application still includes the catalog and rules engine. The offline service worker deliberately precaches app chunks, including the worker, so offline play can start without having previously opened every feature. Lazy worker **execution** therefore does not imply that offline setup never downloads its asset.

## Verification

The final AI checkpoint passed all 73 tests: 51 existing bot acceptance/tactics tests, 14 profile/recovery tests, and eight inspection-ownership regressions. New coverage checks profile density and order independence, public gear retention without double-counting Might, XP thresholds, eligible retrieval targets, observation privacy, legal prepared recovery, stale decisions, replay compatibility, and the fresh benchmark deck cohort.

Opponent-targeted Predict and top-deck play now attach inspection knowledge to the actual deck owner. An authorized look at the opponent's deck does not reveal the acting player's own future card order. Inspection knowledge clears when that choice ends. The fresh pilot below started after this ownership correction; measurements made before it are excluded.

The loopback browser fixture [bot-loading-preview.html](../tests/bot-loading-preview.html) exercised a real worker, blocked worker construction, worker error, five-second watchdog, pause/resume cancellation, stale replies after a match switch, and lobby termination. All five scenarios completed the bot mulligan legally with no JavaScript errors. No worker was created for the lobby or human-first priority. A separate Vite build confirmed that search/hypothesis logic is absent from the main bundle and present in the worker bundle.

## Fresh paired catalog pilot

The 32-game pilot is still running. No current strength result is claimed before the cohort completes.

Run the current cohort with:

```sh
npm run bot:benchmark -- 8 docs/bot-catalog-benchmark-2026-10-07.json hard,expert catalog
```

The cohort has eight deck pairings per comparison: all 13 included official precons and three legal modified/imported theme lists focused on equipment, XP, and tokens. Equipment and tokens span expansions; the XP list changes its precon while remaining within UNL. Existing precons also exercise recursion. Each pairing runs twice with the policies exchanging seats while retaining its deck assignment and game seed. First player alternates between seed pairs, so each policy plays once from the first-player seat within a matched pair. The two comparisons are Hard/Normal and Expert/Hard, giving 32 games in total.

The report records exact lists and their cohort profiles, current catalog/rules metadata, configuration, game seeds, first players, outcomes, legal fallbacks, incomplete searches, illegal or blocked games, per-level timings, maximum completed depth, and counts of decisions using multiple samples. Cohort profiles describe the complete lists; runtime profile inference uses cards legitimately known during play. It saves completed-game progress before the whole run finishes. The fixed-node benchmark ignores interactive wall-time cutoffs. Timing includes observation, planning, and validation; concurrent regression workers can increase measured wall times.

This is a small coverage pilot. It cannot establish statistical superiority or a general ordering of the difficulty settings. The dated [v1 measurements](AI-BOTS.md) remain historical checkpoints and should not be combined with this current-catalog sample.

## Remaining information limit

Persistent public-event memory is still conservative. Inspection knowledge is retained during its authorized active choice and then forgotten. Opposing facedown IDs are masked and reindexed; tracking an identity through reveals, zone changes, and shuffles needs a separate verified public physical-card/event model. This update adds no guesses that could silently become false knowledge after a shuffle or reveal replacement.
