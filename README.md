# Riftbound Duel Lab

A local-first, unofficial Riftbound 1v1 practice simulator with a deterministic rules engine, a heuristic opponent, and a mandatory **Proceed** gate after every action and narrated effect. Interface language: Bosnian; card rules retain their original English text.

## Run locally

```sh
npm install
npm run dev
```

Open the localhost URL shown in the terminal, normally **http://127.0.0.1:5173**. Or double-click `Pokreni Riftbound.command`. No external AI service, login, or API key is needed to play.

```sh
npm test          # rules, exact effects, deterministic simulations, save and step review
npm run build    # TypeScript + production build
npm run preview  # serve the production build on loopback
npm run sync:cards # refresh the public Riftcodex catalog, not engine support
```

## What is playable

Four curated 40-card practice decks: **Annie, Lux, Garen, Master Yi**. These are custom legal-domain practice lists, not the official retail preconstructed deck lists. Each contains 39 shuffled cards, one chosen champion, a legend, and 12 runes. The match uses two scripted battlefields, Altar to Unity and Grove of the God-Willow.

Implemented flow includes mulligans, rune channeling, energy/power payment, card and triggered abilities, group movement, empty-field and combat showdowns, Action/Reaction timing, LIFO effect chains, damage assignment, simultaneous damage, death triggers, readying, scoring, final-point restrictions, and deck burnout. The bot selects legal actions using its own hand and public game information; it does not inspect the opponent's hand or deck order.

**This is not a full implementation of every published Riftbound card/set.** Only cards with explicit engine scripts can appear in the available practice decks. The separate catalog currently contains 1,451 printings from eight sets and labels scripted support. Unscripted cards are browsable but not playable. There is no multiplayer, online account system, arbitrary deck import, or ranked play. New sets and errata need deliberate engine work and tests, not just a catalog sync. Reference date: official core rules 2026-07-16 and later published FAQ; see `docs/RULES-RESEARCH.md`.

## Deliberate pace and visible changes

- The bot **never acts on a timer**.
- Choose a player action, then inspect one immutable event snapshot at a time.
- Press **Proceed** (or Space when a form control is not focused) to advance one snapshot.
- After the event sequence is acknowledged, a separate Proceed starts the next bot action.
- Cards, units, resources, and battlefields changed by the current step receive a persistent gold highlight. Removed units are called out in the review panel.
- During review, action execution is locked. The final rules state and the current review index are saved together in this browser's localStorage, so reload does not advance the match.
- Card info buttons open full-size card art and English rules. The event log records game events.

## Architecture

- `src/game/engine.ts`: deterministic pure state transitions, legal-action generation, rules, and review snapshots.
- `src/game/scripts.ts`: explicit supported card effects.
- `src/game/bot.ts`: public-information tactical bot.
- `src/data/`: normalized real card catalog, provider provenance, bans, and validated practice decks.
- `src/components/StepFlow.tsx`: manual review and event highlights.
- `src/persistence.ts`: validated local session recovery.
- `scripts/sync-cards.mjs`: paginated, validated Riftcodex catalog refresh.
- `docs/`: official rules research, API sources, and actual validation results.

The game and AI execute in the browser. All 64 card images used by the four practice decks (including the Recruit token), generated playmats, and fonts are bundled locally. These matches work without remote asset requests after the app is served. The rest of the full catalog uses remote images and falls back to text cards if those images fail. No saved match is sent to an AI service. Refresh the playable art with `npm run cache:art`.

## Sources and publication status

- [Riftcodex API](https://riftcodex.com/docs/) — unofficial public JSON database, no read key.
- [Official rules hub](https://playriftbound.com/en-us/rules-hub/).
- [Riot's Riftbound Digital Tools Policy](https://developer.riotgames.com/docs/riftbound).

Riot's published policy does not approve automated standalone Riftbound simulators. This project has no Riot license or approval; a community API and a disclaimer do not grant distribution rights. The user requested local development while arranging a different GitHub account. **No GitHub push or Vercel deployment is claimed.** A Vite-compatible `vercel.json` is included for future configuration.

Riftbound Duel Lab isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Generated art

Three original imagegen backgrounds are saved in `assets/originals/` and optimized in `public/art/`. Full prompts, style decisions, and asset paths are in [docs/ART-DIRECTION.md](docs/ART-DIRECTION.md). The interface uses a League of Legends inspired navy, antique gold, and arcane cyan style with locally bundled Cinzel headings.
