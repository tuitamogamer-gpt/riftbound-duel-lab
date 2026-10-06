# Battlefield bots — implementation and verification

Implementation date: **6 October 2026**. Configuration: `battlefield-planner-1`.

The existing 1v1 game now runs Beginner, Normal, Hard and Expert policies in a Web Worker. Every player-owned decision goes through the same engine as human play, including off-turn reactions, triggered choices, grouped movement, payment, damage assignment, and mulligans. The toolbar shows a short public explanation. A complete local replay, including private diagnostic data, can be downloaded after the match ends.

This is a bounded search implementation. It does not establish that Expert is statistically stronger than every lower setting or that every registered card interaction is correct. The measurements below define what was actually checked.

## Rules and supported scope

The [official Rules Hub](https://playriftbound.com/en-us/rules-hub/) was checked on 6 October. It links the [16 July Core Rules](https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/e9ac8e3d33e0f78cef296f5945aba7bc1313b086.pdf). The [Vendetta patch notes](https://playriftbound.com/en-us/news/announcements/core-rules-vendetta-patch-notes/) take effect on 24 July; the [14 August Vendetta FAQ](https://playriftbound.com/en-us/news/rules-and-releases/vendetta-rules-faq-and-clarifications/) takes precedence over older Core Rules where they differ.

The engine already provided two battlefields, phase/priority management, triggered choices, card scripts, rune payment, combat and final-point handling. This work reuses those components. The scoring review corrected final Conquer handling to apply at **target minus one or higher**, victory to require a **lead over the opponent**, and victory checking to wait until a resolving item's effects finish. The [Unleashed FAQ](https://playriftbound.com/en-us/news/rules-and-releases/unleashed-rules-faq-and-clarifications/) and [Spiritforged FAQ](https://playriftbound.com/en-us/news/rules-and-releases/riftbound-spiritforged-faq/) clarify final points and the distinction between scoring a battlefield and gaining a point. Core sections 319–323, 469–472 and 811 are the relevant cleanup, scoring and Hidden references.

Each new match stores:

| Field              | Value / meaning                                         |
| ------------------ | ------------------------------------------------------- |
| `formatId`         | `duel-lab-supported-1v1` — the existing practice format |
| `rulesVersion`     | `core-2026-07-16+vendetta-faq-2026-08-14`               |
| `cardDataVersion`  | SHA-256 of the bundled card catalog                     |
| `supportedCardIds` | Exact registered executable printings at match creation |
| `openDecklists`    | False by default; explicit opt-in in `GameOptions`      |
| `botSettings`      | Difficulty and a separate bot seed                      |

Victory thresholds come from `getVictoryScore`, including battlefield modifications. The project is a single practice game, with historical precons and local deck import; it does **not** enable an official tournament format. Existing deck validation and dated ban metadata remain distinct from engine support. The release incorporates card-engine commit `62d8da8`, giving **1,186 executable entries and 270 unsupported entries** in the checked 1,456-entry registry. Counts include printings and five local rules tokens, not 1,186 unique card faces. Unsupported cards are still rejected when starting a game. See [the per-card inventory](card-coverage.json) and [specific missing mechanics](CARD-COVERAGE.md).

The main completion matrix covers the 13 included precons; the strength benchmark uses the four custom practice decks Annie, Lux, Garen and Master Yi. Mixed-expansion integration games provide additional coverage, not certification of every supported list.

## Integration boundaries

- `src/game/ai/observation.ts` is the only live-state adapter. It clones explicitly allowed data, masks opponent hand/list/deck ID and facedown identities, omits game RNG/seed/logs/next-ID counters, and preserves public expansion counters. New extension state is excluded until explicitly audited. Own registered lists are unordered. Current inspection effects expose only the legitimately inspected window to its owner.
- `decisions.ts` builds a versioned request and a concrete fallback before search. Mandatory fallbacks select a complete legal choice. Multi-card trash declarations confirm when legal, otherwise add an unselected target; they never repeatedly toggle a selection. No legal option while awaiting a player is an error. Priority pass, focus pass, main action, damage, movement, choice and mulligan have distinct request kinds even where the existing engine uses the same `pass` ID.
- `candidates.ts` progressively generates existing legal actions, atomic groups and rune-order preferences. Both battlefields receive candidates early. Groups are simulated intact; the engine revalidates membership, destination and movement taxes. Rune permutations use the same energy/power matching and cost resolver as all other play.
- `planner.ts` receives only an observation and inert request. Synthetic states are constructed from permitted information and a separate bot RNG. Terminal outcomes are compared before heuristic utility. Search considers score/history, the next Hold opportunity, threats to finishing, useful units/cards, resource continuation and deck profile.
- `engine.ts` provides `iterateLegalActions`, `getGroupMoveAction` and immutable `applyAction`. Invalid/stale decisions are rejected before committing anything. Successful decisions increment the match revision. The existing human `getLegalActions` array interface remains available.
- `useBotDecision.ts` requests work whenever the bot owns priority, including the human turn. Responses are checked against the current revision; stale jobs are cancelled. A five-second external watchdog can terminate a stuck worker and apply the already prepared legal fallback. Invalid requests or rejected decisions stop with a visible error instead of retrying forever.

`decideBot` is the direct engine integration for simulations and bot-vs-bot games. `getBotAction` remains a compatibility wrapper for older callers that expect individual human UI selection steps; new integrations should use `decideBot` and the atomic returned action.

## Decision quality and budgets

All levels share the immediate terminal scan and mandatory-choice handling. They share rules, initial resources, legal options and information boundaries. Style is inferred from the registered deck's semantic effects and costs: aggressive, tempo, control, combo or big units. It does not change in response to secret opponent data.

| Level    | Work units | Time target | Beam width | Strategic action depth | State samples | Response settings |
| -------- | ---------: | ----------: | ---------: | ---------------------: | ------------: | ----------------: |
| Beginner |        180 |      180 ms |          5 |                      1 |             1 |                 1 |
| Normal   |        480 |      400 ms |          8 |                      2 |             1 |                 2 |
| Hard     |      1,100 |      750 ms |         10 |                      3 |             2 |                 3 |
| Expert   |      2,200 |    1,000 ms |         14 |                      4 |             3 |                 4 |

These are initial tunable settings, not optimal coefficients or promised wall times. Candidate generation, state preparation and transition expansion draw from one `SearchBudget`. A work unit is a bounded generation/preparation/transition step, not every internal engine instruction. An indivisible resolver call or evaluation can overrun the time check; the worker watchdog is a separate last resort. Deterministic verification ignores wall time and uses fixed work limits.

The beam explores preparatory actions and continuations, settles combat/forced effects with the engine, and considers bounded opponent responses at actual priority windows. It returns only the first action and replans after every subsequent decision. Position history prevents reversible search cycles. Mulligan scoring considers deck profile, curve, starting player and the available champion. Mandatory choices use specialized legal-option ranking.

The next-Hold forecast discounts a thin garrison when visible opposing units can contest it. This is a planning estimate; the combat resolver still determines every actual casualty, control change and point. A regression found during paired play also corrected the planner's pass comparison: an unavailable frozen turn cannot override useful early development. No-progress actions can still be rejected to avoid wasting cards or shuffling equipment indefinitely.

The no-new-unknown-response baseline preserves public hand and Hidden counts using a consistent hypothetical allocation, while declining responses from unknown cards. Hard and Expert add shared hypotheses from the supported, domain-compatible pool, or from a published list when enabled. Published-list multiplicities include hypothetical Hidden cards. These samples are **stress cases, not metagame probabilities**. A sample is compared only after all finalists have been processed; partial sampling does not give one candidate an advantage. Every simulated actor sees its own observation when choosing a response.

`confirmedWin` is conservative: it requires an immediate terminal engine result with no random/deck-order/unknown-draw dependency detected by the transition check. A multi-action winning route or sampled success remains an estimate. Search does not claim an exhaustive proof through every legal opposing response. Beginner randomness is limited to close, nonterminal, nonurgent alternatives.

## Privacy, diagnostics and replay

The public UI displays a safe reason template and difficulty. It does not display hand/Hidden labels, alternative actions, simulation assumptions, seeds or private replay data. All opponent choice, mulligan and hiding captions are masked in both the review action and animation frames; private effect/draw metadata is removed from those overlays. The developer board snapshot also omits the opposing hand.

Local diagnostic traces contain request ID, observation version, bot/configuration seed, chosen option, alternative evaluation components, work count, generation count, duration, depth, completed samples, fallback/error flags and proof status. They use permitted bot information. Human-facing export is offered only after the engine ends the match. `replayMatch` applies the recorded atomic decisions with the same engine; it does not spend the live game's RNG during planning.

This is a local browser application, not an adversarial multiplayer security boundary: its full match and private replay are stored locally. The privacy guarantee here concerns what reaches the policy and the public explanation, not protection against a person inspecting their own browser storage.

## Executable verification

```sh
npm run test:bots
npm test -- --maxWorkers=4
npm run build
npm run cards:check
npm run bot:benchmark -- 12 docs/bot-benchmark-2026-10-06.json
# Optional: only a named stronger side's comparison
npm run bot:benchmark -- 100 test-results/expert-vs-hard.json expert
```

`tests/ai-acceptance.test.ts` covers A1–A7, shared exact combat/cleanup (B1/B6), payment permutation and atomic rejection (B2), Action/Reaction legality (B3), empty-field showdown and intact group movement (B4/B5), off-turn mandatory choices (B8), and C1–C7 privacy/reproducibility/fallback/staleness/pass/explanation contracts. It also covers tied scores above the target, an item giving points to both players before cleanup, replay identity, all four real difficulty budgets defending a winning Hold, bounded multi-target fallback, multi-card Predict, public expansion state and open-list Hidden multiplicities.

The B2 fixtures verify both the shared payment adapter and the planner's choice: when equipping Hextech Gauntlets, it pays universal Power with Order and retains Mind for a legal Smoke Screen; the default payment loses that continuation. This does not prove optimal allocation for every cost combination. Existing `hidden-flow`, `card-wave5/6`, precon and timing tests cover B7's delayed availability, location/target restrictions and additional costs. Existing rules tests cover the supported keyword and replacement interactions beyond the acceptance fixtures.

Each of the 169 ordered precon pairings is a separate deterministic completion test with card/rune conservation and repeated-state detection. This replaces a single long matrix test that completed its games but exceeded its aggregate runner timeout. This existing matrix exercises the single-selection compatibility API; the benchmark exercises `decideBot` and its atomic group actions directly. The full rules suite also includes 48 seeded practice games and 16 mixed-expansion games.

Browser checks use the real worker and UI: four lobby levels, automatic bot mulligan/main/reactions, a synthetic Expert final-Conquer win, public explanation, completed-game replay download and re-execution. The built production bundle also completed a private Predict without exposing the inspected card in rendered text. Desktop and 390-pixel layouts were checked; the explanation popover was corrected to stay inside a narrow viewport. Screenshots: [completed Expert game](screenshots/bot-expert-ended.png), [mobile explanation](screenshots/bot-mobile-explanation.png).

## Measured results

The merged release passed **1,646 tests in 56 files**, including all 169 ordered precon matchups, in **957.06 seconds**. TypeScript/Vite build, catalog verification and whitespace checks also passed. The historical checkpoint results below remain separate from this final release run.

The release integration with card-engine commit `62d8da8` passed a separate **24-game compatibility sample**, covering all four comparisons and three deck pairings, with **2,908 planner decisions, four legal fallbacks, zero illegal decisions and zero blocked games**. Its six-game comparisons were beginner/reference 1–5, normal/beginner 2–4, hard/normal 4–2, and expert/hard 3–3. These small samples do not establish a strength ordering. [Release compatibility report](bot-release-smoke-2026-10-06.json).

The integration preserves physical trash target identities, restricted unit Energy and spell Power, resolving abilities, and the new card scripts. Targeted regressions cover completing large trash declarations, mandatory declarations under a zero-node budget, and carrying the public resolution state into simulations. The built worker also completed the final-Conquer fixture, with an 8–0 win and an identical three-decision downloaded replay. Full release checks and exact source fingerprints are recorded separately in [release validation](bot-release-validation-2026-10-06.json).

The original implementation measurements are recorded in [the benchmark report](bot-benchmark-2026-10-06.json). They were taken before integrating card-engine commit `62d8da8`, against the 1,102-entry executable registry recorded in that report, and are not fresh strength measurements for the expanded release. Each pairing swaps the two policies between seats with the same deck assignment and game seed. Deck matchups, first player and seed vary across pairs. The reference policy is the previous heuristic, now supplied a sanitized observation too. The report includes per-game outcomes and per-level time/fallback/depth/sample counts. Timing includes observation, planning and validation, measured while other verification jobs were running on this Mac.

The full run passed **1,593 tests in 55 files**, including all 169 ordered precon matchups, in 930.58 seconds. After the final Expert-only stress-aggregation correction and two additional regressions, the final targeted bot run passed **51 tests in three files**. TypeScript/build, catalog verification and whitespace checks passed. [Machine-readable validation summary](bot-validation-2026-10-06.json).

| Comparison            | Wins, first policy–second policy | Illegal | Blocked |
| --------------------- | -------------------------------: | ------: | ------: |
| beginner vs reference |                            14–10 |       0 |       0 |
| normal vs beginner    |                             16–8 |       0 |       0 |
| hard vs normal        |                            13–11 |       0 |       0 |
| expert vs hard        |                            13–11 |       0 |       0 |

The final comparison set contains **96 games, 11,434 planner decisions and 23 legal fallback decisions**. No game was blocked and no decision was illegal. The final Expert run replaces a prior 12–12 run after correcting risk aggregation; that earlier 24-game run remains in the report's `calibrationHistory` (120 recorded games total). Results for the other three policies are unaffected by that correction. Hidden-response penalties are averaged over completed hypotheses, so merely repeating one threat cannot double its cost.

All four policies won more games than the next comparator in this pilot. **13–11 margins are small; statistical superiority and general strength ordering remain unproven.** These are observations for the stated decks/seeds, not target win rates or a claim of optimal tuning.

Measured on **Apple M4 Pro, macOS arm64, Node v26.8.2**. Times below are each named policy's decisions in the comparison where it is the first policy; they are not pooled estimates across opponents.

| Policy   | Decisions | Mean ms | Median ms | p95 ms | Max ms |
| -------- | --------: | ------: | --------: | -----: | -----: |
| beginner |      1761 |    10.5 |       3.5 |   45.0 |  143.8 |
| normal   |      1599 |    33.4 |       9.4 |  126.3 |  314.6 |
| hard     |      1537 |    96.4 |      42.1 |  269.8 | 3979.1 |
| expert   |      1663 |   166.9 |      39.7 |  527.8 | 2159.9 |

The deterministic benchmark disables time cutoffs, and individual outliers exceeded one second. Interactive play applies its time budget plus the separate five-second worker watchdog; no watchdog fallback occurred in the verified browser fixtures. The final browser worker completed the Expert win, and the downloaded replay reconstructed winner 1, score 0–8, revision 3 from the same three atomic decisions. Large catalog chunks still produce the Vite size warning.

## Remaining limits

- Bounded beam search is not full minimax, information-set MCTS or an exhaustive opponent model. It does not play out an entire opponent main phase; future Hold likelihood remains a heuristic. Larger budgets do not by themselves establish a stronger win rate.
- Candidate limits can miss a tactical line on a combinatorially large board. Movement covers singletons, pairs and growing formations, not every subset; payment search covers useful domain-order alternatives, not every resource allocation; damage choices are ranked legal steps rather than exhaustive assignment trees. Interrupted/generator-truncated searches are marked incomplete.
- The hidden-information model has no verified metagame frequencies and no learned behavioral adaptation. Revealed top-card knowledge is retained during the active inspection choice, then conservatively forgotten; a persistent public-event memory model is still future work.
- No batch oracle currently measures every missed forced win or avoidable loss in arbitrary games. Those claims are restricted to fixtures with known expected outcomes. The initial paired sample is much smaller than 100 pairs per comparison and cannot establish reliable population win rates.
- Imported fully scripted decks are accepted by the existing engine, but the bot has not been validated against every such list. Unsupported effects listed in the inventory remain unsupported; this change adds no approximate substitute rule.
- The bundled catalog keeps production JS large (main and worker both include rules/card data). The worker protects UI responsiveness, but download-size splitting is separate work.

No external AI service, new multiplayer format, deck builder or tournament match controller is part of this implementation.
