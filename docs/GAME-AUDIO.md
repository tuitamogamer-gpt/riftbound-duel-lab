# Game audio

Open **Appearance → Display & sound** to enable sound, adjust volume and try a
sample. Announcer calls can be disabled independently. Existing mute preferences
are preserved; a new installation starts muted.

Sound follows the displayed duel event: a signature champion arriving, contested
battle, combat impact, scoring, a successful counter and the final result.
Routine actions, empty priority passes and ordinary ability announcements stay
quiet. Pause, inspection and backgrounding stop gameplay audio. Resuming,
unmuting or stepping back through a review does not replay old cues.

The four short English calls were generated through the Fish Audio connector
using the official Adrian voice. They last 0.624–1.368 seconds and total 28,208
bytes. [Generation provenance](game-audio-provenance-2026-10-22.json) records the
voice, generation tasks, source files and normalized asset hashes. The connector
provides speech generation; the nonverbal accents use the local Web Audio mixer.

All four MP3 files ship with the app and belong to its versioned offline cache.
Playing a duel makes no Fish Audio API call and requires no browser credential.
The mixer reuses one AudioContext, unlocks on a user gesture, respects the master
volume and cancels a delayed audio load if its frame is no longer current.

`game-audio-events.test.ts` covers public event timing, Hidden information,
repeated frames and mute/resume behavior. `game-audio-player.test.ts` covers
playback cancellation, asset failures and preview/mute behavior. Browser checks
exercise the actual audio decoder and UI separately.
