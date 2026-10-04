# Riftbound Duel Lab

A local-first, unofficial Riftbound 1v1 practice simulator with a deterministic rules engine, a heuristic opponent, and a full-viewport table, one decision bar, and automatic opponent/effect playback. English is the default interface language. Choose **ENG · English**, **SRB · Srpski** (Latin script), or **ITA · Italiano** in the header. The app remembers your choice locally, including after reload. Switching languages preserves the current match and review step. Card names, artwork and official rules text retain their original English.

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
```

## Starter precons and local deck import

The lobby includes all **13 complete starter/preconstructed decks released by 2 October 2026**, alongside the four earlier custom practice decks:

| Product                     | Included decks               |
| --------------------------- | ---------------------------- |
| Proving Grounds             | Annie, Lux, Garen, Master Yi |
| Origins Champion Decks      | Jinx, Viktor, Lee Sin        |
| Spiritforged Champion Decks | Fiora, Rumble                |
| Unleashed Champion Decks    | Vi, Vex                      |
| Vendetta Showdown           | Shen, Zed                    |

Each list preserves its retail contents: 39 shuffled main-deck cards, the separately available chosen champion, a legend, 12 runes, and the supplied battlefield pool. Proving Grounds supplies one battlefield per deck; the other products supply three. A duel selects one battlefield from each player's supplied pool using the match seed. The earlier Annie, Lux, Garen, and Master Yi custom lists remain under **Practice**, distinct from the retail decks.

Use **Precon**, the product filters, **Practice**, **My decks**, or **All** to browse decks. **Deck list** shows the complete list, source links, data corrections, and script coverage. **Export .txt** downloads a reusable text list. **Import deck** accepts Piltover Archive deck codes (versions 1–6), pasted text exports from deck-building sites such as Riftbound.gg, or a local `.txt`, `.dec`, or `.deck` file. On the source site, choose **Export → Deck code / Text**, then paste that content here. A page URL alone is not supported. Set a deck name and, for older codes without a chosen champion, pick the champion from the imported list. Card names, IDs, signed printings, and `3x Card Name` quantities are supported. Sections are `Legend`, `Champion`, `Main Deck`, `Runes`, `Battlefields`, and `Sideboard`. Sideboards are saved and exported but are not used in a single Duel.

The importer validates card identity, card counts, domains, copy limits, champion/signature restrictions, rune and battlefield composition, and current ban data. The historical-precon option preserves original product lists containing subsequently banned cards. Structural validity, tournament legality, and engine support are reported separately. A structurally valid imported list can be saved even when it contains unsupported cards, but the lobby blocks starting a match until both selected decks have complete script coverage. Lists and matches stay in this browser's localStorage; import does not upload their text.

Origins, Spiritforged, Unleashed, and Vendetta lists were transcribed from Riot's published lists. The four **Proving Grounds lists use a community transcription from RiftMana**, because a complete Riot-hosted list was not located; the official product sheet corroborates the product and champions. See [docs/PRECON-SOURCES.md](docs/PRECON-SOURCES.md) for links and reconciliation notes. Radiance's announced 23 October release is outside this dated snapshot. Partial Pre-Rift packs are not complete starter decks and are excluded.

## Scripted play and limits

The engine registers every catalog printing and uses explicit scripts plus a conservative compiler for completely recognized rule text. Alternative printings share behavior only when their full rules face matches. Explicit Origins, Spiritforged, Unleashed and Vendetta expansion modules extend play beyond the included decks. Implemented systems include mulligans, rune channeling and payment, spell-only resources, activated and triggered abilities, multi-unit movement, empty-field and combat showdowns, Action/Reaction priority, effect chains, target revalidation, spell counters and modes, Empower events, damage assignment, simultaneous combat damage, death replacements, scoring, final-point restrictions, and burnout.

Precon effects extend this with explicit discard, recycle, retrieval and Vision choices; optional costs and Repeat; Hidden cards and battlefield restrictions; Temporary units and gear; distinct token types; equipment and inherited abilities; Ambush; Flow; Empower; XP/Level/Hunt effects; dynamic Might and keywords; and the listed legends and battlefields. Choices remain visible steps in the same manual Proceed flow. The bot chooses legal actions from its own information and the public board.

**A script entry and a passing scenario are not proof of every possible rules interaction.** This is an unofficial local practice simulator, not a certified tournament referee or a complete implementation of every Riftbound card. The provider catalog contains 1,451 printings from eight sets, including cards that remain unsupported. Unsupported cards are displayed and reported explicitly rather than played as blank units. A refresh can reuse existing scripts or supported rule families; unfamiliar effects still require implementation and tests. The complete per-card inventory, executable scripts and missing-effect reasons are saved in [docs/card-coverage.json](docs/card-coverage.json); see [coverage and import validation](docs/CARD-COVERAGE.md). There is no network multiplayer, account system, or ranked play. Rules research and validation scope are documented in [docs/RULES-RESEARCH.md](docs/RULES-RESEARCH.md) and [docs/VALIDATION.md](docs/VALIDATION.md).

## Native match flow

- The complete table and one bottom decision bar fit the viewport. Both battlefields, bases, hands, runes, Legends and Champions stay visible. Cards overlap when rows are crowded instead of adding page or hand scrolling.
- Desktop windows from 1100 × 650 use a dedicated table layout: Legend/Champion zones in the left rail, bases beside two tall battlefields, and a wide hand along the bottom. Card sizes grow with the available height, including on Full HD, 1440p and 4K screens; smaller windows retain the compact layout.
- Select up to two cards directly in your opening hand, then confirm the replacement or keep the hand.
- Select a glowing card to see its name, type, cost and legal plays in the bottom bar. Select an available target or destination directly on the table, or use the matching action button. A selection can be cancelled with Escape.
- Select a ready unit and a battlefield; add or remove units directly on the table, then confirm the group move. During combat, click highlighted enemies to assign damage. Remaining damage is shown in the decision bar.
- Publicly played cards and the Action/Reaction chain appear at the center of the battlefields. The newest response resolves first; the remaining cards stay visible while each effect resolves. Cards enter from their player's side, with stationary presentation when reduced motion is enabled.
- End turn is always an explicit player decision. The opponent chooses its own legal moves and recorded effect frames play automatically. Human priority passes are automatic only when passing is the sole legal action; playable reactions, optional effects, mulligans, movement and damage choices wait for the player.
- Pause stops playback and opponent timers. Rules, card details, the match log, hidden tabs and leaving the match also suspend automatic progress. Closing the overlay or returning resumes it. Saves retain the final rules state and current visual frame; selecting Resume after reload continues the sequence.
- Hover or keyboard-focus public cards for a large art-and-rules panel; playback waits while it is open. Escape dismisses it. Info buttons and chain cards open full details on touch screens. Opponent hands and facedown cards remain private. Exhausted board cards retain grayscale art and their EXHAUSTED marker; the reading panel keeps the art clear alongside the state marker.
- The match log is opened from the toolbar. It also contains the detailed combat summary; routine play uses the board and bottom bar.
- English, Serbian and Italian remain available from the compact match toolbar. Changing language preserves the match.

## Architecture

- `src/i18n/`: shared English, Serbian and Italian catalogs, display-time message translation, language selector and local preference storage. Engine IDs and saved snapshots are language independent.

- `src/game/engine.ts`: deterministic pure state transitions, legal-action generation, rules, and review snapshots.
- `src/game/scripts.ts` and the precon/expansion modules: executable card effects and event hooks.
- `src/game/card-registry.ts`, `src/data/card-identity.ts`, and `src/game/card-script-compiler.ts`: every-printing registry, safe rules aliases, and full-text compilation of supported rule families.
- `scripts/report-card-coverage.mjs`: reproducible per-card script/status inventory and stale-report check.
- `src/game/deck-import.ts`: text import/export, validation, coverage reports, and local imported-deck storage.
- `src/game/deck-sources.ts`: bounded local Piltover deck-code decoding and chosen-champion resolution.
- `src/data/precon-lists.json`: sourced retail deck contents; `src/components/DeckImport.tsx`: the local import dialog.
- `src/game/bot.ts`: public-information tactical bot.
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

Three original imagegen backgrounds are saved in `assets/originals/` and optimized in `public/art/`. Full prompts, style decisions, and asset paths are in [docs/ART-DIRECTION.md](docs/ART-DIRECTION.md). The interface uses a League of Legends inspired navy, antique gold, and arcane cyan style with locally bundled Cinzel headings.
