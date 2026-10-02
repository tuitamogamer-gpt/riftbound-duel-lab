# Direct movement decisions — 2026-10-02

Movement preparation now responds immediately. Selecting a destination, adding or removing units, and cancelling the proposed group do not play an effect review. Only the human player's preparation actions take this path; confirming movement still uses the engine's full resolution and animation.

The bottom controls keep confirmation and cancellation visible independently of pagination. The board marks selected units and the destination, while the controls show the group size and destination name. Empty groups cannot be confirmed. Damage confirmation is also separated from paginated target choices.

Validation on the current combined local checkout:

- `npm test`: 1,248 tests passed across 47 files, including five new movement regression tests.
- `npm run build`, `npm run cards:check`, and `git diff --check`: passed. Build retains the existing large-bundle warning.
- Browser: immediate multi-unit selection; empty-group confirmation disabled; cancellation; three units move only after confirmation and capture the field.
- No page overflow at 1280×720 and 390×844; confirm/cancel controls remain visible. No browser warnings or errors observed during the movement check.
- Screenshot: `test-results/movement-flow-desktop.jpg` (ignored local artifact).

`tests/movement-preview.html` is a synthetic development fixture. Open it only on a separate local test origin because it replaces that origin's saved match. It is not a production entry point.

The checkout also contains concurrent changes to rules, bots, effect presentation, runes, and lobby UI. They were preserved. This continuation has not committed, pushed, or deployed the combined checkout; publication scope was asked separately.
