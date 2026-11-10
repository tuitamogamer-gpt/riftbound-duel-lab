import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decks } from "../src/data/decks";
import { getObservation } from "../src/game/ai/observation";
import { createGame } from "../src/game/engine";
import type { OnlineRoomView } from "../src/game/online-protocol";
import type { GameState } from "../src/game/types";
import { LanguageProvider } from "../src/i18n";
import { deployGear, rad } from "./fixtures/radiance";

const online = vi.hoisted(() => ({ room: null as unknown }));
vi.mock("../src/hooks/useOnlineRoom", () => ({
  useOnlineRoom: () => ({
    credentials: { roomId: "room", seatToken: "token", seat: 0 },
    room: online.room,
    error: null,
    busy: false,
    resumeUnavailable: false,
    filter: {},
    setFilter: vi.fn(),
    pendingRetry: null,
    pendingJoin: null,
    refresh: vi.fn(),
    create: vi.fn(),
    join: vi.fn(),
    act: vi.fn(),
    depart: vi.fn(),
    retry: vi.fn(),
    forget: vi.fn(),
  }),
}));
import OnlineDuel from "../src/components/OnlineDuel";

const BANNER = rad(2);

function table(): GameState {
  const game = createGame({
    playerDeckId: "annie",
    botDeckId: "lux",
    seed: 31,
  });
  game.phase = "main";
  game.units = [];
  game.gears = [];
  return game;
}
function board(game: GameState) {
  const room: OnlineRoomView = {
    id: "room",
    seat: 0,
    revision: 1,
    expiresAt: Date.now() + 60_000,
    status: "active",
    observation: getObservation(game, 0),
    actions: [],
    actionOffset: 0,
    hasMoreActions: false,
  };
  online.room = room;
  const html = renderToStaticMarkup(
    createElement(
      LanguageProvider,
      null,
      createElement(OnlineDuel, { availableDecks: decks, onBack: vi.fn() }),
    ),
  );
  // The board opens on the first battlefield.
  return html.slice(html.indexOf('class="online-board"'));
}
const row = (html: string, side: "own" | "enemy") => {
  const start = html.indexOf(`online-player-row ${side}`);
  const next = html.indexOf("online-player-row", start + 1);
  return html.slice(start, next < 0 ? undefined : next);
};

describe("online board gear placement", () => {
  beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null }));

  it("shows [Deploy] gear at its battlefield for both players", () => {
    const game = table();
    deployGear(game, BANNER, "field:0", 0, "mine");
    deployGear(game, BANNER, "field:0", 1, "theirs");
    const html = board(game);
    expect(row(html, "own")).toContain("Banner of Conquest");
    expect(row(html, "enemy")).toContain("Banner of Conquest");
  });

  it("keeps gear deployed elsewhere and ordinary base gear out of that battlefield", () => {
    const game = table();
    deployGear(game, BANNER, "field:1", 0, "elsewhere");
    game.gears.push({ id: "loose", cardId: BANNER, owner: 1, ready: true });
    expect(board(game)).not.toContain("Banner of Conquest");
  });
});
