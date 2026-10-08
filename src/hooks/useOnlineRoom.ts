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
  const mounted = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const polling = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const retryAction = useRef<Extract<OnlineRequest, { op: "act" }> | null>(
    null,
  );
  const joinToken = useRef(onlineSecret());
  const [pendingRetry, setPendingRetry] = useState(false);
  const invalidatePoll = useCallback(() => {
    generation.current++;
    polling.current?.abort();
    polling.current = null;
  }, []);
  const cancelOperation = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelOperation();
      invalidatePoll();
    };
  }, [cancelOperation, invalidatePoll]);
  const refresh = useCallback(async () => {
    const seat = current.current;
    if (!mounted.current || !seat || operation.current || polling.current)
      return;
    const version = generation.current;
    const request = new AbortController();
    polling.current = request;
    const timeout = setTimeout(() => request.abort(), 15_000);
    try {
      const response = await requestOnlineRoom(
        {
          op: "poll",
          roomId: seat.roomId,
          seatToken: seat.seatToken,
          ...filterRef.current,
        },
        request.signal,
      );
      if (
        !mounted.current ||
        polling.current !== request ||
        version !== generation.current
      )
        return;
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
      if (
        mounted.current &&
        polling.current === request &&
        version === generation.current
      )
        setError(value instanceof OnlineClientError ? value.code : "network");
    } finally {
      clearTimeout(timeout);
      if (polling.current === request) polling.current = null;
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
      invalidatePoll();
    };
  }, [credentials, refresh, invalidatePoll]);
  useEffect(() => {
    void refresh();
  }, [filter, refresh]);
  const run = async (body: OnlineRequest) => {
    if (!mounted.current || operation.current) return null;
    const request = new AbortController();
    operation.current = request;
    const timeout = setTimeout(() => request.abort(), 30_000);
    setBusy(true);
    setError(null);
    invalidatePoll();
    try {
      const response = await requestOnlineRoom(body, request.signal);
      // A reply can arrive even after its fetch was aborted. Forgetting a seat,
      // leaving this screen, or starting another request must keep it forgotten.
      if (!mounted.current || operation.current !== request) return null;
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
      if (!mounted.current || operation.current !== request) return null;
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
      clearTimeout(timeout);
      // An old request must never unlock or refresh a newer room operation.
      if (operation.current === request) {
        operation.current = null;
        if (mounted.current) {
          setBusy(false);
          void refresh();
        }
      }
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
      invalidatePoll();
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
      if (!mounted.current || operation.current) return null;
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
      cancelOperation();
      invalidatePoll();
      storeOnlineCredentials(null);
      storeOnlineJoinIntent(null);
      setPendingJoin(null);
      pendingJoinRef.current = null;
      setCredentials(null);
      current.current = null;
      setRoom(null);
      setFilter({});
      filterRef.current = {};
      setError(null);
      setBusy(false);
      setResumeUnavailable(false);
      retryAction.current = null;
      setPendingRetry(false);
    },
  };
}
