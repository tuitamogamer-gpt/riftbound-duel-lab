import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { StarterDeck } from "../data/decks";
import { findCard, type CatalogCard } from "../catalog";
import { Card, CardDetail } from "./Card";
import { useOnlineRoom } from "../hooks/useOnlineRoom";
import {
  onlineInvitationUrl,
  readOnlineInvitation,
} from "../game/online-client";
import { observationRulesView } from "../game/ai/observation";
import { getMight } from "../game/engine";
import { isImplemented } from "../game/scripts";
import type { OnlineAction } from "../game/online-protocol";
import type { LocationId, Unit } from "../game/types";
import "./OnlineDuel.css";

const errors: Record<string, string> = {
  "invalid-request": "The room request is invalid. Try again.",
  "invalid-deck": "Choose a legal supported deck and one of its battlegrounds.",
  "not-found": "This room does not exist. Check the invitation link.",
  unauthorized:
    "This room access is invalid. Open your invitation or create a new room.",
  expired: "This room has expired. Create a new room to play again.",
  "room-full": "This room already has two players.",
  "room-closed": "This duel has ended or a player has left.",
  stale: "The position changed. Choose your move again.",
  "not-your-turn": "Your opponent has the next decision.",
  "illegal-action": "This move is no longer available. Choose another move.",
  "storage-unavailable":
    "Online rooms are temporarily unavailable. Try again later or return to local play.",
  "room-too-large": "This duel cannot accept more moves. Start a new room.",
  network: "Connection interrupted. Refresh the room or retry your move.",
};

