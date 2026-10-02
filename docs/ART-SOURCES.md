# Champion artwork

The interface uses official default champion splash artwork from Riot's Wild Rift champion pages. All 13 images are bundled locally under `public/art/champions/`, at their original 1280 × 720 dimensions. The complete bundle is approximately 1.6 MB, so no recompression was necessary. Artwork belongs to Riot Games and its credited artists.

The images were obtained on 2026-10-02 by reading each official champion page's first “Available Skins” entry, then downloading the original image from Riot's `cmsassets.rgpub.io` host with standard TLS verification. Every local file was decoded successfully and its dimensions checked. No runtime external image requests are needed.

| Champion | Local file | Official source page | Original Riot image |
| --- | --- | --- | --- |
| Annie | `/art/champions/annie.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/annie/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/bd1cfff9afdca2b8a5077ffd1148d3880cac1d56-1280x720.jpg?accountingTag=WR) |
| Lux | `/art/champions/lux.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/lux/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/e900839292adf3b36bcf5d57164198b8026b08c4-1280x720.jpg?accountingTag=WR) |
| Garen | `/art/champions/garen.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/garen/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/103a1f0f978cfec945126b28e312ef73b4c7a416-1280x720.jpg?accountingTag=WR) |
| Master Yi | `/art/champions/master-yi.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/master-yi/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/5ecce92aed12bc5e064df03df07ba14fb40f1d1f-1280x720.jpg?accountingTag=WR) |
| Jinx | `/art/champions/jinx.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/jinx/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/58a1d5def09d35ea722ca402db31700f9c2b3580-1280x720.jpg?accountingTag=WR) |
| Viktor | `/art/champions/viktor.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/viktor/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/7c7371e6aadda3392320e9770d971d1cd6f9a2e9-1280x720.jpg?accountingTag=WR) |
| Lee Sin | `/art/champions/lee-sin.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/lee-sin/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/63bbd417587cfa1dc9dc2e8d04c31f68c4ba1d57-1280x720.jpg?accountingTag=WR) |
| Fiora | `/art/champions/fiora.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/fiora/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/cb2cb92c68dd465fb3547cac187c548f013b3df4-1280x720.jpg?accountingTag=WR) |
| Rumble | `/art/champions/rumble.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/rumble/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/92989c47f54b2c47e5e78f2c66a2916694c847ff-1280x720.jpg?accountingTag=WR) |
| Vi | `/art/champions/vi.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/vi/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/46420c9c094ce3ce968c9463ba193c186fd67b44-1280x720.jpg?accountingTag=WR) |
| Vex | `/art/champions/vex.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/vex/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/11ac3557535a7765b423302663ecca5e5f22ae00-1280x720.jpg?accountingTag=WR) |
| Shen | `/art/champions/shen.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/shen/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/173b6da6ac6e02215f5be30a56c7af4313e2a0b3-1280x720.jpg?accountingTag=WR) |
| Zed | `/art/champions/zed.jpg` | [Champion page](https://wildrift.leagueoflegends.com/en-us/champions/zed/) | [Original image](https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data/8f3ed8a6035c324664d0e917126ceb04ad0c8cbf-1280x720.jpg?accountingTag=WR) |

`src/data/champion-art.ts` maps all champions in the current official and practice decks. It tolerates capitalization, surrounding whitespace, and hyphens; unknown imported champions return `undefined` for the interface to handle.

## Hero composition

Jinx's default splash is recommended for the wide home hero. Jinx occupies the right half while the darker left half gives the title and call to action room. Use `/art/champions/jinx.jpg` and a restrained dark gradient under the copy. The original artwork remains intact.

## Data Dragon reference

Riot also documents League splash images at `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{ChampionId}_0.jpg`, where `_0` identifies the default skin. See the official [Data Dragon champion splash documentation](https://developer.riotgames.com/docs/lol#data-dragon_champion-splash-assets).

Data Dragon requests on this machine returned a FortiGate Application Control Violation (HTTP 403) on 2026-10-02. No Data Dragon proxy or system network-setting change was used. The delivered files come from the separate official Wild Rift CMS sources listed above.
