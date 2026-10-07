# Regression checks

Every pull request and push to `main` runs the **Required checks** workflow. It installs the locked dependencies, checks catalog consistency, runs the core engine/imported-rule cases (including cross-wave saved decisions), and compiles the production build. It uses two Vitest workers to keep CPU contention predictable.

The **Complete regression and precon matrix** workflow runs each Monday at 03:17 UTC and can be started through GitHub Actions → Run workflow. Its jobs divide the complete suite without omitting tests:

- `full-suite` runs every test file except `tests/precon-effects.test.ts`. This includes the practice-deck simulations and all mixed-expansion complete games.
- `precon-matrix` runs three deterministic shards of the precon-effects file. Together they preserve all 169 ordered pairings of the 13 official precons, with each original seed unchanged. Each shard also runs the focused precon rules tests. Without `PRECON_SHARD`, the file still runs the entire 169-pair matrix.
- `verify-precon-matrix` downloads all three JSON reports and requires exactly one passing result for each current published pairing, including mirrors. Missing, duplicate, skipped or failed pairings fail this mandatory aggregate check.

The aggregate job also compares the full and shard reports against `vitest list` for the same checkout. It requires every unique `(file, fullName)` to pass, and keeps one count for the focused precon cases repeated by the shards. Its machine-readable summary records source report status and the checkout commit. Local summaries can add later targeted reports to document corrected cases without claiming an earlier failed checkpoint was green.

Both workflows retain their Vitest JSON reports as Actions artifacts, including reports generated during failures. The full jobs have a two-hour budget for deterministic bot planning on shared runners. Complete-game cases use a four-minute budget after real contended runs exceeded the old one-minute limit. Two measured exceptions have a five-minute budget: the unchanged three-seed Annie mirror took 275 seconds, and the exhaustive 480-action saved-frame replay took 265 seconds under contention. Every seed, action limit and invariant assertion remains intact.

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
