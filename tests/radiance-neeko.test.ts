import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChampionZone } from "../src/components/ChampionZone";
import { cards, getCard } from "../src/data/cards";
import { starterDecks, type StarterDeck } from "../src/data/decks";
import { createGame, getGameView, getLegalActions } from "../src/game/engine";
import { getObservation } from "../src/game/ai/observation";
import { decideBot } from "../src/game/bot";
import {
  applyDecision,
  getDecisionRequest,
  validateDecision,
} from "../src/game/ai/decisions";
import { parseSession } from "../src/persistence";
import {
  exportDeckText,
  parseDeckText,
  validateImportedDeck,
} from "../src/game/deck-import";
import { legendRefs, legendReady } from "../src/game/legends";
import { validState } from "../src/persistence";
import type { GameState } from "../src/game/types";
import { act, fixture, unit } from "./fixtures/cards";
import { actions, byId, play, rad, settle, until } from "./fixtures/radiance";

const NEEKO = rad(167);
const LEE_SIN = "ogn-257-298";
const EXILE = rad(149);
const BOY = rad(139);
const neekoHere = (s: GameState) => s.units.find((u) => u.cardId === NEEKO)!;
const leeSinAbility = (s: GameState) =>
  actions(s).find(
    (a) => a.cardId === LEE_SIN && a.category === "ability" && a.targetId,
  );

function withNeeko(extra: string[], pick: string) {
  let s = fixture();
  s.players[0].extraLegends = extra;
  s.units = [unit("a", 0, "base:0", 2)];
  s.players[0].hand = [NEEKO];
  return settle(until(play(s, NEEKO, { locationId: "base:0" }), pick));
}