export default function OnlineDuel({
  availableDecks,
  onBack,
}: {
  availableDecks: StarterDeck[];
  onBack: () => void;
}) {
  const { t } = useI18n();
  const online = useOnlineRoom();
  const [deckId, setDeckId] = useState(
    online.pendingJoin?.selection.deck?.id ??
      online.pendingJoin?.selection.deckId ??
      availableDecks[0]?.id ??
      "",
  );
  const chosen =
    availableDecks.find((deck) => deck.id === deckId) ?? availableDecks[0];
  const [fieldId, setFieldId] = useState(
    online.pendingJoin?.selection.battlefieldId ?? chosen?.battlefieldId ?? "",
  );
  const previousDeck = useRef(chosen?.id);
  const [first, setFirst] = useState<"random" | "host" | "guest">("random");
  const [inviteText, setInviteText] = useState(() =>
    typeof window !== "undefined" && readOnlineInvitation(window.location.hash)
      ? window.location.href
      : online.pendingJoin && typeof window !== "undefined"
        ? onlineInvitationUrl(
            { ...online.pendingJoin, seat: 1 },
            window.location.href,
          )
        : "",
  );
  const invitation = useMemo(() => {
    try {
      return readOnlineInvitation(
        new URL(
          inviteText,
          typeof window !== "undefined"
            ? window.location.href
            : "https://example.test",
        ).hash,
      );
    } catch {
      return null;
    }
  }, [inviteText]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [zone, setZone] = useState<LocationId>("field:0");
  const [inspected, setInspected] = useState<CatalogCard | null>(null);
  const [selected, setSelected] = useState<{
    action: OnlineAction;
    revision: number;
  } | null>(null);
  const [runeOrder, setRuneOrder] = useState<string[] | null>(null);
  const room = online.room,
    observed = room?.observation,
    seat = room?.seat ?? online.credentials?.seat ?? 0;
  const game = useMemo(
    () => (observed ? observationRulesView(observed) : null),
    [observed],
  );
  const own = observed?.state.players[seat],
    enemy = observed?.state.players[1 - seat];
  const active = room?.status === "active",
    canMove = active && observed?.state.priorityPlayer === seat;
  const mulliganChoices = useRef<OnlineAction[]>([]);
  if (
    observed?.state.phase === "mulligan" &&
    canMove &&
    !online.filter.query &&
    !online.filter.sourceId &&
    !room?.actionOffset
  )
    mulliganChoices.current = room?.actions ?? [];
  const chooseHand = (id: string, index: number) => {
    if (!canMove) return inspect(id);
    if (observed?.state.phase !== "mulligan")
      return online.setFilter({ query: findCard(id)?.name ?? "" });
    const previous =
      selected?.action.category === "mulligan"
        ? (selected.action.cardIndices ?? [])
        : [];
    const next = previous.includes(index)
      ? previous.filter((value) => value !== index)
      : previous.length < 2
        ? [...previous, index]
        : previous;
    next.sort((a, b) => a - b);
    const action = mulliganChoices.current.find(
      (action) => (action.cardIndices ?? []).join(",") === next.join(","),
    );
    if (action && room) setSelected({ action, revision: room.revision });
  };
  useEffect(() => {
    if (previousDeck.current !== chosen?.id) {
      previousDeck.current = chosen?.id;
      setFieldId(chosen?.battlefieldId ?? "");
    }
  }, [chosen?.id]);
  useEffect(() => {
    setSelected(null);
  }, [room?.revision]);
  const runeIds = own?.runes.map((rune) => rune.id).join("|") ?? "";
  useEffect(() => {
    setRuneOrder(null);
  }, [runeIds]);
  useEffect(() => {
    const change = () => {
      if (readOnlineInvitation(window.location.hash))
        setInviteText(window.location.href);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const locations = observed
    ? ([
        `base:${seat}`,
        ...observed.state.fields.map((field) => field.id),
        `base:${1 - seat}`,
      ] as LocationId[])
    : [];
  useEffect(() => {
    if (observed && !locations.includes(zone)) setZone(`base:${seat}`);
  }, [room?.id, seat, locations.join("|")]);
  const inspect = (id: string) => {
    const card = findCard(id);
    if (card) setInspected(card);
  };
  const label = (location: LocationId) =>
    location === `base:${seat}`
      ? t("Tvoja baza")
      : location === `base:${1 - seat}`
        ? t("Protivnička baza")
        : (findCard(
            observed?.state.fields.find((field) => field.id === location)
              ?.cardId,
          )?.name ?? t("Bojište"));
  const source = (id: string) => {
    if (canMove) online.setFilter({ sourceId: id });
  };
  const unitMight = (unit: Unit) => {
    try {
      return game ? getMight(game, unit) : (findCard(unit.cardId)?.might ?? 0);
    } catch {
      return findCard(unit.cardId)?.might ?? 0;
    }
  };
  const closed =
    room?.status === "ended" ||
    room?.status === "departed" ||
    (!online.pendingJoin &&
      ["expired", "not-found", "unauthorized"].includes(online.error ?? ""));
  const cardPiece = (
    cardId: string,
    key: string,
    onSelect?: () => void,
    unit?: Unit,
  ) => {
    const card = findCard(cardId);
    if (!card) return null;
    return (
      <div className="online-card-piece" key={key}>
        <Card
          card={card}
          small
          ready={unit?.ready}
          damage={unit?.damage}
          might={unit ? unitMight(unit) : undefined}
          onClick={onSelect ?? (() => inspect(cardId))}
          preview={false}
          selected={
            (key.startsWith("hand-") &&
              selected?.action.category === "mulligan" &&
              selected.action.cardIndices?.includes(Number(key.slice(5)))) ||
            (observed?.state.phase === "move" &&
              observed.state.pendingMove?.unitIds.includes(key))
          }
        />
        <strong>{card.name}</strong>
        <span>
          {unit
            ? `${t("MIGHT")} ${unitMight(unit)}${unit.damage ? ` · ${t("Damage")} ${unit.damage}` : ""}`
            : `${card.energy ?? 0} ${t("ENERGY")} · ${card.power ?? 0} ${t("Power")}`}
        </span>
        <button
          className="online-card-detail"
          onClick={() => inspect(cardId)}
          aria-label={t("Read {card}", { card: card.name })}
        >
          <Search size={16} />
        </button>
      </div>
    );
  };
  return (
    <main className="online-duel" id="main-content">
      <header className="online-header">
        <button onClick={onBack}>
          <ArrowLeft size={18} />
          {t("Back")}
        </button>
        <div>
          <span className="eyebrow">RIFTBOUND DUEL LAB</span>
          <h1>{t("Private online duel")}</h1>
        </div>
        {online.credentials && (
          <button
            onClick={() => void online.refresh()}
            disabled={online.busy}
            aria-label={t("Refresh room")}
          >
            <RefreshCw size={18} />
          </button>
        )}
      </header>
      {online.error && (
        <div className="online-notice error" role="alert">
          {t(errors[online.error] ?? errors.network)}
          {online.credentials && (
            <button
              onClick={() =>
                void (online.pendingJoin ? online.retryJoin() : online.retry())
              }
              disabled={online.busy}
            >
              {t(
                online.pendingJoin
                  ? "Retry joining"
                  : online.pendingRetry
                    ? "Retry move"
                    : "Refresh room",
              )}
            </button>
          )}
        </div>
      )}
      {online.resumeUnavailable && (
        <p className="online-notice">
          {t(
            "This browser cannot remember your room access. Keep this tab open to continue.",
          )}
        </p>
      )}
      {online.pendingRetry && !online.error && (
        <div className="online-notice">
          {t("Check the interrupted move before choosing another.")}
          <button onClick={() => void online.retry()} disabled={online.busy}>
            {t("Retry move")}
          </button>
        </div>
      )}
      {!online.credentials && (
        <section className="online-setup">
          <h2>
            {t(invitation ? "Join a private room" : "Play with a friend")}
          </h2>
          <p>
            {t(
              "Create a room, share its invitation, and each player chooses a deck. Rooms last 24 hours.",
            )}
          </p>
          <label>
            {t("Your deck")}
            <select
              aria-label={t("Your deck")}
              value={chosen?.id ?? ""}
              onChange={(event) => setDeckId(event.target.value)}
            >
              {availableDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {t(deck.name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Your battleground")}
            <select
              aria-label={t("Your battleground")}
              value={fieldId}
              onChange={(event) => setFieldId(event.target.value)}
            >
              {(chosen?.battlefieldIds ?? [chosen?.battlefieldId])
                .filter(Boolean)
                .map((id) => (
                  <option key={id} value={id}>
                    {findCard(id)?.name}
                  </option>
                ))}
            </select>
          </label>
          {!invitation && (
            <label>
              {t("First player")}
              <select
                aria-label={t("First player")}
                value={first}
                onChange={(event) =>
                  setFirst(event.target.value as typeof first)
                }
              >
                <option value="random">{t("Random")}</option>
                <option value="host">{t("You")}</option>
                <option value="guest">{t("Invited opponent")}</option>
              </select>
            </label>
          )}
          <label>
            {t("Invitation link")}
            <input
              aria-label={t("Invitation link")}
              value={inviteText}
              onChange={(event) => setInviteText(event.target.value)}
              placeholder="https://…/#duel=…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="online-setup-actions">
            <button
              disabled={
                online.busy || !chosen || (Boolean(inviteText) && !invitation)
              }
              onClick={() => {
                if (!chosen) return;
                const selection = { deck: chosen, battlefieldId: fieldId };
                void (invitation
                  ? online.join(invitation, selection)
                  : online.create(selection, first));
              }}
            >
              {t(
                online.busy
                  ? "Connecting…"
                  : invitation
                    ? "Join room"
                    : "Create room",
              )}
              <ArrowRight size={17} />
            </button>
            {inviteText && (
              <button onClick={() => setInviteText("")}>
                {t("Create a different room")}
              </button>
            )}
          </div>
        </section>
      )}
      {online.credentials && !room && (
        <section className="online-setup">
          <h2>
            {t(
              online.pendingJoin
                ? "Your room join is waiting"
                : "Reconnecting to your room…",
            )}
          </h2>
          {online.pendingJoin && (
            <>
              <p>
                {t(
                  "Retry the same invitation and deck to finish joining safely.",
                )}
              </p>
              <p>
                {chosen ? t(chosen.name) : t("Your deck")} ·{" "}
                {findCard(fieldId)?.name}
              </p>
              <button
                onClick={() => void online.retryJoin()}
                disabled={online.busy}
              >
                {t(online.busy ? "Connecting…" : "Retry joining")}
              </button>
            </>
          )}
          <button onClick={online.forget}>{t("Use a different room")}</button>
        </section>
      )}
      {room?.status === "waiting" && (
        <section className="online-waiting">
          <h2>{t("Waiting for your opponent")}</h2>
          <p>
            {t(
              "Share this invitation. Your deck stays private until cards are played.",
            )}
          </p>
          <div className="online-invitation">
            <input
              readOnly
              aria-label={t("Room invitation")}
              value={
                online.credentials
                  ? onlineInvitationUrl(
                      online.credentials,
                      window.location.href,
                    )
                  : ""
              }
              onFocus={(event) => event.target.select()}
            />
            <button
              onClick={async () => {
                setCopyError(false);
                try {
                  await navigator.clipboard.writeText(
                    onlineInvitationUrl(
                      online.credentials!,
                      window.location.href,
                    ),
                  );
                  setCopied(true);
                } catch {
                  setCopyError(true);
                }
              }}
            >
              <Copy size={17} />
              {t(copied ? "Copied" : "Copy invitation")}
            </button>
          </div>
          {copyError && (
            <p className="online-notice">
              {t("Select the invitation text and copy it to share the room.")}
            </p>
          )}
          <button onClick={() => void online.depart()} disabled={online.busy}>
            {t("Close room")}
          </button>
        </section>
      )}
      {observed && own && enemy && (
        <>
          <div className="online-match-status" role="status">
            <strong>
              {t(
                room?.status === "departed"
                  ? room.departedSeat === seat
                    ? "You left the room"
                    : "Your opponent left the room"
                  : room?.status === "ended"
                    ? observed.state.winner === seat
                      ? "You win"
                      : "Opponent wins"
                    : canMove
                      ? "Your decision"
                      : "Opponent's decision",
              )}
            </strong>
            <span>
              {t("Turn {turn}", { turn: observed.state.turn })} · {t("You")}{" "}
              {own.points} / {enemy.points} {t("Opponent")}
            </span>
          </div>
          <nav className="online-zones" aria-label={t("Table locations")}>
            {locations.map((location) => (
              <button
                key={location}
                aria-pressed={zone === location}
                onClick={() => setZone(location)}
              >
                {label(location)}
                <small>
                  {
                    observed.state.units.filter(
                      (unit) =>
                        unit.location === location && unit.owner === seat,
                    ).length
                  }{" "}
                  /{" "}
                  {
                    observed.state.units.filter(
                      (unit) =>
                        unit.location === location && unit.owner !== seat,
                    ).length
                  }
                </small>
              </button>
            ))}
          </nav>
          <section className="online-board" aria-label={label(zone)}>
            {[1 - seat, seat].map((actor) => (
              <div
                className={`online-player-row ${actor === seat ? "own" : "enemy"}`}
                key={actor}
              >
                <h3>{t(actor === seat ? "You" : "Opponent")}</h3>
                <div className="online-pieces">
                  {zone === `base:${actor}` && (
                    <>
                      {cardPiece(
                        observed.state.players[actor].legendId,
                        `legend-${actor}`,
                        () =>
                          actor === seat
                            ? source("legend")
                            : inspect(observed.state.players[actor].legendId),
                      )}
                      {cardPiece(
                        observed.state.players[actor].championId,
                        `champion-${actor}`,
                        () =>
                          actor === seat
                            ? source("champion")
                            : inspect(observed.state.players[actor].championId),
                      )}
                    </>
                  )}
                  {observed.state.units
                    .filter(
                      (unit) => unit.location === zone && unit.owner === actor,
                    )
                    .map((unit) => (
                      <div key={unit.id} className="online-unit">
                        {cardPiece(
                          unit.cardId,
                          unit.id,
                          () =>
                            actor === seat
                              ? source(unit.id)
                              : inspect(unit.cardId),
                          unit,
                        )}
                        {unit.gear.length > 0 && (
                          <div className="online-attached">
                            {unit.gear.map((id) => {
                              const gear = observed.state.gears.find(
                                (piece) => piece.id === id,
                              );
                              return gear ? (
                                <button
                                  key={id}
                                  onClick={() => inspect(gear.cardId)}
                                >
                                  {findCard(gear.cardId)?.name}
                                </button>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  {zone === `base:${actor}` &&
                    observed.state.gears
                      .filter(
                        (gear) =>
                          gear.owner === actor &&
                          !gear.attachedTo &&
                          !observed.state.units.some(
                            (unit) => unit.id === gear.id,
                          ),
                      )
                      .map((gear) =>
                        cardPiece(gear.cardId, gear.id, () =>
                          actor === seat
                            ? source(gear.id)
                            : inspect(gear.cardId),
                        ),
                      )}
                  {!(
                    observed.state.units.some(
                      (unit) => unit.location === zone && unit.owner === actor,
                    ) || zone === `base:${actor}`
                  ) && <p>{t("No units here")}</p>}
                </div>
                <div className="online-hidden">
                  {t("Hidden cards: {count}", {
                    count:
                      observed.state.hidden?.filter(
                        (card) =>
                          card.owner === actor && card.location === zone,
                      ).length ?? 0,
                  })}
                  {observed.state.hidden
                    ?.filter(
                      (card) =>
                        card.owner === actor &&
                        card.location === zone &&
                        Boolean(findCard(card.cardId)),
                    )
                    .map((card) => (
                      <div className="online-hidden-card" key={card.id}>
                        <button
                          onClick={() =>
                            actor === seat
                              ? source(`hidden:${card.id}`)
                              : inspect(card.cardId)
                          }
                        >
                          {findCard(card.cardId)?.name}
                        </button>
                        <button onClick={() => inspect(card.cardId)}>
                          {t("Read")}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </section>
          {observed.state.stack.length > 0 && (
            <section className="online-chain">
              <h3>{t("Reaction chain")}</h3>
              {[...observed.state.stack].reverse().map((item) => (
                <button key={item.id} onClick={() => inspect(item.cardId)}>
                  {t(item.player === seat ? "You" : "Opponent")} ·{" "}
                  {findCard(item.cardId)?.name}
                </button>
              ))}
            </section>
          )}
          <section className="online-hand">
            <header>
              <h2>{t("Your hand")}</h2>
              <span>
                {own.handCount} {t("cards")} · {t("Opponent hand")}{" "}
                {enemy.handCount} · {t("Deck")} {own.deckCount}
              </span>
            </header>
            <div>
              {own.hand.map((id, index) =>
                cardPiece(id, `hand-${index}`, () => chooseHand(id, index)),
              )}
            </div>
          </section>
          {observed.publicReveals && (
            <section className="online-public-reveal">
              <h3>{t("Revealed hand snapshot")}</h3>
              <p>
                {t(observed.publicReveals.owner === seat ? "You" : "Opponent")}{" "}
                · {findCard(observed.publicReveals.sourceCardId)?.name} ·{" "}
                {t("Turn {turn}", { turn: observed.publicReveals.turn })}
              </p>
              <p>
                {t(
                  "These cards were revealed at that moment. The hand may have changed since then.",
                )}
              </p>
              <div className="online-revealed-cards">
                {observed.publicReveals.cards.map((id, index) =>
                  cardPiece(id, `revealed-${index}`, () => inspect(id)),
                )}
                {observed.publicReveals.cards.length === 0 && (
                  <p>{t("No cards were revealed.")}</p>
                )}
              </div>
            </section>
          )}
          <section className="online-resources">
            <h3>
              {t("Your runes")} · {own.energy} {t("ENERGY")}
            </h3>
            <div>
              {own.runes.map((rune) => (
                <button
                  key={rune.id}
                  className={rune.ready ? "" : "exhausted"}
                  onClick={() => source(rune.id)}
                >
                  {t(rune.domain)} · {t(rune.ready ? "Ready" : "Exhausted")}
                </button>
              ))}
            </div>
            <details>
              <summary>{t("Rune payment order")}</summary>
              <p>
                {t("Runes are used in this order when a move needs payment.")}
              </p>
              {(runeOrder ?? own.runes.map((rune) => rune.id)).map(
                (id, index, array) => (
                  <div className="online-rune-order" key={id}>
                    <span>
                      {index + 1}.{" "}
                      {t(
                        own.runes.find((rune) => rune.id === id)?.domain ?? "",
                      )}
                    </span>
                    <button
                      disabled={index === 0}
                      aria-label={t("Move rune earlier")}
                      onClick={() => {
                        const next = [...array];
                        [next[index], next[index - 1]] = [
                          next[index - 1],
                          next[index],
                        ];
                        setRuneOrder(next);
                      }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      disabled={index === array.length - 1}
                      aria-label={t("Move rune later")}
                      onClick={() => {
                        const next = [...array];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        setRuneOrder(next);
                      }}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                ),
              )}
              <button onClick={() => setRuneOrder(null)}>
                {t("Automatic payment")}
              </button>
            </details>
          </section>
          <section className="online-decisions">
            <header>
              <h2>{t("Available moves")}</h2>
              <button onClick={() => online.setFilter({})}>
                {t("All moves")}
              </button>
            </header>
            {observed.state.phase === "move" && canMove && (
              <p className="online-notice">
                {observed.state.pendingMove && (
                  <>
                    <strong>
                      {t("{count} units selected · {destination}", {
                        count: observed.state.pendingMove.unitIds.length,
                        destination: label(observed.state.pendingMove.to),
                      })}
                    </strong>
                    <br />
                  </>
                )}
                {t(
                  "Add or remove units using the available moves. Confirm the Move option to move the selected group together.",
                )}
              </p>
            )}
            {online.filter.sourceId && (
              <p>{t("Moves for the selected card")}</p>
            )}
            <label>
              {t("Find a move")}
              <input
                type="search"
                aria-label={t("Find a move")}
                maxLength={80}
                value={online.filter.query ?? ""}
                onChange={(event) =>
                  online.setFilter({
                    ...online.filter,
                    query: event.target.value,
                    offset: 0,
                  })
                }
              />
            </label>
            {!canMove && <p>{t("Your opponent has the next decision.")}</p>}
            {canMove && room.actions.length === 0 && (
              <p>
                {t("No moves match this filter. Show all moves to continue.")}
              </p>
            )}
            <div className="online-action-list">
              {room.actions.map((action) => (
                <button
                  key={action.id}
                  data-action-id={action.id}
                  disabled={online.busy || online.pendingRetry}
                  aria-pressed={selected?.action.id === action.id}
                  onClick={() =>
                    setSelected({ action, revision: room.revision })
                  }
                >
                  <span>{t(action.label)}</span>
                  {action.detail && <small>{t(action.detail)}</small>}
                </button>
              ))}
            </div>
            {selected && selected.revision === room.revision && (
              <div className="online-confirm">
                <strong>{t(selected.action.label)}</strong>
                <button
                  disabled={online.busy || online.pendingRetry}
                  onClick={() =>
                    void online.act(selected.action.id, runeOrder ?? undefined)
                  }
                >
                  {t(online.busy ? "Sending move…" : "Confirm move")}
                  <ArrowRight size={17} />
                </button>
                <button
                  onClick={() => setSelected(null)}
                  aria-label={t("Cancel move")}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div className="online-action-pages">
              <button
                disabled={!room.actionOffset || online.busy}
                onClick={() =>
                  online.setFilter({
                    ...online.filter,
                    offset: Math.max(0, room.actionOffset - 36),
                  })
                }
              >
                {t("Previous moves")}
              </button>
              <button
                disabled={!room.hasMoreActions || online.busy}
                onClick={() =>
                  online.setFilter({
                    ...online.filter,
                    offset: room.actionOffset + 36,
                  })
                }
              >
                {t("More moves")}
              </button>
            </div>
          </section>
          <details className="online-public-piles">
            <summary>{t("Discard and banished cards")}</summary>
            {[seat, 1 - seat].map((actor) => (
              <section key={actor}>
                <h3>{t(actor === seat ? "You" : "Opponent")}</h3>
                {observed.state.players[actor].discard.map((id, index) => (
                  <button key={`discard-${index}`} onClick={() => inspect(id)}>
                    {findCard(id)?.name} · {t("Discard")}
                  </button>
                ))}
                {observed.state.players[actor].banished.map((id, index) => (
                  <button key={`banished-${index}`} onClick={() => inspect(id)}>
                    {findCard(id)?.name} · {t("Banished")}
                  </button>
                ))}
              </section>
            ))}
          </details>
        </>
      )}
      {online.credentials && (
        <footer className="online-footer">
          {closed ? (
            <button
              onClick={() => {
                online.forget();
                setInviteText("");
                history.replaceState(
                  null,
                  "",
                  location.pathname + location.search,
                );
              }}
            >
              {t("New room")}
            </button>
          ) : (
            <button
              disabled={online.busy || !room}
              onClick={() => void online.depart()}
            >
              {t("Leave room")}
            </button>
          )}
          <span>
            {t("Only your room access is remembered on this device.")}
          </span>
        </footer>
      )}
      {inspected && (
        <CardDetail
          card={inspected}
          scripted={isImplemented(inspected.id)}
          onClose={() => setInspected(null)}
        />
      )}
    </main>
  );
}
