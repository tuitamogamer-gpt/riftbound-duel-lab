import type { VercelRequest, VercelResponse } from "@vercel/node";
import { BlobRoomStorage } from "../src/server/blob-room-storage";
import {
  MAX_ROOM_REQUEST_BYTES,
  RoomError,
  RoomService,
  type RoomStorage,
} from "../src/server/rooms";

export function createDuelHandler(storage: RoomStorage) {
  const service = new RoomService(storage);
  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "invalid-request" });
    }
    const origin = req.headers.origin;
    const host = req.headers["x-forwarded-host"] ?? req.headers.host;
    if (origin) {
      try {
        if (new URL(origin).host !== host)
          return res.status(403).json({ error: "unauthorized" });
      } catch {
        return res.status(403).json({ error: "unauthorized" });
      }
    }
    try {
      let body: unknown = req.body;
      if (body === undefined) {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_ROOM_REQUEST_BYTES)
            throw new RoomError("invalid-request", 413);
          chunks.push(buffer);
        }
        body = Buffer.concat(chunks).toString("utf8");
      }
      if (typeof body === "string") {
        if (Buffer.byteLength(body) > MAX_ROOM_REQUEST_BYTES)
          throw new RoomError("invalid-request", 413);
        try {
          body = JSON.parse(body);
        } catch {
          throw new RoomError("invalid-request", 400);
        }
      } else if (
        Buffer.byteLength(JSON.stringify(body) ?? "") > MAX_ROOM_REQUEST_BYTES
      )
        throw new RoomError("invalid-request", 413);
      return res.status(200).json(await service.request(body));
    } catch (error) {
      if (error instanceof RoomError)
        return res.status(error.status).json({ error: error.code });
      // Storage/engine diagnostics stay server-side; never return state, tokens or stack traces.
      return res.status(503).json({ error: "storage-unavailable" });
    }
  };
}

export default createDuelHandler(new BlobRoomStorage());
