import {
  ONLINE_ROOM_ID,
  ONLINE_TOKEN,
  type OnlineCredentials,
  type OnlineRequest,
  type OnlineResponse,
  type OnlineErrorCode,
  type OnlineDeckSelection,
} from "./online-protocol";

export const ONLINE_SAVE_KEY = "riftbound-online-seat-v1";
export const ONLINE_JOIN_INTENT_KEY = "riftbound-online-join-intent-v1";
export interface OnlineJoinIntent {
  roomId: string;
  inviteToken: string;
  seatToken: string;
  createdAt: number;
  selection: OnlineDeckSelection;
}
const JOIN_INTENT_TTL = 24 * 60 * 60 * 1000;
export function readOnlineJoinIntent(
  storage?: Pick<Storage, "getItem">,
  now = Date.now(),
): OnlineJoinIntent | null {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(
      ONLINE_JOIN_INTENT_KEY,
    );
    if (!raw || new TextEncoder().encode(raw).byteLength > 120_000) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.roomId !== "string" ||
      !ONLINE_ROOM_ID.test(entry.roomId) ||
      typeof entry.inviteToken !== "string" ||
      !ONLINE_TOKEN.test(entry.inviteToken) ||
      typeof entry.seatToken !== "string" ||
      !ONLINE_TOKEN.test(entry.seatToken) ||
      typeof entry.createdAt !== "number" ||
      !Number.isFinite(entry.createdAt) ||
      entry.createdAt > now + 60_000 ||
      entry.createdAt <= now - JOIN_INTENT_TTL ||
      !entry.selection ||
      typeof entry.selection !== "object" ||
      Array.isArray(entry.selection)
    )
      return null;
    const source = entry.selection as Record<string, unknown>;
    if (
      (source.deckId !== undefined && typeof source.deckId !== "string") ||
      (source.battlefieldId !== undefined &&
        typeof source.battlefieldId !== "string") ||
      (source.deck !== undefined &&
        (!source.deck ||
          typeof source.deck !== "object" ||
          Array.isArray(source.deck))) ||
      (!source.deck && !source.deckId)
    )
      return null;
    const selection: OnlineDeckSelection = {
      ...(typeof source.deckId === "string" ? { deckId: source.deckId } : {}),
      ...(typeof source.battlefieldId === "string"
        ? { battlefieldId: source.battlefieldId }
        : {}),
      ...(source.deck
        ? { deck: source.deck as NonNullable<OnlineDeckSelection["deck"]> }
        : {}),
    };
    return {
      roomId: entry.roomId,
      inviteToken: entry.inviteToken,
      seatToken: entry.seatToken,
      createdAt: entry.createdAt,
      selection,
    };
  } catch {
    return null;
  }
}
export function storeOnlineJoinIntent(
  value: OnlineJoinIntent | null,
  storage?: Pick<Storage, "setItem" | "removeItem">,
): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    if (!value) {
      target.removeItem(ONLINE_JOIN_INTENT_KEY);
      return true;
    }
    const raw = JSON.stringify(value);
    if (new TextEncoder().encode(raw).byteLength > 120_000) return false;
    target.setItem(ONLINE_JOIN_INTENT_KEY, raw);
    return true;
  } catch {
    return false;
  }
}
const knownErrors = new Set<OnlineErrorCode>([
  "invalid-request",
  "invalid-deck",
  "not-found",
  "unauthorized",
  "expired",
  "room-full",
  "room-closed",
  "stale",
  "not-your-turn",
  "illegal-action",
  "storage-unavailable",
  "room-too-large",
]);
export class OnlineClientError extends Error {
  constructor(public code: OnlineErrorCode | "network") {
    super(code);
  }
}
export function onlineSecret() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
export function parseOnlineCredentials(
  value: unknown,
): OnlineCredentials | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.roomId !== "string" ||
    !ONLINE_ROOM_ID.test(entry.roomId) ||
    typeof entry.seatToken !== "string" ||
    !ONLINE_TOKEN.test(entry.seatToken) ||
    ![0, 1].includes(Number(entry.seat)) ||
    typeof entry.seat !== "number" ||
    (entry.inviteToken !== undefined &&
      (typeof entry.inviteToken !== "string" ||
        !ONLINE_TOKEN.test(entry.inviteToken)))
  )
    return null;
  return {
    roomId: entry.roomId,
    seatToken: entry.seatToken,
    seat: entry.seat as 0 | 1,
    ...(typeof entry.inviteToken === "string"
      ? { inviteToken: entry.inviteToken }
      : {}),
  };
}
export function readOnlineCredentials(storage?: Pick<Storage, "getItem">) {
  try {
    return parseOnlineCredentials(
      JSON.parse(
        (storage ?? globalThis.localStorage)?.getItem(ONLINE_SAVE_KEY) ??
          "null",
      ),
    );
  } catch {
    return null;
  }
}
export function storeOnlineCredentials(
  value: OnlineCredentials | null,
  storage?: Pick<Storage, "setItem" | "removeItem">,
): boolean {
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    if (value) target.setItem(ONLINE_SAVE_KEY, JSON.stringify(value));
    else target.removeItem(ONLINE_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
export function readOnlineInvitation(hash: string) {
  const match = /^#duel=([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(hash);
  return match ? { roomId: match[1], inviteToken: match[2] } : null;
}
export function onlineInvitationUrl(
  credentials: OnlineCredentials,
  base: string,
) {
  if (!credentials.inviteToken) return "";
  const url = new URL(base);
  url.hash = `duel=${credentials.roomId}.${credentials.inviteToken}`;
  return url.toString();
}
export async function requestOnlineRoom(
  body: OnlineRequest,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<OnlineResponse> {
  let response: Response;
  try {
    response = await fetcher("/api/duel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch {
    throw new OnlineClientError("network");
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new OnlineClientError("network");
  }
  if (!response.ok) {
    const code =
      value && typeof value === "object" && "error" in value
        ? value.error
        : null;
    throw new OnlineClientError(
      knownErrors.has(code as OnlineErrorCode)
        ? (code as OnlineErrorCode)
        : "network",
    );
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("room" in value) ||
    !value.room ||
    typeof value.room !== "object"
  )
    throw new OnlineClientError("network");
  return value as OnlineResponse;
}
