# Radiance reference import — 22 October 2026

The refresh adds **219 Radiance printings** for browsing and **two official Showdown decklists**, Seraphine and Evelynn. All new printings remain explicitly reference-only, including reprints and runes. The existing **1,459 executable entries and 13 playable precons** are unchanged.

## Provider refresh

Riftcodex `/cards` and `/sets` were downloaded completely at **2026-10-22T17:19:09.121Z–17:19:26.110Z**, using the existing paginated downloader and stable-ID normalizer. The result still contains **1,451 printings in eight sets: zero added, zero changed, zero removed**. Its latest reported update is **2026-07-21T20:05:23.285938+00:00**. The normalized SHA-256 is unchanged:

`0861c196b3100198a9fffa7b9465afc76a2e4b07db84e63e8efa6145fea25f6c`

The existing `cards.json` and `catalog-meta.json` were preserved rather than changing the playable catalog version for an unchanged response. The supplementary files are independent of that hash, so existing match and replay versions remain compatible.

## Radiance source and scope

- Structured records: [Hextech Analytics, `set:RAD`](https://hextechanalytics.com/cards?q=set%3ARAD), all **10 pages / 219 advertised results**, retrieved live on 22 October 2026. Every entry includes its individual source URL and a provider ID prefixed `hextech:`. This is a community catalog, not a Riftcodex update or official Riot data API.
- Official product and complete decklists: [The Radiance Overview](https://playriftbound.com/en-us/news/announcements/the-radiance-overview/), updated **16 October 2026**. Riot gives **23 October 2026** as the release date and **16–22 October** as the Pre-Rift period. The import is available on the last Pre-Rift day; it makes no tournament-legality claim.
- Official text corrections: [Radiance Errata Updates](https://playriftbound.com/en-us/news/announcements/radiance-errata-updates/), **9 October 2026**. The retrieved records already contain all four corrected passages: Forbidden Technique (“Then banish this”), Elnuk Herd (“a friendly unit”, without “another”), Last Caress (the face-down clause), and Neeko, Blending In (“up to 3”). No guessed effect text was added.
- Supplemental cross-checks: [League of Legends Wiki Radiance gallery](https://wiki.leagueoflegends.com/en-us/Riftbound:Radiance) and public page revisions, plus [Sanctum Conservator](https://riftbound.gg/cards/rad-030-sanctum-conservator/). The wiki gallery omits RAD-030 and RAD-108; the imported Hextech source includes both.

The supplement contains all **167 numbered base records**, **40 additional alternate/overnumbered/showcase printings**, and **12 rune printings**. This is complete relative to the source's Radiance query, not a claim to contain every Riot promotional printing or token. The five `RAD-SP` showcase codes are classified as variants even where the source's alternate-art boolean is false. Other type, cost, tag, text and artwork fields retain the source values. The source does not publish a record-update timestamp, so `sourceUpdatedAt` is `null`.

Artwork URLs point to the Riot CDN supplied by the source. They remain remote catalog artwork; this import does not add them to the playable-deck offline cache. Reference rune records omit the `Basic` supertype. Name-only rune imports continue to select existing reviewed basic printings; an explicit Radiance ID is preserved and remains blocked.

The separate [reference metadata](../src/data/reference-catalog-meta.json) records the retrieval date, raw-source digest, normalized-data digest, scope and official links. The [coverage inventory](card-coverage.json) records all 219 unsupported entries and their reason.

## Official precons

Both lists were transcribed from the official overview into [reference-precon-lists.json](../src/data/reference-precon-lists.json), preserving the full **40-card main deck, 12 runes and three battlefields**. The selected champion is stored separately, leaving 39 entries by quantity in `main`. The official article specifies names and quantities, not every printing ID; numbered Radiance base cards are preferred and existing exact-name reprints are reused. Reviewed existing basic runes supply the listed domains.

| List      | Selected champion    | Other champion copies                        | Battlefields                                          | Pending rules / distinct list cards |
| --------- | -------------------- | -------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| Seraphine | Seraphine, Not Alone | 2 Seraphine, Inspiring                       | Black Rose Sanctum; Ruined Monastery; Valley of Idols | 25 / 30                             |
| Evelynn   | Evelynn, Consuming   | 1 Evelynn, In Control; 2 Evelynn, Entrancing | Bandle Scouts' Academy; Rakelstake; Bandle Tree       | 22 / 29                             |

The Seraphine box also lists three Mech/Recruit and three Bird/Buff token inserts; Evelynn lists five Gold/Bomb inserts. These are not main-deck cards and are not silently added as executable token definitions. No local Bomb implementation is claimed by this import.

The two reference decks are inspectable in the catalog. They are exported separately from `officialPreconDecks`, `decks` and `decksById`, so matchmaking, practice defaults, online validation and published 13×13 bot matrices continue to use the existing playable lists. The registry blocks reference entries before compilation, explicit scripts or reviewed aliases can enable them. Deck coverage and direct game initialization also reject reference-only runes.

## Reproducing and checking the import

The public Hextech library returns its card records in JSON inside Next.js flight payloads. Read each advertised page's `cards` array as JSON, without executing page scripts. Confirm the same `set:RAD` filter, result count, page count, unique IDs and complete base-number range before creating a reviewed source export:

```json
{
  "sourceUrl": "https://hextechanalytics.com/cards?q=set%3ARAD",
  "pageCount": 10,
  "count": 219,
  "fetchedAt": "<actual ISO retrieval timestamp>",
  "cards": ["<the complete original card objects, not strings>"]
}
```

Run `node scripts/import-reference-cards.mjs /path/to/reviewed-source-export.json`, then `npm run cards:report` and `npm run cards:check`. The importer deliberately rejects changed totals, missing base cards, invalid fields, duplicate identities, removed previous IDs and collisions with the playable provider. A changed source requires review before widening its accepted scope. The import command preserves the original provider snapshot and does not implement game rules.

Focused regressions cover all base numbers, the four errata, provenance/hash consistency, every reference registration, compiler/alias bypasses, reference-rune imports, unchanged supported IDs, save round trips, official list structure and reference UI in all three languages. Validation results are recorded by the release task; passing catalog tests does not establish Radiance gameplay support.
