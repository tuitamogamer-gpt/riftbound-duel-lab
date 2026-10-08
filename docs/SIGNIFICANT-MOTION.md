# Important game animations — 8 October 2026

Signature champions and victories now use a traced brass-and-teal sigil.
Scoring, combat impact and successfully resolved counters use short tactical
bursts. These accents stay inside the existing notices, leaving the score,
hand navigation and decisions visible. Scoring and draw notices have compact
layouts on desktop, portrait and landscape screens.

The [motion sources](../motion/README.md) connect all three requested tools:
Tesseract authors portable vector compositions, Remotion plays their SVG
geometry by frame, and Hyperframes authors the shared GSAP tactical timeline.
No rendered movie is downloaded or played by the game.

Animations follow Pause/Resume, the selected playback speed, open menus and
dialogs, background tabs and reduced-motion preferences. Decorative players
cannot receive focus or intercept a touch. A missing motion module falls back
to a static icon while the duel remains usable.

Only displayed public results trigger these players. Routine draws, phases,
runes, Hidden actions and unresolved card announcements do not. A replayed
identical combat-impact frame does not celebrate twice; an unsuccessful counter
does not receive a counter animation. Hold and Conquer share a scoring accent
while retaining their actual labels.

The [validation record](significant-motion-qa-2026-10-08.json) preserves source
hashes and actual process results. The final local suite passes **127 tests in
12 files**, including 28 new event and saved-review checks. Production build
and catalog consistency pass. All 112 game/data source files are byte-identical
to baseline `2c406626a6c74126bce35183a40ee87cf8804581`; the earlier complete
regression, precon matrix and bot-pilot results keep their historical scope.

Native Tesseract renders, Hyperframes lint/layout/runtime checks and the exact
Remotion compositions were reviewed. Mobile browser checks use Linux touch
emulation and native WPE WebKit, without claiming physical iOS testing.
Final layout/significance checks pass 54 Chromium and 34 native WebKit cases;
eight Chromium and two native solo playback cases verify the actual clocks.
The native emulator's first advancement took 909 ms for the signature seal and
313 ms for the tactical burst. A separate constructor guard verifies zero
AudioContext creation for the silent Remotion player.

Reviewed screenshots show [desktop](screenshots/significant-motion-desktop.png),
[mobile portrait](screenshots/significant-motion-mobile.png) and
[landscape](screenshots/significant-motion-landscape.png) notices.
Exact-commit CI, both production aliases and fresh worker/offline checks are
verified after push.
