# Catalog AI updates

## Current planner — 8 October 2026

The current planner is `battlefield-planner-3`. The information adapter preserves the actual inspected card batch while Nocturne or Hatchling pauses an authorized look, including non-prefix positions after repeated recycling. Sampled hands and Hidden hypotheses reserve known top cards first, and registered inventory counts stolen/copied physical cards and hybrid Unit/Gear objects once under their physical owner. Ashe and Bone Skewer can use the enemy hand actually revealed for their active named choice; subsequent draws and inactive choices remain private. Loaded observer-only knowledge fields cannot grant themselves authorization. These information fixes have 17 new focused cases, with both seats and multiple deterministic samples where relevant. Separate resolver corrections return each physical board card once, including hybrid Unit/Gear objects, and preserve original card identity and ownership for stolen or copied cards. Keeper Verdict also restores the original physical card when placing it on top or bottom of its owner’s deck, with that owner making the choice.

The planner also avoids repeated cloning/evaluation work. Its isolated performance comparison retained all 52 original fixed-node decisions and diagnostics over two rounds (104 exact matches), reducing measured total planning time by 23.7% on 26 real precon positions with 2–7 units. See [performance scope and measurements](AI-PERFORMANCE.md); this is not a speed guarantee for every board or device. Newly created replays use v3. Versions 1 and 2 remain supported without rerunning a planner; their stored actions must still be legal under the corrected engine. Unknown versions are rejected.

### Fresh v3 catalog pilot

All 32 fresh games completed with a winner, zero illegal decisions and zero blocked games. The pilot started fresh from frozen v3 source after the physical-card resolver corrections, without retaining any games from v2 or either interrupted pre-correction v3 run. It uses the same eight catalog pairings per comparison: all 13 official precons plus three legal modified/imported equipment, XP and token lists. Policies exchange seats while keeping each pair's decks and seed; each policy has eight first-player games per comparison.

| Comparison    | Games | Wins   | Decisions | Legal fallbacks | Incomplete searches | Illegal / blocked |
| ------------- | ----: | ------ | --------: | --------------: | ------------------: | ----------------- |
| Hard / Normal |    16 | 10 / 6 |     2,356 |               1 |                 280 | 0 / 0             |
| Expert / Hard |    16 | 10 / 6 |     2,527 |               0 |                  40 | 0 / 0             |

| Comparison    | Policy | Decisions | p50 ms |  p95 ms | Maximum ms | Maximum completed depth | Multiple-sample decisions |
| ------------- | ------ | --------: | -----: | ------: | ---------: | ----------------------: | ------------------------: |
| Hard / Normal | Hard   |     1,174 |  211.4 | 1,923.3 |    5,455.8 |                       3 |                       954 |
| Hard / Normal | Normal |     1,182 |   60.7 |   940.9 |   34,803.6 |                       2 |                         0 |
| Expert / Hard | Expert |     1,273 |  184.8 | 3,423.6 |   15,404.3 |                       4 |                     1,050 |
| Expert / Hard | Hard   |     1,254 |  103.5 | 1,654.9 |    6,415.8 |                       3 |                     1,037 |

The [complete v3 report and cohort audit](bot-catalog-benchmark-2026-10-08-v3.json) preserve exact lists, seeds, seat assignments, outcomes, diagnostics and the SHA-256 source fingerprint. All 113 fingerprinted source files remained unchanged across this pilot. The historical v2 report remains intact below. The benchmark uses fixed node limits with interactive wall-time cutoffs disabled; shared regression workers affect these elapsed timings. Incomplete searches and prepared fallbacks still select real-engine-validated legal actions. This 32-game coverage pilot does not establish statistical superiority, a general difficulty ordering, or comparable device latency.

Run a new current-source cohort with:

```sh
npm run bot:benchmark -- 8 test-results/bot-catalog-benchmark-v3-rerun.json hard,expert catalog
```

Checkpoints can continue only with matching source/configuration/cohort using `--resume`. Completed reports can be verified without running games with `--resume --check-resume`. A v2 checkpoint cannot be resumed by v3.

Persistent public-event memory remains conservative. Current authorized inspections expire after their active choice; historical hand-reveal snapshots remain presentation metadata rather than implicit knowledge about a later hand.

