# Command placement and stack pacing — 8 October 2026

Desktop commands now stay together near the centre of the table. Movement
confirmation, cancellation, Continue/End turn, target pages and paused review
navigation share the same command dock. Source artwork and explanatory text
sit beside it. Dense target choices scroll within their lane while the main
commands remain visible.

Mobile target pages have their own scroll row, with paging and Continue/Confirm
below. This removes the overlap found at 320px portrait and compact landscape.
Touch controls retain at least 44px targets, including the previous-review arrow.
During paginated target selection on a short portrait phone, the hand becomes
compact and the active battlefield scrolls inside its own viewport. Units and
Might remain inside that zone instead of spilling over the hand. Clearing the
selection restores the usual hand layout.

See the [centred desktop commands](screenshots/control-flow-desktop.png) and
[compact mobile target selection](screenshots/control-flow-mobile.png).

Stack playback reads a public card once and moves promptly through repeated
announcements, priority bookkeeping and cleanup. A forced automatic pass waits
280ms at 1× instead of 1,700ms; it follows the selected playback speed. Bot passes
use the same short delay, while deliberate bot actions keep their existing pace.
The complete real Hextech Ray test sequence budgets 7,670ms instead of 15,650ms
at 1×. These are programmed presentation delays, excluding rendering and worker
startup time.

Available hand, Hidden, board and Legend responses still wait for the player.
Mandatory choices, movement, damage assignments, mulligans and End turn are
never automatically chosen. Pause, menus and dialogs continue to suspend
automatic actions. Every recorded frame remains available for manual review;
signature, scoring, actual effects and combat impacts retain their reading time.

The [validation record](control-flow-qa-2026-10-08.json) preserves the final source,
real browser actions and separate baseline timing scope. The focused suite passes
156 tests across 16 files, including 13 new pacing cases. Production build and
catalog consistency pass. Only `src/game/presentation.ts` changes within
game/data sources; the other 111 files are byte-identical to `f938ac8`.
The final containment follow-up changes only mobile CSS; runtime and test
sources are byte-identical to that passing test checkpoint. Its new build and
targeted browser checks are recorded separately.

Browser checks use fresh synthetic local sessions, Chromium touch emulation
and native Linux WPE WebKit. They do not establish physical iOS performance.
Exact-commit CI, both production aliases and fresh production controls/worker/
offline checks are verified after push.
