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

# Visual system pass

Date: 2026-10-05

Goal: one coherent product across the paper lobby and the dark match table, with a clear zone hierarchy on the table and consistent chrome, type and buttons.

## Tokens and layering

- `src/match-skin.css` is the last stylesheet loaded. It defines the match palette as custom properties on `.app.is-game` (`--ink-0…4` surfaces, `--gold`, `--you` teal, `--foe` rose, `--violet` reaction accent, `--text`, `--line`) and owns colour, surfaces, type and chrome. The layout sheets (`match-layout.css`, `battlefield-layout.css`, `desktop-table.css`, `MatchControls.css`) keep geometry only.
- Display type is Exo 2 (italic 800) for names, headings and buttons; DM Sans for labels and copy. Secondary text on desktop stays at 10px or larger.
- Player identity is consistent everywhere: teal accent for the human (player bar, owned battlefields, playable glow, chain entries), rose for the AI, gold for selection, scoring and the primary action.

## Table hierarchy

1. Battlefields: full-visibility art with a readability gradient, gold frame, italic uppercase names, pill control badges, a framed flag divider; owned fields glow teal or rose, combat glows amber, and a legal destination glows teal.
2. Hand tray: raised gradient surface with a teal top light; cards are centered, lift on hover and glow teal when playable.
3. Bases: translucent dashed panels over the Rift terrace playmat art, with a chip label and a quiet empty state marker.
4. Runes and setup zones: subdued panels; the legend zone keeps a warm tint.
5. Chrome: toolbar with a live turn-state pill (`data-state` on `.turn-indicator`), a pill-based turn sequence, and a decision bar whose top accent follows the window (teal action, gold resolving, violet reaction, amber damage).

## Lobby and dialogs

- Champion grid uses `auto-fill` columns so 13 precons fill 5 columns on wide screens; the opponent panel is sticky so Start duel stays reachable while browsing.
- Deck details and import dialogs now use the paper surface throughout (sleeve preview, decklist, inputs, source links).
- Library card names are larger with lift-on-hover; the hover preview panel uses a uniform 14px radius with an accent ring.
- Dialogs opened during a match (log, card detail, rules, piles) stay on the dark table surface instead of switching to paper.

## Verification

- Full test suite and production build pass after the change.
- Chromium screenshots at 1440×900, 1280×720, 1920×1080, 1366×640, 1024×768 and 390×844 for the lobby, library, dialogs, opening hand, action chain, reaction window, movement, combat and match log.
