# Riftbound Duel Lab

A local-first, unofficial Riftbound 1v1 practice simulator with a deterministic rules engine, four bot difficulty settings, and a full-viewport table, one decision bar, and automatic opponent/effect playback. English is the default interface language. Choose **ENG · English**, **SRB · Srpski** (Latin script), or **ITA · Italiano** in the header. The app remembers your choice locally, including after reload. Switching languages preserves the current match and review step. Card names, artwork and official rules text retain their original English.

**Play:** [riftbound-duel-lab.vercel.app](https://riftbound-duel-lab.vercel.app/). Published on 2 October 2026; see [deployment details and verification](docs/DEPLOYMENT.md).

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL shown in the terminal, normally **http://127.0.0.1:5173**. Or double-click `Start Riftbound.command`. No external AI service, login, or API key is needed to play.

```sh
npm test          # rules, exact effects, deterministic simulations, save and step review
npm run build    # TypeScript + production build
npm run preview  # serve the production build on loopback
npm run sync:cards # refresh all provider cards and rebuild the script inventory
npm run cards:check # verify the saved inventory matches engine support
npm run test:bots # tactical, fairness, fallback and replay scenarios
npm run bot:benchmark -- 12 # paired bot games and measured decision times
```

Choose **Beginner**, **Normal**, **Hard**, or **Expert** in the lobby. The bot plans from its permitted observation in a Web Worker, responds during either player's turn, and uses the same legal actions, resource payment and combat resolver as the human. Open the **AI** control in the match toolbar for its public reason; a diagnostic replay becomes downloadable after the game ends. See [bot implementation, measured results and limits](docs/AI-BOTS.md).

## Starter precons and local deck import

The lobby includes all **13 complete starter/preconstructed decks released by 2 October 2026**, alongside the four earlier custom practice decks:

| Product                     | Included decks               |
| --------------------------- | ---------------------------- |
| Proving Grounds             | Annie, Lux, Garen, Master Yi |
| Origins Champion Decks      | Jinx, Viktor, Lee Sin        |
| Spiritforged Champion Decks | Fiora, Rumble                |
| Unleashed Champion Decks    | Vi, Vex                      |
| Vendetta Showdown           | Shen, Zed                    |

Each list preserves its retail contents: 39 shuffled main-deck cards, the separately available chosen champion, a legend, 12 runes, and the supplied battlefield pool. Proving Grounds supplies one battlefield per deck; the other products supply three. The lobby highlights both players' supplied battlefields as selectable tiles, with the first supplied field selected by default. Choices are retained per deck during setup; the grouped selector also offers other supported battlefields for practice. The earlier Annie, Lux, Garen, and Master Yi custom lists remain under **Practice**, distinct from the retail decks.

Use **Precon**, the product filters, **Practice**, **My decks**, or **All** to browse decks. **Deck list** shows the complete list, source links, data corrections, and script coverage. **Export .txt** downloads a reusable text list. **Import deck** accepts Piltover Archive deck codes (versions 1–6), pasted text exports from deck-building sites such as Riftbound.gg, or a local `.txt`, `.dec`, or `.deck` file. On the source site, choose **Export → Deck code / Text**, then paste that content here. A page URL alone is not supported. Set a deck name and, for older codes without a chosen champion, pick the champion from the imported list. Card names, IDs, signed printings, and `3x Card Name` quantities are supported. Sections are `Legend`, `Champion`, `Main Deck`, `Runes`, `Battlefields`, and `Sideboard`. Sideboards are saved and exported but are not used in a single Duel.

The importer validates card identity, card counts, domains, copy limits, champion/signature restrictions, rune and battlefield composition, and current ban data. The historical-precon option preserves original product lists containing subsequently banned cards. Structural validity, tournament legality, and engine support are reported separately. A structurally valid imported list can be saved even when it contains unsupported cards, but the lobby blocks starting a match until both selected decks have complete script coverage. Lists and matches stay in this browser's localStorage; import does not upload their text.

Origins, Spiritforged, Unleashed, and Vendetta lists were transcribed from Riot's published lists. The four **Proving Grounds lists use a community transcription from RiftMana**, because a complete Riot-hosted list was not located; the official product sheet corroborates the product and champions. See [docs/PRECON-SOURCES.md](docs/PRECON-SOURCES.md) for links and reconciliation notes. Radiance's announced 23 October release is outside this dated snapshot. Partial Pre-Rift packs are not complete starter decks and are excluded.

## Practice tools

See the [practice guide](docs/PRACTICE-GUIDE.md) for search examples, draft recovery, lesson steps, replay controls and offline setup.

**Build a deck** clones a precon or saved list and edits the legend, chosen champion, main deck, runes, battlefield pool and up to ten sideboard cards. The builder shares the importer's copy/domain/signature and ban checks, shows the Energy curve and actual card count, and supports saving, editing, deleting and exporting a local list. Main decks can contain 39–999 shuffled cards plus the chosen champion; the importer handles both inclusive exports and explicit remaining-main sections without removing the champion twice.

Builder edits support **Undo/Redo** and Ctrl/⌘Z, with up to 40 edits retained in the current session. An unfinished draft has an explicit local recovery slot. Recover, replace or discard that draft deliberately; invalid stored data and failed writes preserve the existing backup. If another tab changes the recovery slot, the builder reports the conflict before overwriting it. Rules tokens cannot be registered as deck cards.

Choose **Single duel** or **Best of three** in setup. BO3 records each completed game's result, ends at two wins and offers sideboarding between games. Each exchange preserves the exact registered main-plus-sideboard inventory and main count; legend, champion, runes and battlefields stay fixed. The previous loser starts by default, with a practice override. The bot keeps its list between games. This is a practice series, without an official tournament-format claim.

Starting another duel during an unfinished series requires an explicit confirmation. **Continue series** preserves its recorded score and current game.

The **Training lab** contains six playable engine scenarios: deploying, grouped movement and conquering, reactions, Hidden, damage assignment, and holding for victory. Retry and Undo affect only the lesson. **Match history** automatically records completed local duels with replay data, outcome and deck/difficulty statistics. The viewer steps through public observations from either player's perspective and offers postmatch bot diagnostics, replay import/export and deletion. Imported replays are checked against their recorded catalog/rules versions and the current legal-action engine.

Training instructions follow the scenario's current phase and show the next useful step. Replay controls jump between turns or key moments, filter the visible move list, and change playback speed. Long move lists use pages of 40 entries. Local bookmarks retain up to ten frame notes for each of twenty matches; editing a note pauses playback. Import keeps the newest twenty matches and explains when an older replay falls outside that limit.

Replay and session exports contain the complete original match, including both players' private cards, so they can be reconstructed. The replay viewer limits each frame to the selected player's permitted observation. Bookmark notes stay local and are not included in the canonical replay export.

In a match, **Choose runes** enables manual payment ordering. Before confirming a paid action, the picker shows the actual resource cost, recycled/exhausted runes and retained pools from the same resolver that commits the action. Exhausted runes retain the engine's Power-payment priority. The default automatic payment remains available. Missing resources and combat damage assignments now have more precise public explanations.

**Saved duels** shows autosave status, keeps up to three recent backups, and imports/exports validated session files. A failed write preserves the previous save and exposes a recovery message. Importing or restoring a saved duel pauses it for inspection. Ordinary browser saves, deck lists, training progress and history stay local.

The production app is installable through **Install app** or the browser's home-screen command. After the first successful online setup, application code, bot worker, fonts and table art are cached for offline practice. **Download selected decks** additionally saves card images for the two selected lists and reports unavailable images. Uncached catalog art falls back to text. Online-room API responses are never placed in the offline cache.

Private online duels use a server-authoritative `/api/duel` function, invitation links and separate seat credentials. Each player receives their own permitted observation and legal actions. The production server requires a connected **private Vercel Blob store**; its setup and the current hosting status are documented in [ONLINE-DUELS.md](docs/ONLINE-DUELS.md). Local bot play and offline practice need no server credentials.

## Catalog snapshot

<!-- card-catalog-summary:start -->

Saved catalog fetched **6 October 2026**: **1,451 provider printings** in **8 sets**, plus **8 local rules tokens**. Completeness is relative to Riftcodex; its latest reported record update is **21 July 2026**.

Executable registration: **1,459 / 1,459 entries**, with **0 unsupported** (1,108 scripted, 37 compiled, 314 aliases). Counts include printings and tokens, rather than only distinct card designs.

Retail precons: **13 / 13** have complete executable coverage. All 13 lists have valid structure and complete catalog references. Historical retail contents and current tournament legality remain separate.
<!-- card-catalog-summary:end -->

The snapshot contains Origins, Proving Grounds, Spiritforged, Unleashed, Vendetta and three promotional sets. Radiance is outside this dated snapshot. The report and library include every provider printing and local token. The library and builder search names, rules text, IDs and equivalent printing codes, including when the library shows base faces only. Combine search terms or quote a phrase, filter by set/domain/type and sort by name, Energy or Might. Reset filters restores the complete result list; the builder also offers an addable-cards filter.

## Scripted play and limits

The engine registers every catalog printing and uses explicit scripts plus a conservative compiler for completely recognized rule text. Alternative printings share behavior only when their full rules face matches. Explicit Origins, Spiritforged, Unleashed and Vendetta expansion modules extend play beyond the included decks. Implemented systems include mulligans, rune channeling and payment, spell-only resources, activated and triggered abilities, multi-unit movement, empty-field and combat showdowns, Action/Reaction priority, effect chains, target revalidation, spell counters and modes, Empower events, damage assignment, simultaneous combat damage, death replacements, scoring, final-point restrictions, and burnout.

Precon effects extend this with explicit discard, recycle, retrieval and Vision choices; optional costs and Repeat; Hidden cards and battlefield restrictions; Temporary units and gear; distinct token types; equipment and inherited abilities; Ambush; Flow; Empower; XP/Level/Hunt effects; dynamic Might and keywords; and the listed legends and battlefields. Choices remain visible steps in the same manual Proceed flow. The bot chooses legal actions from its own information and the public board.

**A script entry and a passing scenario are not proof of every possible rules interaction.** Every entry in the saved catalog currently has executable registration. This is an unofficial local practice simulator; its checked interaction scenarios and dated provider snapshot do not establish coverage of every Riot publication or every rules interaction. A refresh can reuse existing scripts or supported rule families; unfamiliar effects still require implementation and tests, and unsupported cards are reported explicitly and blocked from matches. The complete per-card inventory, provenance, precon coverage and executable scripts are saved in [docs/card-coverage.json](docs/card-coverage.json); see [coverage and import validation](docs/CARD-COVERAGE.md). Private-room multiplayer requires the server storage setup described below; there is no account system or ranked play. Rules research and validation scope are documented in [docs/RULES-RESEARCH.md](docs/RULES-RESEARCH.md) and [docs/VALIDATION.md](docs/VALIDATION.md).

## Native match flow

- Desktop keeps the complete table and one decision bar in the viewport. On phones, a public minimap shows every base and battlefield, including control, unit counts, Might, combat, Hidden counts and available targets. The selected zone has the opponent above your units; crowded rows scroll horizontally without shrinking touch targets.
- The mobile hand has readable names and costs, swipe scrolling, navigation arrows and **Browse hand**. Its reading sheet shows complete rules and separate **Select card** / **Details** controls. Select a card, return to the table and confirm a legal move. Mulligan selections stay in the sheet until you return to confirm up to two replacements. Landscape puts the hand and decisions in a right-side rail.
- Desktop windows from 1100 × 650 use a dedicated table layout: Legend/Champion zones in the left rail, bases beside two tall battlefields, and a wide hand along the bottom. Card sizes grow with the available height, including on Full HD, 1440p and 4K screens; smaller windows retain the compact layout.
- Select up to two cards directly in your opening hand, then confirm the replacement or keep the hand.
- Select a glowing card to see its name, type, cost and legal plays in the bottom bar. Select an available target or destination directly on the table, or use the matching action button. A selection can be cancelled with Escape.
- Select a ready unit and a battlefield; add or remove units directly on the table, then confirm the group move. During combat, click highlighted enemies to assign damage. Remaining damage is shown in the decision bar.
- Publicly played cards and the Action/Reaction chain appear at the center of the desktop battlefields and in a persistent strip above the mobile zone. The newest response resolves first; the remaining cards stay visible while each effect resolves, including when a base is selected. Cards enter from their player's side, with stationary presentation when reduced motion is enabled.
- The chosen signature champion receives a portrait entrance when its public unit actually enters play. Important public events highlight the screen edges and affected zones, including combat, damage, counters, Equipment, scoring and turn transitions. Paused review and reduced motion keep these cues visible without animation. Exhausted markers sit above unit Might badges.
- End turn is always an explicit player decision. The opponent chooses its own legal moves and recorded effect frames play automatically. Human priority passes are automatic only when passing is the sole legal action; playable reactions, optional effects, mulligans, movement and damage choices wait for the player.
- Pause stops playback and opponent timers. Rules, card details, the match log, hidden tabs and leaving the match also suspend automatic progress. Closing the overlay or returning resumes it. Saves retain the final rules state and current visual frame; selecting Resume after reload continues the sequence.
- Set playback to **0.5×**, **1×** or **2×** from the match toolbar or mobile **Duel menu**. The preference is saved locally. While paused, **Previous effect** and **Next effect** let you read each recorded step; **Finish review** returns to the table while keeping the game paused. Browsing these frames never replays a move or changes the committed result. Reload preserves the pause and exact step.
- The status distinguishes **Your reaction** and required effect/damage choices from whose turn it is. A faster playback setting still waits for every playable human response and explicit end-turn decision.
- Hover or keyboard-focus public cards for a large art-and-rules panel; playback waits while it is open. Escape dismisses it. On touch screens, use the info control or hold any public card to open a full-screen reading view. Moving your finger cancels the hold so hand and board rows still scroll; releasing a hold never selects or plays the card. The close control stays visible while reading, and closing details returns to the hand or pile you were browsing. Legend/Champion controls show just the card and inspection button on phones; printed Might is not repeated on units unless its value has changed. Opponent hands and facedown cards remain private. Exhausted board cards retain grayscale art and their EXHAUSTED marker; the reading panel keeps the art clear alongside the state marker.
- The match log is opened from the toolbar or mobile menu. It also contains the detailed combat summary; routine play uses the board and bottom bar. Opening the mobile menu or hand-reading sheet suspends automatic progress.
- English, Serbian and Italian remain available from the toolbar or mobile menu. Changing language preserves the match. The mobile interaction patterns are informed by [MTG Arena's official mobile controls](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-mobile-faqs-2021-01-28) and [Hearthstone's phone layout](https://hearthstone.blizzard.com/en-us/news/18648148).

## Architecture

- `src/i18n/`: shared English, Serbian and Italian catalogs, display-time message translation, language selector and local preference storage. Engine IDs and saved snapshots are language independent.

- `src/game/engine.ts`: deterministic pure state transitions, legal-action generation, rules, and review snapshots.
- `src/game/scripts.ts` and the precon/expansion modules: executable card effects and event hooks.
- `src/game/card-registry.ts`, `src/data/card-identity.ts`, and `src/game/card-script-compiler.ts`: every-printing registry, safe rules aliases, and full-text compilation of supported rule families.
- `scripts/report-card-coverage.mjs`: reproducible per-card script/status inventory and stale-report check.
- `src/game/deck-import.ts`: text import/export, validation, coverage reports, and local imported-deck storage.
- `src/game/deck-sources.ts`: bounded local Piltover deck-code decoding and chosen-champion resolution.
- `src/data/precon-lists.json`: sourced retail deck contents; `src/components/DeckImport.tsx`: the local import dialog.
- `src/game/bot.ts`, `src/game/ai/`: observation/decision adapters, shared-engine beam planning, difficulty/profile configuration, diagnostics and replay.
- `src/hooks/useBotDecision.ts`: worker scheduling, stale-response validation and legal watchdog fallback.
- `src/data/`: normalized card catalog, provider provenance, bans, token metadata, and validated retail and practice decks.
- `src/components/StepFlow.tsx`: manual review and event highlights.
- `src/components/CardPreview.tsx`: shared viewport-aware hover/focus inspection.
- `src/components/CombatPanel.tsx`: interactive combat assignment and animated engine-frame playback.
- `src/persistence.ts`: validated local session recovery.
- `scripts/sync-cards.mjs`: paginated, validated Riftcodex catalog refresh.
- `docs/`: official rules research, API sources, and actual validation results.

The game and AI execute in the browser. The playable-art cache now contains **285 local card images** (28,047,582 bytes), recorded with source URLs and checksums in `src/data/card-art-manifest.json`. Generated playmats, token fallbacks, and fonts are also local. Bundled precon and practice matches use these local assets after the app is served. The rest of the full catalog uses remote images and falls back to text cards if those images fail. No saved match is sent to an AI service. Refresh the playable art with `npm run cache:art`.

## Sources and publication status

- [Riftcodex API](https://riftcodex.com/docs/) — unofficial public JSON database, no read key.
- [Official rules hub](https://playriftbound.com/en-us/rules-hub/).
- [Riot's Riftbound Digital Tools Policy](https://developer.riotgames.com/docs/riftbound).

Riot's published policy does not approve automated standalone Riftbound simulators. This project has no Riot license or approval; a community API and a disclaimer do not grant distribution rights. The included `vercel.json` configures the Vite production build, client-side routing, and response headers.

Riftbound Duel Lab isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Generated art

Three original imagegen backgrounds are saved in `assets/originals/` and optimized in `public/art/`. Full prompts, style decisions, and asset paths are in [docs/ART-DIRECTION.md](docs/ART-DIRECTION.md). The lobby, library and dialogs use a paper-and-ink comic layout with teal and gold accents; the match table is a dark ink surface over the Rift terrace art with gold battlefield frames, teal for your side and rose for the opponent. Display type is locally bundled Exo 2 with DM Sans for text. The current visual system is recorded in [docs/DESIGN-REVIEW.md](docs/DESIGN-REVIEW.md).