## Historical v2 catalog update — 7 October 2026

The October 7 experiment used `battlefield-planner-2`. This update adds equipment, XP, token, and recursion profiles alongside the existing aggressive, tempo, control, combo, and big-unit profiles. Profiles come from an unordered list of cards legitimately known to the acting player, their printed rules, and their explicit effect scripts. Theme density scales with larger imported lists. Opponent deck identity, secret hand cards, deck order, and facedown identities do not enter profile inference.

The evaluator now gives reusable public gear its own material value. An attached gear's Might is already included by the real engine and is not added twice. Unattached gear has a small future-attachment estimate when a friendly bearer exists, and temporary gear receives a lower retention value. XP profiles value the public Level 3 and Level 6 thresholds and discount excess reserves. Unit-retrieval spells receive useful-hand credit only when public trash contains an eligible unit; a spell in trash does not make a unit-only retrieval useful. Token-producing units receive a small profile estimate. These coefficients are bounded planning heuristics, not replacement combat rules or proof of an optimal strategy.

All four existing search budgets, terminal checks, resolver-based simulations, information boundaries, and decision validation remain in place. Recorded v1 and v2 planner replays can be reapplied as stored legal actions under the current engine. Unknown planner replay versions are rejected. The planner is not rerun to reconstruct a replay.

### Worker startup and recovery

The AI worker starts when an enabled, running match needs a bot decision. Opening the lobby or a human-first mulligan creates no worker. Pausing an unfinished decision, switching matches, or returning to the lobby cancels stale jobs without starting an idle replacement. Finished workers may be reused for later bot decisions within the same match.

Worker construction errors, worker errors, and the five-second watchdog use the complete legal fallback prepared before dispatch. Recovery validates that fallback against the current decision request; it does not synchronously import or run the planner on the UI thread. Mandatory damage and movement fallbacks finish a legal decision instead of repeatedly toggling a selection. Public explanations expose a fixed reason template, difficulty, and timing, while internal error details stay in the diagnostic trace.

Search and hidden-state sampling remain in the separate worker bundle. The main application still includes the catalog and rules engine. The offline service worker deliberately precaches app chunks, including the worker, so offline play can start without having previously opened every feature. Lazy worker **execution** therefore does not imply that offline setup never downloads its asset.

### Verification

The final AI checkpoint passed all 73 tests: 51 existing bot acceptance/tactics tests, 14 profile/recovery tests, and eight inspection-ownership regressions. New coverage checks profile density and order independence, public gear retention without double-counting Might, XP thresholds, eligible retrieval targets, observation privacy, legal prepared recovery, stale decisions, replay compatibility, and the fresh benchmark deck cohort.

Opponent-targeted Predict and top-deck play now attach inspection knowledge to the actual deck owner. An authorized look at the opponent's deck does not reveal the acting player's own future card order. Inspection knowledge clears when that choice ends. The fresh pilot below started after this ownership correction; measurements made before it are excluded.

The loopback browser fixture [bot-loading-preview.html](../tests/bot-loading-preview.html) exercised a real worker, blocked worker construction, worker error, five-second watchdog, pause/resume cancellation, stale replies after a match switch, and lobby termination. All five scenarios completed the bot mulligan legally with no JavaScript errors. No worker was created for the lobby or human-first priority. A separate Vite build confirmed that search/hypothesis logic is absent from the main bundle and present in the worker bundle.

### Historical paired v2 catalog pilot

All 32 games completed with a winner and zero illegal or blocked games. These are outcomes from this small fixed cohort, not evidence of a general difficulty ordering.

| Comparison    | Games | Wins   | Decisions | Legal fallbacks | Incomplete searches | Illegal / blocked |
| ------------- | ----: | ------ | --------: | --------------: | ------------------: | ----------------- |
| Hard / Normal |    16 | 10 / 6 |     2,356 |               1 |                 280 | 0 / 0             |
| Expert / Hard |    16 | 10 / 6 |     2,527 |               0 |                  40 | 0 / 0             |

Validated legal fallbacks: Normal 1. Incomplete searches still selected actions validated by the real engine. No game reached the action cap or repeated-state guard.

