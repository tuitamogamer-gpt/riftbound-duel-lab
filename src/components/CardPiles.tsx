import { useEffect, useRef, useState } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { Trash2, X } from "lucide-react";
import { findCard, type CatalogCard } from "../catalog";
import { cardArtUrl } from "../data/art";
import type { GameAction, GameState, PlayerId } from "../game/types";
import { useI18n } from "../i18n";
import { Card } from "./Card";
import { CardSleeve } from "./CardSleeve";
import { getSignatureSleeve } from "../data/sleeves";

export type PileView = { player: PlayerId; zone: "deck" | "trash" };

export function CardPiles({
  game,
  open,
}: {
  game: GameState;
  open: (view: PileView) => void;
}) {
  const { t } = useI18n();
  const player = game.players[0];
  const top = findCard(player.discard.at(-1));
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [top?.id]);
  return (
    <aside className="card-piles" aria-label={t("Your deck and trash")}>
      <button
        className="pile-button deck-pile"
        onClick={() => open({ player: 0, zone: "deck" })}
        aria-label={t("Your deck · {count} cards", {
          count: player.deck.length,
        })}
      >
        <span className="pile-art pile-back" aria-hidden="true">
          <CardSleeve player={player} />
        </span>
        <span className="pile-caption">
          <strong>{t("Deck")}</strong>
          <b>{player.deck.length}</b>
        </span>
      </button>
      <button
        className={`pile-button trash-pile ${top ? "has-cards" : "is-empty"}`}
        onClick={() => open({ player: 0, zone: "trash" })}
        aria-label={t("Your trash · {count} cards", {
          count: player.discard.length,
        })}
      >
        <span className="pile-art" aria-hidden="true">
          {top?.image && !failed ? (
            <img src={cardArtUrl(top)} alt="" onError={() => setFailed(true)} />
          ) : (
            <Trash2 size={22} />
          )}
        </span>
        <span className="pile-caption">
          <strong>{t("Trash")}</strong>
          <b>{player.discard.length}</b>
        </span>
      </button>
    </aside>
  );
}

export function PileDialog({
  game,
  view,
  setView,
  legal,
  close,
  inspect,
  select,
}: {
  game: GameState;
  view: PileView;
  setView: (view: PileView) => void;
  legal: GameAction[];
  close: () => void;
  inspect: (card: CatalogCard) => void;
  select: (source: string) => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDivElement>(null);
  useBodyScrollLock();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  const player = game.players[view.player];
  const isTrash = view.zone === "trash";
  const count = isTrash ? player.discard.length : player.deck.length;
  return (
    <div className="modal-backdrop pile-backdrop" onClick={close}>
      <div
        ref={dialog}
        className="modal pile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pile-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
          if (event.key !== "Tab") return;
          const buttons = [
            ...(dialog.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) ?? []),
          ];
          const first = buttons[0],
            last = buttons.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <button
          className="close-button"
          aria-label={t("Zatvori")}
          onClick={close}
        >
          <X size={22} />
        </button>
        <span className="eyebrow">
          {t(view.player === 0 ? "Your cards" : "Opponent cards")}
        </span>
        <h2 id="pile-title">
          {t(isTrash ? "Trash" : "Deck")} <span>{count}</span>
        </h2>
        <div className="pile-tabs" aria-label={t("Card zones")}>
          {([0, 1] as const).map((owner) => (
            <button
              key={owner}
              aria-pressed={view.player === owner}
              onClick={() => setView({ ...view, player: owner })}
            >
              {t(owner === 0 ? "Ti" : "AI")}
            </button>
          ))}
          <span />
          {(["deck", "trash"] as const).map((zone) => (
            <button
              key={zone}
              aria-pressed={view.zone === zone}
              onClick={() => setView({ ...view, zone })}
            >
              {t(zone === "deck" ? "Deck" : "Trash")}
            </button>
          ))}
        </div>
        {isTrash ? (
          count ? (
            <div className="pile-card-grid">
              {player.discard
                .map((id, index) => ({ id, index }))
                .reverse()
                .map(({ id, index }) => {
                  const card = findCard(id);
                  if (!card) return null;
                  const source = `trash:${index}`;
                  const playable =
                    view.player === 0
                      ? legal.find(
                          (action) =>
                            action.player === 0 &&
                            action.category === "play" &&
                            (action.sourceId === source ||
                              action.sourceId?.startsWith(`${source}:`)),
                        )
                      : undefined;
                  return (
                    <div className="pile-card-entry" key={`${id}:${index}`}>
                      <Card
                        card={card}
                        onClick={() => {
                          close();
                          inspect(card);
                        }}
                      />
                      <strong>{card.name}</strong>
                      {playable && (
                        <button
                          className="pile-play"
                          onClick={() => {
                            close();
                            select(playable.sourceId!);
                          }}
                        >
                          {t("Play from trash")}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="pile-empty">
              <Trash2 size={38} />
              <h3>{t("Trash is empty")}</h3>
              <p>{t("Discarded and destroyed cards appear here.")}</p>
            </div>
          )
        ) : (
          <div className="deck-summary">
            <span className="pile-art pile-back" aria-hidden="true">
              <CardSleeve player={player} />
            </span>
            <div>
              <strong>{t("{count} cards remaining", { count })}</strong>
              <span className="sleeve-credit">
                {getSignatureSleeve(player).name} ·{" "}
                {getSignatureSleeve(player).title}
              </span>
              <p>
                {t("Cards in the deck stay face down. Draw them during play.")}
              </p>
              <small>
                {t("Rune deck · {count} runes", {
                  count: player.runeDeck.length,
                })}
              </small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
