import { useCallback, useEffect, useRef, useState } from "react";
import {
  OnlineClientError,
  onlineSecret,
  readOnlineCredentials,
  readOnlineJoinIntent,
  requestOnlineRoom,
  storeOnlineCredentials,
  storeOnlineJoinIntent,
  type OnlineJoinIntent,
} from "../game/online-client";
import type {
  OnlineCredentials,
  OnlineDeckSelection,
  OnlineRequest,
  OnlineRoomView,
} from "../game/online-protocol";

export function useOnlineRoom() {
  const [pendingJoin, setPendingJoin] = useState(readOnlineJoinIntent);
  const pendingJoinRef = useRef(pendingJoin);
  pendingJoinRef.current = pendingJoin;
  const [credentials, setCredentials] = useState(
    () =>
      readOnlineCredentials() ??
      (pendingJoin
        ? {
            roomId: pendingJoin.roomId,
            seatToken: pendingJoin.seatToken,
            seat: 1 as const,
          }
        : null),
  );
  const [room, setRoom] = useState<OnlineRoomView | null>(null);
  const [error, setError] = useState<OnlineClientError["code"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [resumeUnavailable, setResumeUnavailable] = useState(false);
  const [filter, setFilter] = useState<{
    sourceId?: string;
    query?: string;
    offset?: number;
  }>({});
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const current = useRef(credentials);
  current.current = credentials;
  const working = useRef(false);
  const generation = useRef(0);
  const retryAction = useRef<Extract<OnlineRequest, { op: "act" }> | null>(
    null,
  );
  const joinToken = useRef(onlineSecret());
  const [pendingRetry, setPendingRetry] = useState(false);
  const refresh = useCallback(async () => {
    const seat = current.current;
    if (!seat || working.current) return;
    const version = generation.current;
    try {
      const response = await requestOnlineRoom(
        {
          op: "poll",
          roomId: seat.roomId,
          seatToken: seat.seatToken,
          ...filterRef.current,
        },
        AbortSignal.timeout(15_000),
      );
      if (version !== generation.current) return;
      const intent = pendingJoinRef.current;
      if (
        intent &&
        intent.roomId === seat.roomId &&
        intent.seatToken === seat.seatToken &&
        storeOnlineCredentials(seat)
      ) {
        setResumeUnavailable(false);
        storeOnlineJoinIntent(null);
        setPendingJoin(null);
        pendingJoinRef.current = null;
      }
      setRoom((previous) =>
        previous?.id === response.room.id &&
        previous.revision > response.room.revision
          ? previous
          : response.room,
      );
      setError(null);
    } catch (value) {
      if (version === generation.current)
        setError(value instanceof OnlineClientError ? value.code : "network");
    }
  }, []);
  useEffect(() => {
    if (!credentials) return;
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
      generation.current++;
    };
  }, [credentials, refresh]);
  useEffect(() => {
    void refresh();
  }, [filter, refresh]);
  const run = async (body: OnlineRequest) => {
    if (working.current) return null;
    working.current = true;
    setBusy(true);
    setError(null);
    generation.current++;
    try {
      const response = await requestOnlineRoom(
        body,
        AbortSignal.timeout(30_000),
      );
      if (response.credentials) {
        const own = response.credentials;
        const persisted = storeOnlineCredentials(own);
        setResumeUnavailable(!persisted);
        if (body.op === "join" && persisted) {
          storeOnlineJoinIntent(null);
          setPendingJoin(null);
          pendingJoinRef.current = null;
        }
        setCredentials(own);
        current.current = own;
      }
      setFilter({});
      filterRef.current = {};
      setRoom(response.room);
      retryAction.current = null;
      setPendingRetry(false);
      return response.room;
    } catch (value) {
      const code = value instanceof OnlineClientError ? value.code : "network";
      setError(code);
      if (body.op === "join") {
        if (code === "network" || code === "storage-unavailable") {
          const candidate: OnlineCredentials = {
            roomId: body.roomId,
            seatToken: body.seatToken,
            seat: 1,
          };
          setCredentials(candidate);
          current.current = candidate;
        } else {
          storeOnlineJoinIntent(null);
          setPendingJoin(null);
          pendingJoinRef.current = null;
          if (!current.current || current.current.roomId === body.roomId) {
            storeOnlineCredentials(null);
            setCredentials(null);
            current.current = null;
          }
        }
      }
      if (body.op === "act" && code === "network") {
        retryAction.current = body;
        setPendingRetry(true);
      }
      if (code === "stale" || code === "not-your-turn") {
        retryAction.current = null;
        setPendingRetry(false);
      }
      return null;
    } finally {
      working.current = false;
      setBusy(false);
      void refresh();
    }
  };
  return {
    credentials,
    room,
    error,
    busy,
    resumeUnavailable,
    filter,
    setFilter: (next: typeof filter) => {
      generation.current++;
      filterRef.current = next;
      setFilter(next);
    },
    pendingRetry,
    pendingJoin,
    refresh,
    create: (
      selection: OnlineDeckSelection,
      firstPlayer: "random" | "host" | "guest",
    ) => run({ op: "create", ...selection, firstPlayer }),
    join: async (
      invitation: { roomId: string; inviteToken: string },
      selection: OnlineDeckSelection,
    ) => {
      const cached = readOnlineCredentials(),
        old = pendingJoinRef.current;
      const same =
        old?.roomId === invitation.roomId &&
        old.inviteToken === invitation.inviteToken;
      const token = same
        ? old!.seatToken
        : cached?.seat === 1 && cached.roomId === invitation.roomId
          ? cached.seatToken
          : joinToken.current;
      const intent: OnlineJoinIntent = {
        ...invitation,
        seatToken: token,
        createdAt: same ? old!.createdAt : Date.now(),
        selection,
      };
      setPendingJoin(intent);
      pendingJoinRef.current = intent;
      const durable = storeOnlineJoinIntent(intent);
      // Keep our own nonce before joining: a lost successful response can then
      // be resumed after reload without reopening the seat to another invitee.
      if (!current.current) {
        const persisted = storeOnlineCredentials({
          roomId: invitation.roomId,
          seatToken: token,
          seat: 1,
        });
        setResumeUnavailable(!durable || !persisted);
      }
      return run({
        op: "join",
        ...invitation,
        ...selection,
        seatToken: token,
      });
    },
    retryJoin: () => {
      const intent = pendingJoinRef.current;
      return intent
        ? run({
            op: "join",
            roomId: intent.roomId,
            inviteToken: intent.inviteToken,
            seatToken: intent.seatToken,
            ...intent.selection,
          })
        : Promise.resolve(null);
    },
    act: (actionId: string, paymentRuneOrder?: string[]) =>
      credentials && room
        ? run({
            op: "act",
            roomId: credentials.roomId,
            seatToken: credentials.seatToken,
            revision: room.revision,
            requestId: onlineSecret(),
            actionId,
            ...(paymentRuneOrder ? { paymentRuneOrder } : {}),
          })
        : Promise.resolve(null),
    retry: () => (retryAction.current ? run(retryAction.current) : refresh()),
    depart: () =>
      credentials && room
        ? run({
            op: "depart",
            roomId: credentials.roomId,
            seatToken: credentials.seatToken,
            revision: room.revision,
          })
        : Promise.resolve(null),
    forget: () => {
      generation.current++;
      storeOnlineCredentials(null);
      storeOnlineJoinIntent(null);
      setPendingJoin(null);
      pendingJoinRef.current = null;
      setCredentials(null);
      current.current = null;
      setRoom(null);
      setFilter({});
      setError(null);
      retryAction.current = null;
      setPendingRetry(false);
    },
  };
}
