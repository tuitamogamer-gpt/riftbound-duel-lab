import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import {
  decksById,
  validateDeck,
  type DeckEntry,
  type StarterDeck,
} from "../data/decks";
import { getCard } from "../data/cards";
import { isImplemented } from "../game/scripts";
import { validateImportedDeck } from "../game/deck-import";
import {
  applyAction,
  createGame,
  getGroupMoveAction,
  iterateLegalActions,
  locationName,
} from "../game/engine";
import { getObservation } from "../game/ai/observation";
import { syncHybridObjects } from "../game/card-wave19";
import type {
  GameAction,
  GameState,
  LocationId,
  PlayerId,
} from "../game/types";
import {
  ONLINE_ROOM_ID,
  ONLINE_TOKEN,
  type OnlineAction,
  type OnlineCredentials,
  type OnlineDeckSelection,
  type OnlineErrorCode,
  type OnlineRequest,
  type OnlineResponse,
  type OnlineRoomView,
} from "../game/online-protocol";

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const ROOM_PAGE_SIZE = 36;
export const MAX_ROOM_BYTES = 2 * 1024 * 1024;
export const MAX_ROOM_REQUEST_BYTES = 120_000;
interface RoomSeat {
  tokenHash: string;
  deck: StarterDeck;
  battlefieldId: string;
}
export interface StoredRoom {
  version: 1;
  id: string;
  createdAt: number;
  expiresAt: number;
  revision: number;
  firstPlayer: PlayerId;
  inviteHash: string;
  host: RoomSeat;
  guest: RoomSeat | null;
  game: GameState | null;
  departedSeat?: PlayerId;
  receipts: { id: string; seat: PlayerId }[];
}
export interface RoomRecord {
  room: StoredRoom;
  etag: string;
}
export interface RoomStorage {
  read: (id: string) => Promise<RoomRecord | null>;
  create: (room: StoredRoom) => Promise<boolean>;
  replace: (room: StoredRoom, etag: string) => Promise<boolean>;
}
export class RoomError extends Error {
  constructor(
    public code: OnlineErrorCode,
    public status: number,
  ) {
    super(code);
  }
}
function fail(code: OnlineErrorCode, status = 400): never {
  throw new RoomError(code, status);
}
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function matches(token: string, stored: string) {
  if (!ONLINE_TOKEN.test(token) || !ONLINE_TOKEN.test(stored)) return false;
  return timingSafeEqual(
    Buffer.from(tokenHash(token), "hex"),
    Buffer.from(stored, "hex"),
  );
}
function seatFor(room: StoredRoom, token: string): PlayerId {
  if (matches(token, room.host.tokenHash)) return 0;
  if (room.guest && matches(token, room.guest.tokenHash)) return 1;
  return fail("unauthorized", 403);
}
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const short = (value: unknown, max = 120): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
function entries(value: unknown, max: number): value is DeckEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every(
      (entry) =>
        object(entry) &&
        short(entry.cardId, 80) &&
        Number.isSafeInteger(entry.count) &&
        Number(entry.count) > 0 &&
        Number(entry.count) < 1000,
    )
  );
}

