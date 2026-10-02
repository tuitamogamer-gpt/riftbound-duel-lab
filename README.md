# Riftbound Duel Lab

A local-first, unofficial Riftbound 1v1 practice simulator with a deterministic rules engine, a heuristic opponent, and a mandatory **Proceed** gate after every action and narrated effect. English is the default interface language. Choose **ENG · English**, **SRB · Srpski** (Latin script), or **ITA · Italiano** in the header. The app remembers your choice locally, including after reload. Switching languages preserves the current match and review step. Card names, artwork and official rules text retain their original English.

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

Use **Precon**, the product filters, **Practice**, **My decks**, or **All** to browse decks. **Deck list** shows the complete list, source links, data corrections, and script coverage. **Export .txt** downloads a reusable text list. **Import deck** accepts pasted text or a local `.txt`, `.dec`, or `.deck` file, with card names or IDs and quantities such as `3x Card Name`. Supported sections are `Legend`, `Champion`, `Main Deck`, `Runes`, and `Battlefields`.

The importer validates card identity, card counts, domains, copy limits, champion/signature restrictions, rune and battlefield composition, and current ban data. The historical-precon option preserves original product lists containing subsequently banned cards. Structural validity, tournament legality, and engine support are reported separately. A structurally valid imported list can be saved even when it contains unsupported cards, but the lobby blocks starting a match until both selected decks have complete script coverage. Lists and matches stay in this browser's localStorage; import does not upload their text.

Origins, Spiritforged, Unleashed, and Vendetta lists were transcribed from Riot's published lists. The four **Proving Grounds lists use a community transcription from RiftMana**, because a complete Riot-hosted list was not located; the official product sheet corroborates the product and champions. See [docs/PRECON-SOURCES.md](docs/PRECON-SOURCES.md) for links and reconciliation notes. Radiance's announced 23 October release is outside this dated snapshot. Partial Pre-Rift packs are not complete starter decks and are excluded.

## Scripted play and limits

The engine registers every catalog printing and uses explicit scripts plus a conservative compiler for completely recognized rule text. Alternative printings share behavior only when their full rules face matches. Explicit Origins, Spiritforged, Unleashed and Vendetta expansion modules extend play beyond the included decks. Implemented systems include mulligans, rune channeling and payment, spell-only resources, activated and triggered abilities, multi-unit movement, empty-field and combat showdowns, Action/Reaction priority, effect chains, target revalidation, spell counters and modes, Empower events, damage assignment, simultaneous combat damage, death replacements, scoring, final-point restrictions, and burnout.

Precon effects extend this with explicit discard, recycle, retrieval and Vision choices; optional costs and Repeat; Hidden cards and battlefield restrictions; Temporary units and gear; distinct token types; equipment and inherited abilities; Ambush; Flow; Empower; XP/Level/Hunt effects; dynamic Might and keywords; and the listed legends and battlefields. Choices remain visible steps in the same manual Proceed flow. The bot chooses legal actions from its own information and the public board.

**A script entry and a passing scenario are not proof of every possible rules interaction.** This is an unofficial local practice simulator, not a certified tournament referee or a complete implementation of every Riftbound card. The provider catalog contains 1,451 printings from eight sets, including cards that remain unsupported. Unsupported cards are displayed and reported explicitly rather than played as blank units. A refresh can reuse existing scripts or supported rule families; unfamiliar effects still require implementation and tests. The complete per-card inventory, executable scripts and missing-effect reasons are saved in [docs/card-coverage.json](docs/card-coverage.json); see [coverage and import validation](docs/CARD-COVERAGE.md). There is no network multiplayer, account system, or ranked play. Rules research and validation scope are documented in [docs/RULES-RESEARCH.md](docs/RULES-RESEARCH.md) and [docs/VALIDATION.md](docs/VALIDATION.md).

## Deliberate pace and visible changes

- The bot **never acts on a timer**.
- Choose a player action, then inspect one immutable event snapshot at a time.
- Press **Proceed** (or Space when a form control is not focused) to advance one snapshot.
- **Previous step** returns to an earlier snapshot; **Play/Pause** and the speed selector play recorded frames. Playback stops at the final frame and never chooses a move or starts the next bot action.
- After the event sequence is acknowledged, a separate Proceed starts the next bot action.
- Cards, units, resources, and battlefields changed by the current step receive a persistent gold highlight. Removed units are called out in the review panel.
- During review, action execution is locked. The final rules state and the current review index are saved together in this browser's localStorage, so reload does not advance the match.
- Hover or keyboard-focus any public card, legend, battlefield, equipment, rune, or deck-list entry to see enlarged art and readable rules. Unit previews include current Might and damage; Escape dismisses the preview. Card info buttons retain the full detail view for touch screens. Opponent hands and facedown cards remain hidden.
- Both players' **Legend zone** and **Champion zone** are visible from setup as compact card-sized slots to the right of each hand, separate from the hand and base. Their labels show ready/exhausted or available/empty state; hover to read the full rules, or select your Legend to see its currently legal abilities in the action panel. The chosen champion is played from its zone by paying its cost, after which that zone is marked empty. Deck selection also shows both starting cards for each player. Rune cards appear in their own row below each player's hand.
- Active runes show locally cached card artwork for all six domains, with ready/exhausted labels. Click or tap a rune to open its full card details. Rune cards wrap on narrow screens.
- Exhausted units, Legends, runes, and equipment carry a small square black-and-red EXHAUSTED token at the card's lower right, while their artwork becomes grayscale. The marker disappears when readied and follows the visible Proceed frame and enlarged preview. The transparent artwork, reference, and exact imagegen prompt are documented in [docs/EXHAUSTED-SQUARE-TOKEN.md](docs/EXHAUSTED-SQUARE-TOKEN.md).
- The combat panel shows each side's actual damage contribution, existing wounds, protection, assigned damage and remaining damage. Choose legal damage targets directly beside their cards. Animated simultaneous hits precede casualties and retreat; the result shows who controls the battlefield. Reaction windows can change the numbers and target choices can change the surviving units.
- The event log records game events.

## Architecture

- `src/i18n/`: shared English, Serbian and Italian catalogs, display-time message translation, language selector and local preference storage. Engine IDs and saved snapshots are language independent.

- `src/game/engine.ts`: deterministic pure state transitions, legal-action generation, rules, and review snapshots.
- `src/game/scripts.ts` and the precon/expansion modules: executable card effects and event hooks.
- `src/game/card-registry.ts`, `src/data/card-identity.ts`, and `src/game/card-script-compiler.ts`: every-printing registry, safe rules aliases, and full-text compilation of supported rule families.
- `scripts/report-card-coverage.mjs`: reproducible per-card script/status inventory and stale-report check.
- `src/game/deck-import.ts`: text import/export, validation, coverage reports, and local imported-deck storage.
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
