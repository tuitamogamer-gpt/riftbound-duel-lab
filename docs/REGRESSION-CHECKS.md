# Regression checks

Every pull request and push to `main` runs the **Required checks** workflow. It installs the locked dependencies, checks catalog consistency, runs the core engine/imported-rule cases (including cross-wave saved decisions), and compiles the production build. It uses two Vitest workers to keep CPU contention predictable.

The **Complete regression and precon matrix** workflow runs each Monday at 03:17 UTC and can be started through GitHub Actions → Run workflow. Its jobs divide the complete suite without omitting tests:

- `full-suite` runs every test file except `tests/precon-effects.test.ts`. This includes the practice-deck simulations and all mixed-expansion complete games.
- `precon-matrix` runs three deterministic shards of the precon-effects file. Together they preserve all 169 ordered pairings of the 13 official precons, with each original seed unchanged. Each shard also runs the focused precon rules tests. Without `PRECON_SHARD`, the file still runs the entire 169-pair matrix.
- `verify-precon-matrix` downloads all three JSON reports and requires exactly one passing result for each current published pairing, including mirrors. Missing, duplicate, skipped or failed pairings fail this mandatory aggregate check.

The aggregate job also compares the full and shard reports against `vitest list` for the same checkout. It requires every unique `(file, fullName)` to pass, and keeps one count for the focused precon cases repeated by the shards. Its machine-readable summary records source report status and the checkout commit. Local summaries can add later targeted reports to document corrected cases without claiming an earlier failed checkpoint was green.

Collected names and JSON report names use different describe separators. The summarizer normalizes those separators and quoted precon table values, rejects colliding collected identities, and counts only executed `passed` or `failed` cases. An unselected `pending` case in a targeted rerun cannot erase an earlier failure or passing result.

An environment restart interrupted the local 7 October runs. The original logs remain unchanged. `recover-regression-checkpoints.mjs` records completed verbose assertions and whole passing file summaries only when their exact counts match the launch manifest; it also records the two original timeout failures. Each recovered subset includes source hashes and explicitly says that the original run did not finish. The completed GitHub required-check logs supply another checkpoint for the finalized implementation. Continuation selections run every remaining original case without changing seeds, action limits or assertions.

`reconcile-precon-reports.mjs` can merge those executed checkpoints into one unique precon inventory. It rejects missing or failed cases, identifies the original source of every result, and labels the output as reconciled evidence rather than an uninterrupted Vitest run. The ordinary matrix verifier then still requires exactly 169 passing ordered pairs, and the complete summarizer must cover every case in the final collected manifest. Required CI also runs `node scripts/check-regression-reports.mjs`: fifteen synthetic scenarios verify name normalization, retained failures, corrected reruns, missing/colliding identities, missing/duplicate/skipped pairings, complementary executed subsets, uncollected results and unsuccessful runners.

Both workflows retain their Vitest JSON reports as Actions artifacts, including reports generated during failures. The full jobs have a two-hour budget for deterministic bot planning on shared runners. The broad practice-deck and catalog matchup cases use a four-minute budget after real contended runs exceeded their earlier limits. Two measured exceptions have a five-minute budget: the unchanged three-seed Annie mirror took 275 seconds, and the exhaustive 480-action saved-frame replay took 265 seconds under contention. Other focused suites retain their own budgets. Every seed, action limit and invariant assertion remains intact.

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