function selectedDeck(selection: OnlineDeckSelection): RoomSeat["deck"] {
  let deck: StarterDeck | undefined;
  if (short(selection.deckId) && decksById[selection.deckId])
    deck = structuredClone(decksById[selection.deckId]);
  else {
    const value: unknown = selection.deck;
    if (
      !object(value) ||
      !short(value.id) ||
      !short(value.legendId, 80) ||
      !short(value.championId, 80) ||
      !short(value.battlefieldId, 80) ||
      !entries(value.main, 1000) ||
      !entries(value.runes, 12) ||
      (value.sideboard !== undefined && !entries(value.sideboard, 10)) ||
      !Array.isArray(value.domains) ||
      value.domains.length > 6 ||
      !value.domains.every((domain) => short(domain, 16)) ||
      (value.battlefieldIds !== undefined &&
        (!Array.isArray(value.battlefieldIds) ||
          ![1, 3].includes(value.battlefieldIds.length) ||
          !value.battlefieldIds.every((id) => short(id, 80))))
    )
      return fail("invalid-deck");
    deck = {
      id: value.id,
      name: short(value.name) ? value.name : "Imported deck",
      champion: "",
      title: "",
      description: "",
      difficulty: "Srednje",
      archetype: "",
      color: "#bd9b64",
      domains: value.domains as StarterDeck["domains"],
      legendId: value.legendId,
      championId: value.championId,
      battlefieldId: value.battlefieldId,
      ...(value.battlefieldIds
        ? { battlefieldIds: value.battlefieldIds as string[] }
        : {}),
      main: value.main.map((entry) => ({
        cardId: entry.cardId,
        count: entry.count,
      })),
      runes: value.runes.map((entry) => ({
        cardId: entry.cardId,
        count: entry.count,
      })),
      ...(value.sideboard
        ? {
            sideboard: (value.sideboard as DeckEntry[]).map((entry) => ({
              cardId: entry.cardId,
              count: entry.count,
            })),
          }
        : {}),
      source: "Imported deck",
      format:
        value.format === "historical-precon" ? "historical-precon" : "standard",
    };
  }
  if (
    validateDeck(deck).length ||
    validateImportedDeck(deck).some((issue) => issue.severity === "error")
  )
    return fail("invalid-deck");
  const ids = [
    deck.legendId,
    deck.championId,
    ...(deck.battlefieldIds ?? [deck.battlefieldId]),
    ...deck.main.map((entry) => entry.cardId),
    ...deck.runes.map((entry) => entry.cardId),
  ];
  if (ids.some((id) => !isImplemented(id))) return fail("invalid-deck");
  return deck;
}
function selectionSeat(selection: OnlineDeckSelection, hash: string): RoomSeat {
  const deck = selectedDeck(selection);
  const battlefieldId = selection.battlefieldId ?? deck.battlefieldId;
  if (
    !(deck.battlefieldIds ?? [deck.battlefieldId]).includes(battlefieldId) ||
    getCard(battlefieldId).type !== "Battlefield"
  )
    fail("invalid-deck");
  return { tokenHash: hash, deck, battlefieldId };
}

