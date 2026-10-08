# Planner performance

The October 7 performance change avoids repeated work inside a bot decision. A synthetic simulation now constructs a privacy-filtered observation only when it needs a reference choice or response. Evaluation scores and position fingerprints are reused for the same immutable synthetic state during that one decision, and hand evaluation reads an actor's resources once. The rules resolver, legal action ordering, difficulty limits, and node accounting are unchanged.

The measured comparison preserved **all 52 fixed-node decisions and their diagnostic traces**, repeated in two alternating-order rounds for **104 exact matches**. Equality included alternatives and their evaluation scores, node/generated counts, completed depth, samples, fallback/incomplete/confirmed-win flags, and explanation text. Only elapsed time was excluded.

| Difficulty | Paired calls | Baseline total | Optimized total | Measured reduction |
| ---------- | -----------: | -------------: | --------------: | -----------------: |
| Normal     |           52 |        24.94 s |         19.79 s |              20.6% |
| Expert     |           52 |       104.44 s |         78.91 s |              24.4% |
| Combined   |          104 |       129.37 s |         98.70 s |              23.7% |

The corpus contains 26 real reference-play positions from all 13 official precons, on turns 4 and 5, with 2–7 units. Both implementations were bundled before comparison and ran against the same frozen observation/request inputs and fixed bot seed. The first round ran baseline before optimized; the second reversed that order. Each implementation received one unmeasured warm-up.

The initial CPU profile identified simulation settling, repeated observation cloning/hashing, and evaluation as the main costs. The decision-local caches do not retain live games, survive into another decision, or change what the bot is allowed to inspect. Interactive play keeps its existing wall-time limits; saved work allows the same legal search to fit more comfortably within those limits.

These measurements come from a shared Node execution host. Contention, JIT and garbage collection affect elapsed times, and the corpus does not cover every large late-game board or mobile device. The measured reduction is not a device-specific guarantee or proof of greater AI strength.

The isolated comparison used `battlefield-planner-2`. The release uses `battlefield-planner-3` because separate fixes now preserve authorized active card inspections and sampled inventory correctly. Separate resolver corrections also return hybrid, stolen, and copied physical cards to hand exactly once, and preserve original card identity and ownership when placing a copied or controlled card into a deck. These behavior changes have their own focused tests and fresh match validation; the timing table isolates the earlier optimization. Replay versions 1 and 2 remain supported without rerunning a planner; their stored actions must still be legal under the corrected engine. Unknown versions are rejected.

Aggregate measurements, method details, and source/input hashes are in [the public performance report](ai-planner-performance-2026-10-07.json). Synthetic states containing hidden hands remain outside the published repository.
