# Riftbound — Marvel-reference redesign

Date: 2026-10-02

Reference: https://marvel-lcg.vercel.app/

The reference was inspected in the browser, including its paper lobby, character selection, opening hand, and dark match table. Its heavy italic headings, ink borders, offset shadows, paper dot texture, and three-step setup structure are adapted to Riftbound with teal/gold accents and official League character art. This is an adaptation to the existing game, not a recreation of Marvel game rules.

## Implementation

- `src/components/Lobby.tsx`: illustrated Jinx hero; edition filters and selectable champions; selected champion details; deck composition/import/export actions; opponent selection; training/tactical choice; start/resume actions.
- `src/marvel-theme.css`: responsive paper theme, header, library, dialogs, fallback text contrast.
- `src/game-theme.css`: dark match table, player colors, zone hierarchy and Exo 2 type.
- `src/data/champion-art.ts`: local art lookup for all 13 current champions; provenance in `docs/ART-SOURCES.md`.
- `src/App.tsx`: existing match/deck state wired to the lobby component; screen transitions return to page top.
- Exo 2 is bundled locally. Existing engine, persistence, and deck import behavior are retained.

## Verification

- Production build passes (`npm run build`). Existing large catalog bundle warning remains.
- Full current test suite passes: 261 tests, 14 files (`npm test`).
- `git diff --check` passes.
- Browser checks at 1280px desktop, 940px compact desktop, and 390px mobile; no page-level horizontal overflow observed.
- No JavaScript console errors observed during tested flows.
- Verified collection switching, Jinx selection, Zed opponent selection, training mode, deck composition, import example parsing, Jinx versus Zed match start, opening-hand confirmation, manual Proceed and AI review frames.
- Reload/resume returns to the same AI action review frame.
- Library search for Jinx and card detail dialog verified.
- All local lobby/champion images load. Some unrelated library catalog art uses the pre-existing external image source; that behavior is unchanged.
- Keyboard setup navigation moves focus into the setup section; reduced motion respected.

## Screenshots

- `design/riftbound-desktop.jpg` — home, 940×900
- `design/riftbound-setup.jpg` — setup, 940×900
- `design/riftbound-mobile.jpg` — home, 390×844
- `design/riftbound-game.jpg` — match table, 940×900

Final result: passed.

Local preview: http://127.0.0.1:5173/
