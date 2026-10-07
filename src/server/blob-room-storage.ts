import { get, put, BlobPreconditionFailedError } from "@vercel/blob";
import {
  MAX_ROOM_BYTES,
  RoomError,
  type RoomStorage,
  type StoredRoom,
} from "./rooms";
import { ONLINE_ROOM_ID, ONLINE_TOKEN } from "../game/online-protocol";

const path = (id: string) => {
  if (!ONLINE_ROOM_ID.test(id)) throw new RoomError("invalid-request", 400);
  return `duel-rooms/v1/${id}.json`;
};
/** No client token or public Blob URL is used for authoritative room data. */
export class BlobRoomStorage implements RoomStorage {
  constructor(
    private token = process.env.BLOB_READ_WRITE_TOKEN,
    private storeId = process.env.BLOB_STORE_ID,
  ) {}
  private options() {
    if (!this.token && !this.storeId)
      throw new RoomError("storage-unavailable", 503);
    return {
      access: "private" as const,
      ...(this.token ? { token: this.token } : { storeId: this.storeId }),
    };
  }
  async read(id: string) {
    const result = await get(path(id), { ...this.options(), useCache: false });
    if (!result || result.statusCode !== 200) return null;
    if (result.blob.size > MAX_ROOM_BYTES)
      throw new RoomError("storage-unavailable", 503);
    const value = (await new Response(result.stream).json()) as StoredRoom;
    if (
      !value ||
      value.version !== 1 ||
      value.id !== id ||
      !Number.isFinite(value.expiresAt) ||
      !Number.isSafeInteger(value.revision) ||
      !ONLINE_TOKEN.test(value.host?.tokenHash ?? "") ||
      !ONLINE_TOKEN.test(value.inviteHash ?? "") ||
      (value.guest && !ONLINE_TOKEN.test(value.guest.tokenHash))
    )
      throw new RoomError("storage-unavailable", 503);
    return { room: value, etag: result.blob.etag };
  }
  private async write(room: StoredRoom, etag?: string) {
    const raw = JSON.stringify(room);
    if (Buffer.byteLength(raw) > MAX_ROOM_BYTES)
      throw new RoomError("room-too-large", 413);
    try {
      await put(path(room.id), raw, {
        ...this.options(),
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: etag } : {}),
        contentType: "application/json",
        maximumSizeInBytes: MAX_ROOM_BYTES,
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
  }
  create(room: StoredRoom) {
    return this.write(room);
  }
  replace(room: StoredRoom, etag: string) {
    return this.write(room, etag);
  }
}
