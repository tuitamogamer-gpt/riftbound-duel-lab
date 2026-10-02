# Card catalogue and provenance

Verified on 2 October 2026. This repository contains a point-in-time catalogue, not an official Riot service.

## Implemented provider

- **Riftcodex:** <https://riftcodex.com/>
- **Live API schema:** <https://api.riftcodex.com/openapi.json>
- **Interactive API documentation:** <https://api.riftcodex.com/docs>
- **Cards:** `GET https://api.riftcodex.com/cards?size=100&page=1`
- **Sets:** `GET https://api.riftcodex.com/sets?size=100`

The actual v0.2.0 API routes omit `/api`; the site's homepage example containing `/api/cards` was outdated when checked. Public GET requests worked without an API key. The snapshot contains **1,451 printings** across **8 provider sets**, with card names, full English rules text, costs, Might, domains, types, tags, artist credit, and remote artwork URLs. The exact retrieval timestamp and set list are saved in `src/data/catalog-meta.json`.

Riftcodex is an **unofficial community provider**. Its response includes Riot `riftbound_id` values and image URLs, predominantly on Riot's public `cmsassets.rgpub.io` CDN. Fetching a community API does not constitute a Riot license, endorsement, application approval, or verification of all card rulings. The provider catalog may lag previews, errata, and later releases.

## Reproducible refresh

Run `node scripts/sync-cards.mjs` (or `npm run sync:cards` if present). The script uses the documented paginated endpoint, spaces requests, retries temporary failures, validates the advertised total and unique provider IDs, and writes JSON only after all pages are complete. No secrets or API keys are requested or stored. It does not download or redistribute image files; cards retain their supplied remote image URL.

`src/data/cards.json` is normalized data. `src/data/cards.ts` exports the `Card` type, `cards`, `cardsById`, `getCard`, `catalogMeta`, and `readableText`. Rules text stays in the source English with Riftbound symbol shortcodes. `readableText` renders symbol names without translating or changing the rules.

The `id` normally equals the Riot ID. Some promotional printings share a Riot ID, so those receive `--<providerId>` suffixes. `riftboundId` always preserves the original Riot identifier. `variant` identifies alternate-art, signature, overnumbered, and named metal/promotional variants, rather than game-engine support.

`bannedInDuel` applies the official [Rules Hub](https://playriftbound.com/en-us/rules-hub/) ban list effective 18 September 2026, checked 2 October 2026. Names and source are in `src/data/banned-cards.json`. Matching ignores punctuation and variant suffixes so alternative printings share ban status. This is a dated manual rules snapshot; rerunning card sync does not automatically discover later bans. Master Yi's separate 2v2 ban is not applied to 1v1.

## Playable decks versus card browser

The complete imported catalogue is available for reference and search. Importing a card does **not** make its abilities executable. Engine support is explicit and must be checked independently.

`src/data/decks.ts` defines four **custom curated practice lists**, using real Origins and Proving Grounds cards. They are not representations of the retail starter deck contents:

| List | Legend | Chosen champion | Domains |
| --- | --- | --- | --- |
| Annie | Annie — Dark Child (Starter), OGS-017 | Annie — Fiery, OGS-001 | Fury / Chaos |
| Lux | Lux — Lady of Luminosity (Starter), OGS-021 | Lux — Illuminated, OGS-006 | Mind / Order |
| Garen | Garen — Might of Demacia (Starter), OGS-023 | Garen — Rugged, OGS-007 | Body / Order |
| Master Yi | Master Yi — Wuju Bladesman (Starter), OGS-019 | Master Yi — Honed, OGS-009 | Calm / Body |

Each list includes 39 cards in its draw pile plus one chosen champion (40 total), 12 basic runes, and one selected battlefield for a single 1v1 practice game. Competitive match registration instead includes three distinct battlefields; these practice lists do not claim to be registered tournament decks. `validateDeck` checks the main-deck size, copy limits, rune count, domains, and champion type. Script coverage is validated by the game engine separately.

The engine's selected battlefields are Altar to Unity (OGN-275, holding creates a Recruit in base) and Grove of the God-Willow (OGN-280, holding draws one card). Their actual printed abilities are retained.

Riot's own deckbuilding primer provides the original Lee Sin, Jinx, and Viktor starter deck list images: <https://playriftbound.com/en-us/news/rules-and-releases/deckbuilding-primer/>. Those historical retail lists can contain cards subsequently banned in organized play. They are not substituted for the curated supported lists.

## Other sources checked

- **RiftHunt bulk API:** <https://rifthunt.com/api/> documents `https://api.rifthunt.com/bulk/cards`. A live request succeeded and contained 1,432 printings from a 11 September 2026 snapshot, itself sourced from Riftcodex. Its bulk response uses a different schema from single-card endpoints; it was not used for the shipped snapshot.
- **RiftScribe:** <https://riftscribe.gg/api-docs> documents public card endpoints. Its list endpoint worked, but full rules text was only present on the single-card endpoint. It was not used to avoid a request per card.
- **Official Riot developer documentation:** <https://developer.riotgames.com/docs/riftbound> describes the official API and application requirements. No official app-specific API credentials are configured in this repository.

## Riot IP and distribution

Riot's [Digital Tools Policy](https://developer.riotgames.com/docs/riftbound) explicitly excludes automated rules enforcement and standalone Riftbound game clients from permitted gameplay tools. It also requires an application-specific approval/license for Riot assets. Therefore this research catalogue and local practice implementation must not be described as Riot-approved or as automatically authorized for public distribution. A disclaimer alone does not supply permission. The project owner must resolve permission with Riot before distributing an automated client with Riot IP.

Card names, text, artwork, Riftbound, and League of Legends are property of Riot Games, Inc. Provider attribution and original artist metadata are retained where supplied.
