# Interface and appearance upgrade

The interface uses dark obsidian/navy surfaces, champagne primary actions and teal selection states. DM Sans carries the main interface typography; Cinzel and Barlow Condensed provide restrained branding and compact display accents. Fine borders, quieter shadows and visible keyboard focus replace the earlier paper-and-ink presentation.

## Lobby and duel setup

The lobby separates choosing a deck from configuring the opponent. Champion and deck search works within the selected collection, including product sets, practice lists and imported decks. The gallery initially shows six decks on desktop and four in compact layouts; expanding it reveals the remaining matches. A selected deck remains in the collapsed gallery when it belongs to the current results, and the full deck selector remains available.

The opponent panel shows both champions, difficulty, format and the scoring target above the launch action. Mobile also has a persistent launch bar with the current matchup. Battlefield summaries show the selected card and expand into the supplied pool and other supported choices. Starting cards, deck utilities and additional duel rules sit in expandable sections. The guide, import/export, saved-duel resume and remembered setup flows remain available.

## Library, builder and supporting screens

- The library gives search priority, groups refinement controls under **Filters**, displays active-filter and result counts, and keeps card names, types, printing identifiers and support status readable below each image. Filters can be reset, and the result toolbar links back to search.
- The deck builder groups source selection and deck settings separately from card discovery. Section counts, quantity feedback, validation and the save/export footer make the current draft easier to understand. Existing Undo/Redo, draft recovery and local list management remain available.
- Deck import presents paste/file/example entry points, the selected filename, validation and save actions in a more structured dialog. Import guidance and advanced options can be expanded when needed.
- Training, saved duels, match history and match results share the dark visual language. Saved-duel and history screens provide clearer empty states and import/export feedback.
- Shared dialogs manage keyboard focus in the topmost overlay, support Escape and return focus to the invoking control. Backdrop dismissal checks where the pointer press began, so dragging from dialog content onto the backdrop does not dismiss it accidentally.

## Appearance and local preferences

Open **Appearance** from the header, match toolbar or mobile **Duel menu**. Choices apply immediately; opening Appearance suspends automatic match progress while the dialog is visible.

| Control            | Behavior                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Card backs**     | Choose Riftglass, Moonveil, Sunforge or the existing champion signature sleeve. The choice applies to face-down cards on this device. Riftglass is the default. |
| **Clearer table**  | Dims battlefield art and strengthens zone borders without changing table geometry.                                                                              |
| **Reduce effects** | Reduces movement and flashing while retaining game feedback. The device's reduced-motion preference is also respected.                                          |
| **Game sound**     | Enables the existing short action cue. Off by default; the preference is remembered and also controls the desktop mute button.                                  |

Card backs use `riftbound-card-back-v1` in localStorage. Display preferences use `riftbound-interface-v1`. These cosmetic preferences are independent of match saves and hidden card identities, and synchronize between tabs. If storage is unavailable, changes remain usable in the current page session. The **Keyboard controls** disclosure documents Tab, Enter, Escape and the **P** pause/resume shortcut; the shortcut does not activate while typing or while a modal dialog is open.

## Generated card-back artwork

The three original card backs were generated with OpenAI image generation and encoded as local 744 × 1039 WebP assets:

- **Riftglass**: a teal crystalline rift.
- **Moonveil**: a violet opal with opposed crescents.
- **Sunforge**: an amber crystal with an eight-point sun.

They share an obsidian field and champagne frame, without card identity, lettering, branding or character imagery. See the [asset provenance note](../public/art/cardbacks/README.md) and [card-back definitions](../src/data/cardbacks.ts). These are cosmetic interface assets, separate from the official card faces and the earlier generated background artwork documented in [ART-DIRECTION.md](ART-DIRECTION.md).

## Match table and inspection

The existing table grid, zone positions, hand layout and responsive breakpoints remain in place. The new skin changes surface colors, borders, typography and feedback styling. The optional contrast preference also changes presentation only. Historical geometry and interaction evidence remains in [NATIVE-TABLE.md](NATIVE-TABLE.md).

Public-card hover and keyboard-focus previews remain image-only, without an added rules or statistics panel. Touch inspection retains the full reading view. The lobby's selection gallery uses direct selection; detailed inspection remains available through deck and starting-card controls. Face-down cards do not expose their identities through the selected sleeve.

## Validation

The upgrade passed the required regression selection plus new preference/card-back coverage: 83 files and 1,033 tests. Fourteen selected save/unfinished-resolution regressions also passed. Catalog consistency, report guards, TypeScript and the production build passed.

Browser checks covered these flows:

1. **Lobby and setup:** search, collections, selected-deck visibility, battlefield/difficulty/format persistence, resume and launch; desktop, mobile and all three interface languages.
2. **Library and builder:** filters, empty/reset states, details, quantity editing, Undo/Redo, download and a saved-deck export/import round trip; desktop and touch.
3. **Match table:** 15 native-table scenarios across 1440×900, 1920×1080 and 1100×650, including crowded bases, combat, reactions and Hidden modes; mobile inspection at 320×568, 390×844 and 844×390.
4. **Appearance:** ten checks on the production build, covering five viewport sizes, unchanged table geometry, card-back and sound persistence, keyboard focus restoration, pause/resume input guards, bot/review suspension and both device/app reduced motion.
5. **Supporting screens:** saved-duel import/export/recovery, history filtering and replay navigation, import validation and all six training lessons with Undo/Retry.

These checks verify the named interactions and viewports, not complete accessibility conformance. Permanent interface artwork is included in the offline manifest; official card fronts still use the existing **Download selected decks** flow for guaranteed offline availability.

The final production build `8f92b38ba8ad` passed a fresh offline installation: all 86 manifest assets returned HTTP 200 and matched the built files, all four card-back options decoded offline, and appearance preferences survived reloads. Downloading the selected decks cached 38 card images; the following offline reload had no failed requests.

### Captured production build

- [Lobby and setup](screenshots/ui-upgrade-lobby.png)
- [Appearance and generated card backs](screenshots/ui-upgrade-cardbacks.png)
- [Preserved table layout with the new skin](screenshots/ui-upgrade-table.png)
- [Large image-only hover](screenshots/ui-upgrade-hover.png)
