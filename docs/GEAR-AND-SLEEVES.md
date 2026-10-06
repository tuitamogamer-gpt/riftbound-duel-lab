# Gear slots and signature sleeves

Gear and Equipment now render as real, selectable card faces in a separate zone for each player. Units and gear share the full base height in separate columns with a vertical divider at every viewport size. Adding gear never changes the table tracks or unit height. The faces use the existing card art, ready/exhausted state, hover preview, inspection dialog, source selection and legal target selection. Equipment stays visible in its controller's zone while attached; its link selects the equipped unit, including units at battlefields. Crowded zones scroll horizontally without expanding the page, with previous/next buttons for mouse users. Deck and Trash sit beside the hand and share its card height.

The thirteen champion sleeves cover all seventeen built-in decks: Annie, Lux, Garen, Master Yi, Jinx, Viktor, Lee Sin, Fiora, Rumble, Vi, Vex, Shen and Zed. Each uses a distinct emblem, palette and title with the existing locally cached champion art. Unknown imported champions receive the universal Riftbound sleeve. The sleeve is resolved from the public champion identity, so no hidden card face or deck order is exposed.

Applied surfaces: the deck pile, both players' deck dialogs, the opponent's hand, Hidden cards, and the lobby's deck detail dialog. The public champion determines the sleeve for saved matches and imported decks as well.

Assets live in `public/art/sleeves/`. Their editable definitions are in `src/data/signature-sleeves.json`; regenerate with `node scripts/build-signature-sleeves.mjs`. The SVGs contain the champion images, so the sleeves need no external image requests. The original artwork sources remain documented in [ART-SOURCES.md](ART-SOURCES.md); sleeve frames and emblems are original project graphics.

Preview the full collection at `/tests/signature-sleeves-preview.html` on the development server. The synthetic board fixture is `/tests/gear-sleeves-preview.html`, with optional `?crowded=12`, `?units=8&hand=12`, and `?no-gear`. Use a separate local port for fixtures to avoid replacing an existing match.

Browser verification is in `scripts/gear-sleeves-check.mjs`. It compares unit height with and without gear across seven viewport sizes, checks pile alignment and crowded hand/base containment, and exercises real gear activation and equipment target selection, inspection, the equipped-unit link, crowded slots, private deck dialogs, and sleeve coverage for all built-in decks. Set `PLAYWRIGHT_MODULE` if Playwright is supplied by a shared runtime; `QA_ORIGIN` defaults to `http://127.0.0.1:5199`.