function actionLabel(action: GameAction, seat: PlayerId) {
  if (action.id.startsWith("choose-board:") && !action.locationId)
    return seat === 0
      ? action.label
      : action.label.replace(/ · (your base|enemy base)$/, (_, name: string) =>
          name === "your base" ? " · enemy base" : " · your base",
        );
  const location = action.locationId;
  if (!location?.startsWith("base:")) return action.label;
  const original = locationName(location);
  const relative = location === `base:${seat}` ? "your base" : "enemy base";
  if (original === relative) return action.label;
  // Engine labels use seat 0's base names. Adapt their location annotations,
  // preserving canonical actions and card/rule text for the other seat.
  return action.label.replace(
    /( at | to | → | · |^Destination: )(your base|enemy base)(?=$| [✓(]| · | → )/g,
    (annotation, prefix: string, name: string) =>
      name === original ? `${prefix}${relative}` : annotation,
  );
}
function actionRow(
  action: GameAction,
  game: GameState,
  seat: PlayerId,
): OnlineAction {
  const replaced =
    action.category === "mulligan"
      ? (action.cardIndices ?? []).map(
          (index) => getCard(game.players[action.player].hand[index]).name,
        )
      : [];
  return {
    id: action.id,
    label: replaced.length
      ? `Replace ${replaced.join(" + ")}`
      : actionLabel(action, seat),
    player: action.player,
    category: action.category,
    ...(action.sourceId ? { sourceId: action.sourceId } : {}),
    ...(action.targetId ? { targetId: action.targetId } : {}),
    ...(action.cardId ? { cardId: action.cardId } : {}),
    ...(action.locationId ? { locationId: action.locationId } : {}),
    ...(action.detail ? { detail: action.detail } : {}),
    ...(action.amount !== undefined ? { amount: action.amount } : {}),
    ...(action.unitIds ? { unitIds: [...action.unitIds] } : {}),
    ...(action.cardIndices ? { cardIndices: [...action.cardIndices] } : {}),
  };
}
export function roomView(
  room: StoredRoom,
  seat: PlayerId,
  filter: { sourceId?: string; query?: string; offset?: number } = {},
): OnlineRoomView {
  const status =
    room.departedSeat !== undefined
      ? "departed"
      : !room.game
        ? "waiting"
        : room.game.winner !== null
          ? "ended"
          : "active";
  const offset = filter.offset ?? 0;
  const actions: OnlineAction[] = [];
  let matched = 0;
  if (room.game && status === "active" && room.game.priorityPlayer === seat) {
    const query = filter.query?.toLocaleLowerCase();
    for (const action of iterateLegalActions(room.game, seat)) {
      if (
        filter.sourceId &&
        action.sourceId !== filter.sourceId &&
        !action.sourceId?.startsWith(`${filter.sourceId}:`)
      )
        continue;
      const row = actionRow(action, room.game, seat);
      if (
        query &&
        !`${row.label} ${row.detail ?? ""}`.toLocaleLowerCase().includes(query)
      )
        continue;
      if (matched++ < offset) continue;
      actions.push(row);
      if (actions.length > ROOM_PAGE_SIZE) break;
    }
  }
  return {
    id: room.id,
    seat,
    revision: room.revision,
    expiresAt: room.expiresAt,
    status,
    ...(room.departedSeat !== undefined
      ? { departedSeat: room.departedSeat }
      : {}),
    observation: room.game ? getObservation(room.game, seat) : null,
    actions: actions.slice(0, ROOM_PAGE_SIZE),
    actionOffset: offset,
    hasMoreActions: actions.length > ROOM_PAGE_SIZE,
  };
}

function bounded(room: StoredRoom) {
  if (Buffer.byteLength(JSON.stringify(room)) > MAX_ROOM_BYTES)
    fail("room-too-large", 413);
}
export function validateOnlineRequest(value: unknown): OnlineRequest {
  if (
    !object(value) ||
    typeof value.op !== "string" ||
    !["create", "join", "poll", "act", "depart"].includes(value.op)
  )
    fail("invalid-request");
  if (value.op === "create") {
    if (
      value.firstPlayer !== undefined &&
      !["random", "host", "guest"].includes(value.firstPlayer as string)
    )
      fail("invalid-request");
  } else {
    if (
      typeof value.roomId !== "string" ||
      !ONLINE_ROOM_ID.test(value.roomId) ||
      typeof value.seatToken !== "string" ||
      !ONLINE_TOKEN.test(value.seatToken)
    )
      fail("invalid-request");
    if (
      value.op === "join" &&
      (typeof value.inviteToken !== "string" ||
        !ONLINE_TOKEN.test(value.inviteToken))
    )
      fail("invalid-request");
    if (
      ["act", "depart"].includes(value.op) &&
      (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0)
    )
      fail("invalid-request");
    if (
      value.op === "act" &&
      (!short(value.actionId, 12000) ||
        !short(value.requestId, 80) ||
        (value.paymentRuneOrder !== undefined &&
          (!Array.isArray(value.paymentRuneOrder) ||
            value.paymentRuneOrder.length > 100 ||
            !value.paymentRuneOrder.every((id) => short(id, 120)))))
    )
      fail("invalid-request");
    if (
      value.op === "poll" &&
      ((value.offset !== undefined &&
        (!Number.isSafeInteger(value.offset) ||
          Number(value.offset) < 0 ||
          Number(value.offset) > 100_000)) ||
        (value.sourceId !== undefined && !short(value.sourceId, 120)) ||
        (value.query !== undefined &&
          (typeof value.query !== "string" || value.query.length > 80)))
    )
      fail("invalid-request");
  }
  return value as unknown as OnlineRequest;
}

export class RoomService {
  constructor(
    private storage: RoomStorage,
    private now = () => Date.now(),
  ) {}
  private async read(id: string): Promise<RoomRecord> {
    const record = await this.storage.read(id);
    if (!record) return fail("not-found", 404);
    if (record.room.expiresAt <= this.now()) return fail("expired", 410);
    if (record.room.game) syncHybridObjects(record.room.game);
    return record;
  }
  async request(value: unknown): Promise<OnlineResponse> {
    const body = validateOnlineRequest(value);
    if (body.op === "create") {
      const roomId = randomBytes(16).toString("hex"),
        seatToken = randomBytes(32).toString("hex"),
        inviteToken = randomBytes(32).toString("hex");
      const now = this.now();
      const room: StoredRoom = {
        version: 1,
        id: roomId,
        createdAt: now,
        expiresAt: now + ROOM_TTL_MS,
        revision: 0,
        firstPlayer:
          body.firstPlayer === "host"
            ? 0
            : body.firstPlayer === "guest"
              ? 1
              : (randomInt(2) as PlayerId),
        inviteHash: tokenHash(inviteToken),
        host: selectionSeat(body, tokenHash(seatToken)),
        guest: null,
        game: null,
        receipts: [],
      };
      bounded(room);
      if (!(await this.storage.create(room))) return fail("stale", 409);
      return {
        room: roomView(room, 0),
        credentials: { roomId, seatToken, seat: 0, inviteToken },
      };
    }
    const { room, etag } = await this.read(body.roomId);
    if (body.op === "join") {
      if (!matches(body.inviteToken, room.inviteHash))
        return fail("unauthorized", 403);
      if (room.departedSeat !== undefined) return fail("room-closed", 409);
      if (matches(body.seatToken, room.host.tokenHash))
        return fail("invalid-request");
      if (room.guest) {
        if (!matches(body.seatToken, room.guest.tokenHash))
          return fail("room-full", 409);
        return {
          room: roomView(room, 1),
          credentials: { roomId: room.id, seatToken: body.seatToken, seat: 1 },
        };
      }
      const next = structuredClone(room);
      next.guest = selectionSeat(body, tokenHash(body.seatToken));
      next.game = createGame({
        playerDeck: next.host.deck,
        botDeck: next.guest.deck,
        playerBattlefieldId: next.host.battlefieldId,
        botBattlefieldId: next.guest.battlefieldId,
        seed: randomInt(1, 0x7fffffff),
        firstPlayer: next.firstPlayer,
        openDecklists: false,
      });
      next.game.players[0].name = "Player 1";
      next.game.players[1].name = "Player 2";
      delete next.game.botSettings;
      next.revision++;
      bounded(next);
      if (!(await this.storage.replace(next, etag))) return fail("stale", 409);
      return {
        room: roomView(next, 1),
        credentials: { roomId: next.id, seatToken: body.seatToken, seat: 1 },
      };
    }
    const seat = seatFor(room, body.seatToken);
    if (body.op === "poll") return { room: roomView(room, seat, body) };
    if (
      body.op === "act" &&
      room.receipts.some(
        (receipt) => receipt.id === body.requestId && receipt.seat === seat,
      )
    )
      return { room: roomView(room, seat) };
    if (room.revision !== body.revision) return fail("stale", 409);
    if (
      room.departedSeat !== undefined ||
      (room.game && room.game.winner !== null)
    )
      return fail("room-closed", 409);
    const next = structuredClone(room);
    if (body.op === "depart") next.departedSeat = seat;
    else {
      if (!next.game || next.game.priorityPlayer !== seat)
        return fail("not-your-turn", 409);
      try {
        // The server owns the complete state. Canonical legal actions are
        // checked here; a synthetic AI information shell must not block a
        // legitimate instruction to inspect an opponent's top card.
        let action: GameAction | undefined;
        if (body.actionId.startsWith("move-group:")) {
          const [, kind, index, members] = body.actionId.split(":");
          action =
            getGroupMoveAction(
              next.game,
              seat,
              (members ?? "").split(","),
              `${kind}:${index}` as LocationId,
            ) ?? undefined;
          if (action?.id !== body.actionId) action = undefined;
        } else
          for (const candidate of iterateLegalActions(next.game, seat)) {
            if (candidate.id === body.actionId) {
              action = candidate;
              break;
            }
          }
        if (!action) return fail("illegal-action", 422);
        const order = body.paymentRuneOrder;
        if (
          order &&
          (order.length !== next.game.players[seat].runes.length ||
            new Set(order).size !== order.length ||
            !order.every((id) =>
              next.game!.players[seat].runes.some((rune) => rune.id === id),
            ))
        )
          return fail("illegal-action", 422);
        next.game = applyAction(next.game, {
          ...action,
          ...(order ? { paymentRuneOrder: order } : {}),
        });
      } catch {
        return fail("illegal-action", 422);
      }
      next.receipts.push({ id: body.requestId, seat });
      next.receipts = next.receipts.slice(-24);
    }
    next.revision++;
    bounded(next);
    if (!(await this.storage.replace(next, etag))) return fail("stale", 409);
    return { room: roomView(next, seat) };
  }
}

/** Test/development adapter; production always uses private Blob storage. */
export class MemoryRoomStorage implements RoomStorage {
  records = new Map<string, RoomRecord>();
  async read(id: string) {
    const value = this.records.get(id);
    return value ? structuredClone(value) : null;
  }
  async create(room: StoredRoom) {
    if (this.records.has(room.id)) return false;
    this.records.set(room.id, { room: structuredClone(room), etag: "0" });
    return true;
  }
  async replace(room: StoredRoom, etag: string) {
    const old = this.records.get(room.id);
    if (!old || old.etag !== etag) return false;
    this.records.set(room.id, {
      room: structuredClone(room),
      etag: String(Number(old.etag) + 1),
    });
    return true;
  }
}