| Comparison    | Policy | Decisions | p50 ms |  p95 ms | Maximum ms | Maximum completed depth | Multiple-sample decisions |
| ------------- | ------ | --------: | -----: | ------: | ---------: | ----------------------: | ------------------------: |
| Hard / Normal | Hard   |     1,174 |  372.1 | 4,666.7 |   17,667.7 |                       3 |                       954 |
| Hard / Normal | Normal |     1,182 |  114.6 | 2,033.6 |   12,687.9 |                       2 |                         0 |
| Expert / Hard | Expert |     1,273 |  207.6 | 4,436.0 |   37,202.5 |                       4 |                     1,050 |
| Expert / Hard | Hard   |     1,254 |  123.7 | 2,108.4 |    5,535.3 |                       3 |                     1,037 |

These timings measure the direct fixed-node benchmark with interactive wall-time cutoffs disabled. Browser responsiveness and worker recovery were checked separately. Shared CPU contention affects the timings.

The [complete report and cohort audit](bot-catalog-benchmark-2026-10-07.json) record all 32 unique comparison/pair/side keys, exact seeds, decks, and policy seat assignments. Each policy has eight first-player games per comparison. The retained 14 completed-game records were verified unchanged.

The v2 run used this command on its recorded source revision. Current v3 runs use the new output path above; preserve the historical report:

```sh
npm run bot:benchmark -- 8 docs/bot-catalog-benchmark-2026-10-07.json hard,expert catalog
```

The cohort has eight deck pairings per comparison: all 13 included official precons and three legal modified/imported theme lists focused on equipment, XP, and tokens. Equipment and tokens span expansions; the XP list changes its precon while remaining within UNL. Existing precons also exercise recursion. Each pairing runs twice with the policies exchanging seats while retaining its deck assignment and game seed. First player alternates between seed pairs, so each policy plays once from the first-player seat within a matched pair. The two comparisons are Hard/Normal and Expert/Hard, giving 32 games in total.

The report records exact lists and their cohort profiles, current catalog/rules metadata, configuration, game seeds, first players, outcomes, legal fallbacks, incomplete searches, illegal or blocked games, per-level timings, maximum completed depth, and counts of decisions using multiple samples. Cohort profiles describe the complete lists; runtime profile inference uses cards legitimately known during play. It saves completed-game progress before the whole run finishes. The fixed-node benchmark ignores interactive wall-time cutoffs. Timing includes observation, planning, and validation; concurrent regression workers can increase measured wall times.

Interrupted runs can continue with the same arguments plus `--resume`. Checkpoints are replaced atomically and contain a SHA-256 fingerprint of the rules, planner, catalog, and cohort source files. Continuation rejects different source, configuration, lists, seeds, first players, seat-pair order, or inconsistent outcome/decision/timing totals before retaining a game. Six checkpoint tests cover valid continuation, corrupted or mismatched progress, and retaining a reported failed decision without erasing its failure.

This pilot retained 14 completed games after the execution environment restarted. Its older checkpoint predates source fingerprints, so continuation explicitly verified all relevant source files against commit `8a1bfca67a2f153bf044ce3356cc49b50547d7a8` before skipping those games. The original generation time and all retained measurements are preserved; `resumptions` records the new start time, environment, and source commit. No measurements from before the v2 inspection-ownership correction enter this historical report. To reproduce that legacy continuation command:

```sh
npm run bot:benchmark -- 8 docs/bot-catalog-benchmark-2026-10-07.json hard,expert catalog --resume --resume-source=8a1bfca67a2f153bf044ce3356cc49b50547d7a8
```

New checkpoints require only `--resume`; `--check-resume` validates without executing another game.

This is a small coverage pilot. It cannot establish statistical superiority or a general ordering of the difficulty settings. The dated [v1 measurements](AI-BOTS.md) remain historical checkpoints and should not be combined with this historical v2 sample.

### Remaining information limit

Persistent public-event memory is still conservative. Inspection knowledge is retained during its authorized active choice and then forgotten. Opposing facedown IDs are masked and reindexed; tracking an identity through reveals, zone changes, and shuffles needs a separate verified public physical-card/event model. This update adds no guesses that could silently become false knowledge after a shuffle or reveal replacement.
