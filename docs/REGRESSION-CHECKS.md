# Regression checks

## Latest local acceptance — 10 October 2026

The interaction audit passed **2,764 unique tests in 125 files**, including all **169 ordered precon pairs**. The ordinary suite and three complementary precon shards finished with actual exit 0, and the strict report checks found no missing or unresolved cases. No seeds, action limits or invariant checks were reduced. Rules and JavaScript/TypeScript sources remained fixed during execution; a desktop-only CSS repair was verified separately with 14 browser layout checks, 33 focused tests and a successful production build.

See [the interaction audit](INTERACTION-AUDIT.md) for browser coverage, reproduction commands and the unresolved hosted-room storage issue, and [the machine-readable evidence](interaction-audit-2026-10-10.json) for process receipts and report hashes.

## Local acceptance — 8 October 2026

The final source snapshot passed **2,681 unique tests in 120 files**: 2,458 ordinary-suite cases plus 223 unique precon cases. The latter comprise all **169 ordered pairs** and 54 focused cases. Local execution used two complementary **PRECON_SHARD=0/2** and **1/2** processes, each with one worker; the ordinary suite used two workers; the workflow below uses three shards of the same unchanged pair list. The repeated focused cases count once in either partition.

All three fresh processes completed with actual exit **0**, native JSON success and zero failed/pending tests. The strict precon verifier and expected-identity summarizer pass with zero missing, uncollected or unresolved cases. [The final machine-readable record](regression-validation-2026-10-08.json) includes all source hashes and actual execution receipts. Earlier attempts interrupted for verified rules corrections or by the execution-environment restart contribute no cases; the 7 October recovered/mixed inventory below stays historical.

The source was frozen after the physical hybrid-return, copied-type/protection and Keeper’s Verdict fixes, including 35 new focused rules regressions. Required CI now includes those suites, catalog/builder recovery, replay/training helpers, authorized bot inspection, Predict/trash presentation, service-worker storage failures and body-scroll locks. No original seeds, game/action limits or invariant assertions were reduced for this release.

Every pull request and push to `main` runs the **Required checks** workflow. It installs the locked dependencies, checks catalog consistency, runs the core engine/imported-rule cases (including cross-wave saved decisions), and compiles the production build. It uses two Vitest workers to keep CPU contention predictable.

The **Complete regression and precon matrix** workflow runs each Monday at 03:17 UTC and can be started through GitHub Actions → Run workflow. Its jobs divide the complete suite without omitting tests:

- `full-suite` runs every test file except `tests/precon-effects.test.ts`. This includes the practice-deck simulations and all mixed-expansion complete games.
- `precon-matrix` runs three deterministic shards of the precon-effects file. Together they preserve all 169 ordered pairings of the 13 official precons, with each original seed unchanged. Each shard also runs the focused precon rules tests. Without `PRECON_SHARD`, the file still runs the entire 169-pair matrix.
- `verify-precon-matrix` downloads all three JSON reports and requires exactly one passing result for each current published pairing, including mirrors. Missing, duplicate, skipped or failed pairings fail this mandatory aggregate check.

The aggregate job also compares the full and shard reports against `vitest list` for the same checkout. It requires every unique `(file, fullName)` to pass, and keeps one count for the focused precon cases repeated by the shards. Its machine-readable summary records source report status and the checkout commit. Local summaries can add later targeted reports to document corrected cases without claiming an earlier failed checkpoint was green.

The aggregate also requires both worker execution groups to finish successfully. Vitest 3's native JSON omits unhandled runner errors, so an assertion inventory alone cannot prove that its process exited successfully.

Collected names and JSON report names use different describe separators. The summarizer normalizes those separators and quoted precon table values, rejects colliding collected identities, and counts only executed `passed` or `failed` cases. An unselected `pending` case in a targeted rerun cannot erase an earlier failure or passing result.

An environment restart interrupted the local 7 October runs. The original logs remain unchanged. `recover-regression-checkpoints.mjs` records completed verbose assertions and whole passing file summaries only when their exact counts match the launch manifest; it also records the two original timeout failures. Each recovered subset includes source hashes and explicitly says that the original run did not finish. The completed GitHub required-check logs supply another checkpoint for the finalized implementation. Continuation selections run every remaining original case without changing seeds, action limits or assertions.

