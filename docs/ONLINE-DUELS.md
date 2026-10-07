# Private online duels

The **Private duel** button opens a human-versus-human table. Each player selects a supported deck and one of that deck's battlegrounds. The host chooses a random first player, the host, or the invited opponent. Share the generated invitation to admit the second player.

The invitation is held in the URL fragment (`#duel=…`), which is not sent as a request URL or referrer. Room IDs use 128 random bits; seat and invitation credentials use 256 bits. The server stores SHA-256 hashes of those credentials. The browser remembers only its own seat access under `riftbound-online-seat-v1`, separately from the local duel save.

Before joining, the browser also records a temporary `riftbound-online-join-intent-v1` containing the same invitation, its own guest nonce and selected deck/battleground. This intent expires after 24 hours and survives a reload or return to the lobby. **Retry joining** sends the same guest nonce if the first request never arrived; if the server committed the join but its response was lost, an authenticated poll resumes the same seat. The intent is cleared after confirmed seat access has been persisted or a definitive join rejection. If browser storage is blocked, the UI explains that this recovery cannot be guaranteed and asks the player to keep the tab open. These keys never replace the ordinary local duel save.

Players choose from the engine's actual legal moves, including mulligan, reactions, movement selection, damage assignment, choices and rune payment. Choosing a row does not commit it: **Confirm move** sends the decision. A changed position clears the selection. Paginated options and card filters keep large decisions readable on mobile.

## Production setup

Production uses **private Vercel Blob** for authoritative room state. There is no in-memory production fallback. As of 7 October 2026, the connected Vercel account rejected private-store creation with HTTP 403, so the application and API are prepared, but online rooms require storage activation. The UI reports that online rooms are unavailable while configuration is absent.

1. In Vercel, create a Blob store with **Private** access and connect it to the app project.
2. Provide the connected store's `BLOB_READ_WRITE_TOKEN` as a **server-only production environment variable**. Do not use a `VITE_` or `NEXT_PUBLIC_` prefix.
3. Alternatively, configure `BLOB_STORE_ID` with the connected project's supported Vercel OIDC authentication. The Blob SDK resolves OIDC automatically. A store ID alone outside an authenticated Vercel environment does not grant access.
4. Configure the project that serves `riftbound-duel-lab.vercel.app`. If the second deployment at `riftbound-duel-lab-pgml.vercel.app` should host independent rooms too, connect a private store and environment configuration there as well.
5. Redeploy after environment changes. Create a room, open the fragment invitation in a separate browser profile, play both mulligans, refresh both clients, and verify resumed seat access.

The SPA rewrite excludes `/api`, so `POST /api/duel` reaches the Vercel function. Every response is private and uncacheable; credentials remain in the POST body. Cross-origin browser requests are rejected.

The production build bundles `src/server/duel-api.ts` and its rules/catalog into `.duel-server/handler.mjs`. The checked `api/duel.js` entry imports that explicit ESM filename; Vercel includes the generated file in its Node function. This avoids relying on Node to resolve the application's extensionless TypeScript imports. The generated backend is ignored by Git and rebuilt with each `npm run build`.

`BlobRoomStorage` reads from origin with `useCache: false`. Existing room writes use the current ETag through `put(..., { ifMatch })`; a conflicting write returns a stale-position response instead of replacing another move. Room creation disables overwrite. Each stored room is limited to 2 MB and incoming requests to 120 KB. Polling reads the room every five seconds while visible and never writes heartbeats. Writes occur only for create, successful join, accepted move, and departure.

## Public and private information

The server retains the complete game and validates the submitted action against live canonical engine actions. Clients receive `getObservation(game, seat)` and only that seat's paginated legal options when it holds priority. The response excludes the complete game, RNG, deck/rune order, log, bot diagnostics, opponent hand and unobserved Hidden identities. Legitimate card inspection effects reveal only their authorized information.

An effect that publicly reveals a hand produces a separately labeled historical snapshot with its source and turn. It describes cards revealed at that moment, rather than claiming to show the current opponent hand. Known opponent Hidden faces can be inspected only when the observation authorizes them; their buttons never activate the opponent's cards.

Move receipts make a retried request safe after an interrupted response. A stale room revision or ETag cannot commit a second competing move. Leaving a room closes it. Every operation enforces a fixed 24-hour expiry from creation; polling does not extend it. Expiry is an API access rule. Blob documents remain private after expiry, so administrators can remove expired `duel-rooms/v1/` objects when managing storage retention.

## Local validation

Start the explicit loopback-only development adapter with:

```sh
DUEL_DEV_ROOMS=1 npm run dev -- --port 5194
```

That adapter uses `MemoryRoomStorage` solely for local QA. It does not survive development server restart and is never selected by the production function. Without the flag, development follows the same guarded private Blob handler as production.

Focused checks:

```sh
npm test -- tests/online-rooms.test.ts tests/online-client.test.ts tests/online-api.test.ts tests/online-mulligan.test.ts tests/blob-room-storage.test.ts --maxWorkers=1
```

The tests cover credential hashing, both starting seats, all official precons, legal actions and payment validation, Hidden/hand/RNG privacy, invalid requests, expiry, concurrent joins/moves, stale decisions, safe retries, separate browser credential storage, invitation fragments, body limits and friendly storage failures.
