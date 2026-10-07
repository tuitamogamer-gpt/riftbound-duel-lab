import type { Observation } from "./ai/observation";
import type { GameAction, PlayerId } from "./types";
import type { StarterDeck } from "../data/decks";

export type OnlineAction = Pick<
  GameAction,
  "id" | "label" | "player" | "category"
> &
  Partial<
    Pick<
      GameAction,
      | "sourceId"
      | "targetId"
      | "cardId"
      | "locationId"
      | "detail"
      | "amount"
      | "unitIds"
      | "cardIndices"
    >
  >;
export interface OnlineCredentials {
  roomId: string;
  seatToken: string;
  seat: PlayerId;
  inviteToken?: string;
}
export interface OnlineRoomView {
  id: string;
  seat: PlayerId;
  revision: number;
  expiresAt: number;
  status: "waiting" | "active" | "ended" | "departed";
  departedSeat?: PlayerId;
  observation: Observation | null;
  actions: OnlineAction[];
  actionOffset: number;
  hasMoreActions: boolean;
}
export interface OnlineResponse {
  room: OnlineRoomView;
  credentials?: OnlineCredentials;
}
export interface OnlineDeckSelection {
  deckId?: string;
  deck?: StarterDeck;
  battlefieldId?: string;
}
export type OnlineRequest =
  | ({
      op: "create";
      firstPlayer?: "random" | "host" | "guest";
    } & OnlineDeckSelection)
  | ({
      op: "join";
      roomId: string;
      inviteToken: string;
      seatToken: string;
    } & OnlineDeckSelection)
  | {
      op: "poll";
      roomId: string;
      seatToken: string;
      sourceId?: string;
      query?: string;
      offset?: number;
    }
  | {
      op: "act";
      roomId: string;
      seatToken: string;
      revision: number;
      requestId: string;
      actionId: string;
      paymentRuneOrder?: string[];
    }
  | { op: "depart"; roomId: string; seatToken: string; revision: number };
export type OnlineErrorCode =
  | "invalid-request"
  | "invalid-deck"
  | "not-found"
  | "unauthorized"
  | "expired"
  | "room-full"
  | "room-closed"
  | "stale"
  | "not-your-turn"
  | "illegal-action"
  | "storage-unavailable"
  | "room-too-large";
export const ONLINE_ROOM_ID = /^[a-f0-9]{32}$/;
export const ONLINE_TOKEN = /^[a-f0-9]{64}$/;