`reconcile-precon-reports.mjs` can merge those executed checkpoints into one unique precon inventory. It rejects missing or failed cases, identifies the original source of every result, and labels the output as reconciled evidence rather than an uninterrupted Vitest run. The ordinary matrix verifier then still requires exactly 169 passing ordered pairs, and the complete summarizer must cover every case in the final collected manifest. Required CI also runs `node scripts/check-regression-reports.mjs`: fifteen synthetic scenarios verify name normalization, retained failures, corrected reruns, missing/colliding identities, missing/duplicate/skipped pairings, complementary executed subsets, uncollected results and unsuccessful runners.

Both workflows retain their Vitest JSON reports as Actions artifacts, including reports generated during failures. The full jobs have a two-hour budget for deterministic bot planning on shared runners. The broad practice-deck and catalog matchup cases use a four-minute budget after real contended runs exceeded their earlier limits. Two measured exceptions have a five-minute budget: the unchanged three-seed Annie mirror took 275 seconds, and the exhaustive 480-action saved-frame replay took 265 seconds under contention. Other focused suites retain their own budgets. Every seed, action limit and invariant assertion remains intact.

Three further cases have measured individual budgets: the unchanged deterministic two-game replay took 46.9 seconds against its former 30-second limit and now has 90 seconds; the Viktor full precon game took 68.7 seconds against 60 seconds and now has 120 seconds; the import-100 seed-31 fixture took 87.0 seconds under four-worker contention and now has 120 seconds, while seed 71 keeps 60 seconds. Long game fixtures yield to the event loop every 25 actions. This lets Vitest receive result and cancellation messages during deterministic CPU work, avoiding its separate 60-second RPC acknowledgement timeout without changing game decisions or assertions.

The completed 7 October inventory covers **2,568 unique test cases in 105 files**, including all **169 ordered official precon pairs** and 54 distinct focused precon cases. [The machine-readable evidence](regression-validation-2026-10-07.json) records normalized identity digests, source hashes, per-file coverage, actual process exits and corrected-case receipts. It combines completed checkpoints, continuations and targeted reruns; it does not claim an uninterrupted full-suite process passed. The interrupted originals, deliberately cancelled continuation, real Pack of Wonders save failure and runner RPC errors retain their original statuses. Every retained passing result from the RPC-affected processes was matched to its exact completed verbose case (349, 8 and 9 respectively). Fresh complete games validate the narrow save fix and the cooperative test scheduling.

To reproduce the complete partition locally:

```sh
npm ci
npm run cards:check
npx vitest list --json=test-results/expected-tests.json --maxWorkers=2
npm test -- --exclude tests/precon-effects.test.ts --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 --reporter=default --reporter=json --outputFile=test-results/full-suite.json
PRECON_SHARD=0/3 npm test -- tests/precon-effects.test.ts --maxWorkers=1 --hookTimeout=30000 --reporter=verbose --reporter=json --outputFile=test-results/precon-shard-0.json
PRECON_SHARD=1/3 npm test -- tests/precon-effects.test.ts --maxWorkers=1 --hookTimeout=30000 --reporter=verbose --reporter=json --outputFile=test-results/precon-shard-1.json
PRECON_SHARD=2/3 npm test -- tests/precon-effects.test.ts --maxWorkers=1 --hookTimeout=30000 --reporter=verbose --reporter=json --outputFile=test-results/precon-shard-2.json
node scripts/verify-precon-report.mjs test-results/precon-shard-0.json test-results/precon-shard-1.json test-results/precon-shard-2.json
node scripts/summarize-regression-reports.mjs --expected=test-results/expected-tests.json --output=test-results/regression-summary.json test-results/full-suite.json test-results/precon-shard-0.json test-results/precon-shard-1.json test-results/precon-shard-2.json
npm run build
```

The new `imported-interactions.test.ts` exercises copied text with Repeat, copied token replacements with Mirror Image, competing death replacements on copied units, and hybrid revival after saving. `imported-mixed-games.test.ts` puts cards from every wave thirteen through twenty-six into two seeded complete games. These cases check physical card inventory, rune conservation, immutable queries, private draw order, atomic decision revisions, stale-decision rejection and exact saved-choice continuation. Their deliberately mixed-domain decks are engine interaction fixtures, rather than legal event decklists.

Passing simulations demonstrate the branches they visit. Focused effect tests remain necessary for optional choices and responses that a bot may never select. Workflow configuration also does not set repository branch protection; the checks can be made required for merging through repository rulesets.
