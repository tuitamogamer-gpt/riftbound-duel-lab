Original prompt: Karte na battlefieldima odlaze u ćošak; pokazivati stack akcija i reakcija na sredini stola i animirati karte koje se igraju, a ne prikazivati ih dole.

- Source recovered from GitHub repo tuitamogamer-gpt/riftbound-duel-lab at production commit 7f7d8d3; isolated clone in this chat workspace. Marvel checkout untouched.
- Fixed Safari intrinsic card-wrapper sizing: battlefield/base cards, power markers, and details stay together and centered. Short landscape screens retain an internal scrolling table and accessible decisions.
- Added a reserved central action-chain lane with LIFO order, visible ownership/status, public play/resolution cards, card flight animations, and reduced-motion support. The lane keeps legal battlefield/base targets accessible; narrow screens scroll the card rail.
- Preserve displayed review frames and hidden-card boundaries; bottom bar retains decisions while played cards/effect announcements move to the middle.
- Added large art-and-rules hover/focus previews matching the supplied Arkham reference. Automatic playback pauses while reading and resumes after dismissal.
- Validation: 1,258 tests across 48 files passed; final TypeScript/Vite production build passed. Chromium and WebKit browser checks passed for public/hidden plays, actual reactions/resolutions, reload, hover/Escape, reduced motion, crowded battlefields, mobile/desktop geometry, and pointer access to battlefield/base targets. Fresh central-final report has no failures or page errors.
- Ran the develop-web-game browser client against the final chain fixture; inspected desktop/mobile and final-client screenshots. No pending implementation work.
- Release requested: commit/push/production deployment. The first deployment was blocked by unregistered local Git email; corrected this clone's Git identity to the authenticated tuitamogamer-gpt account, matching the previous successful production author. Runtime files and validation results are unchanged.