describe("Neeko, Blending In", () => {
  it("adds a chosen legend whose abilities work alongside the starting legend", () => {
    let s = withNeeko([LEE_SIN, EXILE], "Add Lee Sin");
    expect(legendRefs(s, 0).map((ref) => ref.cardId)).toEqual([
      s.players[0].legendId,
      LEE_SIN,
    ]);
    const ability = leeSinAbility(s);
    expect(ability?.sourceId).toBe(`neeko-legend:${neekoHere(s).id}`);
    s = settle(act(s, (a) => a.id === ability!.id && a.targetId === "a"));
    expect(byId(s, "a").buff).toBe(1);
    // Each legend has its own exhausted state.
    expect(legendReady(s, 0, ability!.sourceId)).toBe(false);
    expect(legendReady(s, 0, "legend")).toBe(true);
    expect(leeSinAbility(s)).toBeUndefined();
  });

  it("offers only legends with names not already in the Legend Zone", () => {
    let s = fixture();
    s.players[0].extraLegends = [s.players[0].legendId, LEE_SIN];
    s.players[0].hand = [NEEKO];
    s = play(s, NEEKO, { locationId: "base:0" });
    s = until(s, "Add Lee Sin");
    expect(
      getLegalActions(s, 0).some((a) =>
        a.label.includes(`Add ${getCard(s.players[0].legendId).name}`),
      ),
    ).toBe(false);
  });

  it("removes the legend when Neeko leaves the board", () => {
    let s = withNeeko([LEE_SIN], "Add Lee Sin");
    const neeko = neekoHere(s);
    s.stack.push({
      id: "kill-neeko",
      kind: "ability",
      cardId: rad(59),
      player: 0,
      effects: [{ type: "kill", target: "anyUnit" }],
      targetId: neeko.id,
    });
    s.priorityPlayer = 0;
    s = settle(s);
    expect(legendRefs(s, 0)).toHaveLength(1);
    expect(leeSinAbility(s)).toBeUndefined();
    expect(s.radiance?.neeko ?? []).toHaveLength(0);
  });

  it("gives an added legend's passive rules (The Exile)", () => {
    let s = withNeeko([EXILE], "Add The Exile");
    s.fields[0].controller = 0;
    s.players[0].hand = ["ogn-010-298"];
    s = settle(play(s, "ogn-010-298", { locationId: "field:0" }));
    expect(s.units.find((u) => u.cardId === "ogn-010-298")!.ready).toBe(true);
  });

  it("keeps an added legend's Empowered state separate", () => {
    let s = withNeeko([BOY], "Add Boy Who Shattered Time");
    const key = `neeko-legend:${neekoHere(s).id}`;
    s = settle(
      act(s, (a) => a.sourceId === key && a.label.includes("Empower")),
    );
    expect(s.radiance!.neeko![0].empowered).toBe(true);
    expect(s.players[0].legendEmpowered).toBeFalsy();
  });

  it("shows the added legend in the Legend Zone with its own status", () => {
    const s = withNeeko([LEE_SIN], "Add Lee Sin");
    const html = renderToStaticMarkup(
      createElement(ChampionZone, {
        game: s,
        player: 0,
        legal: getLegalActions(s, 0),
        selected: null,
        select: () => undefined,
        inspect: () => undefined,
      }),
    );
    expect(html).toContain("Added by Neeko");
    expect(html).toContain(getCard(LEE_SIN).name);
    expect(html.match(/legend-zone/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the chosen legends private from the opponent and saves them", () => {
    let s = withNeeko([LEE_SIN, EXILE], "Add Lee Sin");
    expect(getGameView(s, 1).players[0].extraLegends).toBeUndefined();
    expect(getGameView(s, 0).players[0].extraLegends).toEqual([LEE_SIN, EXILE]);
    expect(getObservation(s, 1).state.players[0].extraLegends).toBeUndefined();
    expect(getObservation(s, 0).state.players[0].extraLegends).toEqual([
      LEE_SIN,
      EXILE,
    ]);
    expect(validState(JSON.parse(JSON.stringify(s)))).toBe(true);
  });
});

describe("Neeko's legends at deck building", () => {
  const base = starterDecks[0];
  const withNeekoDeck = (extra: string[]): StarterDeck => ({
    ...base,
    main: [
      ...base.main.slice(0, -1),
      { ...base.main.at(-1)!, count: base.main.at(-1)!.count - 1 },
      { cardId: NEEKO, count: 1 },
    ].filter((e) => e.count > 0),
    extraLegendIds: extra,
  });
  const codes = (deck: StarterDeck) =>
    validateImportedDeck(deck)
      .filter((i) => i.severity === "error")
      .map((i) => i.code);

  it("accepts up to three different legends with Neeko in the deck", () => {
    expect(codes(withNeekoDeck([LEE_SIN, EXILE, BOY]))).toEqual([]);
  });

  it("rejects extra legends without Neeko, more than three, duplicates or non-legends", () => {
    expect(codes({ ...base, extraLegendIds: [LEE_SIN] })).toContain(
      "neeko-legends-without-neeko",
    );
    const fourth = cards.find(
      (c) =>
        c.type === "Legend" &&
        !c.variant &&
        ![LEE_SIN, EXILE, BOY, base.legendId].includes(c.id) &&
        getCard(c.id).name !== getCard(base.legendId).name,
    )!.id;
    expect(codes(withNeekoDeck([LEE_SIN, EXILE, BOY, fourth]))).toContain(
      "neeko-legend-count",
    );
    expect(codes(withNeekoDeck([base.legendId]))).toContain(
      "neeko-legend-duplicate",
    );
    expect(codes(withNeekoDeck([NEEKO]))).toContain("neeko-legend-type");
  });

  it("exports and imports the Neeko Legends section", () => {
    const deck = withNeekoDeck([LEE_SIN, EXILE]);
    const text = exportDeckText(deck);
    expect(text).toContain("Neeko Legends");
    const parsed = parseDeckText(text);
    expect(parsed.deck?.extraLegendIds).toEqual([LEE_SIN, EXILE]);
    expect(parsed.playable).toBe(true);
  });

  it("lets the bot play Neeko, add a legend and keep making legal decisions", () => {
    let s = createGame({
      playerDeck: base,
      botDeck: withNeekoDeck([LEE_SIN, EXILE]),
      seed: 11,
      firstPlayer: 1,
      botDifficulty: "beginner",
    });
    let added = false;
    for (let i = 0; i < 400 && s.winner === null; i++) {
      // Once the bot has its turn, give it Neeko and the resources to play her.
      if (
        !added &&
        s.currentPlayer === 1 &&
        s.phase === "main" &&
        !s.pendingChoice &&
        !s.stack.length &&
        !s.players[1].hand.includes(NEEKO)
      ) {
        s.players[1].hand.push(NEEKO);
        s.players[1].energy = 20;
        s.players[1].power = 20;
      }
      const request = getDecisionRequest(s)!;
      const result = decideBot(s, s.priorityPlayer, {
        deterministic: true,
        maxNodes: 80,
      })!;
      expect(validateDecision(s, request, result.decision).valid).toBe(true);
      if (s.pendingChoice)
        expect(
          parseSession(JSON.stringify({ match: s, review: null })).match,
        ).toEqual(s);
      s = applyDecision(s, request, result.decision);
      if (s.radiance?.neeko?.some((n) => n.player === 1)) added = true;
    }
    expect(added).toBe(true);
  }, 120_000);

  it("creates games with the chosen legends", () => {
    const s = createGame({
      playerDeck: withNeekoDeck([LEE_SIN, EXILE]),
      botDeck: base,
      seed: 5,
    });
    expect(s.players[0].extraLegends).toEqual([LEE_SIN, EXILE]);
    expect(s.players[1].extraLegends).toBeUndefined();
  });
});
